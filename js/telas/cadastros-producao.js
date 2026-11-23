// =====================================================================
// CADASTROS DA PRODUÇÃO: maceiras, linhas, padeiros (senha de 6 números) e tempos do semáforo
// =====================================================================
import { html, useState, useApp, Cabecalho, Abas, Tabela, Etiqueta, Modal, Campo, Numero, Vazio, useAcao, avisar, n } from '../ui.js';
import { num, pode } from '../util.js';
import { Icone } from '../icones.js';
import { tempoMedio } from '../producao-util.js';

export function TelaCadastrosProducao() {
  const { papeis } = useApp();
  const [aba, setAba] = useState('maceiras');
  const edita = pode(papeis, 'producao_config');
  return html`
    <${Cabecalho} titulo="Cadastros da produção" sub="Masseiras, linhas, padeiros e os tempos que acendem o semáforo." />
    <${Abas} abas=${[{ id: 'maceiras', titulo: 'Masseiras' }, { id: 'padeiros', titulo: 'Padeiros' }, { id: 'linhas', titulo: 'Linhas' }, { id: 'tempos', titulo: 'Tempos e semáforo' }]} ativa=${aba} aoMudar=${setAba} />
    ${aba === 'maceiras' && html`<${Maceiras} edita=${edita} />`}
    ${aba === 'padeiros' && html`<${Padeiros} edita=${edita} />`}
    ${aba === 'linhas' && html`<${Linhas} edita=${edita} />`}
    ${aba === 'tempos' && html`<${Tempos} edita=${edita} />`}`;
}

function Chips({ itens, sel, aoMudar, rotulo = (x) => x.nome }) {
  return html`<div class="chips">${itens.map((x) => html`<button type="button" class=${'chip' + (sel.includes(x.id) ? ' ativo' : '')} aria-pressed=${!!(sel.includes(x.id))}
    onClick=${() => aoMudar(sel.includes(x.id) ? sel.filter((y) => y !== x.id) : [...sel, x.id])}>${rotulo(x)}</button>`)}</div>`;
}

function Maceiras({ edita }) {
  const { dados } = useApp();
  const [ed, setEd] = useState(null);
  const nomes = (ids, mapa) => (ids || []).map((id) => mapa.get(id)?.nome).filter(Boolean).join(', ');
  return html`
    ${edita && html`<div class="titulo-com-acao"><span></span><button class="btn btn-pri" onClick=${() => setEd({})}><${Icone} nome="mais" tam=${16} /> Nova masseira</button></div>`}
    ${!dados.maceiras.length ? html`<${Vazio} texto="Nenhuma masseira cadastrada." />` : html`<div class="grade-cartoes-mac">${dados.maceiras.map((m) => html`
      <button class=${'mac-cad' + (m.ativa ? '' : ' inativa')} key=${m.id} onClick=${() => edita && setEd(m)} disabled=${!edita}>
        <div class="mac-cad-topo"><b>${m.nome}</b>${!m.ativa && html`<${Etiqueta} cor="cinza">inativa</${Etiqueta}>`}</div>
        <div class="mac-cad-info"><span><small>Capacidade</small>${m.capacidade_kg ? `${num(m.capacidade_kg, 0)} kg` : '–'}</span>
          <span><small>Tempo próprio</small>${m.tempo_min ? `${m.tempo_min} min` : 'o da receita'}</span></div>
        <div class="mac-cad-linha"><small>Linhas</small>${nomes(m.linhas, dados.mapa.linha) || '–'}</div>
        <div class="mac-cad-linha"><small>Padeiros habituais</small>${nomes(m.operadores, dados.mapa.operador) || '–'}</div>
      </button>`)}</div>`}
    <p class="nota">Os padeiros habituais servem só de orientação: qualquer padeiro pode trabalhar em qualquer masseira.</p>
    ${ed && html`<${EditarMaceira} m=${ed} aoFechar=${() => setEd(null)} />`}`;
}

