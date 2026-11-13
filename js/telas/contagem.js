// =====================================================================
// Contagem inicial (saldo de abertura) — almoxarifado
//  1) o almoxarifado conta e digita as quantidades (pode salvar aos poucos
//     e corrigir enquanto o administrador não implantar)
//  2) o administrador confere, informa o custo e implanta
//     (Configurações › Implantação de saldo › "Trazer contagem do almoxarifado")
// A contagem NÃO mexe no estoque até ser implantada.
// =====================================================================
import { html, useState, useMemo, useEffect, useApp, QtdUnidade, Busca, Etiqueta, Cabecalho, Cartao, Tabela, Carregando, useAcao, confirmar, avisar, n } from '../ui.js';
import { CATEGORIAS, contem, dataHora, hojeISO, qu, pl, nomeUsuario, mensagemErro } from '../util.js';
import { Exportar } from '../exportar.js';

export function useContagens() {
  const { api, dados } = useApp();
  const [lista, setLista] = useState(null);
  useEffect(() => {
    let vivo = true;
    api.listar('contagem_inicial').then((l) => vivo && setLista(l || [])).catch((e) => { avisar(mensagemErro(e), 'erro'); vivo && setLista([]); });
    return () => { vivo = false; };
  }, [dados.carregadoEm]);
  return lista;
}

