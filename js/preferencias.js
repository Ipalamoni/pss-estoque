// =====================================================================
// preferencias.js — escolhas de cada pessoa nas telas (ex.: colunas escondidas de cada relatório).
// Ficam no banco (tabela preferencias_usuario: cada um só lê e grava as próprias), então valem em
// qualquer computador ou celular. Sem conexão (ou banco ainda sem a tabela), ficam neste aparelho.
// =====================================================================
import { useState, useEffect } from './vendor/preact-htm.js';
import { api } from './api.js';

let prefs = new Map();
let dono = null;
const ouvintes = new Set();
const mudou = () => ouvintes.forEach((f) => f());
const chaveLocal = (u) => `pss-prefs-${u}`;

function guardarLocal() {
  try { if (dono) localStorage.setItem(chaveLocal(dono), JSON.stringify(Object.fromEntries(prefs))); } catch { /* sem armazenamento */ }
}

// ao entrar: primeiro o que está neste aparelho (rápido), depois o que está no banco (vale mais)
export async function carregarPreferencias(usuarioId) {
  dono = usuarioId || null; prefs = new Map();
  try { Object.entries(JSON.parse(localStorage.getItem(chaveLocal(dono)) || '{}')).forEach(([k, v]) => prefs.set(k, v)); } catch { /* ignora */ }
  mudou();
  try {
    const doBanco = await api.listar('preferencias_usuario');
    doBanco.forEach((r) => prefs.set(r.chave, r.valor));
    guardarLocal(); mudou();
  } catch { /* banco ainda sem a tabela ou sem conexão: fica o deste aparelho */ }
}

export function lerPreferencia(chave, padrao) { return prefs.has(chave) ? prefs.get(chave) : padrao; }

// hook: a tela se redesenha quando a preferência muda
export function usePreferencia(chave, padrao) {
  const [, setN] = useState(0);
  useEffect(() => { const f = () => setN((n) => n + 1); ouvintes.add(f); return () => ouvintes.delete(f); }, []);
  return lerPreferencia(chave, padrao);
}

// valor null = voltar ao padrão
export async function salvarPreferencia(chave, valor) {
  if (valor === null) prefs.delete(chave); else prefs.set(chave, valor);
  guardarLocal(); mudou();
  try { await api.rpc('salvar_preferencia', { p_chave: chave, p_valor: valor }); } catch { /* fica neste aparelho até a próxima vez */ }
}
