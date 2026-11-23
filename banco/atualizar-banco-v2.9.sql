-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.9 · ORDEM DA PESAGEM + AVISOS + "BASE"
-- (aplicar DEPOIS da v2.7; pode rodar de novo sem problema; não apaga dados)
--
--  1. Ordem da PESAGEM (prioridade_pesagem): uma ordem única do dia para a pesagem,
--     separada da ordem de cada masseira. Só admin, engenharia e gestor da produção mudam.
--  2. Botão URGENTE: põe a produção em 1º lugar na pesagem E na masseira dela, de uma vez.
--  3. Avisos melhores: um aviso por mudança (não um por linha), com o que mudou em
--     destaque e a nova ordem. A pesagem também recebe avisos e confirma com o próprio login.
--  4. "Mistura" passa a se chamar "Base" (Base – Pão de forma).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ORDEM DA PESAGEM
-- ---------------------------------------------------------------------
alter table public.programacoes add column if not exists prioridade_pesagem integer;
alter table public.programacoes drop constraint if exists programacoes_prioridade_pesagem_check;
alter table public.programacoes add constraint programacoes_prioridade_pesagem_check
  check (prioridade_pesagem is null or prioridade_pesagem between 1 and 9999);
create index if not exists programacoes_dia_pesagem on public.programacoes (data, prioridade_pesagem);

-- as que ainda não têm ordem da pesagem: rodadas intercaladas entre as masseiras
-- (1ª de cada masseira, depois a 2ª de cada uma…)
with o as (
  select g.id, row_number() over (partition by g.data order by g.prioridade nulls last, m.ordem nulls last, g.maceira_id nulls last, g.id) n,
         coalesce((select max(x.prioridade_pesagem) from public.programacoes x where x.data = g.data), 0) base
    from public.programacoes g left join public.maceiras m on m.id = g.maceira_id
   where g.prioridade_pesagem is null)
update public.programacoes p set prioridade_pesagem = least(o.base + o.n, 9999) from o where o.id = p.id;

-- produção nova entra no FIM da fila da pesagem
create or replace function public._prioridade_pesagem_padrao()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.prioridade_pesagem is null then
    select least(coalesce(max(prioridade_pesagem), 0) + 1, 9999) into new.prioridade_pesagem
      from public.programacoes where data = new.data;
  end if;
  return new;
end $$;
revoke execute on function public._prioridade_pesagem_padrao() from public, anon, authenticated;
drop trigger if exists prioridade_pesagem on public.programacoes;
create trigger prioridade_pesagem before insert on public.programacoes for each row execute function public._prioridade_pesagem_padrao();

-- ---------------------------------------------------------------------
-- 2. AVISOS: setor (masseira ou pesagem), tipo "urgente" e detalhe (nova ordem)
-- ---------------------------------------------------------------------
alter table public.avisos_producao add column if not exists setor text not null default 'masseira';
alter table public.avisos_producao drop constraint if exists avisos_producao_setor_check;
alter table public.avisos_producao add constraint avisos_producao_setor_check check (setor in ('masseira','pesagem'));
alter table public.avisos_producao add column if not exists detalhe text;
alter table public.avisos_producao drop constraint if exists avisos_producao_detalhe_check;
alter table public.avisos_producao add constraint avisos_producao_detalhe_check check (detalhe is null or length(detalhe) <= 600);
alter table public.avisos_producao drop constraint if exists avisos_producao_tipo_check;
alter table public.avisos_producao add constraint avisos_producao_tipo_check
  check (tipo in ('ordem','masseira','nova','retirada','quantidade','recado','urgente'));
create index if not exists avisos_producao_pend_setor on public.avisos_producao (setor) where ciente_em is null;

-- "Nova ordem: 1º Pão de forma · 2º Bisnaguinha · …" (fila de uma masseira no dia)
create or replace function public._texto_ordem_masseira(p_mac bigint, p_data date)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select left('Nova ordem: ' || coalesce(string_agg(s.n || 'º ' || s.nome, ' · ' order by s.n), '–'), 600)
    from (select row_number() over (order by g.prioridade nulls last, g.id) n, f.nome
            from public.programacoes g join public.fichas_tecnicas f on f.id = g.ficha_id
           where g.maceira_id = p_mac and g.data = p_data and g.situacao = 'ativa' and g.finalizada_em is null
           order by g.prioridade nulls last, g.id limit 8) s
