-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.10 · PADEIRO FINALIZA + TEMPO E TOLERÂNCIA
-- (aplicar DEPOIS da v2.9; pode rodar de novo sem problema; não apaga dados)
--
--  1. Tempo e TOLERÂNCIA por receita (ex.: 30 min + 10 de tolerância). Receita sem tolerância
--     usa o padrão de Parâmetros da produção (producao_tolerancia_batelada_min = 10).
--     Até o tempo: no prazo · até tempo + tolerância: atenção · depois: atrasada.
--  2. O PADEIRO finaliza a batelada (nome + senha, um toque). Não digita quantidade:
--     fica registrado o rendimento médio da receita (o definido pelo engenheiro).
--     Fica registrado qual padeiro finalizou (finalizada_operador_id), além de data e hora.
--  3. A engenharia continua podendo finalizar (bateladas esquecidas), como antes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TEMPO E TOLERÂNCIA POR RECEITA
-- ---------------------------------------------------------------------
alter table public.fichas_tecnicas add column if not exists tolerancia_batelada_min integer;
alter table public.fichas_tecnicas drop constraint if exists fichas_tecnicas_tolerancia_batelada_min_check;
alter table public.fichas_tecnicas add constraint fichas_tecnicas_tolerancia_batelada_min_check
  check (tolerancia_batelada_min is null or tolerancia_batelada_min between 0 and 600);

insert into public.parametros (chave, valor, descricao) values
  ('producao_tolerancia_batelada_min', '10', 'Produção: tolerância padrão da batelada (minutos além do tempo da receita antes de ficar atrasada)')
on conflict (chave) do nothing;

