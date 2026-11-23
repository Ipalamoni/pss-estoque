// Configurações (parâmetros) e implantação de saldo — somente administrador
import { html, useState, useMemo, useApp, Campo, Numero, QtdUnidade, Busca, Cabecalho, Abas, Tabela, useAcao, confirmar, avisar, n } from '../ui.js';
import { lerPlanilha, planilhaDoCadastro } from '../importacao.js';
import { CATEGORIAS, qtd, moeda, contem, qtdDupla, fator, pl, hojeISO, mensagemErro, qu, dataHora, nomeUsuario, mascaraDoc, docLimpo, problemaDoc } from '../util.js';
import { useContagens } from './contagem.js';
import { UnidadesLocais } from './locais.js';
import { carregarExcel, lerPlanilhaIsolada } from '../export.js';

export function TelaConfiguracoes() {
  const { estadoRota, setEstadoRota } = useApp();
  const [aba, setAba] = useState(estadoRota?.aba || 'parametros');
  if (estadoRota) setTimeout(() => setEstadoRota(null), 0);
  return html`
    <${Cabecalho} titulo="Configurações e locais" />
    <${Abas} abas=${[{ id: 'parametros', titulo: 'Parâmetros' }, { id: 'locais', titulo: 'Unidades e locais' }, { id: 'importar', titulo: 'Importar planilha' }, { id: 'implantacao', titulo: 'Implantação de saldo' }]} ativa=${aba} aoMudar=${setAba} />
    ${aba === 'parametros' && html`<${Parametros} />`}
    ${aba === 'locais' && html`<${UnidadesLocais} />`}
    ${aba === 'importar' && html`<${Importar} />`}
    ${aba === 'implantacao' && html`<${Implantacao} />`}`;
}

const OPCOES = { permitir_saldo_negativo: ['sim', 'nao'], usar_minimo: ['definido', 'calculado', 'maior'] };

function Parametros() {
  const { dados, recarregar, api } = useApp();
  const [vals, setVals] = useState(Object.fromEntries(dados.parametros.map((p) => [p.chave, p.valor ?? ''])));
  const [ocupado, executar] = useAcao();
  async function salvar() { if (await executar(() => api.rpc('salvar_parametros', { p: vals }), 'Configurações salvas.')) await recarregar(); }
  return html`<section class="painel">
    <div class="grade">
      ${dados.parametros.map((p) => p.chave === 'empresa_cnpj' ? html`<${Campo} rotulo="empresa cnpj"
          ajuda=${problemaDoc(vals.empresa_cnpj, 'PJ') ? html`<span class="texto-erro">${problemaDoc(vals.empresa_cnpj, 'PJ')}</span>` : `${p.descricao}. Digite só os números.`}>
          <input class="entrada" inputmode="numeric" value=${mascaraDoc(vals.empresa_cnpj, 'PJ')} placeholder="00.000.000/0000-00"
            onInput=${(e) => setVals({ ...vals, empresa_cnpj: docLimpo(e.target.value, 'PJ') })} /></${Campo}>`
        : html`<${Campo} rotulo=${p.chave.replace(/_/g, ' ')} ajuda=${p.descricao} classe=${p.chave.startsWith('empresa_nome') || p.chave === 'pedido_rodape' ? 'larga' : ''}>
        ${OPCOES[p.chave] ? html`<select class="entrada" value=${vals[p.chave]} onChange=${(e) => setVals({ ...vals, [p.chave]: e.target.value })}>
            ${OPCOES[p.chave].map((o) => html`<option>${o}</option>`)}</select>`
          : html`<input class="entrada" value=${vals[p.chave]} onInput=${(e) => setVals({ ...vals, [p.chave]: e.target.value })} />`}
      </${Campo}>`)}
    </div>
    <div class="barra-acao"><button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>Salvar configurações</button></div>
  </section>`;
}

