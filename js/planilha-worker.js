// =====================================================================
// planilha-worker.js — abre planilhas ENVIADAS PELO USUÁRIO num processo isolado (Web Worker).
// SEGURANÇA: a biblioteca de planilhas tem falhas conhecidas com arquivos maliciosos
// (CVE-2023-30533: poluição de protótipo; CVE-2024-22363: travamento). Aqui dentro ela não tem
// acesso à tela, à sessão de login nem aos dados do sistema; se travar, a tela encerra este
// processo pelo tempo-limite. Só voltam dados simples (texto e número) linha a linha.
// =====================================================================
/* global XLSX, importScripts */
const MAX_ABAS = 30, MAX_LINHAS = 20000, MAX_COLUNAS = 200;
self.onmessage = (e) => {
  try {
    importScripts('vendor/xlsx.mini.min.js');
    const wb = XLSX.read(e.data, { type: 'array', cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false });
    const nomes = wb.SheetNames.slice(0, MAX_ABAS).map(String);
    const abas = {};
    for (const n of nomes) {
      const linhas = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true, blankrows: true }).slice(0, MAX_LINHAS);
      // só primitivos (texto, número, verdadeiro/falso); datas viram número de série como no Excel
      abas[n] = linhas.map((l) => (Array.isArray(l) ? l.slice(0, MAX_COLUNAS).map((v) => (v === null || v === undefined ? ''
        : typeof v === 'number' || typeof v === 'boolean' ? v : v instanceof Date ? v.toISOString() : String(v))) : []));
    }
    self.postMessage({ ok: true, nomes, abas });
  } catch (err) {
    self.postMessage({ ok: false, erro: String((err && err.message) || err) });
  }
};
