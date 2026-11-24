// Relatórios: pedidos, compras por produto, consumo do período, ajustes e correções
import { html, useState, useMemo, useEffect, useApp, Escolher, Busca, Etiqueta, Cabecalho, Abas, Tabela, Cartao, Carregando, Modal, avisar, useHistorico, Filtros, useFiltroMudou } from '../ui.js';
import { MP_EMB, casaCategoria, CATEGORIAS, STATUS_PEDIDO, TIPOS_MOV, MOTIVOS_INVENTARIO, qtd, num, moeda, data, dataHora, hojeISO, somarDias, diasEntre, numeroPedido, contem, fator, qu, pl, plural, nomeUsuario, mensagemErro } from '../util.js';
import { Exportar } from '../exportar.js';
import { resumoPedido, PrazoEtiqueta, PedidoDetalhe, COR_STATUS } from './pedidos.js';
import { Icone } from '../icones.js';

const primeiroDoMes = () => hojeISO().slice(0, 8) + '01';
const inicioDia = (iso) => new Date(iso + 'T00:00:00').toISOString();

export function TelaRelatorios() {
  const [aba, setAba] = useState('pedidos');
  const [de, setDe] = useState(somarDias(hojeISO(), -30));
  useHistorico(de);
  const [ate, setAte] = useState(hojeISO());
  const periodo = { de, ate };
  return html`
    <${Cabecalho} titulo="Relatórios" />
    <${Abas} abas=${[{ id: 'pedidos', titulo: 'Pedidos de compra' }, { id: 'produtos', titulo: 'Compras por produto' },
      { id: 'recebimentos', titulo: 'Recebimentos' }, { id: 'producoes', titulo: 'Produções (pesagem)' },
      { id: 'consumo', titulo: 'Consumo do período' }, { id: 'ajustes', titulo: 'Ajustes e correções' }]} ativa=${aba} aoMudar=${setAba} />
    <${Filtros} resumo=${`Período: ${data(de)} a ${data(ate)}`}>
      <label class="campo-inline">De <input class="entrada" type="date" value=${de} onChange=${(e) => setDe(e.target.value)} /></label>
      <label class="campo-inline">até <input class="entrada" type="date" value=${ate} onChange=${(e) => setAte(e.target.value)} /></label>
      <span class="chips">
        <button class="chip" onClick=${() => { setDe(primeiroDoMes()); setAte(hojeISO()); }}>Este mês</button>
        <button class="chip" onClick=${() => { setDe(somarDias(hojeISO(), -30)); setAte(hojeISO()); }}>30 dias</button>
        <button class="chip" onClick=${() => { setDe(somarDias(hojeISO(), -90)); setAte(hojeISO()); }}>90 dias</button>
      </span>
    </${Filtros}>
    ${aba === 'pedidos' && html`<${RelPedidos} ...${periodo} />`}
    ${aba === 'produtos' && html`<${RelComprasProduto} ...${periodo} />`}
    ${aba === 'recebimentos' && html`<${RelRecebimentos} ...${periodo} />`}
    ${aba === 'producoes' && html`<${RelProducoes} ...${periodo} />`}
    ${aba === 'consumo' && html`<${RelConsumo} ...${periodo} />`}
    ${aba === 'ajustes' && html`<${RelAjustes} ...${periodo} />`}`;
}

