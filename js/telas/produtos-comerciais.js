// =====================================================================
// Produtos comerciais (v2.27): cada pão COMERCIAL (código e nome do ERP) e o NOME DA PRODUÇÃO (a massa = ficha
// técnica) de onde ele sai. Vários pães (marcas próprias e terceirizadas) podem sair da mesma massa.
// A produção (programação → pesagem → masseira → finalizar) usa só o nome da produção.
// Este de-para serve às próximas fases: pedidos × produção e programação da embalagem.
// Quem cadastra e edita: administrador e engenharia. O gestor da produção só vê. (A regra está no banco.)
// Cadastro manual (lançamento, produto que voltou a vender) ou pela sugestão do que já veio nos pedidos do ERP.
// =====================================================================
import { html, useState, useEffect, useMemo, useApp, Cabecalho, Tabela, Modal, Campo, Numero, Escolher, Busca, Etiqueta, Carregando,
  useAcao, confirmar, avisar, n, Filtros, MultiEscolha, casaVarios } from '../ui.js';
import { contem, hojeISO, pl, num, mensagemErro, data } from '../util.js';
import { Exportar } from '../exportar.js';
import { Icone } from '../icones.js';

const SEM_MASSA = 'sem';

export function TelaProdutosComerciais() {
  const { dados, api, podeFazer } = useApp();
  const pode = podeFazer('produto_comercial');
  const [lista, setLista] = useState(null);
  const [busca, setBusca] = useState('');
  const [massas, setMassas] = useState([]);
  const [inativos, setInativos] = useState(false);
  const [editando, setEditando] = useState(null);
  const [doErp, setDoErp] = useState(false);
  const [versao, setVersao] = useState(0);
  const [sugestoes, setSugestoes] = useState(null);   // produtos que vieram do ERP e não têm cadastro (só para quem cadastra)

  // carrega ao abrir e sempre que os dados do sistema se atualizam (sem apagar a tela)
  useEffect(() => {
    let vivo = true;
    api.listar('produtos_comerciais', { ordem: ['nome', 'asc'] })
      .then((r) => { if (vivo) setLista(r); })
      .catch((e) => { if (vivo) { setLista((x) => x || []); avisar(mensagemErro(e), 'erro'); } });
    return () => { vivo = false; };
  }, [dados.carregadoEm, versao]);
  useEffect(() => {
    if (!pode) return undefined;
    let vivo = true;
    api.rpc('produtos_comerciais_do_erp').then((r) => { if (vivo) setSugestoes(r || []); }).catch(() => { if (vivo) setSugestoes([]); });
    return () => { vivo = false; };
  }, [pode, versao, dados.carregadoEm]);

  const ficha = (id) => dados.mapa.ficha.get(id);
  const nomeProducao = (p) => (p.ficha_id ? ficha(p.ficha_id)?.nome || '(nome da produção removido)' : '');
  const ativos = (lista || []).filter((p) => p.ativo);
  const semMassa = ativos.filter((p) => !p.ficha_id);
  const opcoesMassa = useMemo(() => [{ valor: SEM_MASSA, rotulo: 'Sem nome da produção' },
    ...dados.fichas.filter((f) => f.ativo).sort((a, b) => a.nome.localeCompare(b.nome)).map((f) => ({ valor: String(f.id), rotulo: f.nome }))], [dados.fichas]);
  const linhas = useMemo(() => (lista || []).filter((p) => (inativos || p.ativo)
    && casaVarios(massas, p.ficha_id ? String(p.ficha_id) : SEM_MASSA)
    && contem(`${p.codigo} ${p.nome} ${nomeProducao(p)}`, busca)), [lista, inativos, massas, busca, dados.fichas]);
  const salvo = () => setVersao((v) => v + 1);

  if (!lista) return html`<${Cabecalho} titulo="Produtos comerciais" /><${Carregando} />`;
  return html`
    <${Cabecalho} titulo="Produtos comerciais" sub="Cada pão comercial (código e nome do ERP) e o nome da produção (a massa) de onde ele sai">
      ${pode && html`<button class="btn btn-sec" onClick=${() => setDoErp(true)}><${Icone} nome="pedidos-erp" tam=${18} /> Escolher do ERP</button>
        <button class="btn btn-pri" onClick=${() => setEditando({})}><${Icone} nome="mais" tam=${18} /> Novo produto comercial</button>`}
    </${Cabecalho}>
    ${(semMassa.length > 0 || sugestoes?.length > 0) && html`<div class="avisos-linha" role="status">
      ${semMassa.length > 0 && html`<div class="aviso-chip aviso-chip-laranja">
        <${Icone} nome="aviso" tam=${18} /><span>${pl(semMassa.length, 'produto comercial sem nome da produção', 'produtos comerciais sem nome da produção')}</span>
        <button type="button" class="btn btn-destaque btn-peq" onClick=${() => { setMassas([SEM_MASSA]); setBusca(''); }}>Resolver</button></div>`}
      ${pode && sugestoes?.length > 0 && html`<div class="aviso-chip">
        <${Icone} nome="pedidos-erp" tam=${18} /><span>${pl(sugestoes.length, 'produto veio do ERP sem cadastro', 'produtos vieram do ERP sem cadastro')}</span>
        <button type="button" class="btn btn-destaque btn-peq" onClick=${() => setDoErp(true)}>Cadastrar</button></div>`}</div>`}
    <${Filtros} ativos=${(massas.length ? 1 : 0) + (inativos ? 1 : 0)}
      fixo=${html`<${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Buscar por código, nome comercial ou nome da produção" />`}
      acoes=${html`<span class="nota">${pl(linhas.length, 'produto', 'produtos')}</span>
        <${Exportar} tabela="produtos-comerciais.lista" titulo="Produtos comerciais" filtros=${pl(linhas.length, 'produto', 'produtos')} arquivo=${`produtos-comerciais-${hojeISO()}`} linhas=${linhas} colunas=${[
          { titulo: 'Código (ERP)', valor: (p) => p.codigo }, { titulo: 'Nome comercial', valor: (p) => p.nome, largura: 36 },
          { titulo: 'Nome da produção', valor: (p) => nomeProducao(p) || 'Sem nome da produção', largura: 30 },
          { titulo: 'Peso do pacote (g)', valor: (p) => (p.peso_pacote_g ? Number(p.peso_pacote_g) : ''), num: true },
          { titulo: 'Ativo', valor: (p) => (p.ativo ? 'sim' : 'não') }, { titulo: 'Observação', valor: (p) => p.observacao, largura: 30 }]} />`}>
      <${MultiEscolha} todos="Todos os nomes da produção" rotulo="Nome da produção" valor=${massas} aoMudar=${setMassas} opcoes=${opcoesMassa} />
      <label class="check"><input type="checkbox" checked=${inativos} onChange=${(e) => setInativos(e.target.checked)} /> Mostrar inativos</label>
    </${Filtros}>
    <${Tabela} id="produtos-comerciais.lista" linhas=${linhas} aoClicar=${setEditando} ordemInicial=${{ chave: 'nome', dir: 1 }}
      vazio=${lista.length ? 'Nenhum produto com esses filtros.' : 'Nenhum produto comercial cadastrado ainda. Use "Escolher do ERP" para começar pelos produtos que já aparecem nos pedidos.'}
      colunas=${[
        { chave: 'codigo', titulo: 'Código (ERP)' },
        { chave: 'nome', titulo: 'Nome comercial', render: (p) => html`<b>${p.nome}</b>${!p.ativo && html` <${Etiqueta}>inativo</${Etiqueta}>`}` },
        { chave: 'massa', titulo: 'Nome da produção', valor: (p) => nomeProducao(p), render: (p) => (p.ficha_id ? nomeProducao(p)
          : html`<${Etiqueta} cor="laranja">sem nome da produção</${Etiqueta}>`) },
        { chave: 'peso_pacote_g', titulo: 'Peso do pacote', num: true, valor: (p) => Number(p.peso_pacote_g || 0), render: (p) => (p.peso_pacote_g ? `${num(p.peso_pacote_g)} g` : '–') },
      ]} />
    ${editando && html`<${FormProdutoComercial} produto=${editando} somenteLeitura=${!pode} aoFechar=${() => setEditando(null)} aoSalvar=${salvo} />`}
    ${doErp && html`<${EscolherDoErp} pronta=${sugestoes} aoFechar=${() => setDoErp(false)} aoEscolher=${(p) => { setDoErp(false); setEditando(p); }} />`}`;
}

function FormProdutoComercial({ produto, somenteLeitura, aoFechar, aoSalvar }) {
  const { dados, api } = useApp();
  const [f, setF] = useState({ codigo: produto.codigo || '', nome: produto.nome || '', ficha_id: produto.ficha_id || null,
    peso_pacote_g: produto.peso_pacote_g ? String(Number(produto.peso_pacote_g)).replace('.', ',') : '', observacao: produto.observacao || '' });
  const [ocupado, executar] = useAcao();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const fichas = dados.fichas.filter((x) => x.ativo || x.id === f.ficha_id);
  const mesmaMassa = f.ficha_id ? dados.fichas.find((x) => x.id === f.ficha_id) : null;
  async function salvar(extra = {}) {
    const p = { id: produto.id || null, codigo: f.codigo, nome: f.nome, ficha_id: f.ficha_id || null, peso_pacote_g: f.peso_pacote_g === '' ? null : n(f.peso_pacote_g),
      observacao: f.observacao, ativo: produto.id ? produto.ativo : true, ...extra };
    const ok = await executar(() => api.rpc('salvar_produto_comercial', { p }), extra.ativo === false ? 'Produto desativado.' : extra.ativo === true ? 'Produto reativado.' : 'Produto comercial salvo.');
    if (ok) { aoSalvar(); aoFechar(); }
  }
  async function alternarAtivo() {
    const desativar = produto.ativo !== false;
    const ok = await confirmar({ titulo: desativar ? 'Desativar produto comercial' : 'Reativar produto comercial', perigo: desativar, ok: desativar ? 'Desativar' : 'Reativar',
      mensagem: desativar ? `"${produto.nome}" sai da lista e dos avisos. O cadastro continua guardado.` : `"${produto.nome}" volta para a lista.` });
    if (ok) await salvar({ ativo: !desativar });
  }
  return html`<${Modal} titulo=${produto.id ? `${produto.nome}${produto.ativo === false ? ' (inativo)' : ''}` : 'Novo produto comercial'} aoFechar=${aoFechar}
    rodape=${somenteLeitura ? html`<button class="btn btn-sec" onClick=${aoFechar}>Fechar</button>`
      : html`${produto.id && html`<button class=${'btn ' + (produto.ativo === false ? 'btn-sec' : 'btn-perigo-sec')} disabled=${ocupado} onClick=${alternarAtivo}>
          ${produto.ativo === false ? 'Reativar produto' : 'Desativar produto'}</button>`}<span class="espaco"></span>
        <button class="btn btn-sec" onClick=${aoFechar}>Cancelar</button>
        <button class="btn btn-pri" disabled=${ocupado} onClick=${() => salvar()}>${ocupado ? 'Salvando…' : 'Salvar produto comercial'}</button>`}>
    <fieldset disabled=${somenteLeitura} class="grade">
      <${Campo} rotulo="Código no ERP" obrigatorio><input class="entrada" maxlength="30" value=${f.codigo} onInput=${set('codigo')} /></${Campo}>
      <${Campo} rotulo="Nome comercial (como está no ERP)" obrigatorio classe="larga2"><input class="entrada" maxlength="150" value=${f.nome} onInput=${set('nome')} /></${Campo}>
      <${Campo} rotulo="Nome da produção (a massa de onde este pão sai)" classe="larga"
        ajuda=${fichas.length ? 'É o nome que aparece na programação, na pesagem e nas masseiras.' : 'Cadastre antes a massa em Fichas técnicas.'}>
        <${Escolher} itens=${fichas} valor=${f.ficha_id} aoMudar=${set('ficha_id')} desabilitado=${somenteLeitura}
          rotuloDe=${(x) => `${x.codigo} · ${x.nome}`} detalheDe=${(x) => (x.rendimento_qtd ? `rende ${num(x.rendimento_qtd)} ${x.rendimento_unidade || ''} por receita` : '')} /></${Campo}>
      <${Campo} rotulo="Peso do pacote (gramas)" ajuda="Ex.: 400. Serve para calcular quantos pacotes a massa rende."><${Numero} valor=${f.peso_pacote_g} aoMudar=${set('peso_pacote_g')} desabilitado=${somenteLeitura} /></${Campo}>
      <${Campo} rotulo="Observação" classe="larga2"><input class="entrada" maxlength="500" value=${f.observacao} onInput=${set('observacao')} /></${Campo}>
    </fieldset>
    ${mesmaMassa && html`<${OutrosDaMassa} fichaId=${mesmaMassa.id} exceto=${produto.id} nomeMassa=${mesmaMassa.nome} />`}
  </${Modal}>`;
}

// mostra os outros pães que saem da mesma massa (ajuda a conferir o de-para)
function OutrosDaMassa({ fichaId, exceto, nomeMassa }) {
  const { api, dados } = useApp();
  const [outros, setOutros] = useState(null);
  useEffect(() => {
    let vivo = true;
    api.listar('produtos_comerciais', { eq: { ficha_id: fichaId, ativo: true } }).then((r) => { if (vivo) setOutros(r.filter((x) => x.id !== exceto)); }).catch(() => { if (vivo) setOutros([]); });
    return () => { vivo = false; };
  }, [fichaId, exceto, dados.carregadoEm]);
  if (!outros || !outros.length) return null;
  return html`<p class="nota">Também saem da massa <b>${nomeMassa}</b>: ${outros.map((x) => x.nome).join(' · ')}</p>`;
}

// lista dos produtos que já vieram nos pedidos do ERP e ainda não estão cadastrados (evita digitar o código errado)
function EscolherDoErp({ pronta, aoFechar, aoEscolher }) {
  const { api } = useApp();
  const [lista, setLista] = useState(pronta || null);
  const [busca, setBusca] = useState('');
  useEffect(() => {
    if (pronta) return undefined;
    let vivo = true;
    api.rpc('produtos_comerciais_do_erp').then((r) => { if (vivo) setLista(r || []); })
      .catch((e) => { if (vivo) { setLista([]); avisar(mensagemErro(e), 'erro'); } });
    return () => { vivo = false; };
  }, []);
  const linhas = (lista || []).filter((p) => contem(`${p.codigo} ${p.nome} ${p.grupo || ''}`, busca));
  return html`<${Modal} titulo="Escolher do ERP" aoFechar=${aoFechar} largo rodape=${html`<span class="nota">${lista ? pl(linhas.length, 'produto sem cadastro', 'produtos sem cadastro') : ''}</span><span class="espaco"></span><button class="btn btn-sec" onClick=${aoFechar}>Fechar</button>`}>
    <p class="nota">Produtos que já apareceram nos pedidos do ERP e ainda não estão cadastrados aqui. Toque em um para cadastrar. Produto que ainda não foi vendido (lançamento) se cadastra pelo botão "Novo produto comercial".</p>
    <${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Buscar por código, nome ou grupo" />
    ${!lista ? html`<${Carregando} />` : html`<${Tabela} id="produtos-comerciais.erp" linhas=${linhas} chave="codigo" ordemInicial=${{ chave: 'nome', dir: 1 }}
      aoClicar=${(p) => aoEscolher({ codigo: p.codigo, nome: p.nome })}
      vazio=${lista.length ? 'Nenhum produto com essa busca.' : 'Todos os produtos dos pedidos do ERP já estão cadastrados.'}
      colunas=${[{ chave: 'codigo', titulo: 'Código' }, { chave: 'nome', titulo: 'Nome no ERP', render: (p) => html`<b>${p.nome}</b>` },
        { chave: 'grupo', titulo: 'Grupo' }, { chave: 'ultima_venda', titulo: 'Último pedido', render: (p) => (p.ultima_venda ? data(String(p.ultima_venda).slice(0, 10)) : '–') }]} />`}
  </${Modal}>`;
}
