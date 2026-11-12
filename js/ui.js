// =====================================================================
// ui.js — componentes visuais reutilizados em todas as telas
// =====================================================================
import { html, render, useState, useEffect, useRef, useMemo, createContext, useContext } from './vendor/preact-htm.js';
import { lerNumero, unidadesDoProduto, contem, ordenar, qtd } from './util.js';

export { html, render, useState, useEffect, useRef, useMemo, createContext, useContext };

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// ------------------------------ Avisos (toasts) ----------------------
let ouvintesAviso = [];
export function avisar(texto, tipo = 'ok') {
  const a = { id: Math.random(), texto, tipo };
  ouvintesAviso.forEach((f) => f(a));
}
export function Avisos() {
  const [lista, setLista] = useState([]);
  useEffect(() => {
    const f = (a) => {
      setLista((l) => [...l, a]);
      setTimeout(() => setLista((l) => l.filter((x) => x.id !== a.id)), a.tipo === 'erro' ? 7000 : 3500);
    };
    ouvintesAviso.push(f);
    return () => { ouvintesAviso = ouvintesAviso.filter((x) => x !== f); };
  }, []);
  return html`<div class="avisos" role="status" aria-live="polite">
    ${lista.map((a) => html`<div key=${a.id} class=${'aviso aviso-' + a.tipo}
      onClick=${() => setLista((l) => l.filter((x) => x.id !== a.id))}>${a.texto}</div>`)}
  </div>`;
}

// ------------------------------ Confirmação --------------------------
let abrirConfirmacao = null;
export function confirmar(opcoes) {
  return new Promise((resolve) => abrirConfirmacao && abrirConfirmacao({ ...opcoes, resolve }));
}
export function HostConfirmacao() {
  const [c, setC] = useState(null);
  useEffect(() => { abrirConfirmacao = setC; return () => { abrirConfirmacao = null; }; }, []);
  if (!c) return null;
  const fechar = (v) => { c.resolve(v); setC(null); };
  return html`<${Modal} titulo=${c.titulo || 'Confirmar'} aoFechar=${() => fechar(false)}
    rodape=${html`<button class="btn btn-sec" onClick=${() => fechar(false)}>${c.cancelar || 'Voltar'}</button>
      <button class=${'btn ' + (c.perigo ? 'btn-perigo' : 'btn-pri')} onClick=${() => fechar(true)}>${c.ok || 'Confirmar'}</button>`}>
    ${typeof c.mensagem === 'string' ? html`<p>${c.mensagem}</p>` : c.mensagem}
  </${Modal}>`;
}

// ------------------------------ Modal --------------------------------
export function Modal({ titulo, aoFechar, children, rodape, largo, cheio }) {
  useEffect(() => {
    const f = (e) => { if (e.key === 'Escape') aoFechar?.(); };
    document.addEventListener('keydown', f);
    document.body.classList.add('sem-rolagem');
    return () => { document.removeEventListener('keydown', f); document.body.classList.remove('sem-rolagem'); };
  }, []);
  return html`<div class="modal-fundo" onClick=${(e) => e.target === e.currentTarget && aoFechar?.()}>
    <div class=${'modal' + (largo ? ' modal-largo' : '') + (cheio ? ' modal-cheio' : '')} role="dialog" aria-modal="true">
      <div class="modal-topo">
        ${aoFechar && html`<button class="btn-voltar" title="Voltar" aria-label="Voltar" onClick=${aoFechar}><${Seta} /></button>`}
        <h2>${titulo}</h2>
        ${aoFechar && html`<button class="btn-icone btn-fechar" title="Fechar" aria-label="Fechar" onClick=${aoFechar}>✕</button>`}
      </div>
      <div class="modal-corpo">${children}</div>
      ${rodape && html`<div class="modal-rodape">${rodape}</div>`}
    </div>
  </div>`;
}

// ------------------------------ Campos -------------------------------
export function Campo({ rotulo, ajuda, children, classe = '', obrigatorio }) {
  return html`<label class=${'campo ' + classe}>
    <span class="campo-rotulo">${rotulo}${obrigatorio && html`<b class="obrig"> *</b>`}</span>
    ${children}
    ${ajuda && html`<small class="campo-ajuda">${ajuda}</small>`}
  </label>`;
}

