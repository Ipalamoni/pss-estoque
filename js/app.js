// =====================================================================
// app.js — esqueleto do sistema: login, menu, navegação e dados comuns
// =====================================================================
import { html, render, useState, useEffect, useRef, Ctx, Avisos, HostConfirmacao, avisar, Carregando, Modal, Campo } from './ui.js';
import { api } from './api.js';
import { PAPEIS, pode, porId, mensagemErro, papeisTexto } from './util.js';
import { indicadores } from './calc.js';
import { Icone } from './icones.js';

import { TelaInicio } from './telas/inicio.js';
import { TelaReceber } from './telas/receber.js';
import { TelaSaidas } from './telas/saidas.js';
import { TelaInventario } from './telas/inventario.js';
import { TelaPedidos } from './telas/pedidos.js';
import { TelaEstoque } from './telas/estoque.js';
import { TelaMovimentos } from './telas/movimentos.js';
import { TelaRelatorios } from './telas/relatorios.js';
import { TelaProdutos } from './telas/produtos.js';
import { TelaFornecedores } from './telas/fornecedores.js';
import { TelaFichas } from './telas/fichas.js';
import { TelaUsuarios } from './telas/usuarios.js';
import { TelaConfiguracoes } from './telas/configuracoes.js';
import { TelaAuditoria } from './telas/auditoria.js';
import { TelaProgramacao, TelaSaidasProducao } from './telas/producao.js';
import { TelaPainel } from './telas/painel.js';
import { TelaFinanceiro } from './telas/financeiro.js';
import { TelaPrevisao } from './telas/previsao.js';

const CFG = window.CONFIG || {};
const TODOS = Object.keys(PAPEIS).filter((p) => !['financeiro', 'faturamento'].includes(p));   // financeiro: só pedidos/pagamentos e previsão; faturamento: só previsão

// Menu: quem vê cada tela (as gravações são conferidas de novo no banco)
const MENU = [
  { id: 'inicio', titulo: 'Início', papeis: [...TODOS, 'financeiro', 'faturamento'], tela: TelaInicio },
  { id: 'financeiro', titulo: 'Financeiro · pedidos a pagar', papeis: ['admin', 'financeiro', 'diretoria'], tela: TelaFinanceiro },
  { id: 'previsao', titulo: 'Previsão de produção', papeis: ['admin', 'engenharia', 'diretoria', 'financeiro', 'faturamento'], tela: TelaPrevisao },
  { id: 'painel', titulo: 'Resumo (indicadores)', papeis: ['admin', 'diretoria', 'comprador', 'almoxarifado', 'engenharia'], tela: TelaPainel },
  { grupo: 'Operação' },
  { id: 'receber', titulo: 'Receber mercadoria', papeis: ['admin', 'almoxarifado', 'recebimento'], tela: TelaReceber },
  { id: 'saidas', titulo: 'Saídas', papeis: ['admin', 'pesagem', 'almoxarifado', 'recebimento'], tela: TelaSaidas },
  { id: 'inventario', titulo: 'Inventário', papeis: ['admin', 'almoxarifado', 'recebimento'], tela: TelaInventario },
  { grupo: 'Produção' },
  { id: 'programacao', titulo: 'Programação de produção', papeis: ['admin', 'engenharia', 'pesagem', 'diretoria'], tela: TelaProgramacao },
  { id: 'saidas-producao', titulo: 'Saídas da produção', papeis: ['admin', 'engenharia', 'pesagem', 'almoxarifado', 'diretoria'], tela: TelaSaidasProducao },
  { grupo: 'Compras e estoque' },
  { id: 'pedidos', titulo: 'Pedidos de compra', papeis: ['admin', 'comprador', 'almoxarifado', 'recebimento', 'diretoria'], tela: TelaPedidos },
  { id: 'estoque', titulo: 'Posição de estoque', papeis: TODOS, tela: TelaEstoque },
  { id: 'movimentos', titulo: 'Movimentações', papeis: TODOS, tela: TelaMovimentos },
  { id: 'relatorios', titulo: 'Relatórios', papeis: ['admin', 'comprador', 'almoxarifado', 'diretoria'], tela: TelaRelatorios },
  { grupo: 'Cadastros' },
  { id: 'produtos', titulo: 'Produtos', papeis: TODOS, tela: TelaProdutos },
  { id: 'fornecedores', titulo: 'Fornecedores', papeis: ['admin', 'comprador', 'almoxarifado', 'recebimento', 'diretoria'], tela: TelaFornecedores },
  { id: 'fichas', titulo: 'Fichas técnicas', papeis: ['admin', 'engenharia', 'pesagem', 'almoxarifado', 'diretoria'], tela: TelaFichas },
  { grupo: 'Administração', papeis: ['admin', 'diretoria'] },
  { id: 'usuarios', titulo: 'Usuários e acessos', papeis: ['admin'], tela: TelaUsuarios },
  { id: 'configuracoes', titulo: 'Configurações', papeis: ['admin'], tela: TelaConfiguracoes },
  { id: 'auditoria', titulo: 'Auditoria (log)', papeis: ['admin', 'diretoria'], tela: TelaAuditoria },
];

