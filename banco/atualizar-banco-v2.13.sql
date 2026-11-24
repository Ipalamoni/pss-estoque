-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.13 · PREFERÊNCIAS DE CADA PESSOA
-- (aplicar DEPOIS da v2.11; pode rodar de novo sem problema; não apaga dados)
--
--  Guarda as escolhas de cada pessoa nas telas (ex.: quais colunas aparecem em cada
--  relatório). Cada um lê e grava SÓ as próprias preferências; nada de dados da empresa.
-- =====================================================================

create table if not exists public.preferencias_usuario (
  id            bigint generated always as identity unique,
  usuario_id    uuid not null default auth.uid() references auth.users(id),
  chave         text not null check (chave ~ '^[a-z0-9_.-]{2,60}$'),
  valor         jsonb not null check (pg_column_size(valor) <= 8000),
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, chave)
);
alter table public.preferencias_usuario enable row level security;
alter table public.preferencias_usuario force row level security;
revoke all on public.preferencias_usuario from anon, authenticated;
grant select on public.preferencias_usuario to authenticated;
drop policy if exists proprio on public.preferencias_usuario;
create policy proprio on public.preferencias_usuario for select to authenticated using (usuario_id = auth.uid());

-- grava (ou apaga, com valor nulo = "voltar ao padrão") uma preferência da própria pessoa
create or replace function public.salvar_preferencia(p_chave text, p_valor jsonb)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.usuario_ativo() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_chave is null or p_chave !~ '^[a-z0-9_.-]{2,60}$' then raise exception 'Preferência inválida.'; end if;
  if p_valor is null then
    delete from public.preferencias_usuario where usuario_id = auth.uid() and chave = p_chave;
    return true;
  end if;
  if pg_column_size(p_valor) > 8000 then raise exception 'Preferência grande demais.'; end if;
  if (select count(*) from public.preferencias_usuario where usuario_id = auth.uid()) >= 200
     and not exists (select 1 from public.preferencias_usuario where usuario_id = auth.uid() and chave = p_chave) then
    raise exception 'Preferências demais para este usuário.';
  end if;
  insert into public.preferencias_usuario (usuario_id, chave, valor, atualizado_em)
  values (auth.uid(), p_chave, p_valor, now())
  on conflict (usuario_id, chave) do update set valor = excluded.valor, atualizado_em = now();
  return true;
end $$;
revoke execute on function public.salvar_preferencia(text, jsonb) from public, anon;
grant execute on function public.salvar_preferencia(text, jsonb) to authenticated;

insert into public.versao_banco (versao, descricao)
select '2.13.0', 'Preferências de cada pessoa (colunas visíveis nos relatórios)'
where not exists (select 1 from public.versao_banco where versao = '2.13.0');

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Tabela de preferências protegida (RLS)' as verificacao,
       case when (select relrowsecurity from pg_class where oid = 'public.preferencias_usuario'::regclass) then 'OK' else 'ATENÇÃO' end as resultado
union all
select 'Função nova só para quem tem login',
       case when not has_function_privilege('anon', 'public.salvar_preferencia(text, jsonb)', 'execute')
             and has_function_privilege('authenticated', 'public.salvar_preferencia(text, jsonb)', 'execute') then 'OK' else 'ATENÇÃO' end
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
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.13.0') then 'OK (2.13.0)' else 'ATENÇÃO' end;
