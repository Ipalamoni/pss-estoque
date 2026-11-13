// Usuários e acessos (somente administrador)
import { html, useState, useEffect, useApp, Modal, Campo, Etiqueta, Cabecalho, Tabela, Abas, Carregando, useAcao, confirmar, avisar } from '../ui.js';
import { PAPEIS, PERMISSOES, dataHora, papeisTexto, nomeUsuario, mensagemErro } from '../util.js';
import { Icone } from '../icones.js';

const ACOES = {
  cadastro_produto: 'Cadastrar produtos', cadastro_fornecedor: 'Cadastrar fornecedores', ficha_tecnica: 'Editar fichas técnicas',
  pedido: 'Criar/editar pedidos de compra', recebimento: 'Receber mercadoria', saida_receita: 'Saída por receita', saida_avulsa: 'Saída avulsa (matéria-prima)',
  saida_almox: 'Saída almoxarifado', inventario: 'Inventário', corrigir: 'Corrigir lançamentos de qualquer usuário', implantacao: 'Implantação de saldo',
  usuarios: 'Usuários, senhas, bloqueio e "ver como"', parametros: 'Configurações', auditoria: 'Ver auditoria (log)', importacao: 'Importar planilhas (cadastro em massa)',
  programacao: 'Programar e finalizar produção',
  financeiro: 'Marcar pedido como lançado no contas a pagar', data_pagamento: 'Ajustar previsão de pagamento do pedido',
  previsao_producao: 'Ver previsão de produção (receitas × rendimento)',
  custos: 'Gestão de custos (último custo, custo médio, custo das receitas)',
  contagem_inicial: 'Digitar a contagem inicial (saldo de abertura)',
};