$$;
-- fila da PESAGEM no dia (só o que ainda falta pesar)
create or replace function public._texto_ordem_pesagem(p_data date)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select left('Ordem da pesagem: ' || coalesce(string_agg(s.n || 'º ' || s.nome, ' · ' order by s.n), '–'), 600)
    from (select row_number() over (order by g.prioridade_pesagem nulls last, g.id) n, f.nome
            from public.programacoes g join public.fichas_tecnicas f on f.id = g.ficha_id
           where g.data = p_data and g.situacao = 'ativa' and g.finalizada_em is null
             and coalesce((select sum(pr.multiplicador) from public.producoes pr where pr.programacao_id = g.id), 0) < g.quantidade - 0.0001
           order by g.prioridade_pesagem nulls last, g.id limit 8) s
$$;
revoke execute on function public._texto_ordem_masseira(bigint, date) from public, anon, authenticated;
revoke execute on function public._texto_ordem_pesagem(date) from public, anon, authenticated;

-- aviso automático da programação (mesmo de antes, com 3 mudanças):
--  · mudança de ORDEM feita pelo quadro vira UM aviso por masseira (feito em reordenar_programacao)
--  · a pesagem também fica sabendo de produção nova ou cancelada no dia
--  · nomes das receitas em MAIÚSCULAS (leitura rápida no tablet)
create or replace function public._aviso_programacao()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ficha text; v_mac_old text; v_mac_new text; v_q text; v_lote boolean := coalesce(current_setting('pss.reordenando', true), '') = '1';
begin
  if new.data is distinct from public._hoje() then return new; end if;              -- só a produção do dia
  select upper(nome) into v_ficha from public.fichas_tecnicas where id = new.ficha_id;
  v_q := trim(to_char(new.quantidade, 'FM999990.##')); v_q := rtrim(v_q, '.');
  if tg_op = 'INSERT' then
    if new.situacao = 'ativa' then
      if new.maceira_id is not null then
        insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto, detalhe) values (new.maceira_id, new.id, 'nova',
          format('NOVA produção: %s (%s bateladas), em %sº lugar.', v_ficha, v_q, coalesce(new.prioridade::text, '?')),
          public._texto_ordem_masseira(new.maceira_id, new.data));
      end if;
      insert into public.avisos_producao (setor, programacao_id, tipo, texto, detalhe) values ('pesagem', new.id, 'nova',
        format('NOVA produção para pesar: %s (%s receitas).', v_ficha, v_q), public._texto_ordem_pesagem(new.data));
    end if;
    return new;
  end if;
  if new.finalizada_em is not null and old.finalizada_em is null then return new; end if;   -- finalização não é mudança
  if new.situacao = 'cancelada' and old.situacao is distinct from 'cancelada' then
    if old.maceira_id is not null then
      insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (old.maceira_id, new.id, 'retirada',
        format('CANCELADA: %s não é mais para fazer.', v_ficha));
    end if;
    insert into public.avisos_producao (setor, programacao_id, tipo, texto) values ('pesagem', new.id, 'retirada',
      format('CANCELADA: %s não é mais para pesar.', v_ficha));
    return new;
  end if;
  if new.situacao <> 'ativa' then return new; end if;
  if new.maceira_id is distinct from old.maceira_id then
    select nome into v_mac_old from public.maceiras where id = old.maceira_id;
    select nome into v_mac_new from public.maceiras where id = new.maceira_id;
    if old.maceira_id is not null then
      insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (old.maceira_id, new.id, 'masseira',
        format('SAIU daqui: %s foi para %s.', v_ficha, coalesce(v_mac_new, 'outra masseira')));
    end if;
    if new.maceira_id is not null then
      insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (new.maceira_id, new.id, 'masseira',
        format('VEIO para cá: %s (%s bateladas), em %sº lugar%s.', v_ficha, v_q, coalesce(new.prioridade::text, '?'),
               case when v_mac_old is not null then ', vindo da ' || v_mac_old else '' end));
    end if;
    return new;
  end if;
  if not v_lote and new.maceira_id is not null and new.prioridade is distinct from old.prioridade then
    insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto, detalhe) values (new.maceira_id, new.id, 'ordem',
      case when new.prioridade = 1 then format('%s passou para o 1º lugar: PRIORIDADE MÁXIMA.', v_ficha)
           else format('%s passou de %sº para %sº lugar.', v_ficha, coalesce(old.prioridade::text, '?'), coalesce(new.prioridade::text, '?')) end,
      public._texto_ordem_masseira(new.maceira_id, new.data));
  end if;
  if new.maceira_id is not null and new.quantidade is distinct from old.quantidade then
    insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (new.maceira_id, new.id, 'quantidade',
      format('QUANTIDADE mudou: %s agora são %s bateladas (antes %s).', v_ficha, v_q, rtrim(trim(to_char(old.quantidade, 'FM999990.##')), '.')));
  end if;
  return new;
