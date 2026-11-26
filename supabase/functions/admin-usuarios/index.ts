// =====================================================================
// Edge Function "admin-usuarios" — Compras & Estoque PSS
// (código guardado no repositório a partir da v2.6.2; publicar com: Supabase › Edge Functions › admin-usuarios)
// A lista PAPEIS precisa acompanhar a lista do banco (perfis_papeis_check) e a de js/util.js.
// Só o ADMINISTRADOR do sistema consegue usar. Roda no servidor do Supabase,
// onde a chave secreta (service_role) já existe como variável de ambiente:
// ela NUNCA vai para o navegador, para o GitHub nem para documentos.
//
// Ações (POST JSON):
//   { acao: 'criar', usuario, nome, funcao, papeis: [] }  -> { user_id, senha_temporaria }
//   { acao: 'redefinir_senha', user_id }                   -> { senha_temporaria }
//   { acao: 'bloquear', user_id, bloquear: true|false }    -> { ok }
// A senha temporária aparece uma única vez para o administrador e o usuário
// é obrigado a trocá-la no primeiro acesso.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
const URL_SB = Deno.env.get('SUPABASE_URL');
const ANON = Deno.env.get('SUPABASE_ANON_KEY');
const SECRETA = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const DOMINIO = Deno.env.get('DOMINIO_LOGIN') || 'estoque.pss';
// Endereços que podem chamar esta função (o site e testes locais)
const ORIGENS = (Deno.env.get('ORIGENS_PERMITIDAS') || 'https://ipalamoni.github.io').split(',').map((x)=>x.trim());
const PAPEIS = [
  'admin',
  'comprador',
  'almoxarifado',
  'recebimento',
  'pesagem',
  'engenharia',
  'diretoria',
  'financeiro',
  'faturamento',
  'padeiro',          // tablet da Produção Masseiras
  'gestor_producao',  // gerente/gestor da produção: muda ordem e masseira, corrige
  'frota',            // manutenção de veículos (frota)
  'integracao'        // robô do ERP: só entrega os pedidos (não é usuário do sistema)
];
function cabecalhos(origem) {
  const ok = origem && ORIGENS.includes(origem) ? origem : ORIGENS[0];
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8'
  };
}
const responder = (dados, status, origem)=>new Response(JSON.stringify(dados), {
    status,
    headers: cabecalhos(origem)
  });
