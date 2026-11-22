// =====================================================================
// PAINEL GERENCIAL — visão de estoque, compras e consumo (controladoria e diretoria)
// =====================================================================
import { html, useState, useEffect, useMemo, useApp, Cabecalho, Cartao, Carregando, Etiqueta, Tabela, avisar, useHistorico, useFiltroMudou } from '../ui.js';
import { STATUS_ESTOQUE } from '../calc.js';
import { CATEGORIAS, plural, moeda, num, data, dataHora, hojeISO, somarDias, diasEntre, pl, qtdDupla, numeroPedido, mensagemErro, diaLocal } from '../util.js';
import { BarrasH, Colunas, BarraParte } from '../graficos.js';
import { Exportar } from '../exportar.js';
import { resumoPedido, PrazoEtiqueta } from './pedidos.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const curta = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `R$ ${num(v / 1e6, 1)} mi`;
  if (a >= 1e3) return `R$ ${num(v / 1e3, a >= 1e4 ? 0 : 1)} mil`;
  return `R$ ${num(v, 0)}`;
};
const pct = (p, t) => (t > 0 ? `${num((p / t) * 100, 1)}%` : '–');
const inicioDia = (iso) => new Date(iso + 'T00:00:00').toISOString();
const mesISO = (iso) => iso.slice(0, 7);

function periodo(id) {
  const h = hojeISO(); const [a, m] = h.split('-').map(Number);
  if (id === 'mes') return { de: `${h.slice(0, 8)}01`, ate: h, rotulo: 'este mês' };
  if (id === 'mes_ant') { const d = new Date(a, m - 2, 1); const f = new Date(a, m - 1, 0);
    const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    return { de: iso(d), ate: iso(f), rotulo: `${MESES[d.getMonth()]}/${d.getFullYear()}` }; }
  if (id === '90') return { de: somarDias(h, -89), ate: h, rotulo: 'últimos 90 dias' };
  return { de: `${a}-01-01`, ate: h, rotulo: `ano de ${a}` };
}

