// Cadastro de fornecedores
import { html, useState, useMemo, useApp, Tabela, Modal, Campo, Numero, Busca, Etiqueta, Cabecalho, useAcao, confirmar, n } from '../ui.js';
import { contem, hojeISO, pl } from '../util.js';
import { Exportar } from '../exportar.js';
import { Icone } from '../icones.js';
import { UltimaAlteracao, HistoricoAuditoria } from '../historico.js';

export function TelaFornecedores() {
  const { dados, podeFazer } = useApp();
  const [busca, setBusca] = useState('');
  const [inativos, setInativos] = useState(false);
  const [editando, setEditando] = useState(null);
  const pode = podeFazer('cadastro_fornecedor');
  const linhas = useMemo(() => dados.fornecedores.filter((f) => (inativos || f.ativo) && contem(`${f.nome} ${f.razao_social || ''} ${f.cnpj} ${f.contato} ${f.cidade || ''}`, busca)), [dados, busca, inativos]);
  const qtdProdutos = (id) => dados.produtos.filter((p) => p.fornecedor_padrao_id === id).length;

  return html`
    <${Cabecalho} titulo="Fornecedores">
      <${Exportar} titulo="Cadastro de fornecedores" filtros=${pl(linhas.length, 'fornecedor', 'fornecedores')} arquivo=${`fornecedores-${hojeISO()}`} linhas=${linhas} colunas=${[
        { titulo: 'Nome fantasia', valor: (f) => f.nome, largura: 28 }, { titulo: 'Razão social', valor: (f) => f.razao_social, largura: 32 }, { titulo: 'CNPJ', valor: (f) => f.cnpj },
        { titulo: 'Inscr. estadual', valor: (f) => f.inscricao_estadual }, { titulo: 'Contato', valor: (f) => f.contato }, { titulo: 'Telefone', valor: (f) => f.telefone },
        { titulo: 'WhatsApp', valor: (f) => f.whatsapp }, { titulo: 'E-mail', valor: (f) => f.email, largura: 28 }, { titulo: 'Endereço', valor: (f) => f.endereco, largura: 30 },
        { titulo: 'Bairro', valor: (f) => f.bairro }, { titulo: 'Cidade', valor: (f) => f.cidade }, { titulo: 'UF', valor: (f) => f.uf }, { titulo: 'CEP', valor: (f) => f.cep },
        { titulo: 'Condição de pagamento', valor: (f) => f.condicao_pagamento }, { titulo: 'Prazo (dias)', valor: (f) => f.prazo_entrega_dias, num: true },
        { titulo: 'Ativo', valor: (f) => (f.ativo ? 'sim' : 'não') }]} />
      ${pode && html`<button class="btn btn-pri" onClick=${() => setEditando({})}><${Icone} nome="mais" tam=${18} /> Novo fornecedor</button>`}
    </${Cabecalho}>
    <div class="filtros">
      <${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Buscar por nome, CNPJ ou contato" />
      <label class="check"><input type="checkbox" checked=${inativos} onChange=${(e) => setInativos(e.target.checked)} /> Mostrar inativos</label>
    </div>
    <${Tabela} linhas=${linhas} aoClicar=${setEditando} ordemInicial=${{ chave: 'nome', dir: 1 }}
      colunas=${[
        { chave: 'nome', titulo: 'Fornecedor', render: (f) => html`<b>${f.nome}</b>${!f.ativo && html` <${Etiqueta}>inativo</${Etiqueta}>`}` },
        { chave: 'cnpj', titulo: 'CNPJ' },
        { chave: 'cidade', titulo: 'Cidade', render: (f) => [f.cidade, f.uf].filter(Boolean).join('/') || '–' },
        { chave: 'contato', titulo: 'Contato', render: (f) => [f.contato, f.whatsapp || f.telefone].filter(Boolean).join(' · ') },
        { chave: 'email', titulo: 'E-mail' },
        { chave: 'prazo_entrega_dias', titulo: 'Prazo (dias)', num: true },
        { chave: 'qtd', titulo: 'Produtos', num: true, valor: (f) => qtdProdutos(f.id), render: (f) => qtdProdutos(f.id) },
      ]} />
    ${editando && html`<${FormFornecedor} fornecedor=${editando} aoFechar=${() => setEditando(null)} somenteLeitura=${!pode} />`}`;
}