function EditarMaceira({ m, aoFechar }) {
  const { dados, api, recarregar } = useApp();
  const [v, setV] = useState({ nome: m.nome || '', capacidade_kg: m.capacidade_kg != null ? String(Number(m.capacidade_kg)) : '', tempo_min: m.tempo_min ? String(m.tempo_min) : '',
    ordem: m.ordem != null ? String(m.ordem) : '', linhas: m.linhas || [], operadores: m.operadores || [], ativa: m.ativa !== false });
  const [ocupado, executar] = useAcao();
  async function salvar() {
    const p = { id: m.id || null, nome: v.nome, capacidade_kg: n(v.capacidade_kg), tempo_min: v.tempo_min ? Math.round(n(v.tempo_min)) : null,
      ordem: v.ordem === '' ? null : Math.round(n(v.ordem)), linhas: v.linhas, operadores: v.operadores, ativa: v.ativa };
    if (await executar(() => api.rpc('salvar_maceira', { p }), 'Masseira salva.')) { await recarregar(true); aoFechar(); }
  }
  return html`<${Modal} titulo=${m.id ? `Masseira ${m.nome}` : 'Nova masseira'} aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Voltar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>Salvar</button>`}>
    <div class="grade">
      <${Campo} rotulo="Nome" obrigatorio><input class="entrada" value=${v.nome} onInput=${(e) => setV({ ...v, nome: e.target.value })} placeholder="ex.: Masseira 1" /></${Campo}>
      <${Campo} rotulo="Capacidade (kg de farinha por batelada)"><${Numero} valor=${v.capacidade_kg} aoMudar=${(x) => setV({ ...v, capacidade_kg: x })} /></${Campo}>
      <${Campo} rotulo="Tempo próprio (min)" ajuda="Deixe vazio para usar o tempo de cada receita."><${Numero} valor=${v.tempo_min} aoMudar=${(x) => setV({ ...v, tempo_min: x })} /></${Campo}>
      <${Campo} rotulo="Ordem na tela"><${Numero} valor=${v.ordem} aoMudar=${(x) => setV({ ...v, ordem: x })} /></${Campo}>
    </div>
    <${Campo} rotulo="Linhas que costuma bater">${dados.linhas.length ? html`<${Chips} itens=${dados.linhas.filter((l) => l.ativo)} sel=${v.linhas} aoMudar=${(x) => setV({ ...v, linhas: x })} />` : html`<small>Cadastre as linhas na aba “Linhas”.</small>`}</${Campo}>
    <${Campo} rotulo="Padeiros habituais (orientação)">${dados.operadores.length ? html`<${Chips} itens=${dados.operadores.filter((o) => o.ativo)} sel=${v.operadores} aoMudar=${(x) => setV({ ...v, operadores: x })} />` : html`<small>Cadastre os padeiros na aba “Padeiros”.</small>`}</${Campo}>
    <label class="check"><input type="checkbox" checked=${v.ativa} onChange=${(e) => setV({ ...v, ativa: e.target.checked })} /> Ativa</label>
  </${Modal}>`;
}

function Padeiros({ edita }) {
  const { dados } = useApp();
  const [ed, setEd] = useState(null);
  const macs = (id) => dados.maceiras.filter((m) => (m.operadores || []).includes(id)).map((m) => m.nome).join(', ');
  return html`
    ${edita && html`<div class="titulo-com-acao"><span></span><button class="btn btn-pri" onClick=${() => setEd({})}><${Icone} nome="mais" tam=${16} /> Novo padeiro</button></div>`}
    <${Tabela} linhas=${dados.operadores} aoClicar=${edita ? setEd : null} vazio="Nenhum padeiro cadastrado." colunas=${[
      { chave: 'nome', titulo: 'Nome' },
      { chave: 'mac', titulo: 'Masseiras habituais', render: (o) => macs(o.id) || '–' },
      { chave: 'ativo', titulo: 'Situação', render: (o) => (o.ativo ? html`<${Etiqueta} cor="verde">ativo</${Etiqueta}>` : html`<${Etiqueta} cor="cinza">inativo</${Etiqueta}>`) },
    ]} />
    <p class="nota">No tablet das masseiras fica um usuário “Masseiras”. Cada padeiro toca em <b>Trocar</b>, escolhe o nome e digita a senha de 6 números. Assim cada batelada fica com o nome de quem bateu.</p>
    ${ed && html`<${EditarPadeiro} o=${ed} aoFechar=${() => setEd(null)} />`}`;
}

function EditarPadeiro({ o, aoFechar }) {
  const { api, recarregar } = useApp();
  const [nome, setNome] = useState(o.nome || '');
  const [pin, setPin] = useState('');
  const [ativo, setAtivo] = useState(o.ativo !== false);
  const [ocupado, executar] = useAcao();
  async function salvar() {
    if (pin && !/^\d{6}$/.test(pin)) return avisar('A senha precisa ter exatamente 6 números.', 'erro');
    if (!o.id && !pin) return avisar('Crie a senha de 6 números do padeiro.', 'erro');
    if (await executar(() => api.rpc('salvar_operador', { p: { id: o.id || null, nome, pin: pin || null, ativo } }), 'Padeiro salvo.')) { await recarregar(true); aoFechar(); }
  }
  return html`<${Modal} titulo=${o.id ? o.nome : 'Novo padeiro'} aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Voltar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>Salvar</button>`}>
    <${Campo} rotulo="Nome" obrigatorio><input class="entrada" value=${nome} onInput=${(e) => setNome(e.target.value)} /></${Campo}>
    <${Campo} rotulo=${o.id ? 'Nova senha (6 números) — deixe vazio para manter' : 'Senha (6 números)'} ajuda="Combine a senha com o padeiro. Ela não aparece de novo depois de salva.">
      <input class="entrada entrada-pin" inputmode="numeric" maxlength="6" autocomplete="off" value=${pin} onInput=${(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" /></${Campo}>
    <label class="check"><input type="checkbox" checked=${ativo} onChange=${(e) => setAtivo(e.target.checked)} /> Ativo</label>
  </${Modal}>`;
}