// Senha temporária forte: 12 caracteres, sem letras/números que se confundem
function gerarSenha() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', numeros = '23456789', todos = letras + numeros;
  for(;;){
    const v = new Uint32Array(12);
    crypto.getRandomValues(v);
    const s = Array.from(v, (x)=>todos[x % todos.length]).join('');
    if (/[a-z]/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s)) return s;
  }
}
Deno.serve(async (req)=>{
  const origem = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: cabecalhos(origem)
  });
  if (req.method !== 'POST') return responder({
    erro: 'Método não permitido.'
  }, 405, origem);
  if (origem && !ORIGENS.includes(origem)) return responder({
    erro: 'Origem não autorizada.'
  }, 403, origem);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return responder({
    erro: 'Sem sessão.'
  }, 401, origem);
  // cliente "como o administrador" (respeita as regras do banco e grava auditoria em nome dele)
  const comoAdmin = createClient(URL_SB, ANON, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    },
    auth: {
      persistSession: false
    }
  });
  const servico = createClient(URL_SB, SECRETA, {
    auth: {
      persistSession: false
    }
  });
  const { data: quem, error: e1 } = await comoAdmin.auth.getUser(token);
  if (e1 || !quem?.user) return responder({
    erro: 'Sessão inválida. Entre de novo.'
  }, 401, origem);
  const { data: papeis, error: e2 } = await comoAdmin.rpc('meus_papeis');
  if (e2 || !Array.isArray(papeis) || !papeis.includes('admin')) return responder({
    erro: 'Só o administrador gerencia usuários.'
  }, 403, origem);
  let p;
  try {
    p = await req.json();
  } catch  {
    return responder({
      erro: 'Pedido inválido.'
    }, 400, origem);
  }
  const registrar = (evento, detalhe)=>servico.from('acessos').insert({
      usuario_id: quem.user.id,
      evento,
      detalhe,
      agente: (req.headers.get('User-Agent') || '').slice(0, 300)
    });
  try {
    if (p.acao === 'criar') {
      const usuario = String(p.usuario || '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(usuario)) return responder({
        erro: 'Usuário deve ter de 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado (sem espaço e sem acento).'
      }, 400, origem);
      const nome = String(p.nome || '').trim();
      if (!nome) return responder({
        erro: 'Informe o nome.'
      }, 400, origem);
      const lista = Array.isArray(p.papeis) ? p.papeis.filter((x)=>PAPEIS.includes(x)) : [];
      if (!lista.length) return responder({
        erro: 'Marque pelo menos um papel.'
      }, 400, origem);
      const senha = gerarSenha();
      const { data: novo, error } = await servico.auth.admin.createUser({
        email: `${usuario}@${DOMINIO}`,
        password: senha,
        email_confirm: true,
        user_metadata: {
          nome,
          trocar_senha: true
        }
      });
      if (error) return responder({
        erro: /already|registered|exists/i.test(error.message) ? `Já existe o usuário "${usuario}".` : error.message
      }, 400, origem);
      const { error: e3 } = await comoAdmin.rpc('salvar_perfil', {
        p: {
          user_id: novo.user.id,
          nome,
          funcao: p.funcao || null,
          papeis: lista,
          ativo: true
        }
      });
      if (e3) {
        await servico.auth.admin.deleteUser(novo.user.id);
        return responder({
          erro: e3.message
        }, 400, origem);
      }
      await registrar('usuario_criado', `${usuario} (${nome}) · ${lista.join(', ')}`);
      return responder({
        user_id: novo.user.id,
        usuario,
        senha_temporaria: senha
      }, 200, origem);
    }
    const uid = String(p.user_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(uid)) return responder({
      erro: 'Usuário inválido.'
    }, 400, origem);
    const { data: perfil } = await servico.from('perfis').select('*').eq('user_id', uid).maybeSingle();
    if (!perfil) return responder({
      erro: 'Usuário não encontrado.'
    }, 404, origem);
    if (p.acao === 'redefinir_senha') {
      const senha = gerarSenha();
      const { data: atual } = await servico.auth.admin.getUserById(uid);
      const meta = {
        ...atual?.user?.user_metadata || {},
        trocar_senha: true
      };
      const { error } = await servico.auth.admin.updateUserById(uid, {
        password: senha,
        user_metadata: meta
      });
      if (error) return responder({
        erro: error.message
      }, 400, origem);
      await registrar('senha_redefinida', perfil.usuario);
      return responder({
        senha_temporaria: senha
      }, 200, origem);
    }
    if (p.acao === 'bloquear') {
      const bloquear = p.bloquear === true;
      if (uid === quem.user.id && bloquear) return responder({
        erro: 'Você não pode bloquear a si mesmo.'
      }, 400, origem);
      const { error } = await servico.auth.admin.updateUserById(uid, {
        ban_duration: bloquear ? '876000h' : 'none'
      });
      if (error) return responder({
        erro: error.message
      }, 400, origem);
      // o perfil inativo corta o acesso aos dados na hora (o banco confere em toda consulta)
      const { error: e4 } = await comoAdmin.rpc('salvar_perfil', {
        p: {
          user_id: uid,
          nome: perfil.nome,
          funcao: perfil.funcao,
          papeis: perfil.papeis,
          ativo: !bloquear
        }
      });
      if (e4) return responder({
        erro: e4.message
      }, 400, origem);
      await registrar(bloquear ? 'usuario_bloqueado' : 'usuario_desbloqueado', perfil.usuario);
      return responder({
        ok: true
      }, 200, origem);
    }
    return responder({
      erro: 'Ação desconhecida.'
    }, 400, origem);
  } catch (e) {
    return responder({
      erro: 'Erro inesperado: ' + (e instanceof Error ? e.message : String(e))
    }, 500, origem);
  }
});
