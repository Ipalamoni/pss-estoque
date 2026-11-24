// =====================================================================
// MANUTENÇÃO DE VEÍCULOS — Painel da frota · Apontar despesas · Placas a resolver ·
// Importar despesas · Tipos de manutenção
// Fonte: contas a pagar (contas Manutenção corretiva, Manutenção preventiva, Pneus).
// =====================================================================
import { html, useState, useApp, Cabecalho, Busca, Tabela, Cartao, Etiqueta, Carregando, Vazio, Abas,
  Filtros, MultiEscolha, casaVarios, Escolher, useAcao, avisar, confirmar } from '../ui.js';
import { moeda, data, dataHora, pl, num, contem, hojeISO, mensagemErro, nomeUsuario } from '../util.js';
import { Exportar } from '../exportar.js';
import { Icone } from '../icones.js';
import { ColunasEmpilhadas, BarrasH } from '../graficos.js';
import { useFrota, GRUPOS, MESES, placaBonita, nomeVeiculo, sugestoesPlaca, linhasDoPeriodo, serieMensal, somaLinhas, valorPela, USOS_VEICULO, CATEGORIAS_VEICULO } from '../frota-dados.js';
import { linhasFrota, decodificar, pareceTexto } from '../frota-csv.js';
import { Placa, SeletorBase, TagsLidas, EtqGrupo, ModalApontar, ModalApontarVarios, fmtK } from './frota-comum.js';
import { FormVeiculo } from './frota-veiculos.js';

const carregandoOuErro = (titulo, erro) => html`<${Cabecalho} titulo=${titulo} />${erro
  ? html`<${Vazio} texto=${`Não consegui carregar a frota: ${mensagemErro(erro)}`} />` : html`<${Carregando} />`}`;

