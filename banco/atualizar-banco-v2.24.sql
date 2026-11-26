-- =====================================================================
-- Projeto Artas · ATUALIZAÇÃO DO BANCO v2.24 · PEDIDOS DE VENDA DO ERP (INTEGRAÇÃO)
-- (aplicar DEPOIS da v2.23; pode rodar de novo sem problema; não apaga dados)
--
--  · Papel novo "integracao" (robô do ERP): o usuário do robô SÓ consegue entregar os pedidos.
--    Ele NÃO conta como "usuário ativo": não lê parâmetros, usuários, estoque nem nada do sistema.
--  · Pedidos de venda em aberto vindos do ERP (Firebird), uma linha por produto do pedido.
--    O robô (script no servidor da empresa) lê o ERP só para consulta e envia a lista a cada 30 min.
--    ESPELHO: pedido novo entra, alterado atualiza, e o que saiu da lista do ERP (faturado/cancelado)
--    fica marcado com removido_em (nunca é apagado).
--  · Cada envio fica registrado (erp_sincronizacoes): quando, quantos, quanto tempo, e erros do robô.
--  · Leitura: admin, engenharia, diretoria, financeiro, faturamento e gestor da produção.
--  · Sem dados da empresa neste arquivo: os pedidos entram pelo robô.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PAPEL "integracao" e PERMISSÕES
-- ---------------------------------------------------------------------
alter table public.perfis drop constraint if exists perfis_papeis_check;
alter table public.perfis add constraint perfis_papeis_check check (papeis <@ array['admin','comprador','almoxarifado','recebimento',
  'pesagem','engenharia','diretoria','financeiro','faturamento','padeiro','gestor_producao','frota','integracao']::text[]);

-- o robô (só o papel "integracao") não é um usuário do sistema: não lê nada pelas regras de "usuário ativo"
create or replace function public.usuario_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis
                 where user_id = auth.uid() and ativo and cardinality(papeis) > 0
                   and not (papeis <@ array['integracao']::text[]))
$$;

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
    when 'pedidos_erp'         then array['admin','engenharia','diretoria','financeiro','faturamento','gestor_producao']
    when 'integracao_erp'      then array['admin','integracao']
    else array[]::text[] end)::text[], false)
$$;

-- ---------------------------------------------------------------------
-- 2. TABELAS
-- ---------------------------------------------------------------------
create table if not exists public.erp_sincronizacoes (
  id           bigint generated always as identity primary key,
  criado_em    timestamptz not null default now(),
  criado_por   uuid default auth.uid(),
  origem       text not null default 'robo' check (origem in ('robo','manual')),
  maquina      text check (length(maquina) <= 80),
  versao_robo  text check (length(versao_robo) <= 20),
  desde        date,
  ate          date,
  segundos     numeric(10,2),          -- tempo da consulta no ERP
  linhas       int not null default 0,
  novas        int not null default 0,
  alteradas    int not null default 0,
  removidas    int not null default 0,
  erro         text check (length(erro) <= 2000)
);
create index if not exists erp_sinc_criado on public.erp_sincronizacoes (criado_em desc);

create table if not exists public.erp_pedidos_itens (
  id                  bigint generated always as identity primary key,
  chave               text not null unique,     -- empresa | nº do pedido | data | produto
  empresa             text not null,
  numero              text not null,
  data_venda          date not null,
  romaneio            text,
  cliente_codigo      text,
  cliente_nome        text,
  cliente_fantasia    text,
  rede_codigo         text,
  rede_nome           text,
  cidade              text,
  uf                  text,
  produto_codigo      text not null,
  produto_nome        text,
  grupo_codigo        text,
  grupo_nome          text,
  subgrupo_codigo     text,
  subgrupo_nome       text,
  quantidade          numeric(14,3) not null,
  funcionario_codigo  text,
  funcionario_nome    text,
  colaborador_codigo  text,
  colaborador_nome    text,
  assinatura          text not null,            -- para saber se mudou desde o último envio
  sincronizacao_id    bigint references public.erp_sincronizacoes(id),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz,
  removido_em         timestamptz               -- saiu da lista de abertos do ERP (faturado/cancelado)
);
create index if not exists erp_ped_produto on public.erp_pedidos_itens (produto_codigo) where removido_em is null;
create index if not exists erp_ped_data on public.erp_pedidos_itens (data_venda);

