-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.7 · PRODUÇÃO
-- (aplicar DEPOIS da v2.6; pode rodar de novo sem problema; não apaga dados)
--
--  1. Papel "Gestor da produção" (gestor_producao): mesmas permissões de produção da
--     engenharia (programar, mudar masseira/ordem, finalizar e corrigir bateladas).
--  2. Avisos de mudança na programação para o tablet: criados AUTOMATICAMENTE quando a
--     ordem, a masseira, a quantidade muda, entra produção nova ou uma sai (só a do dia).
--     O padeiro confirma com nome + senha ("ciente"). Recado manual do engenheiro também.
--  3. Batelada iniciada "fora da nova ordem": marcada automaticamente (não trava nada).
--  4. Correções de batelada (trocar masseira / trocar padeiro) só por engenharia, gestor
--     da produção ou admin, com motivo obrigatório; nada é apagado (fica antes/depois).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PAPEL "GESTOR DA PRODUÇÃO"
-- ---------------------------------------------------------------------
alter table public.perfis drop constraint if exists perfis_papeis_check;
alter table public.perfis add constraint perfis_papeis_check check (papeis <@ array['admin','comprador','almoxarifado','recebimento',
  'pesagem','engenharia','diretoria','financeiro','faturamento','padeiro','gestor_producao']::text[]);

create or replace function public.acesso_amplo()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.usuario_ativo() and public.meus_papeis() &&
         array['admin','comprador','almoxarifado','recebimento','pesagem','engenharia','diretoria','padeiro','gestor_producao']::text[]
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
    else array[]::text[] end)::text[], false)
$$;

-- ---------------------------------------------------------------------
-- 2. AVISOS DE MUDANÇA NA PROGRAMAÇÃO (tablet da produção)
-- ---------------------------------------------------------------------
create table if not exists public.avisos_producao (
  id                 bigint generated always as identity primary key,
  criado_em          timestamptz not null default now(),
  criado_por         uuid references auth.users(id) default auth.uid(),
  maceira_id         bigint references public.maceiras(id),
  programacao_id     bigint references public.programacoes(id),
  tipo               text not null check (tipo in ('ordem','masseira','nova','retirada','quantidade','recado')),
  texto              text not null check (length(texto) between 1 and 500),
  ciente_em          timestamptz,
  ciente_operador_id bigint references public.operadores(id),
  ciente_por         uuid references auth.users(id)
);
create index if not exists avisos_producao_pendentes on public.avisos_producao (maceira_id) where ciente_em is null;
create index if not exists avisos_producao_data on public.avisos_producao (criado_em);
alter table public.avisos_producao enable row level security;
alter table public.avisos_producao force row level security;
revoke all on public.avisos_producao from anon, authenticated;
grant select on public.avisos_producao to authenticated;
drop policy if exists leitura on public.avisos_producao;
create policy leitura on public.avisos_producao for select to authenticated using (public.acesso_amplo());

-- texto curto e simples ("Pão de forma: passou de 2º para 1º.")
create or replace function public._aviso_programacao()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ficha text; v_mac_old text; v_mac_new text; v_q text;
begin
  if new.data is distinct from public._hoje() then return new; end if;              -- só a produção do dia
  select nome into v_ficha from public.fichas_tecnicas where id = new.ficha_id;
  v_q := trim(to_char(new.quantidade, 'FM999990.##')); v_q := rtrim(v_q, '.');
  if tg_op = 'INSERT' then
    if new.situacao = 'ativa' and new.maceira_id is not null then
      insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (new.maceira_id, new.id, 'nova',
        format('NOVA produção: %s, %s bateladas, em %sº lugar.', v_ficha, v_q, coalesce(new.prioridade::text, '?')));
    end if;
    return new;
  end if;
  if new.finalizada_em is not null and old.finalizada_em is null then return new; end if;   -- finalização não é mudança
  if new.situacao = 'cancelada' and old.situacao is distinct from 'cancelada' then
    if old.maceira_id is not null then
      insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (old.maceira_id, new.id, 'retirada',
        format('CANCELADA: %s não é mais para fazer.', v_ficha));
    end if;
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
  if new.maceira_id is not null and new.prioridade is distinct from old.prioridade then
    insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (new.maceira_id, new.id, 'ordem',
      format('ORDEM mudou: %s passou de %sº para %sº.', v_ficha, coalesce(old.prioridade::text, '?'), coalesce(new.prioridade::text, '?')));
  end if;
  if new.maceira_id is not null and new.quantidade is distinct from old.quantidade then
    insert into public.avisos_producao (maceira_id, programacao_id, tipo, texto) values (new.maceira_id, new.id, 'quantidade',
      format('QUANTIDADE mudou: %s agora são %s bateladas (antes %s).', v_ficha, v_q, rtrim(trim(to_char(old.quantidade, 'FM999990.##')), '.')));
  end if;
  return new;
