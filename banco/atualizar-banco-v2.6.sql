-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.6 · SEGURANÇA + TEMPO REAL
--
-- COMO APLICAR (uma vez só, leva poucos segundos):
--   Supabase › SQL Editor › New query › colar este arquivo inteiro › Run.
--   Pode rodar de novo sem problema. NÃO apaga nem altera nenhum dado: só reforça
--   as regras de acesso. No fim aparece uma CONFERÊNCIA: todas as linhas devem dizer "OK".
--
-- O QUE FAZ:
--  1. Ninguém sem login executa função nenhuma do sistema (antes elas recusavam lá dentro;
--     agora nem chegam a rodar).
--  2. Tabelas só podem ser LIDAS pelo app; gravar, apagar ou esvaziar só pelas funções
--     do sistema (que conferem o papel de quem pede). Sem login: nem leitura.
--  3. Funções com privilégio elevado: caminho de busca travado (public, pg_temp), boa
--     prática do PostgreSQL contra tabelas "falsas".
--  4. Tablet do padeiro (papel só "padeiro"): deixa de ler pedidos de compra, preços,
--     fornecedores, recebimentos, movimentações e o log de auditoria (não usa nenhum deles).
--  5. Anexos (nota fiscal das transferências): só PDF e fotos, conferidos pelo conteúdo
--     real do arquivo, com nome limpo. Bloqueia arquivo disfarçado (ex.: página web maliciosa).
--  6. Tempo real para pedidos, recebimentos e cadastros (mesmo conteúdo do tempo-real-v2.5.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 e 3. FUNÇÕES
-- ---------------------------------------------------------------------
do $$
declare f record; tinha boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure as assin, p.prosecdef
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f', 'p')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- não mexe em extensões
  loop
    tinha := has_function_privilege('authenticated', f.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', f.assin);
    -- quem é logado continua exatamente com o que já podia (nem mais, nem menos)
    if tinha and not has_function_privilege('authenticated', f.oid, 'execute') then
      execute format('grant execute on function %s to authenticated', f.assin);
    end if;
    if f.prosecdef then
      execute format('alter function %s set search_path = public, pg_temp', f.assin);
    end if;
  end loop;
end $$;
-- funções criadas no futuro também nascem fechadas para quem não tem login
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------
-- 2. TABELAS: app só lê; gravação só pelas funções do sistema
-- ---------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke select on all tables in schema public from anon;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;
alter default privileges in schema public revoke select on tables from anon;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. MENOR ACESSO PARA O TABLET DO PADEIRO
-- ---------------------------------------------------------------------
create or replace function public.so_padeiro()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.usuario_ativo() and public.meus_papeis() <@ array['padeiro']::text[]
$$;
revoke execute on function public.so_padeiro() from public, anon;
grant execute on function public.so_padeiro() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['pedidos', 'pedido_itens', 'recebimentos', 'fornecedores'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists leitura on public.%I', t);
      execute format('create policy leitura on public.%I for select to authenticated using ((public.acesso_amplo() and not public.so_padeiro()) or (public.usuario_ativo() and ''financeiro'' = any(public.meus_papeis())))', t);
    end if;
  end loop;
  foreach t in array array['auditoria', 'fichas_historico', 'movimentos'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists leitura on public.%I', t);
      execute format('create policy leitura on public.%I for select to authenticated using (public.acesso_amplo() and not public.so_padeiro())', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. ANEXOS: só PDF e fotos, conferidos pelos bytes do arquivo
-- ---------------------------------------------------------------------
create or replace function public._anexo_valido()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare b bytea; t text; c text;
begin
  c := regexp_replace(coalesce(new.conteudo, ''), '\s', '', 'g');
  if c = '' or length(c) > 4500000 then raise exception 'Anexo vazio ou muito grande (máximo ~3 MB).'; end if;
  begin
    b := decode(substr(c, 1, 24), 'base64');
  exception when others then
    raise exception 'Anexo recusado: arquivo corrompido.';
  end;
  t := case
    when substr(b, 1, 4) = '\x25504446'::bytea then 'application/pdf'                                   -- %PDF
    when substr(b, 1, 3) = '\xffd8ff'::bytea then 'image/jpeg'
    when substr(b, 1, 4) = '\x89504e47'::bytea then 'image/png'
    when substr(b, 1, 4) = '\x52494646'::bytea and substr(b, 9, 4) = '\x57454250'::bytea then 'image/webp' -- RIFF....WEBP
    when substr(b, 5, 4) = '\x66747970'::bytea then 'image/heic'                                        -- ....ftyp
    else null end;
  if t is null then raise exception 'Anexo recusado: envie a nota em PDF ou uma foto (JPG, PNG, WEBP ou HEIC).'; end if;
  new.conteudo := c;
  new.tipo := t;                                                            -- o tipo vem do conteúdo, nunca de quem enviou
  new.nome := left(regexp_replace(coalesce(nullif(btrim(new.nome), ''), 'anexo'), '[^[:alnum:] ._()-]', '_', 'g'), 120);
  return new;
end $$;
revoke execute on function public._anexo_valido() from public, anon, authenticated;
do $$
begin
  if to_regclass('public.anexos') is not null then
    execute 'drop trigger if exists valida on public.anexos';
    execute 'create trigger valida before insert or update on public.anexos for each row execute function public._anexo_valido()';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. TEMPO REAL (pedidos, recebimentos e cadastros)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['pedidos','pedido_itens','recebimentos','produtos','fornecedores','fichas_tecnicas','ficha_itens',
                             'parametros','perfis','locais','unidades','maceiras','operadores','linhas_producao']
    loop
      if to_regclass('public.' || t) is not null
         and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Funções que alguém SEM LOGIN pode executar' as verificacao,
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end as resultado
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Tabelas que alguém SEM LOGIN pode ler',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('anon', c.oid, 'select')
union all
select 'Tabelas que o app consegue gravar direto (sem as funções)',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
   and (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update')
        or has_table_privilege('authenticated', c.oid, 'delete') or has_table_privilege('authenticated', c.oid, 'truncate'))
union all
select 'Tabelas SEM proteção por linha (RLS)',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(c.relname, ', ') end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
union all
select 'Funções privilegiadas sem caminho de busca travado',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=public, pg_temp%', false);