export function TelaPainel() {
  const { dados, api, ir } = useApp();
  const [per, setPer] = useState('mes');
  const [movs, setMovs] = useState(null);
  const P = periodo(per);
  const h = hojeISO();
  // 6 meses para o gráfico mensal + o período escolhido + 30 dias para "dias de estoque"
  const [a, m] = h.split('-').map(Number);
  const seisMeses = `${new Date(a, m - 6, 1).getFullYear()}-${String(new Date(a, m - 6, 1).getMonth() + 1).padStart(2, '0')}-01`;
  const desde = [seisMeses, P.de, somarDias(h, -29)].sort()[0];
  useHistorico(desde);
  const mudou = useFiltroMudou([desde]);
  useEffect(() => {
    let vivo = true; if (mudou()) setMovs(null);
    api.listar('movimentos', { desde: inicioDia(desde), ate: inicioDia(somarDias(h, 1)) })
      .then((l) => vivo && setMovs(l)).catch((e) => { avisar(mensagemErro(e), 'erro'); if (vivo) setMovs([]); });
    return () => { vivo = false; };
  }, [desde, dados.carregadoEm]);

  const est = useMemo(() => calcEstoque(dados), [dados]);
  const cmp = useMemo(() => (movs ? calcCompras(dados, movs, P, seisMeses) : null), [dados, movs, per]);

  const chips = html`<span class="chips">${[['mes', 'Este mês'], ['mes_ant', 'Mês anterior'], ['90', '90 dias'], ['ano', 'Ano']].map(([id, t]) =>
    html`<button class=${'chip' + (per === id ? ' ativo' : '')} onClick=${() => setPer(id)}>${t}</button>`)}</span>`;

  return html`
    <${Cabecalho} titulo="Resumo (indicadores)" sub=${`Estoque, compras e consumo · atualizado em ${dataHora(dados.carregadoEm || new Date())}`}>
      ${cmp && html`<${Exportar} titulo="Painel gerencial de estoque e compras" filtros=${`Compras e consumo: ${P.rotulo} (${data(P.de)} a ${data(P.ate)})`}
        arquivo=${`painel-gerencial-${h}`} paisagem=${false} colunas=${[{ titulo: 'Indicador', valor: (l) => l[0], largura: 42 }, { titulo: 'Valor', valor: (l) => l[1], largura: 22 }, { titulo: 'Detalhe', valor: (l) => l[2] || '', largura: 40 }]}
        linhas=${resumoIndicadores(est, cmp, P)} abas=${() => abasExcel(est, cmp, P, dados)} />`}
    </${Cabecalho}>

    <h2 class="secao-titulo">Estoque hoje</h2>
    <div class="cartoes">
      <${Cartao} titulo="Valor em estoque" valor=${moeda(est.total)} sub=${pl(est.itens, 'item com saldo', 'itens com saldo')} aoClicar=${() => ir('estoque')} />
      ${est.cats.slice(0, 3).map((c) => html`<${Cartao} titulo=${c.rotulo} valor=${moeda(c.valor)} sub=${`${pct(c.valor, est.total)} do estoque`} aoClicar=${() => ir('estoque')} />`)}
      <${Cartao} titulo="Dias de estoque" valor=${cmp && cmp.consumoDia30 > 0 ? num(est.total / cmp.consumoDia30, 0) : '–'}
        sub=${cmp ? `consumo médio ${moeda(cmp.consumoDia30)}/dia (30 dias)` : 'calculando…'} />
      <${Cartao} titulo="Críticos ou zerados" valor=${est.alerta.length} sub=${pl(est.comprar, 'item no ponto de pedido', 'itens no ponto de pedido')}
        cor=${est.alerta.length ? 'c-vermelho' : ''} aoClicar=${() => ir('estoque')} />
    </div>
    <section class="painel"><h3>Quantidades em estoque (por grupo e classificação)</h3>
      <${Tabela} linhas=${est.quant} chave="k" max=${12} colunas=${[
        { chave: 'grupo', titulo: 'Grupo', render: (g) => html`<b>${g.grupo}</b>` },
        { chave: 'classe', titulo: 'Classif.', render: (g) => (g.classe ? html`<${Etiqueta} cor="azul">${g.classe}</${Etiqueta}>` : '–') },
        { chave: 'saldo', titulo: 'Quantidade', num: true, render: (g) => html`<b>${num(g.saldo, g.saldo < 100 ? 2 : 0)}</b> <small>${g.unidade}</small>` },
        { chave: 'emb', titulo: 'Em embalagens', num: true, valor: (g) => g.embQtd || 0, render: (g) => g.embTxt || '–' },
        { chave: 'valor', titulo: 'Valor', num: true, render: (g) => moeda(g.valor) },
        { chave: 'marcas', titulo: 'Marcas / itens', valor: (g) => g.itens.length, render: (g) => html`<small>${g.itens.map((p) => p.marca || p.codigo).join(', ')}</small>` },
      ]} />
    </section>
    <div class="painel-grade">
      <section class="painel"><h3>Participação por categoria</h3>
        <${BarrasH} itens=${est.cats.map((c) => ({ rotulo: c.rotulo, valor: c.valor, texto: `${moeda(c.valor)} · ${pct(c.valor, est.total)}`, sub: pl(c.itens, 'item', 'itens') }))} formatar=${moeda} />
      </section>
      <section class="painel"><h3>Maiores itens em valor</h3>
        <${BarrasH} itens=${est.top.map((p) => ({ rotulo: p.descricao, valor: p.valor, sub: `${p.codigo} · ${qtdDupla(p, p.saldo)}`,
          texto: `${curta(p.valor)} · ${pct(p.valor, est.total)}`, dica: `${p.descricao}: ${moeda(p.valor)} (${pct(p.valor, est.total)} do estoque; acumulado ${pct(p.acum, est.total)})` }))} formatar=${moeda} />
      </section>
      <section class="painel"><h3>Valor por grupo</h3>
        <${BarrasH} itens=${est.grupos.map((g) => ({ rotulo: g.nome, valor: g.valor, texto: `${curta(g.valor)} · ${pct(g.valor, est.total)}`, sub: pl(g.itens, 'item', 'itens') }))} formatar=${moeda} />
      </section>
      <section class="painel"><h3>Curva ABC do estoque</h3>
        <div class="abc">${est.abc.map((c) => html`<div class=${'abc-' + c.classe.toLowerCase()}><b>${c.classe}</b>
          <span><strong>${pl(c.itens, 'item', 'itens')}</strong> (${pct(c.itens, est.itens)} dos itens)</span>
          <span>${moeda(c.valor)} · <strong>${pct(c.valor, est.total)}</strong> do valor</span></div>`)}</div>
        <p class="nota">A: itens que somam 80% do valor · B: os próximos 15% · C: os 5% restantes. Os itens A merecem contagem e negociação mais frequentes.</p>
        ${est.alerta.length > 0 && html`<h3>Pedem atenção</h3><ul class="lista-alerta">${est.alerta.slice(0, 6).map((p) => html`<li>
          <${Etiqueta} cor=${STATUS_ESTOQUE[p.status].cor}>${STATUS_ESTOQUE[p.status].rotulo}</${Etiqueta}> <b>${p.descricao}</b>
          <small>${qtdDupla(p, p.saldo)}${p.cobertura !== null ? ` · ${num(p.cobertura, 1)} dias` : ''}${p.a_receber > 0 ? ' · tem pedido' : ''}</small></li>`)}</ul>`}
      </section>
    </div>

    <div class="secao-com-filtro"><h2 class="secao-titulo">Compras</h2>${chips}<span class="nota">${data(P.de)} a ${data(P.ate)}</span></div>
    ${!cmp ? html`<${Carregando} />` : html`
      <div class="cartoes">
        <${Cartao} titulo="Comprado no período" valor=${moeda(cmp.comprado)} sub=${pl(cmp.pedidosPeriodo, 'pedido emitido', 'pedidos emitidos')} aoClicar=${() => ir('relatorios')} />
        <${Cartao} titulo="Recebido no período" valor=${moeda(cmp.recebido)} sub=${pl(cmp.recebimentos, 'recebimento', 'recebimentos')} />
        <${Cartao} titulo="A receber" valor=${moeda(cmp.aReceber)} sub=${pl(cmp.pendentes.length, 'pedido pendente', 'pedidos pendentes')} aoClicar=${() => ir('pedidos')} />
        <${Cartao} titulo="Atrasados" valor=${moeda(cmp.atrasadoValor)} sub=${pl(cmp.atrasados, 'pedido', 'pedidos')} cor=${cmp.atrasados ? 'c-vermelho' : ''} aoClicar=${() => ir('pedidos')} />
        <${Cartao} titulo="Prazo real de entrega" valor=${cmp.prazoMedio === null ? '–' : pl(Math.round(cmp.prazoMedio), 'dia', 'dias')} sub=${cmp.pontualidade === null ? 'sem entregas no período' : `${num(cmp.pontualidade, 0)}% chegaram no prazo`} />
        <${Cartao} titulo="Recebidos com divergência" valor=${cmp.recebimentos ? pct(cmp.divergentes, cmp.recebimentos) : '–'} sub=${pl(cmp.divergentes, 'recebimento', 'recebimentos')} cor=${cmp.divergentes ? 'c-laranja' : ''} />
      </div>
      <div class="painel-grade">
        <section class="painel"><h3>Compras por mês</h3>
          <${Colunas} categorias=${cmp.meses.map((x) => x.rotulo)} series=${[{ nome: 'Pedidos emitidos', valores: cmp.meses.map((x) => x.pedido) }, { nome: 'Recebido', valores: cmp.meses.map((x) => x.recebido) }]}
            formatar=${moeda} formatarEixo=${curta} />
        </section>
        <section class="painel"><h3>Compras por fornecedor (${P.rotulo})</h3>
          <${BarrasH} itens=${cmp.fornecedores.map((f) => ({ rotulo: f.nome, valor: f.valor, texto: `${curta(f.valor)} · ${pct(f.valor, cmp.comprado)}`, sub: pl(f.pedidos, 'pedido', 'pedidos') }))} formatar=${moeda} />
        </section>
        <section class="painel"><h3>Estoque + o que está a caminho</h3>
          <p class="hero-numero">${moeda(est.total + cmp.aReceber)}</p>
          <${BarraParte} partes=${[{ nome: 'Em estoque', valor: est.total }, { nome: 'A receber', valor: cmp.aReceber }]} formatar=${moeda} />
          <table class="tabela tabela-mini"><thead><tr><th>Categoria</th><th class="n">Estoque</th><th class="n">A receber</th><th class="n">Total</th></tr></thead>
            <tbody>${est.cats.map((c) => { const r = cmp.receberCat.get(c.id) || 0; return html`<tr><td>${c.rotulo}</td><td class="n">${moeda(c.valor)}</td><td class="n">${r ? moeda(r) : '–'}</td><td class="n"><b>${moeda(c.valor + r)}</b></td></tr>`; })}</tbody></table>
        </section>
        <section class="painel"><h3>Próximas entregas</h3>
          <${Tabela} linhas=${cmp.proximos} max=${8} aoClicar=${(p) => ir('pedidos', { abrir: p.id })} vazio="Nenhum pedido pendente." colunas=${[
            { chave: 'id', titulo: 'Pedido', render: (p) => html`<b>${numeroPedido(p.id)}</b>` },
            { chave: 'f', titulo: 'Fornecedor', render: (p) => p.r.fornecedor?.nome },
            { chave: 'previsao_entrega', titulo: 'Previsão', render: (p) => (p.previsao_entrega ? data(p.previsao_entrega) : '–') },
            { chave: 'prazo', titulo: 'Prazo', render: (p) => html`<${PrazoEtiqueta} r=${p.r} />` },
            { chave: 'v', titulo: 'A receber', num: true, render: (p) => moeda(p.pend) },
          ]} />
        </section>
      </div>

      <h2 class="secao-titulo">Consumo (${P.rotulo})</h2>
      <div class="cartoes">
        <${Cartao} titulo="Consumo total" valor=${moeda(cmp.consumo.total)} sub=${`${moeda(cmp.consumo.total / Math.max(1, diasEntre(P.de, P.ate) + 1))}/dia`} />
        <${Cartao} titulo="Pelas receitas" valor=${moeda(cmp.consumo.receita)} sub=${pct(cmp.consumo.receita, cmp.consumo.total)} aoClicar=${() => ir('saidas-producao')} />
        <${Cartao} titulo="Avulsas da pesagem" valor=${moeda(cmp.consumo.avulsa)} sub=${pct(cmp.consumo.avulsa, cmp.consumo.total)} cor=${cmp.consumo.avulsa ? 'c-laranja' : ''} />
        <${Cartao} titulo="Almoxarifado" valor=${moeda(cmp.consumo.almox)} sub="embalagens, escritório, limpeza" />
        <${Cartao} titulo="Perdas no inventário" valor=${moeda(cmp.consumo.perdaInv)} sub=${cmp.consumo.ganhoInv ? `sobras ${moeda(cmp.consumo.ganhoInv)}` : 'ajustes para menos'} cor=${cmp.consumo.perdaInv ? 'c-vermelho' : ''} />
      </div>
      <div class="painel-grade">
        <section class="painel"><h3>Consumo por categoria</h3>
          <${BarrasH} itens=${cmp.consumoCat.map((c) => ({ rotulo: c.rotulo, valor: c.valor, texto: `${curta(c.valor)} · ${pct(c.valor, cmp.consumo.total)}` }))} formatar=${moeda} />
        </section>
        <section class="painel"><h3>Itens mais consumidos (valor)</h3>
          <${BarrasH} itens=${cmp.consumoTop.map((c) => ({ rotulo: c.p.descricao, valor: c.valor, sub: qtdDupla(c.p, c.qtd), texto: curta(c.valor) }))} formatar=${moeda} />
        </section>
      </div>`}`;
}