// ------------------------- Carregamento dos dados comuns ------------
async function carregarDados() {
  const parametros = await api.listar('parametros');
  const params = Object.fromEntries(parametros.map((p) => [p.chave, p.valor]));
  const [produtos, fornecedores, fichas, fichaItens, pedidos, pedidoItens, perfis, recebimentos, programacoes, stats] = await Promise.all([
    api.listar('produtos'), api.listar('fornecedores'), api.listar('fichas_tecnicas'), api.listar('ficha_itens'),
    api.listar('pedidos'), api.listar('pedido_itens'), api.listar('perfis'), api.listar('recebimentos'), api.listar('programacoes'),
    api.rpc('estatisticas_estoque', { p_janela: Number(params.janela_consumo_dias || 90) }),
  ]);
  const ind = indicadores(produtos, stats, params, fornecedores);
  return {
    produtos, fornecedores, fichas, fichaItens, pedidos, pedidoItens, perfis, recebimentos, programacoes, parametros, params, stats, ind,
    mapa: { produto: porId(produtos), fornecedor: porId(fornecedores), ficha: porId(fichas), perfil: porId(perfis), ind: porId(ind) },
    carregadoEm: new Date(),
  };
}

// ------------------------- Login ------------------------------------
function Login({ aoEntrar }) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [demo, setDemo] = useState([]);
  useEffect(() => { if (api.modo === 'demo') api.usuariosDemo().then(setDemo); }, []);

  // Proteção contra tentativa e erro: depois de 5 erros, espera crescente (o Supabase também limita no servidor)
  async function entrar(u = usuario, s = senha) {
    const k = 'pss-estoque-tentativas';
    let t = { n: 0, ate: 0 }; try { t = JSON.parse(localStorage.getItem(k)) || t; } catch { /* ignora */ }
    if (api.modo !== 'demo' && Date.now() < t.ate) return avisar(`Muitas tentativas erradas. Tente de novo em ${Math.ceil((t.ate - Date.now()) / 1000)} segundos.`, 'erro');
    setOcupado(true);
    try {
      const p = await api.entrar(u, s);
      try { localStorage.removeItem(k); } catch { /* ignora */ }
      api.rpc('registrar_acesso', { p_evento: 'entrada', p_detalhe: null, p_agente: navigator.userAgent }).catch(() => {});
      aoEntrar(p);
    } catch (e) {
      if (api.modo !== 'demo') { t.n += 1; if (t.n >= 5) t.ate = Date.now() + Math.min(15 * 60, 30 * 2 ** (t.n - 5)) * 1000; try { localStorage.setItem(k, JSON.stringify(t)); } catch { /* ignora */ } }
      avisar(/invalid login|credentials/i.test(mensagemErro(e)) ? 'Usuário ou senha incorretos.' : mensagemErro(e), 'erro');
    } finally { setOcupado(false); setSenha(''); }
  }
  return html`<div class="login">
    <div class="login-caixa">
      <div class="login-marca">
        <img src="icons/logo-pss.png" alt="Pães São Sebastião" />
        <strong>Compras & Estoque</strong>
      </div>
      ${api.modo === 'demo' ? html`
        <p class="login-demo">Modo demonstração: escolha um perfil para testar. Os dados são fictícios e ficam só neste navegador.</p>
        <div class="login-perfis">
          ${demo.map((p) => html`<button class="btn btn-sec" disabled=${ocupado} onClick=${() => entrar(p.usuario, '')}>
            <strong>${p.nome}</strong><small>${p.funcao || papeisTexto(p.papeis)}</small></button>`)}
        </div>` : html`
        <form onSubmit=${(e) => { e.preventDefault(); entrar(); }}>
          <${Campo} rotulo="Usuário"><input class="entrada" autocomplete="username" autocapitalize="none" value=${usuario}
            onInput=${(e) => setUsuario(e.target.value)} required /></${Campo}>
          <${Campo} rotulo="Senha"><input class="entrada" type="password" autocomplete="current-password" value=${senha}
            onInput=${(e) => setSenha(e.target.value)} required /></${Campo}>
          <button class="btn btn-pri btn-bloco" disabled=${ocupado}>${ocupado ? 'Entrando…' : 'Entrar'}</button>
        </form>
        <p class="nota">Esqueceu a senha? Fale com o administrador do sistema.</p>`}
      <${Assinatura} />
    </div>
  </div>`;
}

