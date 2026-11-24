// =====================================================================
// frota-csv.js — lê o "Contas a pagar - despesa" (CSV exportado do sistema da empresa)
// e separa só as linhas de MANUTENÇÃO DE VEÍCULOS, no formato da função frota_importar.
// Hoje vem de arquivo; quando a consulta vier direto do banco da empresa (Firebird),
// ela entrega as mesmas colunas e passa pela mesma função do banco.
// Sem dependências: funciona no navegador e no Node (testes).
// =====================================================================

// contas (coluna "Despesa") que entram no módulo; comparação sem acento e sem diferença de maiúsculas
export const CONTAS_FROTA = ['MANUTENCAO CORRETIVA', 'MANUTENCAO PREVENTIVA', 'PNEUS - COMPRA E MANUTENCAO'];

export const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// texto do arquivo: UTF-8 se for válido; senão Windows-1252 (o padrão das exportações do Windows)
export function decodificar(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('windows-1252').decode(bytes); }
}

// confere pelos BYTES que é texto (não planilha, PDF, imagem ou programa) antes de ler
export function pareceTexto(bytes) {
  const b = bytes.subarray(0, 65536);
  if (b.length >= 2 && b[0] === 0x50 && b[1] === 0x4b) return false;          // PK: xlsx/zip
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return false;   // %PDF
  for (let i = 0; i < b.length; i++) if (b[i] === 0) return false;              // byte nulo = binário
  return true;
}

// separa as colunas (separador ";" ou ","; aceita campo entre aspas)
export function lerCsv(texto) {
  const linhas = [];
  const sep = (texto.split(/\r?\n/, 1)[0].match(/;/g) || []).length >= (texto.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? ';' : ',';
  let campo = ''; let linha = []; let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((x) => x !== '')) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo); if (linha.some((x) => x !== '')) linhas.push(linha);
  return linhas;
}

const data = (s) => { const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
const numero = (s) => { const t = String(s ?? '').trim(); if (!t) return null; const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(n) ? n : null; };

// nomes das colunas (como vêm no arquivo) → campo do sistema
const COLUNAS = {
  fornecedor_codigo: ['CODIGO'], fornecedor_nome: ['RAZAO SOCIAL'], cnpj: ['CNPJ'], titulo: ['NUMERO DO TITULO'],
  parcela: ['LETRA - PARCELA', 'PARCELA'], emissao: ['DATA DE EMISSAO'], entrada: ['DATA DE ENTRADA'], vencimento: ['DATA DE VENCIMENTO'],
  pagamento: ['DATA DE PAGAMENTO'], valor_titulo: ['VALOR DO TITULO'], juros: ['VALOR DE JUROS'], desconto: ['VALOR DE DESCONTO'],
  valor_pago: ['VALOR PAGO'], centro_custo: ['CENTRO DE CUSTO'], conta: ['DESPESA'], valor: ['VALOR DA DESPESA'], observacao: ['OBSERVACAO'],
  status: ['STATUS'], placa: ['PLACA'], tipo_documento: ['TIPO DE DOCUMENTO'],
};
const OBRIGATORIAS = ['fornecedor_codigo', 'titulo', 'entrada', 'conta', 'valor', 'placa'];

// → { linhas (só manutenção de veículos), total (linhas do arquivo), reprovadas, semData, faltando (colunas que não achou) }
export function linhasFrota(texto) {
  const tab = lerCsv(texto);
  if (tab.length < 2) return { linhas: [], total: 0, reprovadas: 0, semData: 0, faltando: OBRIGATORIAS };
  const cab = tab[0].map(semAcento);
  const idx = {};
  for (const [campo, nomes] of Object.entries(COLUNAS)) {
    idx[campo] = cab.findIndex((c) => nomes.some((n) => c === n || (n === 'STATUS' && c.startsWith('STATUS'))));
  }
  const faltando = OBRIGATORIAS.filter((c) => idx[c] < 0);
  if (faltando.length) return { linhas: [], total: tab.length - 1, reprovadas: 0, semData: 0, faltando };
  const v = (r, c) => (idx[c] >= 0 ? String(r[idx[c]] ?? '').trim() : '');
  let reprovadas = 0; let semData = 0;
  const linhas = [];
  for (const r of tab.slice(1)) {
    if (!CONTAS_FROTA.includes(semAcento(v(r, 'conta')))) continue;
    if (v(r, 'status').toUpperCase() === 'R') { reprovadas++; continue; }   // R = reprovado: não é despesa
    const entrada = data(v(r, 'entrada'));
    if (!entrada) { semData++; continue; }
    linhas.push({
      fornecedor_codigo: v(r, 'fornecedor_codigo'), fornecedor_nome: v(r, 'fornecedor_nome'), cnpj: v(r, 'cnpj'), titulo: v(r, 'titulo'),
      parcela: v(r, 'parcela'), emissao: data(v(r, 'emissao')), entrada, vencimento: data(v(r, 'vencimento')), pagamento: data(v(r, 'pagamento')),
      valor_titulo: numero(v(r, 'valor_titulo')), juros: numero(v(r, 'juros')), desconto: numero(v(r, 'desconto')), valor_pago: numero(v(r, 'valor_pago')),
      centro_custo: v(r, 'centro_custo'), conta: v(r, 'conta'), valor: numero(v(r, 'valor')), observacao: v(r, 'observacao'),
      status: v(r, 'status'), placa: v(r, 'placa'), tipo_documento: v(r, 'tipo_documento'),
    });
  }
  return { linhas, total: tab.length - 1, reprovadas, semData, faltando: [] };
}