// Campo numérico que aceita vírgula (2,5) — guarda o texto digitado
export function Numero({ valor, aoMudar, placeholder, desabilitado, classe = '', autoFocus }) {
  return html`<input class=${'entrada num ' + classe} type="text" inputmode="decimal" autocomplete="off"
    value=${valor ?? ''} placeholder=${placeholder} disabled=${desabilitado} autoFocus=${autoFocus}
    onInput=${(e) => aoMudar(e.target.value)} />`;
}

// Quantidade + unidade do produto (estoque / compra / g)
export function QtdUnidade({ produto, valor, unidade, aoMudar, desabilitado, placeholder = '0', autoFocus }) {
  const uns = unidadesDoProduto(produto);
  const un = unidade || uns[0]?.un;
  return html`<div class="qtd-un">
    <${Numero} valor=${valor} placeholder=${placeholder} desabilitado=${desabilitado} autoFocus=${autoFocus}
      aoMudar=${(v) => aoMudar(v, un)} />
    <select class="entrada" value=${un} disabled=${desabilitado || uns.length < 2}
      onChange=${(e) => aoMudar(valor, e.target.value)}>
      ${uns.map((u) => html`<option value=${u.un}>${u.un}</option>`)}
    </select>
  </div>`;
}

// Caixa de escolha com busca (produtos, fornecedores, fichas...)
export function Escolher({ itens, valor, aoMudar, rotuloDe, detalheDe, placeholder = 'Digite para buscar…', desabilitado, autoFocus }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef();
  const atual = itens.find((i) => i.id === valor);
  useEffect(() => {
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener('mousedown', f);
    document.addEventListener('touchstart', f);
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('touchstart', f); };
  }, []);
  const filtrados = useMemo(() => itens.filter((i) => contem(rotuloDe(i) + ' ' + (detalheDe ? detalheDe(i) : ''), busca)).slice(0, 60), [itens, busca]);
  return html`<div class="escolher" ref=${ref}>
    <input class="entrada" type="text" disabled=${desabilitado} autoFocus=${autoFocus}
      value=${aberto ? busca : (atual ? rotuloDe(atual) : '')}
      placeholder=${atual ? rotuloDe(atual) : placeholder}
      onFocus=${() => { setBusca(''); setAberto(true); }}
      onInput=${(e) => { setBusca(e.target.value); setAberto(true); }} />
    ${aberto && html`<div class="escolher-lista">
      ${filtrados.length === 0 && html`<div class="escolher-vazio">Nada encontrado</div>`}
      ${filtrados.map((i) => html`<button type="button" key=${i.id} class=${'escolher-item' + (i.id === valor ? ' ativo' : '')}
        onClick=${() => { aoMudar(i.id, i); setAberto(false); }}>
        <span>${rotuloDe(i)}</span>${detalheDe && html`<small>${detalheDe(i)}</small>`}
      </button>`)}
    </div>`}
  </div>`;
}

export function Busca({ valor, aoMudar, placeholder = 'Buscar…' }) {
  return html`<input class="entrada busca" type="search" value=${valor} placeholder=${placeholder}
    onInput=${(e) => aoMudar(e.target.value)} />`;
}

export function Abas({ abas, ativa, aoMudar }) {
  return html`<div class="abas" role="tablist">
    ${abas.filter(Boolean).map((a) => html`<button role="tab" class=${'aba' + (a.id === ativa ? ' ativa' : '')}
      onClick=${() => aoMudar(a.id)}>${a.titulo}</button>`)}
  </div>`;
}

export const Etiqueta = ({ cor = 'cinza', children, titulo }) => html`<span class=${'etq etq-' + cor} title=${titulo}>${children}</span>`;
export const Vazio = ({ texto = 'Nada por aqui ainda.' }) => html`<div class="vazio">${texto}</div>`;
export const Carregando = ({ texto = 'Carregando…' }) => html`<div class="carregando"><span class="giro"></span>${texto}</div>`;