function Linhas({ edita }) {
  const { dados, api, recarregar } = useApp();
  const [nome, setNome] = useState('');
  const [ocupado, executar] = useAcao();
  async function salvar(l) {
    if (await executar(() => api.rpc('salvar_linha', { p: l }), 'Linha salva.')) { setNome(''); await recarregar(true); }
  }
  const fichas = (id) => dados.fichas.filter((f) => f.linha_id === id && f.ativo).length;
  return html`
    ${edita && html`<div class="filtros"><input class="entrada" placeholder="Nova linha (ex.: Pão de forma)" value=${nome} onInput=${(e) => setNome(e.target.value)} />
      <button class="btn btn-pri" disabled=${ocupado || !nome.trim()} onClick=${() => salvar({ nome })}>Adicionar</button></div>`}
    <${Tabela} linhas=${dados.linhas} vazio="Nenhuma linha cadastrada." colunas=${[
      { chave: 'nome', titulo: 'Linha' },
      { chave: 'f', titulo: 'Receitas', num: true, valor: (l) => fichas(l.id), render: (l) => fichas(l.id) },
      { chave: 'm', titulo: 'Masseiras', render: (l) => dados.maceiras.filter((m) => (m.linhas || []).includes(l.id)).map((m) => m.nome).join(', ') || '–' },
      { chave: 'ativo', titulo: '', ordenar: false, render: (l) => (edita ? html`<button class="btn btn-sec btn-peq" disabled=${ocupado} onClick=${(e) => { e.stopPropagation(); salvar({ id: l.id, nome: l.nome, ativo: !l.ativo }); }}>${l.ativo ? 'Desativar' : 'Ativar'}</button>`
        : l.ativo ? 'ativa' : 'inativa') },
    ]} />
    <p class="nota">A linha da receita (na ficha técnica) ajuda a sugerir a masseira na programação.</p>`;
}

