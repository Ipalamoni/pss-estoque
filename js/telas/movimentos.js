// Movimentações (extrato do estoque) e correção de lançamentos
import { html, useState, useMemo, useEffect, useApp, Modal, Campo, Escolher, QtdUnidade, Etiqueta, Cabecalho, Tabela, Carregando, Cartao, useAcao, avisar, n } from '../ui.js';
import { TIPOS_MOV, MOTIVOS_INVENTARIO, qtd, moeda, data, dataHora, hojeISO, somarDias, fator, numeroPedido, mensagemErro, diaLocal, qu, plural, pl, nomeUsuario } from '../util.js';
import { Exportar } from '../exportar.js';
import { Icone } from '../icones.js';

const COR_TIPO = { implantacao: 'cinza', entrada: 'verde', saida_receita: 'azul', saida_avulsa: 'laranja', saida_almox: 'azul', inventario: 'roxo', correcao: 'vermelho' };
const inicioDia = (iso) => new Date(iso + 'T00:00:00').toISOString();

export function TelaMovimentos() {
  const { dados, usuario, podeFazer, api, estadoRota, setEstadoRota } = useApp();
  const [de, setDe] = useState(somarDias(hojeISO(), estadoRota?.produto ? -60 : -7));
  const [ate, setAte] = useState(hojeISO());
  const [prod, setProd] = useState(estadoRota?.produto || null);
  useEffect(() => { if (estadoRota) setEstadoRota(null); }, []);
  const [tipo, setTipo] = useState('');
  const [usu, setUsu] = useState('');
  const [movs, setMovs] = useState(null);
  const [aberto, setAberto] = useState(null);

  async function carregar() {
    setMovs(null);
    try { setMovs(await api.listar('movimentos', { desde: inicioDia(de), ate: inicioDia(somarDias(ate, 1)), ordem: ['id', 'desc'], eq: prod ? { produto_id: prod } : undefined })); }
    catch (e) { avisar(mensagemErro(e), 'erro'); setMovs([]); }
  }
  useEffect(() => { carregar(); }, [de, ate, prod, dados.carregadoEm]);

  const lista = useMemo(() => (movs || []).filter((m) => (!tipo || m.tipo === tipo) && (!usu || m.usuario_id === usu)), [movs, tipo, usu]);
  const corrigidos = useMemo(() => new Set((movs || []).filter((m) => m.corrige_id).map((m) => m.corrige_id)), [movs]);
  const p = (m) => dados.mapa.produto.get(m.produto_id);
  const ref = (m) => m.corrige_id ? `corrige #${m.corrige_id}` : m.pedido_item_id ? numeroPedido(dados.pedidoItens.find((i) => i.id === m.pedido_item_id)?.pedido_id || '')
    : m.recebimento_id ? 'sem pedido' : m.producao_id ? `produção ${m.producao_id}` : m.inventario_id ? `inventário ${m.inventario_id}` : '';
  const podeCorrigir = (m) => m.tipo !== 'correcao' && (['implantacao', 'inventario'].includes(m.tipo) ? (usuario.papeis || []).includes('admin')
    : podeFazer('corrigir') || (m.usuario_id === usuario.user_id && diaLocal(m.data_hora) === hojeISO()));

  const colExp = [
    { titulo: 'Nº', valor: (m) => m.id }, { titulo: 'Data/hora', valor: (m) => dataHora(m.data_hora) }, { titulo: 'Código', valor: (m) => p(m)?.codigo },
    { titulo: 'Produto', valor: (m) => p(m)?.descricao, largura: 35 }, { titulo: 'Tipo', valor: (m) => TIPOS_MOV[m.tipo] },
    { titulo: 'Entrada', valor: (m) => (m.quantidade > 0 ? Number(m.quantidade) : ''), num: true }, { titulo: 'Saída', valor: (m) => (m.quantidade < 0 ? -Number(m.quantidade) : ''), num: true },
    { titulo: 'Unid.', valor: (m) => p(m)?.unidade_estoque },
    { titulo: 'Custo unit.', valor: (m) => Number(m.custo_unitario), texto: (m) => moeda(m.custo_unitario), num: true }, { titulo: 'Valor', valor: (m) => Number(m.valor), texto: (m) => moeda(m.valor), num: true },
    { titulo: 'Saldo após', valor: (m) => Number(m.saldo_apos), num: true }, { titulo: 'Usuário', valor: (m) => dados.mapa.perfil.get(m.usuario_id)?.nome },
    { titulo: 'Referência', valor: ref }, { titulo: 'Destino', valor: (m) => m.destino }, { titulo: 'Motivo', valor: (m) => MOTIVOS_INVENTARIO[m.motivo] || m.motivo },
    { titulo: 'Observação', valor: (m) => m.observacao, largura: 45 }];
  // KARDEX: com um produto escolhido, mostra saldo inicial, entradas, saídas e saldo final do período
  const pr = prod ? dados.mapa.produto.get(prod) : null;
  const kardex = useMemo(() => {
    if (!pr || !movs || !movs.length) return null;
    const asc = [...movs].sort((a, b) => a.id - b.id);
    const ini = Number(asc[0].saldo_apos) - Number(asc[0].quantidade);
    const fim = Number(asc[asc.length - 1].saldo_apos);
    const ent = lista.filter((m) => m.quantidade > 0).reduce((s, m) => s + Number(m.quantidade), 0);
    const sai = lista.filter((m) => m.quantidade < 0).reduce((s, m) => s - Number(m.quantidade), 0);
    return { ini, fim, ent, sai };
  }, [movs, lista, prod]);
  const titulo = pr ? `Kardex · ${pr.codigo} ${pr.descricao}` : 'Movimentações do estoque';
  const filtrosTxt = `${data(de)} a ${data(ate)}${tipo ? ' · ' + TIPOS_MOV[tipo] : ''}${kardex ? ` · saldo inicial ${qu(kardex.ini, pr.unidade_estoque)} · saldo final ${qu(kardex.fim, pr.unidade_estoque)}` : ''}`;
  const linhasExp = [...lista].sort((a, b) => a.id - b.id);

  return html`
    <${Cabecalho} titulo="Movimentações (kardex)" sub="Extrato de tudo que entrou e saiu, com o saldo depois de cada lançamento. Escolha um produto para ver a ficha dele. Nenhuma linha é apagada: erro se corrige com nova linha.">
      ${movs && html`<${Exportar} titulo=${titulo} filtros=${filtrosTxt} arquivo=${`${pr ? 'kardex-' + pr.codigo : 'movimentacoes'}-${de}-a-${ate}`} colunas=${colExp} linhas=${linhasExp} />`}
    </${Cabecalho}>
    <div class="filtros">
      <label class="campo-inline">De <input class="entrada" type="date" value=${de} onChange=${(e) => setDe(e.target.value)} /></label>
      <label class="campo-inline">até <input class="entrada" type="date" value=${ate} onChange=${(e) => setAte(e.target.value)} /></label>
      <div class="filtro-escolher"><${Escolher} itens=${dados.produtos} valor=${prod} aoMudar=${setProd} rotuloDe=${(x) => `${x.codigo} · ${x.descricao}`} placeholder="Produto (todos)" /></div>
      ${prod && html`<button class="btn-link" onClick=${() => setProd(null)}>limpar</button>`}
      <select class="entrada" value=${tipo} onChange=${(e) => setTipo(e.target.value)}><option value="">Todos os tipos</option>
        ${Object.entries(TIPOS_MOV).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select>
      <select class="entrada" value=${usu} onChange=${(e) => setUsu(e.target.value)}><option value="">Todos os usuários</option>
        ${dados.perfis.map((u) => html`<option value=${u.user_id}>${u.nome}</option>`)}</select>
    </div>
    ${kardex && html`<div class="cartoes">
      <${Cartao} titulo="Saldo no início do período" valor=${qu(kardex.ini, pr.unidade_estoque)} />
      <${Cartao} titulo="Entradas" valor=${qu(kardex.ent, pr.unidade_estoque)} />
      <${Cartao} titulo="Saídas" valor=${qu(kardex.sai, pr.unidade_estoque)} />
      <${Cartao} titulo="Saldo no fim do período" valor=${qu(kardex.fim, pr.unidade_estoque)} sub=${`hoje: ${qu(pr.saldo, pr.unidade_estoque)}`} />
    </div>`}
    ${movs === null ? html`<${Carregando} />` : html`<${Tabela} linhas=${lista} max=${500} aoClicar=${setAberto} colunas=${[
      { chave: 'id', titulo: 'Nº', num: true, render: (m) => html`<small>#${m.id}</small>` },
      { chave: 'data_hora', titulo: 'Data/hora', render: (m) => dataHora(m.data_hora) },
      { chave: 'prod', titulo: 'Produto', valor: (m) => p(m)?.descricao, render: (m) => html`<b>${p(m)?.descricao}</b><br /><small>${p(m)?.codigo}</small>` },
      { chave: 'tipo', titulo: 'Tipo', render: (m) => html`<${Etiqueta} cor=${COR_TIPO[m.tipo]}>${TIPOS_MOV[m.tipo]}</${Etiqueta}>${corrigidos.has(m.id) && html` <${Etiqueta} cor="laranja">corrigido</${Etiqueta}>`}` },
      { chave: 'quantidade', titulo: 'Quantidade', num: true, render: (m) => html`<b class=${m.quantidade < 0 ? 'texto-vermelho' : 'texto-verde'}>${m.quantidade > 0 ? '+' : ''}${qtd(m.quantidade)}</b> ${p(m)?.unidade_estoque}` },
      { chave: 'valor', titulo: 'Valor', num: true, render: (m) => moeda(m.valor) },
      { chave: 'saldo_apos', titulo: 'Saldo após', num: true, render: (m) => qtd(m.saldo_apos) },
      { chave: 'u', titulo: 'Usuário', valor: (m) => dados.mapa.perfil.get(m.usuario_id)?.nome, render: (m) => nomeUsuario(dados.mapa.perfil.get(m.usuario_id)) },
      { chave: 'obs', titulo: 'Referência / observação', valor: (m) => m.observacao, render: (m) => html`<small>${[ref(m), m.destino, MOTIVOS_INVENTARIO[m.motivo] || m.motivo, m.observacao].filter(Boolean).join(' · ')}</small>` },
    ]} />`}
    ${aberto && html`<${DetalheMovimento} mov=${aberto} podeCorrigir=${podeCorrigir(aberto)} aoFechar=${(ok) => { setAberto(null); if (ok) carregar(); }} />`}`;
}

