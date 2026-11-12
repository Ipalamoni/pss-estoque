// =====================================================================
// calc.js — indicadores de estoque (consumo, cobertura, mínimo calculado,
// status e sugestão de compra). Tudo explicado em linguagem simples em
// docs/RECONSTRUCAO.md, seção "Como os números são calculados".
// =====================================================================

export const STATUS_ESTOQUE = {
  zerado:     { rotulo: 'Zerado',             cor: 'vermelho-escuro', ordem: 0 },
  critico:    { rotulo: 'Crítico',            cor: 'vermelho',        ordem: 1 },
  comprar:    { rotulo: 'Comprar',            cor: 'laranja',         ordem: 2 },
  aguardando: { rotulo: 'Aguardando entrega', cor: 'azul',            ordem: 3 },
  sem_minimo: { rotulo: 'Sem mínimo',         cor: 'cinza',           ordem: 4 },
  ok:         { rotulo: 'OK',                 cor: 'verde',           ordem: 5 },
};

const n = (v, padrao = 0) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? padrao : Number(v));

export function indicadores(produtos, estatisticas, parametros, fornecedores = []) {
  const p = parametros || {};
  const z = n(p.nivel_servico_z, 1.65);
  const diasMin = n(p.dias_minimos_calculo, 30);
  const ciclo = n(p.ciclo_compra_dias, 30);
  const prazoPadrao = n(p.prazo_entrega_padrao, 7);
  const usar = p.usar_minimo || 'definido';
  const stats = new Map((estatisticas || []).map((s) => [Number(s.produto_id), s]));
  const forn = new Map((fornecedores || []).map((f) => [f.id, f]));

  return produtos.map((prod) => {
    const st = stats.get(Number(prod.id)) || {};
    const saldo = n(prod.saldo);
    const custo = n(prod.custo_medio);
    const media = n(st.media_dia);
    const desvio = n(st.desvio_dia);
    const dias = n(st.dias_historico);
    const aReceber = n(st.a_receber);

    // prazo de entrega (lead time): histórico real > cadastro do produto > fornecedor > padrão
    let L, Ldesv = 0, fonteL;
    if (n(st.lt_qtd) >= 1 && st.lt_medio !== null && st.lt_medio !== undefined) {
      L = n(st.lt_medio); Ldesv = n(st.lt_desvio); fonteL = `histórico (${st.lt_qtd} entrega${st.lt_qtd > 1 ? 's' : ''})`;
    } else if (prod.prazo_entrega_dias) {
      L = n(prod.prazo_entrega_dias); fonteL = 'cadastro do produto';
    } else if (prod.fornecedor_padrao_id && forn.get(prod.fornecedor_padrao_id)?.prazo_entrega_dias) {
      L = n(forn.get(prod.fornecedor_padrao_id).prazo_entrega_dias); fonteL = 'cadastro do fornecedor';
    } else {
      L = prazoPadrao; fonteL = 'padrão do sistema';
    }

    // estoque de segurança = z × √(L × desvio² + média² × desvioL²)
    const seguranca = z * Math.sqrt(L * desvio * desvio + media * media * Ldesv * Ldesv);
    const temHistorico = dias >= diasMin && media > 0;
    // mínimo calculado (ponto de pedido) = consumo médio × prazo + estoque de segurança
    const minCalc = temHistorico ? arred(media * L + seguranca) : null;
    const minDef = prod.estoque_minimo === null || prod.estoque_minimo === undefined || prod.estoque_minimo === '' ? null : n(prod.estoque_minimo);

    let ref = null, fonteRef = null;
    if (usar === 'calculado') { ref = minCalc ?? minDef; fonteRef = minCalc !== null ? 'calculado' : (minDef !== null ? 'definido' : null); }
    else if (usar === 'maior') {
      if (minCalc !== null && (minDef === null || minCalc > minDef)) { ref = minCalc; fonteRef = 'calculado'; }
      else if (minDef !== null) { ref = minDef; fonteRef = 'definido'; }
    } else { ref = minDef ?? minCalc; fonteRef = minDef !== null ? 'definido' : (minCalc !== null ? 'calculado' : null); }

    const limiteCritico = ref !== null ? Math.max(temHistorico ? seguranca : 0, ref * 0.5) : null;
    let status;
    if (saldo <= 0) status = 'zerado';
    else if (ref === null) status = 'sem_minimo';
    else if (saldo <= limiteCritico) status = 'critico';
    else if (saldo + aReceber <= ref) status = 'comprar';
    else if (saldo <= ref) status = 'aguardando';
    else status = 'ok';

    // sugestão de compra: abastecer o mínimo + o consumo de um ciclo de compra
    let sugestao = 0;
    if (ref !== null && saldo + aReceber <= ref) {
      sugestao = Math.max(0, ref + media * ciclo - saldo - aReceber);
    }
    const fat = n(prod.fator_compra, 1) || 1;
    const sugestaoCompra = sugestao > 0 ? Math.ceil(sugestao / fat - 1e-9) : 0;

    return {
      ...prod,
      saldo, custo_medio: custo, valor: saldo * custo,
      saldo_compra: prod.unidade_compra ? saldo / fat : null,
      media_dia: media, media_semana: media * 7, media_mes: media * 30, desvio_dia: desvio,
      dias_historico: dias, tem_historico: temHistorico,
      cobertura: media > 0 ? saldo / media : null,
      prazo: L, prazo_desvio: Ldesv, fonte_prazo: fonteL,
      estoque_seguranca: temHistorico ? arred(seguranca) : null,
      min_definido: minDef, min_calculado: minCalc, min_ref: ref, fonte_min: fonteRef,
      a_receber: aReceber, ultima_saida: st.ultima_saida || null,
      sugestao_base: sugestao, sugestao_compra: sugestaoCompra,
      status, status_ordem: STATUS_ESTOQUE[status].ordem,
    };
  });
}