// ------------------------- Assinatura de propriedade -----------------
const ANO = new Date().getFullYear();
function Assinatura() {
  return html`<div class="assinatura">
    <img src="icons/logo-palamoni.png" alt="Palamoni Consultoria Empresarial" />
    <p>Compras & Estoque · versão ${window.VERSAO_APP || ''}<br />
      Software de propriedade da <b>Palamoni Consultoria Empresarial</b>, licenciado para Indústria e Comércio de Pães São Sebastião.
      © ${ANO} Palamoni Consultoria. Todos os direitos reservados.</p>
  </div>`;
}

// ------------------------- Trocar senha -----------------------------
// Regras de senha: 10+ caracteres, letras e números, diferente do usuário
export function problemaSenha(senha, usuario) {
  if (senha.length < 10) return 'A senha precisa de pelo menos 10 caracteres.';
  if (!/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) return 'Use letras e números na senha.';
  if (usuario && senha.toLowerCase().includes(String(usuario).toLowerCase())) return 'A senha não pode conter o seu usuário.';
  if (/^(.)\1+$/.test(senha) || /^(0123|1234|abcd|senha|pss)/i.test(senha)) return 'Senha muito fácil de adivinhar.';
  return null;
}
function TrocarSenha({ aoFechar, obrigatoria, usuario, aoConcluir }) {
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [oc, setOc] = useState(false);
  async function salvar() {
    const prob = problemaSenha(a, usuario?.usuario);
    if (prob) return avisar(prob, 'erro');
    if (a !== b) return avisar('As duas senhas não são iguais.', 'erro');
    setOc(true);
    try {
      await api.trocarSenha(a);
      api.rpc('registrar_acesso', { p_evento: 'senha_trocada', p_detalhe: null, p_agente: navigator.userAgent }).catch(() => {});
      avisar('Senha alterada.'); (aoConcluir || aoFechar)();
    } catch (e) { avisar(mensagemErro(e), 'erro'); } finally { setOc(false); }
  }
  return html`<${Modal} titulo=${obrigatoria ? 'Crie a sua senha' : 'Trocar minha senha'} aoFechar=${obrigatoria ? null : aoFechar}
    rodape=${html`${!obrigatoria && html`<button class="btn btn-sec" onClick=${aoFechar}>Cancelar</button>`}<button class="btn btn-pri" disabled=${oc} onClick=${salvar}>Salvar</button>`}>
    ${obrigatoria && html`<p>Este é o seu primeiro acesso (ou a senha foi redefinida). Crie uma senha só sua; ninguém, nem o administrador, fica sabendo qual é.</p>`}
    <${Campo} rotulo="Nova senha" ajuda="Pelo menos 10 caracteres, com letras e números."><input class="entrada" type="password" autocomplete="new-password" value=${a} onInput=${(e) => setA(e.target.value)} /></${Campo}>
    <${Campo} rotulo="Repita a nova senha"><input class="entrada" type="password" autocomplete="new-password" value=${b} onInput=${(e) => setB(e.target.value)} /></${Campo}>
  </${Modal}>`;
}

