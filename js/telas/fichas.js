// Cadastro de fichas técnicas (receitas)
import { html, useState, useMemo, useEffect, useApp, Tabela, Modal, Campo, Escolher, QtdUnidade, Busca, Etiqueta, Cabecalho, Carregando, useAcao, confirmar, avisar, n, Filtros } from '../ui.js';
import { contem, qtd, moeda, fator, dataHora, nomeUsuario, pl, hojeISO } from '../util.js';
import { Exportar } from '../exportar.js';
import { UltimaAlteracao } from '../historico.js';
import { Icone } from '../icones.js';

export function custoFicha(itens, mapaProduto) {
  // só os ingredientes (a embalagem é por unidade produzida e entra no custo da batelada)
  return itens.filter((it) => mapaProduto.get(it.produto_id)?.categoria !== 'embalagem').reduce((s, it) => s + Number(it.quantidade) * Number(mapaProduto.get(it.produto_id)?.custo_medio || 0), 0);
}

export function TelaFichas() {
  const { dados, podeFazer, ir } = useApp();
  const verCusto = podeFazer('custos');   // custo da receita só para a controladoria
  const [busca, setBusca] = useState('');
  const [inativos, setInativos] = useState(false);
  const [editando, setEditando] = useState(null);
  const pode = podeFazer('ficha_tecnica');
  const itensDe = (id) => dados.fichaItens.filter((i) => i.ficha_id === id);
  const linhas = useMemo(() => dados.fichas.filter((f) => (inativos || f.ativo) && contem(`${f.codigo} ${f.nome} ${f.produto_final}`, busca)), [dados, busca, inativos]);

  return html`
    <${Cabecalho} titulo="Fichas técnicas" sub="Receitas usadas na saída da pesagem (quantidades por 1 receita)">
      <${Exportar} titulo="Fichas técnicas" filtros=${pl(linhas.length, 'receita', 'receitas')} arquivo=${`fichas-tecnicas-${hojeISO()}`} linhas=${linhas.flatMap((f) => itensDe(f.id).map((it, i) => ({ f, it, i })))}
        colunas=${[{ titulo: 'Código', valor: (x) => (x.i === 0 ? x.f.codigo : '') }, { titulo: 'Receita', valor: (x) => (x.i === 0 ? x.f.nome : ''), largura: 28 },
          { titulo: 'Produto final', valor: (x) => (x.i === 0 ? x.f.produto_final : '') }, { titulo: 'Rende por receita', valor: (x) => (x.i === 0 && x.f.rendimento_qtd ? Number(x.f.rendimento_qtd) : '') },
          { titulo: 'Unid. rendimento', valor: (x) => (x.i === 0 ? x.f.rendimento_unidade || '' : '') },
          { titulo: 'Cód. ingrediente', valor: (x) => dados.mapa.produto.get(x.it.produto_id)?.codigo }, { titulo: 'Ingrediente', valor: (x) => dados.mapa.produto.get(x.it.produto_id)?.descricao, largura: 32 },
          { titulo: 'Quantidade por receita', valor: (x) => Number(x.it.quantidade), num: true }, { titulo: 'Unid.', valor: (x) => dados.mapa.produto.get(x.it.produto_id)?.unidade_estoque },
          verCusto && { titulo: 'Custo estimado', valor: (x) => Math.round(Number(x.it.quantidade) * Number(dados.mapa.produto.get(x.it.produto_id)?.custo_medio || 0) * 100) / 100, num: true }].filter(Boolean)} />
      ${pode && html`<button class="btn btn-pri" onClick=${() => setEditando({})}><${Icone} nome="mais" tam=${18} /> Nova ficha</button>`}
    </${Cabecalho}>
    <${Filtros} ativos=${inativos ? 1 : 0} fixo=${html`<${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Buscar receita" />`}>
      <label class="check"><input type="checkbox" checked=${inativos} onChange=${(e) => setInativos(e.target.checked)} /> Mostrar inativas</label>
    </${Filtros}>
    <${Tabela} linhas=${linhas} aoClicar=${setEditando} ordemInicial=${{ chave: 'nome', dir: 1 }}
      colunas=${[
        { chave: 'codigo', titulo: 'Código', render: (f) => html`<b>${f.codigo}</b>` },
        { chave: 'nome', titulo: 'Receita', render: (f) => html`<b>${f.nome}</b>${!f.ativo && html` <${Etiqueta}>inativa</${Etiqueta}>`}` },
        { chave: 'produto_final', titulo: 'Produto final' },
        { chave: 'rendimento_qtd', titulo: 'Rende por receita', num: true, valor: (f) => Number(f.rendimento_qtd || 0),
          render: (f) => (f.rendimento_qtd ? `${qtd(f.rendimento_qtd)} ${f.rendimento_unidade || ''}` : html`<${Etiqueta} cor="laranja">preencher</${Etiqueta}>`) },
        { chave: 'n', titulo: 'Ingredientes', num: true, valor: (f) => itensDe(f.id).length, render: (f) => itensDe(f.id).length },
        { chave: 'peso', titulo: 'Massa (kg)', num: true, valor: (f) => pesoKg(itensDe(f.id), dados.mapa.produto), render: (f) => qtd(pesoKg(itensDe(f.id), dados.mapa.produto)) },
        { chave: 'atualizado_em', titulo: 'Última alteração', render: (f) => (f.atualizado_em ? html`${dados.mapa.perfil.get(f.atualizado_por)?.nome}<br /><small>${dataHora(f.atualizado_em)}</small>` : '–') },
        verCusto && { chave: 'custo', titulo: 'Custo estimado', num: true, valor: (f) => custoFicha(itensDe(f.id), dados.mapa.produto), render: (f) => moeda(custoFicha(itensDe(f.id), dados.mapa.produto)) },
      ].filter(Boolean)} />
    ${verCusto && html`<p class="nota">Custo estimado = quantidade de cada ingrediente × custo médio atual do estoque. Custo completo (último e médio, por unidade) em Gestão de custos.</p>`}
    ${editando && html`<${FormFicha} ficha=${editando} itens=${editando.id ? itensDe(editando.id) : []} aoFechar=${() => setEditando(null)}
      somenteLeitura=${!pode} aoUsar=${podeFazer('saida_receita') && editando.id ? () => ir('saidas', { aba: 'receita', ficha: editando.id }) : null} />`}`;
}

function pesoKg(itens, mp) {
  return itens.reduce((s, it) => s + (mp.get(it.produto_id)?.categoria !== 'embalagem' && String(mp.get(it.produto_id)?.unidade_estoque).toLowerCase() === 'kg' ? Number(it.quantidade) : 0), 0);
}

function FormFicha({ ficha, itens, aoFechar, somenteLeitura, aoUsar }) {
  const { dados, recarregar, api, podeFazer } = useApp();
  const mps = dados.produtos.filter((p) => p.categoria === 'materia_prima' && p.ativo);
  const embs = dados.produtos.filter((p) => p.categoria === 'embalagem' && p.ativo);
  const ehEmb = (id) => dados.mapa.produto.get(id)?.categoria === 'embalagem';
  const [f, setF] = useState({ codigo: ficha.codigo || '', nome: ficha.nome || '', produto_final: ficha.produto_final || '', rendimento: ficha.rendimento || '',
    rendimento_qtd: ficha.rendimento_qtd ? String(Number(ficha.rendimento_qtd)).replace('.', ',') : '', rendimento_unidade: ficha.rendimento_unidade || 'pacotes',
    observacao: ficha.observacao || '', ativo: ficha.ativo !== false, linha_id: ficha.linha_id || null,
    tempo_batelada_min: ficha.tempo_batelada_min ? String(ficha.tempo_batelada_min) : '' });
  const [embLinhas, setEmbLinhas] = useState(() => itens.filter((i) => ehEmb(i.produto_id)).map((i) => ({ k: Math.random(), produto_id: i.produto_id, quantidade: String(Number(i.quantidade)).replace('.', ',') })));
  const mudarEmb = (k, ch) => setEmbLinhas((l) => l.map((x) => (x.k === k ? { ...x, ...ch } : x)));
  itens = itens.filter((i) => !ehEmb(i.produto_id));
  const [linhas, setLinhas] = useState(() => itens.length ? itens.map((i) => ({ k: Math.random(), produto_id: i.produto_id, quantidade: String(i.quantidade).replace('.', ','), unidade: dados.mapa.produto.get(i.produto_id)?.unidade_estoque }))
    : [{ k: Math.random(), produto_id: null, quantidade: '', unidade: null }]);
  const [ocupado, executar] = useAcao();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const mudar = (k, ch) => setLinhas((l) => l.map((x) => (x.k === k ? { ...x, ...ch } : x)));
  const custoEmbUn = (p, q) => { const pg = Number(p.peso_embalagem_g || 0); const u = String(p.unidade_estoque).toLowerCase();
    return (q || 0) * (u === 'kg' ? pg / 1000 : u === 'g' ? pg : 1) * Number(p.custo_medio || 0); };
  const custo = linhas.reduce((s, l) => { const p = dados.mapa.produto.get(l.produto_id); return s + (p ? (n(l.quantidade) || 0) * fator(p, l.unidade) * p.custo_medio : 0); }, 0);
  const custoEmb = embLinhas.reduce((s, l) => { const p = dados.mapa.produto.get(l.produto_id); return s + (p ? custoEmbUn(p, n(l.quantidade)) : 0); }, 0) * (n(f.rendimento_qtd) || 0);

  async function salvar() {
    const its = [...linhas.filter((l) => l.produto_id && n(l.quantidade) > 0).map((l) => ({ produto_id: l.produto_id, quantidade: n(l.quantidade), unidade: l.unidade })),
      ...embLinhas.filter((l) => l.produto_id && n(l.quantidade) > 0).map((l) => ({ produto_id: l.produto_id, quantidade: n(l.quantidade), unidade: dados.mapa.produto.get(l.produto_id).unidade_estoque }))];
    if (embLinhas.some((l) => l.produto_id && n(l.quantidade) > 0) && !(n(f.rendimento_qtd) > 0)) return avisar('Com embalagem na ficha, informe quanto 1 receita rende (para saber quantas embalagens usa).', 'erro');
    const rq = n(f.rendimento_qtd);
    if (f.rendimento_qtd && !(rq > 0)) return avisar('O rendimento por receita precisa ser um número maior que zero.', 'erro');
    const rend = rq > 0 ? { rendimento_qtd: rq, rendimento_unidade: String(f.rendimento_unidade || 'un').trim(), rendimento: `${String(f.rendimento_qtd).trim()} ${String(f.rendimento_unidade || 'un').trim()}` }
      : { rendimento_qtd: null, rendimento_unidade: null };
    const ok = await executar(() => api.rpc('salvar_ficha', { p: { ...f, ...rend, id: ficha.id || null, itens: its, tempo_batelada_min: f.tempo_batelada_min ? Math.round(n(f.tempo_batelada_min)) : null } }), 'Ficha técnica salva.');
    if (ok) { await recarregar(); aoFechar(); }
  }
  async function alternarAtivo() {
    const desativar = ficha.ativo !== false;
    const ok = await confirmar({ titulo: desativar ? 'Desativar receita' : 'Reativar receita', perigo: desativar, ok: desativar ? 'Desativar' : 'Reativar',
      mensagem: desativar ? `"${ficha.nome}" deixa de aparecer para a pesagem. O histórico das produções continua guardado.` : `"${ficha.nome}" volta a aparecer para a pesagem.` });
    if (!ok) return;
    const its = [...itens, ...embLinhas.map((l) => ({ produto_id: l.produto_id, quantidade: n(l.quantidade) }))].map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade, unidade: dados.mapa.produto.get(i.produto_id)?.unidade_estoque }));
    if (await executar(() => api.rpc('salvar_ficha', { p: { ...ficha, ativo: !desativar, itens: its } }), desativar ? 'Receita desativada.' : 'Receita reativada.')) { await recarregar(); aoFechar(); }
  }
  return html`<${Modal} titulo=${ficha.id ? `${ficha.codigo} · ${ficha.nome}${ficha.ativo === false ? ' (inativa)' : ''}` : 'Nova ficha técnica'} aoFechar=${aoFechar} largo
    rodape=${html`${aoUsar && html`<button class="btn btn-sec" onClick=${aoUsar}>Dar saída com esta receita</button>`}
      ${!somenteLeitura && ficha.id && html`<button class=${'btn ' + (ficha.ativo === false ? 'btn-sec' : 'btn-perigo-sec')} disabled=${ocupado} onClick=${alternarAtivo}>
        ${ficha.ativo === false ? 'Reativar receita' : 'Desativar receita'}</button>`}
      <span class="espaco"></span>
      ${somenteLeitura ? html`<button class="btn btn-sec" onClick=${aoFechar}>Fechar</button>`
        : html`<button class="btn btn-sec" onClick=${aoFechar}>Cancelar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>${ocupado ? 'Salvando…' : 'Salvar'}</button>`}`}>
    <fieldset disabled=${somenteLeitura} class="grade">
      <${Campo} rotulo="Código da receita" ajuda=${ficha.id ? '' : 'Deixe vazio para gerar automático (R001, R002…).'}>
        <input class="entrada" value=${f.codigo} placeholder=${ficha.id ? '' : 'automático'} onInput=${set('codigo')} /></${Campo}>
      <${Campo} rotulo="Nome da receita" obrigatorio classe="larga"><input class="entrada" value=${f.nome} onInput=${set('nome')} /></${Campo}>
      <${Campo} rotulo="Produto final"><input class="entrada" value=${f.produto_final} onInput=${set('produto_final')} /></${Campo}>
      <${Campo} rotulo="Rende por receita" ajuda="Quanto 1 receita produz. Usado na previsão de produção.">
        <div class="linha-campo"><input class="entrada" inputmode="decimal" placeholder="ex.: 180" value=${f.rendimento_qtd} onInput=${set('rendimento_qtd')} />
          <input class="entrada" list="unidades-rendimento" placeholder="pacotes" value=${f.rendimento_unidade} onInput=${set('rendimento_unidade')} />
          <datalist id="unidades-rendimento"><option value="pacotes" /><option value="unidades" /><option value="pães" /><option value="kg" /><option value="caixas" /></datalist></div></${Campo}>
      <${Campo} rotulo="Linha de produção" ajuda="Ajuda a sugerir a masseira na programação.">
        <select class="entrada" value=${f.linha_id || ''} onChange=${(e) => set('linha_id')(e.target.value ? Number(e.target.value) : null)}>
          <option value="">–</option>${dados.linhas.filter((l) => l.ativo || l.id === f.linha_id).map((l) => html`<option value=${l.id}>${l.nome}</option>`)}</select></${Campo}>
      <${Campo} rotulo="Tempo médio de 1 batelada (min)" ajuda=${`Usado no semáforo das masseiras. Vazio = padrão (${dados.params.producao_tempo_padrao_min || 20} min).`}>
        <input class="entrada" inputmode="numeric" value=${f.tempo_batelada_min} onInput=${set('tempo_batelada_min')} placeholder=${String(dados.params.producao_tempo_padrao_min || 20)} /></${Campo}>
      <${Campo} rotulo="Observação" classe="larga"><textarea class="entrada" rows="2" value=${f.observacao} onInput=${set('observacao')}></textarea></${Campo}>
    </fieldset>
    <h3>Ingredientes (quantidade para 1 receita)</h3>
    <div class="linhas-itens">
      ${linhas.map((l) => { const p = dados.mapa.produto.get(l.produto_id); return html`<div class="linha-item" key=${l.k}>
        <${Escolher} itens=${mps} valor=${l.produto_id} desabilitado=${somenteLeitura} rotuloDe=${(x) => `${x.codigo} · ${x.descricao}`}
          detalheDe=${(x) => [x.grupo, x.classificacao && `classificação ${x.classificacao}`, x.marca].filter(Boolean).join(' · ')}
          aoMudar=${(id, pr) => mudar(l.k, { produto_id: id, unidade: pr.unidade_estoque })} placeholder="Matéria-prima…" />
        <${QtdUnidade} produto=${p} valor=${l.quantidade} unidade=${l.unidade} desabilitado=${somenteLeitura || !p}
          aoMudar=${(v, u) => mudar(l.k, { quantidade: v, unidade: u })} />
        ${!somenteLeitura && html`<button class="btn-icone" title="Remover" onClick=${() => setLinhas((x) => x.filter((y) => y.k !== l.k))}>✕</button>`}
      </div>`; })}
    </div>
    ${!somenteLeitura && html`<button class="btn btn-sec" onClick=${() => setLinhas((x) => [...x, { k: Math.random(), produto_id: null, quantidade: '', unidade: null }])}>+ Ingrediente</button>`}
    <h3>Embalagem (só para o custo)</h3>
    <p class="nota">Quantas embalagens por <b>1 unidade produzida</b> (ex.: 1 saquinho por pacote). Não baixa o estoque aqui: a embalagem sai por requisição. Quando a embalagem for marcada como “baixa pela produção”, ela passa a baixar ao finalizar a batelada.</p>
    <div class="linhas-itens">${embLinhas.map((l) => { const p = dados.mapa.produto.get(l.produto_id); return html`<div class="linha-item" key=${l.k}>
      <${Escolher} itens=${embs} valor=${l.produto_id} desabilitado=${somenteLeitura} rotuloDe=${(x) => `${x.codigo} · ${x.descricao}`}
        detalheDe=${(x) => (x.peso_embalagem_g ? `${x.peso_embalagem_g} g cada` : 'sem peso médio')} aoMudar=${(id) => mudarEmb(l.k, { produto_id: id })} placeholder="Embalagem…" />
      <div class="qtd-un"><input class="entrada" inputmode="decimal" value=${l.quantidade} disabled=${somenteLeitura || !p} onInput=${(e) => mudarEmb(l.k, { quantidade: e.target.value })} /><span>por ${f.rendimento_unidade ? f.rendimento_unidade.replace(/s$/, '') : 'unidade'}</span></div>
      ${!somenteLeitura && html`<button class="btn-icone" title="Remover" onClick=${() => setEmbLinhas((x) => x.filter((y) => y.k !== l.k))}>✕</button>`}
      ${p && !p.peso_embalagem_g && ['kg', 'g'].includes(String(p.unidade_estoque).toLowerCase()) && html`<small class="larga texto-vermelho">Esta embalagem não tem peso médio no cadastro: o custo fica zerado.</small>`}
    </div>`; })}</div>
    ${!somenteLeitura && html`<button class="btn btn-sec btn-peq" onClick=${() => setEmbLinhas((x) => [...x, { k: Math.random(), produto_id: null, quantidade: '1' }])}>+ Embalagem</button>`}
    ${podeFazer('custos') && html`<p class="nota">Custo estimado de 1 receita: <b>${moeda(custo)}</b>${custoEmb > 0 ? html` + embalagem <b>${moeda(custoEmb)}</b> = <b>${moeda(custo + custoEmb)}</b>` : ''}.</p>`}
    ${ficha.id && html`<${UltimaAlteracao} reg=${ficha} /><${HistoricoFicha} fichaId=${ficha.id} />`}
  </${Modal}>`;
}

// Histórico legível das alterações da ficha (quem, quando e o que mudou)
function HistoricoFicha({ fichaId }) {
  const { dados, api } = useApp();
  const [h, setH] = useState(null);
  useEffect(() => { api.listar('fichas_historico', { eq: { ficha_id: fichaId }, ordem: ['id', 'desc'] }).then(setH).catch(() => setH([])); }, [fichaId]);
  return html`<div class="historico"><h3>Histórico de alterações da receita</h3>
    ${h === null ? html`<${Carregando} />` : h.length === 0 ? html`<p class="nota">Sem alterações registradas.</p>`
      : html`<ul class="linha-tempo">${h.map((x) => html`<li><div><b>${nomeUsuario(dados.mapa.perfil.get(x.usuario_id))}</b> <small>${dataHora(x.data_hora)}</small></div>
          <div class="quebra">${x.descricao}</div></li>`)}</ul>`}</div>`;
}