function arred(v) { return Math.round(v * 1000) / 1000; }

// Estatísticas calculadas no próprio app (usado no modo demonstração;
// no Supabase quem calcula é a função estatisticas_estoque, com a mesma regra)
export function calcularEstatisticas({ produtos, movimentos, pedidos, pedidoItens, janela = 90, hoje }) {
  const diaDe = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const somar = (iso, k) => { const [a, m, d] = iso.split('-').map(Number); const x = new Date(a, m - 1, d + k); return diaDe(x); };
  const dif = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

  const hojeIso = hoje || diaDe(new Date());
  let ini = movimentos.length ? movimentos.reduce((m, x) => (diaDe(x.data_hora) < m ? diaDe(x.data_hora) : m), hojeIso) : hojeIso;
  const limite = somar(hojeIso, -janela);
  if (ini < limite) ini = limite;
  const fim = somar(hojeIso, -1);
  const dias = Math.max(dif(ini, fim) + 1, 0);

  const tiposSaida = new Set(['saida_receita', 'saida_avulsa', 'saida_almox']);
  const movPorId = new Map(movimentos.map((m) => [m.id, m]));
  const consumo = new Map(); // produto -> Map(dia -> q)
  const ultima = new Map();
  for (const m of movimentos) {
    let base = null;
    if (tiposSaida.has(m.tipo)) base = m;
    else if (m.tipo === 'correcao') { const o = movPorId.get(m.corrige_id); if (o && tiposSaida.has(o.tipo)) base = o; }
    if (!base) continue;
    const dia = diaDe(base.data_hora);
    if (dia < ini || dia > fim) continue;
    if (!consumo.has(m.produto_id)) consumo.set(m.produto_id, new Map());
    const mp = consumo.get(m.produto_id);
    mp.set(dia, (mp.get(dia) || 0) - Number(m.quantidade));
    if (tiposSaida.has(m.tipo) && (!ultima.get(m.produto_id) || m.data_hora > ultima.get(m.produto_id))) ultima.set(m.produto_id, m.data_hora);
  }
  for (const m of movimentos) {
    if (tiposSaida.has(m.tipo) && (!ultima.get(m.produto_id) || m.data_hora > ultima.get(m.produto_id))) ultima.set(m.produto_id, m.data_hora);
  }

  const pedPorId = new Map(pedidos.map((p) => [p.id, p]));
  const receber = new Map();
  for (const pi of pedidoItens) {
    const pe = pedPorId.get(pi.pedido_id);
    if (pe && (pe.status === 'aberto' || pe.status === 'parcial'))
      receber.set(pi.produto_id, (receber.get(pi.produto_id) || 0) + Math.max(Number(pi.quantidade_base) - Number(pi.qtd_recebida_base), 0));
  }
  const primeiraEntrada = new Map();
  for (const m of movimentos) {
    if (m.tipo === 'entrada' && m.pedido_item_id) {
      const d = diaDe(m.data_hora);
      if (!primeiraEntrada.has(m.pedido_item_id) || d < primeiraEntrada.get(m.pedido_item_id)) primeiraEntrada.set(m.pedido_item_id, d);
    }
  }
  const lts = new Map();
  for (const pi of pedidoItens) {
    const pe = pedPorId.get(pi.pedido_id);
    const d = primeiraEntrada.get(pi.id);
    if (!pe || !d || pe.data_pedido < somar(hojeIso, -365)) continue;
    if (!lts.has(pi.produto_id)) lts.set(pi.produto_id, []);
    lts.get(pi.produto_id).push(dif(pe.data_pedido, d));
  }
  const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const desvio = (a) => { if (a.length < 2) return 0; const mm = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - mm) ** 2, 0) / (a.length - 1)); };

  return produtos.map((p) => {
    const serie = [];
    const mp = consumo.get(p.id) || new Map();
    for (let i = 0; i < dias; i++) serie.push(mp.get(somar(ini, i)) || 0);
    const l = lts.get(p.id) || [];
    return {
      produto_id: p.id, dias_historico: dias,
      consumo_total: serie.reduce((s, x) => s + x, 0),
      media_dia: serie.length ? media(serie) : 0, desvio_dia: desvio(serie),
      a_receber: receber.get(p.id) || 0,
      lt_medio: l.length ? media(l) : null, lt_desvio: l.length ? desvio(l) : null, lt_qtd: l.length,
      ultima_saida: ultima.get(p.id) || null,
    };
  });
}
