// Saídas: por receita (ficha técnica), avulsa de matéria-prima e do almoxarifado
import { html, useState, useMemo, useEffect, useApp, Campo, Numero, Escolher, QtdUnidade, Busca, Etiqueta, Cabecalho, Abas, Vazio, Tabela, useAcao, confirmar, avisar, n } from '../ui.js';
import { qtd, num, moeda, contem, fator, qtdDupla, hojeISO, dataHora, TIPOS_MOV, DESTINOS, mensagemErro, qu, plural, pl, nomeUsuario } from '../util.js';
import { CorrigirMovimento } from './movimentos.js';
import { useProducoes } from './producao.js';

const virg = (v) => String(Math.round(v * 10000) / 10000).replace('.', ',');

export function TelaSaidas() {
  const { podeFazer, estadoRota, setEstadoRota } = useApp();
  const abas = [podeFazer('saida_receita') && { id: 'receita', titulo: 'Por receita' }, podeFazer('saida_avulsa') && { id: 'avulsa', titulo: 'Avulsa (matéria-prima)' },
    podeFazer('saida_almox') && { id: 'almox', titulo: 'Almoxarifado (embalagens e outros)' }].filter(Boolean);
  const [aba, setAba] = useState(estadoRota?.aba && abas.some((a) => a.id === estadoRota.aba) ? estadoRota.aba : abas[0]?.id);
  const [fichaInicial] = useState(estadoRota?.ficha || null);
  const [versao, setVersao] = useState(0);
  useEffect(() => { if (estadoRota) setEstadoRota(null); }, []);
  const feito = () => setVersao((v) => v + 1);

  return html`
    <${Cabecalho} titulo="Saídas do estoque" sub="Tudo que sai fica registrado com usuário, data e hora" />
    <${Abas} abas=${abas} ativa=${aba} aoMudar=${setAba} />
    ${aba === 'receita' && html`<${SaidaReceita} fichaInicial=${fichaInicial} aoConcluir=${feito} />`}
    ${aba === 'avulsa' && html`<${SaidaAvulsa} aoConcluir=${feito} />`}
    ${aba === 'almox' && html`<${SaidaAlmox} aoConcluir=${feito} />`}
    <${LancamentosHoje} versao=${versao} />`;
}

