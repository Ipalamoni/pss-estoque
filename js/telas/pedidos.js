// Pedidos de compra: lista, cadastro, detalhe, divergências, PDF / Excel / impressão
import { html, useState, useMemo, useEffect, useApp, Tabela, Modal, Campo, Numero, Escolher, QtdUnidade, Busca, Etiqueta, Cabecalho, useAcao, confirmar, avisar, n, useHistorico } from '../ui.js';
import { STATUS_PEDIDO, numeroPedido, data, dataHora, hojeISO, somarDias, diasEntre, moeda, qtd, num, contem, fator, qu, pl, plural, nomeUsuario, mensagemErro } from '../util.js';
import { pdfPedido, pdfTabela, salvarPDF, imprimirPDF, excel, pdfBlob, compartilhar } from '../export.js';
import { Exportar } from '../exportar.js';
import { HistoricoAuditoria } from '../historico.js';
import { Icone } from '../icones.js';

export const COR_STATUS = { aberto: 'azul', parcial: 'laranja', recebido: 'verde', cancelado: 'cinza', encerrado: 'cinza' };

export function resumoPedido(pedido, dados) {
  const itens = dados.pedidoItens.filter((i) => i.pedido_id === pedido.id);
  const recebimentos = (dados.recebimentos || []).filter((r) => r.pedido_id === pedido.id).sort((a, b) => b.id - a.id);
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

export function PrazoEtiqueta({ r }) {
  if (!r.pendente) return '–';
  if (r.dias === null) return 'sem previsão';
  if (r.dias < 0) return html`<${Etiqueta} cor="vermelho">${pl(-r.dias, 'dia', 'dias')} de atraso</${Etiqueta}>`;
  if (r.dias === 0) return html`<${Etiqueta} cor="laranja">chega hoje</${Etiqueta}>`;
  return html`<span>faltam <b>${pl(r.dias, 'dia', 'dias')}</b></span>`;
}

export function SituacaoPedido({ pedido, r }) {
  return html`<span class="etqs"><${Etiqueta} cor=${COR_STATUS[pedido.status]}>${STATUS_PEDIDO[pedido.status]}</${Etiqueta}>
    ${r.divPendente ? html`<${Etiqueta} cor="laranja" titulo="Recebido com divergência: o comprador precisa dar ciência">⚠ divergência: aguardando ciência</${Etiqueta}>`
      : r.divergencia ? html`<${Etiqueta} cor="roxo">recebido divergente · ciente</${Etiqueta}>` : ''}</span>`;
}

export function TelaPedidos() {
  const { dados, podeFazer, estadoRota, setEstadoRota } = useApp();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState(estadoRota?.filtro || 'pendentes');
  const [de, setDe] = useState('');
  useHistorico(de);
  const [ate, setAte] = useState('');
  const [forn, setForn] = useState(null);
  const [aberto, setAberto] = useState(estadoRota?.abrir || null);
  const [editando, setEditando] = useState(estadoRota?.novo ? {} : null);
  const [pendencias, setPendencias] = useState(!!estadoRota?.pendencias);
  const [ultimas, setUltimas] = useState(false);
  useEffect(() => { if (estadoRota) setEstadoRota(null); }, []);
  const pendRec = (dados.recebimentos || []).filter((r) => r.divergencia && !r.ciente_por);

  const todos = useMemo(() => dados.pedidos.map((p) => ({ ...p, r: resumoPedido(p, dados) })), [dados]);
  const qtdDivPend = todos.filter((p) => p.r.divPendente).length;
  const linhas = useMemo(() => todos.filter((p) => {
    if (filtro === 'pendentes' && !p.r.pendente) return false;
    if (filtro === 'atrasados' && !p.r.atrasado) return false;
    if (filtro === 'divergencia' && !p.r.divPendente) return false;
    if (filtro === 'divergentes' && !p.r.divergencia) return false;
    if (STATUS_PEDIDO[filtro] && p.status !== filtro) return false;
    if (de && p.data_pedido < de) return false;
    if (ate && p.data_pedido > ate) return false;
    if (forn && p.fornecedor_id !== forn) return false;
    return contem(`${numeroPedido(p.id)} ${p.id} ${p.r.fornecedor?.nome} ${p.observacao}`, busca);
  }), [todos, busca, filtro, de, ate, forn]);
  const total = linhas.reduce((s, p) => s + p.r.valor, 0);
  const pedidoAberto = aberto && dados.pedidos.find((p) => p.id === aberto);

  const colExp = [
    { titulo: 'Pedido', valor: (p) => numeroPedido(p.id) }, { titulo: 'Data do pedido', valor: (p) => data(p.data_pedido) },
    { titulo: 'Fornecedor', valor: (p) => p.r.fornecedor?.nome }, { titulo: 'Previsão de entrega', valor: (p) => data(p.previsao_entrega) },
    { titulo: 'Previsão de pagamento', valor: (p) => data(p.previsao_pagamento) }, { titulo: 'Financeiro', valor: (p) => (p.fin_lancado ? 'Lançado' : 'Pendente') },
    { titulo: 'Dias p/ chegar', valor: (p) => p.r.dias, num: true }, { titulo: 'Valor total', valor: (p) => Number(p.r.valor.toFixed(2)), texto: (p) => moeda(p.r.valor), num: true },
    { titulo: '% recebido', valor: (p) => Math.round(p.r.perc), num: true }, { titulo: 'Situação', valor: (p) => STATUS_PEDIDO[p.status] },
    { titulo: 'Divergência', valor: (p) => (p.r.divPendente ? 'aguardando ciência' : p.r.divergencia ? 'ciente' : '') },
    { titulo: 'Recebido por', valor: (p) => (p.r.recebidoPor ? nomeUsuario(p.r.recebidoPor) : '') },
  ];
  const abasPedidos = () => { const itens = linhas.flatMap((p) => p.r.itens.map((i) => ({ p, i, pr: dados.mapa.produto.get(i.produto_id) })));
    return [
          { nome: 'Pedidos', colunas: colExp, linhas },
          { nome: 'Itens', linhas: itens, colunas: [
            { titulo: 'Pedido', valor: (x) => numeroPedido(x.p.id) }, { titulo: 'Data', valor: (x) => data(x.p.data_pedido) },
            { titulo: 'Fornecedor', valor: (x) => x.p.r.fornecedor?.nome }, { titulo: 'Código', valor: (x) => x.pr?.codigo },
            { titulo: 'Produto', valor: (x) => x.pr?.descricao }, { titulo: 'Qtd', valor: (x) => Number(x.i.quantidade) },
            { titulo: 'Unid.', valor: (x) => x.i.unidade }, { titulo: 'Preço unit.', valor: (x) => Number(x.i.preco_unitario) },
            { titulo: 'Total', valor: (x) => Number(x.i.valor_total) }, { titulo: 'Recebido (un. estoque)', valor: (x) => Number(x.i.qtd_recebida_base) },
            { titulo: 'Pendente (un. estoque)', valor: (x) => (x.p.r.pendente ? Math.max(Number(x.i.quantidade_base) - Number(x.i.qtd_recebida_base), 0) : 0) },
            { titulo: 'Unid. estoque', valor: (x) => x.pr?.unidade_estoque }, { titulo: 'Situação', valor: (x) => STATUS_PEDIDO[x.p.status] }] },
        ]; };

  return html`
    <${Cabecalho} titulo="Pedidos de compra" sub="Pedidos feitos, o que falta chegar e o que já chegou">
      <${Exportar} titulo="Pedidos de compra" filtros=${pl(linhas.length, 'pedido', 'pedidos')} arquivo=${`pedidos-${hojeISO()}`} colunas=${colExp} linhas=${linhas}
        abas=${abasPedidos} totais=${['', '', '', '', '', '', 'TOTAL', moeda(total), '', '', '', '']} />
      <button class="btn btn-sec" onClick=${() => setUltimas(true)}>Últimas compras</button>
      ${podeFazer('pedido') && html`<button class="btn btn-pri" onClick=${() => setEditando({})}><${Icone} nome="mais" tam=${18} /> Novo pedido</button>`}
    </${Cabecalho}>
    ${ultimas && html`<${UltimasCompras} aoFechar=${() => setUltimas(false)} />`}
    ${pendRec.length > 0 && html`<div class="aviso-faixa">
      <span>⚠ <b>${pl(pendRec.length, 'recebimento', 'recebimentos')} aguardando a ciência do comprador</b>${' '}
        (${[qtdDivPend && pl(qtdDivPend, 'pedido com divergência', 'pedidos com divergência'), pendRec.filter((r) => !r.pedido_id).length && pl(pendRec.filter((r) => !r.pedido_id).length, 'sem pedido', 'sem pedido')].filter(Boolean).join(' · ')}).</span>
      <button class="btn btn-destaque btn-peq" onClick=${() => setPendencias(true)}>Ver e dar ciência</button></div>`}
    <div class="filtros">
      <${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Nº do pedido ou fornecedor" />
      <select class="entrada" value=${filtro} onChange=${(e) => setFiltro(e.target.value)}>
        <option value="pendentes">Pendentes de entrega</option>
        <option value="atrasados">Atrasados</option>
        <option value="divergencia">Divergência aguardando ciência</option>
        <option value="divergentes">Recebidos com divergência (todos)</option>
        <option value="todos">Todos</option>
        ${Object.entries(STATUS_PEDIDO).map(([k, v]) => html`<option value=${k}>${v}</option>`)}
      </select>
      <label class="campo-inline">Pedido de <input class="entrada" type="date" value=${de} onChange=${(e) => setDe(e.target.value)} /></label>
      <label class="campo-inline">até <input class="entrada" type="date" value=${ate} onChange=${(e) => setAte(e.target.value)} /></label>
      <div class="filtro-escolher"><${Escolher} itens=${dados.fornecedores} valor=${forn} aoMudar=${setForn} rotuloDe=${(f) => f.nome} placeholder="Fornecedor (todos)" /></div>
      ${forn && html`<button class="btn btn-sec" onClick=${() => setForn(null)}>Limpar fornecedor</button>`}
    </div>
    <${Tabela} linhas=${linhas} aoClicar=${(p) => setAberto(p.id)} ordemInicial=${{ chave: 'id', dir: -1 }}
      colunas=${[
        { chave: 'id', titulo: 'Pedido', render: (p) => html`<b>${numeroPedido(p.id)}</b>` },
        { chave: 'data_pedido', titulo: 'Data', render: (p) => data(p.data_pedido) },
        { chave: 'forn', titulo: 'Fornecedor', valor: (p) => p.r.fornecedor?.nome, render: (p) => p.r.fornecedor?.nome },
        { chave: 'previsao_entrega', titulo: 'Previsão', render: (p) => data(p.previsao_entrega) },
        { chave: 'dias', titulo: 'Prazo', valor: (p) => p.r.dias ?? 9999, render: (p) => html`<${PrazoEtiqueta} r=${p.r} />` },
        { chave: 'valor', titulo: 'Valor total', num: true, valor: (p) => p.r.valor, render: (p) => moeda(p.r.valor) },
        { chave: 'perc', titulo: 'Recebido', num: true, valor: (p) => p.r.perc, render: (p) => `${num(p.r.perc, 0)}%` },
        { chave: 'rp', titulo: 'Recebido por', valor: (p) => p.r.recebidoPor?.nome, render: (p) => p.r.recebidoPor?.nome || '–' },
        { chave: 'status', titulo: 'Situação', valor: (p) => (p.r.divPendente ? 0 : 1) + p.status, render: (p) => html`<${SituacaoPedido} pedido=${p} r=${p.r} />` },
      ]}
      rodape=${linhas.length > 1 && html`<tr><td colspan="5">${pl(linhas.length, 'pedido', 'pedidos')}</td><td class="n"><b>${moeda(total)}</b></td><td colspan="3"></td></tr>`} />
    ${pedidoAberto && html`<${PedidoDetalhe} pedido=${pedidoAberto} aoFechar=${() => setAberto(null)}
      aoEditar=${() => { setEditando(pedidoAberto); setAberto(null); }} />`}
    ${editando && html`<${FormPedido} pedido=${editando} aoFechar=${(id) => { setEditando(null); if (id) setAberto(id); }} />`}
    ${pendencias && html`<${PendenciasCiencia} aoFechar=${() => setPendencias(false)} aoAbrirPedido=${(id) => { setPendencias(false); setAberto(id); }} />`}`;
}

// Todos os recebimentos (com pedido divergente ou SEM pedido) esperando a ciência do comprador
export function PendenciasCiencia({ aoFechar, aoAbrirPedido }) {
  const { dados, podeFazer } = useApp();
  const [ciencia, setCiencia] = useState(null);
  const lista = (dados.recebimentos || []).filter((r) => r.divergencia && !r.ciente_por).sort((a, b) => b.id - a.id);
  const perfil = (id) => dados.mapa.perfil.get(id);
  return html`<${Modal} titulo="Recebimentos aguardando ciência" aoFechar=${aoFechar} largo>
    ${lista.length === 0 ? html`<p class="nota">Nenhuma pendência. Tudo ciente!</p>` : html`<div class="lista-recebimentos">${lista.map((rc) => html`
      <div class="recebimento div-pend">
        <div class="rc-topo"><b>${rc.pedido_id ? numeroPedido(rc.pedido_id) : 'SEM PEDIDO'}</b><span>${dataHora(rc.data_hora)} · NF ${rc.nota_fiscal || '–'}</span></div>
        <div>${dados.mapa.fornecedor.get(rc.fornecedor_id)?.nome || 'Fornecedor não informado'}</div>
        <div>Recebido por <b>${nomeUsuario(perfil(rc.usuario_id))}</b></div>
        <div class="rc-div"><ul>${String(rc.divergencia_detalhe || '').split('\n').map((l) => html`<li>${l}</li>`)}</ul></div>
        <div><b>Ressalva:</b> ${rc.observacao || '–'}</div>
        <div>Comprador avisado no momento: <b>${rc.comprador_avisado ? 'sim' : 'não informado'}</b></div>
        <div class="rc-pend">
          ${rc.pedido_id && aoAbrirPedido ? html`<button class="btn btn-sec" onClick=${() => aoAbrirPedido(rc.pedido_id)}>Abrir pedido</button>` : html`<span></span>`}
          ${podeFazer('pedido') && html`<button class="btn btn-pri" onClick=${() => setCiencia(rc)}>Estou ciente</button>`}
        </div>
      </div>`)}</div>`}
    ${ciencia && html`<${DarCiencia} rec=${ciencia} aoFechar=${() => setCiencia(null)} />`}
  </${Modal}>`;
}

// --------------------------- DETALHE --------------------------------
export function PedidoDetalhe({ pedido, aoFechar, aoEditar }) {
  const { dados, podeFazer, ir, recarregar, api } = useApp();
  const r = resumoPedido(pedido, dados);
  const [ocupado, executar] = useAcao();
  const [ciencia, setCiencia] = useState(null);
  const [ajustar, setAjustar] = useState(false);
  const perfil = (id) => dados.mapa.perfil.get(id);
  const comprador = perfil(pedido.comprador_id);

  async function gerar(tipo) {
    try {
      const doc = await pdfPedido({ pedido: { ...pedido, status_rotulo: STATUS_PEDIDO[pedido.status] }, itens: r.itens, fornecedor: r.fornecedor,
        produtos: dados.mapa.produto, params: dados.params, comprador: comprador?.nome });
      if (tipo === 'zap') {
        const res = await compartilhar(pdfBlob(doc), `${numeroPedido(pedido.id)}.pdf`, `Pedido de compra ${numeroPedido(pedido.id)} — ${dados.params.empresa_nome || 'Pães São Sebastião'}`);
        if (res === 'baixado') avisar(`PDF baixado. No WhatsApp que abriu, escolha o contato e anexe "${numeroPedido(pedido.id)}.pdf".`, 'aviso');
      } else if (tipo === 'pdf') salvarPDF(doc, `${numeroPedido(pedido.id)}.pdf`); else imprimirPDF(doc);
    } catch (e) { avisar(mensagemErro(e), 'erro'); }
  }
  async function gerarExcel() {
    try {
      await excel(`${numeroPedido(pedido.id)}.xlsx`, [{ nome: numeroPedido(pedido.id), linhas: r.itens, colunas: [
        { titulo: 'Código', valor: (i) => dados.mapa.produto.get(i.produto_id)?.codigo },
        { titulo: 'Descrição', valor: (i) => dados.mapa.produto.get(i.produto_id)?.descricao, largura: 40 },
        { titulo: 'Quantidade', valor: (i) => Number(i.quantidade) }, { titulo: 'Unidade', valor: (i) => i.unidade },
        { titulo: 'Preço unitário', valor: (i) => Number(i.preco_unitario) }, { titulo: 'Total', valor: (i) => Number(i.valor_total) }] }]);
    } catch (e) { avisar(mensagemErro(e), 'erro'); }
  }
  async function cancelar() {
    const recebeu = r.itens.some((i) => i.qtd_recebida_base > 0);
    let motivo = '';
    const ok = await confirmar({ titulo: recebeu ? 'Encerrar pedido' : 'Cancelar pedido', perigo: true, ok: recebeu ? 'Encerrar' : 'Cancelar pedido',
      mensagem: html`<p>${recebeu ? 'O pedido já teve recebimento. Encerrar significa que o restante não vai mais chegar.' : 'O pedido será cancelado.'}</p>
        <${Campo} rotulo="Motivo" obrigatorio><input class="entrada" onInput=${(e) => { motivo = e.target.value; }} /></${Campo}>` });
    if (!ok) return;
    if (await executar(() => api.rpc('cancelar_pedido', { p_id: pedido.id, p_motivo: motivo }), 'Pedido atualizado.')) { await recarregar(); aoFechar(); }
  }

  return html`<${Modal} titulo=${`${numeroPedido(pedido.id)} · ${r.fornecedor?.nome || ''}`} aoFechar=${aoFechar} largo
    rodape=${html`
      <button class="btn btn-sec" onClick=${() => gerar('pdf')}><${Icone} nome="pdf" tam=${18} /> PDF</button>
      <button class="btn btn-sec" onClick=${gerarExcel}><${Icone} nome="excel" tam=${18} /> Excel</button>
      <button class="btn btn-sec so-tela" onClick=${() => gerar('imprimir')}><${Icone} nome="imprimir" tam=${18} /> Imprimir</button>
      <button class="btn btn-zap" title="Enviar o PDF do pedido (ex.: para o fornecedor)" onClick=${() => gerar('zap')}><${Icone} nome="whatsapp" tam=${18} /> WhatsApp</button>
      <span class="espaco"></span>
      ${r.pendente && podeFazer('pedido') && html`<button class="btn btn-perigo-sec" disabled=${ocupado} onClick=${cancelar}>Cancelar / encerrar</button>`}
      ${r.pendente && podeFazer('pedido') && aoEditar && html`<button class="btn btn-sec" onClick=${aoEditar}>Editar</button>`}
      ${r.pendente && podeFazer('recebimento') && html`<button class="btn btn-pri" onClick=${() => ir('receber', { pedido: pedido.id })}>Receber</button>`}`}>
    <div class="info-grade">
      <div><small>Situação</small><${SituacaoPedido} pedido=${pedido} r=${r} /></div>
      <div><small>Data do pedido</small><b>${data(pedido.data_pedido)}</b></div>
      <div><small>Previsão de entrega</small><b>${data(pedido.previsao_entrega)}</b></div>
      <div><small>Prazo</small><${PrazoEtiqueta} r=${r} /></div>
      <div><small>Valor total</small><b>${moeda(r.valor)}</b></div>
      <div><small>Recebido</small><b>${num(r.perc, 0)}%</b></div>
      <div><small>Pagamento</small><b>${pedido.condicao_pagamento || '–'}</b></div>
      <div><small>Previsão de pagamento</small><b>${data(pedido.previsao_pagamento)}</b>
        ${podeFazer('data_pagamento') && pedido.status !== 'cancelado' && html`<button class="btn-link" onClick=${() => setAjustar(true)}>ajustar</button>`}</div>
      <div><small>Financeiro</small>${pedido.fin_lancado ? html`<${Etiqueta} cor="verde">lançado no contas a pagar</${Etiqueta}>` : html`<${Etiqueta} cor="laranja">pendente de lançar</${Etiqueta}>`}</div>
    </div>
    ${pedido.fin_obs && html`<p class="nota">Financeiro: ${pedido.fin_obs}</p>`}
    ${ajustar && html`<${AjustarPagamento} pedido=${pedido} aoFechar=${() => setAjustar(false)} aoSalvo=${aoFechar} />`}
    <p class="autoria">Criado por <b>${nomeUsuario(comprador)}</b> em ${dataHora(pedido.criado_em)}${pedido.atualizado_em
      ? html` · última alteração por <b>${nomeUsuario(perfil(pedido.atualizado_por))}</b> em ${dataHora(pedido.atualizado_em)}` : ''}</p>
    ${pedido.observacao && html`<p class="nota"><b>Obs.:</b> ${pedido.observacao}</p>`}
    ${pedido.motivo_cancelamento && html`<p class="nota"><b>Motivo do cancelamento/encerramento:</b> ${pedido.motivo_cancelamento}</p>`}
    <${Tabela} linhas=${r.itens} colunas=${[
      { chave: 'p', titulo: 'Produto', valor: (i) => dados.mapa.produto.get(i.produto_id)?.descricao,
        render: (i) => { const p = dados.mapa.produto.get(i.produto_id); return html`<b>${p?.descricao}</b><br /><small>${p?.codigo}</small>`; } },
      { chave: 'quantidade', titulo: 'Pedido', num: true, render: (i) => qu(i.quantidade, i.unidade) },
      { chave: 'preco_unitario', titulo: 'Preço unit.', num: true, render: (i) => moeda(i.preco_unitario) },
      { chave: 'valor_total', titulo: 'Total', num: true, render: (i) => moeda(i.valor_total) },
      { chave: 'qtd_recebida_base', titulo: 'Recebido', num: true, render: (i) => { const p = dados.mapa.produto.get(i.produto_id); return qu(i.qtd_recebida_base / fator(p, i.unidade), i.unidade); } },
      { chave: 'pend', titulo: 'Falta', num: true, valor: (i) => i.quantidade_base - i.qtd_recebida_base, render: (i) => { const p = dados.mapa.produto.get(i.produto_id); const f = fator(p, i.unidade);
          const falta = Math.max(i.quantidade_base - i.qtd_recebida_base, 0) / f; const excesso = Math.max(i.qtd_recebida_base - i.quantidade_base, 0) / f;
          return excesso > 0 ? html`<${Etiqueta} cor="laranja">+${qu(excesso, i.unidade)} a mais</${Etiqueta}>` : falta > 0 ? (r.pendente ? html`<b>${qu(falta, i.unidade)}</b>` : html`<small>${qu(falta, i.unidade)} (não virá)</small>`) : '✓'; } },
    ]} />
    <h3>Recebimentos</h3>
    ${r.recebimentos.length === 0 ? html`<p class="nota">Nada recebido ainda.</p>`
      : html`<div class="lista-recebimentos">${r.recebimentos.map((rc) => html`<div class=${'recebimento' + (rc.divergencia ? (rc.ciente_por ? ' div-ok' : ' div-pend') : '')}>
          <div class="rc-topo"><b>${dataHora(rc.data_hora)}</b><span>NF ${rc.nota_fiscal || '–'}</span></div>
          <div>Recebido por <b>${nomeUsuario(perfil(rc.usuario_id))}</b></div>
          ${rc.divergencia && html`
            <div class="rc-div"><b>Recebido com divergência:</b><ul>${String(rc.divergencia_detalhe || '').split('\n').map((l) => html`<li>${l}</li>`)}</ul></div>
            <div><b>Ressalva:</b> ${rc.observacao || '–'}</div>
            <div>Comprador avisado no momento do recebimento: <b>${rc.comprador_avisado ? 'sim' : 'não informado'}</b></div>
            ${rc.ciente_por ? html`<div class="rc-ciente">✓ Ciente: <b>${nomeUsuario(perfil(rc.ciente_por))}</b> em ${dataHora(rc.ciente_em)}${rc.ciente_obs ? ` — "${rc.ciente_obs}"` : ''}</div>`
              : html`<div class="rc-pend"><${Etiqueta} cor="laranja">Aguardando ciência do comprador</${Etiqueta}>
                  ${podeFazer('pedido') && html`<button class="btn btn-pri" onClick=${() => setCiencia(rc)}>Estou ciente</button>`}</div>`}`}
          ${!rc.divergencia && rc.observacao && html`<div><small>Obs.: ${rc.observacao}</small></div>`}
        </div>`)}</div>`}
    <${HistoricoAuditoria} tabela="pedidos" id=${pedido.id} />
    ${ciencia && html`<${DarCiencia} rec=${ciencia} aoFechar=${() => setCiencia(null)} />`}
  </${Modal}>`;
}

function DarCiencia({ rec, aoFechar }) {
  const { dados, recarregar, api } = useApp();
  const [obs, setObs] = useState('');
  const [ocupado, executar] = useAcao();
  async function salvar() {
    if (await executar(() => api.rpc('dar_ciencia_divergencia', { p_recebimento: rec.id, p_obs: obs }), 'Ciência registrada.')) { await recarregar(); aoFechar(); }
  }
  return html`<${Modal} titulo="Dar ciência da divergência" aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Voltar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>Confirmar: estou ciente</button>`}>
    <ul class="lista-simples">${String(rec.divergencia_detalhe || '').split('\n').map((l) => html`<li>${l}</li>`)}</ul>
    <p><b>Ressalva de ${dados.mapa.perfil.get(rec.usuario_id)?.nome}:</b> ${rec.observacao}</p>
    <${Campo} rotulo="Comentário (opcional)"><input class="entrada" value=${obs} onInput=${(e) => setObs(e.target.value)} placeholder="ex.: autorizei por telefone; vou negociar o preço" /></${Campo}>
    <p class="nota">Isto registra, com seu usuário, data e hora, que você foi informado e está ciente da divergência. O estoque já foi atualizado no recebimento.</p>
  </${Modal}>`;
}

// --------------------------- FORMULÁRIO -----------------------------
function ultimoPreco(dados, produtoId, unidade) {
  const its = dados.pedidoItens.filter((i) => i.produto_id === produtoId && Number(i.preco_unitario) > 0).sort((a, b) => b.id - a.id);
  const mesma = its.find((i) => i.unidade === unidade);
  if (mesma) return Number(mesma.preco_unitario);
  const p = dados.mapa.produto.get(produtoId);
  if (its[0] && p) return (Number(its[0].preco_unitario) / fator(p, its[0].unidade)) * fator(p, unidade);
  return p && p.custo_medio ? p.custo_medio * fator(p, unidade) : null;
}
const virgula = (v) => (v === null || v === undefined ? '' : String(Math.round(v * 10000) / 10000).replace('.', ','));

function FormPedido({ pedido, aoFechar }) {
  const { dados, recarregar, api } = useApp();
  useHistorico(somarDias(hojeISO(), -365));   // último preço de itens comprados há mais tempo
  const novo = !pedido.id;
  const hoje = hojeISO();
  const itensAtuais = novo ? [] : dados.pedidoItens.filter((i) => i.pedido_id === pedido.id);
  const [f, setF] = useState({ fornecedor_id: pedido.fornecedor_id || null, data_pedido: pedido.data_pedido || hoje,
    previsao_entrega: pedido.previsao_entrega || '', previsao_pagamento: pedido.previsao_pagamento || '', condicao_pagamento: pedido.condicao_pagamento || '', observacao: pedido.observacao || '' });
  const [prevManual, setPrevManual] = useState(!novo);
  const [historico, setHistorico] = useState(null);
  const [linhas, setLinhas] = useState(() => itensAtuais.length ? itensAtuais.map((i) => ({ k: i.id, id: i.id, produto_id: i.produto_id,
    quantidade: virgula(i.quantidade), unidade: i.unidade, preco: virgula(i.preco_unitario), recebido: i.qtd_recebida_base > 0 }))
    : [{ k: Math.random(), produto_id: null, quantidade: '', unidade: null, preco: '' }]);
  const [ocupado, executar] = useAcao();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const mudar = (k, ch) => setLinhas((l) => l.map((x) => (x.k === k ? { ...x, ...ch } : x)));
  const total = linhas.reduce((s, l) => s + (n(l.quantidade) || 0) * (n(l.preco) || 0), 0);
  const fornecedor = dados.mapa.fornecedor.get(f.fornecedor_id);

  function escolherFornecedor(id, fo) {
    setF((x) => ({ ...x, fornecedor_id: id, previsao_entrega: !prevManual && fo?.prazo_entrega_dias ? somarDias(x.data_pedido, fo.prazo_entrega_dias) : x.previsao_entrega,
      condicao_pagamento: x.condicao_pagamento || fo?.condicao_pagamento || '' }));
  }
  function escolherProduto(k, id, p) {
    const un = p.unidade_compra || p.unidade_estoque;
    mudar(k, { produto_id: id, unidade: un, preco: virgula(ultimoPreco(dados, id, un)) });
  }
  function adicionarSugestoes() {
    const sug = dados.ind.filter((p) => p.ativo && p.sugestao_compra > 0 && (!f.fornecedor_id || p.fornecedor_padrao_id === f.fornecedor_id)
      && !linhas.some((l) => l.produto_id === p.id));
    if (!sug.length) return avisar('Nenhuma sugestão de compra' + (fornecedor ? ` para ${fornecedor.nome}` : '') + ' no momento.', 'aviso');
    const novas = sug.map((p) => { const un = p.unidade_compra || p.unidade_estoque;
      return { k: Math.random(), produto_id: p.id, unidade: un, quantidade: virgula(p.unidade_compra ? p.sugestao_compra : Math.ceil(p.sugestao_base)), preco: virgula(ultimoPreco(dados, p.id, un)) }; });
    setLinhas((l) => [...l.filter((x) => x.produto_id), ...novas]);
    avisar(`${novas.length === 1 ? '1 item sugerido adicionado' : `${novas.length} itens sugeridos adicionados`}. Confira as quantidades.`);
  }
  async function salvar() {
    const itens = linhas.filter((l) => l.produto_id).map((l) => ({ id: l.id || null, produto_id: l.produto_id, quantidade: n(l.quantidade), unidade: l.unidade, preco_unitario: n(l.preco) || 0 }));
    if (!f.previsao_pagamento) return avisar('Informe a previsão de pagamento: o financeiro usa para lançar no contas a pagar.', 'erro');
    const id = await executar(() => api.rpc('salvar_pedido', { p: { ...f, id: pedido.id || null, previsao_entrega: f.previsao_entrega || null, itens } }),
      novo ? 'Pedido criado.' : 'Pedido alterado.');
    if (id) { await recarregar(); aoFechar(pedido.id || id); }
  }

  // sugestão de pagamento: 1º número da condição (ex.: "28 dias", "28/35/42") contado da entrega (ou do pedido)
  const diasCond = (() => { const m = String(f.condicao_pagamento || '').match(/\d+/); return m ? Number(m[0]) : null; })();
  const sugestaoPgto = diasCond !== null && (f.previsao_entrega || f.data_pedido) ? somarDias(f.previsao_entrega || f.data_pedido, diasCond) : null;
  return html`<${Modal} titulo=${novo ? 'Novo pedido de compra' : `Editar ${numeroPedido(pedido.id)}`} aoFechar=${() => aoFechar(null)} largo
    rodape=${html`<button class="btn btn-sec" onClick=${() => aoFechar(null)}>Cancelar</button>
      <button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>${ocupado ? 'Salvando…' : 'Salvar pedido'}</button>`}>
    <div class="grade">
      <${Campo} rotulo="Fornecedor" obrigatorio classe="larga">
        <${Escolher} itens=${dados.fornecedores.filter((x) => x.ativo)} valor=${f.fornecedor_id} aoMudar=${escolherFornecedor} rotuloDe=${(x) => x.nome} /></${Campo}>
      <${Campo} rotulo="Data do pedido" obrigatorio><input class="entrada" type="date" value=${f.data_pedido} onChange=${set('data_pedido')} /></${Campo}>
      <${Campo} rotulo="Previsão de entrega" ajuda=${fornecedor?.prazo_entrega_dias ? `Prazo habitual: ${pl(fornecedor.prazo_entrega_dias, 'dia', 'dias')}` : ''}>
        <input class="entrada" type="date" value=${f.previsao_entrega} onChange=${(e) => { setPrevManual(true); set('previsao_entrega')(e); }} /></${Campo}>
      <${Campo} rotulo="Condição de pagamento"><input class="entrada" placeholder="ex.: 28 dias" value=${f.condicao_pagamento} onInput=${set('condicao_pagamento')} /></${Campo}>
      <${Campo} rotulo="Previsão de pagamento" obrigatorio ajuda=${sugestaoPgto ? `Sugestão pela condição: ${data(sugestaoPgto)}` : 'Data em que o financeiro deve pagar.'}>
        <div class="linha-campo"><input class="entrada" type="date" value=${f.previsao_pagamento} onChange=${set('previsao_pagamento')} />
        ${sugestaoPgto && sugestaoPgto !== f.previsao_pagamento && html`<button type="button" class="btn btn-sec btn-peq" onClick=${() => setF((x) => ({ ...x, previsao_pagamento: sugestaoPgto }))}>Usar ${data(sugestaoPgto).slice(0, 5)}</button>`}</div></${Campo}>
      <${Campo} rotulo="Observação" classe="larga"><textarea class="entrada" rows="2" value=${f.observacao} onInput=${set('observacao')}></textarea></${Campo}>
    </div>
    <div class="titulo-com-acao"><h3>Itens</h3><button class="btn btn-sec" onClick=${adicionarSugestoes}>+ Sugestões de compra</button></div>
    <div class="linhas-itens">
      ${linhas.map((l) => { const p = dados.mapa.produto.get(l.produto_id); const ip = dados.mapa.ind.get(l.produto_id);
        return html`<div class="linha-item linha-pedido" key=${l.k}>
          <div class="li-prod">
            <${Escolher} itens=${dados.produtos.filter((x) => x.ativo)} valor=${l.produto_id} desabilitado=${l.recebido}
              rotuloDe=${(x) => `${x.codigo} · ${x.descricao}`} aoMudar=${(id, pr) => escolherProduto(l.k, id, pr)} placeholder="Produto…" />
            ${ip && html`<small class="dica">Saldo ${qu(ip.saldo, ip.unidade_estoque)} · consumo ${num(ip.media_dia, 1)}/dia${ip.sugestao_compra ? ` · sugestão ${qu(ip.sugestao_compra, ip.unidade_compra || ip.unidade_estoque, 0)}` : ''}</small>`}
            ${l.produto_id && html`<${DicaUltimaCompra} produtoId=${l.produto_id} fornecedorId=${f.fornecedor_id} pedidoId=${pedido.id} aoVer=${() => setHistorico(l.produto_id)} />`}
          </div>
          <${QtdUnidade} produto=${p} valor=${l.quantidade} unidade=${l.unidade} desabilitado=${!p}
            aoMudar=${(v, u) => mudar(l.k, u !== l.unidade ? { quantidade: v, unidade: u, preco: virgula(ultimoPreco(dados, l.produto_id, u)) } : { quantidade: v })} />
          <div class="li-preco"><small>Preço por ${l.unidade || 'unidade'}</small><${Numero} valor=${l.preco} aoMudar=${(v) => mudar(l.k, { preco: v })} placeholder="0,00" /></div>
          <div class="li-total"><small>Total</small><b>${moeda((n(l.quantidade) || 0) * (n(l.preco) || 0))}</b></div>
          ${!l.recebido ? html`<button class="btn-icone btn-remover" title="Remover" onClick=${() => setLinhas((x) => x.filter((y) => y.k !== l.k))}>✕</button>` : html`<span class="btn-icone" title="Item já recebido">🔒</span>`}
        </div>`; })}
    </div>
    <div class="linha-total">
      <button class="btn btn-sec" onClick=${() => setLinhas((x) => [...x, { k: Math.random(), produto_id: null, quantidade: '', unidade: null, preco: '' }])}>+ Item</button>
      <span>Total do pedido: <b>${moeda(total)}</b></span>
    </div>
    ${historico && html`<${UltimasCompras} produtoInicial=${historico} aoFechar=${() => setHistorico(null)} />`}
  </${Modal}>`;
}

// Comprador ou financeiro: ajustar a previsão de pagamento (motivo obrigatório, fica no histórico)
export function AjustarPagamento({ pedido, aoFechar, aoSalvo }) {
  const { recarregar, api } = useApp();
  const [d, setD] = useState(pedido.previsao_pagamento || hojeISO());
  const [motivo, setMotivo] = useState('');
  const [ocupado, executar] = useAcao();
  async function salvar() {
    if (!motivo.trim()) return avisar('Informe o motivo da mudança.', 'erro');
    const r = await executar(() => api.rpc('ajustar_previsao_pagamento', { p_pedido: pedido.id, p_data: d, p_motivo: motivo }), 'Previsão de pagamento ajustada.');
    if (r) { await recarregar(); aoFechar(); if (aoSalvo) aoSalvo(); }
  }
  return html`<${Modal} titulo=${`Previsão de pagamento · ${numeroPedido(pedido.id)}`} aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Voltar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>Salvar nova data</button>`}>
    <p>Data atual: <b>${data(pedido.previsao_pagamento)}</b>${pedido.fin_lancado ? ' · já lançado no contas a pagar (avise o financeiro / ajuste lá também)' : ''}</p>
    <${Campo} rotulo="Nova previsão de pagamento" obrigatorio><input class="entrada" type="date" value=${d} onChange=${(e) => setD(e.target.value)} /></${Campo}>
    <${Campo} rotulo="Motivo" obrigatorio><input class="entrada" value=${motivo} onInput=${(e) => setMotivo(e.target.value)} placeholder="ex.: mercadoria atrasou; fornecedor prorrogou o boleto" /></${Campo}>
  </${Modal}>`;
}