end $$;
revoke execute on function public._aviso_programacao() from public, anon, authenticated;

-- Um aviso por fila que mudou. Quem "mudou de verdade" = a única que subiu (ou a única que desceu);
-- as outras só andaram uma casa por consequência.
-- p_antes: {"<id>": {"m": masseira antes, "p": posição antes}}; p_setor: 'masseira' ou 'pesagem'
create or replace function public._avisar_nova_ordem(p_antes jsonb, p_setor text)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_hoje date := public._hoje(); r record; v_n int := 0; v_txt text; v_prim bigint;
begin
  for r in
    select g.maceira_id mac from public.programacoes g
     where p_setor = 'masseira' and g.id in (select k::bigint from jsonb_object_keys(p_antes) k)
       and g.data = v_hoje and g.maceira_id is not null and g.situacao = 'ativa'
    union
    select null::bigint where p_setor = 'pesagem'
  loop
    with mud as (
      select g.id, upper(f.nome) nome,
             case when p_setor = 'pesagem' then g.prioridade_pesagem else g.prioridade end nova,
             (p_antes -> g.id::text ->> 'p')::int velha
        from public.programacoes g join public.fichas_tecnicas f on f.id = g.ficha_id
       where g.id in (select k::bigint from jsonb_object_keys(p_antes) k) and g.data = v_hoje and g.situacao = 'ativa'
         and (p_setor = 'pesagem' or (g.maceira_id = r.mac and (p_antes -> g.id::text ->> 'm')::bigint is not distinct from r.mac))),
    m2 as (select * from mud where nova is distinct from velha and velha is not null),
    esc as (
      select * from m2 where nova < velha and (select count(*) from m2 where nova < velha) = 1
      union all
      select * from m2 where nova > velha and (select count(*) from m2 where nova < velha) <> 1 and (select count(*) from m2 where nova > velha) = 1
      union all
      select * from m2 where nova < velha and (select count(*) from m2 where nova < velha) > 1 and (select count(*) from m2 where nova > velha) <> 1)
    select left(string_agg(case when nova = 1 then nome || ' passou para o 1º lugar: PRIORIDADE MÁXIMA.'
                                else nome || ' passou de ' || velha || 'º para ' || nova || 'º lugar.' end, ' ' order by nova), 500),
           min(id)
      into v_txt, v_prim from esc;
    if v_txt is not null then
      if p_setor = 'pesagem' then
        insert into public.avisos_producao (setor, programacao_id, tipo, texto, detalhe)
        values ('pesagem', v_prim, 'ordem', v_txt, public._texto_ordem_pesagem(v_hoje));
      else
        insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto, detalhe)
        values (r.mac, v_prim, 'ordem', v_txt, public._texto_ordem_masseira(r.mac, v_hoje));
      end if;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public._avisar_nova_ordem(jsonb, text) from public, anon, authenticated;

