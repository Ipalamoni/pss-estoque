// =====================================================================
// resumos.js: contas e avisos pequenos usados no Início e nas telas de pedidos/financeiro/produção.
// Ficam aqui (DESEMPENHO, v2.26.1) para o Início não precisar carregar essas telas inteiras.
// =====================================================================
import { html } from './vendor/preact-htm.js';
import { hojeISO, diasEntre, diaLocal, data, pl } from './util.js';

export function resumoPedido(pedido, dados) {
  // pelo índice montado na carga (antes varria todos os itens/recebimentos para cada pedido)
  const itens = dados.mapa?.itensPedido ? (dados.mapa.itensPedido.get(pedido.id) || []) : dados.pedidoItens.filter((i) => i.pedido_id === pedido.id);
  const recebimentos = (dados.mapa?.recPedido ? (dados.mapa.recPedido.get(pedido.id) || []) : (dados.recebimentos || []).filter((r) => r.pedido_id === pedido.id))
    .slice().sort((a, b) => b.id - a.id);
  const valor = itens.reduce((s, i) => s + Number(i.valor_total), 0);
  const base = itens.reduce((s, i) => s + Number(i.quantidade_base), 0);
  const rec = itens.reduce((s, i) => s + Math.min(Number(i.qtd_recebida_base), Number(i.quantidade_base)), 0);
  const hoje = hojeISO();
  const pendente = pedido.status === 'aberto' || pedido.status === 'parcial';
  const dias = pendente && pedido.previsao_entrega ? diasEntre(hoje, pedido.previsao_entrega) : null;
  const divergentes = recebimentos.filter((r) => r.divergencia);
  return { itens, recebimentos, valor, perc: base ? (rec / base) * 100 : 0, dias, pendente, atrasado: dias !== null && dias < 0,
    fornecedor: dados.mapa.fornecedor.get(pedido.fornecedor_id),
    divergencia: divergentes.length > 0, divPendente: divergentes.some((r) => !r.ciente_por),
    recebidoPor: recebimentos[0] ? dados.mapa.perfil.get(recebimentos[0].usuario_id) : null };
}

// Situação da entrega, do jeito que o financeiro precisa
export function entregaFin(p) {
  if (p.status === 'cancelado') return { id: 'cancelado', rotulo: 'Cancelado', cor: 'cinza' };
  if (p.status === 'recebido' || p.status === 'encerrado') return { id: 'recebido', rotulo: 'Recebido', cor: 'verde' };
  if (p.status === 'parcial') return { id: 'parcial', rotulo: 'Parcial', cor: 'laranja' };
  return { id: 'pendente', rotulo: 'Pendente', cor: 'azul' };
}

// Linhas do financeiro (usadas também no Início)
export function linhasFinanceiro(dados) {
  const hoje = hojeISO();
  return dados.pedidos.map((p) => {
    const r = resumoPedido(p, dados);
    const ent = entregaFin(p);
    const diasPgto = p.previsao_pagamento ? diasEntre(hoje, p.previsao_pagamento) : null;
    const aberto = ent.id === 'pendente' || ent.id === 'parcial';
    return { ...p, r, ent, diasPgto, criadoDia: p.criado_em ? diaLocal(p.criado_em) : p.data_pedido,
      // pagamento vence até hoje e a mercadoria ainda não chegou toda → falar com o comprador
      alertaEntrega: aberto && diasPgto !== null && diasPgto <= 0,
      // pedido cancelado que já foi lançado → precisa estornar no sistema
      alertaCancelado: p.status === 'cancelado' && p.fin_lancado };
  });
}

export function AvisoFinalizar({ progs, aoAbrir }) {
  const dias = [...new Set(progs.map((p) => p.data))].sort();
  return html`<div class="aviso-faixa"><span>⚠ Existem <b>${pl(progs.length, 'produção iniciada', 'produções iniciadas')}</b> em dias anteriores pendentes de finalização (${dias.map((d) => data(d).slice(0, 5)).join(', ')}). Confira com a pesagem e finalize.</span>
    <button class="btn btn-destaque btn-peq" onClick=${() => aoAbrir(dias[0])}>Ver ${data(dias[0]).slice(0, 5)}</button></div>`;
}

