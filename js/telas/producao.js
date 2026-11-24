// =====================================================================
// Produção: PROGRAMAÇÃO (engenharia programa, pesagem dá baixa)
//           e SAÍDAS DA PRODUÇÃO (o que a pesagem tirou do estoque)
// =====================================================================
import { html, useState, useMemo, useEffect, useApp, Campo, Numero, Escolher, QtdUnidade, Etiqueta, Cabecalho, Abas, Vazio, Tabela, Cartao,
  Carregando, Modal, useAcao, confirmar, avisar, n, useHistorico, useFiltroMudou } from '../ui.js';
import { qtd, num, moeda, data, dataHora, hojeISO, somarDias, fator, qu, pl, nomeUsuario, mensagemErro, contem, diaLocal } from '../util.js';
import { Exportar } from '../exportar.js';
import { UltimaAlteracao, HistoricoAuditoria } from '../historico.js';
import { Icone } from '../icones.js';
import { ResumoPrevisao } from './previsao.js';
import { useFluxo, ETAPAS, localTipo, saldoLocal, useEventos, LinhaTempo } from '../producao-util.js';
import { QuadroMaceiras } from './quadro-maceiras.js';
import { OrdemPesagem, AvisoPesagem } from './ordem-pesagem.js';

const inicioDia = (iso) => new Date(iso + 'T00:00:00').toISOString();
const virg = (v) => String(Math.round(Number(v) * 10000) / 10000).replace('.', ',');
const rec = (v) => qu(v, 'receita');                        // "1 receita", "2 receitas", "0,5 receita"
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const diaSemana = (iso) => DIAS_SEMANA[new Date(iso + 'T12:00:00').getDay()];
const rotuloDia = (iso) => {
  const h = hojeISO();
  const extra = iso === h ? 'hoje' : iso === somarDias(h, 1) ? 'amanhã' : iso === somarDias(h, -1) ? 'ontem' : diaSemana(iso);
  return `${data(iso)} (${extra})`;
};

// Situação de uma linha da programação
function situacao(pg, feito) {
  if (pg.situacao === 'cancelada') return { id: 'cancelada', rotulo: 'Cancelada', cor: 'cinza' };
  const q = Number(pg.quantidade);
  if (pg.finalizada_em) return feito >= q - 0.0005 ? { id: 'finalizada', rotulo: feito > q + 0.0005 ? 'Finalizada (a mais)' : 'Finalizada', cor: 'verde' }
    : { id: 'finalizada', rotulo: `Finalizada (${num(feito, 3)} de ${num(q, 3)})`, cor: 'azul' };
  if (pg.data < hojeISO()) return { id: 'aguardando', rotulo: feito > 0 ? 'Aguardando finalização' : 'Não iniciada', cor: 'vermelho' };
  if (feito > 0) return { id: 'producao', rotulo: feito >= q - 0.0005 ? 'Pesada · em produção' : 'Em produção', cor: 'laranja' };
  return { id: 'pendente', rotulo: 'A fazer', cor: 'cinza' };
}
// Tabela/Exportar que escondem as colunas de custo de quem não pode ver custo
const ehCusto = (c) => /^Custo/.test(c.titulo || '');
const tirarCusto = (cols) => cols.filter((c) => !ehCusto(c));
function TabelaC({ verCusto, ...p }) { return html`<${Tabela} ...${p} colunas=${verCusto ? p.colunas : tirarCusto(p.colunas)} />`; }
function ExportarC({ verCusto, ...p }) {
  if (verCusto) return html`<${Exportar} ...${p} />`;
  const totais = p.totais ? p.totais.filter((_, i) => !(p.colunas[i] && ehCusto(p.colunas[i]))) : p.totais;
  const abas = p.abas ? () => p.abas().map((a) => ({ ...a, colunas: tirarCusto(a.colunas) })) : undefined;
  return html`<${Exportar} ...${p} colunas=${tirarCusto(p.colunas)} totais=${totais} abas=${abas} />`;
}
const aberta = (pg) => pg.situacao === 'ativa' && !pg.finalizada_em;

// Ingredientes POR 1 RECEITA de uma programação (a alteração programada ou a ficha)
function ingredientes(pg, dados) {
  const mp = dados.mapa.produto;
  if (pg.itens_alterados) return pg.itens_alterados.map((i) => ({ produto_id: i.produto_id, base: Number(i.quantidade) * fator(mp.get(i.produto_id), i.unidade) }));
  return dados.fichaItens.filter((i) => i.ficha_id === pg.ficha_id).map((i) => ({ produto_id: i.produto_id, base: Number(i.quantidade) }));
}
function textoAlteracao(pg, dados) {
  if (!pg.itens_alterados) return '';
  const mp = dados.mapa.produto;
  const orig = new Map(dados.fichaItens.filter((i) => i.ficha_id === pg.ficha_id && mp.get(i.produto_id)?.categoria === 'materia_prima').map((i) => [i.produto_id, Number(i.quantidade)]));
  const novo = new Map(); ingredientes(pg, dados).forEach((e) => novo.set(e.produto_id, (novo.get(e.produto_id) || 0) + e.base));
  const out = [];
  for (const [id, q] of orig) { const p = mp.get(id); if (!novo.has(id)) out.push(`retirou ${p?.descricao}`); else if (Math.abs(novo.get(id) - q) > 0.00005) out.push(`${p?.descricao}: ${qtd(q)} → ${qu(novo.get(id), p?.unidade_estoque)}`); }
  for (const [id, q] of novo) if (!orig.has(id)) out.push(`incluiu ${mp.get(id)?.descricao} (${qu(q, mp.get(id)?.unidade_estoque)})`);
  return out.join('; ');
}