create or replace function public.salvar_parametros_producao(p jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare k text; v text;
begin
  perform public._exigir('producao_config');
  for k, v in select * from jsonb_each_text(p) loop
    if k = 'producao_inicio_turno' then
      if v !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Início do turno inválido: use hora no formato 04:00.'; end if;
    elsif k in ('producao_tolerancia_min','producao_tempo_padrao_min','producao_prazo_finalizar_h','mistura_parada_h') then
      if v !~ '^[0-9]+$' or v::int <= 0 or v::int > 1440 then raise exception 'Valor inválido para %: use um número inteiro maior que zero.', k; end if;
    elsif k = 'producao_tolerancia_batelada_min' then
      if v !~ '^[0-9]+$' or v::int > 600 then raise exception 'Tolerância inválida: use um número de 0 a 600 minutos.'; end if;
    else
      raise exception 'Configuração não permitida aqui: %', k;
    end if;
    update public.parametros set valor = v where chave = k;
  end loop;
end $$;
revoke execute on function public.salvar_parametros_producao(jsonb) from public, anon;
grant execute on function public.salvar_parametros_producao(jsonb) to authenticated;

-- salvar ficha técnica: igual à anterior + tolerância (com histórico)
create or replace function public.salvar_ficha(p jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint := (p->>'id')::bigint; v_old public.fichas_tecnicas; it jsonb; r record;
        v_novos jsonb := '{}'::jsonb; v_desc text[] := '{}'; v_pid bigint; v_q numeric;
        k text; v text; v_pr public.produtos; v_n int := 0; v_cat text;
begin
  perform public._exigir('ficha_tecnica');
  if public._texto(p,'nome') is null then raise exception 'Informe o nome da ficha técnica.'; end if;
  if public._texto(p,'rendimento_qtd') is null and public._texto(p,'rendimento') ~ '^\s*[0-9][0-9.]*(,[0-9]+)?\s*\S' then
    p := p || jsonb_build_object(
      'rendimento_qtd', replace(replace(substring(p->>'rendimento' from '^\s*([0-9][0-9.]*(,[0-9]+)?)'), '.', ''), ',', '.'),
      'rendimento_unidade', coalesce(public._texto(p,'rendimento_unidade'), btrim(regexp_replace(p->>'rendimento', '^\s*[0-9][0-9.]*(,[0-9]+)?\s*', ''))));
  end if;
  if public._texto(p,'rendimento_qtd') is not null and (p->>'rendimento_qtd')::numeric <= 0 then
    raise exception 'O rendimento precisa ser maior que zero.';
  end if;
  if (p->>'tempo_batelada_min') is not null and (p->>'tempo_batelada_min')::int <= 0 then
    raise exception 'O tempo da batelada precisa ser maior que zero.';
  end if;
  if (p->>'tolerancia_batelada_min') is not null and (p->>'tolerancia_batelada_min')::int not between 0 and 600 then
    raise exception 'A tolerância precisa ser de 0 a 600 minutos.';
  end if;
  if (p->>'tempo_batelada_min') is not null and (p->>'tempo_batelada_min')::int > 1440 then
    raise exception 'O tempo da batelada pode ser no máximo 1440 minutos.';
  end if;
  if jsonb_array_length(coalesce(p->'itens','[]'::jsonb)) = 0 then
    raise exception 'A ficha técnica precisa de pelo menos 1 ingrediente.';
  end if;
  if public._texto(p,'codigo') is not null and exists (select 1 from public.fichas_tecnicas
       where lower(codigo) = lower(btrim(p->>'codigo')) and id is distinct from v_id) then
    raise exception 'Já existe uma ficha técnica com o código %.', p->>'codigo';
  end if;
  for it in select * from jsonb_array_elements(p->'itens') loop
    v_pid := (it->>'produto_id')::bigint;
    select categoria into v_cat from public.produtos where id = v_pid;
    if v_cat is null or v_cat not in ('materia_prima','embalagem') then
      raise exception 'Ficha técnica só aceita matéria-prima e embalagem (produto %).', v_pid;
    end if;
    if coalesce((it->>'quantidade')::numeric, 0) <= 0 then
      raise exception 'Quantidade do ingrediente precisa ser maior que zero.';
    end if;
    v_q := case when v_cat = 'embalagem' then (it->>'quantidade')::numeric      -- por unidade produzida
                else (it->>'quantidade')::numeric * public._fator(v_pid, it->>'unidade') end;
    v_novos := jsonb_set(v_novos, array[v_pid::text], to_jsonb(coalesce((v_novos->>v_pid::text)::numeric, 0) + v_q));
  end loop;
  if not exists (select 1 from jsonb_object_keys(v_novos) k2 join public.produtos pr on pr.id = k2::bigint where pr.categoria = 'materia_prima') then
    raise exception 'A ficha técnica precisa de pelo menos 1 matéria-prima.';
  end if;

  if v_id is null then
    insert into public.fichas_tecnicas (codigo, nome, produto_final, rendimento, rendimento_qtd, rendimento_unidade, observacao, ativo,
        linha_id, tempo_batelada_min, tolerancia_batelada_min, atualizado_em, atualizado_por)
    values (coalesce(btrim(p->>'codigo'), 'R' || lpad((select coalesce(max(id),0)+1 from public.fichas_tecnicas)::text, 3, '0')),
            btrim(p->>'nome'), public._texto(p,'produto_final'), public._texto(p,'rendimento'),
            (public._texto(p,'rendimento_qtd'))::numeric, public._texto(p,'rendimento_unidade'),
            public._texto(p,'observacao'), coalesce((p->>'ativo')::boolean, true),
            (p->>'linha_id')::bigint, (p->>'tempo_batelada_min')::int, (p->>'tolerancia_batelada_min')::int, now(), auth.uid())
    returning id into v_id;
    select count(*) into v_n from jsonb_object_keys(v_novos);
    v_desc := array[format('Criou a ficha com %s %s', v_n, case when v_n = 1 then 'item' else 'itens' end)];
  else
    select * into v_old from public.fichas_tecnicas where id = v_id for update;
    if not found then raise exception 'Ficha técnica não encontrada.'; end if;
    if public._texto(p,'codigo') is not null and v_old.codigo is distinct from btrim(p->>'codigo') then
      v_desc := v_desc || format('código: "%s" → "%s"', v_old.codigo, btrim(p->>'codigo')); end if;
    if v_old.nome is distinct from btrim(p->>'nome') then
      v_desc := v_desc || format('nome: "%s" → "%s"', v_old.nome, btrim(p->>'nome')); end if;
    if v_old.produto_final is distinct from public._texto(p,'produto_final') then
      v_desc := v_desc || format('produto final: "%s" → "%s"', coalesce(v_old.produto_final,''), coalesce(public._texto(p,'produto_final'),'')); end if;
    if v_old.rendimento_qtd is distinct from (public._texto(p,'rendimento_qtd'))::numeric
       or v_old.rendimento_unidade is distinct from public._texto(p,'rendimento_unidade') then
      v_desc := v_desc || format('rendimento por receita: %s %s → %s %s', coalesce(public._fmt(v_old.rendimento_qtd),'–'), coalesce(v_old.rendimento_unidade,''),
                                 coalesce(public._fmt((public._texto(p,'rendimento_qtd'))::numeric),'–'), coalesce(public._texto(p,'rendimento_unidade'),'')); end if;
    if v_old.tempo_batelada_min is distinct from (p->>'tempo_batelada_min')::int then
      v_desc := v_desc || format('tempo da batelada: %s → %s min', coalesce(v_old.tempo_batelada_min::text,'–'), coalesce(p->>'tempo_batelada_min','–')); end if;
    if v_old.tolerancia_batelada_min is distinct from (p->>'tolerancia_batelada_min')::int then
      v_desc := v_desc || format('tolerância da batelada: %s → %s min', coalesce(v_old.tolerancia_batelada_min::text,'–'), coalesce(p->>'tolerancia_batelada_min','–')); end if;
    if v_old.linha_id is distinct from (p->>'linha_id')::bigint then
      v_desc := v_desc || 'mudou a linha de produção'::text; end if;
    if v_old.observacao is distinct from public._texto(p,'observacao') then
      v_desc := v_desc || 'alterou a observação'::text; end if;
    if v_old.ativo is distinct from coalesce((p->>'ativo')::boolean, true) then
      v_desc := v_desc || (case when coalesce((p->>'ativo')::boolean, true) then 'reativou a ficha' else 'desativou a ficha' end); end if;
    update public.fichas_tecnicas set codigo = coalesce(btrim(p->>'codigo'), codigo), nome = btrim(p->>'nome'), produto_final = public._texto(p,'produto_final'),
      rendimento = public._texto(p,'rendimento'), rendimento_qtd = (public._texto(p,'rendimento_qtd'))::numeric,
      rendimento_unidade = public._texto(p,'rendimento_unidade'), observacao = public._texto(p,'observacao'),
      linha_id = (p->>'linha_id')::bigint, tempo_batelada_min = (p->>'tempo_batelada_min')::int, tolerancia_batelada_min = (p->>'tolerancia_batelada_min')::int,
      ativo = coalesce((p->>'ativo')::boolean, true), atualizado_em = now(), atualizado_por = auth.uid()
    where id = v_id;
    for r in select fi.id, fi.produto_id, fi.quantidade, pr.descricao, pr.unidade_estoque, pr.categoria
               from public.ficha_itens fi join public.produtos pr on pr.id = fi.produto_id
              where fi.ficha_id = v_id order by fi.id loop
      if not (v_novos ? r.produto_id::text) then
        delete from public.ficha_itens where id = r.id;
        v_desc := v_desc || format('retirou %s (%s %s)', r.descricao, public._fmt(r.quantidade),
                                   case when r.categoria = 'embalagem' then 'por unidade produzida' else public._un(r.unidade_estoque, r.quantidade) end);
      elsif abs((v_novos->>r.produto_id::text)::numeric - r.quantidade) > 0.00005 then
        update public.ficha_itens set quantidade = (v_novos->>r.produto_id::text)::numeric where id = r.id;
        v_desc := v_desc || format('%s: %s → %s %s', r.descricao, public._fmt(r.quantidade),
                                   public._fmt((v_novos->>r.produto_id::text)::numeric),
                                   case when r.categoria = 'embalagem' then 'por unidade produzida' else public._un(r.unidade_estoque, (v_novos->>r.produto_id::text)::numeric) end);
      end if;
      v_novos := v_novos - r.produto_id::text;
    end loop;
  end if;
  for k, v in select key, value from jsonb_each_text(v_novos) loop
    insert into public.ficha_itens (ficha_id, produto_id, quantidade) values (v_id, k::bigint, v::numeric);
    if v_old.id is not null then
      select * into v_pr from public.produtos where id = k::bigint;
      v_desc := v_desc || format('incluiu %s (%s %s)', v_pr.descricao, public._fmt(v::numeric),
                                 case when v_pr.categoria = 'embalagem' then 'por unidade produzida' else public._un(v_pr.unidade_estoque, v::numeric) end);
    end if;
  end loop;
  if coalesce(array_length(v_desc, 1), 0) > 0 then
    insert into public.fichas_historico (ficha_id, usuario_id, descricao)
    values (v_id, auth.uid(), array_to_string(v_desc, '; '));
  end if;
  perform public._mistura_da_ficha(v_id);
  return v_id;
end $$;
revoke execute on function public.salvar_ficha(jsonb) from public, anon;
grant execute on function public.salvar_ficha(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 2. QUEM FINALIZOU (padeiro) + FINALIZAR PELO PADEIRO
-- ---------------------------------------------------------------------
alter table public.bateladas add column if not exists finalizada_operador_id bigint references public.operadores(id);

-- núcleo (o mesmo cálculo de antes: embalagem, custos, rendimento). Só é chamado pelas duas abaixo.
create or replace function public._finalizar_bateladas(p jsonb, p_oper bigint)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare itj jsonb; b public.bateladas; v_q numeric; v_n int := 0; r record; v_un numeric; v_emb numeric; v_cemb numeric;
        v_det jsonb; v_c public.batelada_custos; v_padrao numeric; v_mov bigint;
begin
  for itj in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    select * into b from public.bateladas where id = (itj->>'id')::bigint for update;
    if not found then raise exception 'Batelada % não encontrada.', itj->>'id'; end if;
    if b.situacao <> 'em_producao' then continue; end if;
    v_q := coalesce((itj->>'quantidade')::numeric, b.rendimento_padrao);
    if v_q is null then raise exception 'A receita da batelada nº % não tem rendimento padrão: digite a quantidade produzida.', b.id; end if;
    if v_q < 0 then raise exception 'Quantidade produzida não pode ser negativa.'; end if;
    v_cemb := 0; v_det := '[]'::jsonb;
    for r in select fi.produto_id, fi.quantidade, pr.* from public.ficha_itens fi join public.produtos pr on pr.id = fi.produto_id
              where fi.ficha_id = b.ficha_id and pr.categoria = 'embalagem' loop
      v_un := v_q * r.quantidade;                                         -- nº de embalagens
      v_emb := case when lower(r.unidade_estoque) = 'kg' then v_un * coalesce(r.peso_embalagem_g, 0) / 1000
                    when lower(r.unidade_estoque) = 'g' then v_un * coalesce(r.peso_embalagem_g, 0)
                    else v_un end;                                         -- na unidade de estoque
      v_cemb := v_cemb + v_emb * r.custo_medio;
      v_det := v_det || jsonb_build_array(jsonb_build_object('produto_id', r.produto_id, 'embalagens', v_un, 'qtd_estoque', v_emb,
                                                             'custo', round(v_emb * r.custo_medio, 4), 'baixou', r.baixa_producao and r.controla_estoque));
      if r.baixa_producao and r.controla_estoque and v_emb > 0 then
        v_mov := public._movimentar(r.produto_id, 'saida_receita', -v_emb, null,
          jsonb_build_object('batelada_id', b.id, 'local_id', coalesce(public._local_tipo('pcp'), r.local_padrao_id), 'programacao_id', b.programacao_id,
                             'observacao', format('Embalagem da batelada nº %s (%s un)', b.id, public._fmt(v_un))));
      end if;
    end loop;
    -- custo padrão da ficha (comparação): ficha × custo médio de hoje
    select coalesce(sum(case when pr.categoria = 'embalagem' then v_q * fi.quantidade *
                              case when lower(pr.unidade_estoque) = 'kg' then coalesce(pr.peso_embalagem_g,0)/1000
                                   when lower(pr.unidade_estoque) = 'g' then coalesce(pr.peso_embalagem_g,0) else 1 end
                             else fi.quantidade end * pr.custo_medio), 0)
      into v_padrao from public.ficha_itens fi join public.produtos pr on pr.id = fi.produto_id where fi.ficha_id = b.ficha_id;
    select * into v_c from public.batelada_custos where batelada_id = b.id;
    update public.batelada_custos set custo_embalagem = round(v_cemb, 4),
           custo_total = round(coalesce(v_c.custo_mistura,0) + coalesce(v_c.custo_maceira,0) + v_cemb, 4),
           custo_unitario = case when v_q > 0 then round((coalesce(v_c.custo_mistura,0) + coalesce(v_c.custo_maceira,0) + v_cemb) / v_q, 6) end,
           custo_padrao = round(v_padrao, 4),
           detalhe = coalesce(detalhe, '{}'::jsonb) || jsonb_build_object('embalagem', v_det)
     where batelada_id = b.id;
    update public.bateladas set situacao = 'finalizada', quantidade_produzida = v_q, finalizada_em = now(), finalizada_por = auth.uid(), finalizada_operador_id = p_oper
     where id = b.id;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nenhuma batelada em produção foi selecionada.'; end if;
  return v_n;
end $$;
revoke execute on function public._finalizar_bateladas(jsonb, bigint) from public, anon, authenticated;

-- engenharia / gestor / admin (tela Finalizar bateladas): como antes
create or replace function public.finalizar_bateladas(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public._exigir('finalizar_batelada');
  if jsonb_array_length(coalesce(p->'itens', '[]'::jsonb)) > 200 then raise exception 'Lista grande demais.'; end if;
  return public._finalizar_bateladas(p, null);
end $$;
revoke execute on function public.finalizar_bateladas(jsonb) from public, anon;
grant execute on function public.finalizar_bateladas(jsonb) to authenticated;

-- PADEIRO: um toque + nome e senha. Sem quantidade: vale o rendimento médio da receita.
create or replace function public.finalizar_batelada_padeiro(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_oper bigint := (p->>'operador_id')::bigint; b public.bateladas; v_rend numeric;
begin
  perform public._exigir('batelada');
  if v_oper is null then raise exception 'Escolha o seu nome.'; end if;
  if not public._operador_ok(v_oper, p->>'pin') then raise exception 'Senha do padeiro incorreta.'; end if;
  select * into b from public.bateladas where id = (p->>'id')::bigint for update;
  if not found then raise exception 'Batelada não encontrada.'; end if;
  if b.situacao = 'finalizada' then return 0; end if;                          -- toque repetido: não faz nada
  if b.situacao <> 'em_producao' then raise exception 'Esta batelada foi cancelada.'; end if;
  v_rend := coalesce(b.rendimento_padrao, (select rendimento_qtd from public.fichas_tecnicas where id = b.ficha_id));
  if v_rend is null then
    raise exception 'Esta receita ainda não tem o rendimento médio cadastrado. Avise o engenheiro (Fichas técnicas).';
  end if;
  return public._finalizar_bateladas(jsonb_build_object('itens', jsonb_build_array(jsonb_build_object('id', b.id, 'quantidade', v_rend))), v_oper);
end $$;
revoke execute on function public.finalizar_batelada_padeiro(jsonb) from public, anon;
grant execute on function public.finalizar_batelada_padeiro(jsonb) to authenticated;

insert into public.versao_banco (versao, descricao)
select '2.10.0', 'Padeiro finaliza a batelada (rendimento médio), tempo e tolerância por receita'
where not exists (select 1 from public.versao_banco where versao = '2.10.0');

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Tolerância na receita' as verificacao,
       case when exists (select 1 from information_schema.columns where table_name = 'fichas_tecnicas' and column_name = 'tolerancia_batelada_min') then 'OK' else 'ATENÇÃO' end as resultado
union all
select 'Tolerância padrão nos parâmetros', case when exists (select 1 from public.parametros where chave = 'producao_tolerancia_batelada_min') then 'OK' else 'ATENÇÃO' end
union all
select 'Padeiro que finalizou fica registrado', case when exists (select 1 from information_schema.columns where table_name = 'bateladas' and column_name = 'finalizada_operador_id') then 'OK' else 'ATENÇÃO' end
union all
select 'Núcleo de finalização fechado (só uso interno)',
       case when not has_function_privilege('authenticated', 'public._finalizar_bateladas(jsonb, bigint)', 'execute')
             and not has_function_privilege('anon', 'public._finalizar_bateladas(jsonb, bigint)', 'execute') then 'OK' else 'ATENÇÃO' end
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Tabelas SEM proteção por linha (RLS)',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'Tabelas que o app consegue gravar direto',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update')
        or has_table_privilege('authenticated', c.oid, 'delete'))
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.10.0') then 'OK (2.10.0)' else 'ATENÇÃO' end;
