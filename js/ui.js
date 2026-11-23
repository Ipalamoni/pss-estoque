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
      // a mesma mensagem não se empilha (clicar 2 vezes mostra 1 aviso só)
      setLista((l) => [...l.filter((x) => x.texto !== a.texto), a]);
      // erro fica mais tempo (dá para ler com calma), mas também some sozinho; o X fecha na hora
      setTimeout(() => setLista((l) => l.filter((x) => x.id !== a.id)), a.tipo === 'erro' ? 12000 : a.tipo === 'aviso' ? 6000 : 3500);
    };
    // trocou de tela: erros da tela anterior não ficam presos no canto
    const limpar = () => setLista((l) => l.filter((x) => x.tipo !== 'erro'));
    ouvintesAviso.push(f);
    window.addEventListener('hashchange', limpar);
    return () => { ouvintesAviso = ouvintesAviso.filter((x) => x !== f); window.removeEventListener('hashchange', limpar); };
  }, []);
  const fechar = (id) => setLista((l) => l.filter((x) => x.id !== id));
  const item = (a) => html`<div key=${a.id} class=${'aviso aviso-' + a.tipo}>
    <span class="aviso-txt">${a.texto}</span>
    <button type="button" class="aviso-fechar" aria-label="Fechar aviso" title="Fechar" onClick=${() => fechar(a.id)}>✕</button></div>`;
  return html`<div class="avisos">
    <div role="alert" aria-live="assertive">${lista.filter((a) => a.tipo === 'erro').map(item)}</div>
    <div role="status" aria-live="polite">${lista.filter((a) => a.tipo !== 'erro').map(item)}</div>
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
  return html`<${Modal} semProtecao titulo=${c.titulo || 'Confirmar'} aoFechar=${() => fechar(false)}
    rodape=${html`<button class="btn btn-sec" onClick=${() => fechar(false)}>${c.cancelar || 'Voltar'}</button>
      <button class=${'btn ' + (c.perigo ? 'btn-perigo' : 'btn-pri')} onClick=${() => fechar(true)}>${c.ok || 'Confirmar'}</button>`}>
    ${typeof c.mensagem === 'string' ? html`<p>${c.mensagem}</p>` : c.mensagem}
  </${Modal}>`;
}

// ------------------------------ Edição em andamento ------------------
// PROTEÇÃO DOS DADOS DIGITADOS: formulários com algo digitado e ainda não salvo se registram aqui.
// Enquanto houver algum, o sistema pergunta antes de: trocar de tela, fechar/recarregar a página,
// fechar a janela (modal) pelo ✕/Esc/fundo e aplicar uma versão nova.
const edicoes = new Map();
let seqEdicao = 0;
export const haEdicao = () => edicoes.size > 0;
export function useEdicao(sujo, rotulo = 'formulário') {
  const id = useRef(null);
  if (id.current === null) id.current = ++seqEdicao;
  useEffect(() => { if (sujo) edicoes.set(id.current, rotulo); else edicoes.delete(id.current); }, [sujo, rotulo]);
  useEffect(() => () => edicoes.delete(id.current), []);
}
// pergunta antes de descartar o que foi digitado (ok = pode descartar)
export function confirmarDescarte(texto) {
  if (!haEdicao()) return Promise.resolve(true);
  return confirmar({ titulo: 'Sair sem salvar?', mensagem: texto || 'Há informações digitadas que ainda não foram salvas. Se sair agora, elas serão perdidas.',
    ok: 'Sair sem salvar', cancelar: 'Continuar editando', perigo: true });
}
// executa fn só depois de confirmar o descarte (quando há algo digitado)
export const protegido = (fn) => (...a) => confirmarDescarte().then((ok) => { if (ok) { edicoes.clear(); fn(...a); } });
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => { if (haEdicao()) { e.preventDefault(); e.returnValue = ''; } });
}

// RASCUNHO AUTOMÁTICO: guarda neste aparelho o que está sendo digitado num formulário longo
// (inventário, contagem, pedido novo). Se a página fechar, a bateria acabar ou a pessoa trocar de tela,
// ao voltar o formulário continua de onde parou. Some ao salvar (limpar) ou depois de 7 dias.
const RASCUNHO_DIAS = 7;
export function useRascunho(chave, inicial, { aoRecuperar } = {}) {
  const app = useApp();
  const k = chave ? `pss-rascunho:${app?.real?.user_id || app?.usuario?.user_id || ''}:${chave}` : null;
  const inicialDe = () => (typeof inicial === 'function' ? inicial() : inicial);
  const ler = (kk) => {
    if (!kk) return undefined;
    try { const o = JSON.parse(localStorage.getItem(kk) || 'null'); if (o && Date.now() - o.t < RASCUNHO_DIAS * 864e5) return o; } catch { /* sem armazenamento */ }
    return undefined;
  };
  const [estado, setEstado] = useState(() => { const o = ler(k); return { k, v: o ? o.v : inicialDe(), rec: o ? o.t : null }; });
  const base = useRef(null);
  if (base.current === null) base.current = JSON.stringify(inicialDe());
  // chave mudou (ex.: outro local no inventário): carrega o rascunho daquela chave
  if (estado.k !== k) { const o = ler(k); estado.k = k; estado.v = o ? o.v : inicialDe(); estado.rec = o ? o.t : null; }
  useEffect(() => { if (estado.rec && aoRecuperar) aoRecuperar(estado.rec); }, [k]);
  useEffect(() => {
    if (!k) return undefined;
    const t = setTimeout(() => {
      try {
        const txt = JSON.stringify(estado.v);
        if (txt === base.current || txt === '{}' || txt === '[]' || txt === '""') localStorage.removeItem(k);
        else localStorage.setItem(k, JSON.stringify({ t: Date.now(), v: estado.v }));
      } catch { /* aparelho sem espaço ou modo privado: segue sem rascunho */ }
    }, 300);
    return () => clearTimeout(t);
  }, [k, estado.v]);
  const set = (x) => setEstado((e) => ({ ...e, v: typeof x === 'function' ? x(e.v) : x }));
  const limpar = () => { try { if (k) localStorage.removeItem(k); } catch { /* ignora */ } };
  return [estado.v, set, limpar, estado.rec];
}

// campo de formulário (busca e filtro de pesquisa não contam como "dado digitado")
const ehCampo = (el) => !!el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && el.type !== 'search' && !el.classList?.contains('busca');
// Formulário que fica na própria página (não numa janela): avisa antes de sair com algo digitado.
// Volta a "limpo" quando qualquer gravação dá certo (evento pss-salvo do useAcao).
export function AreaProtegida({ rotulo = 'formulário', classe = '', children }) {
  const [sujo, setSujo] = useState(false);
  useEdicao(sujo, rotulo);
  useEffect(() => { const f = () => setSujo(false); window.addEventListener('pss-salvo', f); return () => window.removeEventListener('pss-salvo', f); }, []);
  const marcar = (e) => { if (!sujo && ehCampo(e.target)) setSujo(true); };
  return html`<section class=${classe} onInput=${marcar} onChange=${marcar}>${children}</section>`;
}

// ------------------------------ Modal --------------------------------
let seqModal = 0;
const pilhaModais = [];   // só a janela de cima responde ao Esc e prende o Tab
const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
export function Modal({ titulo, aoFechar, children, rodape, largo, cheio, semProtecao }) {
  const caixa = useRef(null);
  const [idTitulo] = useState(() => `modal-titulo-${++seqModal}`);
  const [sujo, setSujo] = useState(false);
  useEdicao(sujo && !semProtecao, titulo);
  // ✕, Esc, seta e clique no fundo: se algo foi digitado, pergunta antes de fechar
  const pedirFechar = () => { if (!aoFechar) return; if (sujo && !semProtecao) confirmarDescarte().then((ok) => ok && aoFechar()); else aoFechar(); };
  const fecharRef = useRef(pedirFechar); fecharRef.current = pedirFechar;
  const marcar = (e) => { if (!sujo && ehCampo(e.target)) setSujo(true); };
  useEffect(() => { const f = () => setSujo(false); window.addEventListener('pss-salvo', f); return () => window.removeEventListener('pss-salvo', f); }, []);
  useEffect(() => {
    pilhaModais.push(idTitulo);
    const noTopo = () => pilhaModais[pilhaModais.length - 1] === idTitulo;
    const antes = document.activeElement;   // devolve o foco para onde estava ao fechar
    const el = caixa.current;
    if (el && !el.contains(document.activeElement)) {
      const primeiro = el.querySelector('.modal-corpo ' + FOCAVEIS) || el;
      try { primeiro.focus({ preventScroll: true }); } catch { /* ignora */ }
    }
    const f = (e) => {
      if (!noTopo()) return;
      if (e.key === 'Escape') { fecharRef.current?.(); return; }
      if (e.key !== 'Tab' || !caixa.current) return;   // Tab não sai da janela
      const itens = [...caixa.current.querySelectorAll(FOCAVEIS)].filter((x) => x.offsetParent !== null);
      if (!itens.length) return;
      const pri = itens[0], ult = itens[itens.length - 1];
      if (e.shiftKey && document.activeElement === pri) { e.preventDefault(); ult.focus(); }
      else if (!e.shiftKey && document.activeElement === ult) { e.preventDefault(); pri.focus(); }
    };
    document.addEventListener('keydown', f);
    document.body.classList.add('sem-rolagem');
    return () => {
      const i = pilhaModais.lastIndexOf(idTitulo); if (i >= 0) pilhaModais.splice(i, 1);
      document.removeEventListener('keydown', f); if (!pilhaModais.length) document.body.classList.remove('sem-rolagem');
      if (antes && antes.focus && document.contains(antes)) { try { antes.focus({ preventScroll: true }); } catch { /* ignora */ } }
    };
  }, []);
  return html`<div class="modal-fundo" onClick=${(e) => e.target === e.currentTarget && pedirFechar()}>
    <div class=${'modal' + (largo ? ' modal-largo' : '') + (cheio ? ' modal-cheio' : '')} role="dialog" aria-modal="true" aria-labelledby=${idTitulo} tabindex="-1" ref=${caixa}
      onInput=${marcar} onChange=${marcar}>
      <div class="modal-topo">
        ${aoFechar && html`<button class="btn-voltar" title="Voltar" aria-label="Voltar" onClick=${pedirFechar}><${Seta} /></button>`}
        <h2 id=${idTitulo}>${titulo}</h2>
        ${aoFechar && html`<button class="btn-icone btn-fechar" title="Fechar" aria-label="Fechar" onClick=${pedirFechar}>✕</button>`}
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