// Produções (baixas) ligadas às programações + as do período (para "fora da programação")
export function useProducoes(de, ate, progIds) {
  const { api, dados } = useApp();
  const [lista, setLista] = useState(null);
  const chave = (progIds || []).join(',');
  const mudou = useFiltroMudou([de, ate]);   // programação nova de outra pessoa não pode apagar a tela
  useEffect(() => {
    let vivo = true;
    if (mudou()) setLista(null);
    Promise.all([
      api.listar('producoes', { desde: inicioDia(de), ate: inicioDia(somarDias(ate, 1)) }),
      progIds && progIds.length ? api.listar('producoes', { em: { programacao_id: progIds } }) : Promise.resolve([]),
    ]).then(([a, b]) => { if (!vivo) return; const m = new Map(); [...a, ...b].forEach((x) => m.set(x.id, x)); setLista([...m.values()]); })
      .catch((e) => { avisar(mensagemErro(e), 'erro'); if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, [de, ate, chave, dados.carregadoEm]);
  return lista;
}
const somaFeito = (prods) => { const m = new Map(); (prods || []).forEach((p) => { if (p.programacao_id) m.set(p.programacao_id, (m.get(p.programacao_id) || 0) + Number(p.multiplicador)); }); return m; };

// =====================================================================
// PROGRAMAÇÃO DE PRODUÇÃO
// =====================================================================
export function TelaProgramacao() {
  const { dados, podeFazer, estadoRota, setEstadoRota } = useApp();
  const [aba, setAba] = useState('dia');
  const [dia, setDia] = useState(estadoRota?.dia || hojeISO());
  useEffect(() => { if (estadoRota) setEstadoRota(null); }, []);
  const engenharia = podeFazer('programacao');
  const pesagem = podeFazer('saida_receita');
  return html`
    <${Cabecalho} titulo="Programação e pesagem"
      sub=${engenharia ? 'Programe as receitas do dia, a masseira e a ordem. A pesagem pesa os pós e manda a base para as masseiras.' : 'O que o PCP programou. Pese os pós de cada receita e envie a base para as masseiras.'} />
    <${AvisoPesagem} />
    <${Abas} abas=${[{ id: 'dia', titulo: 'Programação do dia' }, ...(engenharia ? [{ id: 'quadro', titulo: 'Quadro das masseiras' }] : []), { id: 'periodo', titulo: 'Programado × produzido (período)' }]} ativa=${aba} aoMudar=${setAba} />
    ${aba === 'quadro' ? html`<${QuadroMaceiras} dia=${dia} setDia=${setDia} SeletorDia=${SeletorDia} />` : aba === 'dia' ? html`<${ProgramacaoDia} dia=${dia} setDia=${setDia} engenharia=${engenharia} pesagem=${pesagem} />
      ${podeFazer('previsao_producao') && html`<${ResumoPrevisao} dia=${dia} />`}`
      : html`<${ProgramacaoPeriodo} aoAbrirDia=${(d) => { setDia(d); setAba('dia'); }} />`}`;
}

function SeletorDia({ dia, setDia }) {
  const h = hojeISO();
  return html`<div class="seletor-dia">
    <button class="btn btn-sec btn-peq" title="Dia anterior" onClick=${() => setDia(somarDias(dia, -1))}>‹</button>
    <input class="entrada" type="date" value=${dia} onChange=${(e) => e.target.value && setDia(e.target.value)} />
    <button class="btn btn-sec btn-peq" title="Próximo dia" onClick=${() => setDia(somarDias(dia, 1))}>›</button>
    <span class="chips">
      <button class=${'chip' + (dia === somarDias(h, -1) ? ' ativo' : '')} aria-pressed=${!!(dia === somarDias(h, -1))} onClick=${() => setDia(somarDias(h, -1))}>Ontem</button>
      <button class=${'chip' + (dia === h ? ' ativo' : '')} aria-pressed=${!!(dia === h)} onClick=${() => setDia(h)}>Hoje</button>
      <button class=${'chip' + (dia === somarDias(h, 1) ? ' ativo' : '')} aria-pressed=${!!(dia === somarDias(h, 1))} onClick=${() => setDia(somarDias(h, 1))}>Amanhã</button>
    </span>
    <b class="dia-rotulo">${rotuloDia(dia)}</b>
  </div>`;
}

function ProgramacaoDia({ dia, setDia, engenharia, pesagem }) {
  const { dados } = useApp();
  const progs = dados.programacoes.filter((p) => p.data === dia);
  const prods = useProducoes(dia, dia, progs.map((p) => p.id));
  const fluxo = useFluxo(dia);
  const fx = new Map((fluxo?.fluxo || []).map((x) => [x.programacao_id, x]));
  const eventos = useEventos(progs.map((p) => p.id));
  const [editar, setEditar] = useState(null);      // {} = nova; pg = editar
  const [baixa, setBaixa] = useState(null);
  const [abertaDet, setAberta] = useState(null);
  const [finalizar, setFinalizar] = useState(null);
  const [verCanceladas, setVerCanceladas] = useState(false);
  if (!prods) return html`<${SeletorDia} dia=${dia} setDia=${setDia} /><${Carregando} />`;

  const feitoMap = somaFeito(prods);
  const feito = (pg) => feitoMap.get(pg.id) || 0;
  const ficha = (id) => dados.mapa.ficha.get(id);
  const perfil = (id) => dados.mapa.perfil.get(id);
  const ativas = progs.filter((p) => p.situacao === 'ativa');
  const visiveis = (verCanceladas ? progs : ativas).map((p) => ({ ...p, feito: feito(p), sit: situacao(p, feito(p)) }));
  const tProg = ativas.reduce((s, p) => s + Number(p.quantidade), 0);
  const tFeito = ativas.reduce((s, p) => s + Math.min(feito(p), Number(p.quantidade)), 0);
  const fora = prods.filter((p) => !p.programacao_id && diaLocal(p.data_hora) === dia);
  const atraso = engenharia ? dados.programacoes.filter((p) => aberta(p) && p.data < hojeISO()) : [];
  const pend = (p) => Math.max(Number(p.quantidade) - p.feito, 0);

  const colExp = [
    { titulo: 'Dia', valor: (p) => data(p.data) }, { titulo: 'Código', valor: (p) => ficha(p.ficha_id)?.codigo },
    { titulo: 'Receita', valor: (p) => ficha(p.ficha_id)?.nome, largura: 30 },
    { titulo: 'Programado', valor: (p) => Number(p.quantidade), num: true }, { titulo: 'Produzido', valor: (p) => p.feito, num: true },
    { titulo: 'Pendente', valor: (p) => pend(p), num: true }, { titulo: 'Situação', valor: (p) => p.sit.rotulo },
    { titulo: 'Alteração da receita', valor: (p) => textoAlteracao(p, dados), largura: 45 }, { titulo: 'Observação', valor: (p) => p.observacao, largura: 35 },
    { titulo: 'Programado por', valor: (p) => nomeUsuario(perfil(p.criado_por)) },
  ];
  // Excel com a lista e os ingredientes a pesar (pendentes)
  const abasExcel = () => [
    { nome: 'Programação', colunas: colExp, linhas: visiveis },
    { nome: 'Ingredientes a pesar', linhas: visiveis.filter((p) => p.situacao === 'ativa').flatMap((p) => ingredientes(p, dados).map((i) => ({ p, i, pr: dados.mapa.produto.get(i.produto_id) }))),
      colunas: [{ titulo: 'Receita', valor: (x) => ficha(x.p.ficha_id)?.nome }, { titulo: 'Ingrediente', valor: (x) => x.pr?.descricao },
        { titulo: 'Por receita', valor: (x) => Math.round(x.i.base * 10000) / 10000 }, { titulo: 'Pendente (receitas)', valor: (x) => pend(x.p) },
        { titulo: 'Total pendente', valor: (x) => Math.round(x.i.base * pend(x.p) * 10000) / 10000 }, { titulo: 'Unid.', valor: (x) => x.pr?.unidade_estoque }] },
  ];

  return html`
    <${SeletorDia} dia=${dia} setDia=${setDia} />
    ${atraso.length > 0 && html`<${AvisoFinalizar} progs=${atraso} aoAbrir=${setDia} />`}
    <div class="cartoes">
      <${Cartao} titulo="Programado" valor=${rec(tProg)} sub=${pl(ativas.length, 'linha', 'linhas')} />
      <${Cartao} titulo="Pesado" valor=${rec(tFeito)} sub=${tProg ? `${num((tFeito / tProg) * 100, 0)}% do programado` : '–'} cor=${tProg && tFeito >= tProg ? '' : ''} />
      <${Cartao} titulo="Pendente" valor=${rec(Math.max(tProg - tFeito, 0))} cor=${tProg - tFeito > 0 && dia < hojeISO() ? 'c-vermelho' : tProg - tFeito > 0 ? 'c-laranja' : ''} />
      <${Cartao} titulo="Fora da programação" valor=${rec(fora.reduce((s, p) => s + Number(p.multiplicador), 0))} sub=${pl(fora.length, 'lançamento', 'lançamentos')} />
    </div>
    ${pesagem && html`<${EnviarMisturas} fluxo=${fluxo?.fluxo || []} />`}
    ${(pesagem || engenharia) && html`<${OrdemPesagem} dia=${dia} feito=${feito} engenharia=${engenharia} pesagem=${pesagem} aoPesar=${setBaixa} />`}
    ${engenharia && html`<${ProgramarRapido} dia=${dia} aoAlterar=${(f) => setEditar({ data: dia, ficha_id: f || null, alterar: true })} />`}
    <div class="titulo-com-acao">
      <h3>Receitas programadas</h3>
      <div class="exportar">
        <label class="check"><input type="checkbox" checked=${verCanceladas} onChange=${(e) => setVerCanceladas(e.target.checked)} /> mostrar canceladas</label>
        <${Exportar} tabela="producao.programacaodia" titulo="Programação de produção" filtros=${rotuloDia(dia)} arquivo=${`programacao-${dia}`} colunas=${colExp} linhas=${visiveis} abas=${abasExcel} />
      </div>
    </div>
    <${Tabela} id="producao.programacaodia" linhas=${visiveis} aoClicar=${setAberta} vazio=${engenharia ? 'Nada programado para este dia. Use o campo acima para programar.' : 'Nada programado para este dia.'}
      classeLinha=${(p) => (p.situacao === 'cancelada' ? 'linha-apagada' : '')}
      colunas=${[
        { chave: 'r', titulo: 'Receita', valor: (p) => ficha(p.ficha_id)?.nome, render: (p) => html`<b>${ficha(p.ficha_id)?.codigo} · ${ficha(p.ficha_id)?.nome}</b>
          ${p.itens_alterados && html` <${Etiqueta} cor="laranja" titulo=${textoAlteracao(p, dados)}>receita alterada</${Etiqueta}>`}
          ${p.observacao && html`<br /><small>${p.observacao}</small>`}` },
        { chave: 'mac', titulo: 'Masseira', valor: (p) => dados.mapa.maceira.get(p.maceira_id)?.nome || '', render: (p) => html`${dados.mapa.maceira.get(p.maceira_id)?.nome || html`<small class="texto-cinza">sem masseira</small>`}` },
        { chave: 'padeiro', titulo: 'Padeiro', valor: (p) => dados.mapa.operador.get(p.operador_id)?.nome || '', render: (p) => dados.mapa.operador.get(p.operador_id)?.nome || '–' },
        { chave: 'quantidade', titulo: 'Programado', num: true, valor: (p) => Number(p.quantidade), render: (p) => num(p.quantidade, 3) },
        { chave: 'feito', titulo: 'Pesado', num: true, render: (p) => html`<b>${num(p.feito, 3)}</b>` },
        { chave: 'etapas', titulo: 'Onde está', ordenar: false, render: (p) => html`<${EtapasMini} f=${fx.get(p.id)} />
          <div><${LinhaTempo} p=${p} ev=${eventos.get(p.id)} bateladas=${fluxo?.bateladas || []} /></div>` },
        { chave: 'sit', titulo: 'Situação', valor: (p) => p.sit.rotulo, render: (p) => html`<${Etiqueta} cor=${p.sit.cor}>${p.sit.rotulo}</${Etiqueta}>` },
        { chave: 'acao', titulo: '', ordenar: false, render: (p) => aberta(p) && html`<span class="acoes-linha" onClick=${(e) => e.stopPropagation()}>
          ${pesagem && html`<button class="btn btn-pri btn-peq" onClick=${() => setBaixa(p)}>Pesar</button>`}
          ${engenharia && (p.feito > 0 || p.data < hojeISO()) && html`<button class="btn btn-destaque btn-peq" onClick=${() => setFinalizar(p)}>Finalizar</button>`}
          ${engenharia && html`<button class="btn btn-sec btn-peq" onClick=${() => setEditar(p)}>Editar</button>`}</span>` },
      ]} />
    ${fora.length > 0 && html`<h3>Produções fora da programação</h3>
      <${Tabela} id="producao.programacaodia-2" linhas=${fora} colunas=${[
        { chave: 'data_hora', titulo: 'Hora', render: (p) => dataHora(p.data_hora) },
        { chave: 'r', titulo: 'Receita', valor: (p) => ficha(p.ficha_id)?.nome, render: (p) => html`<b>${ficha(p.ficha_id)?.nome}</b>${p.alterada ? html` <${Etiqueta} cor="laranja">alterada</${Etiqueta}>` : ''}` },
        { chave: 'multiplicador', titulo: 'Quantas', num: true, render: (p) => num(p.multiplicador, 3) },
        { chave: 'u', titulo: 'Pesado por', render: (p) => nomeUsuario(perfil(p.usuario_id)) },
      ]} />`}
    ${editar && html`<${ModalProgramar} pg=${editar.id ? editar : null} inicial=${editar} feito=${editar.id ? feito(editar) : 0} aoFechar=${() => setEditar(null)} />`}
    ${baixa && html`<${ModalBaixa} pg=${baixa} feito=${feito(baixa)} aoFechar=${() => setBaixa(null)} />`}
    ${finalizar && html`<${ModalFinalizar} pg=${finalizar} feito=${feito(finalizar)} prods=${prods.filter((x) => x.programacao_id === finalizar.id)} aoFechar=${() => setFinalizar(null)} />`}
    ${abertaDet && html`<${DetalheProgramacao} pg=${abertaDet} prods=${prods.filter((x) => x.programacao_id === abertaDet.id)} feito=${feito(abertaDet)}
      engenharia=${engenharia} pesagem=${pesagem} aoFechar=${() => setAberta(null)} aoFinalizar=${() => { setFinalizar(abertaDet); setAberta(null); }}
      aoBaixa=${() => { setBaixa(abertaDet); setAberta(null); }} aoEditar=${() => { setEditar(abertaDet); setAberta(null); }} />`}`;
}

// Lembrete da engenharia: produções de dias anteriores ainda não finalizadas
export function AvisoFinalizar({ progs, aoAbrir }) {
  const dias = [...new Set(progs.map((p) => p.data))].sort();
  return html`<div class="aviso-faixa"><span>⚠ Existem <b>${pl(progs.length, 'produção iniciada', 'produções iniciadas')}</b> em dias anteriores pendentes de finalização (${dias.map((d) => data(d).slice(0, 5)).join(', ')}). Confira com a pesagem e finalize.</span>
    <button class="btn btn-destaque btn-peq" onClick=${() => aoAbrir(dias[0])}>Ver ${data(dias[0]).slice(0, 5)}</button></div>`;
}

// Programar rápido: só o código (ou nome) da receita e a quantidade
function ProgramarRapido({ dia, aoAlterar }) {
  const { dados, recarregar, api } = useApp();
  const [fichaId, setFichaId] = useState(null);
  const [q, setQ] = useState('');
  const [ocupado, executar] = useAcao();
  const fichas = dados.fichas.filter((f) => f.ativo);
  const [chave, setChave] = useState(0);
  async function adicionar() {
    if (!fichaId) return avisar('Escolha a receita (digite o código, ex.: R001).', 'erro');
    if (!(n(q) > 0)) return avisar('Informe quantas receitas.', 'erro');
    const f = dados.mapa.ficha.get(fichaId);
    const r = await executar(() => api.rpc('salvar_programacao', { p: { data: dia, ficha_id: fichaId, quantidade: n(q) } }),
      `Programado: ${rec(n(q))} de ${f.nome} para ${data(dia)}.`);
    if (r) { setFichaId(null); setQ(''); setChave((k) => k + 1); await recarregar(); }
  }
  return html`<section class="painel programar">
    <div class="programar-linha" onKeyDown=${(e) => { if (e.key === 'Enter' && fichaId && n(q) > 0) adicionar(); }}>
      <b class="programar-rotulo">Programar para ${data(dia)}</b>
      <div class="programar-ficha"><${Escolher} key=${chave} itens=${fichas} valor=${fichaId} aoMudar=${setFichaId} placeholder="Código ou nome da receita (ex.: R001)"
        rotuloDe=${(f) => `${f.codigo} · ${f.nome}`} detalheDe=${(f) => f.produto_final || ''} /></div>
      <div class="programar-qtd"><${Numero} valor=${q} aoMudar=${setQ} placeholder="Receitas" /></div>
      <button class="btn btn-pri" disabled=${ocupado} onClick=${adicionar}><${Icone} nome="mais" tam=${16} /> Programar</button>
      <button class="btn btn-sec" onClick=${() => aoAlterar(fichaId)} title="Programar com outra farinha, outro melhorador…">Com alteração da receita…</button>
    </div>
  </section>`;
}

// Criar / editar uma programação (com ou sem alteração de ingredientes)
function ModalProgramar({ pg, inicial, feito, aoFechar }) {
  const { dados, recarregar, api } = useApp();
  const mp = dados.mapa.produto;
  const [dia, setDia] = useState(inicial.data || hojeISO());
  const [fichaId, setFichaId] = useState(inicial.ficha_id || null);
  const [q, setQ] = useState(pg ? virg(pg.quantidade) : '');
  const [obs, setObs] = useState(pg?.observacao || '');
  const [alterar, setAlterar] = useState(!!(pg?.itens_alterados || inicial.alterar));
  const [mac, setMac] = useState(pg ? pg.maceira_id || '' : inicial.maceira_id || '');
  const [op, setOp] = useState(pg?.operador_id || '');
  const daFicha = (id) => dados.fichaItens.filter((i) => i.ficha_id === id && mp.get(i.produto_id)?.categoria === 'materia_prima').map((i) => ({ k: Math.random(), produto_id: i.produto_id, quantidade: virg(i.quantidade), unidade: mp.get(i.produto_id)?.unidade_estoque }));
  const [linhas, setLinhas] = useState(() => (pg?.itens_alterados ? pg.itens_alterados.map((i) => ({ k: Math.random(), produto_id: i.produto_id, quantidade: virg(i.quantidade), unidade: i.unidade }))
    : inicial.ficha_id ? daFicha(inicial.ficha_id) : []));
  const [ocupado, executar] = useAcao();
  const mudar = (k, ch) => setLinhas((l) => l.map((x) => (x.k === k ? { ...x, ...ch } : x)));
  const travado = feito > 0;
  const prov = { ficha_id: fichaId, itens_alterados: alterar ? linhas.filter((l) => l.produto_id && n(l.quantidade) > 0).map((l) => ({ produto_id: l.produto_id, quantidade: n(l.quantidade), unidade: l.unidade })) : null };
  const resumoAlt = alterar && fichaId ? textoAlteracao(prov, dados) : '';

  async function salvar() {
    if (!fichaId) return avisar('Escolha a receita.', 'erro');
    if (!(n(q) > 0)) return avisar('Informe quantas receitas.', 'erro');
    if (alterar && !resumoAlt) return avisar('Você marcou "alterar a receita" mas não mudou nenhum ingrediente.', 'aviso');
    const r = await executar(() => api.rpc('salvar_programacao', { p: { id: pg?.id || null, data: dia, ficha_id: fichaId, quantidade: n(q), observacao: obs,
      itens: alterar ? prov.itens_alterados : [], ...(mac !== '' || pg ? { maceira_id: mac || null } : {}), operador_id: op || null } }), pg ? 'Programação atualizada.' : 'Programação criada.');
    if (r) { await recarregar(); aoFechar(); }
  }
  async function cancelar() {
    let motivo = '';
    const ok = await confirmar({ titulo: 'Cancelar programação', ok: 'Cancelar programação', perigo: true, cancelar: 'Voltar', mensagem: html`
      <p>${feito > 0 ? `Já foram feitas ${rec(feito)}; o restante deixa de ser pendente.` : 'Nada foi produzido ainda.'} A linha continua no histórico como cancelada.</p>
      <${Campo} rotulo="Motivo" obrigatorio><input class="entrada" onInput=${(e) => { motivo = e.target.value; }} placeholder="ex.: pedido do cliente foi cancelado" /></${Campo}>` });
    if (!ok) return;
    const r = await executar(() => api.rpc('cancelar_programacao', { p_id: pg.id, p_motivo: motivo }), 'Programação cancelada.');
    if (r) { await recarregar(); aoFechar(); }
  }
  return html`<${Modal} titulo=${pg ? 'Editar programação' : 'Programar produção'} aoFechar=${aoFechar} largo
    rodape=${html`${pg && html`<button class="btn btn-perigo-sec" onClick=${cancelar}>Cancelar programação</button>`}<span class="espaco"></span>
      <button class="btn btn-sec" onClick=${aoFechar}>Voltar</button>
      <button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>${ocupado ? 'Salvando…' : 'Salvar'}</button>`}>
    ${travado && html`<div class="alerta">Já houve baixa de ${rec(feito)}: dá para aumentar a quantidade ou ajustar a observação. Para mudar o dia, programe o restante em outro dia.</div>`}
    <div class="grade">
      <${Campo} rotulo="Dia da produção" obrigatorio><input class="entrada" type="date" value=${dia} disabled=${travado} onChange=${(e) => setDia(e.target.value)} /></${Campo}>
      <${Campo} rotulo="Receita" obrigatorio><${Escolher} itens=${dados.fichas.filter((f) => f.ativo)} valor=${fichaId} desabilitado=${travado}
        aoMudar=${(id) => { setFichaId(id); setLinhas(daFicha(id)); }} rotuloDe=${(f) => `${f.codigo} · ${f.nome}`} detalheDe=${(f) => f.produto_final || ''} /></${Campo}>
      <${Campo} rotulo="Quantas receitas" obrigatorio ajuda=${travado ? `mínimo ${num(feito, 3)} (já feitas)` : ''}><${Numero} valor=${q} aoMudar=${setQ} /></${Campo}>
      <${Campo} rotulo="Masseira" ajuda=${pg ? '' : 'Vazio = o sistema sugere pela linha da receita.'}><select class="entrada" value=${mac} onChange=${(e) => setMac(e.target.value ? Number(e.target.value) : '')}>
        <option value="">${pg ? 'Sem masseira' : 'Sugerir automaticamente'}</option>${dados.maceiras.filter((m) => m.ativa).map((m) => html`<option value=${m.id}>${m.nome}</option>`)}</select></${Campo}>
      <${Campo} rotulo="Padeiro sugerido (opcional)"><select class="entrada" value=${op} onChange=${(e) => setOp(e.target.value ? Number(e.target.value) : '')}>
        <option value="">Qualquer padeiro</option>${dados.operadores.filter((o) => o.ativo).map((o) => html`<option value=${o.id}>${o.nome}</option>`)}</select></${Campo}>
    </div>
    <label class="check destaque"><input type="checkbox" checked=${alterar} disabled=${!fichaId} onChange=${(e) => { setAlterar(e.target.checked); if (e.target.checked && !linhas.length) setLinhas(daFicha(fichaId)); }} />
      Alterar os ingredientes <b>só nesta programação</b> (ex.: só farinha tipo A hoje). A ficha técnica não muda.</label>
    ${alterar && fichaId && html`<p class="nota">Quantidades <b>por 1 receita</b>. A pesagem vai dar baixa com estes ingredientes.</p>
      <div class="linhas-itens">${linhas.map((l) => { const p = mp.get(l.produto_id); return html`<div class="linha-item" key=${l.k}>
        <${Escolher} itens=${dados.produtos.filter((x) => x.ativo && x.categoria === 'materia_prima')} valor=${l.produto_id} rotuloDe=${(x) => `${x.codigo} · ${x.descricao}`}
          detalheDe=${(x) => [x.grupo, x.classificacao && `classificação ${x.classificacao}`, x.marca, `saldo ${qu(dados.mapa.ind.get(x.id)?.saldo || 0, x.unidade_estoque)}`].filter(Boolean).join(' · ')}
          aoMudar=${(id, pr) => mudar(l.k, { produto_id: id, unidade: pr.unidade_estoque })} />
        <${QtdUnidade} produto=${p} valor=${l.quantidade} unidade=${l.unidade} desabilitado=${!p} aoMudar=${(v, u) => mudar(l.k, { quantidade: v, unidade: u })} />
        <button class="btn-icone" title="Retirar" onClick=${() => setLinhas((x) => x.filter((y) => y.k !== l.k))}>✕</button></div>`; })}</div>
      <button class="btn btn-sec btn-peq" onClick=${() => setLinhas((x) => [...x, { k: Math.random(), produto_id: null, quantidade: '', unidade: null }])}>+ Ingrediente</button>
      ${resumoAlt && html`<div class="alerta"><b>Alteração:</b> ${resumoAlt}.</div>`}`}
    <${Campo} rotulo="Observação para a pesagem"><input class="entrada" value=${obs} onInput=${(e) => setObs(e.target.value)} placeholder="ex.: pedido extra do atacado" /></${Campo}>
    ${pg && html`<${UltimaAlteracao} reg=${pg} />`}
  </${Modal}>`;
}

// Pesagem: dar baixa de N receitas de uma programação
function ModalBaixa({ pg, feito, aoFechar }) {
  const { dados, recarregar, api } = useApp();
  const mp = dados.mapa.produto;
  const pend = Math.max(Number(pg.quantidade) - feito, 0);
  const [mult, setMult] = useState(pend >= 1 || pend === 0 ? '1' : virg(pend));
  const [obs, setObs] = useState('');
  const [alterar, setAlterar] = useState(false);
  const [enviar, setEnviar] = useState(true);
  const pesLocal = localTipo(dados, 'pesagem');
  const ehPesagem = (id) => { const x = mp.get(id); return x && x.categoria === 'materia_prima' && (x.usado_na || 'pesagem') === 'pesagem' && x.baixa_producao !== false && x.controla_estoque !== false; };
  const base = ingredientes(pg, dados);
  const [linhas, setLinhas] = useState(() => base.map((e) => ({ k: Math.random(), produto_id: e.produto_id, quantidade: virg(e.base), unidade: mp.get(e.produto_id)?.unidade_estoque })));
  const mudar = (k, ch) => setLinhas((l) => l.map((x) => (x.k === k ? { ...x, ...ch } : x)));
  const [ocupado, executar] = useAcao();
  const f = dados.mapa.ficha.get(pg.ficha_id);
  const m = n(mult) || 0;
  const itensAlt = linhas.filter((l) => l.produto_id && n(l.quantidade) > 0).map((l) => ({ produto_id: l.produto_id, quantidade: n(l.quantidade), unidade: l.unidade }));
  const its = alterar ? itensAlt.map((i) => ({ produto_id: i.produto_id, base: i.quantidade * fator(mp.get(i.produto_id), i.unidade) })) : base;
  // o que mudou em relação ao que a engenharia programou (ou à ficha)
  const resumoAlt = alterar ? textoAlteracao({ ficha_id: pg.ficha_id, itens_alterados: itensAlt }, dados) : '';
  async function confirmarBaixa() {
    if (!(m > 0)) return avisar('Informe quantas receitas foram pesadas.', 'erro');
    if (alterar && !itensAlt.length) return avisar('A receita precisa de pelo menos 1 ingrediente.', 'erro');
    if (m > pend + 0.0005 && !(await confirmar({ titulo: 'Mais que o programado', ok: 'Dar baixa mesmo assim', mensagem: `Faltavam ${rec(pend)} e você vai dar baixa de ${rec(m)}. Confirma?` }))) return;
    const texto = alterar ? `Alterada na pesagem: ${resumoAlt || 'mesmos ingredientes'}.` : pg.itens_alterados ? `Receita alterada (programação): ${textoAlteracao(pg, dados)}.` : '';
    const r = await executar(() => api.rpc('registrar_producao', { p: { programacao_id: pg.id, ficha_id: pg.ficha_id, multiplicador: m,
      alterada: alterar, itens: alterar ? itensAlt : undefined, observacao: [texto, obs].filter(Boolean).join(' '), enviar } }),
      `Pesado: ${rec(m)} de ${f.nome}${enviar ? ' — base enviada para as masseiras' : ' — base ficou na pesagem'}.`);
    if (r) { await recarregar(); aoFechar(); }
  }
  return html`<${Modal} titulo=${`Pesar · ${f.codigo} ${f.nome}`} aoFechar=${aoFechar} largo
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Voltar</button>
      <button class="btn btn-pri" disabled=${ocupado || !(m > 0)} onClick=${confirmarBaixa}>${ocupado ? 'Registrando…' : `Pesar ${rec(m)}`}</button>`}>
    <p>Programado <b>${rec(Number(pg.quantidade))}</b> · pesado <b>${rec(feito)}</b> · falta <b>${rec(pend)}</b></p>
    ${pg.itens_alterados && html`<div class="alerta"><b>Receita alterada pela engenharia nesta programação:</b> ${textoAlteracao(pg, dados)}.</div>`}
    ${pg.observacao && html`<p class="nota">Engenharia: ${pg.observacao}</p>`}
    <div class="multiplicador">
      <span>Quantas receitas vai pesar agora?</span>
      <div class="mult-controles">
        <button class="btn btn-sec btn-quadrado" onClick=${() => setMult(virg(Math.max(m - 1, 0)))}>−</button>
        <${Numero} valor=${mult} aoMudar=${setMult} classe="mult" />
        <button class="btn btn-sec btn-quadrado" onClick=${() => setMult(virg(m + 1))}>+</button>
        ${pend > 0 && html`<button class="btn btn-sec btn-peq" onClick=${() => setMult(virg(pend))}>Tudo que falta (${num(pend, 3)})</button>`}
      </div>
    </div>
    <label class="check destaque"><input type="checkbox" checked=${alterar} onChange=${(e) => setAlterar(e.target.checked)} />
      Trocar ingredientes <b>só nesta pesagem</b> (ex.: acabou a farinha tipo A, usar a B; outro melhorador). A ficha técnica e o resto da programação não mudam.</label>
    ${alterar && html`<p class="nota">Quantidades <b>por 1 receita</b>. Ex.: programado 5 → pese 1 com a troca agora e as outras 4 depois, com ou sem troca.</p>
      <div class="linhas-itens">${linhas.map((l) => { const p = mp.get(l.produto_id); return html`<div class="linha-item" key=${l.k}>
        <${Escolher} itens=${dados.produtos.filter((x) => x.ativo && x.categoria === 'materia_prima')} valor=${l.produto_id} rotuloDe=${(x) => `${x.codigo} · ${x.descricao}`}
          detalheDe=${(x) => [x.grupo, x.classificacao && `classificação ${x.classificacao}`, x.marca, `saldo ${qu(dados.mapa.ind.get(x.id)?.saldo || 0, x.unidade_estoque)}`].filter(Boolean).join(' · ')}
          aoMudar=${(id, pr) => mudar(l.k, { produto_id: id, unidade: pr.unidade_estoque })} />
        <${QtdUnidade} produto=${p} valor=${l.quantidade} unidade=${l.unidade} desabilitado=${!p} aoMudar=${(v, u) => mudar(l.k, { quantidade: v, unidade: u })} />
        <button class="btn-icone" title="Retirar" onClick=${() => setLinhas((x) => x.filter((y) => y.k !== l.k))}>✕</button></div>`; })}</div>
      <button class="btn btn-sec btn-peq" onClick=${() => setLinhas((x) => [...x, { k: Math.random(), produto_id: null, quantidade: '', unidade: null }])}>+ Ingrediente</button>
      ${resumoAlt && html`<div class="alerta"><b>Troca:</b> ${resumoAlt}.</div>`}`}
    <h4 class="titulo-secao">Pós a pesar</h4>
    <div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Ingrediente</th><th class="n">Por receita</th><th class="n">Total (× ${num(m, 3)})</th><th class="n">Na pesagem</th></tr></thead>
      <tbody>${its.filter((e) => ehPesagem(e.produto_id)).map((e) => { const p = mp.get(e.produto_id); const sl = pesLocal ? saldoLocal(dados, e.produto_id, pesLocal.id).disponivel : (dados.mapa.ind.get(e.produto_id)?.saldo || 0);
        const total = e.base * m; const falta = total > sl + 0.0001;
        return html`<tr><td data-rotulo="Ingrediente"><b>${p?.descricao}</b></td><td class="n" data-rotulo="Por receita">${qu(e.base, p?.unidade_estoque)}</td>
          <td class="n" data-rotulo="Total"><b>${qu(total, p?.unidade_estoque)}</b></td>
          <td class=${'n' + (falta ? ' texto-vermelho' : '')} data-rotulo="Na pesagem">${qu(sl, p?.unidade_estoque)}${falta ? ' ⚠' : ''}</td></tr>`; })}</tbody></table></div>
    ${its.some((e) => !ehPesagem(e.produto_id)) && html`<p class="nota">Ficam para a masseira (não pesa aqui): ${its.filter((e) => !ehPesagem(e.produto_id)).map((e) => `${mp.get(e.produto_id)?.descricao} ${qu(e.base * m, mp.get(e.produto_id)?.unidade_estoque)}`).join(' · ')}.</p>`}
    <label class="check destaque"><input type="checkbox" checked=${enviar} onChange=${(e) => setEnviar(e.target.checked)} />
      Enviar já a base para a <b>Produção Masseiras</b> (o padeiro recebe no tablet). Desmarque se a base vai ficar na pesagem por enquanto.</label>
    <${Campo} rotulo="Observação (opcional)"><input class="entrada" value=${obs} onInput=${(e) => setObs(e.target.value)} /></${Campo}>
  </${Modal}>`;
}

// Engenharia: confere com a pesagem e finaliza a produção programada
function ModalFinalizar({ pg, feito, prods, aoFechar }) {
  const { dados, recarregar, api, ir } = useApp();
  const [obs, setObs] = useState('');
  const [ocupado, executar] = useAcao();
  const f = dados.mapa.ficha.get(pg.ficha_id);
  const q = Number(pg.quantidade);
  const diferenca = feito < q - 0.0005;
  async function ok() {
    if (diferenca && !obs.trim()) return avisar('Foi feito menos que o programado: explique a diferença na observação.', 'erro');
    const r = await executar(() => api.rpc('finalizar_programacao', { p_id: pg.id, p_obs: obs }), `Produção finalizada: ${f.nome} de ${data(pg.data)}.`);
    if (r !== null) { await recarregar(); aoFechar(); }
  }
  return html`<${Modal} titulo=${`Finalizar produção · ${f.codigo} ${f.nome} · ${data(pg.data)}`} aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Voltar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${ok}>${ocupado ? 'Finalizando…' : 'Confirmar: produção finalizada'}</button>`}>
    <div class="info-grade">
      <div><small>Programado</small><b>${rec(q)}</b></div>
      <div><small>Pesado</small><b>${rec(feito)}</b></div>
      <div><small>Diferença</small><b class=${diferenca ? 'texto-vermelho' : ''}>${rec(Math.max(q - feito, 0))}</b></div>
    </div>
    ${prods.length > 0 && html`<p class="nota">Baixas: ${prods.map((x) => `${num(x.multiplicador, 3)} por ${dados.mapa.perfil.get(x.usuario_id)?.nome || '?'} às ${dataHora(x.data_hora).slice(-5)}${x.alterada ? ' (alterada)' : ''}`).join(' · ')}</p>`}
    ${diferenca ? html`<div class="alerta">Foi pesado menos que o programado. A diferença fica registrada no histórico; se precisar, programe o restante em outro dia.</div>`
      : html`<div class="alerta alerta-ok">Tudo que foi programado foi pesado.</div>`}
    <${Campo} rotulo=${diferenca ? 'Observação (obrigatória)' : 'Observação (opcional)'}><input class="entrada" value=${obs} onInput=${(e) => setObs(e.target.value)} placeholder="ex.: conferido com a Nayara; faltou forno" /></${Campo}>
    <p class="nota">Depois de finalizada, a programação não recebe mais pesagens nem alterações. As bateladas em produção precisam ser finalizadas antes (tela <a href="#" onClick=${(e) => { e.preventDefault(); aoFechar(); ir && ir('finalizar'); }}>Finalizar bateladas</a>).</p>
  </${Modal}>`;
}

function DetalheProgramacao({ pg, prods, feito, engenharia, pesagem, aoFechar, aoBaixa, aoEditar, aoFinalizar }) {
  const { dados } = useApp();
  const f = dados.mapa.ficha.get(pg.ficha_id);
  const perfil = (id) => dados.mapa.perfil.get(id);
  const sit = situacao(pg, feito);
  const pend = Math.max(Number(pg.quantidade) - feito, 0);
  const its = ingredientes(pg, dados);
  return html`<${Modal} titulo=${`${f?.codigo} · ${f?.nome} · ${data(pg.data)}`} aoFechar=${aoFechar} largo
    rodape=${html`<span class="espaco"></span>${engenharia && aberta(pg) && html`<button class="btn btn-sec" onClick=${aoEditar}>Editar</button>`}
      ${engenharia && aberta(pg) && (feito > 0 || pg.data < hojeISO()) && html`<button class="btn btn-destaque" onClick=${aoFinalizar}>Finalizar produção</button>`}
      ${pesagem && aberta(pg) && html`<button class="btn btn-pri" onClick=${aoBaixa}>Pesar</button>`}`}>
    <div class="info-grade">
      <div><small>Programado</small><b>${rec(Number(pg.quantidade))}</b></div>
      <div><small>Produzido</small><b>${rec(feito)}</b></div>
      <div><small>Pendente</small><b>${rec(pend)}</b></div>
      <div><small>Situação</small><span><${Etiqueta} cor=${sit.cor}>${sit.rotulo}</${Etiqueta}></span></div>
      <div><small>Programado por</small><b>${nomeUsuario(perfil(pg.criado_por))}</b></div>
    </div>
    ${pg.situacao === 'cancelada' && html`<div class="alerta">Cancelada: ${pg.cancelado_motivo}</div>`}
    ${pg.finalizada_em && html`<div class="alerta alerta-ok">Finalizada por <b>${nomeUsuario(perfil(pg.finalizada_por))}</b> em ${dataHora(pg.finalizada_em)}${pg.finalizada_obs ? ` · ${pg.finalizada_obs}` : ''}.</div>`}
    ${pg.itens_alterados && html`<div class="alerta"><b>Receita alterada só nesta programação:</b> ${textoAlteracao(pg, dados)}.</div>`}
    ${pg.observacao && html`<p class="nota">${pg.observacao}</p>`}
    <h3>Ingredientes</h3>
    <${Tabela} linhas=${its.map((e, i) => ({ ...e, id: i }))} colunas=${[
      { chave: 'p', titulo: 'Ingrediente', render: (e) => dados.mapa.produto.get(e.produto_id)?.descricao },
      { chave: 'base', titulo: 'Por receita', num: true, render: (e) => qu(e.base, dados.mapa.produto.get(e.produto_id)?.unidade_estoque) },
      { chave: 't', titulo: 'Total programado', num: true, render: (e) => qu(e.base * Number(pg.quantidade), dados.mapa.produto.get(e.produto_id)?.unidade_estoque) },
      { chave: 'f', titulo: 'Falta pesar', num: true, render: (e) => qu(e.base * pend, dados.mapa.produto.get(e.produto_id)?.unidade_estoque) },
    ]} />
    <h3>Baixas da pesagem</h3>
    <${Tabela} linhas=${prods} vazio="Nenhuma baixa ainda." ordemInicial=${{ chave: 'id', dir: 1 }} colunas=${[
      { chave: 'id', titulo: 'Data/hora', valor: (p) => p.id, render: (p) => dataHora(p.data_hora) },
      { chave: 'multiplicador', titulo: 'Receitas', num: true, render: (p) => num(p.multiplicador, 3) },
      { chave: 'u', titulo: 'Pesado por', render: (p) => nomeUsuario(perfil(p.usuario_id)) },
      { chave: 'observacao', titulo: 'Observação', render: (p) => html`<small>${p.observacao || ''}</small>` },
    ]} />
    <${UltimaAlteracao} reg=${pg} />
    <${HistoricoAuditoria} tabela="programacoes" id=${pg.id} />
  </${Modal}>`;
}

// Pesagem: manda para as maceiras as bases pesadas que ficaram na pesagem
function EnviarMisturas({ fluxo }) {
  const { dados, api, recarregar } = useApp();
  const [ocupado, executar] = useAcao();
  const pes = localTipo(dados, 'pesagem'); const mac = localTipo(dados, 'maceiras');
  const pend = fluxo.filter((f) => f.na_pesagem > 0.0001);
  if (!pes || !mac || !pend.length) return null;
  const total = pend.reduce((s, f) => s + f.na_pesagem, 0);
  async function enviar() {
    const itens = pend.map((f) => { const m = dados.produtos.find((p) => p.categoria === 'intermediario' && p.ficha_id === f.ficha_id); return m && { produto_id: m.id, quantidade: f.na_pesagem, programacao_id: f.programacao_id }; }).filter(Boolean);
    const disp = new Map(); itens.forEach((i) => disp.set(i.produto_id, saldoLocal(dados, i.produto_id, pes.id).disponivel));
    const ok = itens.filter((i) => { const d = disp.get(i.produto_id); const q = Math.min(i.quantidade, d); disp.set(i.produto_id, d - q); i.quantidade = q; return q > 0.0001; });
    if (!ok.length) return avisar('Não há base disponível na pesagem para enviar.', 'erro');
    if (await executar(() => api.rpc('criar_transferencia', { p: { origem_id: pes.id, destino_id: mac.id, enviar: true, observacao: 'Bases da pesagem', itens: ok } }), 'Bases enviadas para as masseiras.')) await recarregar(true);
  }
  return html`<div class="aviso-faixa azul"><span><${Icone} nome="caminhao" tam=${18} /> <b>${rec(total)}</b> pesada(s) e ainda na pesagem: ${pend.map((f) => `${dados.mapa.ficha.get(f.ficha_id)?.codigo} (${num(f.na_pesagem, 1)})`).join(', ')}</span>
    <button class="btn btn-pri btn-peq" disabled=${ocupado} onClick=${enviar}>Enviar para as masseiras</button></div>`;
}

// Etapas da programação em miniatura (a pesar → finalizado)
function EtapasMini({ f }) {
  if (!f) return html`<small class="texto-cinza">–</small>`;
  const vis = ETAPAS.filter((e) => Number(f[e.id]) > 0.0001);
  if (!vis.length) return html`<small class="texto-cinza">–</small>`;
  return html`<span class="etapas-mini">${vis.map((e) => html`<span class="em-chip" style=${`--c:${e.cor}`} title=${e.titulo}>${num(f[e.id], Number(f[e.id]) % 1 ? 1 : 0)} ${e.curto || e.titulo}</span>`)}</span>`;
}

// Programado × produzido em um período (com exportação)
function ProgramacaoPeriodo({ aoAbrirDia }) {
  const { dados } = useApp();
  const h = hojeISO();
  const [de, setDe] = useState(h);
  useHistorico(de);
  const [ate, setAte] = useState(somarDias(h, 1));
  const progs = dados.programacoes.filter((p) => p.data >= de && p.data <= ate && p.situacao === 'ativa');
  const prods = useProducoes(de, ate, progs.map((p) => p.id));
  const filtros = (acoes) => html`<div class="filtros filtros-com-acoes">
    <label class="campo-inline">De <input class="entrada" type="date" value=${de} onChange=${(e) => setDe(e.target.value)} /></label>
    <label class="campo-inline">até <input class="entrada" type="date" value=${ate} onChange=${(e) => setAte(e.target.value)} /></label>
    <span class="chips">
      <button class="chip" onClick=${() => { setDe(h); setAte(somarDias(h, 1)); }}>Hoje e amanhã</button>
      <button class="chip" onClick=${() => { setDe(somarDias(h, -6)); setAte(h); }}>Últimos 7 dias</button>
      <button class="chip" onClick=${() => { setDe(h.slice(0, 8) + '01'); setAte(h); }}>Este mês</button>
      <button class="chip" onClick=${() => { setDe(h); setAte(somarDias(h, 6)); }}>Próximos 7 dias</button>
    </span>${acoes && html`<div class="filtros-acoes">${acoes}</div>`}</div>`;
  if (!prods) return html`${filtros()}<${Carregando} />`;
  const fm = somaFeito(prods);
  const ficha = (id) => dados.mapa.ficha.get(id);
  const linhas = progs.map((p) => ({ ...p, feito: fm.get(p.id) || 0, sit: situacao(p, fm.get(p.id) || 0) })).sort((a, b) => a.data.localeCompare(b.data) || String(ficha(a.ficha_id)?.codigo).localeCompare(String(ficha(b.ficha_id)?.codigo)));
  const pend = (p) => Math.max(Number(p.quantidade) - p.feito, 0);
  const tP = linhas.reduce((s, p) => s + Number(p.quantidade), 0), tF = linhas.reduce((s, p) => s + Math.min(p.feito, Number(p.quantidade)), 0);
  const cols = [
    { titulo: 'Dia', valor: (p) => data(p.data) }, { titulo: 'Código', valor: (p) => ficha(p.ficha_id)?.codigo }, { titulo: 'Receita', valor: (p) => ficha(p.ficha_id)?.nome, largura: 30 },
    { titulo: 'Programado', valor: (p) => Number(p.quantidade), num: true }, { titulo: 'Produzido', valor: (p) => p.feito, num: true },
    { titulo: 'Pendente', valor: pend, num: true }, { titulo: 'Situação', valor: (p) => p.sit.rotulo },
    { titulo: 'Alteração', valor: (p) => (p.itens_alterados ? 'sim' : '') }, { titulo: 'Observação', valor: (p) => p.observacao, largura: 35 },
  ];
  return html`${filtros(html`<${Exportar} tabela="producao.programacaoperiodo" titulo="Programação de produção" filtros=${`${data(de)} a ${data(ate)}`} arquivo=${`programacao-${de}-a-${ate}`} colunas=${cols} linhas=${linhas}
      totais=${['TOTAL', '', '', num(tP, 3), num(tF, 3), num(Math.max(tP - tF, 0), 3), '', '', '']} />`)}
    <div class="cartoes">
      <${Cartao} titulo="Programado" valor=${rec(tP)} /><${Cartao} titulo="Produzido" valor=${rec(tF)} sub=${tP ? `${num((tF / tP) * 100, 0)}% atendido` : '–'} />
      <${Cartao} titulo="Pendente" valor=${rec(Math.max(tP - tF, 0))} cor=${tP - tF > 0 ? 'c-laranja' : ''} />
    </div>
    <${Tabela} id="producao.programacaoperiodo" linhas=${linhas} aoClicar=${(p) => aoAbrirDia(p.data)} vazio="Nada programado neste período." colunas=${[
      { chave: 'data', titulo: 'Dia', render: (p) => rotuloDia(p.data) },
      { chave: 'r', titulo: 'Receita', valor: (p) => ficha(p.ficha_id)?.nome, render: (p) => html`<b>${ficha(p.ficha_id)?.codigo} · ${ficha(p.ficha_id)?.nome}</b>${p.itens_alterados ? html` <${Etiqueta} cor="laranja">alterada</${Etiqueta}>` : ''}` },
      { chave: 'quantidade', titulo: 'Programado', num: true, valor: (p) => Number(p.quantidade), render: (p) => num(p.quantidade, 3) },
      { chave: 'feito', titulo: 'Produzido', num: true, render: (p) => num(p.feito, 3) },
      { chave: 'pend', titulo: 'Pendente', num: true, valor: pend, render: (p) => num(pend(p), 3) },
      { chave: 'sit', titulo: 'Situação', valor: (p) => p.sit.rotulo, render: (p) => html`<${Etiqueta} cor=${p.sit.cor}>${p.sit.rotulo}</${Etiqueta}>` },
    ]} />`;
}

// =====================================================================
// SAÍDAS DA PRODUÇÃO (só o que a pesagem tirou: receitas e avulsas)
// =====================================================================
export function TelaSaidasProducao() {
  const { dados, api } = useApp();
  const h = hojeISO();
  const [de, setDe] = useState(h);
  useHistorico(de);
  const [ate, setAte] = useState(h);
  const [aba, setAba] = useState('resumo');
  const [movs, setMovs] = useState(null);
  const prods = useProducoes(de, ate, null);
  const mudou = useFiltroMudou([de, ate]);
  useEffect(() => {
    let vivo = true; if (mudou()) setMovs(null);
    api.listar('movimentos', { desde: inicioDia(de), ate: inicioDia(somarDias(ate, 1)), em: { tipo: ['saida_receita', 'saida_avulsa', 'correcao'] } })
      .then((l) => vivo && setMovs(l)).catch((e) => { avisar(mensagemErro(e), 'erro'); if (vivo) setMovs([]); });
    return () => { vivo = false; };
  }, [de, ate, dados.carregadoEm]);

  const barra = (acoes) => html`<div class="filtros filtros-com-acoes">
    <label class="campo-inline">De <input class="entrada" type="date" value=${de} onChange=${(e) => setDe(e.target.value)} /></label>
    <label class="campo-inline">até <input class="entrada" type="date" value=${ate} onChange=${(e) => setAte(e.target.value)} /></label>
    <span class="chips">
      <button class=${'chip' + (de === h && ate === h ? ' ativo' : '')} aria-pressed=${!!(de === h && ate === h)} onClick=${() => { setDe(h); setAte(h); }}>Hoje</button>
      <button class="chip" onClick=${() => { setDe(somarDias(h, -1)); setAte(somarDias(h, -1)); }}>Ontem</button>
      <button class="chip" onClick=${() => { setDe(somarDias(h, -6)); setAte(h); }}>7 dias</button>
      <button class="chip" onClick=${() => { setDe(h.slice(0, 8) + '01'); setAte(h); }}>Este mês</button>
    </span>${acoes && html`<div class="filtros-acoes">${acoes}</div>`}</div>`;
  const corpo = !prods || !movs ? html`${barra()}<${Carregando} />` : html`<${SaidasProducaoConteudo} barra=${barra} aba=${aba} de=${de} ate=${ate} prods=${prods.filter((p) => diaLocal(p.data_hora) >= de && diaLocal(p.data_hora) <= ate)} movs=${movs} />`;
  return html`
    <${Cabecalho} titulo="Saídas da produção" sub="Só o que saiu na pesagem para produzir: receitas feitas e saídas avulsas de matéria-prima" />
    <${Abas} abas=${[{ id: 'resumo', titulo: 'Resumo por receita' }, { id: 'lancamentos', titulo: 'Receitas pesadas' }, { id: 'avulsas', titulo: 'Saídas avulsas' }, { id: 'consumo', titulo: 'Matéria-prima consumida' }]}
      ativa=${aba} aoMudar=${setAba} />
    ${corpo}`;
}

function SaidasProducaoConteudo({ aba, de, ate, prods, movs, barra }) {
  const { dados, podeFazer, papeis } = useApp();
  const verCusto = podeFazer('custos') || papeis.includes('diretoria');   // custo não aparece para engenharia/pesagem
  const [aberta, setAberta] = useState(null);
  const ficha = (id) => dados.mapa.ficha.get(id);
  const perfil = (id) => dados.mapa.perfil.get(id);
  const prod = (id) => dados.mapa.produto.get(id);
  const periodo = de === ate ? data(de) : `${data(de)} a ${data(ate)}`;
  // correções valem junto com o lançamento original
  const porId = new Map(movs.map((m) => [m.id, m]));
  const origem = (m) => (m.tipo === 'correcao' ? porId.get(m.corrige_id) : m);
  const validos = movs.filter((m) => origem(m) && ['saida_receita', 'saida_avulsa'].includes(origem(m).tipo));
  const movsProd = (pid) => validos.filter((m) => origem(m).producao_id === pid);
  const custo = (pid) => -movsProd(pid).reduce((s, m) => s + Number(m.valor), 0);

  if (aba === 'resumo') {
    const g = new Map();
    for (const p of prods) {
      const x = g.get(p.ficha_id) || { id: p.ficha_id, receitas: 0, lanc: 0, alt: 0, custo: 0, prog: 0, foraProg: 0 };
      x.receitas += Number(p.multiplicador); x.lanc += 1; if (p.alterada) x.alt += 1; x.custo += custo(p.id); if (!p.programacao_id) x.foraProg += Number(p.multiplicador);
      g.set(p.ficha_id, x);
    }
    for (const pg of dados.programacoes.filter((p) => p.situacao === 'ativa' && p.data >= de && p.data <= ate)) {
      const x = g.get(pg.ficha_id) || { id: pg.ficha_id, receitas: 0, lanc: 0, alt: 0, custo: 0, prog: 0, foraProg: 0 };
      x.prog += Number(pg.quantidade); g.set(pg.ficha_id, x);
    }
    const linhas = [...g.values()].sort((a, b) => b.receitas - a.receitas);
    const tR = linhas.reduce((s, x) => s + x.receitas, 0), tC = linhas.reduce((s, x) => s + x.custo, 0), tP = linhas.reduce((s, x) => s + x.prog, 0);
    const avulsas = validos.filter((m) => origem(m).tipo === 'saida_avulsa');
    const cols = [{ titulo: 'Código', valor: (x) => ficha(x.id)?.codigo }, { titulo: 'Receita', valor: (x) => ficha(x.id)?.nome, largura: 30 },
      { titulo: 'Receitas feitas', valor: (x) => x.receitas, num: true }, { titulo: 'Programado', valor: (x) => x.prog, num: true },
      { titulo: 'Fora da programação', valor: (x) => x.foraProg, num: true }, { titulo: 'Lançamentos', valor: (x) => x.lanc, num: true },
      { titulo: 'Com alteração', valor: (x) => x.alt, num: true }, { titulo: 'Custo', valor: (x) => Math.round(x.custo * 100) / 100, texto: (x) => moeda(x.custo), num: true }];
    return html`
      ${barra(html`<${ExportarC} verCusto=${verCusto} titulo="Saídas da produção — resumo por receita" filtros=${periodo} arquivo=${`saidas-producao-resumo-${de}-a-${ate}`} colunas=${cols} linhas=${linhas}
        totais=${['TOTAL', '', num(tR, 3), num(tP, 3), '', '', '', moeda(tC)]} />`)}
      <div class="cartoes">
        <${Cartao} titulo="Receitas feitas" valor=${rec(tR)} sub=${pl(prods.length, 'lançamento', 'lançamentos')} />
        <${Cartao} titulo="Programado no período" valor=${rec(tP)} sub=${tP ? `${num((Math.min(tR, tP) / tP) * 100, 0)}% atendido` : '–'} />
        ${verCusto && html`<${Cartao} titulo="Custo da matéria-prima" valor=${moeda(tC)} sub="pelas receitas" />`}
        <${Cartao} titulo="Saídas avulsas" valor=${avulsas.length} sub=${verCusto ? moeda(Math.abs(avulsas.reduce((s, m) => s + Number(m.valor), 0))) : ''} cor=${avulsas.length ? 'c-laranja' : ''} />
      </div>
      <${TabelaC} verCusto=${verCusto} linhas=${linhas} vazio="Nenhuma receita pesada neste período." colunas=${[
        { chave: 'r', titulo: 'Receita', valor: (x) => ficha(x.id)?.nome, render: (x) => html`<b>${ficha(x.id)?.codigo} · ${ficha(x.id)?.nome}</b>` },
        { chave: 'receitas', titulo: 'Feitas', num: true, render: (x) => html`<b>${num(x.receitas, 3)}</b>` },
        { chave: 'prog', titulo: 'Programado', num: true, render: (x) => (x.prog ? num(x.prog, 3) : '–') },
        { chave: 'foraProg', titulo: 'Fora da prog.', num: true, render: (x) => (x.foraProg ? num(x.foraProg, 3) : '–') },
        { chave: 'lanc', titulo: 'Lançamentos', num: true },
        { chave: 'alt', titulo: 'Alteradas', num: true, render: (x) => (x.alt ? html`<${Etiqueta} cor="laranja">${x.alt}</${Etiqueta}>` : '–') },
        { chave: 'custo', titulo: 'Custo', num: true, render: (x) => moeda(x.custo) },
      ]} />`;
  }

  if (aba === 'lancamentos') {
    const cols = [{ titulo: 'Data/hora', valor: (p) => dataHora(p.data_hora) }, { titulo: 'Código', valor: (p) => ficha(p.ficha_id)?.codigo }, { titulo: 'Receita', valor: (p) => ficha(p.ficha_id)?.nome, largura: 30 },
      { titulo: 'Receitas', valor: (p) => Number(p.multiplicador), num: true }, { titulo: 'Alterada', valor: (p) => (p.alterada ? 'sim' : '') },
      { titulo: 'Programação', valor: (p) => (p.programacao_id ? 'sim' : 'fora') }, { titulo: 'Pesado por', valor: (p) => nomeUsuario(perfil(p.usuario_id)), largura: 28 },
      { titulo: 'Custo', valor: (p) => Math.round(custo(p.id) * 100) / 100, texto: (p) => moeda(custo(p.id)), num: true }, { titulo: 'Observação', valor: (p) => p.observacao, largura: 45 }];
    const abas = () => [{ nome: 'Receitas pesadas', colunas: cols, linhas: prods },
      { nome: 'Ingredientes', linhas: prods.flatMap((p) => movsProd(p.id).map((m) => ({ p, m }))), colunas: [
        { titulo: 'Data/hora', valor: (x) => dataHora(x.p.data_hora) }, { titulo: 'Receita', valor: (x) => ficha(x.p.ficha_id)?.nome }, { titulo: 'Ingrediente', valor: (x) => prod(x.m.produto_id)?.descricao },
        { titulo: 'Quantidade', valor: (x) => -Number(x.m.quantidade) }, { titulo: 'Unid.', valor: (x) => prod(x.m.produto_id)?.unidade_estoque },
        { titulo: 'Custo', valor: (x) => -Number(x.m.valor) }, { titulo: 'Tipo', valor: (x) => (x.m.tipo === 'correcao' ? 'correção' : '') }] }];
    return html`
      ${barra(html`<${ExportarC} verCusto=${verCusto} titulo="Receitas pesadas" filtros=${periodo} arquivo=${`receitas-pesadas-${de}-a-${ate}`} colunas=${cols} linhas=${prods} abas=${abas} />`)}
      <${TabelaC} verCusto=${verCusto} linhas=${prods} aoClicar=${setAberta} ordemInicial=${{ chave: 'id', dir: -1 }} vazio="Nenhuma receita pesada neste período." colunas=${[
        { chave: 'id', titulo: 'Data/hora', valor: (p) => p.id, render: (p) => dataHora(p.data_hora) },
        { chave: 'r', titulo: 'Receita', valor: (p) => ficha(p.ficha_id)?.nome, render: (p) => html`<b>${ficha(p.ficha_id)?.codigo} · ${ficha(p.ficha_id)?.nome}</b>
          ${p.alterada ? html` <${Etiqueta} cor="laranja">alterada</${Etiqueta}>` : ''}${!p.programacao_id ? html` <${Etiqueta} cor="cinza">fora da programação</${Etiqueta}>` : ''}` },
        { chave: 'multiplicador', titulo: 'Receitas', num: true, render: (p) => num(p.multiplicador, 3) },
        { chave: 'u', titulo: 'Pesado por', valor: (p) => perfil(p.usuario_id)?.nome, render: (p) => nomeUsuario(perfil(p.usuario_id)) },
        { chave: 'c', titulo: 'Custo', num: true, valor: (p) => custo(p.id), render: (p) => moeda(custo(p.id)) },
      ]} />
      ${aberta && html`<${Modal} titulo=${`${ficha(aberta.ficha_id)?.nome} · ${rec(Number(aberta.multiplicador))} · ${dataHora(aberta.data_hora)}`} aoFechar=${() => setAberta(null)} largo>
        <p>Pesado por <b>${nomeUsuario(perfil(aberta.usuario_id))}</b>${aberta.alterada ? html` · <${Etiqueta} cor="laranja">receita alterada</${Etiqueta}>` : ''}
          ${!aberta.programacao_id ? html` · <${Etiqueta} cor="cinza">fora da programação</${Etiqueta}>` : ''}</p>
        ${aberta.observacao && html`<p class="nota">${aberta.observacao}</p>`}
        <${TabelaC} verCusto=${verCusto} linhas=${movsProd(aberta.id)} colunas=${[
          { chave: 'p', titulo: 'Ingrediente usado', render: (m) => html`${prod(m.produto_id)?.descricao}${m.tipo === 'correcao' ? html` <${Etiqueta} cor="roxo">correção</${Etiqueta}>` : ''}` },
          { chave: 'quantidade', titulo: 'Quantidade', num: true, render: (m) => qu(-m.quantidade, prod(m.produto_id)?.unidade_estoque) },
          { chave: 'valor', titulo: 'Custo', num: true, render: (m) => moeda(-m.valor) },
        ]} />
      </${Modal}>`}`;
  }

  if (aba === 'avulsas') {
    const lista = validos.filter((m) => origem(m).tipo === 'saida_avulsa');
    const cols = [{ titulo: 'Data/hora', valor: (m) => dataHora(m.data_hora) }, { titulo: 'Código', valor: (m) => prod(m.produto_id)?.codigo }, { titulo: 'Produto', valor: (m) => prod(m.produto_id)?.descricao, largura: 32 },
      { titulo: 'Quantidade', valor: (m) => -Number(m.quantidade), num: true }, { titulo: 'Unid.', valor: (m) => prod(m.produto_id)?.unidade_estoque },
      { titulo: 'Custo', valor: (m) => -Number(m.valor), texto: (m) => moeda(-m.valor), num: true }, { titulo: 'Quem', valor: (m) => nomeUsuario(perfil(m.usuario_id)), largura: 28 },
      { titulo: 'Justificativa', valor: (m) => (m.tipo === 'correcao' ? `Correção: ${m.motivo || ''}` : m.observacao), largura: 45 }];
    return html`
      ${barra(html`<${ExportarC} verCusto=${verCusto} titulo="Saídas avulsas da pesagem" filtros=${periodo} arquivo=${`saidas-avulsas-${de}-a-${ate}`} colunas=${cols} linhas=${lista} />`)}
      <${TabelaC} verCusto=${verCusto} linhas=${lista} ordemInicial=${{ chave: 'id', dir: -1 }} vazio="Nenhuma saída avulsa neste período." colunas=${[
        { chave: 'id', titulo: 'Data/hora', valor: (m) => m.id, render: (m) => dataHora(m.data_hora) },
        { chave: 'p', titulo: 'Produto', valor: (m) => prod(m.produto_id)?.descricao, render: (m) => html`<b>${prod(m.produto_id)?.descricao}</b>${m.tipo === 'correcao' ? html` <${Etiqueta} cor="roxo">correção</${Etiqueta}>` : ''}` },
        { chave: 'quantidade', titulo: 'Quantidade', num: true, valor: (m) => -m.quantidade, render: (m) => qu(-m.quantidade, prod(m.produto_id)?.unidade_estoque) },
        { chave: 'valor', titulo: 'Custo', num: true, valor: (m) => -m.valor, render: (m) => moeda(-m.valor) },
        { chave: 'u', titulo: 'Quem', render: (m) => nomeUsuario(perfil(m.usuario_id)) },
        { chave: 'observacao', titulo: 'Justificativa', render: (m) => html`<small class="quebra">${m.tipo === 'correcao' ? `Correção: ${m.motivo || ''}` : m.observacao}</small>` },
      ]} />`;
  }

  // consumo de matéria-prima (receitas + avulsas, já com correções)
  const g = new Map();
  for (const m of validos) {
    const t = origem(m).tipo;
    const x = g.get(m.produto_id) || { id: m.produto_id, receita: 0, avulsa: 0, valor: 0 };
    if (t === 'saida_receita') x.receita += -Number(m.quantidade); else x.avulsa += -Number(m.quantidade);
    x.valor += -Number(m.valor); g.set(m.produto_id, x);
  }
  const linhas = [...g.values()].sort((a, b) => b.valor - a.valor);
  const un = (x) => prod(x.id)?.unidade_estoque;
  const cols = [{ titulo: 'Código', valor: (x) => prod(x.id)?.codigo }, { titulo: 'Matéria-prima', valor: (x) => prod(x.id)?.descricao, largura: 32 },
    { titulo: 'Classificação', valor: (x) => prod(x.id)?.classificacao }, { titulo: 'Pelas receitas', valor: (x) => Math.round(x.receita * 1000) / 1000, num: true },
    { titulo: 'Avulsas', valor: (x) => Math.round(x.avulsa * 1000) / 1000, num: true }, { titulo: 'Total', valor: (x) => Math.round((x.receita + x.avulsa) * 1000) / 1000, num: true },
    { titulo: 'Unid.', valor: un }, { titulo: 'Custo', valor: (x) => Math.round(x.valor * 100) / 100, texto: (x) => moeda(x.valor), num: true }];
  const tV = linhas.reduce((s, x) => s + x.valor, 0);
  return html`
      ${barra(html`<${ExportarC} verCusto=${verCusto} titulo="Matéria-prima consumida na produção" filtros=${periodo} arquivo=${`consumo-producao-${de}-a-${ate}`} colunas=${cols} linhas=${linhas}
      totais=${['TOTAL', '', '', '', '', '', '', moeda(tV)]} />`)}
    <${TabelaC} verCusto=${verCusto} linhas=${linhas} vazio="Nenhum consumo neste período." colunas=${[
      { chave: 'cod', titulo: 'Código', valor: (x) => prod(x.id)?.codigo, render: (x) => prod(x.id)?.codigo }, { chave: 'p', titulo: 'Matéria-prima', valor: (x) => prod(x.id)?.descricao, render: (x) => html`<b>${prod(x.id)?.descricao}</b>`, classe: 'col-desc' }, { chave: 'classif', titulo: 'Classif.', valor: (x) => prod(x.id)?.classificacao || '', render: (x) => prod(x.id)?.classificacao || '–' },
      { chave: 'receita', titulo: 'Pelas receitas', num: true, render: (x) => qu(x.receita, un(x)) },
      { chave: 'avulsa', titulo: 'Avulsas', num: true, render: (x) => (x.avulsa ? qu(x.avulsa, un(x)) : '–') },
      { chave: 't', titulo: 'Total', num: true, valor: (x) => x.receita + x.avulsa, render: (x) => html`<b>${qu(x.receita + x.avulsa, un(x))}</b>` },
      { chave: 'valor', titulo: 'Custo', num: true, render: (x) => moeda(x.valor) },
    ]} />`;
}
