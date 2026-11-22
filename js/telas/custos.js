// =====================================================================
// Gestão de custos (controladoria — só administrador)
//  - Produtos: último custo de entrada e custo médio ponderado, na unidade de estoque
//  - Fichas / custo: custo da receita (batelada) e da unidade do produto acabado,
//    pelo último custo e pelo custo médio
// Custo médio ponderado: mantido pelo banco a cada entrada
//   ex.: 100 kg a R$ 1,00 → saem 50 → ficam 50 a R$ 1,00 → entram 100 a R$ 1,10
//        → médio = (50×1,00 + 100×1,10) ÷ 150 = R$ 1,0667/kg
// =====================================================================
import { html, useState, useEffect, useMemo, useApp, Tabela, Modal, Cartao, Cabecalho, Etiqueta, Busca, Abas, Carregando, avisar, Filtros } from '../ui.js';
import { CATEGORIAS, data, dataHora, hojeISO, num, qtd, moeda, pl, contem, numeroPedido, mensagemErro } from '../util.js';
import { Exportar } from '../exportar.js';
import { CustoProdutoAcabado, EstoqueValorizado, AvulsasPerdas } from './custos-producao.js';

const m4 = (v) => (v === null || v === undefined ? '–' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }));
const sing = (u) => String(u || 'un').replace(/ães$/, 'ão').replace(/es$/, (m, i, t) => (/(r|z)es$/.test(t) ? '' : 'es')).replace(/s$/, '');
const pct = (a, b) => (a && b ? ((a - b) / b) * 100 : null);

function useCustos() {
  const { api, dados } = useApp();
  const [mapa, setMapa] = useState(null);
  useEffect(() => {
    let vivo = true;
    api.rpc('custos_produtos', {}).then((l) => { if (vivo) setMapa(new Map((l || []).map((x) => [Number(x.produto_id), x]))); })
      .catch((e) => { avisar(mensagemErro(e), 'erro'); if (vivo) setMapa(new Map()); });
    return () => { vivo = false; };
  }, [dados.carregadoEm]);
  return mapa;
}

export function TelaCustos() {
  const [aba, setAba] = useState('produtos');
  const ult = useCustos();
  return html`
    <${Cabecalho} titulo="Central de Custos" sub="Matéria-prima, receitas, produto acabado, estoque valorizado e perdas. Visível só para a controladoria e a diretoria." />
    <${Abas} abas=${[{ id: 'produtos', titulo: 'Matéria-prima' }, { id: 'fichas', titulo: 'Receitas (padrão)' }, { id: 'acabado', titulo: 'Produto acabado' },
      { id: 'valorizado', titulo: 'Estoque valorizado' }, { id: 'perdas', titulo: 'Avulsas e perdas' }]} ativa=${aba} aoMudar=${setAba} />
    ${aba === 'acabado' ? html`<${CustoProdutoAcabado} />` : aba === 'valorizado' ? html`<${EstoqueValorizado} />` : aba === 'perdas' ? html`<${AvulsasPerdas} />`
      : !ult ? html`<${Carregando} />` : aba === 'produtos' ? html`<${CustosProdutos} ult=${ult} />` : html`<${CustosFichas} ult=${ult} />`}`;
}

