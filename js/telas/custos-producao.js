// =====================================================================
// CENTRAL DE CUSTOS — parte da produção (controladoria + diretoria)
//  - Produto acabado: custo de cada batelada (base + farinha/fermento + embalagem)
//    e média do período ponderada pela quantidade produzida; real × padrão da ficha
//  - Estoque valorizado por local (inclui em trânsito)
//  - Saídas avulsas e perdas valorizadas à parte (não entram no custo do produto)
// =====================================================================
import { html, useState, useEffect, useMemo, useApp, Tabela, Cartao, Etiqueta, Carregando, avisar, useFiltroMudou } from '../ui.js';
import { TIPOS_PRODUTO, tipoProduto, dataHora, hojeISO, somarDias, num, moeda, mensagemErro, contem } from '../util.js';
import { Exportar } from '../exportar.js';
import { nomeLocal } from '../producao-util.js';
import { Colunas } from '../graficos.js';

const m4 = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '–' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }));
const inicioDia = (iso) => new Date(iso + 'T00:00:00').toISOString();

function Periodo({ de, ate, setDe, setAte }) {
  const h = hojeISO();
  return html`<div class="filtros">
    <label class="campo-inline">De <input class="entrada" type="date" value=${de} onChange=${(e) => setDe(e.target.value)} /></label>
    <label class="campo-inline">até <input class="entrada" type="date" value=${ate} onChange=${(e) => setAte(e.target.value)} /></label>
    <span class="chips"><button class="chip" onClick=${() => { setDe(h); setAte(h); }}>Hoje</button>
      <button class="chip" onClick=${() => { setDe(somarDias(h, -1)); setAte(somarDias(h, -1)); }}>Ontem</button>
      <button class="chip" onClick=${() => { setDe(somarDias(h, -6)); setAte(h); }}>7 dias</button>
      <button class="chip" onClick=${() => { setDe(h.slice(0, 8) + '01'); setAte(h); }}>Este mês</button></span></div>`;
}

