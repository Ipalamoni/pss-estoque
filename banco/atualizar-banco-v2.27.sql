-- =====================================================================
-- Artas · atualização do banco v2.27 · PRODUTOS COMERCIAIS (de-para com o NOME DA PRODUÇÃO) · idempotente
-- Contexto (decisão do dono, 27/11/2026): vários pães comerciais (marcas próprias e terceirizadas) saem da MESMA
-- massa. A produção (programação → pesagem → masseira → finalizar) usa só o NOME DA PRODUÇÃO, que é a ficha
-- técnica (uma ficha por massa, não por marca). O cadastro novo guarda cada pão COMERCIAL (código e nome do ERP)
-- e de qual massa ele sai, com o peso do pacote. Serve às próximas fases (pedidos × produção; embalagem).
-- Quem cadastra e edita: administrador e engenharia. Quem vê (e recebe o aviso): também o gestor da produção.
-- Nenhum dado existente é alterado ou apagado.
-- =====================================================================

-- 1. TABELA
create table if not exists public.produtos_comerciais (
  id              bigint generated always as identity primary key,
  codigo          text not null,                      -- código do produto no ERP (o que fatura)
  nome            text not null,                      -- nome comercial (como está no ERP)
  ficha_id        bigint references public.fichas_tecnicas(id),   -- NOME DA PRODUÇÃO (a massa de onde sai)
  peso_pacote_g   numeric(10,2),                      -- peso do pacote em gramas (para calcular pacotes por massa)
  observacao      text,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  criado_por      uuid references auth.users(id),
  atualizado_em   timestamptz,
  atualizado_por  uuid references auth.users(id),
  constraint produtos_comerciais_codigo_unico unique (codigo),
  constraint produtos_comerciais_codigo_tam check (char_length(codigo) between 1 and 30),
  constraint produtos_comerciais_nome_tam check (char_length(nome) between 2 and 150),
  constraint produtos_comerciais_peso check (peso_pacote_g is null or (peso_pacote_g > 0 and peso_pacote_g <= 100000)),
  constraint produtos_comerciais_obs_tam check (observacao is null or char_length(observacao) <= 500)
);
create index if not exists produtos_comerciais_ficha on public.produtos_comerciais (ficha_id);
comment on table public.produtos_comerciais is 'Pães comerciais (código/nome do ERP) e a massa (ficha técnica = nome da produção) de onde saem. v2.27';

-- 2. PERMISSÕES NOVAS: 'produto_comercial' = cadastrar/editar (admin, engenharia);
--    'produto_comercial_ver' = ver a lista e o aviso (admin, engenharia, gestor da produção)
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
    when 'produto_comercial'   then array['admin','engenharia']                     -- v2.27: cadastrar/editar
    when 'produto_comercial_ver' then array['admin','engenharia','gestor_producao']   -- v2.27: ver
    else array[]::text[] end)::text[], false)
$$;

-- 3. SEGURANÇA: RLS ligado e forçado; leitura só de quem tem a permissão; gravação só pela função
alter table public.produtos_comerciais enable row level security;
alter table public.produtos_comerciais force row level security;
revoke all on public.produtos_comerciais from public, anon, authenticated;
grant select on public.produtos_comerciais to authenticated;
drop policy if exists leitura on public.produtos_comerciais;
create policy leitura on public.produtos_comerciais for select to authenticated
  using (public.usuario_ativo() and public.pode('produto_comercial_ver'));

-- 4. NOME COMERCIAL: fica como no ERP (tem marcas e nomes próprios: "Gold Boys", "João"), só sem espaços sobrando.
--    (Exceção à regra de nomes: o nome da PRODUÇÃO é a ficha técnica, que continua padronizada.)
create or replace function public._padrao_produto_comercial()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.codigo := btrim(new.codigo);
  new.nome := regexp_replace(btrim(new.nome), '\s+', ' ', 'g');
  return new;
end $$;
revoke execute on function public._padrao_produto_comercial() from public, anon, authenticated;
drop trigger if exists padronizar_nomes on public.produtos_comerciais;
create trigger padronizar_nomes before insert or update on public.produtos_comerciais
  for each row execute function public._padrao_produto_comercial();

-- 5. AUDITORIA (tudo que muda fica registrado)
drop trigger if exists aud on public.produtos_comerciais;
create trigger aud after insert or update or delete on public.produtos_comerciais
  for each row execute function public.auditar();

