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
  padeiro: 'Padeiro (tablet da Produção Masseiras)',
  gestor_producao: 'Gestor da produção (ordem, masseiras e correções)',
};

export const CATEGORIAS = {
  materia_prima: 'Matéria-prima',
  embalagem: 'Embalagem',
  escritorio: 'Material de escritório',
  limpeza: 'Material de limpeza',
  outros: 'Outros',
  intermediario: 'Produto intermediário (mistura)',
  produto_acabado: 'Produto acabado',
};
// categorias que o usuário escolhe no cadastro (a mistura é criada pelo sistema)
export const CATEGORIAS_CADASTRO = ['materia_prima', 'embalagem', 'escritorio', 'limpeza', 'outros'];
// "tipo de produto" nos filtros
export const TIPOS_PRODUTO = {
  materia_prima: 'Matéria-prima', embalagem: 'Embalagem', intermediario: 'Intermediário (mistura)',
  uso: 'Uso e consumo', produto_acabado: 'Produto acabado',
};
export const tipoProduto = (p) => (['escritorio', 'limpeza', 'outros'].includes(p?.categoria) ? 'uso' : p?.categoria);

export const TIPOS_LOCAL = {
  almoxarifado: 'Almoxarifado', deposito: 'Depósito', pesagem: 'Pesagem', maceiras: 'Produção (masseiras)',
  pcp: 'PCP / engenharia', expedicao: 'Expedição', outro: 'Outro',
};
export const ETAPAS_TRANSF = {
  separacao: 'separação', envio: 'envio', recebimento: 'recebimento', cancelamento_envio: 'envio cancelado',
  cancelamento_separacao: 'separação cancelada', diferenca_volta: 'diferença voltou',
};
export const SITUACAO_TRANSF = { separada: 'Separada', enviada: 'Em trânsito', recebida: 'Recebida', cancelada: 'Cancelada' };
export const SITUACAO_REQ = { pendente: 'Pendente', parcial: 'Atendida em parte', atendida: 'Atendida', encerrada: 'Encerrada', cancelada: 'Cancelada' };

export const TIPOS_MOV = {
  implantacao: 'Implantação de saldo',
  entrada: 'Entrada (recebimento)',
  saida_receita: 'Consumo pela receita',
  saida_avulsa: 'Saída avulsa',
  saida_almox: 'Saída almoxarifado',
  inventario: 'Ajuste de inventário',
  correcao: 'Correção',
  transferencia: 'Transferência',
  consumo: 'Consumo no setor',
  entrada_producao: 'Entrada da produção',
  perda: 'Perda',
  entrada_manual: 'Entrada manual',
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
  saida_avulsa: ['admin', 'pesagem', 'almoxarifado', 'padeiro', 'engenharia', 'gestor_producao'],
  saida_almox: ['admin', 'almoxarifado', 'recebimento'],
  inventario: ['admin', 'almoxarifado', 'recebimento'],
  corrigir: ['admin', 'almoxarifado'],
  implantacao: ['admin'],
  contagem_inicial: ['admin', 'almoxarifado'],
  usuarios: ['admin'],
  parametros: ['admin'],
  auditoria: ['admin', 'diretoria'],
  importacao: ['admin'],
  programacao: ['admin', 'engenharia', 'gestor_producao'],
  financeiro: ['admin', 'financeiro'],
  data_pagamento: ['admin', 'comprador', 'financeiro'],
  previsao_producao: ['admin', 'engenharia', 'diretoria', 'financeiro', 'faturamento', 'gestor_producao'],
  custos: ['admin', 'diretoria'],
  requisicao: ['admin', 'engenharia', 'gestor_producao'],
  producao_config: ['admin', 'engenharia', 'gestor_producao'],
  batelada: ['admin', 'padeiro', 'engenharia', 'gestor_producao'],
  finalizar_batelada: ['admin', 'engenharia', 'gestor_producao'],
  consumo: ['admin', 'engenharia', 'almoxarifado', 'padeiro', 'pesagem', 'gestor_producao'],
  locais: ['admin'],
};
// o usuário opera este local? (administrador opera todos)
export const operaLocal = (papeis, local) => (papeis || []).includes('admin') || (local?.papeis || []).some((x) => (papeis || []).includes(x));
// gestão = vê tudo (estoque de todos os locais, produção, painel)
export const ehGestao = (papeis) => (papeis || []).some((x) => ['admin', 'diretoria', 'engenharia', 'comprador', 'gestor_producao'].includes(x));
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