// ---------------------------- PEDIDOS -------------------------------
function RelPedidos({ de, ate }) {
  const { dados } = useApp();
  const [status, setStatus] = useState('');
  const [forn, setForn] = useState(null);
  const [aberto, setAberto] = useState(null);
  const linhas = useMemo(() => dados.pedidos.filter((p) => p.data_pedido >= de && p.data_pedido <= ate && (!forn || p.fornecedor_id === forn)
    && (!status || (status === 'pendentes' ? ['aberto', 'parcial'].includes(p.status) : p.status === status)))
    .map((p) => ({ ...p, r: resumoPedido(p, dados) })), [dados, de, ate, status, forn]);
  const soma = (f) => linhas.filter(f).reduce((s, p) => s + p.r.valor, 0);
  const total = soma(() => true);
  const pend = soma((p) => p.r.pendente);
  const atras = linhas.filter((p) => p.r.atrasado);
  const cols = [
    { titulo: 'Pedido', valor: (p) => numeroPedido(p.id) }, { titulo: 'Data do pedido', valor: (p) => data(p.data_pedido) },
    { titulo: 'Fornecedor', valor: (p) => p.r.fornecedor?.nome, largura: 30 }, { titulo: 'Previsão', valor: (p) => data(p.previsao_entrega) },
    { titulo: 'Dias p/ chegar', valor: (p) => p.r.dias, num: true }, { titulo: 'Valor total', valor: (p) => Math.round(p.r.valor * 100) / 100, texto: (p) => moeda(p.r.valor), num: true },
    { titulo: '% recebido', valor: (p) => Math.round(p.r.perc), num: true }, { titulo: 'Situação', valor: (p) => STATUS_PEDIDO[p.status] },
  ];
  return html`
    <div class="filtros">
      <select class="entrada" value=${status} onChange=${(e) => setStatus(e.target.value)}>
        <option value="">Todas as situações</option><option value="pendentes">Pendentes de entrega</option>
        ${Object.entries(STATUS_PEDIDO).map(([k, t]) => html`<option value=${k}>${t}</option>`)}</select>
      <div class="filtro-escolher"><${Escolher} itens=${dados.fornecedores} valor=${forn} aoMudar=${setForn} rotuloDe=${(f) => f.nome} placeholder="Fornecedor (todos)" /></div>
      ${forn && html`<button class="btn-link" onClick=${() => setForn(null)}>limpar</button>`}
      <${Exportar} tabela="relatorios.relpedidos" titulo="Pedidos de compra" arquivo=${`rel-pedidos-${de}-a-${ate}`} colunas=${cols} linhas=${linhas}
        filtros=${`Pedidos de ${data(de)} a ${data(ate)}`} totais=${['TOTAL', '', '', '', '', moeda(total), '', '']} />
    </div>
    <div class="cartoes">
      <${Cartao} titulo="Pedidos no período" valor=${linhas.length} sub=${moeda(total)} />
      <${Cartao} titulo="Pendente de entrega" valor=${moeda(pend)} sub=${pl(linhas.filter((p) => p.r.pendente).length, 'pedido', 'pedidos')} />
      <${Cartao} titulo="Atrasados" valor=${atras.length} cor=${atras.length ? 'c-vermelho' : ''} sub=${moeda(atras.reduce((s, p) => s + p.r.valor, 0))} />
      <${Cartao} titulo="Recebidos" valor=${moeda(soma((p) => p.status === 'recebido'))} />
    </div>
    <${Tabela} id="relatorios.relpedidos" linhas=${linhas} aoClicar=${(p) => setAberto(p.id)} ordemInicial=${{ chave: 'data_pedido', dir: -1 }} colunas=${[
      { chave: 'id', titulo: 'Pedido', render: (p) => html`<b>${numeroPedido(p.id)}</b>` },
      { chave: 'data_pedido', titulo: 'Data', render: (p) => data(p.data_pedido) },
      { chave: 'f', titulo: 'Fornecedor', valor: (p) => p.r.fornecedor?.nome, render: (p) => p.r.fornecedor?.nome },
      { chave: 'previsao_entrega', titulo: 'Previsão', render: (p) => data(p.previsao_entrega) },
      { chave: 'dias', titulo: 'Prazo', valor: (p) => p.r.dias ?? 9999, render: (p) => html`<${PrazoEtiqueta} r=${p.r} />` },
      { chave: 'valor', titulo: 'Valor', num: true, valor: (p) => p.r.valor, render: (p) => moeda(p.r.valor) },
      { chave: 'perc', titulo: 'Recebido', num: true, valor: (p) => p.r.perc, render: (p) => `${num(p.r.perc, 0)}%` },
      { chave: 'status', titulo: 'Situação', render: (p) => html`<${Etiqueta} cor=${COR_STATUS[p.status]}>${STATUS_PEDIDO[p.status]}</${Etiqueta}>` },
    ]} totais=${linhas.length > 1 && { rotulo: pl(linhas.length, 'pedido', 'pedidos'), valor: moeda(total) }} />
    ${aberto && html`<${PedidoDetalhe} pedido=${dados.pedidos.find((p) => p.id === aberto)} aoFechar=${() => setAberto(null)} />`}`;
}