// ---------------------------------------------------------------------
function calcEstoque(dados) {
  const lista = dados.ind.filter((p) => p.ativo && p.controla_estoque !== false && !['intermediario', 'produto_acabado'].includes(p.categoria));
  const comSaldo = lista.filter((p) => p.saldo > 0);
  const total = comSaldo.reduce((s, p) => s + p.valor, 0);
  const cats = Object.entries(CATEGORIAS).map(([id, rotulo]) => {
    const it = comSaldo.filter((p) => p.categoria === id);
    return { id, rotulo, valor: it.reduce((s, p) => s + p.valor, 0), itens: it.length };
  }).sort((a, b) => b.valor - a.valor);
  const ord = [...comSaldo].sort((a, b) => b.valor - a.valor);
  let acum = 0; const abcMap = { A: { classe: 'A', itens: 0, valor: 0 }, B: { classe: 'B', itens: 0, valor: 0 }, C: { classe: 'C', itens: 0, valor: 0 } };
  const comAcum = ord.map((p) => { const antes = acum; acum += p.valor; const c = total && antes / total < 0.8 ? 'A' : total && antes / total < 0.95 ? 'B' : 'C';
    abcMap[c].itens += 1; abcMap[c].valor += p.valor; return { ...p, acum, abc: c }; });
  const g = new Map();
  for (const p of comSaldo) { const k = p.grupo || CATEGORIAS[p.categoria]; const x = g.get(k) || { nome: k, valor: 0, itens: 0 }; x.valor += p.valor; x.itens += 1; g.set(k, x); }
  let grupos = [...g.values()].sort((a, b) => b.valor - a.valor);
  if (grupos.length > 8) { const resto = grupos.slice(7); grupos = [...grupos.slice(0, 7), { nome: `Outros (${resto.length} grupos)`, valor: resto.reduce((s, x) => s + x.valor, 0), itens: resto.reduce((s, x) => s + x.itens, 0) }]; }
  // quantidade física por grupo + classificação (na unidade padrão; e em embalagens quando todas iguais)
  const qm = new Map();
  for (const p of comSaldo) {
    const k = `${p.grupo || CATEGORIAS[p.categoria]}|${p.classificacao || ''}|${p.unidade_estoque}`;
    const x = qm.get(k) || { k, grupo: p.grupo || CATEGORIAS[p.categoria], classe: p.classificacao || '', unidade: p.unidade_estoque, saldo: 0, valor: 0, itens: [] };
    x.saldo += p.saldo; x.valor += p.valor; x.itens.push(p); qm.set(k, x);
  }
  const quant = [...qm.values()].sort((a, b) => b.valor - a.valor).map((g) => {
    const embs = new Set(g.itens.map((p) => (p.unidade_compra ? `${p.unidade_compra}|${Number(p.fator_compra)}` : '')));
    if (embs.size === 1 && !embs.has('')) { const [u, f] = [...embs][0].split('|'); const q = g.saldo / Number(f);
      return { ...g, embQtd: q, embTxt: `${num(q, 1)} ${q > 0 && q < 2 ? u : plural(u, q)} de ${num(Number(f), 2)} ${g.unidade}` }; }
    return { ...g, embTxt: embs.size > 1 ? 'embalagens diferentes' : '' };
  });
  const alerta = lista.filter((p) => p.status === 'critico' || p.status === 'zerado').sort((a, b) => a.status_ordem - b.status_ordem || (a.cobertura ?? 0) - (b.cobertura ?? 0));
  return { quant, total, itens: comSaldo.length, cats: cats.filter((c) => c.itens > 0 || c.valor > 0), top: comAcum.slice(0, 10), grupos, abc: Object.values(abcMap), alerta,
    comprar: lista.filter((p) => p.status === 'comprar').length, lista: comAcum };
}

