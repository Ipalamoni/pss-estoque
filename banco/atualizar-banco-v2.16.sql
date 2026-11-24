-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.16 · PADRÃO DOS NOMES NOS CADASTROS
-- (aplicar DEPOIS da v2.13; pode rodar de novo sem problema; não apaga dados)
--
--  Todo nome de cadastro fica com a PRIMEIRA LETRA MAIÚSCULA e o resto minúsculo
--  (ex.: "FARINHA DE SOJA" → "Farinha de soja"); espaços repetidos viram um só.
--  Só a RAZÃO SOCIAL (e a UF) ficam TODAS MAIÚSCULAS.
--  Vale para qualquer origem: tela, importação de planilha, pré-cadastro no recebimento.
--  Os nomes que já existem são arrumados agora; cada troca fica na auditoria (com o nome antigo).
-- =====================================================================

-- primeira letra maiúscula, resto minúsculo, sem espaços sobrando.
-- Siglas conhecidas continuam maiúsculas (ex.: PCP, PSS, PVC, UHT, BOPP).
create or replace function public.nome_padrao(t text)
returns text language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  s text; sg text;
begin
  if t is null then return null; end if;
  s := btrim(regexp_replace(t, '\s+', ' ', 'g'));
  if s = '' then return ''; end if;
  s := upper(left(s, 1)) || lower(substr(s, 2));
  foreach sg in array array['PCP', 'PSS', 'PVC', 'UHT', 'BOPP', 'PEAD', 'PEBD', 'CNPJ', 'CPF', 'LTDA', 'EPI'] loop
    s := regexp_replace(s, '\m' || sg || '\M', sg, 'gi');
  end loop;
  return s;
