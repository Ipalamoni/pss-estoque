// =====================================================================
// MANUTENÇÃO DE VEÍCULOS — VEÍCULOS: lista, cadastro (placa primeiro + "copiar de outro veículo")
// e FICHA do veículo (raio-x: gasto mês a mês, tipos de manutenção, linha do tempo, alertas)
// =====================================================================
import { html, useState, useMemo, useEffect, useApp, Cabecalho, Modal, Campo, Numero, Escolher, Busca, Tabela, Cartao, Etiqueta, Carregando,
  Filtros, MultiEscolha, casaVarios, useAcao, Vazio } from '../ui.js';
import { data, pl, num, contem, hojeISO, diasEntre } from '../util.js';
import { Exportar } from '../exportar.js';
import { Icone } from '../icones.js';
import { ColunasEmpilhadas, BarrasH } from '../graficos.js';
import { useFrota, GRUPOS, CATEGORIAS_VEICULO, SITUACOES_VEICULO, USOS_VEICULO, MESES, PLACA_OK, limparPlaca, placaBonita, nomeVeiculo,
  linhasDoPeriodo, serieMensal, somaLinhas, moeda } from '../frota-dados.js';
import { Placa, SeletorBase, TagsLidas, ModalApontar, AvisosLinha, TextoComPlaca, fmtK } from './frota-comum.js';

const COR_SIT = { ativo: 'verde', parado: 'laranja', vendido: 'cinza' };

