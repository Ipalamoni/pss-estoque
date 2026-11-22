// =====================================================================
// Financeiro: pedidos de compra a pagar
//  - o financeiro só vê pedidos (sem estoque e sem produção)
//  - marca "lançado no sistema" / "pendente"
//  - comprador ou financeiro ajustam a previsão de pagamento (com motivo)
// =====================================================================
import { html, useState, useMemo, useEffect, useApp, Tabela, Cartao, Cabecalho, Etiqueta, Busca, useAcao, avisar, useHistorico, Filtros } from '../ui.js';
import { STATUS_PEDIDO, numeroPedido, data, dataHora, hojeISO, somarDias, diasEntre, diaLocal, moeda, pl, contem, nomeUsuario, formatarDoc } from '../util.js';
import { resumoPedido, PedidoDetalhe, AjustarPagamento } from './pedidos.js';
import { Exportar } from '../exportar.js';

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

const RAPIDOS = {
  todos: { t: 'Todos' },
  hoje: { t: 'Feitos hoje', f: (p, h) => p.criadoDia === h },
  pendentes: { t: 'Pendentes de lançar', f: (p) => !p.fin_lancado && p.status !== 'cancelado' },
  lancados: { t: 'Lançados', f: (p) => p.fin_lancado },
  vence_hoje: { t: 'Vencem hoje', f: (p) => p.diasPgto === 0 && p.status !== 'cancelado' },
  vence_7: { t: 'Vencem em 7 dias', f: (p) => p.diasPgto !== null && p.diasPgto >= 0 && p.diasPgto <= 7 && p.status !== 'cancelado' },
  vencidos: { t: 'Vencidos', f: (p) => p.diasPgto !== null && p.diasPgto < 0 && p.status !== 'cancelado' },
  alerta: { t: 'Vencendo sem mercadoria', f: (p) => p.alertaEntrega },
  cancelados: { t: 'Cancelados já lançados', f: (p) => p.alertaCancelado },
};

export function PrazoPagamento({ p }) {
  if (p.status === 'cancelado') return '–';
  if (p.diasPgto === null) return html`<${Etiqueta} cor="vermelho">sem data</${Etiqueta}>`;
  if (p.diasPgto < 0) return html`<${Etiqueta} cor="vermelho">vencido há ${pl(-p.diasPgto, 'dia', 'dias')}</${Etiqueta}>`;
  if (p.diasPgto === 0) return html`<${Etiqueta} cor="laranja">vence hoje</${Etiqueta}>`;
  return html`<span>em <b>${pl(p.diasPgto, 'dia', 'dias')}</b></span>`;
}
function PrazoEntrega({ p }) {
  if (!p.r.pendente) return '';
  if (p.r.dias === null) return html`<small>sem previsão</small>`;
  if (p.r.dias < 0) return html`<small class="txt-vermelho">${pl(-p.r.dias, 'dia', 'dias')} de atraso</small>`;
  if (p.r.dias === 0) return html`<small>chega hoje</small>`;
  return html`<small>faltam ${pl(p.r.dias, 'dia', 'dias')}</small>`;
}