end $$;
-- tudo maiúsculo (razão social, UF)
create or replace function public.nome_maiusculo(t text)
returns text language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when t is null then null else upper(btrim(regexp_replace(t, '\s+', ' ', 'g'))) end
$$;
revoke execute on function public.nome_padrao(text) from public, anon, authenticated;
revoke execute on function public.nome_maiusculo(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- gatilhos: arrumam o nome ANTES de gravar (inserir ou alterar)
-- ---------------------------------------------------------------------
create or replace function public._padrao_produto()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.descricao := public.nome_padrao(new.descricao);
  new.grupo := public.nome_padrao(new.grupo);
  new.marca := public.nome_padrao(new.marca);
  return new;
end $$;

create or replace function public._padrao_fornecedor()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_padrao(new.nome);
  new.razao_social := public.nome_maiusculo(new.razao_social);
  new.contato := public.nome_padrao(new.contato);
  new.endereco := public.nome_padrao(new.endereco);
  new.bairro := public.nome_padrao(new.bairro);
  new.cidade := public.nome_padrao(new.cidade);
  new.uf := public.nome_maiusculo(new.uf);
  return new;
end $$;

create or replace function public._padrao_perfil()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_padrao(new.nome);
  new.funcao := public.nome_padrao(new.funcao);
  return new;
end $$;

create or replace function public._padrao_ficha()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_padrao(new.nome);
  new.produto_final := public.nome_padrao(new.produto_final);
  return new;
end $$;

create or replace function public._padrao_unidade()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_padrao(new.nome);
  new.cidade := public.nome_padrao(new.cidade);
  return new;
end $$;

-- operadores (padeiros), locais, linhas de produção e masseiras: só o nome
create or replace function public._padrao_so_nome()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_padrao(new.nome);
  return new;
end $$;

revoke execute on function public._padrao_produto() from public, anon, authenticated;
revoke execute on function public._padrao_fornecedor() from public, anon, authenticated;
revoke execute on function public._padrao_perfil() from public, anon, authenticated;
revoke execute on function public._padrao_ficha() from public, anon, authenticated;
revoke execute on function public._padrao_unidade() from public, anon, authenticated;
revoke execute on function public._padrao_so_nome() from public, anon, authenticated;

drop trigger if exists padronizar_nomes on public.produtos;
create trigger padronizar_nomes before insert or update on public.produtos for each row execute function public._padrao_produto();
drop trigger if exists padronizar_nomes on public.fornecedores;
create trigger padronizar_nomes before insert or update on public.fornecedores for each row execute function public._padrao_fornecedor();
drop trigger if exists padronizar_nomes on public.perfis;
create trigger padronizar_nomes before insert or update on public.perfis for each row execute function public._padrao_perfil();
drop trigger if exists padronizar_nomes on public.fichas_tecnicas;
create trigger padronizar_nomes before insert or update on public.fichas_tecnicas for each row execute function public._padrao_ficha();
drop trigger if exists padronizar_nomes on public.unidades;
create trigger padronizar_nomes before insert or update on public.unidades for each row execute function public._padrao_unidade();
drop trigger if exists padronizar_nomes on public.operadores;
create trigger padronizar_nomes before insert or update on public.operadores for each row execute function public._padrao_so_nome();
drop trigger if exists padronizar_nomes on public.locais;
create trigger padronizar_nomes before insert or update on public.locais for each row execute function public._padrao_so_nome();
drop trigger if exists padronizar_nomes on public.linhas_producao;
create trigger padronizar_nomes before insert or update on public.linhas_producao for each row execute function public._padrao_so_nome();
drop trigger if exists padronizar_nomes on public.maceiras;
create trigger padronizar_nomes before insert or update on public.maceiras for each row execute function public._padrao_so_nome();

-- ---------------------------------------------------------------------
-- arruma os nomes que já existem (só as linhas que mudam; o gatilho faz o trabalho)
-- ---------------------------------------------------------------------
update public.produtos set descricao = descricao
 where descricao is distinct from public.nome_padrao(descricao) or grupo is distinct from public.nome_padrao(grupo)
    or marca is distinct from public.nome_padrao(marca);
update public.fornecedores set nome = nome
 where nome is distinct from public.nome_padrao(nome) or razao_social is distinct from public.nome_maiusculo(razao_social)
    or contato is distinct from public.nome_padrao(contato) or endereco is distinct from public.nome_padrao(endereco)
    or bairro is distinct from public.nome_padrao(bairro) or cidade is distinct from public.nome_padrao(cidade)
    or uf is distinct from public.nome_maiusculo(uf);
update public.perfis set nome = nome
 where nome is distinct from public.nome_padrao(nome) or funcao is distinct from public.nome_padrao(funcao);
update public.fichas_tecnicas set nome = nome
 where nome is distinct from public.nome_padrao(nome) or produto_final is distinct from public.nome_padrao(produto_final);
update public.unidades set nome = nome
 where nome is distinct from public.nome_padrao(nome) or cidade is distinct from public.nome_padrao(cidade);
update public.operadores set nome = nome where nome is distinct from public.nome_padrao(nome);
update public.locais set nome = nome where nome is distinct from public.nome_padrao(nome);
update public.linhas_producao set nome = nome where nome is distinct from public.nome_padrao(nome);
update public.maceiras set nome = nome where nome is distinct from public.nome_padrao(nome);

insert into public.versao_banco (versao, descricao)
values ('2.16.0', 'Padrão dos nomes nos cadastros (1ª letra maiúscula; razão social toda maiúscula)')
on conflict (versao) do nothing;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Nomes fora do padrão (todos os cadastros)' as verificacao,
       case when n = 0 then 'OK (nenhum)' else 'ATENÇÃO: ' || n end as resultado
  from (select (select count(*) from public.produtos where descricao is distinct from public.nome_padrao(descricao) or grupo is distinct from public.nome_padrao(grupo) or marca is distinct from public.nome_padrao(marca))
             + (select count(*) from public.fornecedores where nome is distinct from public.nome_padrao(nome) or razao_social is distinct from public.nome_maiusculo(razao_social) or cidade is distinct from public.nome_padrao(cidade))
             + (select count(*) from public.perfis where nome is distinct from public.nome_padrao(nome) or funcao is distinct from public.nome_padrao(funcao))
             + (select count(*) from public.fichas_tecnicas where nome is distinct from public.nome_padrao(nome))
             + (select count(*) from public.operadores where nome is distinct from public.nome_padrao(nome))
             + (select count(*) from public.locais where nome is distinct from public.nome_padrao(nome))
             + (select count(*) from public.maceiras where nome is distinct from public.nome_padrao(nome)) as n) x
union all
select 'Gatilhos de padrão nos 9 cadastros',
       case when count(*) = 9 then 'OK (9)' else 'ATENÇÃO: ' || count(*) end
  from pg_trigger where tgname = 'padronizar_nomes' and not tgisinternal
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
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.16.0') then 'OK (2.16.0)' else 'ATENÇÃO' end;
