// Cadastro de produtos (matérias-primas, embalagens e outros)
import { html, useState, useMemo, useEffect, useApp, Tabela, Modal, Campo, Numero, Escolher, Busca, Etiqueta, Cabecalho, useAcao, confirmar, n, Filtros } from '../ui.js';
import { veValores, CATEGORIAS, CATEGORIAS_CADASTRO, UNIDADES_ESTOQUE, UNIDADES_COMPRA, contem, qtdDupla, num, moeda, qu, pl, hojeISO } from '../util.js';
import { Icone } from '../icones.js';
import { UltimaAlteracao, HistoricoAuditoria } from '../historico.js';
import { Exportar } from '../exportar.js';

const distintos = (lista, campo) => [...new Set(lista.map((x) => x[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

export function TelaProdutos() {
  const { dados, podeFazer, estadoRota, setEstadoRota } = useApp();
  const [busca, setBusca] = useState('');
  const [cat, setCat] = useState('');
  const [grupo, setGrupo] = useState('');
  const [classif, setClassif] = useState('');
  const [inativos, setInativos] = useState(false);
  const [editando, setEditando] = useState(null);
  const pode = podeFazer('cadastro_produto');
  // veio do sininho ("Completar cadastro"): abre o produto direto
  useEffect(() => { const id = estadoRota?.abrirId; if (id) { const p = dados.mapa.produto.get(id); if (p) setEditando(p); setEstadoRota(null); } }, [estadoRota]);
  const pre = dados.produtos.filter((p) => p.pre_cadastro);
  const grupos = distintos(dados.produtos, 'grupo');
  const classifs = distintos(dados.produtos.filter((p) => !grupo || p.grupo === grupo), 'classificacao');

  const linhas = useMemo(() => dados.ind.filter((p) => (inativos || p.ativo) && (!cat || p.categoria === cat)
    && (!grupo || p.grupo === grupo) && (!classif || p.classificacao === classif)
    && contem(`${p.codigo} ${p.descricao} ${p.id} ${p.marca || ''} ${p.grupo || ''}`, busca)), [dados, busca, cat, grupo, classif, inativos]);

  return html`
    <${Cabecalho} titulo="Produtos" sub="Matérias-primas, embalagens e materiais controlados no estoque">
      <${Exportar} tabela="produtos.telaprodutos" titulo="Cadastro de produtos" filtros=${pl(linhas.length, 'produto', 'produtos')} arquivo=${`produtos-${hojeISO()}`} linhas=${linhas} colunas=${[
        { titulo: 'Código', valor: (p) => p.codigo }, { titulo: 'Código ERP', valor: (p) => p.codigo_erp }, { titulo: 'Descrição', valor: (p) => p.descricao, largura: 36 },
        { titulo: 'Categoria', valor: (p) => CATEGORIAS[p.categoria] }, { titulo: 'Grupo', valor: (p) => p.grupo }, { titulo: 'Classif.', valor: (p) => p.classificacao },
        { titulo: 'Marca', valor: (p) => p.marca }, { titulo: 'Unid. estoque', valor: (p) => p.unidade_estoque }, { titulo: 'Unid. compra', valor: (p) => p.unidade_compra },
        { titulo: 'Fator', valor: (p) => (p.unidade_compra ? Number(p.fator_compra) : ''), num: true }, { titulo: 'Saldo', valor: (p) => Math.round(p.saldo * 1000) / 1000, texto: (p) => qtdDupla(p, p.saldo), num: true },
        { titulo: 'Mín. definido', valor: (p) => p.min_definido, num: true }, { titulo: 'Prazo (dias)', valor: (p) => p.prazo_entrega_dias, num: true },
        { titulo: 'Fornecedor principal', valor: (p) => dados.mapa.fornecedor.get(p.fornecedor_padrao_id)?.nome }, { titulo: 'Ativo', valor: (p) => (p.ativo ? 'sim' : 'não') }]} />
      ${pode && html`<button class="btn btn-pri" onClick=${() => setEditando({})}><${Icone} nome="mais" tam=${18} /> Novo produto</button>`}
    </${Cabecalho}>
    ${pre.length > 0 && html`<div class="alerta alerta-pre"><b>${pl(pre.length, 'produto pré-cadastrado', 'produtos pré-cadastrados')} no recebimento.</b> ${pode ? 'Abra, complete e salve:' : 'O comprador vai completar:'}
      <span class="pre-lista">${pre.map((p) => html`<button type="button" class="chip" key=${p.id} onClick=${() => setEditando(p)}>${p.descricao}</button>`)}</span></div>`}
    <${Filtros} ativos=${[cat, grupo, classif].filter(Boolean).length} fixo=${html`<${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Buscar por código, descrição ou marca" />`}>
      <select class="entrada" value=${cat} onChange=${(e) => setCat(e.target.value)}>
        <option value="">Todas as categorias</option>
        ${Object.entries(CATEGORIAS).map(([k, v]) => html`<option value=${k}>${v}</option>`)}
      </select>
      <select class="entrada" value=${grupo} onChange=${(e) => { setGrupo(e.target.value); setClassif(''); }}>
        <option value="">Todos os grupos</option>${grupos.map((g) => html`<option>${g}</option>`)}</select>
      <select class="entrada" value=${classif} onChange=${(e) => setClassif(e.target.value)}>
        <option value="">Todas as classificações</option>${classifs.map((c) => html`<option value=${c}>Classificação ${c}</option>`)}</select>
      <label class="check"><input type="checkbox" checked=${inativos} onChange=${(e) => setInativos(e.target.checked)} /> Mostrar inativos</label>
    </${Filtros}>
    <${Tabela} id="produtos.telaprodutos" linhas=${linhas} aoClicar=${(p) => setEditando(p)} ordemInicial=${{ chave: 'codigo', dir: 1 }}
      colunas=${[
        { chave: 'codigo', titulo: 'Código', render: (p) => html`<b>${p.codigo}</b>` },
        { chave: 'descricao', titulo: 'Descrição', classe: 'col-desc', render: (p) => html`${p.descricao}${p.pre_cadastro && html`<span class="tag-pre">pré-cadastro</span>`}${!p.ativo && html` <${Etiqueta}>inativo</${Etiqueta}>`}` },
        { chave: 'categoria', titulo: 'Categoria', render: (p) => CATEGORIAS[p.categoria] },
        { chave: 'grupo', titulo: 'Grupo', render: (p) => p.grupo || '–' },
        { chave: 'classificacao', titulo: 'Classif.', render: (p) => (p.classificacao ? html`<${Etiqueta} cor="azul">${p.classificacao}</${Etiqueta}>` : '–') },
        { chave: 'marca', titulo: 'Marca', render: (p) => p.marca || '–' },
        { chave: 'unidade_compra', titulo: 'Unidades', render: (p) => (p.unidade_compra ? `${p.unidade_estoque} · 1 ${p.unidade_compra} = ${qu(p.fator_compra, p.unidade_estoque)}` : p.unidade_estoque) },
        { chave: 'saldo', titulo: 'Saldo', num: true, render: (p) => qtdDupla(p, p.saldo) },
        { chave: 'min_definido', titulo: 'Mín. definido', num: true, render: (p) => (p.min_definido === null ? '–' : num(p.min_definido, 3)) },
      ]} />
    <p class="nota">${pl(linhas.length, 'produto', 'produtos')}. Produtos não são excluídos (o histórico precisa deles): quando não forem mais usados, ficam <b>inativos</b>.</p>
    ${editando && html`<${FormProduto} produto=${editando} aoFechar=${() => setEditando(null)} somenteLeitura=${!pode} />`}`;
}

function FormProduto({ produto, aoFechar, somenteLeitura }) {
  const { dados, recarregar, api, papeis } = useApp();
  const [f, setF] = useState(() => ({
    codigo: produto.codigo || '', codigo_erp: produto.codigo_erp || '', descricao: produto.descricao || '',
    categoria: produto.categoria || 'materia_prima', grupo: produto.grupo || '', classificacao: produto.classificacao || '', marca: produto.marca || '',
    unidade_estoque: produto.unidade_estoque || 'kg',
    unidade_compra: produto.unidade_compra || '', fator_compra: produto.fator_compra ? String(produto.fator_compra).replace('.', ',') : '1',
    estoque_minimo: produto.estoque_minimo ?? '', prazo_entrega_dias: produto.prazo_entrega_dias ?? '',
    fornecedor_padrao_id: produto.fornecedor_padrao_id || null, observacao: produto.observacao || '', ativo: produto.ativo !== false,
    controla_estoque: produto.controla_estoque !== false,
    baixa_producao: produto.baixa_producao ?? ((produto.categoria || 'materia_prima') === 'materia_prima'),
    baixa_requisicao: produto.baixa_requisicao ?? ((produto.categoria || 'materia_prima') !== 'materia_prima'),
    usado_na: produto.usado_na || ((produto.categoria || 'materia_prima') === 'materia_prima' ? 'pesagem' : ''),
    local_padrao_id: produto.local_padrao_id || null, unidade2: produto.unidade2 || '',
    peso_embalagem_g: produto.peso_embalagem_g != null ? String(Number(produto.peso_embalagem_g)).replace('.', ',') : '',
  }));
  const [ocupado, executar] = useAcao();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const temCompra = f.unidade_compra && f.unidade_compra !== f.unidade_estoque;
  const minNum = n(f.estoque_minimo);
  const sugestao = sugerirCodigo(dados.produtos, f.categoria);
  const montar = (extra = {}) => ({ ...f, ...extra, codigo: f.codigo.trim() || sugestao, id: produto.id || null, fator_compra: temCompra ? n(f.fator_compra) : 1,
    estoque_minimo: n(f.estoque_minimo), prazo_entrega_dias: n(f.prazo_entrega_dias), peso_embalagem_g: n(f.peso_embalagem_g),
    usado_na: f.categoria === 'materia_prima' ? f.usado_na || 'pesagem' : null, unidade2: f.unidade2 || null,
    baixa_producao: f.controla_estoque ? f.baixa_producao : false, baixa_requisicao: f.controla_estoque ? f.baixa_requisicao : false,
    ficha_id: produto.ficha_id || null });
  const sistema = ['intermediario', 'produto_acabado'].includes(f.categoria);
  const pesoObrig = f.categoria === 'embalagem' && f.controla_estoque && ['kg', 'g'].includes(f.unidade_estoque.toLowerCase());

  async function salvar() {
    const ok = await executar(() => api.rpc('salvar_produto', { p: montar() }), 'Produto salvo.');
    if (ok) { await recarregar(); aoFechar(); }
  }
  async function alternarAtivo() {
    const desativar = produto.ativo !== false;
    const ok = await confirmar({ titulo: desativar ? 'Desativar produto' : 'Reativar produto', perigo: desativar, ok: desativar ? 'Desativar' : 'Reativar',
      mensagem: desativar ? `"${produto.descricao}" deixa de aparecer nas listas de pedido, recebimento e saída. O histórico continua guardado e você pode reativar quando quiser.`
        : `"${produto.descricao}" volta a aparecer nas listas.` });
    if (!ok) return;
    if (await executar(() => api.rpc('salvar_produto', { p: { ...produto, ativo: !desativar } }), desativar ? 'Produto desativado.' : 'Produto reativado.')) { await recarregar(); aoFechar(); }
  }
  const dl = (id, lista) => html`<datalist id=${id}>${lista.map((u) => html`<option value=${u} />`)}</datalist>`;

  return html`<${Modal} titulo=${produto.id ? `Produto ${produto.codigo}${produto.ativo === false ? ' (inativo)' : ''}` : 'Novo produto'} aoFechar=${aoFechar} largo
    rodape=${somenteLeitura ? html`<button class="btn btn-sec" onClick=${aoFechar}>Fechar</button>`
      : html`${produto.id && html`<button class=${'btn ' + (produto.ativo === false ? 'btn-sec' : 'btn-perigo-sec')} disabled=${ocupado} onClick=${alternarAtivo}>
          ${produto.ativo === false ? 'Reativar produto' : 'Desativar produto'}</button>`}
        <span class="espaco"></span>
        <button class="btn btn-sec" onClick=${aoFechar}>Cancelar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>${ocupado ? 'Salvando…' : 'Salvar'}</button>`}>
    <fieldset disabled=${somenteLeitura} class="grade">
      <${Campo} rotulo="Código gerencial" obrigatorio ajuda=${produto.id ? `Código interno (fixo): #${produto.id}. O gerencial pode ser trocado; o histórico continua amarrado ao interno.` : 'Pode ser trocado depois, se precisar.'}>
        <input class="entrada" value=${f.codigo} placeholder=${produto.id ? '' : `${sugestao} (automático)`} onInput=${set('codigo')} /></${Campo}>
      <${Campo} rotulo="Código no ERP" ajuda="Opcional: o código do mesmo item no ERP, para conciliar."><input class="entrada" value=${f.codigo_erp} onInput=${set('codigo_erp')} /></${Campo}>
      <${Campo} rotulo="Descrição" obrigatorio classe="larga"><input class="entrada" value=${f.descricao} onInput=${set('descricao')} placeholder="ex.: Farinha de trigo tipo A Coamo" /></${Campo}>
      <${Campo} rotulo="Categoria" obrigatorio>
        <select class="entrada" value=${f.categoria} disabled=${sistema} onChange=${(e) => { const c = e.target.value; setF((x) => ({ ...x, categoria: c,
          ...(produto.id ? {} : { baixa_producao: c === 'materia_prima', baixa_requisicao: c !== 'materia_prima', usado_na: c === 'materia_prima' ? 'pesagem' : '' }) })); }}>
          ${(sistema ? [f.categoria] : CATEGORIAS_CADASTRO).map((k) => html`<option value=${k}>${CATEGORIAS[k]}</option>`)}
        </select></${Campo}>
      <${Campo} rotulo="Grupo" ajuda="Agrupa produtos parecidos: Farinha, Fermento, Melhorador, Bobina…">
        <input class="entrada" list="grupos" value=${f.grupo} onInput=${set('grupo')} />${dl('grupos', distintos(dados.produtos, 'grupo'))}</${Campo}>
      <${Campo} rotulo="Classificação" ajuda="Ex.: A, B, C, D (farinha mais forte ou mais fraca). Marcas diferentes podem ter a mesma classificação.">
        <input class="entrada" list="classifs" value=${f.classificacao} onInput=${(e) => set('classificacao')(e.target.value.toUpperCase())} />${dl('classifs', ['A', 'B', 'C', 'D'])}</${Campo}>
      <${Campo} rotulo="Marca"><input class="entrada" list="marcas" value=${f.marca} onInput=${set('marca')} />${dl('marcas', distintos(dados.produtos, 'marca'))}</${Campo}>
      <${Campo} rotulo="Unidade de estoque" obrigatorio ajuda="Unidade em que o estoque é controlado e a pesagem dá saída (ex.: kg).">
        <input class="entrada" list="ue" value=${f.unidade_estoque} onInput=${set('unidade_estoque')} />${dl('ue', UNIDADES_ESTOQUE)}</${Campo}>
      <${Campo} rotulo="Unidade de compra" ajuda="Como vem do fornecedor (ex.: saco, bobina). Deixe vazio se for igual.">
        <input class="entrada" list="uc" value=${f.unidade_compra} onInput=${set('unidade_compra')} />${dl('uc', UNIDADES_COMPRA)}</${Campo}>
      ${temCompra && html`<${Campo} rotulo=${`Quantos ${f.unidade_estoque} tem 1 ${f.unidade_compra}?`} obrigatorio
        ajuda=${`Ex.: 1 saco = 25 kg. Hoje: 1 ${f.unidade_compra} = ${f.fator_compra || '?'} ${f.unidade_estoque}.`}>
        <${Numero} valor=${f.fator_compra} aoMudar=${set('fator_compra')} /></${Campo}>`}
      ${temCompra && n(f.fator_compra) > 0 && html`<div class="larga alerta alerta-ok exemplo-conv">
        <b>Como fica:</b> o pedido e o recebimento podem ser em ${f.unidade_compra} ou em ${f.unidade_estoque}; o estoque fica sempre em <b>${f.unidade_estoque}</b>.
        Ex.: chegam ${qu(3, f.unidade_compra)} → entram ${qu(3 * n(f.fator_compra), f.unidade_estoque)}. Uma saída de ${qu(3.2 * n(f.fator_compra), f.unidade_estoque, 1)} (não precisa ser ${f.unidade_compra} fechado)
        deixa ${qu(n(f.fator_compra) * 10 - 3.2 * n(f.fator_compra), f.unidade_estoque, 1)} de um estoque de ${qu(10, f.unidade_compra)}.
        ${['kg', 'l'].includes(f.unidade_estoque.toLowerCase()) && ` A pesagem também pode lançar em ${f.unidade_estoque.toLowerCase() === 'kg' ? 'g' : 'mL'}.`}</div>`}
      ${UNIDADES_COMPRA.includes(f.unidade_estoque) && !['un', 'kg', 'L', 'rolo'].includes(f.unidade_estoque) && html`<div class="larga alerta">
        Atenção: "${f.unidade_estoque}" parece unidade de <b>compra</b>. Se a produção usa por peso ou volume, controle o estoque em kg, g, L ou un e informe ${f.unidade_estoque} como unidade de compra.</div>`}
      <${Campo} rotulo=${`Estoque mínimo definido (${f.unidade_estoque})`}
        ajuda=${minNum && temCompra && n(f.fator_compra) ? `= ${qu(minNum / n(f.fator_compra), f.unidade_compra, 2)}` : 'Valor pela experiência da equipe. O sistema também calcula um mínimo sozinho após 30 dias de uso.'}>
        <${Numero} valor=${f.estoque_minimo} aoMudar=${set('estoque_minimo')} /></${Campo}>
      <${Campo} rotulo="Prazo de entrega (dias)" ajuda="Usado nos cálculos até existir histórico de entregas.">
        <${Numero} valor=${f.prazo_entrega_dias} aoMudar=${set('prazo_entrega_dias')} /></${Campo}>
      <${Campo} rotulo="Fornecedor principal">
        <${Escolher} itens=${dados.fornecedores.filter((x) => x.ativo)} valor=${f.fornecedor_padrao_id} aoMudar=${set('fornecedor_padrao_id')}
          rotuloDe=${(x) => x.nome} /></${Campo}>
      <div class="larga bloco-opcoes">
        <h4>Estoque e baixa</h4>
        <div class="opcoes-linha">
          <span>Controla estoque?</span>
          <div class="seg"><button type="button" class=${f.controla_estoque ? 'ativo' : ''} onClick=${() => set('controla_estoque')(true)}>Sim</button>
            <button type="button" class=${!f.controla_estoque ? 'ativo' : ''} onClick=${() => set('controla_estoque')(false)}>Não</button></div>
        </div>
        ${f.controla_estoque ? html`<div class="opcoes-linha"><span>Como sai do estoque (pelo menos uma)</span>
            <label class="check"><input type="checkbox" checked=${f.baixa_producao} onChange=${(e) => set('baixa_producao')(e.target.checked)} /> Pela produção (ficha técnica)</label>
            <label class="check"><input type="checkbox" checked=${f.baixa_requisicao} onChange=${(e) => set('baixa_requisicao')(e.target.checked)} /> Por requisição / consumo no setor</label></div>
          ${!f.baixa_producao && !f.baixa_requisicao && html`<div class="alerta">Marque pelo menos uma forma de baixa.</div>`}
          ${f.categoria === 'embalagem' && f.baixa_producao && html`<p class="nota">Embalagem com baixa pela produção: ao finalizar a batelada, o sistema baixa pela ficha (nº de embalagens × peso médio).</p>`}`
          : html`<p class="nota">Não controla estoque: aparece no pedido e no recebimento, mas não tem saldo nem baixa.</p>`}
        <div class="grade">
          ${f.categoria === 'materia_prima' && html`<${Campo} rotulo="Usado na" ajuda="Pós vão para a pesagem. Farinha e fermento são usados direto na masseira.">
            <select class="entrada" value=${f.usado_na} onChange=${set('usado_na')}><option value="pesagem">Pesagem (pós)</option><option value="maceira">Masseira (farinha, fermento)</option></select></${Campo}>`}
          <${Campo} rotulo="Local padrão" ajuda="Onde o produto entra no recebimento. Vazio = automático (pesados → Depósito Produção, pós → Pesagem, resto → Almoxarifado).">
            <select class="entrada" value=${f.local_padrao_id || ''} onChange=${(e) => set('local_padrao_id')(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Automático</option>${dados.locais.filter((l) => l.ativo).map((l) => html`<option value=${l.id}>${l.nome}</option>`)}</select></${Campo}>
          <${Campo} rotulo="Conta também por volume? (opcional)" ajuda="Ex.: bobina. Assim o estoque mostra kg e quantas bobinas.">
            <input class="entrada" list="u2" value=${f.unidade2} onInput=${set('unidade2')} placeholder="ex.: bobina" />${dl('u2', ['bobina', 'rolo', 'saco', 'caixa', 'fardo'])}</${Campo}>
          ${f.categoria === 'embalagem' && html`<${Campo} rotulo="Peso médio de 1 embalagem (g)" obrigatorio=${pesoObrig}
            ajuda="Ex.: 12 g por saquinho. Usado para converter as embalagens da ficha em kg (custo e baixa).">
            <${Numero} valor=${f.peso_embalagem_g} aoMudar=${set('peso_embalagem_g')} /></${Campo}>`}
        </div>
      </div>
      <${Campo} rotulo="Observação" classe="larga"><textarea class="entrada" rows="2" value=${f.observacao} onInput=${set('observacao')}></textarea></${Campo}>
    </fieldset>
    ${produto.id && html`<p class="nota">Saldo atual: <b>${qtdDupla(produto, produto.saldo)}</b> ${veValores(papeis) && html`· Custo médio: <b>${moeda(produto.custo_medio)}/${produto.unidade_estoque}</b>`}.
      Saldo e custo só mudam por movimentações (entrada, saída, inventário, correção).</p>`}
    ${produto.id && html`<${UltimaAlteracao} reg=${produto} /><${HistoricoAuditoria} tabela="produtos" id=${produto.id} />`}
  </${Modal}>`;
}

const PREFIXOS = { materia_prima: 'MP', embalagem: 'EM', escritorio: 'ES', limpeza: 'LI', outros: 'OU' };
function sugerirCodigo(produtos, categoria) {
  const pre = PREFIXOS[categoria] || 'OU';
  const nums = produtos.filter((p) => String(p.codigo).toUpperCase().startsWith(pre))
    .map((p) => Number(String(p.codigo).slice(pre.length))).filter((x) => Number.isFinite(x));
  return pre + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}