// ---------------------------------------------------------------------
// CNPJ / CPF (v1.3.1): grava SEM pontuação; mostra no formato padrão.
// CNPJ aceita o formato alfanumérico da Receita (desde jul/2026): 12 posições
// com 0-9 ou A-Z + 2 dígitos verificadores. CPF: 11 números.
// tipo: 'PJ' (jurídica, CNPJ) ou 'PF' (física, CPF). Sem tipo: deduz pelo tamanho.
// ---------------------------------------------------------------------
export const rotuloDoc = (tipo) => (tipo === 'PF' ? 'CPF' : 'CNPJ');
export const TIPOS_PESSOA = [{ id: 'PJ', titulo: 'Pessoa jurídica (CNPJ)' }, { id: 'PF', titulo: 'Pessoa física (CPF)' }];

// tira a pontuação; no CNPJ letras só nas 12 primeiras posições, números nas 2 últimas
export function docLimpo(v, tipo) {
  const s = String(v ?? '').toUpperCase();
  if (tipo === 'PF') return s.replace(/\D/g, '').slice(0, 11);
  if (tipo === 'PJ') {
    let out = '';
    for (const c of s.replace(/[^0-9A-Z]/g, '')) {
      if (out.length >= 14) break;
      if (out.length >= 12 && !/[0-9]/.test(c)) continue;
      out += c;
    }
    return out;
  }
  return s.replace(/[^0-9A-Z]/g, '');
}

// formata enquanto digita (00.000.000/0000-00 · 000.000.000-00)
export function mascaraDoc(v, tipo) {
  const d = docLimpo(v, tipo);
  if (tipo === 'PF') return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
  const p = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 12), d.slice(12, 14)];
  let s = p[0];
  if (p[1]) s += '.' + p[1];
  if (p[2]) s += '.' + p[2];
  if (p[3]) s += '/' + p[3];
  if (p[4]) s += '-' + p[4];
  return s;
}

// para mostrar em telas, PDF e Excel (número completo formatado; incompleto fica como está)
export function formatarDoc(v, tipo) {
  const d = docLimpo(v);
  if (!d) return '';
  if (d.length === 14 && tipo !== 'PF') return mascaraDoc(d, 'PJ');
  if (d.length === 11 && /^\d+$/.test(d) && tipo !== 'PJ') return mascaraDoc(d, 'PF');
  return String(v);
}

export function cnpjValido(v) {
  const d = docLimpo(v);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(d) || d === d[0].repeat(14)) return false;
  const dv = (base, pesos) => { const s = [...base].reduce((t, c, i) => t + (c.charCodeAt(0) - 48) * pesos[i], 0) % 11; return s < 2 ? 0 : 11 - s; };
  const d1 = dv(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(d.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d.slice(12) === `${d1}${d2}`;
}
export function cpfValido(v) {
  const d = docLimpo(v);
  if (!/^\d{11}$/.test(d) || d === d[0].repeat(11)) return false;
  const dv = (n) => { const s = [...d.slice(0, n)].reduce((t, c, i) => t + Number(c) * (n + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
// '' = vazio ou ainda digitando; texto = problema no número completo
export function problemaDoc(v, tipo) {
  const d = docLimpo(v, tipo);
  if (!d) return '';
  const total = tipo === 'PF' ? 11 : 14;
  if (d.length < total) return '';
  return (tipo === 'PF' ? cpfValido(d) : cnpjValido(d)) ? '' : `${rotuloDoc(tipo)} inválido: confira os números digitados.`;
}

// ---------------------------------------------------------------------
// SEGURANÇA DE ANEXOS: só PDF e fotos, conferidos pelos bytes do início do arquivo
// (a extensão e o "tipo" informados podem ser falsificados; um SVG/HTML abriria com acesso ao sistema)
export const ANEXO_TIPOS = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP', 'image/heic': 'HEIC' };
export function tipoRealAnexo(bytes) {
  const b = bytes; const s = (i, t) => [...t].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (s(0, '%PDF')) return 'application/pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && s(1, 'PNG')) return 'image/png';
  if (s(0, 'RIFF') && s(8, 'WEBP')) return 'image/webp';
  if (s(4, 'ftyp') && (s(8, 'heic') || s(8, 'heix') || s(8, 'mif1') || s(8, 'msf1'))) return 'image/heic';
  return null;
}