function Implantacao() {
  const { dados, recarregar, api } = useApp();
  const [busca, setBusca] = useState('');
  const [cat, setCat] = useState('');
  const [v, setV] = useState({});   // id -> { q, un, c }
  const [obs, setObs] = useState('Implantação de saldo (contagem inicial)');
  const [ocupado, executar] = useAcao();
  const contagens = useContagens();
  const pend = useMemo(() => new Map((contagens || []).filter((c) => c.situacao === 'pendente').map((c) => [c.produto_id, c])), [contagens]);
  const [soContados, setSoContados] = useState(false);
  const lista = useMemo(() => dados.ind.filter((p) => p.ativo && (!cat || p.categoria === cat) && contem(`${p.codigo} ${p.descricao}`, busca)
    && (!soContados || pend.has(p.id))), [dados, busca, cat, soContados, pend]);
  function trazer() {
    if (!pend.size) return avisar('Não há contagem do almoxarifado aguardando implantação.', 'aviso');
    setV((x) => { const y = { ...x }; for (const [id, c] of pend) y[id] = { ...(y[id] || {}), q: String(Number(c.qtd_informada)).replace('.', ','), un: c.unidade_informada }; return y; });
    setSoContados(true);
    avisar(`${pl(pend.size, 'item trazido', 'itens trazidos')} da contagem. Agora informe o custo de cada um.`);
  }
  const mudar = (p, ch) => setV((x) => ({ ...x, [p.id]: { un: p.unidade_compra || p.unidade_estoque, ...x[p.id], ...ch } }));
  const preenchidos = Object.entries(v).filter(([, x]) => n(x.q) > 0);
  const total = preenchidos.reduce((s, [, x]) => s + n(x.q) * (n(x.c) || 0), 0);
  async function registrar() {
    const ok = await confirmar({ titulo: 'Implantar saldo', ok: 'Implantar', mensagem: html`<p>Vai lançar <b>${pl(preenchidos.length, 'entrada', 'entradas')}</b> de implantação, total de <b>${moeda(total)}</b>.</p>
      <p class="nota">Use só no início do sistema (ou para um produto novo que já existia fisicamente). Depois disso, diferenças devem ser ajustadas pelo Inventário.</p>` });
    if (!ok) return;
    const r = await executar(() => api.rpc('implantar_saldo', { p: { observacao: obs, itens: preenchidos.map(([id, x]) => ({ produto_id: Number(id), quantidade: n(x.q), unidade: x.un, custo_unitario: n(x.c) || 0 })) } }), 'Saldo implantado.');
    if (r) { await recarregar(); setV({}); }
  }
  return html`<section class="painel">
    <p class="nota">Digite a quantidade contada e o custo unitário (na unidade escolhida). O custo forma o custo médio inicial. Itens em branco são ignorados.</p>
    ${pend.size > 0 && html`<div class="aviso-faixa"><span>O almoxarifado contou <b>${pl(pend.size, 'item', 'itens')}</b> que aguardam implantação.</span>
      <button class="btn btn-destaque btn-peq" onClick=${trazer}>Trazer contagem do almoxarifado</button></div>`}
    ${pend.size > 0 && html`<label class="check"><input type="checkbox" checked=${soContados} onChange=${(e) => setSoContados(e.target.checked)} /> Mostrar só os itens contados pelo almoxarifado</label>`}
    <div class="filtros"><${Busca} valor=${busca} aoMudar=${setBusca} />
      <select class="entrada" value=${cat} onChange=${(e) => setCat(e.target.value)}><option value="">Todas as categorias</option>
        ${Object.entries(CATEGORIAS).map(([k, t]) => html`<option value=${k}>${t}</option>`)}</select></div>
    <div class="lista-conferencia">${lista.map((p) => { const x = v[p.id] || {}; return html`<div class="conf-item" key=${p.id}>
      <div class="conf-cab"><b>${p.descricao}</b><small>${p.codigo} · saldo atual ${qtdDupla(p, p.saldo)}</small></div>
      ${pend.get(p.id) && html`<div class="conf-info">Contado pelo almoxarifado: <b>${qu(pend.get(p.id).qtd_informada, pend.get(p.id).unidade_informada)}</b> · ${nomeUsuario(dados.mapa.perfil.get(pend.get(p.id).contado_por))} · ${dataHora(pend.get(p.id).contado_em)}${pend.get(p.id).observacao ? ` · ${pend.get(p.id).observacao}` : ''}</div>`}
      <div class="conf-entrada"><span>Quantidade:</span><${QtdUnidade} produto=${p} valor=${x.q ?? ''} unidade=${x.un || p.unidade_compra || p.unidade_estoque} aoMudar=${(q, un) => mudar(p, { q, un })} /></div>
      <div class="conf-entrada"><span>Custo por ${x.un || p.unidade_compra || p.unidade_estoque}:</span><${Numero} valor=${x.c ?? ''} placeholder="0,00" aoMudar=${(c) => mudar(p, { c })} /></div>
    </div>`; })}</div>
    <${Campo} rotulo="Observação"><input class="entrada" value=${obs} onInput=${(e) => setObs(e.target.value)} /></${Campo}>
    <div class="barra-acao fixa"><span><b>${pl(preenchidos.length, 'item', 'itens')}</b> · ${moeda(total)}</span>
      <button class="btn btn-pri" disabled=${ocupado || !preenchidos.length} onClick=${registrar}>Implantar saldo</button></div>
  </section>`;
}