// ---------------------------- COMPRAS POR PRODUTO -------------------
function RelComprasProduto({ de, ate }) {
  const { dados } = useApp();
  const [busca, setBusca] = useState('');
  const [cat, setCat] = useState(MP_EMB);
  const [aberto, setAberto] = useState(null);
  const ped = dados.mapa;
  const linhas = useMemo(() => dados.pedidoItens.map((i) => {
    const p = dados.pedidos.find((x) => x.id === i.pedido_id); const pr = ped.produto.get(i.produto_id);
    const f = fator(pr, i.unidade);
    return { ...i, p, pr, forn: ped.fornecedor.get(p?.fornecedor_id), recebido: i.qtd_recebida_base / f, pendente: ['aberto', 'parcial'].includes(p?.status) ? Math.max(i.quantidade_base - i.qtd_recebida_base, 0) / f : 0,
      preco_base: i.quantidade_base ? i.valor_total / i.quantidade_base : 0 };
  }).filter((x) => x.p && x.p.status !== 'cancelado' && x.p.data_pedido >= de && x.p.data_pedido <= ate && casaCategoria(cat, x.pr?.categoria)
    && contem(`${x.pr?.codigo} ${x.pr?.descricao} ${x.forn?.nome}`, busca)), [dados, de, ate, busca, cat]);
  const total = linhas.reduce((s, x) => s + Number(x.valor_total), 0);
  // resumo por produto
  const porProduto = useMemo(() => {
    const m = new Map();
    for (const x of linhas) {
      const a = m.get(x.produto_id) || { id: x.produto_id, pr: x.pr, base: 0, valor: 0, pedidos: 0, fornecedores: new Set() };
      a.base += Number(x.quantidade_base); a.valor += Number(x.valor_total); a.pedidos++; a.fornecedores.add(x.forn?.nome); m.set(x.produto_id, a);
    }
    return [...m.values()];
  }, [linhas]);
  const cols = [
    { titulo: 'Código', valor: (x) => x.pr?.codigo }, { titulo: 'Produto', valor: (x) => x.pr?.descricao, largura: 32 }, { titulo: 'Fornecedor', valor: (x) => x.forn?.nome, largura: 28 },
    { titulo: 'Pedido', valor: (x) => numeroPedido(x.pedido_id) }, { titulo: 'Data', valor: (x) => data(x.p.data_pedido) }, { titulo: 'Previsão', valor: (x) => data(x.p.previsao_entrega) },
    { titulo: 'Qtd', valor: (x) => Number(x.quantidade), num: true }, { titulo: 'Unid.', valor: (x) => x.unidade },
    { titulo: 'Preço unit.', valor: (x) => Number(x.preco_unitario), texto: (x) => moeda(x.preco_unitario), num: true },
    { titulo: 'Total', valor: (x) => Number(x.valor_total), texto: (x) => moeda(x.valor_total), num: true },
    { titulo: 'Recebido', valor: (x) => Math.round(x.recebido * 1000) / 1000, num: true }, { titulo: 'Pendente', valor: (x) => Math.round(x.pendente * 1000) / 1000, num: true },
    { titulo: 'Situação', valor: (x) => STATUS_PEDIDO[x.p.status] },
  ];
  return html`
    <div class="filtros">
      <${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Produto ou fornecedor" />
      <select class="entrada" value=${cat} onChange=${(e) => setCat(e.target.value)}><option value="">Todas as categorias</option><option value=${MP_EMB}>Matéria-prima e embalagem</option>
        ${Object.entries(CATEGORIAS).map(([k, t]) => html`<option value=${k}>${t}</option>`)}</select>
      <${Exportar} tabela="relatorios.relcomprasproduto" titulo="Compras por produto" arquivo=${`rel-compras-produto-${de}-a-${ate}`} colunas=${cols} linhas=${linhas}
        filtros=${`Pedidos de ${data(de)} a ${data(ate)}`} totais=${['TOTAL', '', '', '', '', '', '', '', '', moeda(total), '', '', '']} />
    </div>
    <h3>Resumo por produto</h3>
    <${Tabela} id="relatorios.relcomprasproduto" linhas=${porProduto} ordemInicial=${{ chave: 'valor', dir: -1 }} colunas=${[
      { chave: 'cod', titulo: 'Código', valor: (a) => a.pr?.codigo, render: (a) => a.pr?.codigo }, { chave: 'p', titulo: 'Produto', valor: (a) => a.pr?.descricao, render: (a) => html`<b>${a.pr?.descricao}</b>` },
      { chave: 'base', titulo: 'Quantidade comprada', num: true, render: (a) => `${qu(a.base, a.pr?.unidade_estoque)}${a.pr?.unidade_compra ? ` (${qu(a.base / a.pr.fator_compra, a.pr.unidade_compra, 1)})` : ''}` },
      { chave: 'valor', titulo: 'Valor', num: true, render: (a) => moeda(a.valor) },
      { chave: 'pm', titulo: 'Preço médio', num: true, valor: (a) => a.valor / a.base, render: (a) => `${moeda(a.base ? a.valor / a.base : 0)}/${a.pr?.unidade_estoque}` },
      { chave: 'pedidos', titulo: 'Pedidos', num: true },
      { chave: 'f', titulo: 'Fornecedores', render: (a) => [...a.fornecedores].join(', ') },
    ]} />
    <h3>Itens dos pedidos</h3>
    <${Tabela} id="relatorios.relcomprasproduto-2" linhas=${linhas} aoClicar=${(x) => setAberto(x.pedido_id)} ordemInicial=${{ chave: 'prod', dir: 1 }} colunas=${[
      { chave: 'prod', titulo: 'Produto', valor: (x) => `${x.pr?.descricao} ${x.p.data_pedido}`, render: (x) => html`<b>${x.pr?.descricao}</b>` },
      { chave: 'f', titulo: 'Fornecedor', valor: (x) => x.forn?.nome, render: (x) => x.forn?.nome },
      { chave: 'pedido_id', titulo: 'Pedido', render: (x) => numeroPedido(x.pedido_id) },
      { chave: 'd', titulo: 'Data', valor: (x) => x.p.data_pedido, render: (x) => data(x.p.data_pedido) },
      { chave: 'quantidade', titulo: 'Qtd', num: true, render: (x) => qu(x.quantidade, x.unidade) },
      { chave: 'preco_unitario', titulo: 'Preço unit.', num: true, render: (x) => moeda(x.preco_unitario) },
      { chave: 'valor_total', titulo: 'Total', num: true, render: (x) => moeda(x.valor_total) },
      { chave: 'pendente', titulo: 'Pendente', num: true, render: (x) => (x.pendente > 0 ? qu(x.pendente, x.unidade) : '–') },
      { chave: 's', titulo: 'Situação', valor: (x) => x.p.status, render: (x) => html`<${Etiqueta} cor=${COR_STATUS[x.p.status]}>${STATUS_PEDIDO[x.p.status]}</${Etiqueta}>` },
    ]} totais=${linhas.length > 1 && { rotulo: pl(linhas.length, 'item', 'itens'), valor_total: moeda(total) }} />
    ${aberto && html`<${PedidoDetalhe} pedido=${dados.pedidos.find((p) => p.id === aberto)} aoFechar=${() => setAberto(null)} />`}`;
}

