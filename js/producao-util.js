// =====================================================================
// producao-util.js — regras de tela comuns da produção (versão 2):
// fluxo do dia (funil), semáforo das maceiras e consultas usadas pelo
// Painel de Produção, pela tela da Produção Maceiras e pela pesagem.
// =====================================================================
import { html, useState, useEffect, useApp, avisar } from './ui.js';
import { hojeISO, somarDias, mensagemErro, num, operaLocal } from './util.js';

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
  { id: 'pronto', titulo: 'Na maceira (pronto)', curto: 'prontas', cor: '#8b5cf6' },
  { id: 'em_producao', titulo: 'Em produção', curto: 'batendo', cor: '#f08c00' },
  { id: 'finalizado', titulo: 'Finalizado', curto: 'finalizadas', cor: '#1e7d4f' },
];
export const somar = (linhas, campo) => linhas.reduce((s, l) => s + Number(l[campo] || 0), 0);

// tempo médio da batelada (minutos): da receita, da maceira ou o padrão do sistema
export function tempoMedio(dados, fichaId, maceira) {
  const f = dados.mapa.ficha.get(fichaId);
  return Number(f?.tempo_batelada_min || maceira?.tempo_min || dados.params.producao_tempo_padrao_min || 20);
}

// SEMÁFORO da maceira (só sinalização, nunca trava):
//  verde até 1,5 × T sem iniciar outra · laranja até 2 × T · vermelho acima
//  o relógio começa 10 min (tolerância) depois da 1ª mistura recebida no dia e recomeça a cada batelada iniciada
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
  const base = { progs, pronto, resto, ultima, T, batendo: null, iniciadasHoje: minhas.length };
  const desdeUltima = ultima ? minutos(ultima.iniciada_em, agora) : null;
  if (ultima && desdeUltima < T) base.batendo = { ficha_id: ultima.ficha_id, min: desdeUltima };
  if (!pronto) {
    if (resto > 0) return { ...base, cor: 'cinza', rotulo: 'Aguardando pesagem', min: desdeUltima };
    if (progs.length && somar(progs, 'iniciado') >= somar(progs, 'programado') - 0.0005) return { ...base, cor: 'cinza', rotulo: 'Programação concluída', min: desdeUltima, concluida: true };
    return { ...base, cor: 'cinza', rotulo: 'Aguardando programação', min: null };
  }
  let ref = ultima ? new Date(ultima.iniciada_em).getTime() : null;
  if (!ref && recebimentos[0]) ref = new Date(recebimentos[0]).getTime() + tol * 60000;
  const m = ref ? Math.max(0, Math.round((agora - ref) / 60000)) : 0;
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
export function saldoLocal(dados, produtoId, localId) {
  const e = dados.estoqueLocal.find((x) => x.produto_id === produtoId && x.local_id === localId);
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
  useEffect(() => { const i = setInterval(() => setT(Date.now()), seg * 1000); return () => clearInterval(i); }, [seg]);
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