// ------------------------------------------------------------------
// IMPORTAR PLANILHA (somente administrador)
// ------------------------------------------------------------------
function Importar() {
  const { dados, recarregar, api, podeFazer } = useApp();
  const [lido, setLido] = useState(null);
  const [arquivo, setArquivo] = useState('');
  const [resultado, setResultado] = useState(null);
  const [ocupado, executar] = useAcao();
  if (!podeFazer('importacao')) return html`<p class="nota">Somente o administrador importa planilhas.</p>`;

  async function abrir(e) {
    const f = e.target.files?.[0]; if (!f) return;
    setResultado(null); setArquivo(f.name);
    try { const leitor = await lerPlanilhaIsolada(await f.arrayBuffer()); setLido(lerPlanilha(leitor, null)); }   // aberta em processo isolado (segurança)
    catch (err) { avisar('Não consegui ler a planilha: ' + mensagemErro(err), 'erro'); setLido(null); }
    e.target.value = '';
  }
  async function baixarModelo() {
    try {
      const b64 = (await import('../modelo/planilha-modelo.js')).default;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = 'Modelo_Cadastro_Estoque_PSS.xlsx'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) { avisar('Não consegui baixar a planilha-modelo: ' + mensagemErro(err), 'erro'); }
  }
  async function baixarAtual() {
    try { const X = await carregarExcel(); X.writeFile(planilhaDoCadastro(X, dados), `cadastro-atual-${hojeISO()}.xlsx`); }
    catch (err) { avisar(mensagemErro(err), 'erro'); }
  }
  async function importar() {
    const total = lido.fornecedores.length + lido.produtos.length + lido.receitas.length + lido.saldos.length;
    const ok = await confirmar({ titulo: 'Importar para o sistema', ok: 'Importar agora', mensagem: html`
      <ul class="lista-simples">
        <li>${pl(lido.fornecedores.length, 'fornecedor', 'fornecedores')}</li><li>${pl(lido.produtos.length, 'produto', 'produtos')}</li>
        <li>${pl(lido.receitas.length, 'receita', 'receitas')} (${pl(lido.receitas.reduce((s, r) => s + r.itens.length, 0), 'ingrediente', 'ingredientes')})</li>
        <li>${pl(lido.saldos.length, 'saldo inicial', 'saldos iniciais')}</li></ul>
      <p class="nota">Códigos que já existem são atualizados; os novos são criados. Nada é apagado. Se alguma linha der erro, nada é gravado.</p>
      ${lido.saldos.length > 0 && html`<div class="alerta">Atenção: o <b>saldo inicial soma</b> ao estoque atual. Importe a aba "Saldo inicial" uma única vez.</div>`}` });
    if (!ok || !total) return;
    const r = await executar(() => api.rpc('importar_cadastros', { p: { fornecedores: lido.fornecedores, produtos: lido.produtos, receitas: lido.receitas, saldos: lido.saldos } }), 'Importação concluída.');
    if (r) { setResultado(r); setLido(null); await recarregar(); }
  }
  const previa = (titulo, linhas, colunas) => linhas.length > 0 && html`<h3>${titulo} (${linhas.length})</h3><${Tabela} linhas=${linhas} chave="linha" max=${8} colunas=${colunas} />`;

  return html`<section class="painel">
    <p>Use a planilha-modelo para cadastrar de uma vez fornecedores, produtos (com grupo, classificação e marca), receitas e o saldo inicial.
      Só o administrador vê esta tela; no dia a dia, cada um cadastra nas telas normais.</p>
    <div class="cabecalho-acoes">
      <button class="btn btn-sec" onClick=${baixarModelo}>Baixar planilha-modelo (vazia)</button>
      <button class="btn btn-sec" onClick=${baixarAtual}>Baixar cadastro atual neste formato</button>
      <label class="btn btn-destaque"><input type="file" accept=".xlsx,.xls" hidden onChange=${abrir} />Escolher planilha preenchida…</label>
    </div>
    ${resultado && html`<div class="alerta alerta-ok"><b>Importado:</b><ul class="lista-simples">
      <li>${pl(resultado.fornecedores_novos, 'fornecedor novo', 'fornecedores novos')} e ${pl(resultado.fornecedores_atualizados, 'atualizado', 'atualizados')}</li>
      <li>${pl(resultado.produtos_novos, 'produto novo', 'produtos novos')} e ${pl(resultado.produtos_atualizados, 'atualizado', 'atualizados')}</li>
      <li>${pl(resultado.receitas_novas, 'receita nova', 'receitas novas')} e ${pl(resultado.receitas_atualizadas, 'atualizada', 'atualizadas')}</li>
      <li>${pl(resultado.saldos_implantados, 'saldo implantado', 'saldos implantados')}</li></ul></div>`}
    ${lido && html`
      <p class="nota">Arquivo <b>${arquivo}</b> · abas lidas: ${lido.abasLidas.join(', ') || 'nenhuma'}.</p>
      ${lido.erros.length > 0 ? html`<div class="painel painel-alerta"><h3>⚠ Corrija na planilha antes de importar (${pl(lido.erros.length, 'problema', 'problemas')})</h3>
          <${Tabela} linhas=${lido.erros.map((e, i) => ({ ...e, id: i }))} max=${50} colunas=${[
            { chave: 'aba', titulo: 'Aba' }, { chave: 'linha', titulo: 'Linha', num: true }, { chave: 'msg', titulo: 'O que corrigir' }]} /></div>`
        : html`<div class="alerta alerta-ok">Tudo certo na conferência da planilha. Confira a prévia e clique em <b>Importar</b>.</div>`}
      ${previa('Fornecedores', lido.fornecedores, [{ chave: 'linha', titulo: 'Linha', num: true }, { chave: 'nome', titulo: 'Nome' }, { chave: 'cnpj', titulo: 'CNPJ' }, { chave: 'prazo_entrega_dias', titulo: 'Prazo', num: true }])}
      ${previa('Produtos', lido.produtos, [{ chave: 'linha', titulo: 'Linha', num: true }, { chave: 'codigo', titulo: 'Código' }, { chave: 'descricao', titulo: 'Descrição' },
        { chave: 'categoria', titulo: 'Categoria', render: (p) => CATEGORIAS[p.categoria] }, { chave: 'grupo', titulo: 'Grupo' }, { chave: 'classificacao', titulo: 'Classif.' },
        { chave: 'marca', titulo: 'Marca' }, { chave: 'unidade_estoque', titulo: 'Unid.', render: (p) => (p.unidade_compra ? `${p.unidade_estoque} · 1 ${p.unidade_compra} = ${p.fator_compra}` : p.unidade_estoque) },
        { chave: 'ex', titulo: 'No sistema', render: (p) => (dados.produtos.some((x) => x.codigo.toLowerCase() === p.codigo.toLowerCase()) ? 'atualiza' : 'novo') }])}
      ${previa('Receitas', lido.receitas, [{ chave: 'linha', titulo: 'Linha', num: true }, { chave: 'codigo', titulo: 'Código' }, { chave: 'nome', titulo: 'Receita' },
        { chave: 'itens', titulo: 'Ingredientes', render: (r) => r.itens.map((i) => `${i.codigo_produto} ${String(i.quantidade).replace('.', ',')} ${i.unidade}`).join(' · ') },
        { chave: 'ex', titulo: 'No sistema', render: (r) => (dados.fichas.some((x) => x.codigo.toLowerCase() === r.codigo.toLowerCase()) ? 'atualiza' : 'nova') }])}
      ${previa('Saldo inicial', lido.saldos, [{ chave: 'linha', titulo: 'Linha', num: true }, { chave: 'codigo_produto', titulo: 'Código' },
        { chave: 'quantidade', titulo: 'Quantidade', num: true }, { chave: 'unidade', titulo: 'Unid.' }, { chave: 'custo_unitario', titulo: 'Custo unit.', num: true, render: (s) => moeda(s.custo_unitario) }])}
      <div class="barra-acao"><button class="btn btn-pri btn-grande" disabled=${ocupado || lido.erros.length > 0} onClick=${importar}>${ocupado ? 'Importando…' : 'Importar para o sistema'}</button></div>`}
  </section>`;
}
