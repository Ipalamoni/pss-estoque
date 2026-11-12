// =====================================================================
// api.js — ponte entre as telas e o banco.
// MODO 'supabase' = dados reais | MODO 'demo' = demonstração no navegador
// (o modo é escolhido no arquivo config.js)
// =====================================================================
import { apiDemo } from './demo.js';

const CFG = window.CONFIG || {};

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
      return p;
    },
    async sessaoAtual() {
      const { data } = await sb.auth.getSession();
      if (!data?.session) return null;
      const p = await perfilDe(data.session.user.id);
      return p && p.ativo && (p.papeis || []).length ? p : null;
    },
    async sair() { await sb.auth.signOut(); },
    async trocarSenha(nova) {
      const { error } = await sb.auth.updateUser({ password: nova });
      falhou(error);
    },
    // Lê uma tabela inteira (em blocos de 1000 linhas) com filtros simples
    async listar(tabela, o = {}) {
      const tamanho = 1000;
      let de = 0;
      const todos = [];
      for (;;) {
        let q = sb.from(tabela).select('*');
        const campo = o.campoData || 'data_hora';
        if (o.desde) q = q.gte(campo, o.desde);
        if (o.ate) q = q.lt(campo, o.ate);
        if (o.eq) for (const [k, v] of Object.entries(o.eq)) q = q.eq(k, v);
        if (o.em) for (const [k, v] of Object.entries(o.em)) q = q.in(k, v);
        if (o.ordem) q = q.order(o.ordem[0], { ascending: o.ordem[1] !== 'desc' });
        else q = q.order(tabela === 'perfis' ? 'usuario' : tabela === 'parametros' ? 'chave' : 'id', { ascending: true });
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
  };
}

export const api = CFG.MODO === 'supabase' ? criarApiSupabase() : apiDemo;
