// =====================================================================
// frota-dados.js — dados e contas do módulo MANUTENÇÃO DE VEÍCULOS
// Carrega as tabelas da frota (só quem tem acesso consegue ler: o banco confere)
// e monta: serviço (nota × veículo) com total, parcelas e etiquetas; séries por mês
// pela COMPETÊNCIA (data de entrada da nota), VENCIMENTO ou PAGAMENTO.
// =====================================================================
import { useState, useEffect, useApp } from './ui.js';

// contas do contas a pagar → grupo (cores fixas: corretiva laranja, preventiva verde, pneus azul; validadas p/ daltonismo)
export const GRUPOS = [
  { id: 'corretiva', rotulo: 'Corretiva', cor: 'var(--fr-corretiva)' },
  { id: 'preventiva', rotulo: 'Preventiva', cor: 'var(--fr-preventiva)' },
  { id: 'pneus', rotulo: 'Pneus', cor: 'var(--fr-pneus)' },
];
export const NOME_GRUPO = Object.fromEntries(GRUPOS.map((g) => [g.id, g.rotulo]));
const tira = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
export const grupoDaConta = (conta) => { const c = tira(conta); return c.includes('PNEU') ? 'pneus' : c.includes('PREVENTIVA') ? 'preventiva' : 'corretiva'; };

// base de data dos painéis
export const BASES = [
  { id: 'competencia', rotulo: 'Competência', ajuda: 'Pela data de entrada da nota: o valor total no mês em que o serviço aconteceu (mesmo parcelado).' },
  { id: 'vencimento', rotulo: 'Vencimento', ajuda: 'Pelo vencimento de cada parcela: o que venceu no mês.' },
  { id: 'pagamento', rotulo: 'Pagamento', ajuda: 'Pela data de pagamento: o que foi pago no mês (com juros e descontos).' },
];
// quanto do valor pago é desta conta (o título pode ser dividido entre contas)
const pagoDaLinha = (l) => {
  if (!l.pagamento) return 0;
  const vt = Number(l.valor_titulo || 0); const vp = Number(l.valor_pago ?? vt);
  return vt > 0 ? (Number(l.valor) * vp) / vt : Number(l.valor);
};
export const dataPela = (base, l) => (base === 'vencimento' ? l.vencimento : base === 'pagamento' ? l.pagamento : l.entrada);
export const valorPela = (base, l) => (base === 'pagamento' ? pagoDaLinha(l) : Number(l.valor || 0));

export const CATEGORIAS_VEICULO = ['Caminhão', 'Caminhão 3/4', 'Caminhão truck', 'Caminhão bitruck', 'Cavalo mecânico', 'Carreta', 'Van', 'Picape', 'Carro', 'Moto', 'Outro'];
export const SITUACOES_VEICULO = { ativo: 'Ativo', parado: 'Parado', vendido: 'Vendido' };
export const USOS_VEICULO = { empresa: 'Frota da empresa', particular: 'Particular (sócios)' };
export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const PLACA_OK = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
export const limparPlaca = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const placaBonita = (p) => (p && p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p || '');
export const ehGeral = (placa) => !placa || placa === '9999999';

// placa parecida (erro de digitação): troca, falta/sobra ou inversão de 1 caractere;
// letras e números que se confundem (O/0, I/1, B/8, S/5, G/6, Z/2) contam meio erro
const PARECIDOS = new Set(['O0', '0O', 'I1', '1I', 'B8', '8B', 'S5', '5S', 'G6', '6G', 'Z2', '2Z', 'D0', '0D', 'Q0', '0Q']);
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const troca = a[i - 1] === b[j - 1] ? 0 : PARECIDOS.has(a[i - 1] + b[j - 1]) ? 0.5 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + troca);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
export function sugestoesPlaca(placa, veiculos, max = 3) {
  return veiculos.map((v) => ({ v, d: distancia(placa, v.placa) })).filter((x) => x.d <= 1.5)
    .sort((a, b) => a.d - b.d || a.v.placa.localeCompare(b.v.placa)).slice(0, max).map((x) => x.v);
}

