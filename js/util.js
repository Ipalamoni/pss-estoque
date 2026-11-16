// =====================================================================
// util.js — formatação, unidades, rótulos e permissões (espelho do banco)
// =====================================================================

export const PAPEIS = {
  admin: 'Administrador',
  comprador: 'Comprador',
  almoxarifado: 'Almoxarifado (responsável)',
  recebimento: 'Recebimento (assistente)',
  pesagem: 'Pesagem',
  engenharia: 'Engenharia de produção',
  diretoria: 'Diretoria (consulta)',
  financeiro: 'Financeiro (pedidos e pagamentos)',
  faturamento: 'Faturamento (previsão de produção)',
};

export const CATEGORIAS = {
  materia_prima: 'Matéria-prima',
  embalagem: 'Embalagem',
  escritorio: 'Material de escritório',
  limpeza: 'Material de limpeza',
  outros: 'Outros',
};

export const TIPOS_MOV = {
  implantacao: 'Implantação de saldo',
  entrada: 'Entrada (recebimento)',
  saida_receita: 'Saída por receita',
  saida_avulsa: 'Saída avulsa (pesagem)',
  saida_almox: 'Saída almoxarifado',
  inventario: 'Ajuste de inventário',
  correcao: 'Correção',
};

export const STATUS_PEDIDO = {
  aberto: 'Aberto',
  parcial: 'Recebido parcial',
  recebido: 'Recebido',
  cancelado: 'Cancelado',
  encerrado: 'Encerrado (parcial)',
};

export const MOTIVOS_INVENTARIO = {
  extravio: 'Extravio',
  perda: 'Perda',
  vencido: 'Vencido',
  avariado: 'Avariado',
  outros: 'Outros',
};

export const UNIDADES_ESTOQUE = ['kg', 'g', 'L', 'mL', 'un', 'm', 'cx', 'pct', 'rolo', 'par'];
export const UNIDADES_COMPRA = ['saco', 'caixa', 'bobina', 'fardo', 'pacote', 'galão', 'balde', 'rolo', 'resma', 'un', 'kg', 'L'];
export const DESTINOS = ['Produção', 'Embalagem / Expedição', 'Escritório', 'Limpeza', 'Manutenção', 'Outros'];

// ---------------------------------------------------------------------
// Permissões (mesma matriz da função public.pode no banco).
// No app serve só para mostrar/esconder botões; quem garante é o banco.
// ---------------------------------------------------------------------
export const PERMISSOES = {
  cadastro_produto: ['admin', 'comprador'],
  cadastro_fornecedor: ['admin', 'comprador'],
  ficha_tecnica: ['admin', 'engenharia'],
  pedido: ['admin', 'comprador'],
  recebimento: ['admin', 'almoxarifado', 'recebimento'],
  saida_receita: ['admin', 'pesagem', 'almoxarifado'],
  saida_avulsa: ['admin', 'pesagem', 'almoxarifado'],
  saida_almox: ['admin', 'almoxarifado', 'recebimento'],
  inventario: ['admin', 'almoxarifado', 'recebimento'],
  corrigir: ['admin', 'almoxarifado'],
  implantacao: ['admin'],
  contagem_inicial: ['admin', 'almoxarifado'],
  usuarios: ['admin'],
  parametros: ['admin'],
  auditoria: ['admin', 'diretoria'],
  importacao: ['admin'],
  programacao: ['admin', 'engenharia'],
  financeiro: ['admin', 'financeiro'],
  data_pagamento: ['admin', 'comprador', 'financeiro'],
  previsao_producao: ['admin', 'engenharia', 'diretoria', 'financeiro', 'faturamento'],
  custos: ['admin'],
};
// Papéis que NÃO enxergam estoque/produção (o banco também bloqueia a leitura)
export const PAPEIS_RESTRITOS = ['financeiro', 'faturamento'];
export const acessoAmplo = (papeis) => (papeis || []).some((x) => !PAPEIS_RESTRITOS.includes(x));
// papeis = lista de papéis da pessoa (uma pessoa pode ter mais de um)
export const pode = (papeis, acao) => (PERMISSOES[acao] || []).some((x) => (papeis || []).includes(x));
export const temAlgum = (papeis, lista) => (papeis || []).some((x) => lista.includes(x));
export const papeisTexto = (papeis) => (papeis || []).map((x) => PAPEIS[x] || x).join(' + ');

// ---------------------------------------------------------------------
// Números e datas (padrão brasileiro)
// ---------------------------------------------------------------------
export function num(v, casas = 2, min = 0) {
  if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return '–';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: casas });
}
export const qtd = (v) => num(v, 3, 0);
export const moeda = (v) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '–'
    : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// "1.234,5" -> 1234.5 ; "2,5" -> 2.5 ; "2.5" -> 2.5