export function TelaUsuarios() {
  const { dados, usuario, real } = useApp();
  const [editando, setEditando] = useState(null);
  const [novo, setNovo] = useState(false);
  const [senhaNova, setSenhaNova] = useState(null);     // { usuario, senha } mostrada uma única vez
  const [aba, setAba] = useState('usuarios');
  const eu = real || usuario;
  return html`
    <${Cabecalho} titulo="Usuários e acessos" sub="Cada pessoa tem login e senha próprios. Os papéis definem o que ela pode fazer (uma pessoa pode ter mais de um).">
      <button class="btn btn-pri" onClick=${() => setNovo(true)}><${Icone} nome="mais" tam=${18} /> Novo usuário</button>
    </${Cabecalho}>
    <${Abas} abas=${[{ id: 'usuarios', titulo: 'Usuários' }, { id: 'acessos', titulo: 'Registro de acessos' }, { id: 'papeis', titulo: 'O que cada papel faz' }]} ativa=${aba} aoMudar=${setAba} />
    ${aba === 'usuarios' && html`
    <${Tabela} linhas=${dados.perfis} chave="user_id" aoClicar=${setEditando} ordemInicial=${{ chave: 'nome', dir: 1 }} colunas=${[
      { chave: 'nome', titulo: 'Nome', render: (p) => html`<b>${p.nome}</b>${p.user_id === eu.user_id ? ' (você)' : ''}` },
      { chave: 'funcao', titulo: 'Função', render: (p) => p.funcao || '–' },
      { chave: 'usuario', titulo: 'Login' },
      { chave: 'papeis', titulo: 'Papéis', valor: (p) => papeisTexto(p.papeis), render: (p) => ((p.papeis || []).length ? papeisTexto(p.papeis) : html`<${Etiqueta} cor="laranja">sem papel</${Etiqueta}>`) },
      { chave: 'ativo', titulo: 'Situação', render: (p) => (p.ativo ? html`<${Etiqueta} cor="verde">ativo</${Etiqueta}>` : html`<${Etiqueta} cor="vermelho">bloqueado</${Etiqueta}>`) },
      { chave: 'criado_em', titulo: 'Criado em', render: (p) => dataHora(p.criado_em) },
    ]} />
    <p class="nota">Clique na pessoa para mudar papéis, ver como ela vê o sistema, redefinir a senha ou bloquear. Ninguém é apagado: bloqueado não entra, mas o nome continua no histórico.</p>`}
    ${aba === 'acessos' && html`<${RegistroAcessos} />`}
    ${aba === 'papeis' && html`
    <p class="nota">Exemplo: a responsável da pesagem que também é engenheira pode ter os papéis <b>Pesagem + Engenharia de produção</b>.</p>
    <div class="tabela-rolagem"><table class="tabela matriz">
      <thead><tr><th>Ação</th>${Object.values(PAPEIS).map((p) => html`<th>${p}</th>`)}</tr></thead>
      <tbody>${Object.entries(ACOES).map(([k, t]) => html`<tr><td>${t}</td>${Object.keys(PAPEIS).map((p) => html`<td class="c">${PERMISSOES[k].includes(p) ? '✓' : ''}</td>`)}</tr>`)}
        <tr><td>Consultar estoque, movimentações e receitas</td>${Object.keys(PAPEIS).map((p) => html`<td class="c">${['financeiro', 'faturamento'].includes(p) ? '' : '✓'}</td>`)}</tr>
        <tr><td>Consultar pedidos de compra e situação da entrega</td>${Object.keys(PAPEIS).map((p) => html`<td class="c">${p === 'faturamento' ? '' : '✓'}</td>`)}</tr>
        <tr><td>Dar ciência de divergência / recebimento sem pedido</td>${Object.keys(PAPEIS).map((p) => html`<td class="c">${PERMISSOES.pedido.includes(p) ? '✓' : ''}</td>`)}</tr>
        <tr><td>Alterar a receita só para a produção do dia</td>${Object.keys(PAPEIS).map((p) => html`<td class="c">${PERMISSOES.saida_receita.includes(p) ? '✓' : ''}</td>`)}</tr>
        <tr><td>Corrigir os próprios lançamentos do dia</td>${Object.keys(PAPEIS).map((p) => html`<td class="c">${['admin', 'almoxarifado', 'recebimento', 'pesagem'].includes(p) ? '✓' : ''}</td>`)}</tr>
      </tbody></table></div>
    <p class="nota">A regra vale no banco de dados: mesmo que alguém mexa no aplicativo, o servidor recusa o que o papel não permite.</p>`}
    ${editando && html`<${FormPerfil} perfil=${editando} aoFechar=${() => setEditando(null)} aoSenha=${(x) => { setEditando(null); setSenhaNova(x); }} />`}
    ${novo && html`<${NovoUsuario} aoFechar=${() => setNovo(false)} aoCriado=${(x) => { setNovo(false); setSenhaNova(x); }} />`}
    ${senhaNova && html`<${SenhaTemporaria} dados=${senhaNova} aoFechar=${() => setSenhaNova(null)} />`}`;
}