// célula sem informação ("–", vazio): no celular não ocupa uma linha do cartão
export function celulaVazia(v) {
  if (v === null || v === undefined || v === false || v === '' || v === '–' || v === '-') return true;
  if (typeof v === 'object' && v && v.props && !Array.isArray(v)) { const c = v.props.children; return c === '–' || (Array.isArray(c) && c.length === 1 && c[0] === '–'); }
  return false;
}

export function Abas({ abas, ativa, aoMudar }) {
  const ref = useRef(null);
  const [fim, setFim] = useState(true);
  const medir = () => { const el = ref.current; if (el) setFim(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4); };
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const at = el.querySelector('.aba.ativa'); if (at && at.scrollIntoView) at.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    medir();
  }, [ativa, abas.length]);
  return html`<div class=${'abas-caixa' + (fim ? '' : ' tem-mais')}><div class="abas" role="tablist" ref=${ref} onScroll=${medir}>
    ${abas.filter(Boolean).map((a) => html`<button role="tab" aria-selected=${a.id === ativa} class=${'aba' + (a.id === ativa ? ' ativa' : '')}
      onClick=${() => aoMudar(a.id)}>${a.titulo}</button>`)}
  </div></div>`;
}

// Filtros: no computador ficam abertos; no celular ficam num botão "Filtros (n)" que abre e fecha.
// "fixo" (ex.: a busca) fica sempre visível.
export function useCelular(px = 640) {
  const q = typeof matchMedia === 'function' ? matchMedia(`(max-width: ${px}px)`) : null;
  const [cel, setCel] = useState(q ? q.matches : false);
  useEffect(() => { if (!q) return; const f = () => setCel(q.matches); q.addEventListener ? q.addEventListener('change', f) : q.addListener(f);
    return () => (q.removeEventListener ? q.removeEventListener('change', f) : q.removeListener(f)); }, []);
  return cel;
}
export function Filtros({ ativos = 0, fixo, resumo, children, rotulo = 'Filtros' }) {
  const cel = useCelular();
  const [aberto, setAberto] = useState(false);
  if (!cel) return html`<div class="filtros">${fixo}${children}</div>`;
  return html`<div class=${'filtros filtros-cel' + (fixo ? ' com-fixo' : '')}>
    ${fixo}
    <button type="button" class=${'btn btn-sec btn-filtros' + (ativos ? ' com-filtro' : '')} aria-expanded=${aberto} onClick=${() => setAberto(!aberto)}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
      <span class="bf-txt">${resumo || rotulo}</span>${ativos ? html`<span class="bf-n">${ativos}</span>` : ''} <span class="seta-filtros">${aberto ? '▲' : '▼'}</span></button>
    ${aberto && html`<div class="filtros-gaveta">${children}
      <button type="button" class="btn btn-pri btn-peq bf-ok" onClick=${() => setAberto(false)}>Ver resultado</button></div>`}
  </div>`;
}