// ------------------------------ POR RECEITA --------------------------
function SaidaReceita({ fichaInicial, aoConcluir }) {
  const { dados, recarregar, api } = useApp();
  const mp = dados.mapa.produto;
  const [busca, setBusca] = useState('');
  const [fichaId, setFichaId] = useState(fichaInicial);
  const [mult, setMult] = useState('1');
  const [alterar, setAlterar] = useState(false);
  const [linhas, setLinhas] = useState([]);
  const [obs, setObs] = useState('');
  const [ocupado, executar] = useAcao();
  const ficha = dados.mapa.ficha.get(fichaId);
  const originais = useMemo(() => dados.fichaItens.filter((i) => i.ficha_id === fichaId), [fichaId, dados]);
  const fichas = dados.fichas.filter((f) => f.ativo && contem(`${f.codigo} ${f.nome} ${f.produto_final}`, busca));
  const m = n(mult) || 0;
  // programação de hoje desta receita (para a saída contar como baixa)
  const hoje = hojeISO();
  const progsHoje = dados.programacoes.filter((p) => p.situacao === 'ativa' && !p.finalizada_em && p.data === hoje);
  const feitas = useProducoes(hoje, hoje, progsHoje.map((p) => p.id)) || [];
  const feitoDe = (id) => feitas.filter((x) => x.programacao_id === id).reduce((s, x) => s + Number(x.multiplicador), 0);
  const prog = progsHoje.find((p) => p.ficha_id === fichaId && feitoDe(p.id) < Number(p.quantidade) - 0.0005) || null;
  const [vincular, setVincular] = useState(true);
  const programadasHoje = new Map(); progsHoje.forEach((p) => programadasHoje.set(p.ficha_id, (programadasHoje.get(p.ficha_id) || 0) + Number(p.quantidade) - feitoDe(p.id)));
  useEffect(() => {
    if (prog && prog.itens_alterados && vincular) {
      setAlterar(true);
      setLinhas(prog.itens_alterados.map((i) => ({ k: Math.random(), produto_id: i.produto_id, quantidade: virg(i.quantidade), unidade: i.unidade })));
    }
  }, [prog?.id, vincular, fichaId]);

  function escolher(id) {
    setFichaId(id); setAlterar(false); setObs(''); setMult('1');
    setLinhas(dados.fichaItens.filter((i) => i.ficha_id === id).map((i) => ({ k: Math.random(), produto_id: i.produto_id, quantidade: virg(i.quantidade), unidade: mp.get(i.produto_id)?.unidade_estoque })));
  }
  useEffect(() => { if (fichaInicial) escolher(fichaInicial); }, []);
  const mudar = (k, ch) => setLinhas((l) => l.map((x) => (x.k === k ? { ...x, ...ch } : x)));

  // itens efetivos por 1 receita (na unidade de estoque)
  const efetivos = alterar
    ? linhas.filter((l) => l.produto_id && n(l.quantidade) > 0).map((l) => ({ produto_id: l.produto_id, base: n(l.quantidade) * fator(mp.get(l.produto_id), l.unidade) }))
    : originais.map((i) => ({ produto_id: i.produto_id, base: Number(i.quantidade) }));
  const mudancas = useMemo(() => {
    if (!alterar) return [];
    const orig = new Map(originais.map((i) => [i.produto_id, Number(i.quantidade)]));
    const novo = new Map(); efetivos.forEach((e) => novo.set(e.produto_id, (novo.get(e.produto_id) || 0) + e.base));
    const out = [];
    for (const [id, q] of orig) {
      const p = mp.get(id);
      if (!novo.has(id)) out.push(`retirou ${p?.descricao}`);
      else if (Math.abs(novo.get(id) - q) > 0.00005) out.push(`${p?.descricao}: ${qtd(q)} → ${qu(novo.get(id), p?.unidade_estoque)}`);
    }
    for (const [id, q] of novo) if (!orig.has(id)) out.push(`incluiu ${mp.get(id)?.descricao} (${qu(q, mp.get(id)?.unidade_estoque)})`);
    return out;
  }, [alterar, linhas, originais]);

  async function registrar() {
    if (!(m > 0)) return avisar('Informe quantas receitas foram feitas.', 'erro');
    if (alterar && mudancas.length === 0) return avisar('Você abriu a alteração mas não mudou nada. Desmarque “Alterar receita” ou faça a alteração.', 'aviso');
    const obsFinal = alterar ? `Receita alterada: ${mudancas.join('; ')}.${obs ? ' ' + obs : ''}` : obs;
    const ok = await confirmar({ titulo: 'Confirmar saída por receita', ok: 'Dar saída', mensagem: html`
      <p><b>${num(m, 3)}× ${ficha.nome}</b>${alterar ? html` <${Etiqueta} cor="laranja">alterada</${Etiqueta}>` : ''}</p>
      <ul class="lista-simples">${efetivos.map((e) => { const p = mp.get(e.produto_id); return html`<li><b>${qu(e.base * m, p?.unidade_estoque)}</b> ${p?.descricao}</li>`; })}</ul>
      ${alterar && html`<p class="nota">${obsFinal}</p>`}` });
    if (!ok) return;
    const r = await executar(() => api.rpc('registrar_producao', { p: { ficha_id: fichaId, multiplicador: m, alterada: alterar, observacao: obsFinal,
      programacao_id: prog && vincular ? prog.id : null,
      itens: alterar ? linhas.filter((l) => l.produto_id && n(l.quantidade) > 0).map((l) => ({ produto_id: l.produto_id, quantidade: n(l.quantidade), unidade: l.unidade })) : [] } }),
      `Saída registrada: ${num(m, 3)}× ${ficha.nome}.`);
    if (r) { await recarregar(); escolher(fichaId); aoConcluir(); }
  }

  if (!ficha) return html`<div class="filtros"><${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Buscar receita" /></div>
    ${fichas.length === 0 ? html`<${Vazio} texto="Nenhuma ficha técnica ativa. Cadastre em Cadastros › Fichas técnicas." />`
      : html`<div class="grade-fichas">${fichas.map((f) => html`<button class="ficha-botao" onClick=${() => escolher(f.id)}>
          <small>${f.codigo}</small><b>${f.nome}</b><small>${f.produto_final || ''}</small>
          ${programadasHoje.get(f.id) > 0.0005 && html`<${Etiqueta} cor="verde">hoje: faltam ${num(programadasHoje.get(f.id), 3)}</${Etiqueta}>`}</button>`)}</div>`}`;

  return html`<section class="painel">
    <div class="ficha-topo">
      <div><small>Receita</small><h2>${ficha.nome}</h2>${ficha.rendimento && html`<small>Rendimento por receita: ${ficha.rendimento}</small>`}</div>
      <button class="btn btn-sec" onClick=${() => setFichaId(null)}>Trocar receita</button>
    </div>
    ${prog && html`<label class="check destaque programada"><input type="checkbox" checked=${vincular} onChange=${(e) => setVincular(e.target.checked)} />
      Contar como baixa da <b>programação de hoje</b>: programado ${num(prog.quantidade, 3)}, feito ${num(feitoDe(prog.id), 3)}, falta ${num(Number(prog.quantidade) - feitoDe(prog.id), 3)}
      ${prog.itens_alterados ? html` · <b>com a receita alterada pela engenharia</b>` : ''}${prog.observacao ? html`<br /><small>${prog.observacao}</small>` : ''}</label>`}
    <div class="multiplicador">
      <span>Quantas receitas?</span>
      <div class="mult-controles">
        <button class="btn btn-sec btn-quadrado" onClick=${() => setMult(virg(Math.max((n(mult) || 0) - 1, 0)))}>−</button>
        <${Numero} valor=${mult} aoMudar=${setMult} classe="mult" />
        <button class="btn btn-sec btn-quadrado" onClick=${() => setMult(virg((n(mult) || 0) + 1))}>+</button>
      </div>
    </div>
    <label class="check destaque"><input type="checkbox" checked=${alterar} onChange=${(e) => setAlterar(e.target.checked)} />
      Alterar a receita <b>só para esta produção</b> (substituição de matéria-prima, outra farinha, outro melhorador…)</label>
    ${!alterar ? html`<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Ingrediente</th><th class="n">Por receita</th><th class="n">Total (× ${num(m, 3)})</th><th class="n">Saldo atual</th></tr></thead>
      <tbody>${efetivos.map((e) => { const p = dados.mapa.ind.get(e.produto_id); const total = e.base * m; const falta = p && total > p.saldo;
        return html`<tr><td data-rotulo="Ingrediente"><b>${p?.descricao}</b></td><td class="n" data-rotulo="Por receita">${qu(e.base, p?.unidade_estoque)}</td>
          <td class="n" data-rotulo="Total"><b>${qu(total, p?.unidade_estoque)}</b></td>
          <td class=${'n' + (falta ? ' texto-vermelho' : '')} data-rotulo="Saldo atual">${qu(p?.saldo, p?.unidade_estoque)}${falta ? ' ⚠' : ''}</td></tr>`; })}</tbody></table></div>`
    : html`<p class="nota">Edite os ingredientes desta produção (quantidade <b>por receita</b>). A ficha técnica original não muda.</p>
      <div class="linhas-itens">${linhas.map((l) => { const p = mp.get(l.produto_id); return html`<div class="linha-item" key=${l.k}>
        <${Escolher} itens=${dados.produtos.filter((x) => x.ativo && x.categoria === 'materia_prima')} valor=${l.produto_id} rotuloDe=${(x) => `${x.codigo} · ${x.descricao}`}
          detalheDe=${(x) => [x.grupo, x.classificacao && `classificação ${x.classificacao}`, x.marca, `saldo ${qu(dados.mapa.ind.get(x.id)?.saldo || 0, x.unidade_estoque)}`].filter(Boolean).join(' · ')}
          aoMudar=${(id, pr) => mudar(l.k, { produto_id: id, unidade: pr.unidade_estoque })} />
        <${QtdUnidade} produto=${p} valor=${l.quantidade} unidade=${l.unidade} desabilitado=${!p} aoMudar=${(v, u) => mudar(l.k, { quantidade: v, unidade: u })} />
        <button class="btn-icone" title="Retirar" onClick=${() => setLinhas((x) => x.filter((y) => y.k !== l.k))}>✕</button></div>`; })}</div>
      <button class="btn btn-sec" onClick=${() => setLinhas((x) => [...x, { k: Math.random(), produto_id: null, quantidade: '', unidade: null }])}>+ Ingrediente</button>
      ${mudancas.length > 0 && html`<div class="alerta"><b>Alterações nesta produção:</b> ${mudancas.join('; ')}.</div>`}`}
    <${Campo} rotulo=${alterar ? 'Motivo da alteração / observação' : 'Observação (opcional)'}>
      <input class="entrada" value=${obs} placeholder=${alterar ? 'ex.: faltou farinha especial no turno' : ''} onInput=${(e) => setObs(e.target.value)} /></${Campo}>
    <div class="barra-acao"><button class="btn btn-pri btn-grande" disabled=${ocupado || !(m > 0)} onClick=${registrar}>${ocupado ? 'Registrando…' : `Dar saída de ${qu(m, 'receita')}`}</button></div>
  </section>`;
}