-- quadro das masseiras: mesma função de antes + UM aviso por masseira
create or replace function public.reordenar_programacao(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare itj jsonb; v_n int := 0; v_antes jsonb;
begin
  perform public._exigir('programacao');
  if jsonb_typeof(coalesce(p, 'null'::jsonb)) <> 'array' then raise exception 'Lista inválida.'; end if;
  if jsonb_array_length(p) > 500 then raise exception 'Lista grande demais.'; end if;
  select coalesce(jsonb_object_agg(g.id::text, jsonb_build_object('m', g.maceira_id, 'p', g.prioridade)), '{}'::jsonb) into v_antes
    from public.programacoes g where g.id in (select (x->>'id')::bigint from jsonb_array_elements(p) x);
  perform set_config('pss.reordenando', '1', true);
  for itj in select * from jsonb_array_elements(p) loop
    if (itj->>'prioridade') is not null and (itj->>'prioridade')::int not between 1 and 9999 then raise exception 'Posição inválida.'; end if;
    update public.programacoes set maceira_id = (itj->>'maceira_id')::bigint, prioridade = coalesce((itj->>'prioridade')::int, prioridade),
           operador_id = case when itj ? 'operador_id' then (itj->>'operador_id')::bigint else operador_id end,
           atualizado_em = now(), atualizado_por = auth.uid()
     where id = (itj->>'id')::bigint and situacao = 'ativa' and finalizada_em is null;
    v_n := v_n + found::int;
  end loop;
  perform set_config('pss.reordenando', '', true);
  perform public._avisar_nova_ordem(v_antes, 'masseira');
  return v_n;
end $$;
revoke execute on function public.reordenar_programacao(jsonb) from public, anon;
grant execute on function public.reordenar_programacao(jsonb) to authenticated;

-- ordem da pesagem: recebe os ids na ordem desejada ([id1, id2, …] → 1º, 2º, …)
create or replace function public.reordenar_pesagem(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int := 0; v_antes jsonb; r record;
begin
  perform public._exigir('programacao');
  if jsonb_typeof(coalesce(p, 'null'::jsonb)) <> 'array' then raise exception 'Lista inválida.'; end if;
  if jsonb_array_length(p) > 500 then raise exception 'Lista grande demais.'; end if;
  if exists (select 1 from jsonb_array_elements(p) x where jsonb_typeof(x) <> 'number') then raise exception 'Lista inválida.'; end if;
  select coalesce(jsonb_object_agg(g.id::text, jsonb_build_object('p', g.prioridade_pesagem)), '{}'::jsonb) into v_antes
    from public.programacoes g where g.id in (select (x #>> '{}')::bigint from jsonb_array_elements(p) x);
  for r in select (x #>> '{}')::bigint id, min(o) pos from jsonb_array_elements(p) with ordinality t(x, o) group by 1 order by 2 loop
    v_n := v_n + 1;
    update public.programacoes set prioridade_pesagem = v_n, atualizado_em = now(), atualizado_por = auth.uid()
     where id = r.id and situacao = 'ativa' and finalizada_em is null and prioridade_pesagem is distinct from v_n;
  end loop;
  perform public._avisar_nova_ordem(v_antes, 'pesagem');
  return v_n;
end $$;
revoke execute on function public.reordenar_pesagem(jsonb) from public, anon;
grant execute on function public.reordenar_pesagem(jsonb) to authenticated;

-- URGENTE: 1º lugar na pesagem E na masseira dela, com aviso para os dois setores
create or replace function public.programacao_urgente(p_id bigint)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.programacoes; v_nome text;
begin
  perform public._exigir('programacao');
  select * into v from public.programacoes where id = p_id for update;
  if not found or v.situacao <> 'ativa' or v.finalizada_em is not null then raise exception 'Esta produção não está aberta.'; end if;
  select upper(nome) into v_nome from public.fichas_tecnicas where id = v.ficha_id;
  perform set_config('pss.reordenando', '1', true);
  with o as (select g.id, row_number() over (order by case when g.id = p_id then 0 else 1 end, g.prioridade_pesagem nulls last, g.id) n
               from public.programacoes g where g.data = v.data and g.situacao = 'ativa' and g.finalizada_em is null)
  update public.programacoes g set prioridade_pesagem = least(o.n, 9999), atualizado_em = now(), atualizado_por = auth.uid()
    from o where o.id = g.id and g.prioridade_pesagem is distinct from least(o.n, 9999);
  if v.maceira_id is not null then
    with o as (select g.id, row_number() over (order by case when g.id = p_id then 0 else 1 end, g.prioridade nulls last, g.id) n
                 from public.programacoes g where g.data = v.data and g.maceira_id = v.maceira_id and g.situacao = 'ativa' and g.finalizada_em is null)
    update public.programacoes g set prioridade = least(o.n, 9999), atualizado_em = now(), atualizado_por = auth.uid()
      from o where o.id = g.id and g.prioridade is distinct from least(o.n, 9999);
  end if;
  perform set_config('pss.reordenando', '', true);
  if v.data = public._hoje() then
    if v.maceira_id is not null then
      insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto, detalhe) values (v.maceira_id, p_id, 'urgente',
        format('URGENTE: %s passou para o 1º lugar. PRIORIDADE MÁXIMA.', v_nome), public._texto_ordem_masseira(v.maceira_id, v.data));
    end if;
    insert into public.avisos_producao (setor, programacao_id, tipo, texto, detalhe) values ('pesagem', p_id, 'urgente',
      format('URGENTE: pese %s primeiro. PRIORIDADE MÁXIMA.', v_nome), public._texto_ordem_pesagem(v.data));
  end if;
  return true;
end $$;
revoke execute on function public.programacao_urgente(bigint) from public, anon;
grant execute on function public.programacao_urgente(bigint) to authenticated;

-- o padeiro confirma só os avisos da MASSEIRA (nome + senha)
create or replace function public.confirmar_avisos_producao(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_oper bigint := (p->>'operador_id')::bigint; v_n int;
begin
  perform public._exigir('batelada');
  if v_oper is null then raise exception 'Escolha o seu nome.'; end if;
  if not public._operador_ok(v_oper, p->>'pin') then raise exception 'Senha do padeiro incorreta.'; end if;
  update public.avisos_producao set ciente_em = now(), ciente_operador_id = v_oper, ciente_por = auth.uid()
   where ciente_em is null and setor = 'masseira'
     and id in (select (x)::bigint from jsonb_array_elements_text(coalesce(p->'ids', '[]'::jsonb)) x);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.confirmar_avisos_producao(jsonb) from public, anon;
grant execute on function public.confirmar_avisos_producao(jsonb) to authenticated;

-- a pesagem confirma os avisos dela com o próprio login (fica registrado quem e quando)
create or replace function public.confirmar_avisos_pesagem(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  perform public._exigir('saida_receita');
  if jsonb_typeof(coalesce(p->'ids', 'null'::jsonb)) <> 'array' or jsonb_array_length(p->'ids') > 500 then raise exception 'Lista inválida.'; end if;
  update public.avisos_producao set ciente_em = now(), ciente_por = auth.uid()
   where ciente_em is null and setor = 'pesagem'
     and id in (select (x)::bigint from jsonb_array_elements_text(p->'ids') x);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.confirmar_avisos_pesagem(jsonb) from public, anon;
grant execute on function public.confirmar_avisos_pesagem(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. "MISTURA" PASSA A SE CHAMAR "BASE"
-- ---------------------------------------------------------------------
create or replace function public._mistura_da_ficha(p_ficha bigint)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; f public.fichas_tecnicas;
begin
  select id into v_id from public.produtos where ficha_id = p_ficha and categoria = 'intermediario';
  select * into f from public.fichas_tecnicas where id = p_ficha;
  if v_id is not null then
    update public.produtos set descricao = 'Base – ' || f.nome, grupo = 'Base', ativo = f.ativo
     where id = v_id and (descricao <> 'Base – ' || f.nome or grupo is distinct from 'Base' or ativo <> f.ativo);
    return v_id;
  end if;
  insert into public.produtos (codigo, descricao, categoria, grupo, unidade_estoque, controla_estoque, baixa_producao, baixa_requisicao,
                               local_padrao_id, ficha_id, ativo, observacao)
  values ('MIS-' || f.codigo, 'Base – ' || f.nome, 'intermediario', 'Base', 'un', true, true, false,
          public._local_tipo('pesagem'), p_ficha, f.ativo, 'Produto intermediário: 1 un = 1 base pesada (balde). Criado pelo sistema.')
  on conflict (codigo) do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.produtos where codigo = 'MIS-' || f.codigo; end if;
  return v_id;
end $$;
revoke execute on function public._mistura_da_ficha(bigint) from public, anon, authenticated;

update public.produtos p set descricao = 'Base – ' || f.nome, grupo = 'Base',
       observacao = replace(coalesce(p.observacao, ''), '1 receita pesada', '1 base pesada')
  from public.fichas_tecnicas f
 where p.ficha_id = f.id and p.categoria = 'intermediario' and (p.descricao <> 'Base – ' || f.nome or p.grupo is distinct from 'Base');

update public.parametros set descricao = replace(replace(descricao, 'mistura', 'base'), 'Mistura', 'Base')
 where descricao ilike '%mistura%';

-- iniciar batelada: igual à anterior; só a mensagem fala em "base"
create or replace function public.iniciar_batelada(p jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_b bigint; v_prog public.programacoes; v_ficha bigint := (p->>'ficha_id')::bigint; f public.fichas_tecnicas;
        v_mac bigint := public._local_tipo('maceiras'); v_mis bigint; e numeric; itj jsonb; v_pr public.produtos;
        v_q numeric; v_mov bigint; v_cm numeric := 0; v_cmac numeric := 0; v_oper bigint := (p->>'operador_id')::bigint;
        v_itens jsonb := '[]'::jsonb; v_padrao jsonb; t record; v_det jsonb := '[]'::jsonb; v_local bigint;
begin
  perform public._exigir('batelada');
  if v_oper is null then raise exception 'Escolha quem está batendo.'; end if;
  if not public._operador_ok(v_oper, p->>'pin') then raise exception 'Senha do padeiro incorreta.'; end if;
  if (p->>'programacao_id') is not null then
    select * into v_prog from public.programacoes where id = (p->>'programacao_id')::bigint;
    if not found or v_prog.situacao <> 'ativa' then raise exception 'Programação não encontrada ou cancelada.'; end if;
    if v_prog.finalizada_em is not null then raise exception 'Esta programação já foi finalizada.'; end if;
    v_ficha := v_prog.ficha_id;
  end if;
  select * into f from public.fichas_tecnicas where id = v_ficha;
  if not found then raise exception 'Receita não encontrada.'; end if;
  if (p->>'maceira_id') is null or not exists (select 1 from public.maceiras where id = (p->>'maceira_id')::bigint) then
    raise exception 'Escolha a maceira.'; end if;
  v_mis := public._mistura_da_ficha(v_ficha);

  -- "Receber e iniciar": recebe as bases desta receita que estão a caminho
  if coalesce((p->>'receber')::boolean, false) then
    for t in select distinct tr.id from public.transferencias tr join public.transferencia_itens ti on ti.transferencia_id = tr.id
              where tr.situacao = 'enviada' and tr.destino_id = v_mac and ti.produto_id = v_mis loop
      perform public.receber_transferencia(jsonb_build_object('id', t.id, 'operador_id', v_oper, 'pin', p->>'pin'));
    end loop;
  end if;

  select coalesce(disponivel, 0) into e from public.estoque_local where produto_id = v_mis and local_id = v_mac;
  if coalesce(e, 0) < 0.9999 then
    raise exception 'A base de % ainda não chegou na masseira. Receba da pesagem antes de iniciar.', f.nome;
  end if;

  insert into public.bateladas (programacao_id, ficha_id, maceira_id, operador_id, rendimento_padrao, observacao)
  values ((p->>'programacao_id')::bigint, v_ficha, (p->>'maceira_id')::bigint, v_oper, f.rendimento_qtd, public._texto(p,'observacao'))
  returning id into v_b;

  -- 1 base sai da Produção Maceiras
  v_mov := public._movimentar(v_mis, 'saida_receita', -1, null,
    jsonb_build_object('batelada_id', v_b, 'local_id', v_mac, 'programacao_id', (p->>'programacao_id')::bigint, 'operador_id', v_oper));
  v_cm := coalesce((select -valor from public.movimentos where id = v_mov), 0);

  -- itens da maceira: os informados (farinha confirmada/trocada, fermento ajustado)
  for itj in select * from jsonb_array_elements(coalesce(p->'itens','[]'::jsonb)) loop
    select * into v_pr from public.produtos where id = (itj->>'produto_id')::bigint;
    if not found then raise exception 'Produto não encontrado.'; end if;
    if v_pr.categoria <> 'materia_prima' then raise exception 'Na maceira só entra matéria-prima.'; end if;
    v_q := coalesce((itj->>'quantidade')::numeric, 0) * public._fator(v_pr.id, coalesce(itj->>'unidade', v_pr.unidade_estoque));
    if v_q < 0 then raise exception 'Quantidade não pode ser negativa.'; end if;
    v_itens := v_itens || jsonb_build_array(jsonb_build_object('produto_id', v_pr.id, 'quantidade', v_q,
                 'padrao', (itj->>'padrao')::numeric, 'trocou_de', (itj->>'trocou_de')::bigint));
    if v_q = 0 or not v_pr.controla_estoque or not v_pr.baixa_producao then continue; end if;
    v_local := coalesce(v_pr.local_padrao_id, public._local_tipo('deposito'));
    v_mov := public._movimentar(v_pr.id, 'saida_receita', -v_q, null,
      jsonb_build_object('batelada_id', v_b, 'local_id', v_local, 'programacao_id', (p->>'programacao_id')::bigint, 'operador_id', v_oper));
    v_cmac := v_cmac + coalesce((select -valor from public.movimentos where id = v_mov), 0);
    v_det := v_det || jsonb_build_array(jsonb_build_object('produto_id', v_pr.id, 'quantidade', v_q,
               'valor', (select -valor from public.movimentos where id = v_mov)));
  end loop;
  update public.bateladas set itens = v_itens where id = v_b;
  insert into public.batelada_custos (batelada_id, custo_mistura, custo_maceira, custo_total, detalhe)
  values (v_b, v_cm, v_cmac, v_cm + v_cmac, jsonb_build_object('maceira', v_det));
  return v_b;
end $$;
revoke execute on function public.iniciar_batelada(jsonb) from public, anon;
grant execute on function public.iniciar_batelada(jsonb) to authenticated;

insert into public.versao_banco (versao, descricao)
select '2.9.0', 'Ordem da pesagem, botão urgente, avisos melhores (pesagem também), mistura passa a se chamar base'
where not exists (select 1 from public.versao_banco where versao = '2.9.0');

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Ordem da pesagem preenchida' as verificacao,
       case when count(*) filter (where prioridade_pesagem is null) = 0 then 'OK' else 'ATENÇÃO: ' || count(*) filter (where prioridade_pesagem is null) || ' sem ordem' end as resultado
  from public.programacoes
union all
select 'Produção nova entra no fim da pesagem', case when exists (select 1 from pg_trigger where tgname = 'prioridade_pesagem') then 'OK' else 'ATENÇÃO' end
union all
select 'Avisos com setor (masseira/pesagem)', case when exists (select 1 from information_schema.columns where table_name = 'avisos_producao' and column_name = 'setor') then 'OK' else 'ATENÇÃO' end
union all
select 'Funções novas só para quem tem login',
       case when count(*) = 3 then 'OK' else 'ATENÇÃO' end
  from pg_proc p where p.proname in ('reordenar_pesagem','programacao_urgente','confirmar_avisos_pesagem')
   and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute')
union all
select '"Mistura" virou "Base" nos produtos',
       case when count(*) = 0 then 'OK' else 'ATENÇÃO: ' || count(*) end
  from public.produtos where categoria = 'intermediario' and descricao like 'Mistura –%'
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
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.9.0') then 'OK (2.9.0)' else 'ATENÇÃO' end;
