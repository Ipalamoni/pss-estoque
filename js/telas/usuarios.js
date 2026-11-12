// Usuários e acessos (somente administrador)
import { html, useState, useApp, Modal, Campo, Etiqueta, Cabecalho, Tabela, useAcao } from '../ui.js';
import { PAPEIS, PERMISSOES, dataHora, papeisTexto } from '../util.js';
import { Icone } from '../icones.js';

const ACOES = {
  cadastro_produto: 'Cadastrar produtos', cadastro_fornecedor: 'Cadastrar fornecedores', ficha_tecnica: 'Editar fichas técnicas',
  pedido: 'Criar/editar pedidos de compra', recebimento: 'Receber mercadoria', saida_receita: 'Saída por receita', saida_avulsa: 'Saída avulsa (matéria-prima)',
  saida_almox: 'Saída almoxarifado', inventario: 'Inventário', corrigir: 'Corrigir lançamentos de qualquer usuário', implantacao: 'Implantação de saldo',
  usuarios: 'Usuários e acessos', parametros: 'Configurações', auditoria: 'Ver auditoria (log)', importacao: 'Importar planilhas (cadastro em massa)',
};

export function TelaUsuarios() {
  const { dados, api, usuario } = useApp();
  const [editando, setEditando] = useState(null);
  const [novo, setNovo] = useState(false);
  const CFG = window.CONFIG || {};
  return html`
    <${Cabecalho} titulo="Usuários e acessos" sub="Cada pessoa tem login próprio. Os papéis definem o que ela pode fazer (uma pessoa pode ter mais de um).">
      ${api.modo === 'demo' && html`<button class="btn btn-pri" onClick=${() => setNovo(true)}><${Icone} nome="mais" tam=${18} /> Novo usuário (demo)</button>`}
    </${Cabecalho}>
    ${api.modo !== 'demo' && html`<details class="legenda" open=${dados.perfis.some((p) => !p.ativo)}>
      <summary>Como criar um login novo (passo a passo)</summary>
      <ol>
        <li>Abra o painel do Supabase → <b>Authentication</b> → <b>Users</b> → <b>Add user</b> → <b>Create new user</b>.</li>
        <li>E-mail: <code>nomedousuario@${CFG.DOMINIO_LOGIN || 'estoque.pss'}</code> (ex.: <code>carlos@${CFG.DOMINIO_LOGIN || 'estoque.pss'}</code>). A pessoa vai entrar só com <b>carlos</b>.</li>
        <li>Digite uma senha inicial (mínimo 8 caracteres) e marque <b>Auto Confirm User</b>. Clique em <b>Create user</b>.</li>
        <li>Volte aqui e atualize a página: o usuário aparece como <b>inativo</b>. Clique nele, marque os papéis e marque <b>ativo</b>.</li>
        <li>Senha esquecida: o e-mail é fictício, então “recuperar senha” por e-mail não funciona. Use o comando pronto do guia (docs/PUBLICAR.md, “Trocar senha esquecida”) no SQL Editor.</li>
      </ol>
    </details>`}
    <${Tabela} linhas=${dados.perfis} chave="user_id" aoClicar=${setEditando} ordemInicial=${{ chave: 'nome', dir: 1 }} colunas=${[
      { chave: 'nome', titulo: 'Nome', render: (p) => html`<b>${p.nome}</b>${p.user_id === usuario.user_id ? ' (você)' : ''}` },
      { chave: 'funcao', titulo: 'Função', render: (p) => p.funcao || '–' },
      { chave: 'usuario', titulo: 'Login' },
      { chave: 'papeis', titulo: 'Papéis', valor: (p) => papeisTexto(p.papeis), render: (p) => ((p.papeis || []).length ? papeisTexto(p.papeis) : html`<${Etiqueta} cor="laranja">sem papel</${Etiqueta}>`) },
      { chave: 'ativo', titulo: 'Situação', render: (p) => (p.ativo ? html`<${Etiqueta} cor="verde">ativo</${Etiqueta}>` : html`<${Etiqueta} cor="cinza">inativo</${Etiqueta}>`) },
      { chave: 'criado_em', titulo: 'Criado em', render: (p) => dataHora(p.criado_em) },
    ]} />
    <h2 class="titulo-secao">O que cada papel pode fazer</h2>
    <p class="nota">Exemplo: a responsável da pesagem que também é engenheira pode ter os papéis <b>Pesagem + Engenharia de produção</b>.</p>
    <div class="tabela-rolagem"><table class="tabela matriz">
      <thead><tr><th>Ação</th>${Object.values(PAPEIS).map((p) => html`<th>${p}</th>`)}</tr></thead>
      <tbody>${Object.entries(ACOES).map(([k, t]) => html`<tr><td>${t}</td>${Object.keys(PAPEIS).map((p) => html`<td class="c">${PERMISSOES[k].includes(p) ? '✓' : ''}</td>`)}</tr>`)}
        <tr><td>Consultar estoque, movimentações e receitas</td>${Object.keys(PAPEIS).map(() => html`<td class="c">✓</td>`)}</tr>
        <tr><td>Dar ciência de divergência / recebimento sem pedido</td>${Object.keys(PAPEIS).map((p) => html`<td class="c">${PERMISSOES.pedido.includes(p) ? '✓' : ''}</td>`)}</tr>
        <tr><td>Alterar a receita só para a produção do dia</td>${Object.keys(PAPEIS).map((p) => html`<td class="c">${PERMISSOES.saida_receita.includes(p) ? '✓' : ''}</td>`)}</tr>
        <tr><td>Corrigir os próprios lançamentos do dia</td>${Object.keys(PAPEIS).map((p) => html`<td class="c">${['admin', 'almoxarifado', 'recebimento', 'pesagem'].includes(p) ? '✓' : ''}</td>`)}</tr>
      </tbody></table></div>
    <p class="nota">A regra vale no banco de dados: mesmo que alguém mexa no aplicativo, o servidor recusa o que o papel não permite.</p>
    ${editando && html`<${FormPerfil} perfil=${editando} aoFechar=${() => setEditando(null)} />`}
    ${novo && html`<${NovoDemo} aoFechar=${() => setNovo(false)} />`}`;
}