// ------------------------------ AVULSA -------------------------------
const MOTIVOS_RAPIDOS = ['Massa caiu / perdeu', 'Teste de receita', 'Reprocesso', 'Ajuste de massa', 'Amostra'];
function SaidaAvulsa({ aoConcluir }) {
  const { dados, recarregar, api } = useApp();
  const [prodId, setProdId] = useState(null);
  const [q, setQ] = useState('');
  const [un, setUn] = useState(null);
  const [obs, setObs] = useState('');
  const [ocupado, executar] = useAcao();
  const p = dados.mapa.ind.get(prodId);
  async function registrar() {
    if (!prodId || !(n(q) > 0)) return avisar('Escolha a matéria-prima e a quantidade.', 'erro');
    if (!obs.trim()) return avisar('Escreva a justificativa da saída avulsa.', 'erro');
    const r = await executar(() => api.rpc('registrar_saida', { p: { tipo: 'saida_avulsa', observacao: obs, itens: [{ produto_id: prodId, quantidade: n(q), unidade: un }] } }), 'Saída avulsa registrada.');
    if (r) { await recarregar(); setQ(''); setObs(''); setProdId(null); aoConcluir(); }
  }
  return html`<section class="painel">
    <p class="nota">Use para saída de uma matéria-prima fora da receita (ex.: massa que caiu). A justificativa é obrigatória.</p>
    <div class="grade">
      <${Campo} rotulo="Matéria-prima" obrigatorio classe="larga"><${Escolher} itens=${dados.produtos.filter((x) => x.ativo && x.categoria === 'materia_prima')} valor=${prodId}
        rotuloDe=${(x) => `${x.codigo} · ${x.descricao}`} aoMudar=${(id, pr) => { setProdId(id); setUn(pr.unidade_estoque); }} /></${Campo}>
      <${Campo} rotulo="Quantidade" obrigatorio ajuda=${p ? `Saldo: ${qtdDupla(p, p.saldo)}` : ''}><${QtdUnidade} produto=${p} valor=${q} unidade=${un} desabilitado=${!p} aoMudar=${(v, u) => { setQ(v); setUn(u); }} /></${Campo}>
      <${Campo} rotulo="Justificativa" obrigatorio classe="larga">
        <div class="chips">${MOTIVOS_RAPIDOS.map((t) => html`<button type="button" class=${'chip' + (obs === t ? ' ativo' : '')} onClick=${() => setObs(t)}>${t}</button>`)}</div>
        <input class="entrada" value=${obs} onInput=${(e) => setObs(e.target.value)} placeholder="Descreva o motivo" /></${Campo}>
    </div>
    <div class="barra-acao"><button class="btn btn-pri btn-grande" disabled=${ocupado} onClick=${registrar}>${ocupado ? 'Registrando…' : 'Dar saída avulsa'}</button></div>
  </section>`;
}