// Carrega movimentos do período (usado por consumo e ajustes)
function useMovimentos(de, ate, tipos) {
  const { api, dados } = useApp();
  const [movs, setMovs] = useState(null);
  const mudou = useFiltroMudou([de, ate]);
  useEffect(() => {
    if (mudou()) setMovs(null);
    api.listar('movimentos', { desde: inicioDia(de), ate: inicioDia(somarDias(ate, 1)), em: tipos ? { tipo: tipos } : undefined })
      .then(setMovs).catch((e) => { avisar(mensagemErro(e), 'erro'); setMovs([]); });
  }, [de, ate, dados.carregadoEm]);
  return movs;
}

// ---------------------------- CONSUMO -------------------------------
function RelConsumo({ de, ate }) {
  const { dados } = useApp();
  const movs = useMovimentos(de, ate, ['saida_receita', 'saida_avulsa', 'saida_almox', 'correcao']);
  const [cat, setCat] = useState(MP_EMB);
  const dias = Math.max(diasEntre(de, ate) + 1, 1);
  const linhas = useMemo(() => {
    if (!movs) return [];
    const tipoDe = new Map(movs.map((m) => [m.id, m.tipo]));
    const m = new Map();
    for (const x of movs) {
      const tipo = x.tipo === 'correcao' ? tipoDe.get(x.corrige_id) : x.tipo;
      if (!tipo || tipo === 'correcao' || !['saida_receita', 'saida_avulsa', 'saida_almox'].includes(tipo)) continue;
      const pr = dados.mapa.produto.get(x.produto_id);
      if (!casaCategoria(cat, pr?.categoria)) continue;
      const a = m.get(x.produto_id) || { id: x.produto_id, pr, saida_receita: 0, saida_avulsa: 0, saida_almox: 0, valor: 0 };
      a[tipo] += -Number(x.quantidade); a.valor += -Number(x.valor); m.set(x.produto_id, a);
    }
    return [...m.values()].map((a) => ({ ...a, total: a.saida_receita + a.saida_avulsa + a.saida_almox, media: (a.saida_receita + a.saida_avulsa + a.saida_almox) / dias }));
  }, [movs, cat]);
  const totalValor = linhas.reduce((s, a) => s + a.valor, 0);
  const cols = [
    { titulo: 'Código', valor: (a) => a.pr?.codigo }, { titulo: 'Produto', valor: (a) => a.pr?.descricao, largura: 32 }, { titulo: 'Unid.', valor: (a) => a.pr?.unidade_estoque },
    { titulo: 'Por receita', valor: (a) => Math.round(a.saida_receita * 1000) / 1000, num: true }, { titulo: 'Avulsa', valor: (a) => Math.round(a.saida_avulsa * 1000) / 1000, num: true },
    { titulo: 'Almoxarifado', valor: (a) => Math.round(a.saida_almox * 1000) / 1000, num: true }, { titulo: 'Total', valor: (a) => Math.round(a.total * 1000) / 1000, num: true },
    { titulo: 'Média/dia', valor: (a) => Math.round(a.media * 1000) / 1000, num: true }, { titulo: 'Valor', valor: (a) => Math.round(a.valor * 100) / 100, texto: (a) => moeda(a.valor), num: true },
  ];
  if (!movs) return html`<${Carregando} />`;
  return html`
    <div class="filtros">
      <select class="entrada" value=${cat} onChange=${(e) => setCat(e.target.value)}><option value="">Todas as categorias</option><option value=${MP_EMB}>Matéria-prima e embalagem</option>
        ${Object.entries(CATEGORIAS).map(([k, t]) => html`<option value=${k}>${t}</option>`)}</select>
      <${Exportar} tabela="relatorios.relconsumo" titulo="Consumo do período" arquivo=${`rel-consumo-${de}-a-${ate}`} colunas=${cols} linhas=${linhas}
        filtros=${`${data(de)} a ${data(ate)} (${pl(dias, 'dia', 'dias')})`} totais=${['TOTAL', '', '', '', '', '', '', '', moeda(totalValor)]} />
    </div>
    <p class="nota">Saídas de ${data(de)} a ${data(ate)} (${pl(dias, 'dia', 'dias')}), já considerando as correções. Valor pelo custo médio do momento da saída.</p>
    <${Tabela} id="relatorios.relconsumo" linhas=${linhas} ordemInicial=${{ chave: 'valor', dir: -1 }} colunas=${[
      { chave: 'cod', titulo: 'Código', valor: (a) => a.pr?.codigo, render: (a) => a.pr?.codigo }, { chave: 'p', titulo: 'Produto', valor: (a) => a.pr?.descricao, render: (a) => html`<b>${a.pr?.descricao}</b>` },
      { chave: 'saida_receita', titulo: 'Por receita', num: true, render: (a) => qtd(a.saida_receita) },
      { chave: 'saida_avulsa', titulo: 'Avulsa', num: true, render: (a) => qtd(a.saida_avulsa) },
      { chave: 'saida_almox', titulo: 'Almoxarifado', num: true, render: (a) => qtd(a.saida_almox) },
      { chave: 'total', titulo: 'Total', num: true, render: (a) => html`<b>${qu(a.total, a.pr?.unidade_estoque)}</b>` },
      { chave: 'media', titulo: 'Média/dia', num: true, render: (a) => num(a.media, 2) },
      { chave: 'valor', titulo: 'Valor', num: true, render: (a) => moeda(a.valor) },
    ]} totais=${linhas.length > 1 && { rotulo: pl(linhas.length, 'produto', 'produtos'), valor: moeda(totalValor) }} />`;
}

