// =====================================================================
// Previsão de produção: receitas programadas × rendimento da receita
//   ex.: 10 receitas de pão de forma × 100 pacotes = 1.000 pacotes previstos
// Vem do banco já somada (função previsao_producao), sem ingredientes:
// por isso faturamento e financeiro podem ver sem acessar as fichas.
// =====================================================================
import { html, useState, useEffect, useMemo, useApp, Tabela, Cartao, Cabecalho, Etiqueta, Abas, Carregando, avisar, useFiltroMudou } from '../ui.js';
import { data, hojeISO, somarDias, num, pl, mensagemErro } from '../util.js';
import { Exportar } from '../exportar.js';

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const rotuloDiaPrev = (iso) => {
  const h = hojeISO();
  const extra = iso === h ? 'hoje' : iso === somarDias(h, 1) ? 'amanhã' : iso === somarDias(h, 2) ? 'depois de amanhã' : iso === somarDias(h, -1) ? 'ontem'
    : DIAS_SEMANA[new Date(iso + 'T12:00:00').getDay()];
  return `${data(iso)} (${extra})`;
};
const nomeProduto = (l) => l.produto_final || l.nome;
const unid = (l) => l.rendimento_unidade || 'un';
// "1.000 pacotes · 500 pães" (soma separada por unidade)
export function totalPorUnidade(linhas) {
  const m = new Map();
  for (const l of linhas) if (l.previsto !== null && l.previsto !== undefined) m.set(unid(l), (m.get(unid(l)) || 0) + Number(l.previsto));
  return [...m.entries()].map(([u, q]) => `${num(q, 0)} ${u}`).join(' · ') || '–';
}
function situacaoLinha(l, hoje) {
  const r = Number(l.receitas), f = Number(l.receitas_pesadas);
  if (l.finalizada) return { t: 'Finalizada', cor: 'verde' };
  if (f >= r - 0.0005 && f > 0) return { t: 'Pesada · em produção', cor: 'laranja' };
  if (f > 0) return { t: `Em produção (${num(f, 1)} de ${num(r, 1)})`, cor: 'laranja' };
  if (l.data < hoje) return { t: 'Não iniciada', cor: 'vermelho' };
  return { t: 'A fazer', cor: 'cinza' };
}

