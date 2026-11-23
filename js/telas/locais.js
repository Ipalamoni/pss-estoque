// =====================================================================
// UNIDADES E LOCAIS (administrador): onde o estoque fica e quem opera cada local
// =====================================================================
import { html, useState, useApp, Tabela, Modal, Campo, Etiqueta, useAcao } from '../ui.js';
import { PAPEIS, TIPOS_LOCAL, num } from '../util.js';
import { Icone } from '../icones.js';

export function UnidadesLocais() {
  const { dados } = useApp();
  const [unid, setUnid] = useState(null);
  const [loc, setLoc] = useState(null);
  const itensNo = (id) => dados.estoqueLocal.filter((e) => e.local_id === id && (Math.abs(Number(e.disponivel)) > 0.0001 || Math.abs(Number(e.separado)) > 0.0001)).length;
  return html`<section class="painel">
    <div class="titulo-com-acao"><h3>Unidades</h3><button class="btn btn-sec btn-peq" onClick=${() => setUnid({})}><${Icone} nome="mais" tam=${14} /> Unidade</button></div>
    <div class="unidades">${dados.unidades.map((u) => html`<div class=${'unidade' + (u.ativa ? '' : ' inativa')} key=${u.id}>
      <div class="unidade-topo"><b>${u.nome}</b>${u.cidade && html`<small>${u.cidade}</small>`}${!u.ativa && html`<${Etiqueta}>inativa</${Etiqueta}>`}
        <span class="espaco"></span><button class="btn-link" onClick=${() => setUnid(u)}>editar</button>
        <button class="btn btn-sec btn-peq" onClick=${() => setLoc({ unidade_id: u.id })}><${Icone} nome="mais" tam=${14} /> Local</button></div>
      <${Tabela} linhas=${dados.locais.filter((l) => l.unidade_id === u.id)} aoClicar=${setLoc} vazio="Nenhum local nesta unidade." colunas=${[
        { chave: 'ordem', titulo: '#', num: true },
        { chave: 'nome', titulo: 'Local', render: (l) => html`<b>${l.nome}</b>${!l.ativo ? html` <${Etiqueta}>inativo</${Etiqueta}>` : ''}` },
        { chave: 'tipo', titulo: 'Tipo', render: (l) => TIPOS_LOCAL[l.tipo] || l.tipo },
        { chave: 'papeis', titulo: 'Quem opera', render: (l) => html`<span class="etqs">${(l.papeis || []).map((p) => html`<${Etiqueta} cor="azul">${PAPEIS[p] || p}</${Etiqueta}>`)}</span>` },
        { chave: 'itens', titulo: 'Itens com saldo', num: true, valor: (l) => itensNo(l.id), render: (l) => num(itensNo(l.id), 0) },
      ]} />
    </div>`)}</div>
    <p class="nota">Cada pessoa vê e movimenta só os locais em que o papel dela está marcado. Administração, diretoria e engenharia veem tudo nos relatórios.</p>
    ${unid && html`<${EditarUnidade} u=${unid} aoFechar=${() => setUnid(null)} />`}
    ${loc && html`<${EditarLocal} l=${loc} aoFechar=${() => setLoc(null)} />`}
  </section>`;
}

function EditarUnidade({ u, aoFechar }) {
  const { api, recarregar } = useApp();
  const [v, setV] = useState({ nome: u.nome || '', cidade: u.cidade || '', ativa: u.ativa !== false });
  const [ocupado, executar] = useAcao();
  async function salvar() { if (await executar(() => api.rpc('salvar_unidade', { p: { id: u.id || null, ...v } }), 'Unidade salva.')) { await recarregar(true); aoFechar(); } }
  return html`<${Modal} titulo=${u.id ? `Unidade ${u.nome}` : 'Nova unidade'} aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Voltar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>Salvar</button>`}>
    <${Campo} rotulo="Nome" obrigatorio><input class="entrada" value=${v.nome} onInput=${(e) => setV({ ...v, nome: e.target.value })} placeholder="ex.: Matriz" /></${Campo}>
    <${Campo} rotulo="Cidade"><input class="entrada" value=${v.cidade} onInput=${(e) => setV({ ...v, cidade: e.target.value })} /></${Campo}>
    <label class="check"><input type="checkbox" checked=${v.ativa} onChange=${(e) => setV({ ...v, ativa: e.target.checked })} /> Ativa</label>
  </${Modal}>`;
}

const PAPEIS_LOCAL = ['almoxarifado', 'recebimento', 'pesagem', 'padeiro', 'engenharia', 'comprador'];
function EditarLocal({ l, aoFechar }) {
  const { dados, api, recarregar } = useApp();
  const [v, setV] = useState({ unidade_id: l.unidade_id, nome: l.nome || '', tipo: l.tipo || 'outro', papeis: l.papeis || [], ordem: l.ordem ?? '', ativo: l.ativo !== false });
  const [ocupado, executar] = useAcao();
  async function salvar() {
    if (await executar(() => api.rpc('salvar_local', { p: { id: l.id || null, ...v, ordem: v.ordem === '' ? null : Number(v.ordem) } }), 'Local salvo.')) { await recarregar(true); aoFechar(); }
  }
  const alt = (p) => setV({ ...v, papeis: v.papeis.includes(p) ? v.papeis.filter((x) => x !== p) : [...v.papeis, p] });
  return html`<${Modal} titulo=${l.id ? `Local ${l.nome}` : 'Novo local'} aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Voltar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>Salvar</button>`}>
    <div class="grade">
      <${Campo} rotulo="Nome" obrigatorio><input class="entrada" value=${v.nome} onInput=${(e) => setV({ ...v, nome: e.target.value })} /></${Campo}>
      <${Campo} rotulo="Unidade"><select class="entrada" value=${v.unidade_id} onChange=${(e) => setV({ ...v, unidade_id: Number(e.target.value) })}>
        ${dados.unidades.map((u) => html`<option value=${u.id}>${u.nome}</option>`)}</select></${Campo}>
      <${Campo} rotulo="Tipo" ajuda="O sistema usa o tipo para achar a Pesagem, as Maceiras, o PCP etc."><select class="entrada" value=${v.tipo} onChange=${(e) => setV({ ...v, tipo: e.target.value })}>
        ${Object.entries(TIPOS_LOCAL).map(([k, t]) => html`<option value=${k}>${t}</option>`)}</select></${Campo}>
      <${Campo} rotulo="Ordem"><input class="entrada" inputmode="numeric" value=${v.ordem} onInput=${(e) => setV({ ...v, ordem: e.target.value.replace(/\D/g, '') })} /></${Campo}>
    </div>
    <${Campo} rotulo="Quem opera este local"><div class="chips">${PAPEIS_LOCAL.map((p) => html`<button type="button" class=${'chip' + (v.papeis.includes(p) ? ' ativo' : '')} aria-pressed=${!!(v.papeis.includes(p))} onClick=${() => alt(p)}>${PAPEIS[p] || p}</button>`)}</div></${Campo}>
    <label class="check"><input type="checkbox" checked=${v.ativo} onChange=${(e) => setV({ ...v, ativo: e.target.checked })} /> Ativo (para desativar, o local precisa estar sem estoque)</label>
  </${Modal}>`;
}