// Administrador: escolher entrar no próprio acesso ou VER COMO outra pessoa
// (não derruba a pessoa; o que for feito fica registrado em nome do administrador)
function EscolherVisao({ admin, aoEscolher, aoFechar }) {
  const [lista, setLista] = useState(null);
  useEffect(() => { api.listar('perfis').then((l) => setLista(l.filter((p) => p.ativo && (p.papeis || []).length))).catch(() => setLista([])); }, []);
  return html`<${Modal} titulo="Entrar como" aoFechar=${aoFechar}>
    <p class="nota">Escolha o seu acesso ou veja o sistema exatamente como outra pessoa vê (mesmas telas e botões), sem tirar a pessoa do sistema.</p>
    <div class="login-perfis">
      <button class="btn btn-pri" onClick=${() => aoEscolher(null)}><strong>Meu acesso · ${admin.nome}</strong><small>Administrador: tudo liberado</small></button>
      ${(lista || []).filter((p) => p.user_id !== admin.user_id).map((p) => html`<button class="btn btn-sec" onClick=${() => aoEscolher(p)}>
        <strong>${p.nome}</strong><small>${p.funcao || papeisTexto(p.papeis)}</small></button>`)}
    </div>
    ${!lista && html`<${Carregando} />`}
  </${Modal}>`;
}