export function lerNumero(txt) {
  if (txt === null || txt === undefined) return null;
  let s = String(txt).trim().replace(/\s/g, '');
  if (s === '') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  // padrão brasileiro: ponto separa milhar ("8.501" = oito mil quinhentos e um; "1.250.000")
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const pad = (n) => String(n).padStart(2, '0');
export function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function somarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(a, m - 1, d + dias);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
export function diasEntre(isoA, isoB) {
  const a = new Date(isoA + 'T12:00:00'), b = new Date(isoB + 'T12:00:00');
  return Math.round((b - a) / 86400000);
}
export function data(iso) {
  if (!iso) return '–';
  const s = String(iso).slice(0, 10).split('-');
  return `${s[2]}/${s[1]}/${s[0]}`;
}
export function dataHora(ts) {
  if (!ts) return '–';
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function diaLocal(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const numeroPedido = (id) => 'PC-' + String(id).padStart(6, '0');

// ---------------------------------------------------------------------
// Unidades do produto: estoque, compra e g/mL quando o estoque é kg/L
// ---------------------------------------------------------------------
export function unidadesDoProduto(p) {
  if (!p) return [];
  const lista = [{ un: p.unidade_estoque, fator: 1 }];
  if (p.unidade_compra && p.unidade_compra !== p.unidade_estoque)
    lista.push({ un: p.unidade_compra, fator: Number(p.fator_compra) || 1 });
  const ue = (p.unidade_estoque || '').toLowerCase();
  if (ue === 'kg') lista.push({ un: 'g', fator: 0.001 });
  if (ue === 'l') lista.push({ un: 'mL', fator: 0.001 });
  return lista;
}
export function fator(p, un) {
  const u = unidadesDoProduto(p).find((x) => x.un === un);
  return u ? u.fator : 1;
}
// ---------------------------------------------------------------------
// Plural: 1 saco / 2 sacos / 0,5 saco / 0 sacos ; abreviações (kg, g, L, un…) não mudam
// (mesma regra da função public._un no banco)
// ---------------------------------------------------------------------
const ABREV = new Set(['kg', 'g', 'l', 'ml', 'un', 'm', 'cx', 'pct', 'mg', 't']);
export function plural(un, q) {
  if (!un) return '';
  if (ABREV.has(String(un).toLowerCase())) return un;
  const a = Math.abs(Number(q));
  if (a > 0 && a < 2) return un;   // norma: menos de 2 fica no singular (0,5 saco; 1,5 saco)
  if (/ão$/.test(un)) return un.replace(/ão$/, 'ões');
  if (/[aeiouáéíóúâêô]$/i.test(un)) return un + 's';
  if (/l$/.test(un)) return un.replace(/l$/, 'is');
  if (/[rzs]$/.test(un)) return un + 'es';
  return un + 's';
}
// quantidade + unidade no plural certo: qu(10, 'saco') -> "10 sacos"
export const qu = (q, un, casas = 3) => `${num(q, casas, 0)} ${plural(un, q)}`;
// texto no singular/plural: pl(3, 'dia', 'dias') -> "3 dias"
export const pl = (n, sing, plur) => `${num(n, 0)} ${Math.abs(Number(n)) === 1 ? sing : plur}`;

// "1.000 kg (40 sacos)"
export function qtdDupla(p, base) {
  if (!p) return qtd(base);
  let s = qu(base, p.unidade_estoque);
  if (p.unidade_compra && Number(p.fator_compra) > 0 && p.unidade_compra !== p.unidade_estoque)
    s += ` (${qu(base / Number(p.fator_compra), p.unidade_compra, 2)})`;
  return s;
}
export function nomeUsuario(perfil) {
  if (!perfil) return '–';
  return perfil.funcao ? `${perfil.nome} (${perfil.funcao})` : perfil.nome;
}

export function normalizar(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
export const contem = (texto, busca) => !busca || normalizar(texto).includes(normalizar(busca));

export function porId(lista) {
  const m = new Map();
  for (const x of lista || []) m.set(x.id ?? x.user_id, x);
  return m;
}

export function ordenar(lista, chave, dir = 1) {
  return [...lista].sort((a, b) => {
    const va = typeof chave === 'function' ? chave(a) : a[chave];
    const vb = typeof chave === 'function' ? chave(b) : b[chave];
    if (va === vb) return 0;
    if (va === null || va === undefined || va === '') return 1;
    if (vb === null || vb === undefined || vb === '') return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * dir;
  });
}

export function mensagemErro(e) {
  const m = e?.message || String(e);
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com a internet. Confira o Wi‑Fi/dados e tente de novo.';
  if (/JWT|token/i.test(m)) return 'Sua sessão expirou. Entre de novo.';
  if (/Invalid login credentials/i.test(m)) return 'Usuário ou senha incorretos.';
  return m;
}