// ------------------------------ ALMOXARIFADO -------------------------
function SaidaAlmox({ aoConcluir }) {
  const { dados, recarregar, api } = useApp();
  const [destino, setDestino] = useState(DESTINOS[1]);
  const [obs, setObs] = useState('');
  const [linhas, setLinhas] = useState([{ k: 1, produto_id: null, quantidade: '', unidade: null }]);
  const [ocupado, executar] = useAcao();
  const mudar = (k, ch) => setLinhas((l) => l.map((x) => (x.k === k ? { ...x, ...ch } : x)));
  async function registrar() {
    const its = linhas.filter((l) => l.produto_id && n(l.quantidade) > 0);
    if (!its.length) return avisar('Escolha pelo menos 1 item e a quantidade.', 'erro');
    const r = await executar(() => api.rpc('registrar_saida', { p: { tipo: 'saida_almox', destino, observacao: obs,
      itens: its.map((l) => ({ produto_id: l.produto_id, quantidade: n(l.quantidade), unidade: l.unidade })) } }), `Saída registrada (${pl(its.length, 'item', 'itens')}).`);
    if (r) { await recarregar(); setLinhas([{ k: Math.random(), produto_id: null, quantidade: '', unidade: null }]); setObs(''); aoConcluir(); }
  }
  return html`<section class="painel">
    <p class="nota">Embalagens (bobinas inteiras), material de escritório, limpeza e outros. A quantidade já vem na unidade de compra (ex.: bobina).</p>
    <div class="grade">
      <${Campo} rotulo="Destino"><select class="entrada" value=${destino} onChange=${(e) => setDestino(e.target.value)}>${DESTINOS.map((d) => html`<option>${d}</option>`)}</select></${Campo}>
      <${Campo} rotulo="Observação"><input class="entrada" value=${obs} onInput=${(e) => setObs(e.target.value)} /></${Campo}>
    </div>
    <div class="linhas-itens">${linhas.map((l) => { const p = dados.mapa.ind.get(l.produto_id); return html`<div class="linha-item linha-pedido" key=${l.k}>
      <div class="li-prod"><${Escolher} itens=${dados.produtos.filter((x) => x.ativo)} valor=${l.produto_id} rotuloDe=${(x) => `${x.codigo} · ${x.descricao}`}
        aoMudar=${(id, pr) => mudar(l.k, { produto_id: id, unidade: pr.unidade_compra || pr.unidade_estoque })} placeholder="Produto…" />
        ${p && html`<small class="dica">Saldo: ${qtdDupla(p, p.saldo)}</small>`}</div>
      <${QtdUnidade} produto=${p} valor=${l.quantidade} unidade=${l.unidade} desabilitado=${!p} aoMudar=${(v, u) => mudar(l.k, { quantidade: v, unidade: u })} />
      <button class="btn-icone" onClick=${() => setLinhas((x) => x.filter((y) => y.k !== l.k))}>✕</button></div>`; })}</div>
    <button class="btn btn-sec" onClick=${() => setLinhas((x) => [...x, { k: Math.random(), produto_id: null, quantidade: '', unidade: null }])}>+ Item</button>
    <div class="barra-acao"><button class="btn btn-pri btn-grande" disabled=${ocupado} onClick=${registrar}>${ocupado ? 'Registrando…' : 'Dar saída'}</button></div>
  </section>`;
}