comment on table public.erp_pedidos_itens is 'Pedidos de venda em aberto vindos do ERP (robô de integração). Espelho: removido_em = saiu da lista do ERP.';
comment on table public.erp_sincronizacoes is 'Registro de cada envio do robô de integração com o ERP.';

-- segurança: só quem acompanha a produção lê; ninguém grava direto (só pela função do robô)
do $$
declare t text;
begin
  foreach t in array array['erp_sincronizacoes','erp_pedidos_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists le_pedidos_erp on public.%I', t);
    execute format('create policy le_pedidos_erp on public.%I for select to authenticated using (public.pode(''pedidos_erp''))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. RECEBER OS PEDIDOS DO ROBÔ (espelho da lista de pedidos em aberto do ERP)
--    p = { maquina, versao_robo, desde, ate, segundos, erro,
--          linhas: [{ empresa, numero, data_venda, romaneio, cliente_codigo, cliente_nome, cliente_fantasia,
--                     rede_codigo, rede_nome, cidade, uf, produto_codigo, produto_nome, grupo_codigo, grupo_nome,
--                     subgrupo_codigo, subgrupo_nome, quantidade, funcionario_codigo, funcionario_nome,
--                     colaborador_codigo, colaborador_nome }] }
--    · mesmo produto repetido no mesmo pedido: as quantidades são somadas (1 linha por pedido × produto)
--    · lista VAZIA não apaga nada (protege contra consulta que falhou): fica registrada como aviso
-- ---------------------------------------------------------------------
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
    colaborador_codigo text, colaborador_nome text) on commit drop;
  truncate _erp_ped;
  insert into _erp_ped
  select left(btrim(l->>'empresa'), 20), left(btrim(l->>'numero'), 30), nullif(l->>'data_venda', '')::date, left(btrim(l->>'romaneio'), 30),
         left(btrim(l->>'cliente_codigo'), 30), left(btrim(l->>'cliente_nome'), 150), left(btrim(l->>'cliente_fantasia'), 150),
         left(btrim(l->>'rede_codigo'), 30), left(btrim(l->>'rede_nome'), 120), left(btrim(l->>'cidade'), 80), left(upper(btrim(l->>'uf')), 2),
         left(btrim(l->>'produto_codigo'), 30), left(btrim(l->>'produto_nome'), 150), left(btrim(l->>'grupo_codigo'), 30), left(btrim(l->>'grupo_nome'), 80),
         left(btrim(l->>'subgrupo_codigo'), 30), left(btrim(l->>'subgrupo_nome'), 80), nullif(l->>'quantidade', '')::numeric,
         left(btrim(l->>'funcionario_codigo'), 30), left(btrim(l->>'funcionario_nome'), 120),
         left(btrim(l->>'colaborador_codigo'), 30), left(btrim(l->>'colaborador_nome'), 120)
    from jsonb_array_elements(p->'linhas') l;
  delete from _erp_ped where coalesce(empresa, '') = '' or coalesce(numero, '') = '' or data_venda is null
                          or coalesce(produto_codigo, '') = '' or quantidade is null;
  if exists (select 1 from _erp_ped where quantidade < -1000000 or quantidade > 1000000) then
    raise exception 'Quantidade fora da faixa num pedido: confira a consulta do robô.';
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
         concat_ws('|', empresa, numero, data_venda, produto_codigo), null
    from _erp_ped group by empresa, numero, data_venda, produto_codigo;
  update _erp_agr set assinatura = md5(concat_ws('|', romaneio, cliente_codigo, cliente_nome, cliente_fantasia, rede_codigo, rede_nome, cidade, uf,
         produto_nome, grupo_codigo, grupo_nome, subgrupo_codigo, subgrupo_nome, quantidade, funcionario_codigo, funcionario_nome,
         colaborador_codigo, colaborador_nome))
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
         quantidade, funcionario_codigo, funcionario_nome, colaborador_codigo, colaborador_nome, assinatura, sincronizacao_id)
  select chave, empresa, numero, data_venda, romaneio, cliente_codigo, cliente_nome, cliente_fantasia, rede_codigo, rede_nome, cidade, uf,
         produto_codigo, produto_nome, grupo_codigo, grupo_nome, subgrupo_codigo, subgrupo_nome, quantidade, funcionario_codigo, funcionario_nome,
         colaborador_codigo, colaborador_nome, assinatura, v_sinc
    from _erp_agr
  on conflict (chave) do update set romaneio = excluded.romaneio, cliente_codigo = excluded.cliente_codigo, cliente_nome = excluded.cliente_nome,
         cliente_fantasia = excluded.cliente_fantasia, rede_codigo = excluded.rede_codigo, rede_nome = excluded.rede_nome, cidade = excluded.cidade,
         uf = excluded.uf, produto_nome = excluded.produto_nome, grupo_codigo = excluded.grupo_codigo, grupo_nome = excluded.grupo_nome,
         subgrupo_codigo = excluded.subgrupo_codigo, subgrupo_nome = excluded.subgrupo_nome, quantidade = excluded.quantidade,
         funcionario_codigo = excluded.funcionario_codigo, funcionario_nome = excluded.funcionario_nome,
         colaborador_codigo = excluded.colaborador_codigo, colaborador_nome = excluded.colaborador_nome, assinatura = excluded.assinatura,
         sincronizacao_id = excluded.sincronizacao_id, removido_em = null, atualizado_em = now()
   where e.assinatura is distinct from excluded.assinatura or e.removido_em is not null;

  update public.erp_pedidos_itens e set removido_em = now(), sincronizacao_id = v_sinc
   where e.removido_em is null and e.data_venda between v_desde and v_ate and not exists (select 1 from _erp_agr a where a.chave = e.chave);

  return jsonb_build_object('sincronizacao_id', v_sinc, 'linhas', v_n, 'novas', v_novas, 'alteradas', v_alt, 'removidas', v_rem);