export function TelaContagemInicial() {
  const { dados, recarregar, api, ir, podeFazer } = useApp();
  const contagens = useContagens();
  const [cat, setCat] = useState('materia_prima');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [v, setV] = useState({});            // produto_id -> { q, un, obs }
  const [ocupado, executar] = useAcao();
  const perfil = (id) => dados.mapa.perfil.get(id);

  const pend = useMemo(() => new Map((contagens || []).filter((c) => c.situacao === 'pendente').map((c) => [c.produto_id, c])), [contagens]);
  const impl = useMemo(() => new Map((contagens || []).filter((c) => c.situacao === 'implantada').map((c) => [c.produto_id, c])), [contagens]);
  const produtos = useMemo(() => dados.produtos.filter((p) => p.ativo && (!cat || p.categoria === cat)).sort((a, b) => a.descricao.localeCompare(b.descricao)), [dados, cat]);
  const lista = produtos.filter((p) => contem(`${p.codigo} ${p.descricao} ${p.grupo || ''}`, busca)
    && (filtro === 'todos' || (filtro === 'falta' && !pend.has(p.id) && !impl.has(p.id)) || (filtro === 'contados' && pend.has(p.id)) || (filtro === 'implantados' && impl.has(p.id))));
  const digitados = Object.entries(v).filter(([, x]) => x.q !== '' && x.q !== undefined && n(x.q) !== null);
  const nCont = produtos.filter((p) => pend.has(p.id)).length, nImpl = produtos.filter((p) => impl.has(p.id)).length;
  const falta = produtos.length - nCont - nImpl;
  const mudar = (p, ch) => setV((x) => ({ ...x, [p.id]: { un: pend.get(p.id)?.unidade_informada || p.unidade_compra || p.unidade_estoque, ...x[p.id], ...ch } }));

  async function salvar() {
    if (!digitados.length) return avisar('Digite a quantidade de pelo menos um item.', 'erro');
    const neg = digitados.find(([, x]) => n(x.q) < 0);
    if (neg) return avisar('Quantidade não pode ser negativa.', 'erro');
    const ok = await confirmar({ titulo: 'Salvar contagem', ok: 'Salvar', mensagem: html`<p>Salvar <b>${pl(digitados.length, 'item contado', 'itens contados')}</b>?</p>
      <p class="nota">O estoque ainda não muda: a contagem fica aguardando o administrador conferir e implantar. Até lá você pode corrigir.</p>` });
    if (!ok) return;
    const r = await executar(() => api.rpc('salvar_contagem_inicial', { p: { itens: digitados.map(([id, x]) => ({ produto_id: Number(id), quantidade: n(x.q), unidade: x.un, observacao: x.obs || null })) } }),
      'Contagem salva.');
    if (r) { setV({}); await recarregar(); }
  }

  const folha = [
    { titulo: 'Código', valor: (p) => p.codigo }, { titulo: 'Produto', valor: (p) => p.descricao, largura: 40 },
    { titulo: 'Contar em', valor: (p) => (p.unidade_compra ? `${p.unidade_compra} (${p.fator_compra} ${p.unidade_estoque}) ou ${p.unidade_estoque}` : p.unidade_estoque) },
    { titulo: 'Quantidade', valor: (p) => (pend.get(p.id) ? Number(pend.get(p.id).qtd_informada) : ''), texto: (p) => (pend.get(p.id) ? `${String(pend.get(p.id).qtd_informada).replace('.', ',')} ${pend.get(p.id).unidade_informada}` : '__________'), num: true },
    { titulo: 'Observação', valor: (p) => pend.get(p.id)?.observacao || '', texto: (p) => pend.get(p.id)?.observacao || '' },
  ];

  if (!contagens) return html`<${Carregando} />`;
  return html`
    <${Cabecalho} titulo="Contagem inicial (saldo de abertura)" sub="Conte o que existe fisicamente e digite aqui. O estoque só muda quando o administrador implantar.">
      <${Exportar} titulo="Folha de contagem inicial" filtros=${`${cat ? CATEGORIAS[cat] : 'Todas as categorias'} · ${pl(lista.length, 'item', 'itens')} · ${dataHora(new Date())}`}
        arquivo=${`folha-contagem-inicial-${hojeISO()}`} linhas=${lista} colunas=${folha} paisagem=${false} />
    </${Cabecalho}>
    <div class="cartoes">
      <${Cartao} titulo="Itens nesta categoria" valor=${produtos.length} aoClicar=${() => setFiltro('todos')} cor=${filtro === 'todos' ? 'c-ativo' : ''} />
      <${Cartao} titulo="Falta contar" valor=${falta} cor=${(filtro === 'falta' ? 'c-ativo ' : '') + (falta ? 'c-laranja' : '')} aoClicar=${() => setFiltro('falta')} />
      <${Cartao} titulo="Contados (aguardando implantar)" valor=${nCont} cor=${filtro === 'contados' ? 'c-ativo' : ''} aoClicar=${() => setFiltro('contados')} />
      <${Cartao} titulo="Já implantados" valor=${nImpl} cor=${filtro === 'implantados' ? 'c-ativo' : ''} aoClicar=${() => setFiltro('implantados')} />
    </div>
    <div class="chips">
      ${Object.entries(CATEGORIAS).map(([k, t]) => html`<button class=${'chip' + (cat === k ? ' ativo' : '')} onClick=${() => { setCat(k); setFiltro('todos'); }}>${t}</button>`)}
      <button class=${'chip' + (!cat ? ' ativo' : '')} onClick=${() => setCat('')}>Todas</button>
    </div>
    <div class="filtros"><${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Buscar produto" /></div>
    ${!produtos.length && html`<div class="aviso-faixa"><span>Nenhum produto cadastrado nesta categoria. Os produtos precisam estar cadastrados antes da contagem (Cadastros › Produtos ou Configurações › Importar planilha).</span></div>`}
    <div class="lista-conferencia">
      ${lista.map((p) => { const x = v[p.id] || {}; const c = pend.get(p.id); const im = impl.get(p.id);
        return html`<div class=${'conf-item' + (c || im ? ' ok' : '')} key=${p.id}>
          <div class="conf-cab"><b>${p.descricao}</b><small>${p.codigo}${p.unidade_compra ? ` · 1 ${p.unidade_compra} = ${String(p.fator_compra).replace('.', ',')} ${p.unidade_estoque}` : ''}</small></div>
          ${im ? html`<div class="conf-info"><${Etiqueta} cor="verde">implantado</${Etiqueta}> ${qu(im.qtd_informada, im.unidade_informada)} · ${dataHora(im.implantado_em)}</div>`
          : html`
            ${c && html`<div class="conf-info"><${Etiqueta} cor="azul">contado</${Etiqueta}> <b>${qu(c.qtd_informada, c.unidade_informada)}</b> · ${nomeUsuario(perfil(c.contado_por))} · ${dataHora(c.contado_em)}${c.observacao ? ` · ${c.observacao}` : ''}</div>`}
            <div class="conf-entrada"><span>${c ? 'Corrigir para:' : 'Contado:'}</span>
              <${QtdUnidade} produto=${p} valor=${x.q ?? ''} unidade=${x.un || c?.unidade_informada || p.unidade_compra || p.unidade_estoque} aoMudar=${(q, un) => mudar(p, { q, un })} /></div>
            ${x.q !== undefined && x.q !== '' && html`<input class="entrada" placeholder="Observação (opcional): ex. 3 sacos abertos" value=${x.obs || ''} onInput=${(e) => mudar(p, { obs: e.target.value })} />`}`}
        </div>`; })}
    </div>
    <p class="nota">Dica: conte por prateleira/câmara e salve a cada bloco. Saco aberto: digite em kg. Errou? Digite de novo no mesmo item e salve: vale a última contagem.</p>
    <div class="barra-acao fixa"><span><b>${pl(digitados.length, 'item digitado', 'itens digitados')}</b> (ainda não salvos)</span>
      ${podeFazer('implantacao') && nCont > 0 && html`<button class="btn btn-sec" onClick=${() => ir('configuracoes', { aba: 'implantacao' })}>Implantar (administrador)</button>`}
      <button class="btn btn-pri" disabled=${ocupado || !digitados.length} onClick=${salvar}>Salvar contagem</button></div>`;
}