function DetalheMovimento({ mov, podeCorrigir, aoFechar }) {
  const { dados, api } = useApp();
  const [corr, setCorr] = useState(null);
  const [corrigir, setCorrigir] = useState(false);
  const [original, setOriginal] = useState(null);
  const p = dados.mapa.produto.get(mov.produto_id);
  useEffect(() => {
    api.listar('movimentos', { eq: { corrige_id: mov.id } }).then(setCorr).catch(() => setCorr([]));
    if (mov.corrige_id) api.listar('movimentos', { eq: { id: mov.corrige_id } }).then((l) => setOriginal(l[0])).catch(() => {});
  }, [mov.id]);
  if (corrigir) return html`<${CorrigirMovimento} mov=${mov} aoFechar=${(ok) => (ok ? aoFechar(true) : setCorrigir(false))} />`;
  const linha = (rot, val) => val !== null && val !== undefined && val !== '' && html`<div><small>${rot}</small><b>${val}</b></div>`;
  return html`<${Modal} titulo=${`Lançamento #${mov.id}`} aoFechar=${() => aoFechar(false)}
    rodape=${html`<button class="btn btn-sec" onClick=${() => aoFechar(false)}>Fechar</button>
      ${podeCorrigir && html`<button class="btn btn-pri" onClick=${() => setCorrigir(true)}>Corrigir este lançamento</button>`}`}>
    <div class="info-grade">
      ${linha('Produto', `${p?.codigo} · ${p?.descricao}`)}${linha('Tipo', TIPOS_MOV[mov.tipo])}${linha('Data/hora', dataHora(mov.data_hora))}
      ${linha('Quantidade', `${qu(mov.quantidade, p?.unidade_estoque)}`)}
      ${mov.qtd_informada !== null && mov.unidade_informada && mov.unidade_informada !== p?.unidade_estoque && linha('Digitado', `${qu(mov.qtd_informada, mov.unidade_informada)}`)}
      ${linha('Custo unitário', moeda(mov.custo_unitario))}${linha('Valor', moeda(mov.valor))}${linha('Saldo depois', `${qu(mov.saldo_apos, p?.unidade_estoque)}`)}
      ${linha('Usuário', nomeUsuario(dados.mapa.perfil.get(mov.usuario_id)))}${linha('Destino', mov.destino)}${linha('Motivo', MOTIVOS_INVENTARIO[mov.motivo] || mov.motivo)}
    </div>
    ${mov.observacao && html`<p class="nota"><b>Observação:</b> ${mov.observacao}</p>`}
    ${original && html`<p class="nota">Esta linha corrige o lançamento <b>#${original.id}</b> (${TIPOS_MOV[original.tipo]}, ${qu(original.quantidade, p?.unidade_estoque)}, ${dataHora(original.data_hora)}).</p>`}
    ${corr && corr.length > 0 && html`<h3>Correções deste lançamento</h3><ul class="lista-simples">${corr.map((c) => html`<li>#${c.id} · ${dataHora(c.data_hora)} · ${c.quantidade > 0 ? '+' : ''}${qu(c.quantidade, p?.unidade_estoque)}
      · ${dados.mapa.perfil.get(c.usuario_id)?.nome}<br /><small>${c.observacao} — Motivo: ${c.motivo}</small></li>`)}</ul>`}
  </${Modal}>`;
}

// Modal de correção (usado aqui e na tela de saídas)
export function CorrigirMovimento({ mov, aoFechar }) {
  const { dados, recarregar, api } = useApp();
  const p = dados.mapa.produto.get(mov.produto_id);
  const [corr, setCorr] = useState(null);
  const [q, setQ] = useState('');
  const [un, setUn] = useState(p?.unidade_estoque);
  const [motivo, setMotivo] = useState('');
  const [ocupado, executar] = useAcao();
  useEffect(() => { api.listar('movimentos', { eq: { corrige_id: mov.id } }).then(setCorr).catch(() => setCorr([])); }, [mov.id]);
  if (!corr) return html`<${Modal} titulo="Corrigir lançamento" aoFechar=${() => aoFechar(false)}><${Carregando} /></${Modal}>`;
  const efetiva = Number(mov.quantidade) + corr.reduce((s, c) => s + Number(c.quantidade), 0);
  const correta = n(q);
  const nova = correta === null ? null : Math.sign(mov.quantidade) * correta * fator(p, un);
  const delta = nova === null ? null : Math.round((nova - efetiva) * 10000) / 10000;

  async function salvar() {
    const ok = await executar(() => api.rpc('corrigir_movimento', { p_id: mov.id, p_quantidade_correta: correta, p_unidade: un, p_motivo: motivo }), 'Correção registrada.');
    if (ok) { await recarregar(); aoFechar(true); }
  }
  return html`<${Modal} titulo=${`Corrigir lançamento #${mov.id}`} aoFechar=${() => aoFechar(false)}
    rodape=${html`<button class="btn btn-sec" onClick=${() => aoFechar(false)}>Cancelar</button>
      <button class="btn btn-pri" disabled=${ocupado || delta === null || delta === 0 || !motivo.trim()} onClick=${salvar}>${ocupado ? 'Registrando…' : 'Registrar correção'}</button>`}>
    <p><b>${p?.descricao}</b> · ${TIPOS_MOV[mov.tipo]} · ${dataHora(mov.data_hora)}</p>
    <p>Quantidade lançada: <b>${qu(Math.abs(mov.quantidade), p?.unidade_estoque)}</b>${corr.length ? html` · valendo hoje (após correções): <b>${qu(Math.abs(efetiva), p?.unidade_estoque)}</b>` : ''}</p>
    <${Campo} rotulo="Qual era a quantidade correta?" obrigatorio ajuda="Digite zero se o lançamento não deveria ter existido.">
      <${QtdUnidade} produto=${p} valor=${q} unidade=${un} autoFocus aoMudar=${(v, u) => { setQ(v); setUn(u); }} /></${Campo}>
    <${Campo} rotulo="Motivo da correção" obrigatorio><input class="entrada" value=${motivo} onInput=${(e) => setMotivo(e.target.value)} placeholder="ex.: digitei 10 em vez de 6" /></${Campo}>
    ${delta !== null && delta !== 0 && html`<div class="alerta">Vai entrar uma linha de correção de <b>${delta > 0 ? '+' : ''}${qu(delta, p?.unidade_estoque)}</b> no estoque.
      O lançamento original continua no histórico, ligado a esta correção.</div>`}
    ${delta === 0 && html`<p class="nota">A quantidade informada é igual à atual: nada a corrigir.</p>`}
  </${Modal}>`;
}