// =====================================================================
// PAINEL DA FROTA
// =====================================================================
export function TelaFrotaPainel() {
  const { ir } = useApp();
  const { f, erro } = useFrota();
  const [ano, setAno] = useState(null);
  const [base, setBase] = useState('competencia');
  const [mes, setMes] = useState(null);
  const [cats, setCats] = useState([]); const [grupos, setGrupos] = useState([]); const [usos, setUsos] = useState(['empresa']);
  const [gerais, setGerais] = useState(true);
  if (!f) return carregandoOuErro('Painel da frota', erro);
  const anoV = ano || f.anos[0] || Number(hojeISO().slice(0, 4));
  const filtro = (l) => {
    const s = l.servico; const v = s?.veiculo;
    if (!casaVarios(grupos, l.grupo)) return false;
    if (!v) return gerais && !cats.length;                      // notas sem veículo (gerais/placa desconhecida)
    return casaVarios(cats, v.categoria) && casaVarios(usos, v.uso);
  };
  const linhasAno = linhasDoPeriodo(f, { ano: anoV, base, filtro });
  const linhas = mes === null ? linhasAno : linhasAno.filter((l) => Number(String(base === 'competencia' ? l.entrada : base === 'vencimento' ? l.vencimento : l.pagamento).slice(5, 7)) - 1 === mes);
  const serie = serieMensal(linhasAno, base);
  const totalAno = somaLinhas(linhasAno, base); const total = somaLinhas(linhas, base);
  const hoje = hojeISO(); const mesAtual = Number(hoje.slice(5, 7)) - 1; const anoAtual = Number(hoje.slice(0, 4));
  const totMes = (m) => GRUPOS.reduce((t, g) => t + serie[g.id][m], 0);
  const mesesComGasto = MESES.filter((_, i) => totMes(i) > 0).length;
  // por veículo
  const porVeic = new Map(); let geral = 0;
  for (const l of linhas) { const v = l.servico?.veiculo; const val = valorPela(base, l); if (v) porVeic.set(v.id, (porVeic.get(v.id) || 0) + val); else geral += val; }
  const ranking = [...porVeic].sort((a, b) => b[1] - a[1]);
  const porGrupo = Object.fromEntries(GRUPOS.map((g) => [g.id, linhas.filter((l) => l.grupo === g.id).reduce((t, l) => t + valorPela(base, l), 0)]));
  // tipos de manutenção: valor das linhas cujas notas têm a etiqueta
  const porTag = new Map(); let semTag = 0;
  for (const l of linhas) { const tg = l.servico?.tags || []; const val = valorPela(base, l); if (!tg.length) semTag += val; tg.forEach((t) => porTag.set(t, (porTag.get(t) || 0) + val)); }
  const pend = f.servicos.filter((s) => !s.apontado);
  const placasPend = new Set(f.servicos.filter((s) => s.desconhecida).map((s) => s.placa_arquivo));
  const veicAtivos = f.veiculos.filter((v) => v.situacao !== 'vendido' && casaVarios(cats, v.categoria) && casaVarios(usos, v.uso)).length;
  const rotMes = mes === null ? `${anoV}` : `${MESES[mes]}/${anoV}`;
  const ultImp = f.importacoes[0];
  const cats2 = [...new Set([...CATEGORIAS_VEICULO, ...f.veiculos.map((v) => v.categoria)])].filter((c) => f.veiculos.some((v) => v.categoria === c));
  const abrir = (vid) => ir('frota-veiculos', { abrir: vid });

  // mapa de calor (veículo × mês)
  const calor = (() => {
    const m = new Map();
    for (const l of linhasAno) {
      const v = l.servico?.veiculo; if (!v) continue;
      const k = Number(String(base === 'competencia' ? l.entrada : base === 'vencimento' ? l.vencimento : l.pagamento).slice(5, 7)) - 1;
      if (!m.has(v.id)) m.set(v.id, { v, meses: Array(12).fill(0), total: 0 });
      const x = m.get(v.id); x.meses[k] += valorPela(base, l); x.total += valorPela(base, l);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  })();
  const maxCel = Math.max(1, ...calor.flatMap((x) => x.meses));
  const nivel = (v) => (v <= 0 ? 0 : Math.min(5, Math.ceil((v / maxCel) * 5)));

  const exp = [{ titulo: 'Placa', valor: (x) => placaBonita(x.v.placa) }, { titulo: 'Veículo', valor: (x) => nomeVeiculo(x.v), largura: 26 }, { titulo: 'Categoria', valor: (x) => x.v.categoria },
    ...MESES.map((m, i) => ({ titulo: m, valor: (x) => Math.round(x.meses[i] * 100) / 100, texto: (x) => (x.meses[i] ? moeda(x.meses[i]) : ''), num: true })),
    { titulo: 'Total', valor: (x) => Math.round(x.total * 100) / 100, texto: (x) => moeda(x.total), num: true }];
  return html`
    <${Cabecalho} titulo="Painel da frota" sub=${`Manutenção de veículos (contas a pagar: corretiva, preventiva e pneus)${ultImp ? ` · dados de ${dataHora(ultImp.criado_em)}` : ''}`} />
    ${!f.lancamentos.length ? html`<div class="aviso-faixa"><span>Ainda não há despesas. Importe o arquivo do contas a pagar para começar.</span>
      <button class="btn btn-destaque btn-peq" onClick=${() => ir('frota-importar')}>Importar despesas</button></div>` : ''}
    ${pend.length > 0 && html`<div class="aviso-faixa"><span>📝 <b>${pl(pend.length, 'nota esperando', 'notas esperando')}</b> o tipo de manutenção.</span>
      <button class="btn btn-destaque btn-peq" onClick=${() => ir('frota-apontar')}>Apontar agora</button></div>`}
    ${placasPend.size > 0 && html`<div class="aviso-faixa"><span>⚠ <b>${pl(placasPend.size, 'placa', 'placas')}</b> nas despesas sem cadastro (veículo novo ou placa digitada errada).</span>
      <button class="btn btn-destaque btn-peq" onClick=${() => ir('frota-placas')}>Resolver placas</button></div>`}
    <${Filtros} ativos=${[cats.length, grupos.length, usos.join() !== 'empresa', !gerais].filter(Boolean).length}
      acoes=${html`<${Exportar} titulo=${`Gasto por veículo e mês · ${anoV}`} filtros=${`${BASE_TXT[base]}`} arquivo=${`frota-veiculo-mes-${anoV}`} colunas=${exp} linhas=${calor} />`}>
      <label class="campo-inline">Ano <select class="entrada" value=${anoV} onChange=${(e) => { setAno(Number(e.target.value)); setMes(null); }}>
        ${(f.anos.length ? f.anos : [anoV]).map((a) => html`<option value=${a}>${a}</option>`)}</select></label>
      <${SeletorBase} base=${base} aoMudar=${setBase} />
      <${MultiEscolha} todos="Todas as contas" rotulo="Contas" valor=${grupos} aoMudar=${setGrupos} opcoes=${GRUPOS.map((g) => ({ valor: g.id, rotulo: g.rotulo }))} />
      <${MultiEscolha} todos="Todas as categorias" rotulo="Categorias" valor=${cats} aoMudar=${setCats} opcoes=${cats2.map((c) => ({ valor: c, rotulo: c }))} />
      <${MultiEscolha} todos="Empresa e particulares" rotulo="Uso" valor=${usos} aoMudar=${setUsos} opcoes=${Object.entries(USOS_VEICULO).map(([k, t]) => ({ valor: k, rotulo: t }))} />
      <label class="check"><input type="checkbox" checked=${gerais} onChange=${(e) => setGerais(e.target.checked)} /> incluir despesas gerais</label>
    </${Filtros}>
    <div class="cartoes">
      <${Cartao} titulo=${`Gasto em ${anoV}`} valor=${moeda(totalAno)} sub=${`média ${moeda(mesesComGasto ? totalAno / mesesComGasto : 0)} por mês`} />
      ${anoV === anoAtual && html`<${Cartao} titulo=${`${MESES[mesAtual]}/${anoV}`} valor=${moeda(totMes(mesAtual))}
        variacao=${mesAtual > 0 && totMes(mesAtual - 1) > 0 ? varTxt(totMes(mesAtual), totMes(mesAtual - 1)) : null} aoClicar=${() => setMes(mesAtual)} />`}
      <${Cartao} titulo="Média por veículo" valor=${moeda(porVeic.size ? (total - geral) / porVeic.size : 0)} sub=${`${porVeic.size} com gasto de ${veicAtivos} na frota · ${rotMes}`} />
      ${GRUPOS.map((g) => html`<${Cartao} key=${g.id} titulo=${g.rotulo} valor=${moeda(porGrupo[g.id])} sub=${total > 0 ? `${num((porGrupo[g.id] / total) * 100, 0)}% · ${rotMes}` : rotMes}
        cor=${grupos.length === 1 && grupos[0] === g.id ? 'c-ativo' : ''} aoClicar=${() => setGrupos(grupos.length === 1 && grupos[0] === g.id ? [] : [g.id])} />`)}
      ${gerais && html`<${Cartao} titulo="Despesas gerais" valor=${moeda(geral)} sub="sem veículo ou placa a resolver" />`}
    </div>
    <section class="painel"><div class="painel-topo"><h2>Gasto mês a mês · ${anoV}</h2>
      ${mes !== null && html`<button class="chip ativo" onClick=${() => setMes(null)} aria-label="Ver o ano todo">${MESES[mes]}/${anoV} ✕</button>`}</div>
      <${ColunasEmpilhadas} categorias=${MESES} series=${GRUPOS.filter((g) => casaVarios(grupos, g.id)).map((g) => ({ nome: g.rotulo, cor: g.cor, valores: serie[g.id] }))}
        formatar=${moeda} formatarEixo=${fmtK} aoClicar=${(i) => setMes(mes === i ? null : i)} selecionada=${mes} />
      <p class="nota">${BASE_AJUDA[base]} Toque num mês para ver o ranking e os tipos daquele mês.</p></section>
    <div class="duas-colunas">
      <section class="painel"><h2>Veículos que mais gastaram · ${rotMes}</h2>
        <${BarrasH} itens=${ranking.slice(0, 12).map(([id, val]) => { const v = f.mapa.veiculo.get(id); return { id, rotulo: placaBonita(v.placa), sub: nomeVeiculo(v), valor: val, texto: moeda(val) }; })}
          aoClicar=${(i) => abrir(i.id)} vazio="Sem gastos de veículos neste período." />
        ${ranking.length > 12 && html`<p class="nota">Mostrando 12 de ${ranking.length}. A tabela abaixo tem todos.</p>`}</section>
      <section class="painel"><h2>Tipos de manutenção · ${rotMes}</h2>
        <${BarrasH} itens=${[...porTag].sort((a, b) => b[1] - a[1]).map(([t, val]) => ({ rotulo: f.mapa.tag.get(t)?.nome || '?', valor: val, texto: moeda(val) }))}
          vazio="Nenhuma nota apontada neste período." cor="var(--fr-preventiva)" />
        ${semTag > 0 && html`<p class="nota">${moeda(semTag)} ainda sem tipo de manutenção. <button class="btn-link" onClick=${() => ir('frota-apontar')}>Apontar</button></p>`}
        <p class="nota">Uma nota com 2 tipos conta nos dois.</p></section>
    </div>
    <section class="painel"><div class="painel-topo"><h2>Gasto por veículo e mês · ${anoV}</h2><span class="nota">quanto mais escuro, maior o gasto</span></div>
      ${!calor.length ? html`<${Vazio} texto="Sem gastos de veículos neste ano." />` : html`<div class="tabela-rolagem"><table class="tabela calor">
        <thead><tr><th scope="col">Veículo</th>${MESES.map((m, i) => html`<th scope="col" class=${'n' + (mes === i ? ' col-sel' : '')}>${m}</th>`)}<th scope="col" class="n">Total</th></tr></thead>
        <tbody>${calor.map((x) => html`<tr key=${x.v.id} class="clicavel" tabindex="0" onClick=${() => abrir(x.v.id)} onKeyDown=${(e) => { if (e.key === 'Enter') abrir(x.v.id); }}>
          <td data-rotulo="Veículo"><${Placa} placa=${x.v.placa} /> <small>${x.v.modelo || ''}</small></td>
          ${x.meses.map((val, i) => html`<td class=${`n calor-${nivel(val)}`} data-rotulo=${MESES[i]} title=${val ? `${placaBonita(x.v.placa)} · ${MESES[i]}: ${moeda(val)}` : ''}>${val ? fmtK(val) : ''}</td>`)}
          <td class="n" data-rotulo="Total"><b>${moeda(x.total)}</b></td></tr>`)}</tbody></table></div>`}
    </section>`;
}
const BASE_TXT = { competencia: 'por competência (data de entrada da nota)', vencimento: 'por vencimento das parcelas', pagamento: 'pelo que foi pago' };
const BASE_AJUDA = { competencia: 'Competência: o valor total da nota no mês da data de entrada (mesmo parcelado).', vencimento: 'Vencimento: cada parcela no mês em que vence.',
  pagamento: 'Pagamento: cada parcela no mês em que foi paga (com juros/descontos).' };
const varTxt = (a, b) => { const p = ((a - b) / b) * 100; return { texto: `${p >= 0 ? '▲' : '▼'} ${num(Math.abs(p), 0)}% vs. mês anterior`, tom: p > 5 ? 'ruim' : p < -5 ? 'bom' : 'neutro' }; };

// =====================================================================
// APONTAR DESPESAS (caixa de entrada do responsável)
// =====================================================================
export function TelaFrotaApontar() {
  const { f, erro } = useFrota();
  const [aba, setAba] = useState('pendentes');
  const [busca, setBusca] = useState('');
  const [veics, setVeics] = useState([]); const [grupos, setGrupos] = useState([]);
  const [varios, setVarios] = useState(false); const [marcados, setMarcados] = useState(new Set());
  const [apontar, setApontar] = useState(null); const [emLote, setEmLote] = useState(null);
  const [max, setMax] = useState(60);
  if (!f) return carregandoOuErro('Apontar despesas', erro);
  const pend = f.servicos.filter((s) => !s.apontado);
  const base = aba === 'pendentes' ? pend : f.servicos.filter((s) => s.apontado);
  const lista = base.filter((s) => casaVarios(veics, s.veiculoId || (s.geral ? 'geral' : 'desconhecida')) && s.grupos.some((g) => casaVarios(grupos, g))
    && contem(`${s.veiculo?.placa || s.placa_arquivo} ${placaBonita(s.veiculo?.placa || s.placa_arquivo)} ${nomeVeiculo(s.veiculo)} ${s.fornecedor} ${s.titulo} ${s.obsFinanceiro} ${s.observacao || ''}`, busca))
    .sort((a, b) => (aba === 'pendentes' ? String(b.entrada).localeCompare(String(a.entrada)) : String(b.apontado_em).localeCompare(String(a.apontado_em))));
  const opVeic = [{ valor: 'geral', rotulo: 'Geral da frota (sem veículo)' }, { valor: 'desconhecida', rotulo: 'Placa não cadastrada' },
    ...f.veiculos.map((v) => ({ valor: v.id, rotulo: `${placaBonita(v.placa)} · ${nomeVeiculo(v)}` }))];
  const alternar = (id) => setMarcados((m) => { const n = new Set(m); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sel = lista.filter((s) => marcados.has(s.id));
  const mostrar = lista.slice(0, max);
  return html`
    <${Cabecalho} titulo="Apontar despesas" sub="Cada nota de manutenção que chega do financeiro precisa do tipo de manutenção (pelo menos um). Observação e km são opcionais." />
    <${Abas} abas=${[{ id: 'pendentes', titulo: `Para apontar (${pend.length})` }, { id: 'feitas', titulo: 'Já apontadas' }]} ativa=${aba} aoMudar=${(a) => { setAba(a); setMarcados(new Set()); setMax(60); }} />
    <${Filtros} ativos=${[veics.length, grupos.length].filter(Boolean).length} fixo=${html`<${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Placa, fornecedor, nº da nota ou observação" />`}
      acoes=${html`<span class="nota">${pl(lista.length, 'nota', 'notas')} · ${moeda(lista.reduce((t, s) => t + s.total, 0))}</span>
        ${aba === 'pendentes' && lista.length > 0 && html`<button class="btn btn-pri btn-peq" onClick=${() => setApontar({ fila: lista, i: 0 })}>Apontar em sequência</button>`}
        <button class=${'btn btn-sec btn-peq' + (varios ? ' ativo' : '')} aria-pressed=${varios} onClick=${() => { setVarios(!varios); setMarcados(new Set()); }}>${varios ? 'Cancelar seleção' : 'Selecionar várias'}</button>`}>
      <${MultiEscolha} todos="Todos os veículos" rotulo="Veículos" valor=${veics} aoMudar=${setVeics} opcoes=${opVeic} />
      <${MultiEscolha} todos="Todas as contas" rotulo="Contas" valor=${grupos} aoMudar=${setGrupos} opcoes=${GRUPOS.map((g) => ({ valor: g.id, rotulo: g.rotulo }))} />
    </${Filtros}>
    ${varios && html`<div class="barra-lote" role="region" aria-label="Notas selecionadas">
      <label class="check"><input type="checkbox" checked=${sel.length === mostrar.length && mostrar.length > 0} onChange=${(e) => setMarcados(e.target.checked ? new Set(mostrar.map((s) => s.id)) : new Set())} /> marcar as ${mostrar.length} da tela</label>
      <span><b>${pl(sel.length, 'nota selecionada', 'notas selecionadas')}</b> · ${moeda(sel.reduce((t, s) => t + s.total, 0))}</span>
      <button class="btn btn-pri" disabled=${!sel.length} onClick=${() => setEmLote(sel)}>Apontar selecionadas</button></div>`}
    ${!lista.length ? html`<${Vazio} texto=${aba === 'pendentes' ? (pend.length ? 'Nenhuma nota com estes filtros.' : '✓ Tudo apontado. Quando chegarem notas novas, elas aparecem aqui.') : 'Nenhuma nota apontada ainda.'} />`
      : html`<ul class="lista-notas">${mostrar.map((s) => html`<li key=${s.id} class=${'nota-item' + (marcados.has(s.id) ? ' marcada' : '')}>
        ${varios && html`<input type="checkbox" class="nota-check" aria-label=${`Selecionar nota ${s.titulo}`} checked=${marcados.has(s.id)} onChange=${() => alternar(s.id)} />`}
        <button type="button" class="nota-corpo" onClick=${() => (varios ? alternar(s.id) : setApontar({ fila: aba === 'pendentes' ? lista : [s], i: aba === 'pendentes' ? lista.indexOf(s) : 0 }))}>
          <span class="nota-placa"><${Placa} s=${s} /><small>${s.veiculo ? nomeVeiculo(s.veiculo) : ''}</small></span>
          <span class="nota-meio"><b>${s.fornecedor}</b><small>${data(s.entrada)} · ${pl(s.parcelas, 'parcela', 'parcelas')} · título ${s.titulo}</small>
            <span>${s.grupos.map((g) => html`<${EtqGrupo} grupo=${g} /> `)}${s.apontado ? html`<${TagsLidas} ids=${s.tags} f=${f} />` : ''}</span>
            ${s.obsFinanceiro && html`<small class="nota-obs">“${s.obsFinanceiro}”</small>`}</span>
          <span class="nota-valor"><b>${moeda(s.total)}</b><small>${s.apontado ? `apontada ${s.apontado_em ? dataHora(s.apontado_em) : ''}` : 'apontar ›'}</small></span>
        </button></li>`)}</ul>
        ${lista.length > max && html`<button class="btn btn-sec btn-bloco" onClick=${() => setMax(max + 60)}>Mostrar mais (${lista.length - max} restantes)</button>`}`}
    ${apontar && html`<${ModalApontar} f=${f} fila=${apontar.fila} inicio=${apontar.i} aoFechar=${() => setApontar(null)} />`}
    ${emLote && html`<${ModalApontarVarios} f=${f} servicos=${emLote} aoFechar=${(ok) => { setEmLote(null); if (ok) { setMarcados(new Set()); setVarios(false); } }} />`}`;
}

// =====================================================================
// PLACAS A RESOLVER: placa das despesas que não está no cadastro
// =====================================================================
export function TelaFrotaPlacas() {
  const { api, dados } = useApp();
  const { f, erro } = useFrota();
  const [cadastrar, setCadastrar] = useState(null);
  const [escolha, setEscolha] = useState({});
  const [ocupado, executar] = useAcao();
  if (!f) return carregandoOuErro('Placas a resolver', erro);
  const porPlaca = new Map();
  for (const s of f.servicos.filter((x) => x.desconhecida)) {
    if (!porPlaca.has(s.placa_arquivo)) porPlaca.set(s.placa_arquivo, { placa: s.placa_arquivo, notas: [], total: 0 });
    const p = porPlaca.get(s.placa_arquivo); p.notas.push(s); p.total += s.total;
  }
  const lista = [...porPlaca.values()].sort((a, b) => b.total - a.total).map((p) => ({ ...p, sugestoes: sugestoesPlaca(p.placa, f.veiculos) }));
  const corrigir = async (placa, vid) => {
    const v = f.mapa.veiculo.get(vid);
    await executar(() => api.rpc('frota_corrigir_placa', { p_placa: placa, p_veiculo_id: vid }), `${placaBonita(placa)} agora é ${placaBonita(v.placa)}: as notas foram ligadas ao veículo.`);
  };
  const correcoes = f.apelidos.map((a) => ({ ...a, v: f.mapa.veiculo.get(a.veiculo_id) }));
  const expCorr = [{ titulo: 'Placa digitada no financeiro', valor: (a) => placaBonita(a.placa) }, { titulo: 'Placa certa', valor: (a) => placaBonita(a.v?.placa) },
    { titulo: 'Veículo', valor: (a) => nomeVeiculo(a.v), largura: 28 }, { titulo: 'Corrigido em', valor: (a) => dataHora(a.criado_em) }];
  return html`
    <${Cabecalho} titulo="Placas a resolver" sub="Placas que apareceram nas despesas e não estão no cadastro. Pode ser veículo novo ou erro de digitação no contas a pagar." />
    ${!lista.length ? html`<${Vazio} texto="✓ Nenhuma placa para resolver. Todas as despesas estão ligadas a um veículo (ou são despesas gerais)." />`
      : html`<p class="nota">${pl(lista.length, 'placa', 'placas')} · ${pl(lista.reduce((t, p) => t + p.notas.length, 0), 'nota', 'notas')} · ${moeda(lista.reduce((t, p) => t + p.total, 0))}.
        Ao corrigir, o sistema lembra para sempre: as próximas notas com a mesma placa errada já entram no veículo certo.</p>
      <div class="placas-grade">${lista.map((p) => html`<article class="placa-card" key=${p.placa}>
        <div class="pc-topo"><${Placa} placa=${p.placa} grande /><div><b>${moeda(p.total)}</b><small>${pl(p.notas.length, 'nota', 'notas')} · ${[...new Set(p.notas.map((s) => s.fornecedor))].slice(0, 2).join(', ')}</small></div></div>
        ${p.notas[0].obsFinanceiro && html`<p class="pc-obs">“${p.notas[0].obsFinanceiro}”</p>`}
        ${p.sugestoes.map((v) => html`<div class="pc-sugestao" key=${v.id}><span>Parecida com <${Placa} placa=${v.placa} /> <small>${nomeVeiculo(v)}</small>. É essa?</span>
          <button class="btn btn-pri" disabled=${ocupado} onClick=${() => corrigir(p.placa, v.id)}>Sim, é ${placaBonita(v.placa)}</button></div>`)}
        <div class="pc-outra"><${Escolher} itens=${f.veiculos} valor=${escolha[p.placa] || null} aoMudar=${(id) => setEscolha({ ...escolha, [p.placa]: id })}
            rotuloDe=${(v) => `${placaBonita(v.placa)} · ${nomeVeiculo(v)}`} placeholder=${p.sugestoes.length ? 'Não: é outra placa do cadastro…' : 'É uma placa do cadastro? Digite…'} />
          <button class="btn btn-sec" disabled=${ocupado || !escolha[p.placa]} onClick=${() => corrigir(p.placa, escolha[p.placa])}>Corrigir</button></div>
        <button class="btn btn-sec btn-bloco" onClick=${() => setCadastrar({ placa: p.placa })}><${Icone} nome="mais" tam=${16} /> É um veículo novo: cadastrar ${placaBonita(p.placa)}</button>
      </article>`)}</div>`}
    <section class="painel"><div class="painel-topo"><h2>Correções já feitas (${correcoes.length})</h2>
      <${Exportar} tabela="frota.correcoes" titulo="Placas digitadas erradas no contas a pagar" filtros="para corrigir na origem" arquivo="placas-erradas-contas-a-pagar" colunas=${expCorr} linhas=${correcoes} /></div>
      <p class="nota">Mande esta lista para o contas a pagar corrigir as placas na origem. Aqui no sistema elas já estão resolvidas.</p>
      <${Tabela} id="frota.correcoes" linhas=${correcoes} chave="placa" ordemInicial=${{ chave: 'placa', dir: 1 }} vazio="Nenhuma correção ainda." colunas=${[
        { chave: 'placa', titulo: 'Digitada no financeiro', render: (a) => html`<${Placa} placa=${a.placa} />` },
        { chave: 'certa', titulo: 'Placa certa', valor: (a) => a.v?.placa, render: (a) => html`<${Placa} placa=${a.v?.placa} />` },
        { chave: 'veic', titulo: 'Veículo', valor: (a) => nomeVeiculo(a.v), render: (a) => nomeVeiculo(a.v) },
        { chave: 'quem', titulo: 'Quem corrigiu', valor: (a) => a.criado_por, render: (a) => (a.criado_por ? nomeUsuario(dados.mapa.perfil.get(a.criado_por)) : 'carga inicial') },
        { chave: 'criado_em', titulo: 'Quando', render: (a) => dataHora(a.criado_em) }]} />
    </section>
    ${cadastrar && html`<${FormVeiculo} f=${f} veiculo=${cadastrar} aoFechar=${() => setCadastrar(null)} />`}`;
}

// =====================================================================
// IMPORTAR DESPESAS (CSV do contas a pagar, ano inteiro) — prévia antes de gravar
// =====================================================================
export function TelaFrotaImportar() {
  const { api, ir, dados } = useApp();
  const { f, erro } = useFrota();
  const [arq, setArq] = useState(null);      // { nome, lido, previa }
  const [lendo, setLendo] = useState(false);
  const [feito, setFeito] = useState(null);
  const [ocupado, executar] = useAcao();
  if (!f) return carregandoOuErro('Importar despesas', erro);
  async function escolher(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setFeito(null); setArq(null);
    if (file.size > 40 * 1024 * 1024) { avisar('Arquivo grande demais (máximo 40 MB).', 'erro'); return; }
    setLendo(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!pareceTexto(bytes)) throw new Error('Este arquivo não é um CSV (texto). Exporte a consulta "Contas a pagar - despesa" em CSV e tente de novo.');
      const lido = linhasFrota(decodificar(bytes));
      if (lido.faltando.length) throw new Error(`O arquivo não tem as colunas esperadas (faltando: ${lido.faltando.join(', ')}). Confira se é a consulta "Contas a pagar - despesa".`);
      if (!lido.linhas.length) throw new Error('Nenhuma linha de manutenção de veículos no arquivo (contas: Manutenção corretiva, Manutenção preventiva, Pneus).');
      const previa = await api.rpc('frota_importar', { p: { arquivo: file.name, simular: true, linhas: lido.linhas } });
      setArq({ nome: file.name, lido, previa });
    } catch (x) { avisar(mensagemErro(x), 'erro'); } finally { setLendo(false); }
  }
  async function confirmarImportacao() {
    const r = await executar(() => api.rpc('frota_importar', { p: { arquivo: arq.nome, simular: false, linhas: arq.lido.linhas } }), 'Despesas importadas.');
    if (r) { setFeito(r); setArq(null); }
  }
  const pv = arq?.previa;
  return html`
    <${Cabecalho} titulo="Importar despesas" sub="Arquivo do contas a pagar (consulta “Contas a pagar - despesa”, em CSV) com o ANO INTEIRO, de 1º de janeiro em diante." />
    <section class="painel importar-caixa">
      <h2>1. Escolha o arquivo</h2>
      <p>O sistema pega só as contas <b>Manutenção corretiva</b>, <b>Manutenção preventiva</b> e <b>Pneus - compra e manutenção</b>. Nada é gravado antes de você conferir a prévia.</p>
      <label class=${'btn btn-pri btn-arquivo' + (lendo ? ' desab' : '')}><${Icone} nome="frota-importar" tam=${20} /> ${lendo ? 'Lendo o arquivo…' : 'Escolher o arquivo CSV'}
        <input type="file" accept=".csv,text/csv,text/plain" class="so-leitor" disabled=${lendo} onChange=${escolher} /></label>
      <p class="nota">Pode importar quantas vezes quiser: entra só o que é novo, atualiza o que mudou (pagamentos, valores, datas) e tira o que foi apagado no financeiro.
        <b>Os apontamentos (tipos, observações, km) e as correções de placa nunca se perdem.</b></p>
    </section>
    ${pv && html`<section class="painel importar-previa" aria-live="polite">
      <h2>2. Confira antes de gravar</h2>
      <p><b>${arq.nome}</b> · ${pl(arq.lido.total, 'linha', 'linhas')} no arquivo · <b>${pl(pv.linhas, 'linha', 'linhas')} de manutenção de veículos</b>
        (${data(pv.desde)} a ${data(pv.ate)}) · ${moeda(pv.valor_total)}${arq.lido.reprovadas ? ` · ${arq.lido.reprovadas} reprovadas ignoradas` : ''}</p>
      <div class="cartoes">
        <${Cartao} titulo="Linhas novas" valor=${pv.novas} sub=${pl(pv.notas_novas, 'nota nova para apontar', 'notas novas para apontar')} cor=${pv.novas ? 'c-azul' : ''} />
        <${Cartao} titulo="Linhas alteradas" valor=${pv.alteradas} sub="pagamento, valor, data ou placa" />
        <${Cartao} titulo="Linhas que saem" valor=${pv.removidas} sub="apagadas no financeiro" cor=${pv.removidas ? 'c-laranja' : ''} />
        <${Cartao} titulo="Placas sem cadastro" valor=${pv.placas_desconhecidas.length} sub=${pv.placas_desconhecidas.slice(0, 3).map((p) => placaBonita(p.placa)).join(', ')} cor=${pv.placas_desconhecidas.length ? 'c-laranja' : ''} />
      </div>
      ${pv.novas + pv.alteradas + pv.removidas === 0 && html`<p class="nota">Nada mudou desde a última importação.</p>`}
      <div class="botoes-direita"><button class="btn btn-sec" onClick=${() => setArq(null)}>Cancelar</button>
        <button class="btn btn-pri" disabled=${ocupado || pv.novas + pv.alteradas + pv.removidas === 0} onClick=${confirmarImportacao}>${ocupado ? 'Gravando…' : 'Confirmar importação'}</button></div>
    </section>`}
    ${feito && html`<section class="painel importar-ok" role="status">
      <h2>✓ Importação concluída</h2>
      <p>${pl(feito.novas, 'linha nova', 'linhas novas')} · ${pl(feito.alteradas, 'alterada', 'alteradas')} · ${pl(feito.removidas, 'removida', 'removidas')}.</p>
      <div class="botoes-direita">
        ${feito.placas_desconhecidas.length > 0 && html`<button class="btn btn-sec" onClick=${() => ir('frota-placas')}>Resolver ${pl(feito.placas_desconhecidas.length, 'placa', 'placas')}</button>`}
        <button class="btn btn-pri" onClick=${() => ir('frota-apontar')}>Apontar notas novas</button></div>
    </section>`}
    <section class="painel"><h2>Importações anteriores</h2>
      <${Tabela} linhas=${f.importacoes} max=${30} vazio="Nenhuma importação ainda." colunas=${[
        { chave: 'criado_em', titulo: 'Quando', render: (x) => dataHora(x.criado_em) },
        { chave: 'quem', titulo: 'Quem', valor: (x) => x.criado_por, render: (x) => (x.criado_por ? nomeUsuario(dados.mapa.perfil.get(x.criado_por)) : 'carga inicial') },
        { chave: 'arquivo', titulo: 'Arquivo', render: (x) => html`<small>${x.origem === 'banco' ? 'banco da empresa' : x.arquivo}</small>` },
        { chave: 'linhas', titulo: 'Linhas', num: true }, { chave: 'novas', titulo: 'Novas', num: true }, { chave: 'alteradas', titulo: 'Alteradas', num: true },
        { chave: 'removidas', titulo: 'Removidas', num: true }]} />
      <p class="nota">Próximo passo: a consulta direto no banco da empresa (Firebird), a cada hora, vai usar esta mesma importação.</p>
    </section>`;
}

// =====================================================================
// TIPOS DE MANUTENÇÃO (etiquetas)
// =====================================================================
export function TelaFrotaTipos() {
  const { api } = useApp();
  const { f, erro } = useFrota();
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState(null);
  const [ocupado, executar] = useAcao();
  if (!f) return carregandoOuErro('Tipos de manutenção', erro);
  const uso = new Map(); f.servicos.forEach((s) => (s.tags || []).forEach((t) => uso.set(t, (uso.get(t) || 0) + 1)));
  const salvar = async (p, msg) => { const ok = await executar(() => api.rpc('frota_salvar_tag', { p }), msg); if (ok) { setNovo(''); setEditando(null); } };
  const desativar = async (t) => {
    if (t.ativo && !(await confirmar({ titulo: 'Desativar tipo', ok: 'Desativar', mensagem: `"${t.nome}" deixa de aparecer para escolher. As notas já apontadas com ele continuam como estão.` }))) return;
    salvar({ id: t.id, nome: t.nome, ativo: !t.ativo }, t.ativo ? 'Tipo desativado.' : 'Tipo reativado.');
  };
  return html`
    <${Cabecalho} titulo="Tipos de manutenção" sub="As etiquetas que o responsável marca em cada nota (pode marcar várias). Desative em vez de apagar: o histórico continua." />
    <div class="filtros"><input class="entrada" value=${novo} maxlength="40" placeholder="Novo tipo (ex.: Tacógrafo)" aria-label="Nome do novo tipo de manutenção"
      onInput=${(e) => setNovo(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && novo.trim().length >= 2) salvar({ nome: novo }, 'Tipo criado.'); }} />
      <button class="btn btn-pri" disabled=${ocupado || novo.trim().length < 2} onClick=${() => salvar({ nome: novo }, 'Tipo criado.')}><${Icone} nome="mais" tam=${16} /> Adicionar tipo</button></div>
    <${Tabela} linhas=${f.tags} colunas=${[
      { chave: 'nome', titulo: 'Tipo', render: (t) => (editando?.id === t.id ? html`<span class="edita-inline"><input class="entrada" value=${editando.nome} maxlength="40" aria-label="Novo nome" autoFocus
          onInput=${(e) => setEditando({ ...editando, nome: e.target.value })} onKeyDown=${(e) => { if (e.key === 'Enter') salvar({ id: t.id, nome: editando.nome }, 'Tipo renomeado.'); }} />
          <button class="btn btn-pri btn-peq" disabled=${ocupado} onClick=${() => salvar({ id: t.id, nome: editando.nome }, 'Tipo renomeado.')}>Salvar</button></span>`
        : html`<b>${t.nome}</b>`) },
      { chave: 'uso', titulo: 'Notas com este tipo', num: true, valor: (t) => uso.get(t.id) || 0, render: (t) => uso.get(t.id) || '–' },
      { chave: 'ativo', titulo: 'Situação', render: (t) => html`<${Etiqueta} cor=${t.ativo ? 'verde' : 'cinza'}>${t.ativo ? 'Ativo' : 'Desativado'}</${Etiqueta}>` },
      { chave: 'acao', titulo: '', ordenar: false, render: (t) => html`<span class="acoes-linha">
        <button class="btn btn-sec btn-peq" onClick=${() => setEditando({ id: t.id, nome: t.nome })}>Renomear</button>
        <button class="btn btn-sec btn-peq" disabled=${ocupado} onClick=${() => desativar(t)}>${t.ativo ? 'Desativar' : 'Reativar'}</button></span>` },
    ]} />`;
}