// A senha temporária aparece UMA vez; no primeiro acesso a pessoa cria a dela
function SenhaTemporaria({ dados: d, aoFechar }) {
  const copiar = () => navigator.clipboard?.writeText(`Usuário: ${d.usuario}\nSenha temporária: ${d.senha}`).then(() => avisar('Copiado.')).catch(() => {});
  return html`<${Modal} titulo="Senha temporária" aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-sec" onClick=${copiar}>Copiar usuário e senha</button><button class="btn btn-pri" onClick=${aoFechar}>Já anotei</button>`}>
    <p>Entregue pessoalmente para <b>${d.nome || d.usuario}</b> (não mande em grupo):</p>
    <p>Usuário: <b>${d.usuario}</b></p>
    <div class="senha-temporaria">${d.senha}</div>
    <p class="nota">Ela só aparece agora. No primeiro acesso o sistema obriga a pessoa a criar a própria senha. Se perder, use "Redefinir senha".</p>
  </${Modal}>`;
}

function NovoUsuario({ aoFechar, aoCriado }) {
  const { recarregar, api } = useApp();
  const [f, setF] = useState({ usuario: '', nome: '', funcao: '', papeis: [] });
  const alternar = (k) => setF((x) => ({ ...x, papeis: x.papeis.includes(k) ? x.papeis.filter((y) => y !== k) : [...x.papeis, k] }));
  const [ocupado, executar] = useAcao();
  async function salvar() {
    const r = await executar(() => api.adminUsuarios({ acao: 'criar', ...f }), 'Usuário criado.');
    if (r) { await recarregar(); aoCriado({ usuario: r.usuario, nome: f.nome, senha: r.senha_temporaria }); }
  }
  return html`<${Modal} titulo="Novo usuário" aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Cancelar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>${ocupado ? 'Criando…' : 'Criar e gerar senha'}</button>`}>
    <${Campo} rotulo="Login (usuário)" obrigatorio ajuda="Minúsculas, sem espaço e sem acento. Ex.: carlos, nayara, ivan."><input class="entrada" autocapitalize="none" value=${f.usuario}
      onInput=${(e) => setF({ ...f, usuario: e.target.value.toLowerCase().replace(/\s/g, '') })} /></${Campo}>
    <${Campo} rotulo="Nome para exibir" obrigatorio><input class="entrada" value=${f.nome} onInput=${(e) => setF({ ...f, nome: e.target.value })} /></${Campo}>
    <${Campo} rotulo="Função / cargo"><input class="entrada" value=${f.funcao} placeholder="ex.: Responsável da pesagem" onInput=${(e) => setF({ ...f, funcao: e.target.value })} /></${Campo}>
    <div class="campo"><span class="campo-rotulo">Papéis (o que pode fazer)</span>
      <div class="lista-papeis">${Object.entries(PAPEIS).map(([k, t]) => html`<label class="check"><input type="checkbox" checked=${f.papeis.includes(k)} onChange=${() => alternar(k)} /> ${t}</label>`)}</div></div>
    <p class="nota">O sistema gera uma senha temporária forte. A pessoa troca no primeiro acesso.</p>
  </${Modal}>`;
}

function RegistroAcessos() {
  const { api, dados } = useApp();
  const [l, setL] = useState(null);
  useEffect(() => { api.listar('acessos', { ordem: ['id', 'desc'], limite: 500 }).then(setL).catch((e) => { avisar(mensagemErro(e), 'erro'); setL([]); }); }, []);
  if (!l) return html`<${Carregando} />`;
  const EV = { entrada: 'Entrou', saida: 'Saiu', ver_como: 'Viu como', senha_trocada: 'Trocou a senha', usuario_criado: 'Criou usuário', senha_redefinida: 'Redefiniu senha de',
    usuario_bloqueado: 'Bloqueou', usuario_desbloqueado: 'Desbloqueou' };
  return html`<p class="nota">Últimos 500 registros. Ninguém consegue alterar ou apagar esta lista.</p>
    <${Tabela} linhas=${l} max=${100} colunas=${[
    { chave: 'id', titulo: 'Data/hora', valor: (a) => a.id, render: (a) => dataHora(a.data_hora) },
    { chave: 'u', titulo: 'Quem', render: (a) => nomeUsuario(dados.mapa.perfil.get(a.usuario_id)) },
    { chave: 'evento', titulo: 'O quê', render: (a) => html`<${Etiqueta} cor=${['usuario_bloqueado', 'ver_como'].includes(a.evento) ? 'laranja' : 'cinza'}>${EV[a.evento] || a.evento}</${Etiqueta}>` },
    { chave: 'detalhe', titulo: 'Detalhe', render: (a) => html`<small>${a.detalhe || ''}</small>` },
    { chave: 'agente', titulo: 'Aparelho', render: (a) => html`<small>${aparelho(a.agente)}</small>` },
  ]} />`;
}
const aparelho = (ua) => (!ua ? '' : /iphone|ipad/i.test(ua) ? 'iPhone/iPad' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : 'outro');