export function TelaFrotaVeiculos() {
  const { estadoRota, setEstadoRota, voltar } = useApp();
  const { f, erro } = useFrota();
  const [abrir, setAbrir] = useState(estadoRota?.abrir || null);
  // veio de outra tela direto para a ficha (ex.: ranking do Painel): o "voltar" retorna para lá, não para a lista
  const [veioDeFora] = useState(!!estadoRota?.abrir);
  const [editando, setEditando] = useState(estadoRota?.novo ? { placa: estadoRota.novo } : null);
  const [busca, setBusca] = useState('');
  const [cat, setCat] = useState([]); const [sit, setSit] = useState(['ativo', 'parado']); const [uso, setUso] = useState([]);
  useEffect(() => { if (estadoRota) setEstadoRota(null); }, []);
  if (erro) return html`<${Cabecalho} titulo="Veículos" /><${Vazio} texto="Não consegui carregar a frota. Confira a internet e tente de novo." />`;
  if (!f) return html`<${Cabecalho} titulo="Veículos" /><${Carregando} />`;
  const v = abrir && f.mapa.veiculo.get(abrir);
  if (v) return html`<${FichaVeiculo} f=${f} v=${v} aoVoltar=${veioDeFora ? voltar : () => setAbrir(null)} aoEditar=${() => setEditando(v)} />
    ${editando && html`<${FormVeiculo} f=${f} veiculo=${editando} aoFechar=${() => setEditando(null)} />`}`;

  const ano = f.anos[0] || Number(hojeISO().slice(0, 4));
  const gastoAno = new Map(); const ultima = new Map(); const notas = new Map();
  for (const s of f.servicos) for (const pt of s.partes) {
    const vid = pt.veiculoId; if (!vid || pt.valor <= 0) continue;
    if (String(s.entrada).startsWith(`${ano}-`)) { gastoAno.set(vid, (gastoAno.get(vid) || 0) + pt.valor); notas.set(vid, (notas.get(vid) || 0) + 1); }
    if (!ultima.get(vid) || s.entrada > ultima.get(vid)) ultima.set(vid, s.entrada);
  }
  const linhas = f.veiculos.filter((x) => casaVarios(cat, x.categoria) && casaVarios(sit, x.situacao) && casaVarios(uso, x.uso)
    && contem(`${x.placa} ${placaBonita(x.placa)} ${x.marca || ''} ${x.modelo || ''} ${x.responsavel || ''}`, busca))
    .map((x) => ({ ...x, gasto: gastoAno.get(x.id) || 0, ultima: ultima.get(x.id) || null, notas: notas.get(x.id) || 0 }));
  const cats = [...new Set([...CATEGORIAS_VEICULO, ...f.veiculos.map((x) => x.categoria)])];
  const colunas = [
    { chave: 'placa', titulo: 'Placa', render: (x) => html`<${Placa} placa=${x.placa} />` },
    { chave: 'modelo', titulo: 'Marca e modelo', valor: (x) => nomeVeiculo(x), render: (x) => html`<b>${x.marca || ''}</b> ${x.modelo || ''}` },
    { chave: 'categoria', titulo: 'Categoria' },
    { chave: 'situacao', titulo: 'Situação', render: (x) => html`<${Etiqueta} cor=${COR_SIT[x.situacao]}>${SITUACOES_VEICULO[x.situacao]}</${Etiqueta}>${x.uso === 'particular' ? html` <${Etiqueta} cor="roxo">particular</${Etiqueta}>` : ''}` },
    { chave: 'gasto', titulo: `Gasto ${ano}`, num: true, render: (x) => (x.gasto ? moeda(x.gasto) : '–') },
    { chave: 'notas', titulo: 'Notas', num: true, render: (x) => x.notas || '–' },
    { chave: 'ultima', titulo: 'Última manutenção', valor: (x) => x.ultima || '', render: (x) => (x.ultima ? data(x.ultima) : '–') },
    { chave: 'hodometro_atual', titulo: 'Km atual', num: true, render: (x) => (x.hodometro_atual ? num(x.hodometro_atual, 0) : '–') },
  ];
  const exp = [{ titulo: 'Placa', valor: (x) => placaBonita(x.placa) }, { titulo: 'Marca', valor: (x) => x.marca }, { titulo: 'Modelo', valor: (x) => x.modelo, largura: 24 },
    { titulo: 'Categoria', valor: (x) => x.categoria }, { titulo: 'Situação', valor: (x) => SITUACOES_VEICULO[x.situacao] }, { titulo: 'Uso', valor: (x) => USOS_VEICULO[x.uso] },
    { titulo: `Gasto ${ano}`, valor: (x) => Math.round(x.gasto * 100) / 100, texto: (x) => moeda(x.gasto), num: true }, { titulo: 'Notas', valor: (x) => x.notas, num: true },
    { titulo: 'Última manutenção', valor: (x) => data(x.ultima) }, { titulo: 'Km atual', valor: (x) => x.hodometro_atual, num: true },
    { titulo: 'Responsável', valor: (x) => x.responsavel }, { titulo: 'Pneus', valor: (x) => [x.pneus_qtd, x.pneus_medida].filter(Boolean).join(' × ') },
    { titulo: 'Licenciamento', valor: (x) => data(x.licenciamento_venc) }, { titulo: 'Seguro', valor: (x) => data(x.seguro_venc) }];
  return html`
    <${Cabecalho} titulo="Veículos" sub="Cadastro da frota. Toque num veículo para ver o raio-x: gastos, tipos de manutenção e histórico.">
      <button class="btn btn-pri" onClick=${() => setEditando({})}><${Icone} nome="mais" tam=${18} /> Novo veículo</button>
    </${Cabecalho}>
    <${Filtros} ativos=${[cat.length, uso.length, sit.join() !== 'ativo,parado'].filter(Boolean).length}
      fixo=${html`<${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Placa, marca, modelo ou responsável" />`}
      acoes=${html`<span class="nota">${pl(linhas.length, 'veículo', 'veículos')}</span>
        <${Exportar} tabela="frota.veiculos" titulo="Cadastro da frota" filtros=${pl(linhas.length, 'veículo', 'veículos')} arquivo=${`frota-${hojeISO()}`} colunas=${exp} linhas=${linhas} />`}>
      <${MultiEscolha} todos="Todas as categorias" rotulo="Categorias" valor=${cat} aoMudar=${setCat} opcoes=${cats.map((c) => ({ valor: c, rotulo: c }))} />
      <${MultiEscolha} todos="Todas as situações" rotulo="Situação" valor=${sit} aoMudar=${setSit} opcoes=${Object.entries(SITUACOES_VEICULO).map(([k, t]) => ({ valor: k, rotulo: t }))} />
      <${MultiEscolha} todos="Empresa e particulares" rotulo="Uso" valor=${uso} aoMudar=${setUso} opcoes=${Object.entries(USOS_VEICULO).map(([k, t]) => ({ valor: k, rotulo: t }))} />
    </${Filtros}>
    <${Tabela} id="frota.veiculos" linhas=${linhas} colunas=${colunas} aoClicar=${(x) => setAbrir(x.id)} ordemInicial=${{ chave: 'gasto', dir: -1 }}
      vazio="Nenhum veículo com estes filtros." />
    ${editando && html`<${FormVeiculo} f=${f} veiculo=${editando} aoFechar=${(id) => { setEditando(null); if (id && !editando.id) setAbrir(id); }} />`}`;
}

// ---------------------------------------------------------------------
// CADASTRO: a placa vem primeiro; "copiar dados de outro veículo" preenche tudo que é igual
// (marca, modelo, categoria, ano, combustível, pneus, consumo, preventiva) — muda só o que for diferente
// ---------------------------------------------------------------------
const COPIAVEIS = ['marca', 'modelo', 'categoria', 'ano_fabricacao', 'ano_modelo', 'combustivel', 'pneus_qtd', 'pneus_medida', 'consumo_km_l', 'preventiva_km', 'preventiva_dias', 'uso'];
const CAMPOS = ['placa', 'marca', 'modelo', 'categoria', 'ano_fabricacao', 'ano_modelo', 'situacao', 'uso', 'responsavel', 'combustivel', 'pneus_qtd', 'pneus_medida',
  'consumo_km_l', 'hodometro_atual', 'hodometro_em', 'preventiva_km', 'preventiva_dias', 'licenciamento_venc', 'seguro_venc', 'renavam', 'chassi', 'valor_aquisicao', 'observacao'];
const texto = (v) => (v === null || v === undefined ? '' : String(v));
const numBr = (v) => { const t = String(v ?? '').trim(); if (!t) return ''; const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(n) ? String(n) : t; };

export function FormVeiculo({ f, veiculo, aoFechar }) {
  const { api } = useApp();
  const novo = !veiculo.id;
  const [v, setV] = useState(() => Object.fromEntries(CAMPOS.map((c) => [c, texto(veiculo[c] ?? (c === 'situacao' ? 'ativo' : c === 'uso' ? 'empresa' : c === 'categoria' ? 'Caminhão' : ''))])));
  const [copiadoDe, setCopiadoDe] = useState(null);
  const [ocupado, executar] = useAcao();
  const set = (c) => (x) => setV((a) => ({ ...a, [c]: typeof x === 'object' && x?.target ? x.target.value : x }));
  const placa = limparPlaca(v.placa);
  const placaOk = PLACA_OK.test(placa);
  const repetida = f.veiculos.find((x) => x.placa === placa && x.id !== veiculo.id);
  const copiar = (id) => { const o = f.mapa.veiculo.get(id); if (!o) return; setCopiadoDe(o); setV((a) => ({ ...a, ...Object.fromEntries(COPIAVEIS.map((c) => [c, texto(o[c])])) })); };
  async function salvar() {
    const p = { ...v, id: veiculo.id || '', placa, consumo_km_l: numBr(v.consumo_km_l), hodometro_atual: numBr(v.hodometro_atual), valor_aquisicao: numBr(v.valor_aquisicao),
      pneus_qtd: numBr(v.pneus_qtd), preventiva_km: numBr(v.preventiva_km), preventiva_dias: numBr(v.preventiva_dias) };
    const id = await executar(() => api.rpc('frota_salvar_veiculo', { p }), novo ? `Veículo ${placaBonita(placa)} cadastrado.` : 'Veículo atualizado.');
    if (id) aoFechar(id);
  }
  const cats = [...new Set([...CATEGORIAS_VEICULO, ...f.veiculos.map((x) => x.categoria)])];
  const ano = new Date().getFullYear();
  return html`<${Modal} titulo=${novo ? 'Novo veículo' : `Editar ${placaBonita(veiculo.placa)}`} largo aoFechar=${() => aoFechar(null)}
    rodape=${html`<button class="btn btn-sec" onClick=${() => aoFechar(null)}>Cancelar</button>
      <button class="btn btn-pri" disabled=${ocupado || !placaOk || !!repetida} onClick=${salvar}>${ocupado ? 'Salvando…' : novo ? 'Cadastrar veículo' : 'Salvar veículo'}</button>`}>
    <div class="form-placa">
      <${Campo} rotulo="Placa" obrigatorio ajuda="3 letras e 4 caracteres: ABC1234 ou ABC1D23 (Mercosul). O hífen é opcional.">
        <input class="entrada entrada-placa" value=${v.placa} maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false" autoFocus=${novo}
          aria-invalid=${v.placa && (!placaOk || !!repetida) ? 'true' : null} onInput=${(e) => set('placa')(e.target.value.toUpperCase())} placeholder="ABC1D23" />
      </${Campo}>
      <div class="placa-estado" aria-live="polite">${!v.placa ? '' : repetida ? html`<span class="texto-vermelho">⚠ Placa já cadastrada (${nomeVeiculo(repetida)})</span>`
        : placaOk ? html`<span class="texto-verde">✓ Placa válida</span>` : html`<span class="texto-laranja">⚠ Formato inválido (${placa.length} de 7 caracteres)</span>`}</div>
    </div>
    ${novo && html`<div class="copiar-de">
      <${Campo} rotulo="Copiar dados de outro veículo igual (opcional)" ajuda="Preenche marca, modelo, categoria, ano, pneus, consumo e preventiva. Depois é só ajustar o que for diferente.">
        <${Escolher} itens=${f.veiculos} valor=${copiadoDe?.id || null} aoMudar=${copiar} rotuloDe=${(x) => `${placaBonita(x.placa)} · ${nomeVeiculo(x)}`}
          detalheDe=${(x) => x.categoria} placeholder="Digite a placa ou o modelo do veículo igual" /></${Campo}>
      ${copiadoDe && html`<p class="nota">✓ Dados copiados de <b>${placaBonita(copiadoDe.placa)}</b>. Confira e ajuste o que for diferente.</p>`}</div>`}
    <fieldset class="form-grupo"><legend>Identificação</legend><div class="grade">
      <${Campo} rotulo="Marca"><input class="entrada" value=${v.marca} maxlength="60" onInput=${set('marca')} placeholder="ex.: Iveco" list="frota-marcas" /></${Campo}>
      <${Campo} rotulo="Modelo"><input class="entrada" value=${v.modelo} maxlength="80" onInput=${set('modelo')} placeholder="ex.: Daily 35-150 CS" /></${Campo}>
      <${Campo} rotulo="Categoria" obrigatorio><select class="entrada" value=${v.categoria} onChange=${set('categoria')}>${cats.map((c) => html`<option value=${c}>${c}</option>`)}</select></${Campo}>
      <${Campo} rotulo="Ano de fabricação"><input class="entrada" type="number" min="1950" max=${ano + 1} value=${v.ano_fabricacao} onInput=${set('ano_fabricacao')} /></${Campo}>
      <${Campo} rotulo="Ano do modelo"><input class="entrada" type="number" min="1950" max=${ano + 2} value=${v.ano_modelo} onInput=${set('ano_modelo')} /></${Campo}>
      <${Campo} rotulo="Situação"><select class="entrada" value=${v.situacao} onChange=${set('situacao')}>${Object.entries(SITUACOES_VEICULO).map(([k, t]) => html`<option value=${k}>${t}</option>`)}</select></${Campo}>
      <${Campo} rotulo="Uso" ajuda="Particular = carro dos sócios: aparece à parte nos painéis."><select class="entrada" value=${v.uso} onChange=${set('uso')}>${Object.entries(USOS_VEICULO).map(([k, t]) => html`<option value=${k}>${t}</option>`)}</select></${Campo}>
    </div></fieldset>
    <datalist id="frota-marcas">${[...new Set(f.veiculos.map((x) => x.marca).filter(Boolean))].map((m) => html`<option value=${m} />`)}</datalist>
    <fieldset class="form-grupo"><legend>Operação e manutenção</legend><div class="grade">
      <${Campo} rotulo="Motorista ou setor responsável"><input class="entrada" value=${v.responsavel} maxlength="80" onInput=${set('responsavel')} /></${Campo}>
      <${Campo} rotulo="Combustível"><input class="entrada" value=${v.combustivel} maxlength="30" onInput=${set('combustivel')} placeholder="ex.: Diesel S10" list="frota-comb" /></${Campo}>
      <${Campo} rotulo="Consumo médio esperado (km/l)"><${Numero} valor=${v.consumo_km_l} aoMudar=${set('consumo_km_l')} placeholder="ex.: 8,5" /></${Campo}>
      <${Campo} rotulo="Km atual (hodômetro)"><${Numero} valor=${v.hodometro_atual} aoMudar=${set('hodometro_atual')} /></${Campo}>
      <${Campo} rotulo="Km lido em"><input class="entrada" type="date" value=${v.hodometro_em} max=${hojeISO()} onInput=${set('hodometro_em')} /></${Campo}>
      <${Campo} rotulo="Quantidade de pneus"><input class="entrada" type="number" min="0" max="40" value=${v.pneus_qtd} onInput=${set('pneus_qtd')} /></${Campo}>
      <${Campo} rotulo="Medida dos pneus"><input class="entrada" value=${v.pneus_medida} maxlength="40" onInput=${set('pneus_medida')} placeholder="ex.: 215/75 R17,5" /></${Campo}>
      <${Campo} rotulo="Preventiva a cada (km)"><${Numero} valor=${v.preventiva_km} aoMudar=${set('preventiva_km')} placeholder="ex.: 10.000" /></${Campo}>
      <${Campo} rotulo="Preventiva a cada (dias)"><input class="entrada" type="number" min="1" max="3650" value=${v.preventiva_dias} onInput=${set('preventiva_dias')} placeholder="ex.: 90" /></${Campo}>
    </div></fieldset>
    <datalist id="frota-comb"><option value="Diesel S10" /><option value="Diesel S500" /><option value="Gasolina" /><option value="Etanol" /><option value="Flex" /><option value="GNV" /></datalist>
    <fieldset class="form-grupo"><legend>Documentos</legend><div class="grade">
      <${Campo} rotulo="Vencimento do licenciamento"><input class="entrada" type="date" value=${v.licenciamento_venc} onInput=${set('licenciamento_venc')} /></${Campo}>
      <${Campo} rotulo="Vencimento do seguro"><input class="entrada" type="date" value=${v.seguro_venc} onInput=${set('seguro_venc')} /></${Campo}>
      <${Campo} rotulo="RENAVAM"><input class="entrada" value=${v.renavam} maxlength="20" inputmode="numeric" onInput=${set('renavam')} /></${Campo}>
      <${Campo} rotulo="Chassi"><input class="entrada" value=${v.chassi} maxlength="30" autocapitalize="characters" onInput=${(e) => set('chassi')(e.target.value.toUpperCase())} /></${Campo}>
      <${Campo} rotulo="Valor de aquisição (R$)"><${Numero} valor=${v.valor_aquisicao} aoMudar=${set('valor_aquisicao')} /></${Campo}>
    </div></fieldset>
    <${Campo} rotulo="Observação"><textarea class="entrada" rows="2" maxlength="1000" value=${v.observacao} onInput=${set('observacao')} /></${Campo}>
  </${Modal}>`;
}

// ---------------------------------------------------------------------
// FICHA DO VEÍCULO (raio-x)
// ---------------------------------------------------------------------
function FichaVeiculo({ f, v, aoVoltar, aoEditar }) {
  const [ano, setAno] = useState(f.anos[0] || Number(hojeISO().slice(0, 4)));
  const [base, setBase] = useState('competencia');
  const [apontar, setApontar] = useState(null);
  // cada "serviço" aqui é a PARTE deste veículo numa nota (nota inteira, ou só a parte dividida para ele)
  const servicos = useMemo(() => f.servicos.flatMap((s) => s.partes.filter((pt) => pt.veiculoId === v.id && pt.valor > 0)
    .map((pt) => ({ ...s, total: pt.valor, tags: pt.tags, observacao: pt.observacao, hodometro: pt.principal ? s.hodometro : null, apontado: pt.tags.length > 0,
      dividida: s.partes.length > 1, principal: pt.principal, notaInteira: s })))
    .sort((a, b) => String(b.entrada).localeCompare(String(a.entrada))), [f, v.id]);
  const linhas = linhasDoPeriodo(f, { ano, base, filtro: (it) => it.veiculoId === v.id });
  const serie = serieMensal(linhas, base);
  const total = somaLinhas(linhas, base);
  const doAno = servicos.filter((s) => String(s.entrada).startsWith(`${ano}-`));
  const mesesComGasto = MESES.filter((_, i) => GRUPOS.some((g) => serie[g.id][i] > 0)).length;
  // km: das notas apontadas com km
  const kms = servicos.filter((s) => s.hodometro).map((s) => ({ km: Number(s.hodometro), d: s.entrada })).sort((a, b) => a.km - b.km);
  const rodou = kms.length >= 2 ? kms[kms.length - 1].km - kms[0].km : 0;
  const gastoKm = rodou > 0 ? servicos.filter((s) => s.hodometro && s.entrada >= kms[0].d).reduce((t, s) => t + s.total, 0) / rodou : null;
  const ultPrev = servicos.find((s) => s.grupos.includes('preventiva'));
  const diasPrev = ultPrev ? diasEntre(ultPrev.entrada, hojeISO()) : null;
  // tipos de manutenção (etiquetas) no ano: valor das notas com cada etiqueta
  const porTag = new Map();
  for (const s of doAno) for (const t of s.tags || []) porTag.set(t, (porTag.get(t) || 0) + s.total);
  // alertas: documentos vencendo e reincidência (mesmo tipo 3+ vezes em 90 dias)
  const alertas = [];
  const venc = (d, nome) => { if (!d) return; const dias = diasEntre(hojeISO(), d); if (dias < 0) alertas.push({ cor: 'vermelho', t: `${nome} vencido em ${data(d)}` }); else if (dias <= 30) alertas.push({ cor: 'laranja', t: `${nome} vence em ${pl(dias, 'dia', 'dias')} (${data(d)})` }); };
  venc(v.licenciamento_venc, 'Licenciamento'); venc(v.seguro_venc, 'Seguro');
  if (v.preventiva_dias && diasPrev !== null && diasPrev > v.preventiva_dias) alertas.push({ cor: 'laranja', t: `Preventiva atrasada: a última foi há ${pl(diasPrev, 'dia', 'dias')} (a cada ${v.preventiva_dias})` });
  const recentes = servicos.filter((s) => diasEntre(s.entrada, hojeISO()) <= 90);
  const contaTag = new Map(); recentes.forEach((s) => (s.tags || []).forEach((t) => contaTag.set(t, (contaTag.get(t) || 0) + 1)));
  contaTag.forEach((n, t) => { if (n >= 3) alertas.push({ cor: 'laranja', t: `${n} serviços de ${f.mapa.tag.get(t)?.nome?.toLowerCase()} nos últimos 90 dias: verifique a causa ou a garantia` }); });
  const fila = servicos.filter((s) => !s.apontado).map((s) => s.notaInteira);
  const exp = [{ titulo: 'Data da nota', valor: (s) => data(s.entrada) }, { titulo: 'Fornecedor', valor: (s) => s.fornecedor, largura: 30 }, { titulo: 'Título', valor: (s) => s.titulo },
    { titulo: 'Conta', valor: (s) => s.grupos.map((g) => GRUPOS.find((x) => x.id === g)?.rotulo).join(', ') },
    { titulo: 'Tipos de manutenção', valor: (s) => (s.tags || []).map((t) => f.mapa.tag.get(t)?.nome).join(', '), largura: 30 },
    { titulo: 'Valor', valor: (s) => Math.round(s.total * 100) / 100, texto: (s) => moeda(s.total), num: true }, { titulo: 'Km', valor: (s) => s.hodometro || '' },
    { titulo: 'Observação', valor: (s) => s.observacao || '', largura: 40 }, { titulo: 'Observação do financeiro', valor: (s) => s.obsFinanceiro, largura: 40 }];
  return html`
    <${Cabecalho} titulo=${`Veículo ${placaBonita(v.placa)}`} sub=${`${nomeVeiculo(v)} · ${v.categoria} · ${SITUACOES_VEICULO[v.situacao]}${v.uso === 'particular' ? ' · particular' : ''}`} aoVoltar=${aoVoltar}>
      <button class="btn btn-sec" onClick=${aoEditar}><${Icone} nome="lapis" tam=${16} /> Editar cadastro</button>
    </${Cabecalho}>
    <div class="filtros filtros-com-acoes">
      <label class="campo-inline">Ano <select class="entrada" value=${ano} onChange=${(e) => setAno(Number(e.target.value))}>${(f.anos.length ? f.anos : [ano]).map((a) => html`<option value=${a}>${a}</option>`)}</select></label>
      <${SeletorBase} base=${base} aoMudar=${setBase} />
      <div class="filtros-acoes"><${Exportar} titulo=${`Veículo ${placaBonita(v.placa)} · ${nomeVeiculo(v)}`} filtros=${`${ano} · ${pl(doAno.length, 'nota', 'notas')} · ${moeda(doAno.reduce((t, s) => t + s.total, 0))}`}
        arquivo=${`veiculo-${v.placa}-${ano}`} colunas=${exp} linhas=${doAno} /></div>
    </div>
    <${AvisosLinha} itens=${[...alertas.map((a) => ({ icone: 'aviso', texto: a.t, cor: a.cor })),
      fila.length > 0 && { icone: 'frota-apontar', texto: html`<b>${fila.length}</b> ${fila.length === 1 ? 'nota' : 'notas'} para apontar`, botao: 'Apontar', acao: () => setApontar({ lista: fila, i: 0 }) }]} />
    <div class="cartoes">
      <${Cartao} titulo=${`Gasto em ${ano}`} valor=${moeda(total)} sub=${BASES_TXT[base]} />
      <${Cartao} titulo="Média por mês" valor=${moeda(mesesComGasto ? total / mesesComGasto : 0)} sub=${`em ${pl(mesesComGasto, 'mês com gasto', 'meses com gasto')}`} />
      <${Cartao} titulo="Notas no ano" valor=${doAno.length} sub=${pl(doAno.filter((s) => s.apontado).length, 'apontada', 'apontadas')} />
      <${Cartao} titulo="Custo por km" valor=${gastoKm ? `R$ ${num(gastoKm, 2)}` : '–'} sub=${gastoKm ? `${num(rodou, 0)} km entre apontamentos` : 'informe o km ao apontar'} />
      <${Cartao} titulo="Última preventiva" valor=${ultPrev ? data(ultPrev.entrada) : '–'} sub=${diasPrev !== null ? `há ${pl(diasPrev, 'dia', 'dias')}` : 'nenhuma registrada'} />
    </div>
    <div class="duas-colunas">
      <section class="painel"><h2>Gasto mês a mês · ${ano}</h2>
        <${ColunasEmpilhadas} categorias=${MESES} series=${GRUPOS.map((g) => ({ nome: g.rotulo, cor: g.cor, valores: serie[g.id] }))} formatar=${moeda} formatarEixo=${fmtK} altura=${220} /></section>
      <section class="painel"><h2>Tipos de manutenção · ${ano}</h2>
        <${BarrasH} itens=${[...porTag].sort((a, b) => b[1] - a[1]).map(([t, val]) => ({ rotulo: f.mapa.tag.get(t)?.nome || '?', valor: val, texto: moeda(val) }))}
          vazio="Nenhuma nota apontada neste ano." />
        <p class="nota">Valor das notas com cada tipo (uma nota com 2 tipos conta nos dois).</p></section>
    </div>
    <section class="painel"><h2>Histórico de manutenções</h2>
      ${!servicos.length ? html`<${Vazio} texto="Nenhuma despesa deste veículo ainda." />` : html`<ol class="fr-tempo">
        ${servicos.map((s) => html`<li key=${s.id} class=${s.apontado ? '' : 'lt-pendente'}>
          <div class="lt-data"><b>${data(s.entrada)}</b><span class="lt-conta">${s.grupos.map((g) => NOME_CONTA[g]).join(' · ')}</span></div>
          <div class="lt-corpo"><div class="lt-topo"><b class="lt-valor">${moeda(s.total)}</b> <span>${s.fornecedor}</span>${s.hodometro ? html` <small>· ${num(s.hodometro, 0)} km</small>` : ''}
            ${s.dividida && html` <${Etiqueta} cor="roxo">${s.principal ? `nota dividida · total ${moeda(s.notaInteira.total)}` : `parte de nota de ${moeda(s.notaInteira.total)} (${placaBonita(s.notaInteira.veiculo?.placa || s.placa_arquivo)})`}</${Etiqueta}>`}</div>
            ${s.apontado ? html`<${TagsLidas} ids=${s.tags} f=${f} />` : html`<${Etiqueta} cor="laranja">sem tipo de manutenção</${Etiqueta}>`}
            ${s.observacao && html`<p class="lt-obs">${s.observacao}</p>`}
            ${s.obsFinanceiro && html`<p class="lt-nf"><span class="lt-nf-rot">Nota:</span> <${TextoComPlaca} texto=${s.obsFinanceiro} /></p>`}</div>
          <button class="btn btn-sec btn-peq" onClick=${() => setApontar({ lista: [s.notaInteira], i: 0 })}>${s.apontado ? 'Editar' : 'Apontar'}</button>
        </li>`)}</ol>`}
    </section>
    <section class="painel"><h2>Dados do cadastro</h2><dl class="ficha-dados">
      ${[['Marca', v.marca], ['Modelo', v.modelo], ['Categoria', v.categoria], ['Ano', [v.ano_fabricacao, v.ano_modelo].filter(Boolean).join('/')], ['Responsável', v.responsavel],
        ['Combustível', v.combustivel], ['Consumo esperado', v.consumo_km_l ? `${num(v.consumo_km_l, 1)} km/l` : ''], ['Km atual', v.hodometro_atual ? `${num(v.hodometro_atual, 0)} km${v.hodometro_em ? ` (${data(v.hodometro_em)})` : ''}` : ''],
        ['Pneus', [v.pneus_qtd, v.pneus_medida].filter(Boolean).join(' × ')], ['Preventiva', [v.preventiva_km && `a cada ${num(v.preventiva_km, 0)} km`, v.preventiva_dias && `a cada ${v.preventiva_dias} dias`].filter(Boolean).join(' ou ')],
        ['Licenciamento', v.licenciamento_venc && data(v.licenciamento_venc)], ['Seguro', v.seguro_venc && data(v.seguro_venc)], ['RENAVAM', v.renavam], ['Chassi', v.chassi], ['Valor de aquisição', v.valor_aquisicao ? moeda(v.valor_aquisicao) : ''],
        ['Observação', v.observacao]].filter(([, x]) => x).map(([k, x]) => html`<div><dt>${k}</dt><dd>${x}</dd></div>`)}
    </dl></section>
    ${apontar && html`<${ModalApontar} f=${f} fila=${apontar.lista} inicio=${apontar.i} aoFechar=${() => setApontar(null)} />`}`;
}
const NOME_CONTA = { corretiva: 'Manutenção corretiva', preventiva: 'Manutenção preventiva', pneus: 'Pneus' };
const BASES_TXT = { competencia: 'pela data da nota (competência)', vencimento: 'pelo vencimento das parcelas', pagamento: 'pelo que foi pago' };