// ---------------------------------------------------------------------
// carga (fica guardada enquanto o app está aberto; recarrega quando algo é salvo)
// ---------------------------------------------------------------------
let cache = null; let carregando = null; const ouvintes = new Set();
async function buscar(api) {
  const [veiculos, tags, apelidos, servicos, lancamentos, importacoes] = await Promise.all([
    api.listar('frota_veiculos', { ordem: ['placa', 'asc'] }), api.listar('frota_tags', { ordem: ['ordem', 'asc'] }),
    api.listar('frota_placa_apelidos', { ordem: ['placa', 'asc'] }), api.listar('frota_servicos'),
    api.listar('frota_lancamentos', { nulo: ['removido_em'], ordem: ['id', 'asc'] }),
    api.listar('frota_importacoes', { ordem: ['id', 'desc'], limite: 100 }),
  ]);
  return montar({ veiculos, tags, apelidos, servicos, lancamentos, importacoes });
}
export function recarregarFrota(api) {
  carregando = buscar(api).then((f) => { cache = f; carregando = null; ouvintes.forEach((o) => o(f)); return f; })
    .catch((e) => { carregando = null; throw e; });
  return carregando;
}
export function useFrota() {
  const { api } = useApp();
  const [f, setF] = useState(cache);
  const [erro, setErro] = useState(null);
  useEffect(() => {
    const o = (x) => setF(x); ouvintes.add(o);
    (carregando || recarregarFrota(api)).catch((e) => setErro(e));
    const salvo = () => recarregarFrota(api).catch(() => {});
    window.addEventListener('pss-salvo', salvo);
    return () => { ouvintes.delete(o); window.removeEventListener('pss-salvo', salvo); };
  }, []);
  return { f, erro, recarregar: () => recarregarFrota(api) };
}

function montar(b) {
  const veiculo = new Map(b.veiculos.map((v) => [v.id, v]));
  const tag = new Map(b.tags.map((t) => [t.id, t]));
  const lancsDe = new Map();
  for (const l of b.lancamentos) {
    l.grupo = grupoDaConta(l.conta);
    if (!lancsDe.has(l.servico_id)) lancsDe.set(l.servico_id, []);
    lancsDe.get(l.servico_id).push(l);
  }
  const servicos = b.servicos.map((s) => {
    const lancs = lancsDe.get(s.id) || [];
    const veiculoId = s.veiculo_manual_id || s.veiculo_id || null;
    const total = lancs.reduce((t, l) => t + Number(l.valor || 0), 0);
    const pago = lancs.reduce((t, l) => t + (l.pagamento ? Number(l.valor || 0) : 0), 0);
    const grupos = [...new Set(lancs.map((l) => l.grupo))];
    const parcelas = new Set(lancs.map((l) => l.parcela)).size;
    return {
      ...s, lancs, veiculoId, veiculo: veiculoId ? veiculo.get(veiculoId) : null,
      geral: !veiculoId && ehGeral(s.placa_arquivo), desconhecida: !veiculoId && !ehGeral(s.placa_arquivo),
      total, pago, aberto: total - pago, grupos, grupo: grupos.length === 1 ? grupos[0] : grupos.sort((x, y) => lancs.filter((l) => l.grupo === y).length - lancs.filter((l) => l.grupo === x).length)[0],
      parcelas, entrada: lancs.reduce((m, l) => (!m || l.entrada < m ? l.entrada : m), null),
      fornecedor: lancs[0]?.fornecedor_nome || '', obsFinanceiro: lancs[0]?.observacao || '',
      apontado: (s.tags || []).length > 0,
    };
  }).filter((s) => s.lancs.length);   // nota que sumiu do financeiro não aparece (o apontamento continua guardado no banco)
  const servico = new Map(servicos.map((s) => [s.id, s]));
  for (const l of b.lancamentos) { l.servico = servico.get(l.servico_id); }
  const anos = [...new Set(b.lancamentos.map((l) => Number(String(l.entrada).slice(0, 4))))].sort((x, y) => y - x);
  return { ...b, mapa: { veiculo, tag, servico }, servicos, anos, carregadoEm: new Date() };
}

// linhas que entram num painel: ano, base de data e filtros (veículo/categoria/uso/grupo; gerais opcionais)
export function linhasDoPeriodo(f, { ano, base, mes = null, filtro = () => true }) {
  const pre = `${ano}-`;
  return f.lancamentos.filter((l) => {
    const d = dataPela(base, l);
    if (!d || !String(d).startsWith(pre)) return false;
    if (mes !== null && Number(String(d).slice(5, 7)) - 1 !== mes) return false;
    return filtro(l);
  });
}
// série mês a mês por grupo (corretiva/preventiva/pneus)
export function serieMensal(linhas, base) {
  const s = Object.fromEntries(GRUPOS.map((g) => [g.id, Array(12).fill(0)]));
  for (const l of linhas) { const m = Number(String(dataPela(base, l)).slice(5, 7)) - 1; s[l.grupo][m] += valorPela(base, l); }
  return s;
}
export const somaLinhas = (linhas, base) => linhas.reduce((t, l) => t + valorPela(base, l), 0);
export const nomeVeiculo = (v) => (v ? [v.marca, v.modelo].filter(Boolean).join(' ') : '');