function FormPerfil({ perfil, aoFechar, aoSenha }) {
  const { recarregar, api, real, usuario, verComo } = useApp();
  const eu = (real || usuario).user_id === perfil.user_id;
  async function redefinir() {
    if (!(await confirmar({ titulo: 'Redefinir senha', ok: 'Gerar senha nova', mensagem: `Gerar uma senha temporária nova para ${perfil.nome}? A senha atual deixa de funcionar.` }))) return;
    const r = await executar(() => api.adminUsuarios({ acao: 'redefinir_senha', user_id: perfil.user_id }), 'Senha redefinida.');
    if (r) aoSenha({ usuario: perfil.usuario, nome: perfil.nome, senha: r.senha_temporaria });
  }
  async function bloquear(b) {
    if (b && !(await confirmar({ titulo: 'Bloquear usuário', ok: 'Bloquear', perigo: true, mensagem: `${perfil.nome} perde o acesso na hora (em todos os aparelhos). O histórico continua com o nome dele.` }))) return;
    if (await executar(() => api.adminUsuarios({ acao: 'bloquear', user_id: perfil.user_id, bloquear: b }), b ? 'Usuário bloqueado.' : 'Usuário desbloqueado.')) { await recarregar(); aoFechar(); }
  }
  const [f, setF] = useState({ nome: perfil.nome, funcao: perfil.funcao || '', papeis: [...(perfil.papeis || [])], ativo: perfil.ativo });
  const alternar = (k) => setF((x) => ({ ...x, papeis: x.papeis.includes(k) ? x.papeis.filter((y) => y !== k) : [...x.papeis, k] }));
  const [ocupado, executar] = useAcao();
  async function salvar() {
    const ok = await executar(() => api.rpc('salvar_perfil', { p: { user_id: perfil.user_id, ...f } }), 'Usuário atualizado.');
    if (ok) { await recarregar(); aoFechar(); }
  }
  return html`<${Modal} titulo=${`Usuário: ${perfil.usuario}`} aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Cancelar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>Salvar</button>`}>
    ${!eu && html`<div class="cabecalho-acoes acoes-usuario">
      ${perfil.ativo && verComo && html`<button class="btn btn-sec btn-peq" onClick=${() => { aoFechar(); verComo(perfil); }}>👁 Ver como ${perfil.nome}</button>`}
      <button class="btn btn-sec btn-peq" disabled=${ocupado} onClick=${redefinir}>Redefinir senha</button>
      ${perfil.ativo ? html`<button class="btn btn-perigo-sec btn-peq" disabled=${ocupado} onClick=${() => bloquear(true)}>Bloquear</button>`
        : html`<button class="btn btn-sec btn-peq" disabled=${ocupado} onClick=${() => bloquear(false)}>Desbloquear</button>`}</div>`}
    <${Campo} rotulo="Nome para exibir"><input class="entrada" value=${f.nome} onInput=${(e) => setF({ ...f, nome: e.target.value })} /></${Campo}>
    <${Campo} rotulo="Função / cargo" ajuda="Aparece nos registros: ex. “Juliano (Engenheiro de produção)”."><input class="entrada" value=${f.funcao} placeholder="ex.: Engenheiro de produção" onInput=${(e) => setF({ ...f, funcao: e.target.value })} /></${Campo}>
    <div class="campo"><span class="campo-rotulo">Papéis no sistema (o que pode fazer)</span>
      <div class="lista-papeis">${Object.entries(PAPEIS).map(([k, t]) => html`<label class="check"><input type="checkbox" checked=${f.papeis.includes(k)} onChange=${() => alternar(k)} /> ${t}</label>`)}</div>
      <small class="campo-ajuda">Sem nenhum papel a pessoa não consegue entrar.</small></div>
    <p class="nota">Situação: <b>${perfil.ativo ? 'ativo' : 'bloqueado'}</b>. Para bloquear ou liberar o acesso use os botões acima.</p>
  </${Modal}>`;
}