export const Etiqueta = ({ cor = 'cinza', children, titulo }) => html`<span class=${'etq etq-' + cor} title=${titulo}>${children}</span>`;
export const Vazio = ({ texto = 'Nada por aqui ainda.' }) => html`<div class="vazio">${texto}</div>`;
export const Carregando = ({ texto = 'Carregando…' }) => html`<div class="carregando"><span class="giro"></span>${texto}</div>`;

// variacao: { texto: '▲ 12% vs. mês anterior', tom: 'bom' | 'ruim' | 'neutro' } (seta + texto, nunca só a cor)
export function Cartao({ titulo, valor, sub, cor = '', aoClicar, variacao }) {
  const miolo = html`
    <span class="cartao-titulo">${titulo}${aoClicar && html`<span class="cartao-seta" aria-hidden="true">›</span>`}</span>
    <strong class="cartao-valor">${valor}</strong>
    ${sub && html`<span class="cartao-sub">${sub}</span>`}
    ${variacao && html`<span class=${'cartao-var var-' + (variacao.tom || 'neutro')}>${variacao.texto}</span>`}`;
  // só é botão quando leva a algum lugar (senão o leitor de tela anunciaria "botão indisponível")
  return aoClicar
    ? html`<button type="button" class=${'cartao clicavel ' + cor} onClick=${aoClicar}>${miolo}</button>`
    : html`<div class=${'cartao ' + cor}>${miolo}</div>`;
}

