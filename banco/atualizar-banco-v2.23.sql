-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.23 · FROTA: DATA DE INÍCIO E PROTEÇÃO CONTRA LIMPEZA
-- (aplicar DEPOIS da v2.21; pode rodar de novo sem problema; não apaga dados)
--
--  1. DATA DE INÍCIO DO APONTAMENTO (parâmetro frota_inicio_apontamento = 2026-11-01):
--     só notas com data de entrada a partir dela pedem apontamento (tipo de manutenção) e
--     só as placas dessas notas aparecem em "Placas a resolver". As anteriores ficam carregadas
--     para os painéis (placa desconhecida antiga = despesa geral).
--  2. OS DADOS DA FROTA NUNCA ENTRAM NA LIMPEZA DOS DADOS DE TESTE (decisão do dono, 24/11/2026):
--     as tabelas frota_* não podem ser esvaziadas (TRUNCATE) e as linhas do financeiro, as
--     importações e os tipos de manutenção não podem ser apagados. Cada tabela leva esse aviso.
-- =====================================================================

insert into public.parametros (chave, valor, descricao)
values ('frota_inicio_apontamento', '2026-11-01',
        'Manutenção de veículos: só notas com data de entrada a partir desta data pedem apontamento e resolução de placa (AAAA-MM-DD).')
on conflict (chave) do nothing;

-- pendências da frota respeitam a data de início
create or replace function public.frota_pendencias()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_ini date := coalesce((select nullif(valor, '')::date from public.parametros where chave = 'frota_inicio_apontamento'), date '2026-11-01');
begin
  if not public.pode('frota') then return null; end if;
  return jsonb_build_object(
    'inicio', v_ini,
    'apontar', (select count(*) from public.frota_servicos s where s.ativo and cardinality(s.tags) = 0
                  and (select min(l.entrada) from public.frota_lancamentos l where l.servico_id = s.id and l.removido_em is null) >= v_ini),
    'placas', (select count(distinct s.placa_arquivo) from public.frota_servicos s
                where s.ativo and s.placa_arquivo not in ('', '9999999') and s.veiculo_id is null and s.veiculo_manual_id is null
                  and (select min(l.entrada) from public.frota_lancamentos l where l.servico_id = s.id and l.removido_em is null) >= v_ini),
    'ultima_importacao', (select max(criado_em) from public.frota_importacoes));
end $$;
revoke execute on function public.frota_pendencias() from public, anon;
grant execute on function public.frota_pendencias() to authenticated;

-- ---------------------------------------------------------------------
-- PROTEÇÃO: limpeza de dados de teste NÃO apaga a frota
-- ---------------------------------------------------------------------
create or replace function public._frota_nao_apagar()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'Dados da MANUTENÇÃO DE VEÍCULOS (frota) não podem ser apagados: a limpeza dos dados de teste NÃO inclui a frota (decisão do dono, 24/11/2026). Tabela: %', tg_table_name
    using errcode = '42501';
end $$;
revoke execute on function public._frota_nao_apagar() from public, anon, authenticated;

do $$
declare t text;
begin
  -- ninguém esvazia as tabelas da frota
  foreach t in array array['frota_veiculos','frota_tags','frota_placa_apelidos','frota_importacoes','frota_servicos','frota_lancamentos','frota_rateios'] loop
    execute format('drop trigger if exists frota_sem_truncate on public.%I', t);
    execute format('create trigger frota_sem_truncate before truncate on public.%I for each statement execute function public._frota_nao_apagar()', t);
    execute format('comment on table public.%I is %L', t,
      'MANUTENÇÃO DE VEÍCULOS (frota). NÃO APAGAR na limpeza dos dados de teste: estes dados são reais e ficam (decisão do dono, 24/11/2026).');
  end loop;
  -- linhas do financeiro, importações e tipos não se apagam (veículo e serviço já eram protegidos)
  foreach t in array array['frota_lancamentos','frota_importacoes','frota_tags'] loop
    execute format('drop trigger if exists frota_sem_exclusao on public.%I', t);
    execute format('create trigger frota_sem_exclusao before delete on public.%I for each row execute function public._frota_nao_apagar()', t);
  end loop;
end $$;

insert into public.versao_banco (versao, descricao)
values ('2.23.0', 'Frota: data de início do apontamento (01/11/2026) e proteção dos dados da frota na limpeza de testes')
on conflict (versao) do nothing;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Data de início do apontamento' as verificacao,
       coalesce('OK (' || (select valor from public.parametros where chave = 'frota_inicio_apontamento') || ')', 'ATENÇÃO') as resultado
union all
select 'Tabelas da frota protegidas contra esvaziar (TRUNCATE)',
       case when count(*) = 7 then 'OK (7)' else 'ATENÇÃO: ' || count(*) end
  from pg_trigger where tgname = 'frota_sem_truncate' and not tgisinternal
union all
select 'Linhas do financeiro, importações e tipos protegidas contra apagar',
       case when count(*) = 3 then 'OK (3)' else 'ATENÇÃO: ' || count(*) end
  from pg_trigger where tgname = 'frota_sem_exclusao' and not tgisinternal
union all
select 'Aviso "NÃO APAGAR" nas tabelas da frota',
       case when count(*) = 7 then 'OK (7)' else 'ATENÇÃO: ' || count(*) end
  from pg_class c where c.relname like 'frota\_%' and c.relkind = 'r' and obj_description(c.oid, 'pg_class') like '%NÃO APAGAR%'
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.23.0') then 'OK (2.23.0)' else 'ATENÇÃO' end;