end $$;
revoke execute on function public._aviso_programacao() from public, anon, authenticated;
drop trigger if exists aviso_tablet on public.programacoes;
create trigger aviso_tablet after insert or update on public.programacoes for each row execute function public._aviso_programacao();

-- recado manual do engenheiro / gestor para a masseira
create or replace function public.enviar_recado_producao(p_maceira bigint, p_texto text)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_t text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  perform public._exigir('programacao');
  if v_t is null then raise exception 'Escreva o recado.'; end if;
  if length(v_t) > 300 then raise exception 'Recado muito longo (máximo 300 letras).'; end if;
  if not exists (select 1 from public.maceiras where id = p_maceira) then raise exception 'Escolha a masseira.'; end if;
  insert into public.avisos_producao (maceira_id, tipo, texto) values (p_maceira, 'recado', 'RECADO: ' || v_t) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.enviar_recado_producao(bigint, text) from public, anon;
grant execute on function public.enviar_recado_producao(bigint, text) to authenticated;

-- o padeiro confirma que viu (nome + senha): fica registrado quem e quando
create or replace function public.confirmar_avisos_producao(p jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_oper bigint := (p->>'operador_id')::bigint; v_n int;
begin
  perform public._exigir('batelada');
  if v_oper is null then raise exception 'Escolha o seu nome.'; end if;
  if not public._operador_ok(v_oper, p->>'pin') then raise exception 'Senha do padeiro incorreta.'; end if;
  update public.avisos_producao set ciente_em = now(), ciente_operador_id = v_oper, ciente_por = auth.uid()
   where ciente_em is null and id in (select (x)::bigint from jsonb_array_elements_text(coalesce(p->'ids', '[]'::jsonb)) x);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.confirmar_avisos_producao(jsonb) from public, anon;
grant execute on function public.confirmar_avisos_producao(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. BATELADA INICIADA FORA DA ORDEM (só marca; não trava)
--    "Na ordem" = a 1ª da fila da masseira (menor prioridade) que ainda tem batelada por
--    iniciar E tem mistura pronta na produção.
-- ---------------------------------------------------------------------
alter table public.bateladas add column if not exists fora_da_ordem boolean not null default false;
create or replace function public._batelada_ordem()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_prog public.programacoes; v_esperada bigint; v_mac bigint := public._local_tipo('maceiras');
begin
  if new.programacao_id is null or new.maceira_id is null then return new; end if;
  select * into v_prog from public.programacoes where id = new.programacao_id;
  if not found then return new; end if;
  select p.id into v_esperada
    from public.programacoes p
   where p.data = v_prog.data and p.maceira_id = new.maceira_id and p.situacao = 'ativa' and p.finalizada_em is null
     and (select count(*) from public.bateladas b where b.programacao_id = p.id and b.situacao <> 'cancelada') < ceil(p.quantidade)
     and exists (select 1 from public.produtos m join public.estoque_local e on e.produto_id = m.id and e.local_id = v_mac
                  where m.ficha_id = p.ficha_id and m.categoria = 'intermediario' and e.disponivel >= 0.9999)
   order by p.prioridade nulls last, p.id
   limit 1;
  new.fora_da_ordem := v_esperada is not null and v_esperada <> new.programacao_id;
  return new;
end $$;
revoke execute on function public._batelada_ordem() from public, anon, authenticated;
drop trigger if exists ordem on public.bateladas;
create trigger ordem before insert on public.bateladas for each row execute function public._batelada_ordem();

-- ---------------------------------------------------------------------
-- 4. CORREÇÕES DE BATELADA (engenharia, gestor da produção, admin)
-- ---------------------------------------------------------------------
create table if not exists public.correcoes_producao (
  id          bigint generated always as identity primary key,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users(id) default auth.uid(),
  batelada_id bigint not null references public.bateladas(id),
  tipo        text not null check (tipo in ('masseira','padeiro')),
  antes       jsonb,
  depois      jsonb,
  motivo      text not null check (length(motivo) between 3 and 500)
);
create index if not exists correcoes_producao_batelada on public.correcoes_producao (batelada_id);
alter table public.correcoes_producao enable row level security;
alter table public.correcoes_producao force row level security;
revoke all on public.correcoes_producao from anon, authenticated;
grant select on public.correcoes_producao to authenticated;
drop policy if exists leitura on public.correcoes_producao;
create policy leitura on public.correcoes_producao for select to authenticated using (public.acesso_amplo() and not public.so_padeiro());
drop trigger if exists protege on public.correcoes_producao;
create trigger protege before update or delete on public.correcoes_producao for each row execute function public.bloquear_alteracao();

create or replace function public.corrigir_batelada(p jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.bateladas; v_mot text := nullif(btrim(coalesce(p->>'motivo', '')), '');
        v_mac bigint := (p->>'maceira_id')::bigint; v_oper bigint := (p->>'operador_id')::bigint;
begin
  perform public._exigir('finalizar_batelada');
  if v_mot is null or length(v_mot) < 3 then raise exception 'Informe o motivo da correção.'; end if;
  select * into b from public.bateladas where id = (p->>'id')::bigint for update;
  if not found then raise exception 'Batelada não encontrada.'; end if;
  if b.situacao = 'cancelada' then raise exception 'Batelada cancelada não pode ser corrigida.'; end if;
  if v_mac is not null and v_mac is distinct from b.maceira_id then
    if not exists (select 1 from public.maceiras where id = v_mac) then raise exception 'Masseira inválida.'; end if;
    insert into public.correcoes_producao (batelada_id, tipo, antes, depois, motivo)
    values (b.id, 'masseira', jsonb_build_object('maceira_id', b.maceira_id), jsonb_build_object('maceira_id', v_mac), v_mot);
    update public.bateladas set maceira_id = v_mac where id = b.id;
  end if;
  if v_oper is not null and v_oper is distinct from b.operador_id then
    if not exists (select 1 from public.operadores where id = v_oper) then raise exception 'Padeiro inválido.'; end if;
    insert into public.correcoes_producao (batelada_id, tipo, antes, depois, motivo)
    values (b.id, 'padeiro', jsonb_build_object('operador_id', b.operador_id), jsonb_build_object('operador_id', v_oper), v_mot);
    update public.bateladas set operador_id = v_oper where id = b.id;
    -- as movimentações de estoque são imutáveis (registro contábil): a correção fica registrada aqui e na batelada
  end if;
end $$;
revoke execute on function public.corrigir_batelada(jsonb) from public, anon;
grant execute on function public.corrigir_batelada(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5. TEMPO REAL (o aviso aparece no tablet na hora)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['avisos_producao','correcoes_producao'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

insert into public.versao_banco (versao, descricao)
select '2.7.0', 'Gestor da produção, avisos de mudança no tablet, fora da ordem e correções de batelada'
where not exists (select 1 from public.versao_banco where versao = '2.7.0');

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Papel gestor_producao aceito' as verificacao,
       case when pg_get_constraintdef(oid) like '%gestor_producao%' then 'OK' else 'ATENÇÃO' end as resultado
  from pg_constraint where conname = 'perfis_papeis_check'
union all
select 'Aviso automático ligado na programação', case when exists (select 1 from pg_trigger where tgname = 'aviso_tablet') then 'OK' else 'ATENÇÃO' end
union all
select 'Marcação "fora da ordem" ligada', case when exists (select 1 from pg_trigger where tgname = 'ordem' and tgrelid = 'public.bateladas'::regclass) then 'OK' else 'ATENÇÃO' end
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
        or has_table_privilege('authenticated', c.oid, 'delete'));