// ------------------------- Aplicativo --------------------------------
function App() {
  const [usuario, setUsuario] = useState(undefined);
  const [dados, setDados] = useState(null);
  const [rota, setRota] = useState((location.hash || '#inicio').slice(1));
  const [estadoRota, setEstadoRota] = useState(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [senha, setSenha] = useState(false);
  const [visao, setVisao] = useState(null);
  const [novaVersao, setNovaVersao] = useState(false);
  useEffect(() => {   // aviso de versão nova (o service worker trocou os arquivos)
    if (!('serviceWorker' in navigator)) return;
    let tinha = !!navigator.serviceWorker.controller;
    const f = () => { if (tinha) setNovaVersao(true); tinha = true; };
    navigator.serviceWorker.addEventListener('controllerchange', f);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', f);
  }, []);            // perfil que o administrador está vendo
  const [escolher, setEscolher] = useState(false);
  const [recolhido, setRecolhido] = useState(() => { try { return localStorage.getItem('pss-menu-recolhido') === '1'; } catch { return false; } });
  const pilha = useRef([]);         // telas visitadas (para o botão "voltar")
  const voltando = useRef(false);
  const rotaAtual = useRef(rota);
  function alternarMenu() {
    const v = !recolhido; setRecolhido(v);
    try { localStorage.setItem('pss-menu-recolhido', v ? '1' : '0'); } catch { /* sem armazenamento */ }
  }

  useEffect(() => { api.sessaoAtual().then((u) => setUsuario(u)).catch(() => setUsuario(null)); }, []);
  useEffect(() => {
    const f = () => {
      const nova = (location.hash || '#inicio').slice(1);
      if (!voltando.current && nova !== rotaAtual.current) pilha.current.push(rotaAtual.current);
      voltando.current = false; rotaAtual.current = nova;
      setRota(nova); setMenuAberto(false);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  useEffect(() => { if (usuario) recarregar(); }, [usuario?.user_id]);
  // administrador: depois de entrar, escolhe o próprio acesso ou o de outra pessoa (uma vez por sessão)
  useEffect(() => {
    if (!usuario || !(usuario.papeis || []).includes('admin')) return;
    let ja = null; try { ja = sessionStorage.getItem('pss-estoque-visao'); } catch { /* ignora */ }
    if (ja === null && api.modo !== 'demo') setEscolher(true);
    else if (ja) api.listar('perfis', { eq: { user_id: ja } }).then((l) => l[0] && l[0].ativo && setVisao(l[0])).catch(() => {});
  }, [usuario?.user_id]);
  function escolherVisao(p) {
    setVisao(p); setEscolher(false); location.hash = '#inicio';
    try { sessionStorage.setItem('pss-estoque-visao', p ? p.user_id : ''); } catch { /* ignora */ }
    if (p) api.rpc('registrar_acesso', { p_evento: 'ver_como', p_detalhe: `${p.usuario} (${p.nome})`, p_agente: navigator.userAgent }).catch(() => {});
  }

  // Sai sozinho depois de muito tempo sem uso (computador compartilhado)
  useEffect(() => {
    if (!usuario) return;
    const limite = (CFG.SAIR_APOS_MINUTOS_SEM_USO || 480) * 60000;
    let ultimo = Date.now();
    const marcar = () => { ultimo = Date.now(); };
    ['click', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, marcar, { passive: true }));
    const t = setInterval(() => { if (Date.now() - ultimo > limite) { sair(); avisar('Sessão encerrada por falta de uso.', 'aviso'); } }, 60000);
    return () => { clearInterval(t); ['click', 'keydown', 'touchstart'].forEach((ev) => document.removeEventListener(ev, marcar)); };
  }, [usuario?.user_id]);

  async function recarregar() {
    try { setDados(await carregarDados()); }
    catch (e) { avisar(mensagemErro(e), 'erro'); }
  }
  async function sair() {
    await api.rpc('registrar_acesso', { p_evento: 'saida', p_detalhe: null, p_agente: navigator.userAgent }).catch(() => {});
    await api.sair(); setUsuario(null); setVisao(null); setDados(null); location.hash = '#inicio';
    try { sessionStorage.removeItem('pss-estoque-visao'); } catch { /* ignora */ }
  }
  function voltar() {
    const ant = pilha.current.pop() || 'inicio';
    voltando.current = true; setEstadoRota(null);
    location.hash = '#' + ant; window.scrollTo(0, 0);
  }
  function ir(destino, estado = null) { setEstadoRota(estado); if (location.hash.slice(1) === destino) setRota(destino); else location.hash = '#' + destino; window.scrollTo(0, 0); }

  if (usuario === undefined) return html`<${Carregando} />`;
  if (!usuario) return html`<${Login} aoEntrar=${setUsuario} /><${Avisos} />`;
  if (usuario.trocar_senha && api.modo !== 'demo') return html`<div class="login"><${TrocarSenha} obrigatoria usuario=${usuario}
    aoConcluir=${() => setUsuario({ ...usuario, trocar_senha: false })} /></div><${Avisos} />`;

  const real = usuario;                       // quem está logado (é quem fica registrado)
  const atual = visao || usuario;             // de quem são as telas mostradas
  const papeis = atual.papeis || [];
  const visiveis = MENU.filter((m) => !m.papeis || m.papeis.some((x) => papeis.includes(x)))
    .filter((m, i, l) => !m.grupo || (l[i + 1] && !l[i + 1].grupo));   // esconde grupo vazio
  const itemAtual = visiveis.find((m) => m.id === rota) || visiveis[0];
  const Tela = itemAtual.tela;
  const ctx = { usuario: atual, real, vendoComo: !!visao, verComo: escolherVisao, papeis, dados, recarregar, ir, voltar, rota: itemAtual.id, estadoRota, setEstadoRota, podeFazer: (a) => pode(papeis, a), api };

  return html`<${Ctx.Provider} value=${ctx}>
    ${api.modo === 'demo' && html`<div class="faixa-demo">MODO DEMONSTRAÇÃO · dados fictícios
      <button class="btn-link" onClick=${async () => { await api.reiniciarDemo(); location.reload(); }}>reiniciar dados</button>
      ${window.self !== window.top && html`<br /><small>Nesta prévia, PDF, Excel e Imprimir ficam bloqueados pelo visualizador; no endereço publicado funcionam normalmente.</small>`}</div>`}
    <header class="topo">
      <button class="btn-icone so-celular" aria-label="Abrir menu" onClick=${() => setMenuAberto(!menuAberto)}><${Icone} nome="menu" /></button>
      <a class="marca" href="#inicio" title="Início">
        <img src="icons/logo-pss.png" alt="Pães São Sebastião" />
        <span class="marca-titulo">Compras & Estoque</span>
      </a>
      <div class="topo-usuario">
        <span class="so-tela"><strong>${atual.nome}</strong><small>${atual.funcao || papeisTexto(papeis)}</small></span>
        ${(real.papeis || []).includes('admin') && html`<button class="btn-icone" title="Entrar como / ver como outra pessoa" onClick=${() => setEscolher(true)}><${Icone} nome="usuarios" /></button>`}
        <img class="selo-palamoni" src="icons/logo-palamoni-vertical.png" alt="Palamoni Consultoria" title="Produto Palamoni Consultoria Empresarial" />
        ${api.modo !== 'demo' && html`<button class="btn-icone" title="Trocar senha" onClick=${() => setSenha(true)}><${Icone} nome="chave" /></button>`}
        <button class="btn-icone" title="Sair" onClick=${sair}><${Icone} nome="sair" /></button>
      </div>
    </header>
    ${visao && html`<div class="faixa-vendo">👁 Vendo como <b>${visao.nome}</b> (${visao.funcao || papeisTexto(visao.papeis)}). O que você fizer fica registrado em seu nome (${real.nome}).
      <button class="btn btn-sec btn-peq" onClick=${() => escolherVisao(null)}>Voltar ao meu acesso</button></div>`}
    <div class="corpo">
      <nav class=${'menu' + (menuAberto ? ' aberto' : '') + (recolhido ? ' recolhido' : '')}>
        <button class="menu-recolher so-tela" title=${recolhido ? 'Mostrar o menu' : 'Esconder o menu (mais espaço na tela)'} onClick=${alternarMenu}>
          <${Icone} nome=${recolhido ? 'expandir' : 'recolher'} tam=${18} /></button>
        <div class="menu-usuario so-celular"><strong>${atual.nome}</strong><small>${atual.funcao || papeisTexto(papeis)}</small></div>
        ${visiveis.map((m) => m.grupo
          ? html`<div class="menu-grupo">${m.grupo}</div>`
          : html`<a href=${'#' + m.id} title=${m.titulo} class=${'menu-item' + (m.id === itemAtual.id ? ' ativo' : '')} onClick=${() => { setEstadoRota(null); setMenuAberto(false); }}>
              <${Icone} nome=${m.id} /> <span>${m.titulo}</span></a>`)}
        <div class="menu-rodape">
          <small>Desenvolvido por</small>
          <img class="logo-cheio" src="icons/logo-palamoni.png" alt="Palamoni Consultoria Empresarial" />
          <img class="logo-mini" src="icons/logo-palamoni-vertical.png" alt="Palamoni Consultoria Empresarial" />
          <small>versão ${window.VERSAO_APP || ''}</small>
        </div>
      </nav>
      ${menuAberto && html`<div class="menu-fundo" onClick=${() => setMenuAberto(false)}></div>`}
      <main class="conteudo">
        ${dados ? html`<${Tela} key=${itemAtual.id} />` : html`<${Carregando} texto="Carregando dados…" />`}
        <footer class="rodape"><${Assinatura} /></footer>
      </main>
    </div>
    ${senha && html`<${TrocarSenha} usuario=${real} aoFechar=${() => setSenha(false)} />`}
    ${escolher && html`<${EscolherVisao} admin=${real} aoEscolher=${escolherVisao} aoFechar=${() => escolherVisao(visao)} />`}
    ${novaVersao && html`<div class="faixa-versao">Há uma versão nova do sistema. <button class="btn btn-pri btn-peq" onClick=${() => location.reload()}>Atualizar agora</button></div>`}
    <${HostConfirmacao} />
    <${Avisos} />
  </${Ctx.Provider}>`;
}

render(html`<${App} />`, document.getElementById('app'));

// App instalável (PWA): registra o service worker quando possível
// funciona offline e pode ser instalado como aplicativo (fora da prévia, que roda dentro de um quadro)
let foraDeQuadro = true; try { foraDeQuadro = window.self === window.top; } catch { foraDeQuadro = false; }
if ('serviceWorker' in navigator && (CFG.MODO === 'supabase' || foraDeQuadro)) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