// --------------------------- ÚLTIMAS COMPRAS ------------------------
// Histórico de preço por produto e fornecedor (pedidos não cancelados, do mais novo ao mais antigo)
export function historicoCompras(dados, { produtoId, fornecedorId, excetoPedido } = {}) {
  const ped = new Map(dados.pedidos.map((p) => [p.id, p]));
  return dados.pedidoItens.filter((i) => { const p = ped.get(i.pedido_id);
    return p && p.status !== 'cancelado' && i.pedido_id !== excetoPedido && Number(i.preco_unitario) > 0
      && (!produtoId || i.produto_id === produtoId) && (!fornecedorId || p.fornecedor_id === fornecedorId); })
    .map((i) => { const p = ped.get(i.pedido_id); const pr = dados.mapa.produto.get(i.produto_id);
      const f = pr ? fator(pr, i.unidade) : 1;
      return { ...i, chave: i.id, pedido: p, pr, forn: dados.mapa.fornecedor.get(p.fornecedor_id), data: p.data_pedido,
        precoBase: f ? Number(i.preco_unitario) / f : null }; })
    .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);
}

function DicaUltimaCompra({ produtoId, fornecedorId, pedidoId, aoVer }) {
  const { dados } = useApp();
  const todos = historicoCompras(dados, { produtoId, excetoPedido: pedidoId });
  if (!todos.length) return html`<small class="dica">Sem compra anterior deste produto.</small>`;
  const u = todos[0];
  const doForn = fornecedorId && u.pedido.fornecedor_id !== fornecedorId ? todos.find((x) => x.pedido.fornecedor_id === fornecedorId) : null;
  const txt = (x) => `${moeda(x.preco_unitario)}/${x.unidade} em ${data(x.data).slice(0, 5)}/${x.data.slice(2, 4)}`;
  return html`<small class="dica">Última compra: <b>${txt(u)}</b> (${u.forn?.nome}, ${numeroPedido(u.pedido.id)})${doForn ? html` · deste fornecedor: <b>${txt(doForn)}</b>` : ''}
    ${' '}<button type="button" class="btn-link" onClick=${aoVer}>histórico</button></small>`;
}