function calcCompras(dados, movs, P, seisMeses) {
  const h = hojeISO();
  const naData = (iso) => iso >= P.de && iso <= P.ate;
  const pedidos = dados.pedidos.filter((p) => p.status !== 'cancelado').map((p) => ({ ...p, r: resumoPedido(p, dados) }));
  const doPeriodo = pedidos.filter((p) => naData(p.data_pedido));
  const comprado = doPeriodo.reduce((s, p) => s + p.r.valor, 0);
  // valor pendente de cada pedido (proporcional ao que falta chegar de cada item)
  const receberCat = new Map();
  const pendentes = pedidos.filter((p) => p.r.pendente).map((p) => {
    let pend = 0;
    for (const i of p.r.itens) {
      const falta = Math.max(0, Number(i.quantidade_base) - Number(i.qtd_recebida_base));
      const v = Number(i.quantidade_base) > 0 ? Number(i.valor_total) * (falta / Number(i.quantidade_base)) : 0;
      pend += v; const cat = dados.mapa.produto.get(i.produto_id)?.categoria; receberCat.set(cat, (receberCat.get(cat) || 0) + v);
    }
    return { ...p, pend };
  });
  const aReceber = pendentes.reduce((s, p) => s + p.pend, 0);
  const atr = pendentes.filter((p) => p.r.atrasado);
  const proximos = [...pendentes].sort((a, b) => String(a.previsao_entrega || '9999').localeCompare(String(b.previsao_entrega || '9999')));
  // recebimentos do período
  const recs = (dados.recebimentos || []).filter((r) => naData(diaLocal(r.data_hora)));
  const entradas = movs.filter((m) => m.tipo === 'entrada');
  const recebido = entradas.filter((m) => naData(diaLocal(m.data_hora))).reduce((s, m) => s + Number(m.valor), 0);
  // prazo real e pontualidade (1º recebimento de cada pedido no período)
  const prazos = []; let noPrazo = 0;
  for (const p of pedidos) {
    const rs = (dados.recebimentos || []).filter((r) => r.pedido_id === p.id).sort((a, b) => a.id - b.id);
    if (!rs.length || !naData(diaLocal(rs[0].data_hora))) continue;
    const d1 = diaLocal(rs[0].data_hora); prazos.push(diasEntre(p.data_pedido, d1));
    if (!p.previsao_entrega || d1 <= p.previsao_entrega) noPrazo += 1;
  }
  // por fornecedor
  const fm = new Map();
  for (const p of doPeriodo) { const k = p.r.fornecedor?.nome || '—'; const x = fm.get(k) || { nome: k, valor: 0, pedidos: 0 }; x.valor += p.r.valor; x.pedidos += 1; fm.set(k, x); }
  let fornecedores = [...fm.values()].sort((a, b) => b.valor - a.valor);
  if (fornecedores.length > 8) { const r = fornecedores.slice(7); fornecedores = [...fornecedores.slice(0, 7), { nome: `Outros (${r.length})`, valor: r.reduce((s, x) => s + x.valor, 0), pedidos: r.reduce((s, x) => s + x.pedidos, 0) }]; }
  // 6 meses
  const meses = [];
  const [a, m] = seisMeses.split('-').map(Number);
  for (let k = 0; k < 6; k++) { const d = new Date(a, m - 1 + k, 1); const id = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    meses.push({ id, rotulo: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      pedido: pedidos.filter((p) => mesISO(p.data_pedido) === id).reduce((s, p) => s + p.r.valor, 0),
      recebido: entradas.filter((x) => mesISO(diaLocal(x.data_hora)) === id).reduce((s, x) => s + Number(x.valor), 0) }); }
  // consumo
  const doPer = movs.filter((x) => naData(diaLocal(x.data_hora)));
  const porId = new Map(movs.map((x) => [x.id, x]));
  const tipoReal = (x) => (x.tipo === 'correcao' ? porId.get(x.corrige_id)?.tipo : x.tipo);
  const consumo = { receita: 0, avulsa: 0, almox: 0, perdaInv: 0, ganhoInv: 0, total: 0 };
  const cc = new Map(), ci = new Map();
  for (const x of doPer) {
    const t = tipoReal(x); const v = -Number(x.valor);
    if (t === 'inventario') { if (v > 0) consumo.perdaInv += v; else consumo.ganhoInv += -v; continue; }
    if (!['saida_receita', 'saida_avulsa', 'saida_almox'].includes(t)) continue;
    consumo[t === 'saida_receita' ? 'receita' : t === 'saida_avulsa' ? 'avulsa' : 'almox'] += v; consumo.total += v;
    const p = dados.mapa.produto.get(x.produto_id);
    cc.set(p?.categoria, (cc.get(p?.categoria) || 0) + v);
    const y = ci.get(x.produto_id) || { p, valor: 0, qtd: 0 }; y.valor += v; y.qtd += -Number(x.quantidade); ci.set(x.produto_id, y);
  }
  const ult30 = movs.filter((x) => diaLocal(x.data_hora) >= somarDias(h, -29) && ['saida_receita', 'saida_avulsa', 'saida_almox'].includes(tipoReal(x)));
  return {
    comprado, pedidosPeriodo: doPeriodo.length, recebido, recebimentos: recs.length, divergentes: recs.filter((r) => r.divergencia).length,
    pendentes, aReceber, atrasados: atr.length, atrasadoValor: atr.reduce((s, p) => s + p.pend, 0), proximos, receberCat,
    prazoMedio: prazos.length ? prazos.reduce((s, d) => s + d, 0) / prazos.length : null,
    pontualidade: prazos.length ? (noPrazo / prazos.length) * 100 : null,
    fornecedores, meses, consumo,
    consumoCat: [...cc.entries()].map(([id, valor]) => ({ rotulo: CATEGORIAS[id] || 'Outros', valor })).sort((a, b) => b.valor - a.valor),
    consumoTop: [...ci.values()].sort((a, b) => b.valor - a.valor).slice(0, 8),
    consumoDia30: ult30.reduce((s, x) => s - Number(x.valor), 0) / 30,
  };
}