export function usePrevisao(de, ate) {
  const { api, dados } = useApp();
  const [lista, setLista] = useState(null);
  const mudou = useFiltroMudou([de, ate]);
  useEffect(() => {
    let vivo = true;
    if (mudou()) setLista(null);
    api.rpc('previsao_producao', { p_de: de, p_ate: ate })
      .then((l) => { if (vivo) setLista((l || []).map((x) => ({ ...x, chave: `${x.data}-${x.ficha_id}` }))); })
      .catch((e) => { avisar(mensagemErro(e), 'erro'); if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, [de, ate, dados.carregadoEm]);
  return lista;
}

// Resuminho de um dia (usado embaixo da programação e no Início)
export function ResumoPrevisao({ dia, titulo, aoAbrir }) {
  const lista = usePrevisao(dia, dia);
  if (!lista) return html`<${Carregando} />`;
  if (!lista.length) return html`<section class="painel previsao-resumo"><h3>${titulo || `Previsão de produção · ${rotuloDiaPrev(dia)}`}</h3><p class="nota">Nada programado para este dia.</p></section>`;
  const semRend = lista.filter((l) => l.previsto === null);
  return html`<section class="painel previsao-resumo">
    <h3>${titulo || `Previsão de produção · ${rotuloDiaPrev(dia)}`}</h3>
    <${Tabela} id="previsao.resumoprevisao" linhas=${lista} chave="chave" aoClicar=${aoAbrir ? () => aoAbrir() : null}
      colunas=${[
        { chave: 'nome', titulo: 'Produto', valor: nomeProduto, classe: 'col-desc', render: (l) => html`<b>${nomeProduto(l)}</b>` }, { chave: 'rec', titulo: 'Receita', valor: (l) => `${l.codigo} · ${l.nome}`, render: (l) => `${l.codigo} · ${l.nome}` },
        { chave: 'receitas', titulo: 'Receitas', num: true, valor: (l) => Number(l.receitas), render: (l) => num(l.receitas, 1) },
        { chave: 'rendimento_qtd', titulo: 'Rende por receita', num: true, valor: (l) => Number(l.rendimento_qtd || 0),
          render: (l) => (l.rendimento_qtd ? `${num(l.rendimento_qtd, 0)} ${unid(l)}` : html`<${Etiqueta} cor="vermelho">sem rendimento</${Etiqueta}>`) },
        { chave: 'previsto', titulo: 'Previsão', num: true, valor: (l) => Number(l.previsto || 0), render: (l) => (l.previsto === null ? '–' : html`<b>${num(l.previsto, 0)} ${unid(l)}</b>`) },
      ]}
      totais=${{ rotulo: 'Total previsto', previsto: totalPorUnidade(lista) }} />
    ${semRend.length > 0 && html`<p class="nota">⚠ ${pl(semRend.length, 'receita está', 'receitas estão')} sem rendimento cadastrado na ficha técnica (${semRend.map((l) => l.codigo).join(', ')}). A engenharia precisa preencher "rende por receita".</p>`}
  </section>`;
}

const PERIODOS = [
  { id: 'hoje', t: 'Hoje', f: (h) => [h, h] },
  { id: 'amanha', t: 'Amanhã', f: (h) => [somarDias(h, 1), somarDias(h, 1)] },
  { id: 'depois', t: 'Depois de amanhã', f: (h) => [somarDias(h, 2), somarDias(h, 2)] },
  { id: '3dias', t: 'Hoje + 2 dias', f: (h) => [h, somarDias(h, 2)] },
  { id: '7dias', t: 'Próximos 7 dias', f: (h) => [h, somarDias(h, 6)] },
  { id: 'ontem', t: 'Ontem', f: (h) => [somarDias(h, -1), somarDias(h, -1)] },
  { id: 'livre', t: 'Escolher período' },
];

const pctProd = (l) => (l.previsto > 0 ? (Number(l.produzido || 0) / Number(l.previsto)) * 100 : null);
function Progresso({ l }) {
  const p = pctProd(l);
  if (p === null) return html`<small class="texto-cinza">–</small>`;
  return html`<span class="prog-mini" title=${`${num(p, 0)}%`}><i style=${`width:${Math.min(p, 100)}%`} class=${p >= 98 ? 'ok' : ''}></i></span>`;
}

export function TelaPrevisao() {
  const hoje = hojeISO();
  const { papeis } = useApp();
  const reduzido = !(papeis || []).some((p) => ['admin', 'engenharia', 'diretoria', 'gestor_producao'].includes(p));   // faturamento/financeiro: só hoje e amanhã
  const [per, setPer] = useState('hoje');
  const [de, setDe] = useState(hoje);
  const [ate, setAte] = useState(hoje);
  const [aba, setAba] = useState('dia');
  function escolher(id) {
    setPer(id);
    const p = PERIODOS.find((x) => x.id === id);
    if (p.f) { const [a, b] = p.f(hoje); setDe(a); setAte(b); }
  }
  const lista = usePrevisao(de, ate);
  const linhas = lista || [];
  const porProduto = useMemo(() => {
    const m = new Map();
    for (const l of linhas) {
      const k = `${nomeProduto(l)}|${unid(l)}|${l.ficha_id}`;
      const a = m.get(k) || { chave: k, codigo: l.codigo, nome: l.nome, produto_final: l.produto_final, rendimento_unidade: l.rendimento_unidade, rendimento_qtd: l.rendimento_qtd, receitas: 0, previsto: 0, semRend: false, dias: new Set() };
      a.receitas += Number(l.receitas); a.dias.add(l.data); a.produzido = (a.produzido || 0) + Number(l.produzido || 0);
      if (l.previsto === null) a.semRend = true; else a.previsto += Number(l.previsto);
      m.set(k, a);
    }
    return [...m.values()].map((a) => ({ ...a, previsto: a.semRend && !a.previsto ? null : a.previsto, ndias: a.dias.size }));
  }, [lista]);
  const umDia = de === ate;
  const periodoTxt = umDia ? rotuloDiaPrev(de) : `${data(de)} a ${data(ate)}`;
  const receitasTot = linhas.reduce((s, l) => s + Number(l.receitas), 0);

  const colDia = [
    { titulo: 'Data', valor: (l) => data(l.data) }, { titulo: 'Produto', valor: nomeProduto }, { titulo: 'Receita', valor: (l) => `${l.codigo} · ${l.nome}` },
    { titulo: 'Receitas programadas', valor: (l) => Number(l.receitas), num: true },
    { titulo: 'Rende por receita', valor: (l) => (l.rendimento_qtd ? Number(l.rendimento_qtd) : ''), num: true },
    { titulo: 'Previsão', valor: (l) => (l.previsto === null ? '' : Number(l.previsto)), texto: (l) => (l.previsto === null ? 'sem rendimento' : num(l.previsto, 0)), num: true },
    { titulo: 'Produzido', valor: (l) => Number(l.produzido || 0), num: true },
    { titulo: 'Unidade', valor: unid },
    { titulo: 'Situação', valor: (l) => situacaoLinha(l, hoje).t },
  ];
  const colProd = [
    { titulo: 'Produto', valor: nomeProduto }, { titulo: 'Receita', valor: (a) => `${a.codigo} · ${a.nome}` },
    { titulo: 'Dias', valor: (a) => a.ndias, num: true },
    { titulo: 'Receitas programadas', valor: (a) => a.receitas, num: true },
    { titulo: 'Previsão', valor: (a) => (a.previsto === null ? '' : a.previsto), texto: (a) => (a.previsto === null ? 'sem rendimento' : num(a.previsto, 0)), num: true },
    { titulo: 'Unidade', valor: unid },
  ];

  return html`
    <${Cabecalho} titulo="Programado × produzido" sub=${reduzido ? 'O que está programado e quanto já foi produzido, hoje e amanhã' : 'Receitas programadas × rendimento de cada receita, e o que já foi produzido (bateladas finalizadas)'}>
      <${Exportar} tabela="previsao.telaprevisao" titulo="Previsão de produção" filtros=${periodoTxt} arquivo=${`previsao-producao-${de}${umDia ? '' : '-a-' + ate}`}
        colunas=${aba === 'dia' ? colDia : colProd} linhas=${aba === 'dia' ? linhas : porProduto}
        abas=${() => [{ nome: 'Dia a dia', colunas: colDia, linhas }, { nome: 'Por produto', colunas: colProd, linhas: porProduto }]} />
    </${Cabecalho}>
    <div class="chips">
      ${PERIODOS.filter((p) => !reduzido || ['hoje', 'amanha'].includes(p.id)).map((p) => html`<button class=${'chip' + (per === p.id ? ' ativo' : '')} aria-pressed=${!!(per === p.id)} onClick=${() => escolher(p.id)}>${p.t}</button>`)}
    </div>
    ${per === 'livre' && html`<div class="filtros">
      <label class="campo-inline">De <input class="entrada" type="date" value=${de} onChange=${(e) => { setDe(e.target.value); if (e.target.value > ate) setAte(e.target.value); }} /></label>
      <label class="campo-inline">até <input class="entrada" type="date" value=${ate} onChange=${(e) => setAte(e.target.value < de ? de : e.target.value)} /></label>
    </div>`}
    ${!lista ? html`<${Carregando} />` : html`
      <div class="cartoes">
        <${Cartao} titulo=${umDia ? `Previsto · ${rotuloDiaPrev(de)}` : 'Previsto no período'} valor=${totalPorUnidade(linhas)} />
        <${Cartao} titulo="Produzido" valor=${totalPorUnidade(linhas.map((l) => ({ ...l, previsto: Number(l.produzido || 0) })))} sub=${(() => { const pv = linhas.reduce((s, l) => s + Number(l.previsto || 0), 0); const pd = linhas.reduce((s, l) => s + Number(l.produzido || 0), 0); return pv > 0 ? `${num((pd / pv) * 100, 0)}% do previsto` : ''; })()} />
        <${Cartao} titulo="Receitas programadas" valor=${num(receitasTot, 1)} sub=${periodoTxt} />
        <${Cartao} titulo="Produtos" valor=${porProduto.length} sub=${umDia ? '' : pl(new Set(linhas.map((l) => l.data)).size, 'dia com produção', 'dias com produção')} />
      </div>
      ${linhas.some((l) => l.previsto === null) && html`<div class="aviso-faixa"><span>⚠ Há receitas sem rendimento cadastrado: a previsão delas não entra no total. A engenharia preenche "rende por receita" na ficha técnica.</span></div>`}
      <${Abas} abas=${[{ id: 'dia', titulo: 'Dia a dia' }, { id: 'produto', titulo: 'Total por produto' }]} ativa=${aba} aoMudar=${setAba} />
      ${aba === 'dia' ? html`<${Tabela} id="previsao.telaprevisao" linhas=${linhas} chave="chave" vazio="Nada programado neste período."
        colunas=${[
          { chave: 'data', titulo: 'Dia', render: (l) => rotuloDiaPrev(l.data) },
          { chave: 'nome', titulo: 'Produto', valor: nomeProduto, classe: 'col-desc', render: (l) => html`<b>${nomeProduto(l)}</b>` }, { chave: 'rec', titulo: 'Receita', valor: (l) => `${l.codigo} · ${l.nome}`, render: (l) => `${l.codigo} · ${l.nome}` },
          { chave: 'receitas', titulo: 'Receitas', num: true, valor: (l) => Number(l.receitas), render: (l) => num(l.receitas, 1) },
          { chave: 'rendimento_qtd', titulo: 'Rende por receita', num: true, valor: (l) => Number(l.rendimento_qtd || 0),
            render: (l) => (l.rendimento_qtd ? `${num(l.rendimento_qtd, 0)} ${unid(l)}` : html`<${Etiqueta} cor="vermelho">sem rendimento</${Etiqueta}>`) },
          { chave: 'previsto', titulo: 'Previsão', num: true, valor: (l) => Number(l.previsto || 0), render: (l) => (l.previsto === null ? '–' : html`<b>${num(l.previsto, 0)} ${unid(l)}</b>`) },
          { chave: 'produzido', titulo: 'Produzido', num: true, valor: (l) => Number(l.produzido || 0), render: (l) => html`${num(l.produzido || 0, 0)} <${Progresso} l=${l} />` },
          { chave: 'sit', titulo: 'Situação', valor: (l) => situacaoLinha(l, hoje).t, render: (l) => { const s = situacaoLinha(l, hoje); return html`<${Etiqueta} cor=${s.cor}>${s.t}</${Etiqueta}>`; } },
        ]}
        totais=${linhas.length > 0 && { rotulo: 'Total', receitas: num(receitasTot, 1), previsto: totalPorUnidade(linhas), produzido: num(linhas.reduce((s, l) => s + Number(l.produzido || 0), 0), 0) }} />`
      : html`<${Tabela} id="previsao.telaprevisao-2" linhas=${porProduto} chave="chave" vazio="Nada programado neste período."
        colunas=${[
          { chave: 'nome', titulo: 'Produto', valor: nomeProduto, classe: 'col-desc', render: (a) => html`<b>${nomeProduto(a)}</b>` }, { chave: 'rec', titulo: 'Receita', valor: (a) => `${a.codigo} · ${a.nome}`, render: (a) => `${a.codigo} · ${a.nome}` },
          { chave: 'ndias', titulo: 'Dias', num: true },
          { chave: 'produzido', titulo: 'Produzido', num: true, valor: (a) => a.produzido || 0, render: (a) => num(a.produzido || 0, 0) },
          { chave: 'receitas', titulo: 'Receitas', num: true, render: (a) => num(a.receitas, 1) },
          { chave: 'previsto', titulo: 'Previsão', num: true, valor: (a) => a.previsto || 0, render: (a) => (a.previsto === null ? html`<${Etiqueta} cor="vermelho">sem rendimento</${Etiqueta}>` : html`<b>${num(a.previsto, 0)} ${unid(a)}</b>`) },
        ]}
        totais=${porProduto.length > 0 && { rotulo: 'Total', produzido: num(linhas.reduce((s, l) => s + Number(l.produzido || 0), 0), 0), receitas: num(receitasTot, 1), previsto: totalPorUnidade(linhas) }} />`}
      <p class="nota">Previsão = receitas programadas × quanto cada receita rende (ficha técnica). Produzido = soma das bateladas finalizadas pela engenharia. Receitas canceladas não entram.</p>`}`;
}