function FormFornecedor({ fornecedor, aoFechar, somenteLeitura }) {
  const { recarregar, api } = useApp();
  const [f, setF] = useState({ nome: '', razao_social: '', cnpj: '', inscricao_estadual: '', contato: '', telefone: '', whatsapp: '', email: '',
    endereco: '', bairro: '', cidade: '', uf: '', cep: '', condicao_pagamento: '', prazo_entrega_dias: '', observacao: '', ativo: true,
    ...Object.fromEntries(Object.entries(fornecedor).map(([k, v]) => [k, v ?? ''])) });
  const [ocupado, executar] = useAcao();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  async function salvar() {
    const ok = await executar(() => api.rpc('salvar_fornecedor', { p: { ...f, id: fornecedor.id || null, prazo_entrega_dias: n(f.prazo_entrega_dias) } }), 'Fornecedor salvo.');
    if (ok) { await recarregar(); aoFechar(); }
  }
  async function alternarAtivo() {
    const desativar = fornecedor.ativo !== false;
    const ok = await confirmar({ titulo: desativar ? 'Desativar fornecedor' : 'Reativar fornecedor', perigo: desativar, ok: desativar ? 'Desativar' : 'Reativar',
      mensagem: desativar ? `"${fornecedor.nome}" deixa de aparecer para novos pedidos. Pedidos e histórico continuam guardados.` : `"${fornecedor.nome}" volta a aparecer nas listas.` });
    if (!ok) return;
    if (await executar(() => api.rpc('salvar_fornecedor', { p: { ...fornecedor, ativo: !desativar } }), desativar ? 'Fornecedor desativado.' : 'Fornecedor reativado.')) { await recarregar(); aoFechar(); }
  }
  return html`<${Modal} titulo=${fornecedor.id ? `${fornecedor.nome}${fornecedor.ativo === false ? ' (inativo)' : ''}` : 'Novo fornecedor'} aoFechar=${aoFechar} largo
    rodape=${somenteLeitura ? html`<button class="btn btn-sec" onClick=${aoFechar}>Fechar</button>`
      : html`${fornecedor.id && html`<button class=${'btn ' + (fornecedor.ativo === false ? 'btn-sec' : 'btn-perigo-sec')} disabled=${ocupado} onClick=${alternarAtivo}>
          ${fornecedor.ativo === false ? 'Reativar fornecedor' : 'Desativar fornecedor'}</button>`}<span class="espaco"></span>
        <button class="btn btn-sec" onClick=${aoFechar}>Cancelar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>${ocupado ? 'Salvando…' : 'Salvar'}</button>`}>
    <fieldset disabled=${somenteLeitura} class="grade">
      <${Campo} rotulo="Nome fantasia (aparece nas telas)" obrigatorio><input class="entrada" value=${f.nome} onInput=${set('nome')} /></${Campo}>
      <${Campo} rotulo="Razão social" classe="larga2"><input class="entrada" value=${f.razao_social} onInput=${set('razao_social')} /></${Campo}>
      <${Campo} rotulo="CNPJ"><input class="entrada" inputmode="numeric" value=${f.cnpj} onInput=${set('cnpj')} placeholder="00.000.000/0000-00" /></${Campo}>
      <${Campo} rotulo="Inscrição estadual"><input class="entrada" value=${f.inscricao_estadual} onInput=${set('inscricao_estadual')} /></${Campo}>
      <${Campo} rotulo="Contato (vendedor)"><input class="entrada" value=${f.contato} onInput=${set('contato')} /></${Campo}>
      <${Campo} rotulo="Telefone"><input class="entrada" inputmode="tel" value=${f.telefone} onInput=${set('telefone')} /></${Campo}>
      <${Campo} rotulo="WhatsApp"><input class="entrada" inputmode="tel" value=${f.whatsapp} onInput=${set('whatsapp')} /></${Campo}>
      <${Campo} rotulo="E-mail"><input class="entrada" type="email" value=${f.email} onInput=${set('email')} /></${Campo}>
      <${Campo} rotulo="Endereço (rua, número)" classe="larga2"><input class="entrada" value=${f.endereco} onInput=${set('endereco')} /></${Campo}>
      <${Campo} rotulo="Bairro"><input class="entrada" value=${f.bairro} onInput=${set('bairro')} /></${Campo}>
      <${Campo} rotulo="Cidade"><input class="entrada" value=${f.cidade} onInput=${set('cidade')} /></${Campo}>
      <${Campo} rotulo="UF"><input class="entrada" maxlength="2" value=${f.uf} onInput=${(e) => set('uf')(e.target.value.toUpperCase())} placeholder="SP" /></${Campo}>
      <${Campo} rotulo="CEP"><input class="entrada" inputmode="numeric" value=${f.cep} onInput=${set('cep')} /></${Campo}>
      <${Campo} rotulo="Condição de pagamento" ajuda="Vem preenchida no pedido."><input class="entrada" value=${f.condicao_pagamento} onInput=${set('condicao_pagamento')} placeholder="ex.: 28 dias" /></${Campo}>
      <${Campo} rotulo="Prazo de entrega habitual (dias)" ajuda="Sugere a previsão de entrega no pedido."><${Numero} valor=${f.prazo_entrega_dias} aoMudar=${set('prazo_entrega_dias')} /></${Campo}>
      <${Campo} rotulo="Observação" classe="larga"><textarea class="entrada" rows="2" value=${f.observacao} onInput=${set('observacao')}></textarea></${Campo}>
    </fieldset>
    ${fornecedor.id && html`<${UltimaAlteracao} reg=${fornecedor} /><${HistoricoAuditoria} tabela="fornecedores" id=${fornecedor.id} />`}
  </${Modal}>`;
}
