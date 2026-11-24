-- =====================================================================
-- Compras & Estoque PSS · ATUALIZAÇÃO DO BANCO v2.19 · PRAZO DE 1 HORA PARA CORRIGIR CONSUMO
-- (aplicar DEPOIS da v2.18; pode rodar de novo sem problema; não apaga dados)
--
--  · Consumo (no setor e pela receita da pesagem): correção só até 1 HORA depois do lançamento.
--  · Entradas, saídas avulsas e do almoxarifado: só no MESMO DIA (como na v2.18).
--  · Administrador: a qualquer momento.
--  · Transferência: nunca se corrige. Antes de recebida, cancela-se na tela Transferências (volta para a
--    origem); depois de recebida e conferida, não muda mais (mensagem explica isso).
-- =====================================================================

create or replace function public.corrigir_movimento(p_id bigint, p_quantidade_correta numeric,
                                                     p_unidade text, p_motivo text)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.movimentos; v_prod public.produtos; v_efetiva numeric; v_nova numeric; v_delta numeric;
        v_custo numeric; v_novo bigint; v_proprio boolean; v_mesmo_dia boolean;
begin
  if not public.usuario_ativo() then raise exception 'Usuário inativo.' using errcode = '42501'; end if;
  if nullif(btrim(p_motivo), '') is null then raise exception 'Informe o motivo da correção.'; end if;
  select * into o from public.movimentos where id = p_id;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if o.tipo = 'correcao' then raise exception 'Corrija o lançamento original, não a correção.'; end if;
  if o.tipo in ('transferencia','entrada_producao') or o.batelada_id is not null then
    if o.tipo = 'transferencia' then
      raise exception 'Transferência não se corrige. Se o destino ainda não recebeu, cancele na tela Transferências (a mercadoria volta para a origem). Depois de recebida e conferida pelo destino, ela não pode mais ser alterada: diferenças se acertam por inventário.';
    end if;
    raise exception 'Este lançamento é automático da produção: corrija pela própria tela de origem.';
  end if;

  -- REGRA DE PRAZO (v2.18/v2.19): só o ADMINISTRADOR corrige a qualquer momento. Os demais (almoxarifado e quem lançou):
  -- CONSUMO até 1 hora depois do lançamento; os outros só no MESMO DIA (horário de Brasília).
  -- Depois disso, a diferença se acerta por INVENTÁRIO (contagem), nunca por correção.
  v_mesmo_dia := (o.data_hora at time zone 'America/Sao_Paulo')::date = public._hoje();
  v_proprio := o.usuario_id = auth.uid()
               and o.tipo in ('entrada','saida_receita','saida_avulsa','saida_almox','consumo');
  if o.tipo in ('implantacao','inventario') then
    if not ('admin' = any(public.meus_papeis())) then
      raise exception 'Só o administrador corrige implantação de saldo e inventário.' using errcode = '42501';
    end if;
  elsif not ('admin' = any(public.meus_papeis())) then
    if not (public.pode('corrigir') or v_proprio) then
      raise exception 'Sem permissão: você só pode corrigir os seus próprios lançamentos do dia.' using errcode = '42501';
    end if;
    -- consumo (no setor e pela receita da pesagem): só até 1 HORA depois do lançamento
    if o.tipo in ('consumo','saida_receita') and now() - o.data_hora > interval '1 hour' then
      raise exception 'Prazo para correção encerrado. Consumo só pode ser corrigido em até 1 hora depois do lançamento (este foi em %). Para acertar o estoque agora, faça um acerto de inventário (Estoque › Inventário). Dúvidas? Fale com o administrador do sistema.',
        to_char(o.data_hora at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') using errcode = '42501';
    end if;
    if not v_mesmo_dia then
      raise exception 'Prazo para correção encerrado. Este lançamento é de % e só podia ser corrigido no mesmo dia. Para acertar o estoque agora, faça um acerto de inventário (Estoque › Inventário). Dúvidas? Fale com o administrador do sistema.',
        to_char(o.data_hora at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') using errcode = '42501';
    end if;
  end if;

  if p_quantidade_correta is null or p_quantidade_correta < 0 then
    raise exception 'Informe a quantidade correta (zero se o lançamento não deveria existir).';
  end if;
  select * into v_prod from public.produtos where id = o.produto_id;
  select o.quantidade + coalesce(sum(c.quantidade), 0) into v_efetiva
    from public.movimentos c where c.corrige_id = o.id;
  v_nova := sign(o.quantidade) * p_quantidade_correta * public._fator(o.produto_id, p_unidade);
  v_delta := round(v_nova - v_efetiva, 4);
  if v_delta = 0 then raise exception 'A quantidade informada é igual à atual; nada a corrigir.'; end if;

  v_custo := case when o.quantidade > 0 then o.custo_unitario end;
  v_novo := public._movimentar(o.produto_id, 'correcao', v_delta, v_custo,
    jsonb_build_object('corrige_id', o.id, 'motivo', btrim(p_motivo), 'local_id', o.local_id,
      'observacao', format('Corrige lançamento #%s: de %s para %s %s', o.id,
                           public._fmt(abs(v_efetiva)), public._fmt(abs(v_nova)), public._un(v_prod.unidade_estoque, abs(v_nova)))));

  if o.pedido_item_id is not null then
    update public.pedido_itens set qtd_recebida_base = greatest(qtd_recebida_base + v_delta, 0)
     where id = o.pedido_item_id;
    perform public._atualizar_status_pedido((select pedido_id from public.pedido_itens where id = o.pedido_item_id));
  end if;
  return v_novo;
end $$;

revoke execute on function public.corrigir_movimento(bigint, numeric, text, text) from public, anon;
grant execute on function public.corrigir_movimento(bigint, numeric, text, text) to authenticated;

insert into public.versao_banco (versao, descricao)
values ('2.19.0', 'Prazo de 1 hora para corrigir consumo; mensagem clara para transferência')
on conflict (versao) do nothing;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA (todas as linhas devem dizer OK)
-- ---------------------------------------------------------------------
select 'Consumo com prazo de 1 hora' as verificacao,
       case when position('em até 1 hora' in pg_get_functiondef('public.corrigir_movimento(bigint, numeric, text, text)'::regprocedure)) > 0
            then 'OK' else 'ATENÇÃO' end as resultado
union all
select 'Transferência recebida não cancela',
       case when position('não pode ser cancelada' in pg_get_functiondef('public.cancelar_transferencia(bigint, text)'::regprocedure)) > 0
            then 'OK' else 'ATENÇÃO' end
union all
select 'Funções que alguém SEM LOGIN pode executar',
       case when count(*) = 0 then 'OK (nenhuma)' else 'ATENÇÃO: ' || string_agg(p.proname, ', ') end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'Versão do banco', case when exists (select 1 from public.versao_banco where versao = '2.19.0') then 'OK (2.19.0)' else 'ATENÇÃO' end;
