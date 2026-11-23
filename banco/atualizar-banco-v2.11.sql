-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.11 · PRÉ-CADASTRO NO RECEBIMENTO
-- (aplicar DEPOIS da v2.10; pode rodar de novo sem problema; não apaga dados)
--
--  1. Recebimento SEM pedido: quem recebe pode fazer o PRÉ-CADASTRO de um fornecedor
--     (só a razão social) e de um produto (nome curto + unidade + tipo), na hora.
--  2. O pré-cadastro fica marcado até o COMPRADOR abrir e salvar o cadastro
--     (aí sai do sininho dele). Fica registrado quem pré-cadastrou e quem revisou.
--  3. Recebimento sem pedido exige fornecedor e número da nota fiscal (vale no banco).
--  4. Sininho por responsável: cada pessoa marca o que já viu (tabela sininho_vistos, só dela).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MARCAS DE PRÉ-CADASTRO
-- ---------------------------------------------------------------------
alter table public.produtos     add column if not exists pre_cadastro     boolean not null default false;
alter table public.produtos     add column if not exists pre_cadastro_por uuid references auth.users(id);
alter table public.produtos     add column if not exists pre_cadastro_em  timestamptz;
alter table public.produtos     add column if not exists revisado_por     uuid references auth.users(id);
alter table public.produtos     add column if not exists revisado_em      timestamptz;
alter table public.fornecedores add column if not exists pre_cadastro     boolean not null default false;
alter table public.fornecedores add column if not exists pre_cadastro_por uuid references auth.users(id);
alter table public.fornecedores add column if not exists pre_cadastro_em  timestamptz;
alter table public.fornecedores add column if not exists revisado_por     uuid references auth.users(id);
alter table public.fornecedores add column if not exists revisado_em      timestamptz;
create index if not exists produtos_pre_cadastro on public.produtos (id) where pre_cadastro;
create index if not exists fornecedores_pre_cadastro on public.fornecedores (id) where pre_cadastro;

