-- =====================================================================
-- Projeto Artas · ATUALIZAÇÃO DO BANCO v2.25 (26/11/2026)
-- Módulo PREVISÃO, 1ª tela "Pedidos em aberto" (tabelão dos pedidos do ERP):
--   · pedidos do ERP passam a guardar o VALOR (unitário e total do item)
--   · enquanto o módulo é construído, só o ADMINISTRADOR lê os pedidos do ERP (antes: gestão e faturamento)
-- Idempotente: pode rodar mais de uma vez. Cole no SQL Editor do Supabase e rode.
-- =====================================================================

-- 1. VALORES nos itens dos pedidos do ERP
alter table public.erp_pedidos_itens add column if not exists valor_unitario numeric(14,4);
alter table public.erp_pedidos_itens add column if not exists valor_total    numeric(14,2);
comment on column public.erp_pedidos_itens.valor_total is 'Valor total do item no pedido (ERP: VRTOTAL), somado quando o produto se repete no pedido.';

-- 2. QUEM LÊ: só o administrador (o resto da regra continua igual à v2.24)
create or replace function public.pode(p_acao text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.meus_papeis() && (case p_acao
    when 'cadastro_produto'    then array['admin','comprador']
    when 'cadastro_fornecedor' then array['admin','comprador']
    when 'ficha_tecnica'       then array['admin','engenharia']
    when 'pedido'              then array['admin','comprador']
    when 'recebimento'         then array['admin','almoxarifado','recebimento']
    when 'saida_receita'       then array['admin','pesagem','almoxarifado']
    when 'saida_avulsa'        then array['admin','pesagem','almoxarifado','padeiro','engenharia','gestor_producao']
    when 'saida_almox'         then array['admin','almoxarifado','recebimento']
    when 'inventario'          then array['admin','almoxarifado','recebimento']
    when 'corrigir'            then array['admin','almoxarifado']
    when 'implantacao'         then array['admin']
    when 'contagem_inicial'    then array['admin','almoxarifado']
    when 'usuarios'            then array['admin']
    when 'parametros'          then array['admin']
    when 'auditoria'           then array['admin','diretoria']
    when 'importacao'          then array['admin']
    when 'programacao'         then array['admin','engenharia','gestor_producao']
    when 'financeiro'          then array['admin','financeiro']
    when 'data_pagamento'      then array['admin','comprador','financeiro']
    when 'previsao_producao'   then array['admin','engenharia','diretoria','financeiro','faturamento','gestor_producao']
    when 'custos'              then array['admin','diretoria']
    when 'requisicao'          then array['admin','engenharia','gestor_producao']
    when 'producao_config'     then array['admin','engenharia','gestor_producao']
    when 'batelada'            then array['admin','padeiro','engenharia','gestor_producao']
    when 'finalizar_batelada'  then array['admin','engenharia','gestor_producao']
    when 'consumo'             then array['admin','engenharia','almoxarifado','padeiro','pesagem','gestor_producao']
    when 'locais'              then array['admin']
    when 'frota'               then array['admin','frota']
    when 'pedidos_erp'         then array['admin']   -- v2.25: só o administrador enquanto o módulo Previsão é construído
    when 'integracao_erp'      then array['admin','integracao']
    else array[]::text[] end)::text[], false)
$$;