function resumoIndicadores(est, cmp, P) {
  const L = [['ESTOQUE HOJE', '', ''], ['Valor em estoque', moeda(est.total), pl(est.itens, 'item com saldo', 'itens com saldo')]];
  est.cats.forEach((c) => L.push([`  ${c.rotulo}`, moeda(c.valor), `${pct(c.valor, est.total)} · ${pl(c.itens, 'item', 'itens')}`]));
  L.push(['Dias de estoque', cmp.consumoDia30 > 0 ? num(est.total / cmp.consumoDia30, 0) : '–', `consumo médio ${moeda(cmp.consumoDia30)}/dia (30 dias)`]);
  L.push(['Itens críticos ou zerados', String(est.alerta.length), est.alerta.slice(0, 5).map((p) => p.descricao).join('; ')]);
  est.abc.forEach((c) => L.push([`Curva ${c.classe}`, pl(c.itens, 'item', 'itens'), `${moeda(c.valor)} (${pct(c.valor, est.total)})`]));
  L.push(['', '', ''], [`COMPRAS (${P.rotulo})`, '', '']);
  L.push(['Comprado no período', moeda(cmp.comprado), pl(cmp.pedidosPeriodo, 'pedido', 'pedidos')], ['Recebido no período', moeda(cmp.recebido), pl(cmp.recebimentos, 'recebimento', 'recebimentos')],
    ['A receber (pedidos pendentes)', moeda(cmp.aReceber), pl(cmp.pendentes.length, 'pedido', 'pedidos')], ['Atrasados', moeda(cmp.atrasadoValor), pl(cmp.atrasados, 'pedido', 'pedidos')],
    ['Estoque + a caminho', moeda(est.total + cmp.aReceber), ''],
    ['Prazo real de entrega', cmp.prazoMedio === null ? '–' : `${num(cmp.prazoMedio, 1)} dias`, cmp.pontualidade === null ? '' : `${num(cmp.pontualidade, 0)}% no prazo`],
    ['Recebidos com divergência', cmp.recebimentos ? pct(cmp.divergentes, cmp.recebimentos) : '–', pl(cmp.divergentes, 'recebimento', 'recebimentos')]);
  L.push(['', '', ''], [`CONSUMO (${P.rotulo})`, '', ''], ['Consumo total', moeda(cmp.consumo.total), ''], ['  Pelas receitas', moeda(cmp.consumo.receita), pct(cmp.consumo.receita, cmp.consumo.total)],
    ['  Avulsas da pesagem', moeda(cmp.consumo.avulsa), pct(cmp.consumo.avulsa, cmp.consumo.total)], ['  Almoxarifado', moeda(cmp.consumo.almox), pct(cmp.consumo.almox, cmp.consumo.total)],
    ['Perdas no inventário', moeda(cmp.consumo.perdaInv), cmp.consumo.ganhoInv ? `sobras ${moeda(cmp.consumo.ganhoInv)}` : '']);
  return L;
}