export function UltimasCompras({ aoFechar, produtoInicial, fornecedorInicial }) {
  const { dados } = useApp();
  useHistorico(somarDias(hojeISO(), -365));
  const [prod, setProd] = useState(produtoInicial || null);
  const [forn, setForn] = useState(fornecedorInicial || null);
  const [so, setSo] = useState(!produtoInicial);   // só a última de cada produto × fornecedor
  const [busca, setBusca] = useState('');
  const linhas = useMemo(() => {
    let l = historicoCompras(dados, { produtoId: prod, fornecedorId: forn });
    if (busca) l = l.filter((x) => contem(`${x.pr?.codigo} ${x.pr?.descricao} ${x.forn?.nome}`, busca));
    if (so) { const vistos = new Set(); l = l.filter((x) => { const k = `${x.produto_id}-${x.pedido.fornecedor_id}`; if (vistos.has(k)) return false; vistos.add(k); return true; }); }
    return l;
  }, [dados, prod, forn, so, busca]);
  const colunas = [
    { titulo: 'Data do pedido', valor: (x) => data(x.data) }, { titulo: 'Pedido', valor: (x) => numeroPedido(x.pedido.id) },
    { titulo: 'Fornecedor', valor: (x) => x.forn?.nome }, { titulo: 'Código', valor: (x) => x.pr?.codigo }, { titulo: 'Produto', valor: (x) => x.pr?.descricao, largura: 30 },
    { titulo: 'Qtd', valor: (x) => Number(x.quantidade), num: true }, { titulo: 'Unid.', valor: (x) => x.unidade },
    { titulo: 'Preço unit.', valor: (x) => Number(x.preco_unitario), texto: (x) => moeda(x.preco_unitario), num: true },
    { titulo: 'Preço por unid. estoque', valor: (x) => (x.precoBase === null ? '' : Math.round(x.precoBase * 10000) / 10000), texto: (x) => (x.precoBase === null ? '' : `${moeda(x.precoBase)}/${x.pr?.unidade_estoque}`), num: true },
    { titulo: 'Situação', valor: (x) => STATUS_PEDIDO[x.pedido.status] },
  ];
  return html`<${Modal} titulo="Últimas compras" aoFechar=${aoFechar} largo
    rodape=${html`<${Exportar} titulo="Últimas compras" filtros=${[prod && dados.mapa.produto.get(prod)?.descricao, forn && dados.mapa.fornecedor.get(forn)?.nome, so ? 'só a última de cada produto/fornecedor' : 'todas'].filter(Boolean).join(' · ')}
      arquivo=${`ultimas-compras-${hojeISO()}`} colunas=${colunas} linhas=${linhas} /><span class="espaco"></span><button class="btn btn-sec" onClick=${aoFechar}>Fechar</button>`}>
    <div class="filtros">
      <div class="filtro-escolher"><${Escolher} itens=${dados.produtos} valor=${prod} aoMudar=${setProd} rotuloDe=${(x) => `${x.codigo} · ${x.descricao}`} placeholder="Produto (todos)" /></div>
      ${prod && html`<button class="btn btn-sec btn-peq" onClick=${() => setProd(null)}>Limpar produto</button>`}
      <div class="filtro-escolher"><${Escolher} itens=${dados.fornecedores} valor=${forn} aoMudar=${setForn} rotuloDe=${(x) => x.nome} placeholder="Fornecedor (todos)" /></div>
      ${forn && html`<button class="btn btn-sec btn-peq" onClick=${() => setForn(null)}>Limpar fornecedor</button>`}
      ${!prod && html`<${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Buscar produto ou fornecedor" />`}
      <label class="check"><input type="checkbox" checked=${so} onChange=${(e) => setSo(e.target.checked)} /> Só a última de cada produto/fornecedor</label>
    </div>
    <${Tabela} linhas=${linhas} chave="chave" max=${300} vazio="Nenhuma compra encontrada."
      colunas=${[
        { chave: 'data', titulo: 'Data', render: (x) => html`${data(x.data)}<br /><small>${numeroPedido(x.pedido.id)}</small>` },
        { chave: 'forn', titulo: 'Fornecedor', valor: (x) => x.forn?.nome, render: (x) => x.forn?.nome },
        { chave: 'prod', titulo: 'Produto', valor: (x) => x.pr?.descricao, render: (x) => html`<b>${x.pr?.descricao}</b><br /><small>${x.pr?.codigo}</small>` },
        { chave: 'quantidade', titulo: 'Qtd', num: true, valor: (x) => Number(x.quantidade), render: (x) => qu(x.quantidade, x.unidade) },
        { chave: 'preco_unitario', titulo: 'Preço unit.', num: true, valor: (x) => Number(x.preco_unitario), render: (x) => html`<b>${moeda(x.preco_unitario)}</b>/${x.unidade}` },
        { chave: 'precoBase', titulo: 'Por unid. estoque', num: true, valor: (x) => x.precoBase ?? 0, render: (x) => (x.precoBase === null ? '–' : `${moeda(x.precoBase)}/${x.pr?.unidade_estoque}`) },
        { chave: 'st', titulo: 'Situação', valor: (x) => x.pedido.status, render: (x) => html`<${Etiqueta} cor=${COR_STATUS[x.pedido.status]}>${STATUS_PEDIDO[x.pedido.status]}</${Etiqueta}>` },
      ]} />
    <p class="nota">Preço do pedido (o que foi negociado). Se a nota veio com outro preço, a divergência aparece no recebimento do pedido.</p>
  </${Modal}>`;
}
