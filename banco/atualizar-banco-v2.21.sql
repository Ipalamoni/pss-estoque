-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.21 · CORREÇÃO DA IMPORTAÇÃO DA FROTA
-- (aplicar DEPOIS da v2.20; pode rodar de novo sem problema; não apaga dados)
--
--  O Supabase recusa "UPDATE sem WHERE" (proteção). A importação tinha um desses numa tabela temporária
--  e parava com "UPDATE requires a WHERE clause". Esta versão só troca a função de importação.
--  Importar despesas passa a ser só do ADMINISTRADOR (o responsável da frota aponta, mas não importa).
-- =====================================================================

create or replace function public.frota_importar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_desde date; v_novas int; v_alt int; v_rem int; v_imp bigint; v_n int; v_placas jsonb; v_serv_novos int;
begin
  perform public._exigir('importacao');   -- importar despesas: só o ADMINISTRADOR
  if jsonb_typeof(p->'linhas') <> 'array' then raise exception 'Arquivo sem linhas.'; end if;
  if jsonb_array_length(p->'linhas') > 50000 then raise exception 'Arquivo grande demais (máximo 50.000 linhas de manutenção).'; end if;

  create temp table if not exists _frota_imp (
    seq int, fornecedor_codigo text, fornecedor_nome text, cnpj text, titulo text, parcela text,
    emissao date, entrada date, vencimento date, pagamento date, valor_titulo numeric, juros numeric, desconto numeric, valor_pago numeric,
    centro_custo text, conta text, valor numeric, observacao text, status text, placa_original text, placa text, tipo_documento text,
    chave text, assinatura text) on commit drop;
  truncate _frota_imp;
  insert into _frota_imp (seq, fornecedor_codigo, fornecedor_nome, cnpj, titulo, parcela, emissao, entrada, vencimento, pagamento,
                          valor_titulo, juros, desconto, valor_pago, centro_custo, conta, valor, observacao, status, placa_original, placa, tipo_documento)
  select x.ord, left(btrim(x.l->>'fornecedor_codigo'), 30), left(btrim(x.l->>'fornecedor_nome'), 120), left(btrim(x.l->>'cnpj'), 20),
         left(btrim(x.l->>'titulo'), 40), left(btrim(coalesce(x.l->>'parcela', '')), 10),
         nullif(x.l->>'emissao', '')::date, nullif(x.l->>'entrada', '')::date, nullif(x.l->>'vencimento', '')::date, nullif(x.l->>'pagamento', '')::date,
         nullif(x.l->>'valor_titulo', '')::numeric, nullif(x.l->>'juros', '')::numeric, nullif(x.l->>'desconto', '')::numeric, nullif(x.l->>'valor_pago', '')::numeric,
         left(btrim(x.l->>'centro_custo'), 80), left(btrim(x.l->>'conta'), 80), round(nullif(x.l->>'valor', '')::numeric, 2),
         left(btrim(x.l->>'observacao'), 500), left(btrim(x.l->>'status'), 5), left(btrim(coalesce(x.l->>'placa', '')), 20),
         left(public.frota_placa(x.l->>'placa'), 12), left(btrim(x.l->>'tipo_documento'), 40)
    from jsonb_array_elements(p->'linhas') with ordinality as x(l, ord);
  delete from _frota_imp where entrada is null or coalesce(fornecedor_codigo, '') = '' or coalesce(titulo, '') = '' or valor is null or coalesce(conta, '') = '';
  select count(*) into v_n from _frota_imp;
  if v_n = 0 then raise exception 'Nenhuma linha de manutenção de veículos no arquivo (contas: manutenção corretiva, preventiva e pneus).'; end if;
  if (select min(entrada) from _frota_imp) < date '2020-01-01' then raise exception 'Data de entrada muito antiga no arquivo: confira o arquivo.'; end if;

  -- chave de cada linha: fornecedor + título + parcela + conta + placa (+ nº de ordem se repetir no arquivo)
  update _frota_imp i set chave = k.chave
    from (select seq, concat_ws('|', fornecedor_codigo, titulo, parcela, conta, placa,
                 row_number() over (partition by fornecedor_codigo, titulo, parcela, conta, placa order by seq)) as chave from _frota_imp) k
   where k.seq = i.seq;
  update _frota_imp set assinatura = md5(concat_ws('|', fornecedor_nome, cnpj, emissao, entrada, vencimento, pagamento, valor_titulo, juros, desconto,
                                                   valor_pago, centro_custo, valor, observacao, status, placa_original, tipo_documento))
   where true;   -- o Supabase recusa UPDATE sem WHERE (proteção contra alterar a tabela inteira sem querer)
  v_desde := date_trunc('year', (select min(entrada) from _frota_imp))::date;

  select count(*) into v_novas from _frota_imp i where not exists (select 1 from public.frota_lancamentos l where l.chave = i.chave);
  select count(*) into v_alt from _frota_imp i join public.frota_lancamentos l on l.chave = i.chave
   where l.assinatura <> i.assinatura or l.removido_em is not null;
  select count(*) into v_rem from public.frota_lancamentos l
   where l.entrada >= v_desde and l.removido_em is null and not exists (select 1 from _frota_imp i where i.chave = l.chave);
  select count(distinct (fornecedor_codigo, titulo, placa)) into v_serv_novos from _frota_imp i
   where not exists (select 1 from public.frota_servicos s where s.fornecedor_codigo = i.fornecedor_codigo and s.titulo = i.titulo and s.placa_arquivo = i.placa);
  -- placas que ninguém reconhece (nem cadastro nem correção)
  select coalesce(jsonb_agg(jsonb_build_object('placa', placa, 'linhas', n, 'valor', v) order by v desc), '[]') into v_placas
    from (select placa, count(*) n, sum(valor) v from _frota_imp i
           where placa not in ('', '9999999')
             and not exists (select 1 from public.frota_veiculos f where f.placa = i.placa)
             and not exists (select 1 from public.frota_placa_apelidos a where a.placa = i.placa)
           group by placa) z;

  if coalesce((p->>'simular')::boolean, false) then
    return jsonb_build_object('simulado', true, 'desde', v_desde, 'linhas', v_n, 'novas', v_novas, 'alteradas', v_alt, 'removidas', v_rem,
      'notas_novas', v_serv_novos, 'placas_desconhecidas', v_placas, 'valor_total', (select sum(valor) from _frota_imp),
      'ate', (select max(entrada) from _frota_imp));
  end if;

  insert into public.frota_importacoes (origem, arquivo, desde, linhas, novas, alteradas, removidas)
  values (coalesce(nullif(p->>'origem', ''), 'csv'), left(p->>'arquivo', 200), v_desde, v_n, v_novas, v_alt, v_rem) returning id into v_imp;

  insert into public.frota_servicos (fornecedor_codigo, titulo, placa_arquivo)
  select distinct fornecedor_codigo, titulo, placa from _frota_imp
  on conflict (fornecedor_codigo, titulo, placa_arquivo) do nothing;

  insert into public.frota_lancamentos as l (chave, servico_id, fornecedor_codigo, fornecedor_nome, cnpj, titulo, parcela, emissao, entrada, vencimento,
         pagamento, valor_titulo, juros, desconto, valor_pago, centro_custo, conta, valor, observacao, status, placa_original, tipo_documento,
         assinatura, importacao_id, removido_em, atualizado_em)
  select i.chave, s.id, i.fornecedor_codigo, i.fornecedor_nome, i.cnpj, i.titulo, i.parcela, i.emissao, i.entrada, i.vencimento,
         i.pagamento, i.valor_titulo, i.juros, i.desconto, i.valor_pago, i.centro_custo, i.conta, i.valor, i.observacao, i.status, i.placa_original,
         i.tipo_documento, i.assinatura, v_imp, null, now()
    from _frota_imp i join public.frota_servicos s on s.fornecedor_codigo = i.fornecedor_codigo and s.titulo = i.titulo and s.placa_arquivo = i.placa
  on conflict (chave) do update set servico_id = excluded.servico_id, fornecedor_nome = excluded.fornecedor_nome, cnpj = excluded.cnpj,
         emissao = excluded.emissao, entrada = excluded.entrada, vencimento = excluded.vencimento, pagamento = excluded.pagamento,
         valor_titulo = excluded.valor_titulo, juros = excluded.juros, desconto = excluded.desconto, valor_pago = excluded.valor_pago,
         centro_custo = excluded.centro_custo, valor = excluded.valor, observacao = excluded.observacao, status = excluded.status,
         placa_original = excluded.placa_original, tipo_documento = excluded.tipo_documento, assinatura = excluded.assinatura,
         importacao_id = excluded.importacao_id, removido_em = null, atualizado_em = now()
   where l.assinatura is distinct from excluded.assinatura or l.removido_em is not null;

  update public.frota_lancamentos l set removido_em = now(), importacao_id = v_imp
   where l.entrada >= v_desde and l.removido_em is null and not exists (select 1 from _frota_imp i where i.chave = l.chave);

  update public.frota_servicos s set ativo = exists (select 1 from public.frota_lancamentos l where l.servico_id = s.id and l.removido_em is null)
   where s.ativo is distinct from exists (select 1 from public.frota_lancamentos l where l.servico_id = s.id and l.removido_em is null);

  -- o financeiro corrigiu a placa da nota: o apontamento antigo (etiquetas) passa para a nota com a placa nova
  update public.frota_servicos novo set tags = velho.tags, observacao = velho.observacao, hodometro = velho.hodometro,
         veiculo_manual_id = coalesce(novo.veiculo_manual_id, velho.veiculo_manual_id), apontado_por = velho.apontado_por, apontado_em = velho.apontado_em
    from public.frota_servicos velho
   where novo.ativo and cardinality(novo.tags) = 0 and not velho.ativo and cardinality(velho.tags) > 0
     and velho.fornecedor_codigo = novo.fornecedor_codigo and velho.titulo = novo.titulo and velho.id <> novo.id;
  update public.frota_rateios r set servico_id = novo.id
    from public.frota_servicos velho, public.frota_servicos novo
   where r.servico_id = velho.id and not velho.ativo and novo.ativo and novo.id <> velho.id
     and velho.fornecedor_codigo = novo.fornecedor_codigo and velho.titulo = novo.titulo
     and not exists (select 1 from public.frota_rateios r2 where r2.servico_id = novo.id);

  perform public._frota_resolver();
  return jsonb_build_object('importacao_id', v_imp, 'desde', v_desde, 'linhas', v_n, 'novas', v_novas, 'alteradas', v_alt, 'removidas', v_rem,
    'notas_novas', v_serv_novos, 'placas_desconhecidas', v_placas);
end $$;
revoke execute on function public.frota_importar(jsonb) from public, anon;
grant execute on function public.frota_importar(jsonb) to authenticated;

insert into public.versao_banco (versao, descricao)
values ('2.21.0', 'Correção da importação da frota (UPDATE com WHERE); importar só o administrador')
on conflict (versao) do nothing;

-- CONFERÊNCIA (todas as linhas devem dizer OK)
select 'Importação da frota corrigida' as verificacao,
       case when position('where true' in pg_get_functiondef('public.frota_importar(jsonb)'::regprocedure)) > 0 then 'OK' else 'ATENÇÃO' end as resultado
union all
select 'Importar despesas: só o administrador',
       case when position('_exigir(''importacao'')' in pg_get_functiondef('public.frota_importar(jsonb)'::regprocedure)) > 0 then 'OK' else 'ATENÇÃO' end
union all
select 'Importação só para quem tem login',
       case when not has_function_privilege('anon', 'public.frota_importar(jsonb)', 'execute') then 'OK' else 'ATENÇÃO' end
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.21.0') then 'OK (2.21.0)' else 'ATENÇÃO' end;