export function Cartao({ titulo, valor, sub, cor = '', aoClicar }) {
  return html`<button class=${'cartao ' + cor} onClick=${aoClicar} disabled=${!aoClicar}>
    <span class="cartao-titulo">${titulo}</span>
    <strong class="cartao-valor">${valor}</strong>
    ${sub && html`<span class="cartao-sub">${sub}</span>`}
  </button>`;
}

// Cabeçalho de tela: seta "voltar" discreta + título + ações (exportar, novo...)
// aoVoltar: volta dentro da própria tela (ex.: da conferência para a lista);
// sem ele, volta para a tela anterior (ou para o Início).
export function Cabecalho({ titulo, sub, children, aoVoltar, semVoltar }) {
  const app = useApp();
  const voltar = aoVoltar || (app && app.rota !== 'inicio' ? app.voltar : null);
  return html`<div class="cabecalho">
    <div class="cabecalho-titulo">
      ${!semVoltar && voltar && html`<button class="btn-voltar" title="Voltar" aria-label="Voltar" onClick=${voltar}><${Seta} /></button>`}
      <div><h1>${titulo}</h1>${sub && html`<p class="sub">${sub}</p>`}</div>
    </div>
    ${children && html`<div class="cabecalho-acoes">${children}</div>`}
  </div>`;
}
const Seta = () => html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>`;

// ------------------------------ Tabela -------------------------------
// colunas: [{ chave, titulo, valor:(l)=>valor p/ ordenar, render:(l)=>conteúdo, num:true, classe }]
export function Tabela({ colunas, linhas, aoClicar, vazio, rodape, ordemInicial, chave = 'id', classeLinha, max }) {
  const [ord, setOrd] = useState(ordemInicial || null);
  const lista = useMemo(() => {
    if (!ord) return linhas;
    const c = colunas.find((x) => x.chave === ord.chave);
    if (!c) return linhas;
    return ordenar(linhas, c.valor || ((l) => l[c.chave]), ord.dir);
  }, [linhas, ord]);
  const mostrar = max ? lista.slice(0, max) : lista;
  if (!linhas.length) return html`<${Vazio} texto=${vazio || 'Nenhum registro encontrado.'} />`;
  return html`<div class="tabela-rolagem">
    <table class="tabela">
      <thead><tr>
        ${colunas.map((c) => html`<th class=${(c.num ? 'n ' : '') + (c.classe || '')}
          onClick=${() => c.ordenar !== false && setOrd((o) => ({ chave: c.chave, dir: o && o.chave === c.chave ? -o.dir : (c.num ? -1 : 1) }))}>
          ${c.titulo}${ord && ord.chave === c.chave ? (ord.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`)}
      </tr></thead>
      <tbody>
        ${mostrar.map((l) => html`<tr key=${l[chave]} class=${(aoClicar ? 'clicavel ' : '') + (classeLinha ? classeLinha(l) : '')}
          onClick=${aoClicar ? () => aoClicar(l) : null}>
          ${colunas.map((c) => html`<td class=${(c.num ? 'n ' : '') + (c.classe || '')} data-rotulo=${c.titulo}>
            <span class="td-v">${c.render ? c.render(l) : l[c.chave]}</span></td>`)}
        </tr>`)}
      </tbody>
      ${rodape && html`<tfoot>${rodape}</tfoot>`}
    </table>
    ${max && lista.length > max && html`<p class="nota">Mostrando ${max} de ${lista.length}. Use os filtros ou exporte para ver tudo.</p>`}
  </div>`;
}

// Executa uma ação no banco mostrando "salvando…" e erros amigáveis
export function useAcao() {
  const [ocupado, setOcupado] = useState(false);
  async function executar(fn, msgOk) {
    if (ocupado) return null;
    setOcupado(true);
    try {
      const r = await fn();
      if (msgOk) avisar(msgOk, 'ok');
      return r ?? true;
    } catch (e) {
      const { mensagemErro } = await import('./util.js');
      avisar(mensagemErro(e), 'erro');
      return null;
    } finally {
      setOcupado(false);
    }
  }
  return [ocupado, executar];
}

export const n = lerNumero;
export const fmtQtd = qtd;
