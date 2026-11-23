// =====================================================================
// producao-util.js — regras de tela comuns da produção (versão 2):
// fluxo do dia (funil), semáforo das maceiras e consultas usadas pelo
// Painel de Produção, pela tela da Produção Maceiras e pela pesagem.
// =====================================================================
import { html, useState, useEffect, useApp, avisar } from './ui.js';
import { hojeISO, somarDias, mensagemErro, num, operaLocal } from './util.js';
import { Icone as IconeTempo } from './icones.js';

const inicioDia = (iso) => new Date(iso + 'T00:00:00').toISOString();
export const minutos = (desde, agora = Date.now()) => (desde ? Math.max(0, Math.round((agora - new Date(desde).getTime()) / 60000)) : null);
export const tempoTexto = (m) => (m === null || m === undefined ? '–' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`);

// Fluxo (funil) das programações de um período + bateladas do período (atualiza sozinho com os dados)
export function useFluxo(de, ate = de) {
  const { api, dados } = useApp();
  const [r, setR] = useState(null);
  useEffect(() => {
    let vivo = true;
    Promise.all([
      api.rpc('fluxo_producao', { p_de: de, p_ate: ate }),
      api.listar('bateladas', { campoData: 'iniciada_em', desde: inicioDia(somarDias(de, -1)), ate: inicioDia(somarDias(ate, 1)) }),
    ]).then(([fluxo, bateladas]) => { if (vivo) setR({ fluxo: fluxo.map(numeros), bateladas }); })
      .catch((e) => { if (vivo) { avisar(mensagemErro(e), 'erro'); setR({ fluxo: [], bateladas: [] }); } });
    return () => { vivo = false; };
  }, [de, ate, dados.carregadoEm]);
  return r;
}
const CAMPOS = ['programado', 'pesado', 'enviado', 'recebido', 'devolvido', 'perdido', 'iniciado', 'finalizado', 'produzido', 'a_pesar', 'na_pesagem', 'a_caminho', 'pronto', 'em_producao'];
function numeros(l) { const o = { ...l }; CAMPOS.forEach((c) => { o[c] = Number(o[c] || 0); }); return o; }

export const ETAPAS = [
  { id: 'a_pesar', titulo: 'A pesar', curto: 'a pesar', cor: '#94a3b8' },
  { id: 'na_pesagem', titulo: 'Pesado, não enviado', curto: 'na pesagem', cor: '#d9a441' },
  { id: 'a_caminho', titulo: 'A caminho', curto: 'a caminho', cor: '#3b82c4' },
  { id: 'pronto', titulo: 'Na masseira (pronto)', curto: 'prontas', cor: '#a78bfa' },
  { id: 'em_producao', titulo: 'Em produção', curto: 'batendo', cor: '#f08c00' },
  { id: 'finalizado', titulo: 'Finalizado', curto: 'finalizadas', cor: '#3fae74' },
];
export const somar = (linhas, campo) => linhas.reduce((s, l) => s + Number(l[campo] || 0), 0);

// tempo médio da batelada (minutos): da receita, da maceira ou o padrão do sistema
export function tempoMedio(dados, fichaId, maceira) {
  const f = dados.mapa.ficha.get(fichaId);
  return Number(f?.tempo_batelada_min || maceira?.tempo_min || dados.params.producao_tempo_padrao_min || 20);
}

// PRAZO da batelada: tempo da receita + tolerância (da receita ou o padrão de Parâmetros)
export function prazoBatelada(dados, fichaId, maceira) {
  const f = dados.mapa.ficha.get(fichaId);
  const tol = f?.tolerancia_batelada_min ?? Number(dados.params.producao_tolerancia_batelada_min ?? 10);
  return { tempo: tempoMedio(dados, fichaId, maceira), tol: Number(tol) };
}
// duração da batelada (do início ao fim; se ainda está batendo, até agora)
export const duracaoBatelada = (b, agora = Date.now()) => minutos(b.iniciada_em, b.finalizada_em ? new Date(b.finalizada_em).getTime() : agora);
// cor fixa com ícone + texto: verde = no prazo · âmbar = atenção (passou do tempo) · vermelho = atrasada (passou da tolerância)
export const ESTADO_TEMPO = {
  prazo: { cor: 'verde', rotulo: 'No prazo', icone: 'finalizar' },
  atencao: { cor: 'ambar', rotulo: 'Atenção', icone: 'relogio' },
  atraso: { cor: 'vermelho', rotulo: 'Atrasada', icone: 'aviso' },
};
export function estadoTempo(min, prazo) {
  if (min === null || min === undefined) return null;
  return min <= prazo.tempo ? 'prazo' : min <= prazo.tempo + prazo.tol ? 'atencao' : 'atraso';
}
export function SeloTempo({ estado, min, grande }) {
  if (!estado) return null;
  const e = ESTADO_TEMPO[estado];
  return html`<span class=${'selo-tempo t-' + e.cor + (grande ? ' grande' : '')}><${IconeTempo} nome=${e.icone} /> ${e.rotulo}${min !== undefined && min !== null ? html` · <b>${tempoTexto(min)}</b>` : ''}</span>`;
}

// SEMÁFORO da maceira (só sinalização, nunca trava):
//  verde até 1,5 × T sem iniciar outra · laranja até 2 × T · vermelho acima
//  o relógio começa 10 min (tolerância) depois da 1ª base recebida no dia e recomeça a cada batelada iniciada
export function semaforo(dados, maceira, fluxo, bateladas, agora = Date.now()) {
  const hoje = hojeISO();
  const progs = fluxo.filter((l) => l.maceira_id === maceira.id && l.data === hoje);
  const pronto = somar(progs, 'pronto');
  const resto = somar(progs, 'a_pesar') + somar(progs, 'na_pesagem') + somar(progs, 'a_caminho');
  const minhas = bateladas.filter((b) => b.maceira_id === maceira.id && b.situacao !== 'cancelada' && diaDe(b.iniciada_em) === hoje)
    .sort((a, b) => String(b.iniciada_em).localeCompare(String(a.iniciada_em)));
  const ultima = minhas[0];
  const recebimentos = fluxo.filter((l) => l.data === hoje && l.primeiro_recebimento).map((l) => l.primeiro_recebimento).sort();
  const tol = Number(dados.params.producao_tolerancia_min || 10);
  const proxima = progs.filter((l) => l.pronto > 0).sort((a, b) => a.prioridade - b.prioridade)[0];
  const T = tempoMedio(dados, ultima?.ficha_id || proxima?.ficha_id || progs[0]?.ficha_id, maceira);
  const base = { progs, pronto, resto, ultima, primeira: minhas[minhas.length - 1], T, batendo: null, iniciadasHoje: minhas.length };
  const desdeUltima = ultima ? minutos(ultima.iniciada_em, agora) : null;
  if (ultima && desdeUltima < T) base.batendo = { ficha_id: ultima.ficha_id, min: desdeUltima };
  if (!pronto) {
    if (resto > 0) return { ...base, cor: 'cinza', rotulo: 'Aguardando pesagem', min: desdeUltima };
    if (progs.length && somar(progs, 'iniciado') >= somar(progs, 'programado') - 0.0005) return { ...base, cor: 'cinza', rotulo: 'Programação concluída', min: desdeUltima, concluida: true };
    return { ...base, cor: 'cinza', rotulo: 'Aguardando programação', min: null };
  }
  // O relógio só corre depois da 1ª batelada do dia nesta maceira (a pesagem costuma deixar pronto na véspera/madrugada).
  // Antes disso: azul "Pronta para começar"; passou do início do turno + tolerância sem iniciar: laranja "Ainda não iniciou".
  const [hh, mm] = String(dados.params.producao_inicio_turno || '04:00').split(':').map(Number);
  const turno = new Date(); turno.setHours(hh || 0, mm || 0, 0, 0);
  const chegadas = progs.filter((l) => l.pronto > 0 && l.primeiro_recebimento).map((l) => new Date(l.primeiro_recebimento).getTime());
  if (!ultima) {
    const desde = Math.max(turno.getTime(), ...(chegadas.length ? [Math.min(...chegadas)] : [0]));
    const m = Math.round((agora - desde) / 60000);
    if (agora > desde + tol * 60000) return { ...base, cor: 'laranja', rotulo: 'Ainda não iniciou', min: m, semIniciar: true };
    return { ...base, cor: 'azul', rotulo: 'Pronta para começar', min: null };
  }
  // Já começou: conta do início da última batelada até a próxima. Se a fila tinha acabado e chegou base depois,
  // conta a partir da chegada (com a tolerância).
  let ref = new Date(ultima.iniciada_em).getTime();
  const chegouDepois = chegadas.filter((c) => c > ref + T * 60000);
  if (chegouDepois.length) ref = Math.max(ref, Math.min(...chegouDepois) + tol * 60000);
  const m = Math.max(0, Math.round((agora - ref) / 60000));
  if (base.batendo) return { ...base, cor: 'verde', rotulo: `Batendo há ${tempoTexto(desdeUltima)}`, min: m };
  if (m <= 1.5 * T) return { ...base, cor: 'verde', rotulo: 'No ritmo', min: m };
  if (m <= 2 * T) return { ...base, cor: 'laranja', rotulo: 'Tempo médio em atraso', min: m };
  return { ...base, cor: 'vermelho', rotulo: 'Produção em atraso', min: m };
}
export function diaDe(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// saldo de um produto num local (disponível + separado)
// registro de estoque de um produto num local (pelo índice; sem índice, procura na lista)
export const registroLocal = (dados, produtoId, localId) => (dados.mapa?.saldoLocal
  ? dados.mapa.saldoLocal.get(`${produtoId}|${localId}`) : dados.estoqueLocal.find((x) => x.produto_id === produtoId && x.local_id === localId));
export function saldoLocal(dados, produtoId, localId) {
  const e = registroLocal(dados, produtoId, localId);
  return e ? { disponivel: Number(e.disponivel), separado: Number(e.separado), qtd2: Number(e.qtd2_disponivel), qtd2sep: Number(e.qtd2_separado) }
    : { disponivel: 0, separado: 0, qtd2: 0, qtd2sep: 0 };
}
export const localTipo = (dados, tipo) => dados.locais.find((l) => l.tipo === tipo && l.ativo);
export const nomeLocal = (dados, id) => {
  const l = dados.mapa.local.get(id);
  if (!l) return '–';
  return dados.unidades.filter((u) => u.ativa).length > 1 ? `${l.nome} (${dados.mapa.unidade.get(l.unidade_id)?.nome || ''})` : l.nome;
};
export const misturaDaFicha = (dados, fichaId) => dados.produtos.find((p) => p.categoria === 'intermediario' && p.ficha_id === fichaId);
export const fmtMin = (m) => tempoTexto(m);
export const pctTxt = (a, b) => (b > 0 ? `${num((a / b) * 100, 0)}%` : '–');

// Relógio que força a tela a se redesenhar a cada X segundos (tempo do semáforo)
export function useRelogio(seg = 30) {
  const [t, setT] = useState(Date.now());
  // com a aba/app em segundo plano não redesenha a tela (economiza bateria do tablet/celular); ao voltar, acerta na hora
  useEffect(() => {
    const i = setInterval(() => { if (!document.hidden) setT(Date.now()); }, seg * 1000);
    const v = () => { if (!document.hidden) setT(Date.now()); };
    document.addEventListener('visibilitychange', v);
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', v); };
  }, [seg]);
  return t;
}

// Locais que a pessoa opera (admin: todos) e um seletor simples
export const meusLocais = (dados, papeis) => dados.locais.filter((l) => l.ativo && operaLocal(papeis, l));
export function useLocalInicial(preferido) {
  const { dados, papeis } = useApp();
  const meus = meusLocais(dados, papeis);
  const pref = preferido && meus.find((l) => l.tipo === preferido);
  return useState((pref || meus[0])?.id || null);
}
export function SeletorLocal({ valor, aoMudar, rotulo = 'Local' }) {
  const { dados, papeis } = useApp();
  const meus = meusLocais(dados, papeis);
  if (meus.length <= 1) return meus.length ? html`<span class="local-fixo">${rotulo}: <b>${nomeLocal(dados, meus[0].id)}</b></span>` : null;
  return html`<label class="campo-inline">${rotulo} <select class="entrada" value=${valor || ''} onChange=${(e) => aoMudar(Number(e.target.value))}>
    ${meus.map((l) => html`<option value=${l.id}>${nomeLocal(dados, l.id)}</option>`)}</select></label>`;
}

// ---------------------------------------------------------------------
// HORÁRIOS de cada etapa de uma programação (para o gerente acompanhar):
// programado → pesado → enviado → recebido → iniciado → finalizado
// ---------------------------------------------------------------------
export const hora = (ts) => (ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
export const horaDia = (ts) => {
  if (!ts) return '';
  const d = new Date(ts); const h = hora(ts);
  return diaDe(ts) === hojeISO() ? h : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${h}`;
};
export function useEventos(progIds) {
  const { api, dados } = useApp();
  const [r, setR] = useState(new Map());
  const chave = (progIds || []).join(',');
  useEffect(() => {
    let vivo = true;
    if (!progIds || !progIds.length) { setR(new Map()); return undefined; }
    (async () => {
      const [prods, its] = await Promise.all([
        api.listar('producoes', { em: { programacao_id: progIds } }).catch(() => []),
        api.listar('transferencia_itens', { em: { programacao_id: progIds } }).catch(() => []),
      ]);
      const tids = [...new Set(its.map((i) => i.transferencia_id))];
      const ts = tids.length ? await api.listar('transferencias', { em: { id: tids } }).catch(() => []) : [];
      const tm = new Map(ts.map((t) => [t.id, t]));
      const m = new Map();
      const de = (id) => { if (!m.has(id)) m.set(id, { pesagens: [], envios: [] }); return m.get(id); };
      prods.forEach((p) => de(p.programacao_id).pesagens.push(p));
      its.forEach((i) => { const t = tm.get(i.transferencia_id); if (t && t.situacao !== 'cancelada') de(i.programacao_id).envios.push({ ...t, quantidade: Number(i.quantidade) }); });
      m.forEach((v) => { v.pesagens.sort((a, b) => String(a.data_hora).localeCompare(String(b.data_hora))); v.envios.sort((a, b) => String(a.separado_em).localeCompare(String(b.separado_em))); });
      if (vivo) setR(m);
    })();
    return () => { vivo = false; };
  }, [chave, dados.carregadoEm]);
  return r;
}
const ultimo = (l, campo) => l.filter((x) => x[campo]).map((x) => x[campo]).sort().slice(-1)[0];
// Linha do tempo discreta de uma programação
export function LinhaTempo({ p, ev, bateladas = [], curta = false }) {
  const { dados } = useApp();
  const nome = (u) => (dados.mapa.perfil.get(u)?.nome || '').split(' ')[0];
  const passos = [];
  if (p.criado_em) passos.push(['Programado', horaDia(p.criado_em), nome(p.criado_por)]);
  const pes = ev?.pesagens || [];
  if (pes.length) {
    const q = pes.reduce((s, x) => s + Number(x.multiplicador || 0), 0);
    passos.push([`Pesado ${num(q, q % 1 ? 1 : 0)}${curta ? '' : ` de ${num(p.quantidade, 0)}`}`, (pes.length > 1 ? 'últ. ' : '') + horaDia(pes[pes.length - 1].data_hora), nome(pes[pes.length - 1].usuario_id)]);
  }
  const env = (ev?.envios || []).filter((t) => t.enviado_em);
  if (env.length) passos.push(['Enviado', horaDia(ultimo(env, 'enviado_em')), nome(env[env.length - 1].enviado_por)]);
  const rec = env.filter((t) => t.recebido_em);
  if (rec.length) { const t = rec[rec.length - 1]; passos.push(['Recebido', horaDia(ultimo(rec, 'recebido_em')), t.operador_id ? (dados.mapa.operador.get(t.operador_id)?.nome || '').split(' ')[0] : nome(t.recebido_por)]); }
  const bs = bateladas.filter((b) => b.programacao_id === p.id && b.situacao !== 'cancelada').sort((a, b) => String(a.iniciada_em).localeCompare(String(b.iniciada_em)));
  if (bs.length) passos.push([`Iniciadas ${bs.length}`, (bs.length > 1 ? 'últ. ' : '') + horaDia(bs[bs.length - 1].iniciada_em), (dados.mapa.operador.get(bs[bs.length - 1].operador_id)?.nome || '').split(' ')[0]]);
  const fin = bs.filter((b) => b.situacao === 'finalizada');
  if (fin.length && !curta) passos.push([`Finalizadas ${fin.length}`, horaDia(ultimo(fin, 'finalizada_em')), nome(fin[fin.length - 1].finalizada_por)]);
  if (!passos.length) return null;
  const vis = curta ? passos.slice(-2) : passos;
  return html`<span class="linha-tempo-mini">${vis.map(([t, h, q], i) => html`${i ? html`<span class="ltm-sep">›</span>` : ''}<span class="ltm-passo"><b>${t}</b> ${h}${q ? html` <i>${q}</i>` : ''}</span>`)}</span>`;
}