function abasExcel(est, cmp, P, dados) {
  const r2 = (v) => Math.round(v * 100) / 100;
  return [
    { nome: 'Indicadores', linhas: resumoIndicadores(est, cmp, P), colunas: [{ titulo: 'Indicador', valor: (l) => l[0], largura: 40 }, { titulo: 'Valor', valor: (l) => l[1], largura: 20 }, { titulo: 'Detalhe', valor: (l) => l[2], largura: 50 }] },
    { nome: 'Quantidades', linhas: est.quant, colunas: [{ titulo: 'Grupo', valor: (g) => g.grupo }, { titulo: 'Classificação', valor: (g) => g.classe },
      { titulo: 'Quantidade', valor: (g) => r2(g.saldo) }, { titulo: 'Unid.', valor: (g) => g.unidade }, { titulo: 'Em embalagens', valor: (g) => g.embTxt },
      { titulo: 'Valor', valor: (g) => r2(g.valor) }, { titulo: 'Marcas / itens', valor: (g) => g.itens.map((p) => `${p.codigo} ${p.marca || ''}`.trim()).join('; '), largura: 40 }] },
    { nome: 'Estoque por categoria', linhas: est.cats, colunas: [{ titulo: 'Categoria', valor: (c) => c.rotulo }, { titulo: 'Itens', valor: (c) => c.itens }, { titulo: 'Valor', valor: (c) => r2(c.valor) }, { titulo: '% do estoque', valor: (c) => (est.total ? r2((c.valor / est.total) * 100) : 0) }] },
    { nome: 'Curva ABC', linhas: est.lista, colunas: [{ titulo: 'Classe', valor: (p) => p.abc }, { titulo: 'Código', valor: (p) => p.codigo }, { titulo: 'Produto', valor: (p) => p.descricao, largura: 36 },
      { titulo: 'Categoria', valor: (p) => CATEGORIAS[p.categoria] }, { titulo: 'Grupo', valor: (p) => p.grupo }, { titulo: 'Saldo', valor: (p) => r2(p.saldo) }, { titulo: 'Unid.', valor: (p) => p.unidade_estoque },
      { titulo: 'Valor', valor: (p) => r2(p.valor) }, { titulo: '% do estoque', valor: (p) => (est.total ? r2((p.valor / est.total) * 100) : 0) }, { titulo: '% acumulado', valor: (p) => (est.total ? r2((p.acum / est.total) * 100) : 0) }] },
    { nome: 'Compras por mês', linhas: cmp.meses, colunas: [{ titulo: 'Mês', valor: (x) => x.rotulo }, { titulo: 'Pedidos emitidos', valor: (x) => r2(x.pedido) }, { titulo: 'Recebido', valor: (x) => r2(x.recebido) }] },
    { nome: 'Compras por fornecedor', linhas: cmp.fornecedores, colunas: [{ titulo: 'Fornecedor', valor: (f) => f.nome, largura: 34 }, { titulo: 'Pedidos', valor: (f) => f.pedidos }, { titulo: 'Valor', valor: (f) => r2(f.valor) }] },
    { nome: 'Pedidos a receber', linhas: cmp.proximos, colunas: [{ titulo: 'Pedido', valor: (p) => numeroPedido(p.id) }, { titulo: 'Fornecedor', valor: (p) => p.r.fornecedor?.nome, largura: 30 },
      { titulo: 'Data do pedido', valor: (p) => data(p.data_pedido) }, { titulo: 'Previsão', valor: (p) => (p.previsao_entrega ? data(p.previsao_entrega) : '') },
      { titulo: 'Dias para chegar', valor: (p) => p.r.dias ?? '' }, { titulo: 'Valor do pedido', valor: (p) => r2(p.r.valor) }, { titulo: 'A receber', valor: (p) => r2(p.pend) }] },
    { nome: 'Consumo por item', linhas: cmp.consumoTop, colunas: [{ titulo: 'Produto', valor: (c) => c.p?.descricao, largura: 36 }, { titulo: 'Quantidade', valor: (c) => r2(c.qtd) }, { titulo: 'Unid.', valor: (c) => c.p?.unidade_estoque }, { titulo: 'Valor', valor: (c) => r2(c.valor) }] },
  ];
}