export function TelaFinanceiro() {
  const { dados, podeFazer, recarregar, api, estadoRota, setEstadoRota } = useApp();
  const hoje = hojeISO();
  const [rapido, setRapido] = useState(estadoRota?.rapido || 'todos');
  const [busca, setBusca] = useState('');
  const [pedDe, setPedDe] = useState('');
  const [pedAte, setPedAte] = useState('');
  const [venDe, setVenDe] = useState('');
  const [venAte, setVenAte] = useState('');
  const [lanc, setLanc] = useState('');
  const [ent, setEnt] = useState('');
  const [aberto, setAberto] = useState(null);
  const [ajustar, setAjustar] = useState(null);
  useHistorico([somarDias(hoje, -180), pedDe].filter(Boolean).sort()[0]);   // pagamentos podem vencer bem depois da compra
  const [ocupado, executar] = useAcao();
  useEffect(() => { if (estadoRota) setEstadoRota(null); }, []);
  const marca = podeFazer('financeiro');

  const todos = useMemo(() => linhasFinanceiro(dados), [dados]);
  const linhas = useMemo(() => todos.filter((p) => {
    const R = RAPIDOS[rapido];
    if (R.f && !R.f(p, hoje)) return false;
    if (pedDe && p.data_pedido < pedDe) return false;
    if (pedAte && p.data_pedido > pedAte) return false;
    if (venDe && (!p.previsao_pagamento || p.previsao_pagamento < venDe)) return false;
    if (venAte && (!p.previsao_pagamento || p.previsao_pagamento > venAte)) return false;
    if (lanc === 'sim' && !p.fin_lancado) return false;
    if (lanc === 'nao' && p.fin_lancado) return false;
    if (ent && p.ent.id !== ent) return false;
    return contem(`${numeroPedido(p.id)} ${p.id} ${p.r.fornecedor?.nome} ${p.r.fornecedor?.cnpj || ''} ${formatarDoc(p.r.fornecedor?.cnpj, p.r.fornecedor?.tipo_pessoa)}`, busca);
  }), [todos, rapido, pedDe, pedAte, venDe, venAte, lanc, ent, busca]);
  const total = linhas.reduce((s, p) => s + (p.status === 'cancelado' ? 0 : p.r.valor), 0);

  const ativos = todos.filter((p) => p.status !== 'cancelado');
  const soma = (l) => moeda(l.reduce((s, p) => s + p.r.valor, 0));
  const grupo = (k) => todos.filter((p) => RAPIDOS[k].f(p, hoje));
  const cards = [
    ['hoje', 'Pedidos feitos hoje', ''],
    ['pendentes', 'Pendentes de lançar', 'c-laranja'],
    ['lancados', 'Lançados no sistema', ''],
    ['vence_hoje', 'Vencem hoje', 'c-laranja'],
    ['vence_7', 'Vencem em 7 dias', ''],
    ['vencidos', 'Vencidos', 'c-vermelho'],
    ['alerta', 'Vencendo sem a mercadoria', 'c-vermelho'],
    ['cancelados', 'Cancelados já lançados', 'c-vermelho'],
  ].map(([k, t, cor]) => { const l = grupo(k); return { k, t, n: l.length, sub: soma(l), cor: l.length ? cor : '' }; })
    .filter((c) => c.n || !['alerta', 'cancelados'].includes(c.k));

  async function alternar(p, e) {
    e.stopPropagation();
    if (!marca || ocupado) return;
    const novo = !p.fin_lancado;
    const r = await executar(() => api.rpc('financeiro_marcar', { p_pedido: p.id, p_lancado: novo, p_obs: null }),
      novo ? `${numeroPedido(p.id)} marcado como lançado.` : `${numeroPedido(p.id)} voltou para pendente.`);
    if (r) await recarregar();
  }
  const filtrosTxt = [RAPIDOS[rapido].t, pedDe || pedAte ? `pedido ${data(pedDe) || '…'} a ${data(pedAte) || '…'}` : '',
    venDe || venAte ? `vencimento ${venDe ? data(venDe) : '…'} a ${venAte ? data(venAte) : '…'}` : '',
    lanc === 'sim' ? 'lançados' : lanc === 'nao' ? 'pendentes de lançar' : '', ent ? `entrega: ${ent}` : '',
    pl(linhas.length, 'pedido', 'pedidos')].filter(Boolean).join(' · ');
  const perfil = (id) => dados.mapa.perfil.get(id);
  const colExp = [
    { titulo: 'Pedido', valor: (p) => numeroPedido(p.id) },
    { titulo: 'Data do pedido', valor: (p) => data(p.data_pedido) },
    { titulo: 'Criado em', valor: (p) => dataHora(p.criado_em) },
    { titulo: 'Comprador', valor: (p) => nomeUsuario(perfil(p.comprador_id)) },
    { titulo: 'Fornecedor', valor: (p) => p.r.fornecedor?.nome },
    { titulo: 'Valor', valor: (p) => Number(p.r.valor.toFixed(2)), texto: (p) => moeda(p.r.valor), num: true },
    { titulo: 'Condição', valor: (p) => p.condicao_pagamento || '' },
    { titulo: 'Previsão de pagamento', valor: (p) => data(p.previsao_pagamento) },
    { titulo: 'Dias p/ vencer', valor: (p) => (p.status === 'cancelado' ? '' : p.diasPgto), num: true },
    { titulo: 'Previsão de entrega', valor: (p) => data(p.previsao_entrega) },
    { titulo: 'Entrega', valor: (p) => p.ent.rotulo },
    { titulo: 'Dias p/ entregar (neg. = atraso)', valor: (p) => (p.r.pendente ? p.r.dias : ''), num: true },
    { titulo: 'Financeiro', valor: (p) => (p.fin_lancado ? 'Lançado' : 'Pendente') },
    { titulo: 'Lançado em', valor: (p) => (p.fin_lancado ? dataHora(p.fin_lancado_em) : '') },
    { titulo: 'Lançado por', valor: (p) => (p.fin_lancado ? nomeUsuario(perfil(p.fin_lancado_por)) : '') },
    { titulo: 'Histórico financeiro', valor: (p) => p.fin_obs || '' },
  ];
  const colPdf = colExp.filter((c) => !['Criado em', 'Lançado em', 'Lançado por', 'Histórico financeiro', 'Condição'].includes(c.titulo));
  const abas = () => [
    { nome: 'Pedidos', colunas: colExp, linhas },
    { nome: 'Itens', linhas: linhas.flatMap((p) => p.r.itens.map((i) => ({ p, i, pr: dados.mapa.produto.get(i.produto_id) }))), colunas: [
      { titulo: 'Pedido', valor: (x) => numeroPedido(x.p.id) }, { titulo: 'Fornecedor', valor: (x) => x.p.r.fornecedor?.nome },
      { titulo: 'Produto', valor: (x) => x.pr?.descricao || `#${x.i.produto_id}` }, { titulo: 'Qtd', valor: (x) => Number(x.i.quantidade) },
      { titulo: 'Unid.', valor: (x) => x.i.unidade }, { titulo: 'Preço unit.', valor: (x) => Number(x.i.preco_unitario) },
      { titulo: 'Total', valor: (x) => Number(x.i.valor_total) }] },
  ];
  const limpar = () => { setRapido('todos'); setBusca(''); setPedDe(''); setPedAte(''); setVenDe(''); setVenAte(''); setLanc(''); setEnt(''); };
  const pedidoAberto = aberto && dados.pedidos.find((p) => p.id === aberto);
  const pedidoAjustar = ajustar && dados.pedidos.find((p) => p.id === ajustar);

  return html`
    <${Cabecalho} titulo="Financeiro · pedidos a pagar" sub="Pedidos de compra, previsão de pagamento e situação da entrega">
      <${Exportar} titulo="Financeiro - pedidos a pagar" filtros=${filtrosTxt} arquivo=${`financeiro-pedidos-${hoje}`}
        colunas=${colPdf} linhas=${linhas} abas=${abas} totais=${['', '', '', 'TOTAL', moeda(total), '', '', '', '', '', '']} />
    </${Cabecalho}>
    <div class="cartoes">
      ${cards.map((c) => html`<${Cartao} titulo=${c.t} valor=${c.n} sub=${c.sub} cor=${(rapido === c.k ? 'c-ativo ' : '') + c.cor}
        aoClicar=${() => setRapido(rapido === c.k ? 'todos' : c.k)} />`)}
    </div>
    ${grupo('alerta').length > 0 && html`<div class="aviso-faixa"><span>⚠ <b>${pl(grupo('alerta').length, 'pedido', 'pedidos')}</b> com pagamento vencendo (ou vencido) e a mercadoria ainda não chegou toda. Fale com o comprador antes de pagar.</span>
      <button class="btn btn-destaque btn-peq" onClick=${() => setRapido('alerta')}>Ver</button></div>`}
    <div class="chips">
      ${Object.entries(RAPIDOS).map(([k, v]) => html`<button class=${'chip' + (rapido === k ? ' ativo' : '')} onClick=${() => setRapido(k)}>${v.t}</button>`)}
    </div>
    <${Filtros} ativos=${[pedDe, pedAte, venDe, venAte, lanc, ent].filter(Boolean).length} fixo=${html`<${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Nº do pedido ou fornecedor" />`}>
      <label class="campo-inline">Pedido de <input class="entrada" type="date" value=${pedDe} onChange=${(e) => setPedDe(e.target.value)} /></label>
      <label class="campo-inline">até <input class="entrada" type="date" value=${pedAte} onChange=${(e) => setPedAte(e.target.value)} /></label>
      <label class="campo-inline">Vencimento de <input class="entrada" type="date" value=${venDe} onChange=${(e) => setVenDe(e.target.value)} /></label>
      <label class="campo-inline">até <input class="entrada" type="date" value=${venAte} onChange=${(e) => setVenAte(e.target.value)} /></label>
      <select class="entrada" value=${lanc} onChange=${(e) => setLanc(e.target.value)}>
        <option value="">Lançado e pendente</option><option value="nao">Só pendentes de lançar</option><option value="sim">Só lançados</option>
      </select>
      <select class="entrada" value=${ent} onChange=${(e) => setEnt(e.target.value)}>
        <option value="">Entrega: todas</option><option value="pendente">Pendente</option><option value="parcial">Parcial</option>
        <option value="recebido">Recebido</option><option value="cancelado">Cancelado</option>
      </select>
      <button class="btn btn-sec btn-peq" onClick=${limpar}>Limpar filtros</button>
    </${Filtros}>
    <${Tabela} linhas=${linhas} aoClicar=${(p) => setAberto(p.id)} ordemInicial=${{ chave: 'pgto', dir: 1 }}
      classeLinha=${(p) => (p.alertaEntrega || p.alertaCancelado ? 'linha-alerta' : '')}
      colunas=${[
        { chave: 'id', titulo: 'Pedido', render: (p) => html`<b>${numeroPedido(p.id)}</b>` },
        { chave: 'data_pedido', titulo: 'Data do pedido', render: (p) => html`${data(p.data_pedido)}<br /><small>${perfil(p.comprador_id)?.nome || ''}</small>` },
        { chave: 'forn', titulo: 'Fornecedor', valor: (p) => p.r.fornecedor?.nome, render: (p) => html`${p.r.fornecedor?.nome}${p.condicao_pagamento ? html`<br /><small>${p.condicao_pagamento}</small>` : ''}` },
        { chave: 'valor', titulo: 'Valor', num: true, valor: (p) => p.r.valor, render: (p) => (p.status === 'cancelado' ? html`<s>${moeda(p.r.valor)}</s>` : moeda(p.r.valor)) },
        { chave: 'pgto', titulo: 'Previsão de pagamento', valor: (p) => (p.status === 'cancelado' ? '9999' : p.previsao_pagamento || '0000'),
          render: (p) => html`<b>${data(p.previsao_pagamento)}</b><br /><${PrazoPagamento} p=${p} />
            ${podeFazer('data_pagamento') && p.status !== 'cancelado' && html`<br /><button class="btn-link" onClick=${(e) => { e.stopPropagation(); setAjustar(p.id); }}>ajustar data</button>`}` },
        { chave: 'ent', titulo: 'Entrega', valor: (p) => p.ent.id, render: (p) => html`<${Etiqueta} cor=${p.ent.cor}>${p.ent.rotulo}</${Etiqueta}><br /><${PrazoEntrega} p=${p} />` },
        { chave: 'fin', titulo: 'Lançado no sistema?', valor: (p) => (p.fin_lancado ? 1 : 0), render: (p) => html`<label class=${'flag-fin' + (p.fin_lancado ? ' ok' : '')} onClick=${(e) => e.stopPropagation()}>
            <input type="checkbox" checked=${!!p.fin_lancado} disabled=${!marca || ocupado} onChange=${(e) => alternar(p, e)} />
            ${p.fin_lancado ? 'Lançado' : 'Pendente'}</label>
            ${p.alertaCancelado && html`<br /><${Etiqueta} cor="vermelho">cancelado: estornar</${Etiqueta}>`}` },
      ]}
      rodape=${linhas.length > 1 && html`<tr><td colspan="3">${pl(linhas.length, 'pedido', 'pedidos')} (sem os cancelados no total)</td><td class="n"><b>${moeda(total)}</b></td><td colspan="3"></td></tr>`} />
    ${!marca && html`<p class="nota">Só o financeiro (ou o administrador) marca "lançado no sistema".</p>`}
    ${pedidoAberto && html`<${PedidoDetalhe} pedido=${pedidoAberto} aoFechar=${() => setAberto(null)} aoEditar=${() => avisar('Para alterar o pedido, abra em Pedidos de compra.', 'aviso')} />`}
    ${pedidoAjustar && html`<${AjustarPagamento} pedido=${pedidoAjustar} aoFechar=${() => setAjustar(null)} />`}`;
}