-- 3. RECEBER OS PEDIDOS: agora também valor_unitario e valor_total (consulta-pedidos.sql com VALOR_UNITARIO e VALOR_TOTAL)
--    Envio sem os valores (consulta antiga) continua funcionando: os valores ficam vazios.
create or replace function public.erp_receber_pedidos(p jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sinc bigint; v_n int; v_novas int; v_alt int; v_rem int; v_desde date; v_ate date; v_erro text;
begin
  perform public._exigir('integracao_erp');   -- só o robô (papel "integracao") ou o administrador
  if jsonb_typeof(p) <> 'object' then raise exception 'Envio inválido.'; end if;
  v_desde := nullif(p->>'desde', '')::date;
  v_ate   := nullif(p->>'ate', '')::date;
  v_erro  := left(nullif(btrim(p->>'erro'), ''), 2000);

  -- o robô não conseguiu ler o ERP: só registra (para o aviso "robô com problema")
  if v_erro is not null then
    insert into public.erp_sincronizacoes (maquina, versao_robo, desde, ate, segundos, erro)
    values (left(p->>'maquina', 80), left(p->>'versao_robo', 20), v_desde, v_ate, nullif(p->>'segundos', '')::numeric, v_erro)
    returning id into v_sinc;
    return jsonb_build_object('sincronizacao_id', v_sinc, 'erro_registrado', true);
  end if;

  if v_desde is null or v_ate is null or v_ate < v_desde or v_ate - v_desde > 400 then
    raise exception 'Período do envio inválido (desde/ate).';
  end if;
  if jsonb_typeof(p->'linhas') <> 'array' then raise exception 'Envio sem a lista de pedidos.'; end if;
  if jsonb_array_length(p->'linhas') > 50000 then raise exception 'Envio grande demais (máximo 50.000 linhas).'; end if;

  create temp table if not exists _erp_ped (
    empresa text, numero text, data_venda date, romaneio text, cliente_codigo text, cliente_nome text, cliente_fantasia text,
    rede_codigo text, rede_nome text, cidade text, uf text, produto_codigo text, produto_nome text, grupo_codigo text, grupo_nome text,
    subgrupo_codigo text, subgrupo_nome text, quantidade numeric, funcionario_codigo text, funcionario_nome text,
    colaborador_codigo text, colaborador_nome text, valor_unitario numeric, valor_total numeric) on commit drop;
  truncate _erp_ped;
  insert into _erp_ped
  select left(btrim(l->>'empresa'), 20), left(btrim(l->>'numero'), 30), nullif(l->>'data_venda', '')::date, left(btrim(l->>'romaneio'), 30),
         left(btrim(l->>'cliente_codigo'), 30), left(btrim(l->>'cliente_nome'), 150), left(btrim(l->>'cliente_fantasia'), 150),
         left(btrim(l->>'rede_codigo'), 30), left(btrim(l->>'rede_nome'), 120), left(btrim(l->>'cidade'), 80), left(upper(btrim(l->>'uf')), 2),
         left(btrim(l->>'produto_codigo'), 30), left(btrim(l->>'produto_nome'), 150), left(btrim(l->>'grupo_codigo'), 30), left(btrim(l->>'grupo_nome'), 80),
         left(btrim(l->>'subgrupo_codigo'), 30), left(btrim(l->>'subgrupo_nome'), 80), nullif(l->>'quantidade', '')::numeric,
         left(btrim(l->>'funcionario_codigo'), 30), left(btrim(l->>'funcionario_nome'), 120),
         left(btrim(l->>'colaborador_codigo'), 30), left(btrim(l->>'colaborador_nome'), 120),
         nullif(l->>'valor_unitario', '')::numeric, nullif(l->>'valor_total', '')::numeric
    from jsonb_array_elements(p->'linhas') l;
  delete from _erp_ped where coalesce(empresa, '') = '' or coalesce(numero, '') = '' or data_venda is null
                          or coalesce(produto_codigo, '') = '' or quantidade is null;
  if exists (select 1 from _erp_ped where quantidade < -1000000 or quantidade > 1000000) then
    raise exception 'Quantidade fora da faixa num pedido: confira a consulta do robô.';
  end if;
  if exists (select 1 from _erp_ped where abs(valor_unitario) > 10000000 or abs(valor_total) > 100000000) then
    raise exception 'Valor fora da faixa num pedido: confira a consulta do ERP.';
  end if;
  if exists (select 1 from _erp_ped where data_venda < v_desde or data_venda > v_ate) then
    raise exception 'Pedido com data fora do período enviado: confira a consulta do robô.';
  end if;

  -- 1 linha por pedido × produto (soma se o produto vier repetido no mesmo pedido)
  create temp table if not exists _erp_agr on commit drop as select * from _erp_ped limit 0;
  alter table _erp_agr add column if not exists chave text;
  alter table _erp_agr add column if not exists assinatura text;
  truncate _erp_agr;
  insert into _erp_agr
  select empresa, numero, data_venda, max(romaneio), max(cliente_codigo), max(cliente_nome), max(cliente_fantasia), max(rede_codigo), max(rede_nome),
         max(cidade), max(uf), produto_codigo, max(produto_nome), max(grupo_codigo), max(grupo_nome), max(subgrupo_codigo), max(subgrupo_nome),
         round(sum(quantidade), 3), max(funcionario_codigo), max(funcionario_nome), max(colaborador_codigo), max(colaborador_nome),
         round(case when sum(quantidade) <> 0 and sum(valor_total) is not null then sum(valor_total) / sum(quantidade) else max(valor_unitario) end, 4),
         round(sum(valor_total), 2),
         concat_ws('|', empresa, numero, data_venda, produto_codigo), null
    from _erp_ped group by empresa, numero, data_venda, produto_codigo;
  update _erp_agr set assinatura = md5(concat_ws('|', romaneio, cliente_codigo, cliente_nome, cliente_fantasia, rede_codigo, rede_nome, cidade, uf,
         produto_nome, grupo_codigo, grupo_nome, subgrupo_codigo, subgrupo_nome, quantidade, funcionario_codigo, funcionario_nome,
         colaborador_codigo, colaborador_nome, valor_unitario, valor_total))
   where true;   -- o Supabase recusa UPDATE sem WHERE
  select count(*) into v_n from _erp_agr;

  select count(*) into v_novas from _erp_agr a where not exists (select 1 from public.erp_pedidos_itens e where e.chave = a.chave);
  select count(*) into v_alt from _erp_agr a join public.erp_pedidos_itens e on e.chave = a.chave
   where e.assinatura <> a.assinatura or e.removido_em is not null;
  select count(*) into v_rem from public.erp_pedidos_itens e
   where e.removido_em is null and e.data_venda between v_desde and v_ate and not exists (select 1 from _erp_agr a where a.chave = e.chave);

  insert into public.erp_sincronizacoes (maquina, versao_robo, desde, ate, segundos, linhas, novas, alteradas, removidas, erro)
  values (left(p->>'maquina', 80), left(p->>'versao_robo', 20), v_desde, v_ate, nullif(p->>'segundos', '')::numeric, v_n, v_novas, v_alt,
          case when v_n = 0 then 0 else v_rem end,
          case when v_n = 0 and v_rem > 0 then 'Consulta do ERP voltou vazia: nada foi tirado da lista (proteção).' end)
  returning id into v_sinc;

  if v_n = 0 then   -- lista vazia: não tira nada (pode ser falha da consulta)
    return jsonb_build_object('sincronizacao_id', v_sinc, 'linhas', 0, 'novas', 0, 'alteradas', 0, 'removidas', 0, 'protecao_lista_vazia', v_rem > 0);
  end if;

  insert into public.erp_pedidos_itens as e (chave, empresa, numero, data_venda, romaneio, cliente_codigo, cliente_nome, cliente_fantasia,
         rede_codigo, rede_nome, cidade, uf, produto_codigo, produto_nome, grupo_codigo, grupo_nome, subgrupo_codigo, subgrupo_nome,
         quantidade, funcionario_codigo, funcionario_nome, colaborador_codigo, colaborador_nome, valor_unitario, valor_total, assinatura, sincronizacao_id)
  select chave, empresa, numero, data_venda, romaneio, cliente_codigo, cliente_nome, cliente_fantasia, rede_codigo, rede_nome, cidade, uf,
         produto_codigo, produto_nome, grupo_codigo, grupo_nome, subgrupo_codigo, subgrupo_nome, quantidade, funcionario_codigo, funcionario_nome,
         colaborador_codigo, colaborador_nome, valor_unitario, valor_total, assinatura, v_sinc
    from _erp_agr
  on conflict (chave) do update set romaneio = excluded.romaneio, cliente_codigo = excluded.cliente_codigo, cliente_nome = excluded.cliente_nome,
         cliente_fantasia = excluded.cliente_fantasia, rede_codigo = excluded.rede_codigo, rede_nome = excluded.rede_nome, cidade = excluded.cidade,
         uf = excluded.uf, produto_nome = excluded.produto_nome, grupo_codigo = excluded.grupo_codigo, grupo_nome = excluded.grupo_nome,
         subgrupo_codigo = excluded.subgrupo_codigo, subgrupo_nome = excluded.subgrupo_nome, quantidade = excluded.quantidade,
         funcionario_codigo = excluded.funcionario_codigo, funcionario_nome = excluded.funcionario_nome,
         colaborador_codigo = excluded.colaborador_codigo, colaborador_nome = excluded.colaborador_nome, valor_unitario = excluded.valor_unitario,
         valor_total = excluded.valor_total, assinatura = excluded.assinatura,
         sincronizacao_id = excluded.sincronizacao_id, removido_em = null, atualizado_em = now()
   where e.assinatura is distinct from excluded.assinatura or e.removido_em is not null;

  update public.erp_pedidos_itens e set removido_em = now(), sincronizacao_id = v_sinc
   where e.removido_em is null and e.data_venda between v_desde and v_ate and not exists (select 1 from _erp_agr a where a.chave = e.chave);

  return jsonb_build_object('sincronizacao_id', v_sinc, 'linhas', v_n, 'novas', v_novas, 'alteradas', v_alt, 'removidas', v_rem);
end $$;
revoke execute on function public.erp_receber_pedidos(jsonb) from public, anon;
grant execute on function public.erp_receber_pedidos(jsonb) to authenticated;

insert into public.versao_banco (versao, descricao)
values ('2.25.0', 'Previsão: valores nos pedidos do ERP; leitura só do administrador')
on conflict (versao) do nothing;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Colunas de valor nos pedidos do ERP' as verificacao,
       case when count(*) = 2 then 'OK (2)' else 'ATENÇÃO: ' || count(*) end as resultado
  from information_schema.columns where table_schema = 'public' and table_name = 'erp_pedidos_itens' and column_name in ('valor_unitario','valor_total')
union all
select 'Pedidos do ERP: leitura só do administrador',
       case when pg_get_functiondef('public.pode(text)'::regprocedure) like '%''pedidos_erp''         then array[''admin'']   --%' then 'OK' else 'ATENÇÃO' end
union all
select 'Função de receber pedidos grava os valores',
       case when pg_get_functiondef('public.erp_receber_pedidos(jsonb)'::regprocedure) like '%valor_total = excluded.valor_total%' then 'OK' else 'ATENÇÃO' end
union all
select 'Tabelas dos pedidos do ERP protegidas (RLS)',
       case when count(*) = 2 then 'OK (2)' else 'ATENÇÃO: ' || count(*) end
  from pg_class where relname in ('erp_sincronizacoes','erp_pedidos_itens') and relrowsecurity and relforcerowsecurity
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.25.0') then 'OK (2.25.0)' else 'ATENÇÃO' end;
