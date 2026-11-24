-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.17 · CIDADES E PESSOAS COM CADA PALAVRA MAIÚSCULA
-- (aplicar DEPOIS da v2.16; pode rodar de novo sem problema; não apaga dados)
--
--  Cidades, bairros, endereços, nomes de pessoas (usuários, padeiros, contato) e nome fantasia do
--  fornecedor: PRIMEIRA LETRA DE CADA PALAVRA maiúscula; palavras de ligação (de, da, do, das, dos, e,
--  com, para, em) ficam minúsculas, menos quando começam o nome.
--    ex.: "RIBEIRÃO PRETO" → "Ribeirão Preto" · "maria da silva" → "Maria da Silva"
--  Produtos, funções, locais, fichas etc. continuam com só a 1ª letra maiúscula (v2.16).
--  Razão social e UF continuam TODAS MAIÚSCULAS. Cada troca fica na auditoria.
-- =====================================================================

create or replace function public.nome_titulo(t text)
returns text language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  partes text[]; p text; i int; r text := ''; sg text;
  ligacao constant text[] := array['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'em', 'na', 'no', 'nas', 'nos', 'a', 'o', 'c/', 'p/'];
begin
  if t is null then return null; end if;
  t := btrim(regexp_replace(t, '\s+', ' ', 'g'));
  if t = '' then return ''; end if;
  partes := string_to_array(lower(t), ' ');
  for i in 1 .. array_length(partes, 1) loop
    p := partes[i];
    if i > 1 and p = any (ligacao) then
      r := r || ' ' || p;
    else
      r := r || case when i > 1 then ' ' else '' end || upper(left(p, 1)) || substr(p, 2);
    end if;
  end loop;
  foreach sg in array array['PCP', 'PSS', 'PVC', 'UHT', 'BOPP', 'PEAD', 'PEBD', 'CNPJ', 'CPF', 'LTDA', 'EPI'] loop
    r := regexp_replace(r, '\m' || sg || '\M', sg, 'gi');
  end loop;
  return r;
end $$;
revoke execute on function public.nome_titulo(text) from public, anon, authenticated;

create or replace function public._padrao_fornecedor()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_titulo(new.nome);
  new.razao_social := public.nome_maiusculo(new.razao_social);
  new.contato := public.nome_titulo(new.contato);
  new.endereco := public.nome_titulo(new.endereco);
  new.bairro := public.nome_titulo(new.bairro);
  new.cidade := public.nome_titulo(new.cidade);
  new.uf := public.nome_maiusculo(new.uf);
  return new;
end $$;

create or replace function public._padrao_perfil()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_titulo(new.nome);        -- pessoa
  new.funcao := public.nome_padrao(new.funcao);     -- função: só a 1ª letra
  return new;
end $$;

create or replace function public._padrao_unidade()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_padrao(new.nome);
  new.cidade := public.nome_titulo(new.cidade);
  return new;
end $$;

-- padeiros/operadores: nome de pessoa
create or replace function public._padrao_pessoa()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.nome := public.nome_titulo(new.nome);
  return new;
end $$;
revoke execute on function public._padrao_fornecedor() from public, anon, authenticated;
revoke execute on function public._padrao_perfil() from public, anon, authenticated;
revoke execute on function public._padrao_unidade() from public, anon, authenticated;
revoke execute on function public._padrao_pessoa() from public, anon, authenticated;

drop trigger if exists padronizar_nomes on public.operadores;
create trigger padronizar_nomes before insert or update on public.operadores for each row execute function public._padrao_pessoa();

-- arruma os que já existem (só as linhas que mudam)
update public.fornecedores set nome = nome
 where nome is distinct from public.nome_titulo(nome) or contato is distinct from public.nome_titulo(contato)
    or endereco is distinct from public.nome_titulo(endereco) or bairro is distinct from public.nome_titulo(bairro)
    or cidade is distinct from public.nome_titulo(cidade);
update public.perfis set nome = nome where nome is distinct from public.nome_titulo(nome);
update public.unidades set cidade = cidade where cidade is distinct from public.nome_titulo(cidade);
update public.operadores set nome = nome where nome is distinct from public.nome_titulo(nome);

insert into public.versao_banco (versao, descricao)
values ('2.17.0', 'Cidades, endereços e nomes de pessoas/fornecedores com cada palavra maiúscula')
on conflict (versao) do nothing;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Cidades e nomes de pessoas fora do padrão' as verificacao,
       case when n = 0 then 'OK (nenhum)' else 'ATENÇÃO: ' || n end as resultado
  from (select (select count(*) from public.fornecedores where nome is distinct from public.nome_titulo(nome) or cidade is distinct from public.nome_titulo(cidade))
             + (select count(*) from public.perfis where nome is distinct from public.nome_titulo(nome) or funcao is distinct from public.nome_padrao(funcao))
             + (select count(*) from public.operadores where nome is distinct from public.nome_titulo(nome))
             + (select count(*) from public.produtos where descricao is distinct from public.nome_padrao(descricao)) as n) x
union all
select 'Teste: ribeirão preto / maria da silva',
       case when public.nome_titulo('RIBEIRÃO PRETO') = 'Ribeirão Preto' and public.nome_titulo('maria DA silva') = 'Maria da Silva'
                 and public.nome_titulo('são pedro do turvo') = 'São Pedro do Turvo' then 'OK' else 'ATENÇÃO' end
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.17.0') then 'OK (2.17.0)' else 'ATENÇÃO' end;
