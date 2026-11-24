// =====================================================================
// ESTOQUE POR LOCAL — consulta por unidade e local, em 4 formatos:
// resumo da empresa · mapa (unidades/locais nas colunas) · detalhado ·
// transferências em aberto. Trânsito: na visão da empresa é positivo e
// somado; numa unidade/local, soma no destino ("chegando") e na origem
// aparece só como aviso ("saindo").
// =====================================================================
import { html, useState, useMemo, useApp, Cabecalho, Abas, Busca, Tabela, Etiqueta, Vazio, Filtros } from '../ui.js';
import { MP_EMB, casaCategoria, num, qu, moeda, contem, TIPOS_PRODUTO, tipoProduto, operaLocal, ehGestao, dataHora, pl, SITUACAO_TRANSF } from '../util.js';
import { Exportar } from '../exportar.js';
import { nomeLocal, minutos, tempoTexto } from '../producao-util.js';

const VISOES = [
  { id: 'resumo', titulo: 'Resumo da empresa' }, { id: 'mapa', titulo: 'Mapa por unidade / local' },
  { id: 'detalhe', titulo: 'Detalhado por produto e local' }, { id: 'transito', titulo: 'Transferências em aberto' },
];

export function TelaEstoqueLocal() {
  const { dados, papeis, podeFazer, estadoRota } = useApp();
  const gestao = ehGestao(papeis);
  const verCusto = podeFazer('custos');
  const [visao, setVisao] = useState(estadoRota?.visao || 'resumo');
  const [unid, setUnid] = useState('');
  const [loc, setLoc] = useState('');
  const [tipo, setTipo] = useState(MP_EMB);
  const [busca, setBusca] = useState('');
  const [soSaldo, setSoSaldo] = useState(true);
  const [soMov, setSoMov] = useState(false);
  const multi = dados.unidades.filter((u) => u.ativa).length > 1;

  // locais que a pessoa pode ver (gestão vê todos; operador vê os seus)
  const permitidos = dados.locais.filter((l) => l.ativo && (gestao || operaLocal(papeis, l)));
  const escopo = permitidos.filter((l) => (!unid || String(l.unidade_id) === unid) && (!loc || String(l.id) === loc));
  const ids = new Set(escopo.map((l) => l.id));
  const tudo = !unid && !loc && gestao;

  const calc = useMemo(() => {
    const porProd = new Map();
    const pega = (pid) => { if (!porProd.has(pid)) porProd.set(pid, { porLocal: new Map(), transito: 0, chegando: 0, saindo: 0, q2: 0 }); return porProd.get(pid); };
    dados.estoqueLocal.forEach((e) => {
      if (!ids.has(e.local_id)) return;
      const c = pega(e.produto_id);
      c.porLocal.set(e.local_id, { disp: Number(e.disponivel), sep: Number(e.separado), q2: Number(e.qtd2_disponivel) + Number(e.qtd2_separado), chegando: 0, saindo: 0 });
    });
    const enviadas = dados.transferencias.filter((t) => t.situacao === 'enviada');
    dados.transfItens.forEach((i) => {
      const t = enviadas.find((x) => x.id === i.transferencia_id); if (!t) return;
      const q = Number(i.quantidade); const o = ids.has(t.origem_id); const d = ids.has(t.destino_id);
      if (!o && !d) return;
      const c = pega(i.produto_id);
      const lc = (lid) => { if (!c.porLocal.has(lid)) c.porLocal.set(lid, { disp: 0, sep: 0, q2: 0, chegando: 0, saindo: 0 }); return c.porLocal.get(lid); };
      if (o && d) { c.transito += q; lc(t.origem_id).saindo += q; lc(t.destino_id).chegando += q; }
      else if (d) { c.chegando += q; lc(t.destino_id).chegando += q; }
      else { c.saindo += q; lc(t.origem_id).saindo += q; }
    });
    return porProd;
  }, [dados.carregadoEm, unid, loc, papeis]);

  const produtos = dados.produtos.filter((p) => p.controla_estoque && casaCategoria(tipo, tipoProduto(p))
    && contem(`${p.codigo} ${p.descricao} ${p.grupo || ''} ${p.marca || ''}`, busca));
  const linhas = produtos.map((p) => {
    const c = calc.get(p.id) || { porLocal: new Map(), transito: 0, chegando: 0, saindo: 0 };
    let disp = 0, sep = 0, q2 = 0; c.porLocal.forEach((v) => { disp += v.disp; sep += v.sep; q2 += v.q2; });
    const total = disp + sep + c.transito + c.chegando;
    return { id: p.id, p, c, disp, sep, transito: c.transito, chegando: c.chegando, saindo: c.saindo, total, q2, valor: total * Number(p.custo_medio || 0) };
  }).filter((l) => (!soSaldo || Math.abs(l.total) > 0.0001 || l.saindo > 0) && (!soMov || l.sep > 0 || l.transito > 0 || l.chegando > 0 || l.saindo > 0));

  const nFiltros = [unid, loc, tipo, !soSaldo, soMov].filter(Boolean).length;
  const filtros = html`<${Filtros} ativos=${nFiltros} fixo=${html`<div class="busca"><${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Buscar produto, grupo, marca" /></div>`}>
    ${multi && html`<select class="entrada" value=${unid} onChange=${(e) => { setUnid(e.target.value); setLoc(''); }}><option value="">Todas as unidades</option>
      ${dados.unidades.filter((u) => u.ativa).map((u) => html`<option value=${String(u.id)}>${u.nome}</option>`)}</select>`}
    <select class="entrada" value=${loc} onChange=${(e) => setLoc(e.target.value)}><option value="">${gestao ? 'Todos os locais' : 'Todos os meus locais'}</option>
      ${permitidos.filter((l) => !unid || String(l.unidade_id) === unid).map((l) => html`<option value=${String(l.id)}>${nomeLocal(dados, l.id)}</option>`)}</select>
    <select class="entrada" value=${tipo} onChange=${(e) => setTipo(e.target.value)}><option value="">Todos os tipos</option><option value=${MP_EMB}>Matéria-prima e embalagem</option>
      ${Object.entries(TIPOS_PRODUTO).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select>
    <label class="check"><input type="checkbox" checked=${soSaldo} onChange=${(e) => setSoSaldo(e.target.checked)} /> só com saldo</label>
    <label class="check"><input type="checkbox" checked=${soMov} onChange=${(e) => setSoMov(e.target.checked)} /> só com separado ou trânsito</label>
  </${Filtros}>`;
  const rotuloEscopo = tudo ? 'Empresa toda' : [unid && dados.mapa.unidade.get(Number(unid))?.nome, loc ? nomeLocal(dados, Number(loc)) : (gestao ? 'todos os locais' : 'meus locais')].filter(Boolean).join(' · ');
  const un = (l, v) => qu(v, l.p.unidade_estoque);

  return html`
    <${Cabecalho} titulo="Estoque por local" sub=${`${rotuloEscopo} · disponível + separado + o que está chegando. O que está saindo aparece só como aviso.`} />
    <${Abas} abas=${VISOES} ativa=${visao} aoMudar=${setVisao} />
    ${visao !== 'transito' && filtros}
    ${visao === 'resumo' && html`<${Resumo} linhas=${linhas} tudo=${tudo} verCusto=${verCusto} un=${un} rotulo=${rotuloEscopo} />`}
    ${visao === 'mapa' && html`<${Mapa} linhas=${linhas} escopo=${escopo} unid=${unid} multi=${multi} tudo=${tudo} un=${un} rotulo=${rotuloEscopo} />`}
    ${visao === 'detalhe' && html`<${Detalhado} linhas=${linhas} un=${un} rotulo=${rotuloEscopo} verCusto=${verCusto} />`}
    ${visao === 'transito' && html`<${Abertas} ids=${new Set(permitidos.map((l) => l.id))} gestao=${gestao} />`}`;
}

function Resumo({ linhas, tudo, verCusto, un, rotulo }) {
  const segunda = (l) => (l.p.unidade2 && l.q2 > 0 ? html`<small> · ${num(l.q2, 0)} ${l.p.unidade2}${l.q2 === 1 ? '' : 's'}</small>` : '');
  const cols = [
    { chave: 'cod', titulo: 'Código', valor: (l) => l.p.codigo, render: (l) => l.p.codigo }, { chave: 'p', titulo: 'Produto', valor: (l) => l.p.descricao, render: (l) => html`<b>${l.p.descricao}</b>`, classe: 'col-desc' }, { chave: 'marca', titulo: 'Marca', valor: (l) => l.p.marca || '', render: (l) => l.p.marca || '–' },
    { chave: 'tipo', titulo: 'Tipo', valor: (l) => TIPOS_PRODUTO[tipoProduto(l.p)], render: (l) => html`<small>${TIPOS_PRODUTO[tipoProduto(l.p)]}</small>` },
    { chave: 'disp', titulo: 'Disponível', num: true, render: (l) => html`${un(l, l.disp)}${segunda(l)}` },
    { chave: 'sep', titulo: 'Separado', num: true, render: (l) => (l.sep ? un(l, l.sep) : '–') },
    { chave: 'transito', titulo: tudo ? 'Em trânsito' : 'Chegando (+)', num: true, valor: (l) => l.transito + l.chegando, render: (l) => (l.transito + l.chegando ? html`<span class="texto-azul">+${un(l, l.transito + l.chegando)}</span>` : '–') },
    ...(!tudo ? [{ chave: 'saindo', titulo: 'Saindo (aviso)', num: true, render: (l) => (l.saindo ? html`<span class="texto-cinza">−${un(l, l.saindo)}</span>` : '–') }] : []),
    { chave: 'total', titulo: 'Total', num: true, render: (l) => html`<b>${un(l, l.total)}</b>` },
    ...(verCusto ? [{ chave: 'valor', titulo: 'Valor (custo médio)', num: true, render: (l) => moeda(l.valor) }] : []),
  ];
  const exp = [{ titulo: 'Código', valor: (l) => l.p.codigo }, { titulo: 'Produto', valor: (l) => l.p.descricao, largura: 34 }, { titulo: 'Unid.', valor: (l) => l.p.unidade_estoque },
    { titulo: 'Disponível', valor: (l) => l.disp, num: true }, { titulo: 'Separado', valor: (l) => l.sep, num: true },
    { titulo: tudo ? 'Em trânsito' : 'Chegando', valor: (l) => l.transito + l.chegando, num: true }, ...(!tudo ? [{ titulo: 'Saindo (aviso)', valor: (l) => l.saindo, num: true }] : []),
    { titulo: 'Total', valor: (l) => l.total, num: true }, ...(verCusto ? [{ titulo: 'Valor', valor: (l) => Math.round(l.valor * 100) / 100, num: true }] : [])];
  const valor = linhas.reduce((s, l) => s + l.valor, 0);
  return html`<div class="titulo-com-acao"><span class="nota">${pl(linhas.length, 'produto', 'produtos')}${verCusto ? ` · valor total ${moeda(valor)}` : ''}</span>
    <${Exportar} tabela="estoque-local.resumo" titulo="Estoque por local · resumo" filtros=${rotulo} arquivo="estoque-resumo" colunas=${exp} linhas=${linhas} /></div>
    <${Tabela} id="estoque-local.resumo" linhas=${linhas} colunas=${cols} vazio="Nenhum produto com estes filtros." ordemInicial=${{ chave: 'p', dir: 1 }} />`;
}

function Mapa({ linhas, escopo, unid, multi, tudo, un, rotulo }) {
  const { dados } = useApp();
  // colunas: unidades (quando "todas" e há mais de uma) ou os locais
  const porUnidade = multi && !unid;
  const colunas = porUnidade ? dados.unidades.filter((u) => u.ativa && escopo.some((l) => l.unidade_id === u.id)).map((u) => ({ id: u.id, nome: u.nome, locais: escopo.filter((l) => l.unidade_id === u.id).map((l) => l.id) }))
    : escopo.map((l) => ({ id: l.id, nome: l.nome, locais: [l.id] }));
  const cel = (l, c) => c.locais.reduce((s, lid) => { const v = l.c.porLocal.get(lid); return s + (v ? v.disp + v.sep + (porUnidade ? 0 : v.chegando - (tudo ? v.chegando : 0)) : 0); }, 0);
  const cols = [
    { chave: 'p', titulo: 'Produto', valor: (l) => l.p.descricao, render: (l) => html`<b>${l.p.descricao}</b>`, classe: 'col-desc' }, { chave: 'un', titulo: 'Unid.', render: (l) => html`${l.p.unidade_estoque}` },
    ...colunas.map((c) => ({ chave: 'c' + c.id, titulo: c.nome, num: true, valor: (l) => cel(l, c), render: (l) => { const v = cel(l, c); return v ? num(v, 3) : html`<span class="texto-cinza">–</span>`; } })),
    { chave: 'tr', titulo: tudo ? 'Em trânsito' : 'Chegando', num: true, valor: (l) => l.transito + l.chegando, render: (l) => (l.transito + l.chegando ? html`<span class="texto-azul">+${num(l.transito + l.chegando, 3)}</span>` : '–') },
    { chave: 'total', titulo: 'Total', num: true, render: (l) => html`<b>${num(l.total, 3)}</b>` },
  ];
  const exp = [{ titulo: 'Produto', valor: (l) => l.p.descricao, largura: 34 }, { titulo: 'Unid.', valor: (l) => l.p.unidade_estoque },
    ...colunas.map((c) => ({ titulo: c.nome, valor: (l) => cel(l, c), num: true })), { titulo: tudo ? 'Em trânsito' : 'Chegando', valor: (l) => l.transito + l.chegando, num: true },
    { titulo: 'Total', valor: (l) => l.total, num: true }];
  return html`<div class="titulo-com-acao"><span class="nota">Cada coluna = disponível + separado ${porUnidade ? 'da unidade' : 'do local'}. Toque no produto no formato "Detalhado" para ver cada local.</span>
    <${Exportar} tabela="estoque-local.mapa" titulo="Estoque por local · mapa" filtros=${rotulo} arquivo="estoque-mapa" colunas=${exp} linhas=${linhas} /></div>
    <${Tabela} id="estoque-local.mapa" linhas=${linhas} colunas=${cols} vazio="Nenhum produto com estes filtros." ordemInicial=${{ chave: 'p', dir: 1 }} />`;
}

function Detalhado({ linhas, un, rotulo, verCusto }) {
  const { dados } = useApp();
  const linhasExp = linhas.flatMap((l) => [...l.c.porLocal.entries()].map(([lid, v]) => ({ l, lid, v })));
  return html`<div class="titulo-com-acao"><span class="nota">Por local: disponível + separado + chegando. "Saindo" é só aviso (já saiu do local).</span>
    <${Exportar} titulo="Estoque por local · detalhado" filtros=${rotulo} arquivo="estoque-detalhado" linhas=${linhasExp} colunas=${[
      { titulo: 'Produto', valor: (x) => x.l.p.descricao, largura: 32 }, { titulo: 'Local', valor: (x) => nomeLocal(dados, x.lid), largura: 22 }, { titulo: 'Unid.', valor: (x) => x.l.p.unidade_estoque },
      { titulo: 'Disponível', valor: (x) => x.v.disp, num: true }, { titulo: 'Separado', valor: (x) => x.v.sep, num: true },
      { titulo: 'Saindo', valor: (x) => x.v.saindo, num: true }, { titulo: 'Chegando', valor: (x) => x.v.chegando, num: true },
      { titulo: 'Total do local', valor: (x) => x.v.disp + x.v.sep + x.v.chegando, num: true }]} /></div>
    ${!linhas.length ? html`<${Vazio} texto="Nenhum produto com estes filtros." />` : html`<div class="tabela-rolagem"><table class="tabela tabela-det">
      <thead><tr><th>Produto / local</th><th class="n">Disponível</th><th class="n">Separado</th><th class="n">Saindo (aviso)</th><th class="n">Chegando (+)</th><th class="n">Total</th>${verCusto && html`<th class="n">Valor</th>`}</tr></thead>
      <tbody>${linhas.map((l) => html`
        <tr class="det-prod"><td><b>${l.p.descricao}</b> <small>${l.p.codigo}</small></td><td class="n"><b>${un(l, l.disp)}</b></td><td class="n">${l.sep ? un(l, l.sep) : '–'}</td>
          <td class="n">${l.saindo ? `−${un(l, l.saindo)}` : '–'}</td><td class="n">${l.transito + l.chegando ? `+${un(l, l.transito + l.chegando)}` : '–'}</td><td class="n"><b>${un(l, l.total)}</b></td>
          ${verCusto && html`<td class="n">${moeda(l.valor)}</td>`}</tr>
        ${[...l.c.porLocal.entries()].sort((a, b) => (dados.mapa.local.get(a[0])?.ordem || 0) - (dados.mapa.local.get(b[0])?.ordem || 0)).map(([lid, v]) => html`<tr class="det-local">
          <td data-rotulo="Local">↳ ${nomeLocal(dados, lid)}</td><td class="n" data-rotulo="Disponível">${un(l, v.disp)}${l.p.unidade2 && v.q2 ? html` <small>(${num(v.q2, 0)} ${l.p.unidade2})</small>` : ''}</td>
          <td class="n" data-rotulo="Separado">${v.sep ? un(l, v.sep) : '–'}</td><td class="n texto-cinza" data-rotulo="Saindo">${v.saindo ? `−${un(l, v.saindo)}` : '–'}</td>
          <td class="n texto-azul" data-rotulo="Chegando">${v.chegando ? `+${un(l, v.chegando)}` : '–'}</td><td class="n" data-rotulo="Total">${un(l, v.disp + v.sep + v.chegando)}</td>
          ${verCusto && html`<td class="n"></td>`}</tr>`)}`)}</tbody></table></div>`}`;
}

function Abertas({ ids, gestao }) {
  const { dados, ir } = useApp();
  const lista = dados.transferencias.filter((t) => gestao || ids.has(t.origem_id) || ids.has(t.destino_id))
    .map((t) => ({ ...t, itens: dados.transfItens.filter((i) => i.transferencia_id === t.id) }));
  return html`<${Tabela} id="estoque-local.abertas" linhas=${lista} aoClicar=${(t) => ir('transferencias', { abrir: { id: t.id } })} vazio="Nenhuma transferência em aberto (separada ou em trânsito)."
    ordemInicial=${{ chave: 'id', dir: -1 }} colunas=${[
      { chave: 'id', titulo: 'Nº', num: true },
      { chave: 'sit', titulo: 'Situação', valor: (t) => t.situacao, render: (t) => html`<${Etiqueta} cor=${t.situacao === 'enviada' ? 'azul' : 'laranja'}>${SITUACAO_TRANSF[t.situacao]}</${Etiqueta}>` },
      { chave: 'rota', titulo: 'Origem → destino', valor: (t) => nomeLocal(dados, t.origem_id), render: (t) => html`${nomeLocal(dados, t.origem_id)} → <b>${nomeLocal(dados, t.destino_id)}</b>` },
      { chave: 'itens', titulo: 'Itens', render: (t) => html`<small>${t.itens.map((i) => `${num(i.quantidade, 3)} ${dados.mapa.produto.get(i.produto_id)?.unidade_estoque} ${dados.mapa.produto.get(i.produto_id)?.descricao}`).join(' · ')}</small>` },
      { chave: 'desde', titulo: 'Há quanto tempo', valor: (t) => t.enviado_em || t.separado_em, render: (t) => tempoTexto(minutos(t.enviado_em || t.separado_em)) },
      { chave: 'quem', titulo: 'Quem', render: (t) => html`<small>${dados.mapa.perfil.get(t.enviado_por || t.separado_por)?.nome || ''}</small>` },
    ]} />`;
}