function FormPerfil({ perfil, aoFechar }) {
  const { recarregar, api } = useApp();
  const [f, setF] = useState({ nome: perfil.nome, funcao: perfil.funcao || '', papeis: [...(perfil.papeis || [])], ativo: perfil.ativo });
  const alternar = (k) => setF((x) => ({ ...x, papeis: x.papeis.includes(k) ? x.papeis.filter((y) => y !== k) : [...x.papeis, k] }));
  const [ocupado, executar] = useAcao();
  async function salvar() {
    const ok = await executar(() => api.rpc('salvar_perfil', { p: { user_id: perfil.user_id, ...f } }), 'Usuário atualizado.');
    if (ok) { await recarregar(); aoFechar(); }
  }
  return html`<${Modal} titulo=${`Usuário: ${perfil.usuario}`} aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Cancelar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>Salvar</button>`}>
    <${Campo} rotulo="Nome para exibir"><input class="entrada" value=${f.nome} onInput=${(e) => setF({ ...f, nome: e.target.value })} /></${Campo}>
    <${Campo} rotulo="Função / cargo" ajuda="Aparece nos registros: ex. “Juliano (Engenheiro de produção)”."><input class="entrada" value=${f.funcao} placeholder="ex.: Engenheiro de produção" onInput=${(e) => setF({ ...f, funcao: e.target.value })} /></${Campo}>
    <div class="campo"><span class="campo-rotulo">Papéis no sistema (o que pode fazer)</span>
      <div class="lista-papeis">${Object.entries(PAPEIS).map(([k, t]) => html`<label class="check"><input type="checkbox" checked=${f.papeis.includes(k)} onChange=${() => alternar(k)} /> ${t}</label>`)}</div>
      <small class="campo-ajuda">Sem nenhum papel a pessoa não consegue entrar.</small></div>
    <label class="check"><input type="checkbox" checked=${f.ativo} onChange=${(e) => setF({ ...f, ativo: e.target.checked })} /> Ativo (pode entrar no sistema)</label>
    <p class="nota">Desativar bloqueia o acesso na hora, mas mantém o nome dele em todo o histórico.</p>
  </${Modal}>`;
}

function NovoDemo({ aoFechar }) {
  const { recarregar, api } = useApp();
  const [u, setU] = useState(''); const [nome, setNome] = useState(''); const [funcao, setFuncao] = useState('');
  const [ocupado, executar] = useAcao();
  async function salvar() { if (await executar(() => api.rpc('demo_criar_usuario', { usuario: u, nome, funcao }), 'Usuário criado (inativo). Ative e escolha o papel.')) { await recarregar(); aoFechar(); } }
  return html`<${Modal} titulo="Novo usuário (demonstração)" aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Cancelar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>Criar</button>`}>
    <p class="nota">No sistema real, o login é criado no painel do Supabase (com senha). Aqui é só para testar o fluxo.</p>
    <${Campo} rotulo="Login"><input class="entrada" value=${u} onInput=${(e) => setU(e.target.value)} /></${Campo}>
    <${Campo} rotulo="Nome"><input class="entrada" value=${nome} onInput=${(e) => setNome(e.target.value)} /></${Campo}>
    <${Campo} rotulo="Função / cargo"><input class="entrada" value=${funcao} onInput=${(e) => setFuncao(e.target.value)} /></${Campo}>
  </${Modal}>`;
}