const TEMPOS = [
  { chave: 'producao_inicio_turno', rotulo: 'Início do turno das masseiras', ajuda: 'Antes da 1ª batelada do dia o semáforo não corre. Se passar dessa hora + a tolerância e ninguém iniciar, a masseira fica laranja “Ainda não iniciou”.', hora: true },
  { chave: 'producao_tolerancia_min', rotulo: 'Tolerância para começar (min)', ajuda: 'Depois do início do turno, ou quando chega base numa masseira que estava parada.' },
  { chave: 'producao_tempo_padrao_min', rotulo: 'Tempo padrão da batelada (min)', ajuda: 'Usado quando a receita não tem tempo próprio.' },
  { chave: 'producao_prazo_finalizar_h', rotulo: 'Avisar batelada sem finalizar depois de (horas)', ajuda: 'Na tela Finalizar bateladas.' },
  { chave: 'mistura_parada_h', rotulo: 'Avisar base parada depois de (horas)', ajuda: 'Base pesada que não foi usada.' },
];

function Tempos({ edita }) {
  const { dados, api, recarregar } = useApp();
  const lista = TEMPOS.filter((t) => !t.hora || dados.params[t.chave] !== undefined);   // início do turno: depois da atualização 005 do banco
  const [v, setV] = useState(Object.fromEntries(lista.map((t) => [t.chave, String(dados.params[t.chave] ?? '')])));
  const [ocupado, executar] = useAcao();
  async function salvar() {
    if (await executar(() => api.rpc('salvar_parametros_producao', { p: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'producao_inicio_turno' ? x : String(Math.round(n(x) || 0))])) }), 'Tempos salvos.')) await recarregar(true);
  }
  const fichas = dados.fichas.filter((f) => f.ativo);
  return html`<section class="painel">
    <div class="semaforo-explica">
      <div><span class="luz s-azul"></span><b>Azul</b> pronta para começar (o relógio só corre depois da 1ª batelada do dia)</div>
      <div><span class="luz s-verde"></span><b>Verde</b> até 1,5 × o tempo da receita</div>
      <div><span class="luz s-laranja"></span><b>Laranja</b> até 2 × — “Tempo médio em atraso”</div>
      <div><span class="luz s-vermelho"></span><b>Vermelho</b> acima de 2 × — “Produção em atraso”</div>
      <div><span class="luz s-cinza"></span><b>Cinza</b> aguardando pesagem ou programação</div>
    </div>
    <div class="grade">${lista.map((t) => html`<${Campo} rotulo=${t.rotulo} ajuda=${t.ajuda}>
      ${!edita ? html`<b>${v[t.chave]}</b>` : t.hora ? html`<input class="entrada" type="time" value=${v[t.chave]} onInput=${(e) => setV({ ...v, [t.chave]: e.target.value })} />`
        : html`<${Numero} valor=${v[t.chave]} aoMudar=${(x) => setV({ ...v, [t.chave]: x })} />`}</${Campo}>`)}</div>
    ${edita && html`<button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>Salvar tempos</button>`}
  </section>
  <h3 class="titulo-secao">Tempo de cada receita</h3>
  <${Tabela} linhas=${fichas} vazio="Nenhuma ficha técnica." colunas=${[
    { chave: 'codigo', titulo: 'Código' }, { chave: 'nome', titulo: 'Receita' },
    { chave: 'l', titulo: 'Linha', render: (f) => dados.mapa.linha.get(f.linha_id)?.nome || '–' },
    { chave: 't', titulo: 'Tempo (min)', num: true, valor: (f) => tempoMedio(dados, f.id), render: (f) => html`${tempoMedio(dados, f.id)}${f.tempo_batelada_min ? '' : html` <small class="texto-cinza">(padrão)</small>`}` },
  ]} />
  <p class="nota">Para mudar o tempo de uma receita, abra a ficha técnica dela.</p>`;
}