-- ---------------------------------------------------------------------
-- 2. PRÉ-CADASTRAR (quem recebe mercadoria: admin, almoxarifado, recebimento)
-- ---------------------------------------------------------------------
create or replace function public.pre_cadastrar_fornecedor(p jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_nome text := btrim(regexp_replace(coalesce(p->>'nome', ''), '\s+', ' ', 'g')); v_id bigint;
begin
  perform public._exigir('recebimento');
  if length(v_nome) < 3 or length(v_nome) > 150 then raise exception 'Escreva a razão social do fornecedor (de 3 a 150 letras).'; end if;
  -- já existe com esse nome? usa o mesmo (não duplica)
  select id into v_id from public.fornecedores
   where lower(nome) = lower(v_nome) or lower(coalesce(razao_social, '')) = lower(v_nome) order by ativo desc, id limit 1;
  if v_id is not null then
    update public.fornecedores set ativo = true where id = v_id and not ativo;
    return v_id;
  end if;
  insert into public.fornecedores (nome, razao_social, observacao, ativo, pre_cadastro, pre_cadastro_por, pre_cadastro_em)
  values (v_nome, v_nome, 'Pré-cadastro feito no recebimento. O comprador precisa completar (CNPJ, contato, condição de pagamento).',
          true, true, auth.uid(), now())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.pre_cadastrar_fornecedor(jsonb) from public, anon;
grant execute on function public.pre_cadastrar_fornecedor(jsonb) to authenticated;

create or replace function public.pre_cadastrar_produto(p jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_desc text := btrim(regexp_replace(coalesce(p->>'descricao', ''), '\s+', ' ', 'g'));
        v_un text := btrim(coalesce(p->>'unidade', '')); v_cat text := coalesce(nullif(btrim(p->>'categoria'), ''), 'outros');
        v_id bigint; v_cod text; v_n bigint;
begin
  perform public._exigir('recebimento');
  if length(v_desc) < 3 or length(v_desc) > 80 then raise exception 'Escreva um nome curto para o produto (de 3 a 80 letras). Ex.: Caneta azul.'; end if;
  if v_un not in ('kg','g','L','mL','un','m','cx','pct','rolo','par') then raise exception 'Escolha a unidade (kg, g, L, mL, un, m, cx, pct, rolo ou par).'; end if;
  if v_cat not in ('materia_prima','embalagem','escritorio','limpeza','outros') then raise exception 'Tipo de produto inválido.'; end if;
  -- já existe um produto ativo com esse nome? usa o mesmo (não duplica)
  select id into v_id from public.produtos where lower(descricao) = lower(v_desc) and ativo order by id limit 1;
  if v_id is not null then return v_id; end if;
  select coalesce(max(id), 0) + 1 into v_n from public.produtos;
  loop
    v_cod := 'PRE-' || lpad(v_n::text, 5, '0');
    exit when not exists (select 1 from public.produtos where codigo = v_cod);
    v_n := v_n + 1;
  end loop;
  insert into public.produtos (codigo, descricao, categoria, unidade_estoque, controla_estoque, baixa_producao, baixa_requisicao, observacao, ativo,
                               pre_cadastro, pre_cadastro_por, pre_cadastro_em)
  values (v_cod, v_desc, v_cat, v_un, true, false, true,
          'Pré-cadastro feito no recebimento. O comprador precisa completar (grupo, unidade de compra, mínimo, fornecedor).', true,
          true, auth.uid(), now())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.pre_cadastrar_produto(jsonb) from public, anon;
grant execute on function public.pre_cadastrar_produto(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. O COMPRADOR SALVOU O CADASTRO → deixa de ser pré-cadastro
--    (movimento de estoque — saldo/custo — não conta como revisão)
-- ---------------------------------------------------------------------
create or replace function public._revisar_pre_produto()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.pre_cadastro and new.pre_cadastro and public.pode('cadastro_produto')
     and new.saldo is not distinct from old.saldo and new.custo_medio is not distinct from old.custo_medio then
    new.pre_cadastro := false; new.revisado_por := auth.uid(); new.revisado_em := now();
  end if;
  return new;
end $$;
revoke execute on function public._revisar_pre_produto() from public, anon, authenticated;
drop trigger if exists revisar_pre_cadastro on public.produtos;
create trigger revisar_pre_cadastro before update on public.produtos for each row execute function public._revisar_pre_produto();

create or replace function public._revisar_pre_fornecedor()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.pre_cadastro and new.pre_cadastro and public.pode('cadastro_fornecedor') then
    new.pre_cadastro := false; new.revisado_por := auth.uid(); new.revisado_em := now();
  end if;
  return new;
end $$;
revoke execute on function public._revisar_pre_fornecedor() from public, anon, authenticated;
drop trigger if exists revisar_pre_cadastro on public.fornecedores;
create trigger revisar_pre_cadastro before update on public.fornecedores for each row execute function public._revisar_pre_fornecedor();

-- ---------------------------------------------------------------------
-- 4. RECEBIMENTO SEM PEDIDO: fornecedor e nota fiscal obrigatórios
-- ---------------------------------------------------------------------
create or replace function public._recebimento_sem_pedido_ok()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.pedido_id is null then
    if new.fornecedor_id is null then raise exception 'Escolha o fornecedor (se não estiver cadastrado, toque no + para o pré-cadastro).'; end if;
    if nullif(btrim(coalesce(new.nota_fiscal, '')), '') is null then raise exception 'Informe o número da nota fiscal.'; end if;
  end if;
  if new.nota_fiscal is not null and length(new.nota_fiscal) > 60 then raise exception 'Número da nota fiscal muito longo.'; end if;
  return new;
end $$;
revoke execute on function public._recebimento_sem_pedido_ok() from public, anon, authenticated;
drop trigger if exists sem_pedido_ok on public.recebimentos;
create trigger sem_pedido_ok before insert on public.recebimentos for each row execute function public._recebimento_sem_pedido_ok();

-- ---------------------------------------------------------------------
-- 5. SININHO: o que cada pessoa já viu (avisos só informativos, ex.: "mercadoria recebida")
--    Cada um lê e grava só os próprios registros.
-- ---------------------------------------------------------------------
create table if not exists public.sininho_vistos (
  id         bigint generated always as identity unique,
  usuario_id uuid not null default auth.uid() references auth.users(id),
  chave      text not null check (chave ~ '^[a-z_]{2,20}:[0-9]{1,18}$'),
  visto_em   timestamptz not null default now(),
  primary key (usuario_id, chave)
);
alter table public.sininho_vistos enable row level security;
alter table public.sininho_vistos force row level security;
revoke all on public.sininho_vistos from anon, authenticated;
grant select on public.sininho_vistos to authenticated;
drop policy if exists proprio on public.sininho_vistos;
create policy proprio on public.sininho_vistos for select to authenticated using (usuario_id = auth.uid());

create or replace function public.marcar_vistos(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  if auth.uid() is null or not public.usuario_ativo() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p, 'null'::jsonb)) <> 'array' or jsonb_array_length(p) > 300 then raise exception 'Lista inválida.'; end if;
  insert into public.sininho_vistos (usuario_id, chave)
  select auth.uid(), x from jsonb_array_elements_text(p) x where x ~ '^[a-z_]{2,20}:[0-9]{1,18}$'
  on conflict do nothing;
  get diagnostics v_n = row_count;
  delete from public.sininho_vistos where usuario_id = auth.uid() and visto_em < now() - interval '120 days';   -- não acumula
  return v_n;
end $$;
revoke execute on function public.marcar_vistos(jsonb) from public, anon;
grant execute on function public.marcar_vistos(jsonb) to authenticated;

insert into public.versao_banco (versao, descricao)
select '2.11.0', 'Pré-cadastro no recebimento sem pedido (comprador revisa) e sininho por responsável'
where not exists (select 1 from public.versao_banco where versao = '2.11.0');

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Pré-cadastro em produtos e fornecedores' as verificacao,
       case when (select count(*) from information_schema.columns where table_name in ('produtos','fornecedores') and column_name = 'pre_cadastro') = 2
            then 'OK' else 'ATENÇÃO' end as resultado
union all
select 'Revisão do comprador ligada', case when (select count(*) from pg_trigger where tgname = 'revisar_pre_cadastro') = 2 then 'OK' else 'ATENÇÃO' end
union all
select 'Sem pedido exige fornecedor e nota', case when exists (select 1 from pg_trigger where tgname = 'sem_pedido_ok') then 'OK' else 'ATENÇÃO' end
union all
select 'Funções novas só para quem tem login',
       case when count(*) = 3 then 'OK' else 'ATENÇÃO' end
  from pg_proc p where p.proname in ('pre_cadastrar_fornecedor','pre_cadastrar_produto','marcar_vistos')
   and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute')
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
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.11.0') then 'OK (2.11.0)' else 'ATENÇÃO' end;
