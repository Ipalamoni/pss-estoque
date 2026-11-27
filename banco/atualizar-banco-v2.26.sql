-- =====================================================================
-- Artas · atualização do banco v2.26 (DESEMPENHO do consumo médio) · idempotente
-- O cálculo do consumo médio (estatisticas_estoque) já mostrava só a janela (90 dias), mas lia o histórico
-- INTEIRO de movimentações a cada chamada. Agora lê só a janela (usa o índice por data).
-- Os números NÃO mudam. Nenhuma tabela é alterada; nenhum dado é apagado.
-- =====================================================================

create or replace function public.estatisticas_estoque(p_janela integer DEFAULT 90)
 RETURNS TABLE(produto_id bigint, dias_historico integer, consumo_total numeric, media_dia numeric, desvio_dia numeric, a_receber numeric, lt_medio numeric, lt_desvio numeric, lt_qtd integer, ultima_saida timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_ini date; v_fim date := public._hoje() - 1; v_dias int;
begin
  if not public.usuario_ativo() then raise exception 'Usuário inativo.' using errcode = '42501'; end if;
  if not public.acesso_amplo() then return; end if;
  select coalesce(min((data_hora at time zone 'America/Sao_Paulo')::date), public._hoje())
    into v_ini from public.movimentos;
  v_ini := greatest(v_ini, public._hoje() - p_janela);
  v_dias := greatest(v_fim - v_ini + 1, 0);

  return query
  with consumo as (
    select m.produto_id,
           (coalesce(o.data_hora, m.data_hora) at time zone 'America/Sao_Paulo')::date as dia,
           -m.quantidade as q
      from public.movimentos m
      left join public.movimentos o on o.id = m.corrige_id
     where (m.tipo in ('saida_receita','saida_avulsa','saida_almox','consumo')
            or (m.tipo = 'correcao' and o.tipo in ('saida_receita','saida_avulsa','saida_almox','consumo')))
       -- v2.26 (desempenho): só a janela do cálculo. Uma correção é sempre posterior ao lançamento que corrige,
       -- então o que ficar de fora daqui já estaria fora da janela (o resultado não muda).
       and m.data_hora >= (v_ini::timestamp at time zone 'America/Sao_Paulo')
  ),
  dias as (select generate_series(v_ini, v_fim, interval '1 day')::date as dia where v_dias > 0),
  serie as (
    select p.id as produto_id, d.dia, coalesce(sum(c.q), 0) as q
      from public.produtos p cross join dias d
      left join consumo c on c.produto_id = p.id and c.dia = d.dia
     group by p.id, d.dia
  ),
  est as (
    select s.produto_id, sum(s.q) as total, avg(s.q) as media,
           coalesce(stddev_samp(s.q), 0) as desvio
      from serie s group by s.produto_id
  ),
  receber as (
    select pi.produto_id, sum(greatest(pi.quantidade_base - pi.qtd_recebida_base, 0)) as q
      from public.pedido_itens pi join public.pedidos pe on pe.id = pi.pedido_id
     where pe.status in ('aberto','parcial') group by pi.produto_id
  ),
  lt as (
    select pi.produto_id,
           (min(m.data_hora at time zone 'America/Sao_Paulo')::date - pe.data_pedido) as dias
      from public.pedido_itens pi
      join public.pedidos pe on pe.id = pi.pedido_id
      join public.movimentos m on m.pedido_item_id = pi.id and m.tipo = 'entrada'
     where pe.data_pedido >= public._hoje() - 365
     group by pi.id, pi.produto_id, pe.data_pedido
  ),
  ltp as (
    select l.produto_id, avg(l.dias) as media, coalesce(stddev_samp(l.dias), 0) as desvio, count(*) as n
      from lt l group by l.produto_id
  ),
  ult as (
    select m.produto_id, max(m.data_hora) as d from public.movimentos m
     where m.tipo in ('saida_receita','saida_avulsa','saida_almox','consumo') group by m.produto_id
  )
  select p.id, v_dias, coalesce(e.total, 0), coalesce(e.media, 0), coalesce(e.desvio, 0),
         coalesce(r.q, 0), l.media, l.desvio, coalesce(l.n, 0)::int, u.d
    from public.produtos p
    left join est e on e.produto_id = p.id
    left join receber r on r.produto_id = p.id
    left join ltp l on l.produto_id = p.id
    left join ult u on u.produto_id = p.id;
end $function$;
revoke execute on function public.estatisticas_estoque(integer) from public, anon;
grant execute on function public.estatisticas_estoque(integer) to authenticated;

insert into public.versao_banco (versao, descricao)
values ('2.26.0', 'Desempenho: consumo médio lê só a janela de dias do cálculo')
on conflict (versao) do nothing;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Consumo médio lê só a janela do cálculo' as verificacao,
       case when pg_get_functiondef('public.estatisticas_estoque(integer)'::regprocedure) like '%m.data_hora >= (v_ini::timestamp at time zone%' then 'OK' else 'ATENÇÃO' end as resultado
union all
select 'Consumo médio: sem acesso para quem não tem login',
       case when has_function_privilege('anon', 'public.estatisticas_estoque(integer)', 'execute') then 'ATENÇÃO' else 'OK' end
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.26.0') then 'OK (2.26.0)' else 'ATENÇÃO' end;