-- 6. SALVAR (criar ou alterar). Não há exclusão: desativa (ativo = false).
create or replace function public.salvar_produto_comercial(p jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint := nullif(p->>'id', '')::bigint;
        v_cod text := btrim(coalesce(p->>'codigo', ''));
        v_nome text := btrim(coalesce(p->>'nome', ''));
        v_ficha bigint := nullif(p->>'ficha_id', '')::bigint;
        v_peso numeric := nullif(p->>'peso_pacote_g', '')::numeric;
        v_obs text := nullif(btrim(coalesce(p->>'observacao', '')), '');
begin
  perform public._exigir('produto_comercial');
  if jsonb_typeof(p) <> 'object' then raise exception 'Dados inválidos.'; end if;
  if v_cod = '' then raise exception 'Informe o código do produto no ERP.'; end if;
  if char_length(v_cod) > 30 then raise exception 'Código muito longo (máximo 30).'; end if;
  if char_length(v_nome) < 2 then raise exception 'Informe o nome comercial.'; end if;
  if char_length(v_nome) > 150 then raise exception 'Nome comercial muito longo (máximo 150).'; end if;
  if v_peso is not null and (v_peso <= 0 or v_peso > 100000) then raise exception 'Peso do pacote inválido (em gramas).'; end if;
  if v_obs is not null and char_length(v_obs) > 500 then raise exception 'Observação muito longa (máximo 500).'; end if;
  if v_ficha is not null and not exists (select 1 from public.fichas_tecnicas where id = v_ficha) then
    raise exception 'Nome da produção não encontrado.';
  end if;
  if exists (select 1 from public.produtos_comerciais where codigo = v_cod and id is distinct from v_id) then
    raise exception 'Já existe um produto comercial com o código %.', v_cod;
  end if;
  if v_id is null then
    insert into public.produtos_comerciais (codigo, nome, ficha_id, peso_pacote_g, observacao, ativo, criado_por)
    values (v_cod, v_nome, v_ficha, v_peso, v_obs, coalesce((p->>'ativo')::boolean, true), auth.uid())
    returning id into v_id;
  else
    update public.produtos_comerciais
       set codigo = v_cod, nome = v_nome, ficha_id = v_ficha, peso_pacote_g = v_peso, observacao = v_obs,
           ativo = coalesce((p->>'ativo')::boolean, ativo), atualizado_em = now(), atualizado_por = auth.uid()
     where id = v_id;
    if not found then raise exception 'Produto comercial não encontrado.'; end if;
  end if;
  return v_id;
end $$;
revoke execute on function public.salvar_produto_comercial(jsonb) from public, anon;
grant execute on function public.salvar_produto_comercial(jsonb) to authenticated;

-- 7. SUGESTÕES DO ERP: produtos que já vieram nos pedidos e ainda não estão cadastrados
--    (só código, nome e grupo; nada de cliente ou valor). Evita digitar o código errado.
create or replace function public.produtos_comerciais_do_erp()
returns table (codigo text, nome text, grupo text, ultima_venda date)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._exigir('produto_comercial');
  return query
  select e.produto_codigo::text, max(e.produto_nome)::text, max(e.grupo_nome)::text, max(e.data_venda)
    from public.erp_pedidos_itens e
   where coalesce(e.produto_codigo, '') <> ''
     and not exists (select 1 from public.produtos_comerciais c where c.codigo = e.produto_codigo)
   group by e.produto_codigo
   order by max(e.produto_nome);
end $$;
revoke execute on function public.produtos_comerciais_do_erp() from public, anon;
grant execute on function public.produtos_comerciais_do_erp() to authenticated;

insert into public.versao_banco (versao, descricao)
values ('2.27.0', 'Produtos comerciais: de-para com o nome da produção (ficha técnica)')
on conflict (versao) do nothing;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Tabela de produtos comerciais protegida (RLS)' as verificacao,
       case when exists (select 1 from pg_class where relname = 'produtos_comerciais' and relrowsecurity and relforcerowsecurity) then 'OK' else 'ATENÇÃO' end as resultado
union all
select 'Produtos comerciais: ninguém grava direto na tabela',
       case when has_table_privilege('authenticated', 'public.produtos_comerciais', 'insert') or has_table_privilege('authenticated', 'public.produtos_comerciais', 'update')
              or has_table_privilege('authenticated', 'public.produtos_comerciais', 'delete') or has_table_privilege('anon', 'public.produtos_comerciais', 'select')
            then 'ATENÇÃO' else 'OK' end
union all
select 'Produtos comerciais: editar só admin e engenharia; ver também o gestor da produção',
       case when pg_get_functiondef('public.pode(text)'::regprocedure) like '%''produto_comercial''   then array[''admin'',''engenharia'']  %'
             and pg_get_functiondef('public.pode(text)'::regprocedure) like '%''produto_comercial_ver'' then array[''admin'',''engenharia'',''gestor_producao'']%' then 'OK' else 'ATENÇÃO' end
union all
select 'Auditoria e nomes padronizados nos produtos comerciais',
       case when (select count(*) from pg_trigger where tgrelid = 'public.produtos_comerciais'::regclass and tgname in ('aud','padronizar_nomes')) = 2 then 'OK (2)' else 'ATENÇÃO' end
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.27.0') then 'OK (2.27.0)' else 'ATENÇÃO' end;