// ---------------------------- AJUSTES E CORREÇÕES -------------------
function RelAjustes({ de, ate }) {
  const { dados } = useApp();
  const movs = useMovimentos(de, ate, ['inventario', 'correcao', 'saida_avulsa']);
  const [tipo, setTipo] = useState('');
  const lista = useMemo(() => (movs || []).filter((m) => !tipo || m.tipo === tipo), [movs, tipo]);
  const p = (m) => dados.mapa.produto.get(m.produto_id);
  const total = lista.reduce((s, m) => s + Number(m.valor), 0);
  const cols = [
    { titulo: 'Nº', valor: (m) => m.id }, { titulo: 'Data/hora', valor: (m) => dataHora(m.data_hora) }, { titulo: 'Produto', valor: (m) => p(m)?.descricao, largura: 30 },
    { titulo: 'Tipo', valor: (m) => TIPOS_MOV[m.tipo] }, { titulo: 'Quantidade', valor: (m) => Number(m.quantidade), num: true }, { titulo: 'Unid.', valor: (m) => p(m)?.unidade_estoque },
    { titulo: 'Valor', valor: (m) => Number(m.valor), texto: (m) => moeda(m.valor), num: true }, { titulo: 'Motivo', valor: (m) => MOTIVOS_INVENTARIO[m.motivo] || m.motivo },
    { titulo: 'Observação', valor: (m) => m.observacao, largura: 40 }, { titulo: 'Usuário', valor: (m) => dados.mapa.perfil.get(m.usuario_id)?.nome },
  ];
  if (!movs) return html`<${Carregando} />`;
  return html`
    <div class="filtros">
      <select class="entrada" value=${tipo} onChange=${(e) => setTipo(e.target.value)}>
        <option value="">Inventário, correções e saídas avulsas</option>
        <option value="inventario">Só ajustes de inventário</option><option value="correcao">Só correções</option><option value="saida_avulsa">Só saídas avulsas</option></select>
      <${Exportar} tabela="relatorios.relajustes" titulo="Ajustes e correções" arquivo=${`rel-ajustes-${de}-a-${ate}`} colunas=${cols} linhas=${lista}
        filtros=${`${data(de)} a ${data(ate)}`} totais=${['TOTAL', '', '', '', '', '', moeda(total), '', '', '']} />
    </div>
    <p class="nota">Tudo o que mexeu no estoque fora do fluxo normal: diferenças de inventário, correções de lançamento e saídas avulsas (com justificativa).</p>
    <div class="cartoes">
      <${Cartao} titulo="Lançamentos" valor=${lista.length} />
      <${Cartao} titulo="Efeito no valor do estoque" valor=${moeda(total)} cor=${total < 0 ? 'c-vermelho' : ''} />
    </div>
    <${Tabela} id="relatorios.relajustes" linhas=${lista} ordemInicial=${{ chave: 'id', dir: -1 }} colunas=${[
      { chave: 'id', titulo: 'Nº', num: true, render: (m) => html`<small>#${m.id}</small>` },
      { chave: 'data_hora', titulo: 'Data/hora', render: (m) => dataHora(m.data_hora) },
      { chave: 'p', titulo: 'Produto', valor: (m) => p(m)?.descricao, render: (m) => p(m)?.descricao },
      { chave: 'tipo', titulo: 'Tipo', render: (m) => TIPOS_MOV[m.tipo] },
      { chave: 'quantidade', titulo: 'Quantidade', num: true, render: (m) => html`<b class=${m.quantidade < 0 ? 'texto-vermelho' : 'texto-verde'}>${m.quantidade > 0 ? '+' : ''}${qu(m.quantidade, p(m)?.unidade_estoque)}</b>` },
      { chave: 'valor', titulo: 'Valor', num: true, render: (m) => moeda(m.valor) },
      { chave: 'motivo', titulo: 'Motivo / observação', valor: (m) => m.observacao, render: (m) => html`<small>${[MOTIVOS_INVENTARIO[m.motivo] || m.motivo, m.observacao].filter(Boolean).join(' · ')}</small>` },
      { chave: 'u', titulo: 'Usuário', valor: (m) => dados.mapa.perfil.get(m.usuario_id)?.nome, render: (m) => nomeUsuario(dados.mapa.perfil.get(m.usuario_id)) },
    ]} />`;
}

// ---------------------------- RECEBIMENTOS --------------------------
function RelRecebimentos({ de, ate }) {
  const { dados } = useApp();
  const [filtro, setFiltro] = useState('');
  const [aberto, setAberto] = useState(null);
  const perfil = (id) => dados.mapa.perfil.get(id);
  const lista = useMemo(() => (dados.recebimentos || []).filter((r) => {
    const t = new Date(r.data_hora);
    if (t < new Date(de + 'T00:00:00') || t >= new Date(somarDias(ate, 1) + 'T00:00:00')) return false;
    if (filtro === 'div' && !r.divergencia) return false;
    if (filtro === 'pend' && !(r.divergencia && !r.ciente_por)) return false;
    if (filtro === 'sem' && r.pedido_id) return false;
    return true;
  }), [dados, de, ate, filtro]);
  const forn = (r) => dados.mapa.fornecedor.get(r.fornecedor_id)?.nome;
  const cols = [
    { titulo: 'Data/hora', valor: (r) => dataHora(r.data_hora) }, { titulo: 'Pedido', valor: (r) => (r.pedido_id ? numeroPedido(r.pedido_id) : 'sem pedido') },
    { titulo: 'Fornecedor', valor: forn, largura: 28 }, { titulo: 'NF', valor: (r) => r.nota_fiscal }, { titulo: 'Recebido por', valor: (r) => nomeUsuario(perfil(r.usuario_id)), largura: 30 },
    { titulo: 'Divergência', valor: (r) => (r.divergencia ? r.divergencia_detalhe : ''), largura: 50 }, { titulo: 'Ressalva / obs.', valor: (r) => r.observacao, largura: 40 },
    { titulo: 'Comprador avisado', valor: (r) => (r.divergencia ? (r.comprador_avisado ? 'sim' : 'não informado') : '') },
    { titulo: 'Ciência do comprador', valor: (r) => (r.divergencia ? (r.ciente_por ? `${nomeUsuario(perfil(r.ciente_por))} em ${dataHora(r.ciente_em)}` : 'pendente') : ''), largura: 34 },
  ];
  return html`
    <div class="filtros">
      <select class="entrada" value=${filtro} onChange=${(e) => setFiltro(e.target.value)}>
        <option value="">Todos os recebimentos</option><option value="div">Com divergência</option>
        <option value="pend">Divergência aguardando ciência</option><option value="sem">Sem pedido</option></select>
      <${Exportar} tabela="relatorios.relrecebimentos" titulo="Recebimentos" arquivo=${`rel-recebimentos-${de}-a-${ate}`} colunas=${cols} linhas=${lista} filtros=${`${data(de)} a ${data(ate)}`} />
    </div>
    <div class="cartoes">
      <${Cartao} titulo="Recebimentos" valor=${lista.length} />
      <${Cartao} titulo="Com divergência" valor=${lista.filter((r) => r.divergencia).length} />
      <${Cartao} titulo="Aguardando ciência" valor=${lista.filter((r) => r.divergencia && !r.ciente_por).length} cor=${lista.some((r) => r.divergencia && !r.ciente_por) ? 'c-laranja' : ''} />
    </div>
    <${Tabela} id="relatorios.relrecebimentos" linhas=${lista} aoClicar=${(r) => r.pedido_id && setAberto(r.pedido_id)} ordemInicial=${{ chave: 'id', dir: -1 }} colunas=${[
      { chave: 'id', titulo: 'Data/hora', valor: (r) => r.id, render: (r) => dataHora(r.data_hora) },
      { chave: 'pedido_id', titulo: 'Pedido', render: (r) => (r.pedido_id ? html`<b>${numeroPedido(r.pedido_id)}</b>` : html`<small>sem pedido</small>`) },
      { chave: 'f', titulo: 'Fornecedor', valor: forn, render: forn },
      { chave: 'nota_fiscal', titulo: 'NF' },
      { chave: 'u', titulo: 'Recebido por', valor: (r) => perfil(r.usuario_id)?.nome, render: (r) => nomeUsuario(perfil(r.usuario_id)) },
      { chave: 'div', titulo: 'Divergência', valor: (r) => (r.divergencia ? (r.ciente_por ? 1 : 0) : 2), render: (r) => (!r.divergencia ? '–'
        : r.ciente_por ? html`<${Etiqueta} cor="roxo">ciente: ${perfil(r.ciente_por)?.nome}</${Etiqueta}>` : html`<${Etiqueta} cor="laranja">aguardando ciência</${Etiqueta}>`) },
      { chave: 'obs', titulo: 'Detalhe', ordenar: false, render: (r) => html`<small class="quebra">${r.divergencia ? r.divergencia_detalhe : r.observacao || ''}</small>` },
    ]} />
    ${aberto && html`<${PedidoDetalhe} pedido=${dados.pedidos.find((p) => p.id === aberto)} aoFechar=${() => setAberto(null)} />`}`;
}

// ---------------------------- PRODUÇÕES (PESAGEM) -------------------
function RelProducoes({ de, ate }) {
  const { dados, api } = useApp();
  const [prods, setProds] = useState(null);
  const [aberta, setAberta] = useState(null);
  const movs = useMovimentos(de, ate, ['saida_receita']);
  const mudou = useFiltroMudou([de, ate]);
  useEffect(() => {
    if (mudou()) setProds(null);
    api.listar('producoes', { desde: inicioDia(de), ate: inicioDia(somarDias(ate, 1)) }).then(setProds).catch((e) => { avisar(mensagemErro(e), 'erro'); setProds([]); });
  }, [de, ate, dados.carregadoEm]);
  if (!prods || !movs) return html`<${Carregando} />`;
  const perfil = (id) => dados.mapa.perfil.get(id);
  const ficha = (pr) => dados.mapa.ficha.get(pr.ficha_id)?.nome;
  const itensDe = (id) => movs.filter((m) => m.producao_id === id);
  const valor = (id) => -itensDe(id).reduce((s, m) => s + Number(m.valor), 0);
  const cols = [
    { titulo: 'Data/hora', valor: (p) => dataHora(p.data_hora) }, { titulo: 'Receita', valor: ficha, largura: 30 },
    { titulo: 'Quantas receitas', valor: (p) => Number(p.multiplicador), num: true }, { titulo: 'Alterada', valor: (p) => (p.alterada ? 'sim' : '') },
    { titulo: 'Pesado por', valor: (p) => nomeUsuario(perfil(p.usuario_id)), largura: 30 },
    { titulo: 'Valor (custo)', valor: (p) => Math.round(valor(p.id) * 100) / 100, texto: (p) => moeda(valor(p.id)), num: true },
    { titulo: 'Observação', valor: (p) => p.observacao, largura: 50 },
  ];
  const porUsuario = new Map(); prods.forEach((p) => porUsuario.set(p.usuario_id, (porUsuario.get(p.usuario_id) || 0) + 1));
  return html`
    <div class="filtros"><${Exportar} titulo="Produções (saídas por receita)" arquivo=${`rel-producoes-${de}-a-${ate}`} colunas=${cols} linhas=${prods} filtros=${`${data(de)} a ${data(ate)}`} /></div>
    <div class="cartoes">
      <${Cartao} titulo="Lançamentos de produção" valor=${prods.length} sub=${pl(prods.reduce((s, p) => s + Number(p.multiplicador), 0), 'receita', 'receitas')} />
      <${Cartao} titulo="Com receita alterada" valor=${prods.filter((p) => p.alterada).length} />
      ${[...porUsuario].map(([u, q]) => html`<${Cartao} titulo=${perfil(u)?.nome || '–'} valor=${q} sub=${perfil(u)?.funcao || 'lançamentos'} />`)}
    </div>
    <${Tabela} linhas=${prods} aoClicar=${setAberta} ordemInicial=${{ chave: 'id', dir: -1 }} colunas=${[
      { chave: 'id', titulo: 'Data/hora', valor: (p) => p.id, render: (p) => dataHora(p.data_hora) },
      { chave: 'f', titulo: 'Receita', valor: ficha, render: (p) => html`<b>${ficha(p)}</b>${p.alterada ? html` <${Etiqueta} cor="laranja">alterada</${Etiqueta}>` : ''}` },
      { chave: 'multiplicador', titulo: 'Quantas', num: true, render: (p) => num(p.multiplicador, 3) },
      { chave: 'u', titulo: 'Pesado por', valor: (p) => perfil(p.usuario_id)?.nome, render: (p) => nomeUsuario(perfil(p.usuario_id)) },
      { chave: 'v', titulo: 'Valor (custo)', num: true, valor: (p) => valor(p.id), render: (p) => moeda(valor(p.id)) },
      { chave: 'observacao', titulo: 'Observação', render: (p) => html`<small class="quebra">${p.observacao || ''}</small>` },
    ]} />
    ${aberta && html`<${Modal} titulo=${`${ficha(aberta)} · ${num(aberta.multiplicador, 3)}× · ${dataHora(aberta.data_hora)}`} aoFechar=${() => setAberta(null)}>
      <p>Pesado por <b>${nomeUsuario(perfil(aberta.usuario_id))}</b>${aberta.alterada ? html` · <${Etiqueta} cor="laranja">receita alterada</${Etiqueta}>` : ''}</p>
      ${aberta.observacao && html`<p class="nota">${aberta.observacao}</p>`}
      <${Tabela} linhas=${itensDe(aberta.id)} colunas=${[
        { chave: 'p', titulo: 'Ingrediente', valor: (m) => dados.mapa.produto.get(m.produto_id)?.descricao, render: (m) => dados.mapa.produto.get(m.produto_id)?.descricao },
        { chave: 'quantidade', titulo: 'Quantidade', num: true, render: (m) => qu(-m.quantidade, dados.mapa.produto.get(m.produto_id)?.unidade_estoque) },
        { chave: 'valor', titulo: 'Valor', num: true, render: (m) => moeda(-m.valor) },
      ]} />
    </${Modal}>`}`;
}
