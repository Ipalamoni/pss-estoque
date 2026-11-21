// =====================================================================
// api.js — ponte entre as telas e o banco.
// MODO 'supabase' = dados reais | MODO 'demo' = demonstração no navegador
// (o modo é escolhido no arquivo config.js)
// =====================================================================
import { apiDemo } from './demo.js';

const CFG = window.CONFIG || {};
const COLUNAS = { operadores: 'id, nome, ativo, criado_em' };   // a senha do padeiro nunca é lida pela tela

function criarApiSupabase() {
  if (!window.supabase || !CFG.SUPABASE_URL || !CFG.SUPABASE_CHAVE_PUBLICAVEL) {
    throw new Error('Configuração do Supabase incompleta: confira o arquivo config.js.');
  }
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_CHAVE_PUBLICAVEL, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pss-estoque-auth' },
  });
  const dominio = CFG.DOMINIO_LOGIN || 'estoque.pss';
  const emailDe = (u) => (String(u).includes('@') ? String(u).trim().toLowerCase() : `${String(u).trim().toLowerCase()}@${dominio}`);
  const falhou = (error) => { if (error) throw new Error(error.message || String(error)); };

  async function perfilDe(uid) {
    const { data, error } = await sb.from('perfis').select('*').eq('user_id', uid).maybeSingle();
    falhou(error);
    return data;
  }

  return {
    modo: 'supabase',
    async entrar(usuario, senha) {
      const { data, error } = await sb.auth.signInWithPassword({ email: emailDe(usuario), password: senha });
      falhou(error);
      const p = await perfilDe(data.user.id);
      if (!p || !p.ativo || !(p.papeis || []).length) {
        await sb.auth.signOut();
        throw new Error('Usuário sem acesso liberado. Fale com o administrador.');
      }
      p.trocar_senha = data.user.user_metadata?.trocar_senha === true;
      return p;
    },
    async sessaoAtual() {
      const { data } = await sb.auth.getSession();
      if (!data?.session) return null;
      const p = await perfilDe(data.session.user.id);
      if (!p || !p.ativo || !(p.papeis || []).length) return null;
      // confere no servidor (a sessão guardada no aparelho pode estar desatualizada,
      // ex.: a senha já foi trocada em outro computador)
      let meta = data.session.user.user_metadata;
      try { const r = await sb.auth.getUser(); if (r?.data?.user) meta = r.data.user.user_metadata; } catch (_) {}
      p.trocar_senha = meta?.trocar_senha === true;
      return p;
    },
    async sair() { await sb.auth.signOut(); },
    async trocarSenha(nova) {
      const { error } = await sb.auth.updateUser({ password: nova, data: { trocar_senha: false } });
      if (error && (error.code === 'same_password' || /different from the old/i.test(error.message || ''))) {
        // a senha digitada já é a senha atual (trocada em outro aparelho): só libera o acesso
        const r = await sb.auth.updateUser({ data: { trocar_senha: false } });
        return falhou(r.error);
      }
      falhou(error);
    },
    // Gerenciar usuários (só administrador): roda na função segura do servidor
    async adminUsuarios(corpo) {
      const { data, error } = await sb.functions.invoke('admin-usuarios', { body: corpo });
      if (error) {
        let msg = error.message;
        try { const j = await error.context.json(); if (j?.erro) msg = j.erro; } catch { /* sem corpo */ }
        throw new Error(msg);
      }
      if (data?.erro) throw new Error(data.erro);
      return data;
    },
    // Lê uma tabela inteira (em blocos de 1000 linhas) com filtros simples
    async listar(tabela, o = {}) {
      const tamanho = 1000;
      let de = 0;
      const todos = [];
      for (;;) {
        let q = sb.from(tabela).select(o.colunas || COLUNAS[tabela] || '*');
        const campo = o.campoData || 'data_hora';
        if (o.desde) q = q.gte(campo, o.desde);
        if (o.ate) q = q.lt(campo, o.ate);
        if (o.eq) for (const [k, v] of Object.entries(o.eq)) q = q.eq(k, v);
        if (o.em) for (const [k, v] of Object.entries(o.em)) q = q.in(k, v);
        if (o.nulo) for (const k of o.nulo) q = q.is(k, null);
        if (o.ordem) q = q.order(o.ordem[0], { ascending: o.ordem[1] !== 'desc' });
        else if (tabela === 'estoque_local') q = q.order('produto_id').order('local_id');
        else q = q.order(tabela === 'perfis' ? 'usuario' : tabela === 'parametros' ? 'chave' : tabela === 'batelada_custos' ? 'batelada_id' : 'id', { ascending: true });
        const ate = o.limite ? Math.min(de + tamanho, o.limite) - 1 : de + tamanho - 1;
        const { data, error } = await q.range(de, ate);
        falhou(error);
        todos.push(...data);
        if (data.length < ate - de + 1 || (o.limite && todos.length >= o.limite)) break;
        de += tamanho;
      }
      return todos;
    },
    async rpc(nome, args = {}) {
      const { data, error } = await sb.rpc(nome, args);
      falhou(error);
      return data;
    },
    // TEMPO REAL: avisa a tela quando alguém muda algo nas tabelas (sem ficar consultando o banco)
    aoMudar(tabelas, f) {
      const canal = sb.channel('mudancas-' + Math.random().toString(36).slice(2));
      tabelas.forEach((t) => canal.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => f([t])));
      canal.subscribe();
      return () => { try { sb.removeChannel(canal); } catch { /* ignora */ } };
    },
  };
}

export const api = CFG.MODO === 'supabase' ? criarApiSupabase() : apiDemo;