// ------------------------------ LANÇAMENTOS DE HOJE ------------------
function LancamentosHoje({ versao }) {
  const { dados, usuario, podeFazer, api } = useApp();
  const [movs, setMovs] = useState(null);
  const [todos, setTodos] = useState(false);
  const [corrigindo, setCorrigindo] = useState(null);
  const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
  async function carregar() {
    try { setMovs(await api.listar('movimentos', { desde: inicio.toISOString(), ordem: ['id', 'desc'] })); }
    catch (e) { avisar(mensagemErro(e), 'erro'); setMovs([]); }
  }
  useEffect(() => { carregar(); }, [versao, dados.carregadoEm]);
  if (!movs) return null;
  const tipos = new Set(['saida_receita', 'saida_avulsa', 'saida_almox', 'correcao']);
  const lista = movs.filter((m) => tipos.has(m.tipo) && (todos || m.usuario_id === usuario.user_id));
  const corrigidos = new Set(movs.filter((m) => m.corrige_id).map((m) => m.corrige_id));
  return html`<section class="painel">
    <div class="painel-topo"><h2>Lançamentos de hoje</h2>
      ${podeFazer('corrigir') && html`<label class="check"><input type="checkbox" checked=${todos} onChange=${(e) => setTodos(e.target.checked)} /> de todos os usuários</label>`}</div>
    <p class="nota">Lançou errado? Toque em <b>Corrigir</b>: o lançamento original continua no histórico e entra uma linha de correção.</p>
    <${Tabela} linhas=${lista} vazio="Nenhuma saída sua hoje." colunas=${[
      { chave: 'data_hora', titulo: 'Hora', render: (m) => dataHora(m.data_hora).slice(9) },
      { chave: 'tipo', titulo: 'Tipo', render: (m) => html`${TIPOS_MOV[m.tipo]}${corrigidos.has(m.id) && html` <${Etiqueta} cor="laranja">corrigido</${Etiqueta}>`}` },
      { chave: 'p', titulo: 'Produto', valor: (m) => dados.mapa.produto.get(m.produto_id)?.descricao, render: (m) => dados.mapa.produto.get(m.produto_id)?.descricao },
      { chave: 'quantidade', titulo: 'Quantidade', num: true, render: (m) => html`<span class=${m.quantidade < 0 ? 'texto-vermelho' : 'texto-verde'}>${m.quantidade > 0 ? '+' : ''}${qu(m.quantidade, dados.mapa.produto.get(m.produto_id)?.unidade_estoque)}</span>` },
      { chave: 'u', titulo: 'Usuário', render: (m) => nomeUsuario(dados.mapa.perfil.get(m.usuario_id)) },
      { chave: 'acao', titulo: '', ordenar: false, render: (m) => m.tipo !== 'correcao' && (podeFazer('corrigir') || m.usuario_id === usuario.user_id)
        ? html`<button class="btn btn-sec btn-peq" onClick=${(e) => { e.stopPropagation(); setCorrigindo(m); }}>Corrigir</button>` : '' },
    ]} />
    ${corrigindo && html`<${CorrigirMovimento} mov=${corrigindo} movs=${movs} aoFechar=${(ok) => { setCorrigindo(null); if (ok) carregar(); }} />`}
  </section>`;
}