// ------------------------------ PRODUTO ACABADO ----------------------
export function CustoProdutoAcabado() {
  const { dados, api } = useApp();
  const [de, setDe] = useState(somarDias(hojeISO(), -6));
  const [ate, setAte] = useState(hojeISO());
  const [vis, setVis] = useState('receita');
  const [lista, setLista] = useState(null);
  const mudou = useFiltroMudou([de, ate]);
  useEffect(() => {
    let vivo = true; if (mudou()) setLista(null);
    api.rpc('custos_bateladas', { p_de: de, p_ate: ate }).then((l) => { if (vivo) setLista((l || []).map((x) => ({ ...x,
      q: Number(x.quantidade_produzida || 0), mis: Number(x.custo_mistura || 0), mac: Number(x.custo_maceira || 0), emb: Number(x.custo_embalagem || 0),
      tot: Number(x.custo_total || 0), pad: Number(x.custo_padrao || 0) }))); })
      .catch((e) => { avisar(mensagemErro(e), 'erro'); if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, [de, ate, dados.carregadoEm]);
  const porReceita = useMemo(() => {
    if (!lista) return [];
    const m = new Map();
    lista.forEach((b) => { const r = m.get(b.ficha_id) || { id: b.ficha_id, n: 0, q: 0, mis: 0, mac: 0, emb: 0, tot: 0, pad: 0, dias: new Map() };
      r.n++; r.q += b.q; r.mis += b.mis; r.mac += b.mac; r.emb += b.emb; r.tot += b.tot; r.pad += b.pad;
      const d = r.dias.get(b.data) || { q: 0, tot: 0 }; d.q += b.q; d.tot += b.tot; r.dias.set(b.data, d); m.set(b.ficha_id, r); });
    return [...m.values()].map((r) => ({ ...r, un: r.q > 0 ? r.tot / r.q : null, unPad: r.q > 0 ? r.pad / r.q : null, dif: r.pad > 0 ? ((r.tot - r.pad) / r.pad) * 100 : null }));
  }, [lista]);
  if (!lista) return html`<${Periodo} de=${de} ate=${ate} setDe=${setDe} setAte=${setAte} /><${Carregando} />`;
  const f = (id) => dados.mapa.ficha.get(id);
  const tot = lista.reduce((s, b) => s + b.tot, 0), pad = lista.reduce((s, b) => s + b.pad, 0);
  const unid = (id) => f(id)?.rendimento_unidade || 'un';
  const dias = [...new Set(lista.map((b) => b.data))].sort();
  const colR = [
    { titulo: 'Código', valor: (r) => f(r.id)?.codigo }, { titulo: 'Receita', valor: (r) => f(r.id)?.nome, largura: 30 },
    { titulo: 'Bateladas', valor: (r) => r.n, num: true }, { titulo: 'Produzido', valor: (r) => r.q, num: true }, { titulo: 'Unid.', valor: (r) => unid(r.id) },
    { titulo: 'Custo base (pós)', valor: (r) => r.mis, texto: (r) => moeda(r.mis), num: true }, { titulo: 'Custo farinha/fermento', valor: (r) => r.mac, texto: (r) => moeda(r.mac), num: true },
    { titulo: 'Custo embalagem', valor: (r) => r.emb, texto: (r) => moeda(r.emb), num: true }, { titulo: 'Custo total', valor: (r) => r.tot, texto: (r) => moeda(r.tot), num: true },
    { titulo: 'Custo por unidade (média ponderada)', valor: (r) => r.un, texto: (r) => m4(r.un), num: true }, { titulo: 'Custo padrão por unidade', valor: (r) => r.unPad, texto: (r) => m4(r.unPad), num: true },
    { titulo: 'Real × padrão (%)', valor: (r) => (r.dif === null ? '' : Math.round(r.dif * 10) / 10), num: true }];
  const colB = [
    { titulo: 'Batelada', valor: (b) => b.batelada_id }, { titulo: 'Dia', valor: (b) => b.data }, { titulo: 'Receita', valor: (b) => `${f(b.ficha_id)?.codigo} ${f(b.ficha_id)?.nome}` },
    { titulo: 'Masseira', valor: (b) => dados.mapa.maceira.get(b.maceira_id)?.nome || '' }, { titulo: 'Padeiro', valor: (b) => dados.mapa.operador.get(b.operador_id)?.nome || '' },
    { titulo: 'Produzido', valor: (b) => b.q, num: true }, { titulo: 'Custo base', valor: (b) => b.mis, num: true }, { titulo: 'Custo farinha/fermento', valor: (b) => b.mac, num: true },
    { titulo: 'Custo embalagem', valor: (b) => b.emb, num: true }, { titulo: 'Custo total', valor: (b) => b.tot, num: true },
    { titulo: 'Custo unitário', valor: (b) => Number(b.custo_unitario || 0), texto: (b) => m4(b.custo_unitario), num: true }, { titulo: 'Custo padrão', valor: (b) => b.pad, num: true }];
  return html`<${Periodo} de=${de} ate=${ate} setDe=${setDe} setAte=${setAte} />
    <div class="cartoes">
      <${Cartao} titulo="Bateladas finalizadas" valor=${num(lista.length, 0)} />
      <${Cartao} titulo="Custo total produzido" valor=${moeda(tot)} />
      <${Cartao} titulo="Custo padrão (ficha)" valor=${moeda(pad)} />
      <${Cartao} titulo="Real × padrão" valor=${pad > 0 ? `${tot > pad ? '+' : ''}${num(((tot - pad) / pad) * 100, 1)}%` : '–'} cor=${pad > 0 && tot > pad * 1.02 ? 'c-vermelho' : pad > 0 && tot < pad * 0.98 ? 'c-verde' : ''} />
    </div>
    <div class="filtros"><span class="chips"><button class=${'chip' + (vis === 'receita' ? ' ativo' : '')} aria-pressed=${!!(vis === 'receita')} onClick=${() => setVis('receita')}>Por receita</button>
      <button class=${'chip' + (vis === 'batelada' ? ' ativo' : '')} aria-pressed=${!!(vis === 'batelada')} onClick=${() => setVis('batelada')}>Por batelada</button></span>
      <${Exportar} tabela="custos-producao.custoprodutoacabado" titulo="Custo do produto acabado" filtros=${`${de} a ${ate}`} arquivo=${`custo-produto-${de}-a-${ate}`} colunas=${vis === 'receita' ? colR : colB} linhas=${vis === 'receita' ? porReceita : lista} /></div>
    ${vis === 'receita' ? html`<${Tabela} id="custos-producao.custoprodutoacabado" linhas=${porReceita} vazio="Nenhuma batelada finalizada no período." colunas=${[
        { chave: 'r', titulo: 'Receita', valor: (r) => f(r.id)?.nome, render: (r) => html`<b>${f(r.id)?.codigo}</b> ${f(r.id)?.nome}` },
        { chave: 'n', titulo: 'Bateladas', num: true },
        { chave: 'q', titulo: 'Produzido', num: true, render: (r) => `${num(r.q, 0)} ${unid(r.id)}` },
        { chave: 'tot', titulo: 'Custo total', num: true, render: (r) => moeda(r.tot) },
        { chave: 'un', titulo: 'Por unidade (média)', num: true, render: (r) => html`<b>${m4(r.un)}</b>` },
        { chave: 'unPad', titulo: 'Padrão', num: true, render: (r) => m4(r.unPad) },
        { chave: 'dif', titulo: 'Real × padrão', num: true, render: (r) => (r.dif === null ? '–' : html`<span class=${r.dif > 2 ? 'texto-vermelho' : r.dif < -2 ? 'texto-verde' : ''}>${r.dif > 0 ? '+' : ''}${num(r.dif, 1)}%</span>`) },
        { chave: 'comp', titulo: 'Composição', ordenar: false, render: (r) => html`<span class="barra-comp" title=${`base ${moeda(r.mis)} · farinha/fermento ${moeda(r.mac)} · embalagem ${moeda(r.emb)}`}>
          <i style=${`flex:${r.mis || 0.0001};background:#8b5cf6`}></i><i style=${`flex:${r.mac || 0.0001};background:#d9a441`}></i><i style=${`flex:${r.emb || 0.0001};background:#3b82c4`}></i></span>` },
      ]} />
      <div class="legenda"><span><i style="background:#8b5cf6"></i>Base (pós)</span><span><i style="background:#d9a441"></i>Farinha e fermento</span><span><i style="background:#3b82c4"></i>Embalagem (simulada)</span></div>
      ${porReceita.length > 0 && de !== ate && html`<h3 class="titulo-secao">Custo por unidade, dia a dia</h3>
        <${Colunas} categorias=${dias.map((d) => d.slice(8, 10) + '/' + d.slice(5, 7))} formatar=${m4} altura=${200}
          series=${[{ nome: 'Custo por unidade (média do dia)', valores: dias.map((d) => { const bs = lista.filter((b) => b.data === d); const q = bs.reduce((s, b) => s + b.q, 0); return q > 0 ? bs.reduce((s, b) => s + b.tot, 0) / q : 0; }) }]} />`}`
      : html`<${Tabela} id="custos-producao.custoprodutoacabado-2" linhas=${lista} chave="batelada_id" vazio="Nenhuma batelada finalizada no período." max=${400} colunas=${[
        { chave: 'batelada_id', titulo: 'Nº', num: true }, { chave: 'data', titulo: 'Dia' },
        { chave: 'f', titulo: 'Receita', render: (b) => `${f(b.ficha_id)?.codigo} ${f(b.ficha_id)?.nome}` },
        { chave: 'mac', titulo: 'Masseira', render: (b) => dados.mapa.maceira.get(b.maceira_id)?.nome || '–' },
        { chave: 'q', titulo: 'Produzido', num: true, render: (b) => num(b.q, 0) },
        { chave: 'tot', titulo: 'Custo', num: true, render: (b) => moeda(b.tot) },
        { chave: 'custo_unitario', titulo: 'Unitário', num: true, render: (b) => m4(b.custo_unitario) },
        { chave: 'pad', titulo: 'Padrão', num: true, render: (b) => moeda(b.pad) },
      ]} />`}
    <p class="nota">Custo da batelada = base (pós, ao custo médio na pesagem) + farinha e fermento usados na masseira + embalagem (pela ficha × peso médio × custo médio; simulada enquanto a embalagem sair por requisição). Média do período ponderada pela quantidade produzida. Saídas avulsas e perdas não entram aqui.</p>`;
}

// ------------------------------ ESTOQUE VALORIZADO -------------------
export function EstoqueValorizado() {
  const { dados } = useApp();
  const [tipo, setTipo] = useState('');
  const [busca, setBusca] = useState('');
  const transito = useMemo(() => { const m = new Map(); const tm = new Map(dados.transferencias.map((x) => [x.id, x])); dados.transfItens.forEach((i) => { const t = tm.get(i.transferencia_id);
    if (t && t.situacao === 'enviada') m.set(i.produto_id, (m.get(i.produto_id) || 0) + Number(i.quantidade)); }); return m; }, [dados]);
  const locais = dados.locais.filter((l) => l.ativo);
  const linhas = dados.produtos.filter((p) => p.controla_estoque !== false && (!tipo || tipoProduto(p) === tipo) && contem(`${p.codigo} ${p.descricao}`, busca)).map((p) => {
    const cm = Number(p.custo_medio || 0); const por = {}; let fis = 0;
    locais.forEach((l) => { const e = dados.mapa.saldoLocal.get(`${p.id}|${l.id}`); const q = e ? Number(e.disponivel) + Number(e.separado) : 0; por[l.id] = q; fis += q; });
    const tr = transito.get(p.id) || 0;
    return { ...p, cm, por, fis, tr, valor: (fis + tr) * cm };
  }).filter((p) => Math.abs(p.fis) > 0.0001 || p.tr > 0.0001);
  const totLocal = (id) => linhas.reduce((s, p) => s + p.por[id] * p.cm, 0);
  const total = linhas.reduce((s, p) => s + p.valor, 0);
  const totTr = linhas.reduce((s, p) => s + p.tr * p.cm, 0);
  const porTipo = Object.keys(TIPOS_PRODUTO).map((k) => ({ k, v: linhas.filter((p) => tipoProduto(p) === k).reduce((s, p) => s + p.valor, 0) })).filter((x) => x.v > 0);
  return html`<div class="cartoes">
      <${Cartao} titulo="Estoque valorizado (custo médio)" valor=${moeda(total)} sub="inclui o que está em trânsito" />
      ${locais.map((l) => html`<${Cartao} titulo=${nomeLocal(dados, l.id)} valor=${moeda(totLocal(l.id))} />`)}
      ${totTr > 0 && html`<${Cartao} titulo="Em trânsito" valor=${moeda(totTr)} cor="c-azul" />`}
    </div>
    ${porTipo.length > 0 && html`<div class="barra-tipos">${porTipo.map((x) => html`<span style=${`flex:${x.v}`} title=${`${TIPOS_PRODUTO[x.k]}: ${moeda(x.v)}`}><b>${TIPOS_PRODUTO[x.k]}</b> ${num((x.v / total) * 100, 0)}%</span>`)}</div>`}
    <div class="filtros"><input class="entrada busca" placeholder="Buscar produto" value=${busca} onInput=${(e) => setBusca(e.target.value)} />
      <select class="entrada" value=${tipo} onChange=${(e) => setTipo(e.target.value)}><option value="">Todos os tipos</option>${Object.entries(TIPOS_PRODUTO).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select>
      <${Exportar} tabela="custos-producao.estoquevalorizado" titulo="Estoque valorizado por local" filtros=${dataHora(new Date())} arquivo=${`estoque-valorizado-${hojeISO()}`} linhas=${linhas} colunas=${[
        { titulo: 'Código', valor: (p) => p.codigo }, { titulo: 'Produto', valor: (p) => p.descricao, largura: 32 }, { titulo: 'Tipo', valor: (p) => TIPOS_PRODUTO[tipoProduto(p)] },
        { titulo: 'Unid.', valor: (p) => p.unidade_estoque }, ...locais.map((l) => ({ titulo: nomeLocal(dados, l.id), valor: (p) => Math.round(p.por[l.id] * 1000) / 1000, num: true })),
        { titulo: 'Em trânsito', valor: (p) => p.tr, num: true }, { titulo: 'Total', valor: (p) => Math.round((p.fis + p.tr) * 1000) / 1000, num: true },
        { titulo: 'Custo médio', valor: (p) => p.cm, texto: (p) => m4(p.cm), num: true }, { titulo: 'Valor', valor: (p) => Math.round(p.valor * 100) / 100, texto: (p) => moeda(p.valor), num: true }]}
        totais=${['TOTAL', '', '', '', ...locais.map((l) => moeda(totLocal(l.id))), moeda(totTr), '', '', moeda(total)]} /></div>
    <${Tabela} id="custos-producao.estoquevalorizado" linhas=${linhas} ordemInicial=${{ chave: 'valor', dir: -1 }} max=${400} colunas=${[
      { chave: 'cod', titulo: 'Código', valor: (p) => p.codigo, render: (p) => p.codigo }, { chave: 'descricao', titulo: 'Produto', classe: 'col-desc', render: (p) => html`<b>${p.descricao}</b>` },
      ...locais.map((l) => ({ chave: 'l' + l.id, titulo: l.nome, num: true, valor: (p) => p.por[l.id], render: (p) => (Math.abs(p.por[l.id]) > 0.0001 ? html`<span class=${p.por[l.id] < 0 ? 'texto-vermelho' : ''}>${num(p.por[l.id], 2)}</span>` : html`<span class="texto-cinza">–</span>`) })),
      { chave: 'tr', titulo: 'Trânsito', num: true, render: (p) => (p.tr > 0 ? html`<span class="texto-azul">${num(p.tr, 2)}</span>` : '–') },
      { chave: 'cm', titulo: 'Custo médio', num: true, render: (p) => html`${m4(p.cm)}<small>/${p.unidade_estoque}</small>` },
      { chave: 'valor', titulo: 'Valor', num: true, render: (p) => html`<b>${moeda(p.valor)}</b>` },
    ]} />`;
}

// ------------------------------ SAÍDAS AVULSAS E PERDAS --------------
export function AvulsasPerdas() {
  const { dados, api } = useApp();
  const [de, setDe] = useState(hojeISO().slice(0, 8) + '01');
  const [ate, setAte] = useState(hojeISO());
  const [movs, setMovs] = useState(null);
  const mudou = useFiltroMudou([de, ate]);
  useEffect(() => {
    let vivo = true; if (mudou()) setMovs(null);
    api.listar('movimentos', { desde: inicioDia(de), ate: inicioDia(somarDias(ate, 1)), em: { tipo: ['saida_avulsa', 'perda'] }, ordem: ['id', 'desc'] })
      .then((l) => { if (vivo) setMovs(l); }).catch((e) => { avisar(mensagemErro(e), 'erro'); if (vivo) setMovs([]); });
    return () => { vivo = false; };
  }, [de, ate, dados.carregadoEm]);
  if (!movs) return html`<${Periodo} de=${de} ate=${ate} setDe=${setDe} setAte=${setAte} /><${Carregando} />`;
  const v = (m) => -Number(m.valor || 0);
  const av = movs.filter((m) => m.tipo === 'saida_avulsa'), pe = movs.filter((m) => m.tipo === 'perda');
  const pr = (m) => dados.mapa.produto.get(m.produto_id);
  const quem = (m) => [dados.mapa.perfil.get(m.usuario_id)?.nome, m.operador_id && `padeiro ${dados.mapa.operador.get(m.operador_id)?.nome}`].filter(Boolean).join(' · ');
  const porProd = new Map(); movs.forEach((m) => porProd.set(m.produto_id, (porProd.get(m.produto_id) || 0) + v(m)));
  const top = [...porProd].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return html`<${Periodo} de=${de} ate=${ate} setDe=${setDe} setAte=${setAte} />
    <div class="cartoes">
      <${Cartao} titulo="Saídas avulsas" valor=${moeda(av.reduce((s, m) => s + v(m), 0))} sub=${`${av.length} lançamento(s)`} cor="c-laranja" />
      <${Cartao} titulo="Perdas de base" valor=${moeda(pe.reduce((s, m) => s + v(m), 0))} sub=${`${pe.length} lançamento(s)`} cor="c-vermelho" />
    </div>
    ${top.length > 0 && html`<h3 class="titulo-secao">Onde mais saiu dinheiro</h3>
      <div class="barras-h">${top.map(([id, val]) => html`<div class="bh-linha"><span class="bh-rotulo">${dados.mapa.produto.get(id)?.descricao}</span>
        <span class="bh-trilho"><span class="bh-barra" style=${`width:${(val / top[0][1]) * 100}%`}></span></span><span class="bh-valor">${moeda(val)}</span></div>`)}</div>`}
    <div class="filtros"><${Exportar} tabela="custos-producao.avulsasperdas" titulo="Saídas avulsas e perdas" filtros=${`${de} a ${ate}`} arquivo=${`avulsas-perdas-${de}-a-${ate}`} linhas=${movs} colunas=${[
      { titulo: 'Data/hora', valor: (m) => dataHora(m.data_hora) }, { titulo: 'Tipo', valor: (m) => (m.tipo === 'perda' ? 'Perda' : 'Saída avulsa') },
      { titulo: 'Produto', valor: (m) => pr(m)?.descricao, largura: 32 }, { titulo: 'Quantidade', valor: (m) => -Number(m.quantidade), num: true }, { titulo: 'Unid.', valor: (m) => pr(m)?.unidade_estoque },
      { titulo: 'Local', valor: (m) => nomeLocal(dados, m.local_id) }, { titulo: 'Valor', valor: v, texto: (m) => moeda(v(m)), num: true },
      { titulo: 'Quem', valor: quem }, { titulo: 'Motivo / observação', valor: (m) => m.observacao || '', largura: 40 }]} /></div>
    <${Tabela} id="custos-producao.avulsasperdas" linhas=${movs} vazio="Nenhuma saída avulsa ou perda no período." colunas=${[
      { chave: 'data_hora', titulo: 'Data/hora', render: (m) => dataHora(m.data_hora) },
      { chave: 'tipo', titulo: 'Tipo', render: (m) => html`<${Etiqueta} cor=${m.tipo === 'perda' ? 'vermelho' : 'laranja'}>${m.tipo === 'perda' ? 'Perda' : 'Avulsa'}</${Etiqueta}>` },
      { chave: 'p', titulo: 'Produto', render: (m) => pr(m)?.descricao },
      { chave: 'q', titulo: 'Quantidade', num: true, valor: (m) => -Number(m.quantidade), render: (m) => `${num(-Number(m.quantidade), 3)} ${pr(m)?.unidade_estoque}` },
      { chave: 'valor', titulo: 'Valor', num: true, valor: v, render: (m) => moeda(v(m)) },
      { chave: 'quem', titulo: 'Quem', render: (m) => html`<small>${quem(m)}</small>` },
      { chave: 'obs', titulo: 'Motivo', render: (m) => html`<small>${m.observacao || ''}</small>` },
    ]} />
    <p class="nota">Valorizadas pelo custo médio do momento da saída. Não são rateadas no custo do produto acabado.</p>`;
}