// Cabeçalho de tela: seta "voltar" discreta + título + ações (exportar, novo...)
// aoVoltar: volta dentro da própria tela (ex.: da conferência para a lista);
// sem ele, volta para a tela anterior (ou para o Início).
export function Cabecalho({ titulo, sub, children, aoVoltar, semVoltar, semTrilha }) {
  const app = useApp();
  const voltar = aoVoltar || (app && app.rota !== 'inicio' ? app.voltar : null);
  const t = app && app.trilha;
  const trilha = !semTrilha && app && app.rota !== 'inicio' && t;
  return html`${trilha && html`<nav class="trilha" aria-label="Você está em">
      <a href="#inicio" onClick=${(e) => { e.preventDefault(); app.ir('inicio'); }}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7M5 10v10h14V10" /></svg> Início</a>
      ${t.grupo && html`<span class="trilha-sep" aria-hidden="true">›</span><span>${t.grupo}</span>`}
      <span class="trilha-sep" aria-hidden="true">›</span><span aria-current="page">${t.titulo}</span></nav>`}
  <div class="cabecalho">
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
export function Tabela({ colunas: colunasBrutas, linhas, aoClicar, vazio, rodape, ordemInicial, chave = 'id', classeLinha, max, aoVerTodos }) {
  const colunas = colunasBrutas.filter(Boolean);   // coluna escondida (ex.: valores para pesagem) chega como false
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
        ${colunas.map((c) => { const ativa = ord && ord.chave === c.chave;
          const ordenarCol = () => setOrd((o) => ({ chave: c.chave, dir: o && o.chave === c.chave ? -o.dir : (c.num ? -1 : 1) }));
          return html`<th class=${(c.num ? 'n ' : '') + (c.classe || '')} scope="col"
            aria-sort=${ativa ? (ord.dir > 0 ? 'ascending' : 'descending') : null}>
            ${c.ordenar === false || !c.titulo ? c.titulo : html`<button type="button" class="th-ordenar" onClick=${ordenarCol}
              title=${`Ordenar por ${String(c.titulo).toLowerCase()}`}>${c.titulo}${ativa ? (ord.dir > 0 ? ' ▲' : ' ▼') : ''}</button>`}</th>`; })}
      </tr></thead>
      <tbody>
        ${mostrar.map((l) => html`<tr key=${l[chave]} class=${(aoClicar ? 'clicavel ' : '') + (classeLinha ? classeLinha(l) : '')}
          onClick=${aoClicar ? () => aoClicar(l) : null} tabindex=${aoClicar ? '0' : null}
          onKeyDown=${aoClicar ? (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); aoClicar(l); } } : null}>
          ${colunas.map((c) => { const v = c.render ? c.render(l) : l[c.chave];
            return html`<td class=${(c.num ? 'n ' : '') + (c.classe || '') + (celulaVazia(v) ? ' vazia' : '')} data-rotulo=${c.titulo}>
            <span class="td-v">${v}</span></td>`; })}
        </tr>`)}
      </tbody>
      ${rodape && html`<tfoot>${rodape}</tfoot>`}
    </table>
    ${max && lista.length > max && (aoVerTodos
      ? html`<p class="nota">Mostrando ${max} de ${lista.length}. <button type="button" class="btn-link" onClick=${aoVerTodos}>Ver todos (${lista.length})</button></p>`
      : html`<p class="nota">Mostrando ${max} de ${lista.length}. Use os filtros ou exporte para ver tudo.</p>`)}
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
      try { window.dispatchEvent(new Event('pss-salvo')); } catch { /* ignora */ }
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

// Telas com período: se a data inicial for mais antiga que o histórico carregado (60 dias), busca o que falta.
// Atualização automática sem perder o que a pessoa está digitando: só volta para "carregando…"
// quando o filtro (datas, produto, local...) muda; nas atualizações de 30 s / tempo real a tela fica como está.
export function useFiltroMudou(chave) {
  const ult = useRef(undefined);
  const k = JSON.stringify(chave);
  return () => { const m = ult.current !== k; ult.current = k; return m; };
}

export function useHistorico(de) {
  const app = useApp();
  useEffect(() => { if (de && app && app.garantirHistorico) app.garantirHistorico(de); }, [de]);
}