// ------------------------------- PRODUTOS ----------------------------
function CustosProdutos({ ult }) {
  const { dados } = useApp();
  const [cat, setCat] = useState('materia_prima');
  const [busca, setBusca] = useState('');
  const [inativos, setInativos] = useState(false);
  const linhas = useMemo(() => dados.produtos.filter((p) => (inativos || p.ativo) && (!cat || p.categoria === cat)
      && contem(`${p.codigo} ${p.descricao} ${p.grupo || ''} ${p.classificacao || ''} ${p.marca || ''}`, busca))
    .map((p) => { const u = ult.get(p.id); const uc = u ? Number(u.ultimo_custo) : null; const cm = Number(p.custo_medio || 0);
      return { ...p, uc, ud: u?.ultima_data, utipo: u?.ultimo_tipo, uforn: u?.fornecedor_id ? dados.mapa.fornecedor.get(Number(u.fornecedor_id))?.nome : '',
        uped: u?.pedido_id, cm, dif: pct(uc, cm), valor: Math.max(Number(p.saldo), 0) * cm,
        ucEmb: uc && p.unidade_compra && Number(p.fator_compra) > 0 ? uc * Number(p.fator_compra) : null }; }),
  [dados, ult, cat, busca, inativos]);
  const totalValor = linhas.reduce((s, p) => s + p.valor, 0);
  const semCusto = linhas.filter((p) => !p.uc).length;
  const subiram = linhas.filter((p) => p.dif !== null && p.dif > 5).length;
  const colExp = [
    { titulo: 'Código', valor: (p) => p.codigo }, { titulo: 'Produto', valor: (p) => p.descricao, largura: 32 },
    { titulo: 'Categoria', valor: (p) => CATEGORIAS[p.categoria] || p.categoria }, { titulo: 'Grupo', valor: (p) => p.grupo || '' },
    { titulo: 'Classificação', valor: (p) => p.classificacao || '' }, { titulo: 'Unid.', valor: (p) => p.unidade_estoque },
    { titulo: 'Saldo', valor: (p) => Number(p.saldo), num: true },
    { titulo: 'Último custo (unid.)', valor: (p) => (p.uc === null ? '' : Math.round(p.uc * 10000) / 10000), texto: (p) => m4(p.uc), num: true },
    { titulo: 'Último custo (embalagem)', valor: (p) => (p.ucEmb === null ? '' : Math.round(p.ucEmb * 100) / 100), texto: (p) => (p.ucEmb ? `${moeda(p.ucEmb)}/${p.unidade_compra}` : ''), num: true },
    { titulo: 'Data último custo', valor: (p) => (p.ud ? dataHora(p.ud) : '') }, { titulo: 'Fornecedor', valor: (p) => p.uforn || (p.utipo === 'implantacao' ? 'implantação' : '') },
    { titulo: 'Custo médio (unid.)', valor: (p) => Math.round(p.cm * 10000) / 10000, texto: (p) => m4(p.cm), num: true },
    { titulo: 'Último x médio (%)', valor: (p) => (p.dif === null ? '' : Math.round(p.dif * 10) / 10), num: true },
    { titulo: 'Valor em estoque (médio)', valor: (p) => Math.round(p.valor * 100) / 100, texto: (p) => moeda(p.valor), num: true },
  ];
  return html`
    <div class="titulo-com-acao"><span></span>
      <${Exportar} titulo="Gestão de custos - produtos" filtros=${`${cat ? CATEGORIAS[cat] : 'Todas as categorias'} · ${pl(linhas.length, 'produto', 'produtos')}`}
        arquivo=${`custos-produtos-${hojeISO()}`} colunas=${colExp} linhas=${linhas} /></div>
    <div class="cartoes">
      <${Cartao} titulo="Produtos" valor=${linhas.length} sub=${cat ? CATEGORIAS[cat] : 'todas as categorias'} />
      <${Cartao} titulo="Valor em estoque (custo médio)" valor=${moeda(totalValor)} />
      <${Cartao} titulo="Último custo acima do médio (+5%)" valor=${subiram} cor=${subiram ? 'c-laranja' : ''} sub="preço subiu na última compra" />
      <${Cartao} titulo="Sem custo de compra" valor=${semCusto} cor=${semCusto ? 'c-laranja' : ''} sub="ainda sem entrada com preço" />
    </div>
    <${Filtros} ativos=${[cat, inativos].filter(Boolean).length} fixo=${html`<${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Código, produto, grupo, classificação ou marca" />`}>
      <div class="chips">
        <button class=${'chip' + (!cat ? ' ativo' : '')} onClick=${() => setCat('')}>Todas</button>
        ${Object.entries(CATEGORIAS).map(([k, v]) => html`<button class=${'chip' + (cat === k ? ' ativo' : '')} onClick=${() => setCat(k)}>${v}</button>`)}
      </div>
      <label class="check"><input type="checkbox" checked=${inativos} onChange=${(e) => setInativos(e.target.checked)} /> Mostrar inativos</label>
    </${Filtros}>
    <${Tabela} linhas=${linhas} ordemInicial=${{ chave: 'descricao', dir: 1 }}
      colunas=${[
        { chave: 'descricao', titulo: 'Produto', render: (p) => html`<b>${p.descricao}</b><br /><small>${p.codigo}${p.grupo ? ' · ' + p.grupo : ''}${p.classificacao ? ' · ' + p.classificacao : ''}</small>` },
        { chave: 'saldo', titulo: 'Saldo', num: true, valor: (p) => Number(p.saldo), render: (p) => `${qtd(p.saldo)} ${p.unidade_estoque}` },
        { chave: 'uc', titulo: 'Último custo', num: true, valor: (p) => p.uc ?? -1,
          render: (p) => (p.uc === null ? html`<${Etiqueta} cor="laranja">sem compra</${Etiqueta}>` : html`<b>${m4(p.uc)}</b>/${p.unidade_estoque}
            ${p.ucEmb ? html`<br /><small>${moeda(p.ucEmb)}/${p.unidade_compra}</small>` : ''}`) },
        { chave: 'ud', titulo: 'Última compra', valor: (p) => p.ud || '', render: (p) => (p.ud ? html`${data(p.ud.slice(0, 10))}<br /><small>${p.uforn || (p.utipo === 'implantacao' ? 'implantação de saldo' : '')}${p.uped ? ' · ' + numeroPedido(p.uped) : ''}</small>` : '–') },
        { chave: 'cm', titulo: 'Custo médio', num: true, render: (p) => html`<b>${m4(p.cm)}</b>/${p.unidade_estoque}` },
        { chave: 'dif', titulo: 'Último x médio', num: true, valor: (p) => p.dif ?? -999,
          render: (p) => (p.dif === null ? '–' : html`<span class=${p.dif > 5 ? 'txt-vermelho' : p.dif < -5 ? 'txt-verde' : ''}>${p.dif > 0 ? '+' : ''}${num(p.dif, 1)}%</span>`) },
        { chave: 'valor', titulo: 'Valor em estoque', num: true, render: (p) => moeda(p.valor) },
      ]}
      rodape=${linhas.length > 1 && html`<tr><td colspan="6">${pl(linhas.length, 'produto', 'produtos')}</td><td class="n"><b>${moeda(totalValor)}</b></td></tr>`} />
    <p class="nota">Valores na unidade de estoque (kg, L, un…). <b>Último custo</b> = custo unitário da última entrada com preço (pedido/nota ou implantação). <b>Custo médio</b> = média ponderada: a cada entrada, (saldo × médio anterior + quantidade × custo da entrada) ÷ (saldo + quantidade); saídas não mudam o médio.</p>`;
}

// ------------------------------- FICHAS ------------------------------
export function custoDaFicha(ficha, dados, ult) {
  const itens = dados.fichaItens.filter((i) => i.ficha_id === ficha.id).map((i) => {
    const p = dados.mapa.produto.get(i.produto_id);
    const u = ult.get(i.produto_id);
    const cm = Number(p?.custo_medio || 0);
    const uc = u ? Number(u.ultimo_custo) : null;
    // embalagem na ficha = nº por unidade produzida → converte para a unidade de estoque da receita inteira
    const pe = p?.categoria === 'embalagem' ? (String(p.unidade_estoque).toLowerCase() === 'kg' ? Number(p.peso_embalagem_g || 0) / 1000 : String(p.unidade_estoque).toLowerCase() === 'g' ? Number(p.peso_embalagem_g || 0) : 1) * Number(ficha.rendimento_qtd || 0) : 1;
    const q = Number(i.quantidade) * pe;
    return { ...i, p, q, uc, cm, semUlt: uc === null, tUlt: q * (uc ?? cm), tMed: q * cm };
  });
  const tUlt = itens.reduce((s, i) => s + i.tUlt, 0), tMed = itens.reduce((s, i) => s + i.tMed, 0);
  const rend = Number(ficha.rendimento_qtd || 0) || null;
  return { itens, tUlt, tMed, rend, uUlt: rend ? tUlt / rend : null, uMed: rend ? tMed / rend : null, semUlt: itens.some((i) => i.semUlt) };
}

function CustosFichas({ ult }) {
  const { dados } = useApp();
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState(null);
  const linhas = useMemo(() => dados.fichas.filter((f) => f.ativo && contem(`${f.codigo} ${f.nome} ${f.produto_final || ''}`, busca))
    .map((f) => ({ ...f, c: custoDaFicha(f, dados, ult) })), [dados, ult, busca]);
  const un = (f) => f.rendimento_unidade || 'un';
  const colExp = [
    { titulo: 'Código', valor: (f) => f.codigo }, { titulo: 'Receita', valor: (f) => f.nome, largura: 28 }, { titulo: 'Produto acabado', valor: (f) => f.produto_final || '' },
    { titulo: 'Rende por receita', valor: (f) => f.c.rend || '', num: true }, { titulo: 'Unid.', valor: un },
    { titulo: 'Receita · último custo', valor: (f) => Math.round(f.c.tUlt * 100) / 100, texto: (f) => moeda(f.c.tUlt), num: true },
    { titulo: 'Receita · custo médio', valor: (f) => Math.round(f.c.tMed * 100) / 100, texto: (f) => moeda(f.c.tMed), num: true },
    { titulo: 'Unidade · último custo', valor: (f) => (f.c.uUlt === null ? '' : Math.round(f.c.uUlt * 10000) / 10000), texto: (f) => m4(f.c.uUlt), num: true },
    { titulo: 'Unidade · custo médio', valor: (f) => (f.c.uMed === null ? '' : Math.round(f.c.uMed * 10000) / 10000), texto: (f) => m4(f.c.uMed), num: true },
  ];
  const abasExcel = () => [
    { nome: 'Fichas', colunas: colExp, linhas },
    { nome: 'Ingredientes', linhas: linhas.flatMap((f) => f.c.itens.map((i) => ({ f, i }))), colunas: [
      { titulo: 'Código receita', valor: (x) => x.f.codigo }, { titulo: 'Receita', valor: (x) => x.f.nome },
      { titulo: 'Ingrediente', valor: (x) => x.i.p?.descricao }, { titulo: 'Qtd por receita', valor: (x) => x.i.q }, { titulo: 'Unid.', valor: (x) => x.i.p?.unidade_estoque },
      { titulo: 'Último custo unit.', valor: (x) => (x.i.uc === null ? '' : x.i.uc) }, { titulo: 'Custo médio unit.', valor: (x) => x.i.cm },
      { titulo: 'Total · último', valor: (x) => Math.round(x.i.tUlt * 100) / 100 }, { titulo: 'Total · médio', valor: (x) => Math.round(x.i.tMed * 100) / 100 }] },
  ];
  const fichaAberta = aberta && linhas.find((f) => f.id === aberta);
  return html`
    <div class="titulo-com-acao"><span></span>
      <${Exportar} titulo="Gestão de custos - fichas" filtros=${pl(linhas.length, 'receita', 'receitas')} arquivo=${`custos-fichas-${hojeISO()}`} colunas=${colExp} linhas=${linhas} abas=${abasExcel} /></div>
    <div class="filtros"><${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Receita ou produto acabado" /></div>
    <${Tabela} linhas=${linhas} aoClicar=${(f) => setAberta(f.id)} ordemInicial=${{ chave: 'nome', dir: 1 }}
      colunas=${[
        { chave: 'nome', titulo: 'Receita / produto acabado', render: (f) => html`<b>${f.produto_final || f.nome}</b><br /><small>${f.codigo} · ${f.nome}</small>` },
        { chave: 'rend', titulo: 'Rende', num: true, valor: (f) => f.c.rend || 0, render: (f) => (f.c.rend ? `${num(f.c.rend, 0)} ${un(f)}` : html`<${Etiqueta} cor="laranja">sem rendimento</${Etiqueta}>`) },
        { chave: 'tUlt', titulo: 'Receita · último custo', num: true, valor: (f) => f.c.tUlt, render: (f) => html`${moeda(f.c.tUlt)}${f.c.semUlt ? ' *' : ''}` },
        { chave: 'tMed', titulo: 'Receita · custo médio', num: true, valor: (f) => f.c.tMed, render: (f) => moeda(f.c.tMed) },
        { chave: 'uUlt', titulo: 'Unidade · último', num: true, valor: (f) => f.c.uUlt ?? 0, render: (f) => (f.c.uUlt === null ? '–' : html`<b>${m4(f.c.uUlt)}</b>/${sing(un(f))}`) },
        { chave: 'uMed', titulo: 'Unidade · médio', num: true, valor: (f) => f.c.uMed ?? 0, render: (f) => (f.c.uMed === null ? '–' : html`<b>${m4(f.c.uMed)}</b>/${sing(un(f))}`) },
      ]} />
    <p class="nota">Clique numa receita para ver ingrediente a ingrediente. Custo da unidade = custo da receita ÷ rendimento. * algum ingrediente ainda sem compra: usado o custo médio. A ficha só tem matéria-prima: embalagem do produto acabado não entra neste custo.</p>
    ${fichaAberta && html`<${FichaCusto} f=${fichaAberta} aoFechar=${() => setAberta(null)} />`}`;
}

function FichaCusto({ f, aoFechar }) {
  const { c } = f;
  const un = f.rendimento_unidade || 'un';
  const colunas = [
    { titulo: 'Ingrediente', valor: (i) => i.p?.descricao, largura: 30 }, { titulo: 'Qtd por receita', valor: (i) => i.q, texto: (i) => `${qtd(i.q)} ${i.p?.unidade_estoque}`, num: true },
    { titulo: 'Último custo unit.', valor: (i) => i.uc ?? '', texto: (i) => (i.uc === null ? 'sem compra' : m4(i.uc)), num: true },
    { titulo: 'Custo médio unit.', valor: (i) => i.cm, texto: (i) => m4(i.cm), num: true },
    { titulo: 'Total · último', valor: (i) => Math.round(i.tUlt * 100) / 100, texto: (i) => moeda(i.tUlt), num: true },
    { titulo: 'Total · médio', valor: (i) => Math.round(i.tMed * 100) / 100, texto: (i) => moeda(i.tMed), num: true },
    { titulo: '% da receita (último)', valor: (i) => (c.tUlt ? Math.round((i.tUlt / c.tUlt) * 1000) / 10 : 0), num: true },
  ];
  return html`<${Modal} titulo=${`Custo · ${f.codigo} · ${f.nome}`} aoFechar=${aoFechar} largo
    rodape=${html`<${Exportar} titulo=${`Custo da receita ${f.codigo} - ${f.nome}`} filtros=${f.produto_final || ''} arquivo=${`custo-${f.codigo}-${hojeISO()}`}
      colunas=${colunas} linhas=${c.itens} totais=${['TOTAL DA RECEITA', '', '', '', moeda(c.tUlt), moeda(c.tMed), '100']} sem=${['whatsapp']} />
      <span class="espaco"></span><button class="btn btn-sec" onClick=${aoFechar}>Fechar</button>`}>
    <p>Produto acabado: <b>${f.produto_final || f.nome}</b> · rende <b>${c.rend ? `${num(c.rend, 0)} ${un}` : 'não informado'}</b> por receita</p>
    <${Tabela} linhas=${c.itens} ordemInicial=${{ chave: 'tUlt', dir: -1 }}
      colunas=${[
        { chave: 'ing', titulo: 'Ingrediente', valor: (i) => i.p?.descricao, render: (i) => html`<b>${i.p?.descricao}</b><br /><small>${i.p?.codigo}</small>` },
        { chave: 'q', titulo: 'Por receita', num: true, render: (i) => `${qtd(i.q)} ${i.p?.unidade_estoque}` },
        { chave: 'uc', titulo: 'Último custo', num: true, valor: (i) => i.uc ?? -1, render: (i) => (i.uc === null ? html`<${Etiqueta} cor="laranja">sem compra</${Etiqueta}>` : `${m4(i.uc)}/${i.p?.unidade_estoque}`) },
        { chave: 'cm', titulo: 'Custo médio', num: true, render: (i) => `${m4(i.cm)}/${i.p?.unidade_estoque}` },
        { chave: 'tUlt', titulo: 'Total · último', num: true, render: (i) => moeda(i.tUlt) },
        { chave: 'tMed', titulo: 'Total · médio', num: true, render: (i) => moeda(i.tMed) },
        { chave: 'part', titulo: '% receita', num: true, valor: (i) => (c.tUlt ? i.tUlt / c.tUlt : 0), render: (i) => `${num(c.tUlt ? (i.tUlt / c.tUlt) * 100 : 0, 1)}%` },
      ]}
      rodape=${html`<tr><td colspan="4"><b>Custo de 1 receita (batelada)</b></td><td class="n"><b>${moeda(c.tUlt)}</b></td><td class="n"><b>${moeda(c.tMed)}</b></td><td></td></tr>`} />
    <div class="cartoes">
      <${Cartao} titulo="Receita · último custo" valor=${moeda(c.tUlt)} />
      <${Cartao} titulo="Receita · custo médio" valor=${moeda(c.tMed)} />
      <${Cartao} titulo=${`1 ${sing(un)} · último custo`} valor=${c.uUlt === null ? '–' : m4(c.uUlt)} sub=${c.rend ? `${moeda(c.tUlt)} ÷ ${num(c.rend, 0)}` : 'informe o rendimento'} />
      <${Cartao} titulo=${`1 ${sing(un)} · custo médio`} valor=${c.uMed === null ? '–' : m4(c.uMed)} sub=${c.rend ? `${moeda(c.tMed)} ÷ ${num(c.rend, 0)}` : 'informe o rendimento'} />
    </div>
    ${c.semUlt && html`<p class="nota">* Ingrediente sem compra registrada: no "último custo" foi usado o custo médio.</p>`}
  </${Modal}>`;
}