end $$;
revoke execute on function public.erp_receber_pedidos(jsonb) from public, anon;
grant execute on function public.erp_receber_pedidos(jsonb) to authenticated;

insert into public.versao_banco (versao, descricao)
values ('2.24.0', 'Pedidos de venda do ERP: papel integracao (robô), tabelas espelho e registro de sincronizações')
on conflict (versao) do nothing;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Tabelas dos pedidos do ERP protegidas (RLS)' as verificacao,
       case when count(*) = 2 then 'OK (2)' else 'ATENÇÃO: ' || count(*) end as resultado
  from pg_class where relname in ('erp_sincronizacoes','erp_pedidos_itens') and relrowsecurity and relforcerowsecurity
union all
select 'Ninguém grava direto nas tabelas do ERP',
       case when count(*) = 0 then 'OK' else 'ATENÇÃO: ' || string_agg(relname, ', ') end
  from pg_class where relname like 'erp\_%' and relkind = 'r'
   and (has_table_privilege('authenticated', oid, 'insert') or has_table_privilege('authenticated', oid, 'update') or has_table_privilege('authenticated', oid, 'delete'))
union all
select 'Papel "integracao" aceito nos usuários',
       case when pg_get_constraintdef((select oid from pg_constraint where conname = 'perfis_papeis_check')) like '%integracao%' then 'OK' else 'ATENÇÃO' end
union all
select 'Robô não conta como usuário ativo',
       case when pg_get_functiondef('public.usuario_ativo()'::regprocedure) like '%integracao%' then 'OK' else 'ATENÇÃO' end
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
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.24.0') then 'OK (2.24.0)' else 'ATENÇÃO' end;
