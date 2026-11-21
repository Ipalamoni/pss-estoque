// =====================================================================
// demo.js — MODO DEMONSTRAÇÃO / TREINAMENTO (versão 2)
// Roda o MESMO banco de dados do sistema (os mesmos arquivos SQL do
// Supabase) dentro do navegador, com o PGlite (PostgreSQL em WebAssembly).
// Assim a demonstração segue exatamente as mesmas regras da produção.
//  - Os dados ficam só neste navegador (e podem ser reiniciados).
//  - O banco é montado pelo arquivo js/demo/banco-demo.sql
//    (gerado por ferramentas-dev/montar_demo.py a partir da pasta sql/).
// =====================================================================

const NOME_BANCO = 'idb://pss-estoque-demo-v2';
const CHAVE_SESSAO = 'pss-estoque-demo-v2-sessao';
let db = null;            // PGlite
let preparando = null;    // promessa da carga inicial
let usuario = null;       // user_id (uuid) logado
const ouvintes = new Set();
let funcs = null;         // nome → retorna conjunto?

async function abrir() {
  if (db) return db;
  if (preparando) return preparando;
  preparando = (async () => {
    const { PGlite } = await import('./vendor/pglite/index.js');
    // devolve datas e números no mesmo formato do Supabase (texto ISO e número), para as telas tratarem igual
    const iso = (v) => { const d = new Date(String(v).replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')); return Number.isNaN(d.getTime()) ? v : d.toISOString(); };
    const novo = new PGlite(NOME_BANCO, { parsers: { 1082: (v) => v, 1114: iso, 1184: iso, 1700: (v) => (v === null ? null : Number(v)) } });
    await novo.waitReady;
    const existe = await novo.query("select to_regclass('public.versao_banco') is not null as ok");
    if (!existe.rows[0].ok) {
      aviso('Montando o banco de demonstração (só na primeira vez, leva alguns segundos)…');
      const sql = await (await fetch('js/demo/banco-demo.sql', { cache: 'no-cache' })).text();
      await novo.exec(sql);
      aviso(null);
    }
    const f = await novo.query(`select p.proname as nome, p.proretset as conjunto,
        (select t.typname from pg_type t where t.oid = p.prorettype) as retorno
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
    funcs = new Map(f.rows.map((r) => [r.nome, r]));
    db = novo;
    return db;
  })();
  return preparando;
}

// faixa "montando o banco…" (sem depender das telas)
function aviso(texto) {
  let el = document.getElementById('demo-carga');
  if (!texto) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'demo-carga';
    el.style.cssText = 'position:fixed;inset:auto 0 0 0;z-index:9999;background:#026e57;color:#fff;padding:12px;text-align:center;font:600 14px system-ui';
    document.body.appendChild(el);
  }
  el.textContent = texto;
}

function avisarMudanca(tabelas) { ouvintes.forEach((f) => { try { f(tabelas); } catch { /* ignora */ } }); }

async function comoUsuario(fn) {
  const banco = await abrir();
  return banco.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [usuario || '']);
    return fn(tx);
  });
}

const limpar = (v) => (v === undefined ? null : v);
function paramValor(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

// mensagens do banco como no Supabase (só o texto)
function erroAmigavel(e) {
  const m = (e && (e.message || String(e))) || 'Erro';
  return new Error(m.replace(/^error:\s*/i, ''));
}

const COLUNAS = { operadores: 'id, nome, ativo, criado_em' };   // senha do padeiro nunca vem para a tela

export const apiDemo = {
  modo: 'demo',
  async preparar() { await abrir(); },
  async usuariosDemo() {
    const b = await abrir();
    const r = await b.query("select * from public.perfis where ativo and cardinality(papeis) > 0 order by case when 'admin' = any(papeis) then 0 else 1 end, nome");
    return r.rows;
  },
  async entrar(u) {
    const b = await abrir();
    const r = await b.query('select * from public.perfis where usuario = $1 and ativo', [String(u).toLowerCase()]);
    if (!r.rows[0]) throw new Error('Usuário não encontrado.');
    usuario = r.rows[0].user_id;
    try { localStorage.setItem(CHAVE_SESSAO, usuario); } catch { /* ignora */ }
    return r.rows[0];
  },
  async sessaoAtual() {
    const b = await abrir();
    if (!usuario) { try { usuario = localStorage.getItem(CHAVE_SESSAO); } catch { /* ignora */ } }
    if (!usuario) return null;
    const r = await b.query('select * from public.perfis where user_id = $1 and ativo', [usuario]);
    return r.rows[0] || null;
  },
  async sair() { usuario = null; try { localStorage.removeItem(CHAVE_SESSAO); } catch { /* ignora */ } },
  async trocarSenha() { throw new Error('No modo demonstração não há senha.'); },
  async adminUsuarios(p) {
    return comoUsuario(async (tx) => {
      if (p.acao === 'criar') {
        const email = `${String(p.usuario).trim().toLowerCase()}@estoque.pss`;
        const ja = await tx.query('select 1 from auth.users where email = $1', [email]);
        if (ja.rows.length) throw new Error('Já existe um usuário com este login.');
        const r = await tx.query("insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('nome', $2::text)) returning id", [email, p.nome]);
        const uid = r.rows[0].id;
        await tx.query('select public.salvar_perfil($1)', [JSON.stringify({ user_id: uid, nome: p.nome, funcao: p.funcao || null, papeis: p.papeis || [], ativo: true })]);
        avisarMudanca(['perfis']);
        return { user_id: uid, senha_temporaria: 'demonstracao' };
      }
      if (p.acao === 'redefinir_senha') return { senha_temporaria: 'demonstracao' };
      if (p.acao === 'bloquear') {
        const r = await tx.query('select * from public.perfis where user_id = $1', [p.user_id]);
        const pf = r.rows[0];
        await tx.query('select public.salvar_perfil($1)', [JSON.stringify({ user_id: p.user_id, nome: pf.nome, funcao: pf.funcao, papeis: pf.papeis, ativo: !p.bloquear })]);
        avisarMudanca(['perfis']);
        return { ok: true };
      }
      throw new Error('Ação inválida.');
    }).catch((e) => { throw erroAmigavel(e); });
  },
  async listar(tabela, o = {}) {
    if (!/^[a-z_]+$/.test(tabela)) throw new Error('Tabela inválida.');
    const cond = []; const args = [];
    const col = (c) => { if (!/^[a-z_]+$/.test(c)) throw new Error('Campo inválido.'); return c; };
    const campo = o.campoData || 'data_hora';
    if (o.desde) { args.push(o.desde); cond.push(`${col(campo)} >= $${args.length}`); }
    if (o.ate) { args.push(o.ate); cond.push(`${col(campo)} < $${args.length}`); }
    if (o.eq) for (const [k, v] of Object.entries(o.eq)) { args.push(v); cond.push(`${col(k)} = $${args.length}`); }
    if (o.em) for (const [k, v] of Object.entries(o.em)) {
      if (!v.length) { cond.push('false'); continue; }
      args.push(v); cond.push(`${col(k)} = any($${args.length})`);
    }
    if (o.nulo) for (const k of o.nulo) cond.push(`${col(k)} is null`);
    const ordem = o.ordem ? `${col(o.ordem[0])} ${o.ordem[1] === 'desc' ? 'desc' : 'asc'}`
      : tabela === 'perfis' ? 'usuario' : tabela === 'parametros' ? 'chave' : tabela === 'estoque_local' ? 'produto_id, local_id'
        : tabela === 'batelada_custos' ? 'batelada_id' : 'id';
    const sql = `select ${o.colunas || COLUNAS[tabela] || '*'} from public.${tabela}${cond.length ? ' where ' + cond.join(' and ') : ''} order by ${ordem}${o.limite ? ' limit ' + Number(o.limite) : ''}`;
    try {
      const r = await comoUsuario((tx) => tx.query(sql, args));
      return r.rows;
    } catch (e) { throw erroAmigavel(e); }
  },
  async rpc(nome, args = {}) {
    await abrir();
    if (!/^[a-z_]+$/.test(nome) || nome.startsWith('_')) throw new Error('Função inválida.');
    const f = funcs.get(nome);
    if (!f) throw new Error(`Função ${nome} não existe.`);
    const nomes = Object.keys(args).filter((k) => args[k] !== undefined);
    const lista = nomes.map((k, i) => `${k} => $${i + 1}`).join(', ');
    const valores = nomes.map((k) => paramValor(limpar(args[k])));
    try {
      const r = await comoUsuario((tx) => tx.query(f.conjunto ? `select * from public.${nome}(${lista})` : `select public.${nome}(${lista}) as r`, valores));
      if (!/^(estatisticas|fluxo|previsao|custos|ler_|entrar_|pode)/.test(nome)) avisarMudanca(['*']);
      if (f.conjunto) return r.rows;
      return f.retorno === 'void' ? null : r.rows[0]?.r ?? null;
    } catch (e) { throw erroAmigavel(e); }
  },
  // "tempo real" da demonstração: avisa as telas abertas quando algo muda
  aoMudar(_tabelas, f) { ouvintes.add(f); return () => ouvintes.delete(f); },
  async reiniciarDemo() {
    usuario = null;
    try { localStorage.removeItem(CHAVE_SESSAO); } catch { /* ignora */ }
    try { if (db) await db.close(); } catch { /* ignora */ }
    db = null; preparando = null;
    await new Promise((ok) => { const r = indexedDB.deleteDatabase('/pglite/pss-estoque-demo-v2'); r.onsuccess = r.onerror = r.onblocked = () => ok(); });
  },
};
