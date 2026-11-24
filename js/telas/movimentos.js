// Movimentações (extrato do estoque) e correção de lançamentos
import { html, useState, useMemo, useEffect, useApp, Modal, Campo, Escolher, QtdUnidade, Etiqueta, Cabecalho, Tabela, Carregando, Cartao, useAcao, avisar, n, Filtros, useFiltroMudou, MultiEscolha, casaVarios } from '../ui.js';
import { veValores, TIPOS_MOV, ETAPAS_TRANSF, MOTIVOS_INVENTARIO, qtd, moeda, data, dataHora, hojeISO, somarDias, fator, numeroPedido, mensagemErro, diaLocal, qu, plural, pl, nomeUsuario } from '../util.js';
import { Exportar } from '../exportar.js';
import { Icone } from '../icones.js';
import { nomeLocal } from '../producao-util.js';

const COR_TIPO = { implantacao: 'cinza', entrada: 'verde', saida_receita: 'azul', saida_avulsa: 'laranja', saida_almox: 'azul', inventario: 'roxo', correcao: 'vermelho',
  transferencia: 'cinza', consumo: 'azul', entrada_producao: 'verde', perda: 'vermelho', entrada_manual: 'verde' };
const ehTransf = (m) => m.tipo === 'transferencia';
const qLocal = (m) => Number(m.qtd_local ?? m.quantidade);
const inicioDia = (iso) => new Date(iso + 'T00:00:00').toISOString();

export function TelaMovimentos() {
  const { dados, usuario, podeFazer, api, estadoRota, setEstadoRota, papeis } = useApp();
  const vv = veValores(papeis);   // pesagem/padeiro: sem custo nem valor
  const [de, setDe] = useState(somarDias(hojeISO(), estadoRota?.produto ? -60 : -7));
  const [ate, setAte] = useState(hojeISO());
  const [prod, setProd] = useState(estadoRota?.produto || null);
  useEffect(() => { if (estadoRota) setEstadoRota(null); }, []);
  const [tipo, setTipo] = useState([]);   // vários (vazio = todos)
  const [usu, setUsu] = useState([]);
  const [loc, setLoc] = useState(estadoRota?.local || '');
  const [semTransf, setSemTransf] = useState(false);
  const [movs, setMovs] = useState(null);
  const [aberto, setAberto] = useState(null);

  const mudou = useFiltroMudou([de, ate, prod, loc]);
  async function carregar() {
    if (mudou()) setMovs(null);
    try { setMovs(await api.listar('movimentos', { desde: inicioDia(de), ate: inicioDia(somarDias(ate, 1)), ordem: ['id', 'desc'], eq: prod || loc ? { ...(prod ? { produto_id: prod } : {}), ...(loc ? { local_id: Number(loc) } : {}) } : undefined })); }
    catch (e) { avisar(mensagemErro(e), 'erro'); setMovs([]); }
  }
  useEffect(() => { carregar(); }, [de, ate, prod, loc, dados.carregadoEm]);

  const lista = useMemo(() => (movs || []).filter((m) => casaVarios(tipo, m.tipo) && casaVarios(usu, m.usuario_id) && !(semTransf && ehTransf(m))), [movs, tipo, usu, semTransf]);
  const corrigidos = useMemo(() => new Set((movs || []).filter((m) => m.corrige_id).map((m) => m.corrige_id)), [movs]);
  const p = (m) => dados.mapa.produto.get(m.produto_id);
  const ref = (m) => m.transferencia_id ? `transferência nº ${m.transferencia_id}${m.etapa ? ' · ' + (ETAPAS_TRANSF[m.etapa] || m.etapa) : ''}`
    : m.batelada_id ? `batelada nº ${m.batelada_id}` : m.requisicao_id ? `requisição nº ${m.requisicao_id}` : m.corrige_id ? `corrige #${m.corrige_id}` : m.pedido_item_id ? numeroPedido(dados.pedidoItens.find((i) => i.id === m.pedido_item_id)?.pedido_id || '')
    : m.recebimento_id ? 'sem pedido' : m.producao_id ? `produção ${m.producao_id}` : m.inventario_id ? `inventário ${m.inventario_id}` : '';
  const podeCorrigir = (m) => !['correcao', 'transferencia', 'entrada_producao'].includes(m.tipo) && !m.batelada_id && (['implantacao', 'inventario'].includes(m.tipo) ? (usuario.papeis || []).includes('admin')
    : podeFazer('corrigir') || m.usuario_id === usuario.user_id);   // fora do prazo o botão abre o aviso (a regra vale no banco)

  const colExp = [
    { titulo: 'Nº', valor: (m) => m.id }, { titulo: 'Data/hora', valor: (m) => dataHora(m.data_hora) }, { titulo: 'Código', valor: (m) => p(m)?.codigo },
    { titulo: 'Produto', valor: (m) => p(m)?.descricao, largura: 35 }, { titulo: 'Tipo', valor: (m) => TIPOS_MOV[m.tipo] },
    { titulo: 'Entrada', valor: (m) => (m.quantidade > 0 ? Number(m.quantidade) : ''), num: true }, { titulo: 'Saída', valor: (m) => (m.quantidade < 0 ? -Number(m.quantidade) : ''), num: true },
    { titulo: 'Unid.', valor: (m) => p(m)?.unidade_estoque },
    { titulo: 'Local', valor: (m) => (m.local_id ? nomeLocal(dados, m.local_id) : '') }, { titulo: 'No local', valor: (m) => (m.local_id ? qLocal(m) : ''), num: true },
    { titulo: 'Saldo no local', valor: (m) => (m.saldo_local_apos != null ? Number(m.saldo_local_apos) : ''), num: true },
    { titulo: 'Padeiro', valor: (m) => dados.mapa.operador.get(m.operador_id)?.nome || '' },
    ...(vv ? [{ titulo: 'Custo unit.', valor: (m) => Number(m.custo_unitario), texto: (m) => moeda(m.custo_unitario), num: true }, { titulo: 'Valor', valor: (m) => Number(m.valor), texto: (m) => moeda(m.valor), num: true }] : []),
    { titulo: 'Saldo após', valor: (m) => Number(m.saldo_apos), num: true }, { titulo: 'Usuário', valor: (m) => dados.mapa.perfil.get(m.usuario_id)?.nome },
    { titulo: 'Referência', valor: ref }, { titulo: 'Destino', valor: (m) => m.destino }, { titulo: 'Motivo', valor: (m) => MOTIVOS_INVENTARIO[m.motivo] || m.motivo },
    { titulo: 'Observação', valor: (m) => m.observacao, largura: 45 }];
  // KARDEX: com um produto escolhido, mostra saldo inicial, entradas, saídas e saldo final do período
  const pr = prod ? dados.mapa.produto.get(prod) : null;
  const kardex = useMemo(() => {
    if (!pr || !movs || !movs.length) return null;
    const asc = [...movs].sort((a, b) => a.id - b.id);
    if (loc) {   // kardex do produto NO LOCAL (inclui transferências)
      const comS = asc.filter((m) => m.saldo_local_apos != null);
      if (!comS.length) return null;
      const ini = Number(comS[0].saldo_local_apos) - qLocal(comS[0]);
      const fim = Number(comS[comS.length - 1].saldo_local_apos);
      const ent = lista.filter((m) => qLocal(m) > 0).reduce((s, m) => s + qLocal(m), 0);
      const sai = lista.filter((m) => qLocal(m) < 0).reduce((s, m) => s - qLocal(m), 0);
      return { ini, fim, ent, sai, local: true };
    }
    const ini = Number(asc[0].saldo_apos) - Number(asc[0].quantidade);
    const fim = Number(asc[asc.length - 1].saldo_apos);
    const ent = lista.filter((m) => m.quantidade > 0).reduce((s, m) => s + Number(m.quantidade), 0);
    const sai = lista.filter((m) => m.quantidade < 0).reduce((s, m) => s - Number(m.quantidade), 0);
    return { ini, fim, ent, sai };
  }, [movs, lista, prod, loc]);
  const titulo = (pr ? `Kardex · ${pr.codigo} ${pr.descricao}` : 'Movimentações do estoque') + (loc ? ` · ${nomeLocal(dados, Number(loc))}` : '');
  const filtrosTxt = `${data(de)} a ${data(ate)}${tipo.length ? ' · ' + tipo.map((t) => TIPOS_MOV[t] || t).join(', ') : ''}${kardex ? ` · saldo inicial ${qu(kardex.ini, pr.unidade_estoque)} · saldo final ${qu(kardex.fim, pr.unidade_estoque)}` : ''}`;
  const linhasExp = [...lista].sort((a, b) => a.id - b.id);

  return html`
    <${Cabecalho} titulo="Movimentações (kardex)" sub="Extrato de tudo que entrou e saiu, com o saldo depois de cada lançamento. Escolha um produto para ver a ficha dele. Nenhuma linha é apagada: erro se corrige com nova linha." />
    <${Filtros} ativos=${[tipo.length, usu.length, loc, semTransf].filter(Boolean).length}
      acoes=${movs && html`<span class="nota">${lista.length} lançamento${lista.length === 1 ? '' : 's'}</span>
        <${Exportar} tabela="movimentos.telamovimentos" titulo=${titulo} filtros=${filtrosTxt} arquivo=${`${pr ? 'kardex-' + pr.codigo : 'movimentacoes'}-${de}-a-${ate}`} colunas=${colExp} linhas=${linhasExp} />`}
      fixo=${html`<div class="filtro-escolher"><${Escolher} itens=${dados.produtos} valor=${prod} aoMudar=${setProd} rotuloDe=${(x) => `${x.codigo} · ${x.descricao}`} placeholder="Produto (todos)" /></div>
      ${prod && html`<button class="btn-link" onClick=${() => setProd(null)}>limpar</button>`}`}>
      <label class="campo-inline">De <input class="entrada" type="date" value=${de} onChange=${(e) => setDe(e.target.value)} /></label>
      <label class="campo-inline">até <input class="entrada" type="date" value=${ate} onChange=${(e) => setAte(e.target.value)} /></label>
      <${MultiEscolha} todos="Todos os tipos" rotulo="Tipos de lançamento" valor=${tipo} aoMudar=${setTipo}
        opcoes=${Object.entries(TIPOS_MOV).map(([k, v]) => ({ valor: k, rotulo: v }))} />
      <${MultiEscolha} todos="Todos os usuários" rotulo="Usuários" valor=${usu} aoMudar=${setUsu}
        opcoes=${dados.perfis.map((u) => ({ valor: u.user_id, rotulo: u.nome }))} />
      ${dados.locais.length > 1 && html`<select class="entrada" aria-label="Local (um só: o saldo é do local escolhido)" value=${loc} onChange=${(e) => setLoc(e.target.value)}><option value="">Empresa toda (todos os locais)</option>
        ${dados.locais.map((l) => html`<option value=${l.id}>${nomeLocal(dados, l.id)}</option>`)}</select>`}
      <label class="check"><input type="checkbox" checked=${semTransf} onChange=${(e) => setSemTransf(e.target.checked)} /> Esconder transferências</label>
    </${Filtros}>
    ${kardex && html`<div class="cartoes">
      <${Cartao} titulo=${kardex.local ? 'No local, no início' : 'Saldo no início do período'} valor=${qu(kardex.ini, pr.unidade_estoque)} />
      <${Cartao} titulo="Entradas" valor=${qu(kardex.ent, pr.unidade_estoque)} />
      <${Cartao} titulo="Saídas" valor=${qu(kardex.sai, pr.unidade_estoque)} />
      <${Cartao} titulo=${kardex.local ? 'No local, no fim' : 'Saldo no fim do período'} valor=${qu(kardex.fim, pr.unidade_estoque)} sub=${kardex.local ? '' : `hoje: ${qu(pr.saldo, pr.unidade_estoque)} (inclui em trânsito)`} />
    </div>`}
    ${movs === null ? html`<${Carregando} />` : html`<${Tabela} id="movimentos.telamovimentos" linhas=${lista} max=${500} aoClicar=${setAberto} colunas=${[
      { chave: 'id', titulo: 'Nº', num: true, render: (m) => html`<small>#${m.id}</small>` },
      { chave: 'data_hora', titulo: 'Data/hora', render: (m) => dataHora(m.data_hora) },
      { chave: 'cod', titulo: 'Código', valor: (m) => p(m)?.codigo, render: (m) => p(m)?.codigo }, { chave: 'prod', titulo: 'Produto', valor: (m) => p(m)?.descricao, render: (m) => html`<b>${p(m)?.descricao}</b>` },
      { chave: 'tipo', titulo: 'Tipo', render: (m) => html`<${Etiqueta} cor=${COR_TIPO[m.tipo]}>${TIPOS_MOV[m.tipo]}</${Etiqueta}>${corrigidos.has(m.id) && html` <${Etiqueta} cor="laranja">corrigido</${Etiqueta}>`}` },
      { chave: 'quantidade', titulo: 'Quantidade', num: true, valor: (m) => (loc ? qLocal(m) : Number(m.quantidade)), render: (m) => { const q = loc || ehTransf(m) ? qLocal(m) : Number(m.quantidade);
        return html`<b class=${ehTransf(m) ? 'texto-azul' : q < 0 ? 'texto-vermelho' : 'texto-verde'}>${q > 0 ? '+' : ''}${qtd(q)}</b> ${p(m)?.unidade_estoque}${ehTransf(m) && !loc ? html` <small class="texto-cinza">(no local)</small>` : ''}`; } },
      { chave: 'local', titulo: 'Local', valor: (m) => nomeLocal(dados, m.local_id), render: (m) => (m.local_id ? html`${nomeLocal(dados, m.local_id)}` : '–') }, { chave: 'etapa', titulo: 'Etapa', render: (m) => (m.etapa ? html`${ETAPAS_TRANSF[m.etapa] || m.etapa}` : '–') },
      vv && { chave: 'valor', titulo: 'Valor', num: true, render: (m) => (ehTransf(m) ? html`<span class="texto-cinza">–</span>` : moeda(m.valor)) },
      { chave: 'saldo_apos', titulo: loc ? 'Saldo no local' : 'Saldo após', num: true, render: (m) => (loc ? (m.saldo_local_apos != null ? qtd(m.saldo_local_apos) : '–') : qtd(m.saldo_apos)) },
      { chave: 'u', titulo: 'Usuário', valor: (m) => dados.mapa.perfil.get(m.usuario_id)?.nome, render: (m) => html`${nomeUsuario(dados.mapa.perfil.get(m.usuario_id))}` }, { chave: 'padeiro', titulo: 'Padeiro', valor: (m) => dados.mapa.operador.get(m.operador_id)?.nome || '', render: (m) => (m.operador_id ? dados.mapa.operador.get(m.operador_id)?.nome : '–') },
      { chave: 'obs', titulo: 'Referência / observação', valor: (m) => m.observacao, render: (m) => html`<small>${[ref(m), m.destino, MOTIVOS_INVENTARIO[m.motivo] || m.motivo, m.observacao].filter(Boolean).join(' · ')}</small>` },
    ]} />`}
    ${aberto && html`<${DetalheMovimento} mov=${aberto} podeCorrigir=${podeCorrigir(aberto)} aoFechar=${(ok) => { setAberto(null); if (ok) carregar(); }} />`}`;
}

function DetalheMovimento({ mov, podeCorrigir, aoFechar }) {
  const { dados, api, papeis } = useApp();
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
      ${veValores(papeis) && html`${linha('Custo unitário', moeda(mov.custo_unitario))}${linha('Valor', moeda(mov.valor))}`}${linha('Saldo depois', `${qu(mov.saldo_apos, p?.unidade_estoque)}`)}
      ${linha('Local', mov.local_id ? nomeLocal(dados, mov.local_id) : '')}${linha('Etapa', mov.etapa ? ETAPAS_TRANSF[mov.etapa] || mov.etapa : '')}
      ${linha('No local', mov.local_id && mov.qtd_local != null ? qu(mov.qtd_local, p?.unidade_estoque) : '')}${linha('Saldo no local depois', mov.saldo_local_apos != null ? qu(mov.saldo_local_apos, p?.unidade_estoque) : '')}
      ${linha('Padeiro', dados.mapa.operador.get(mov.operador_id)?.nome)}${linha('Transferência', mov.transferencia_id ? `nº ${mov.transferencia_id}` : '')}${linha('Batelada', mov.batelada_id ? `nº ${mov.batelada_id}` : '')}
      ${linha('Usuário', nomeUsuario(dados.mapa.perfil.get(mov.usuario_id)))}${linha('Destino', mov.destino)}${linha('Motivo', MOTIVOS_INVENTARIO[mov.motivo] || mov.motivo)}
    </div>
    ${mov.observacao && html`<p class="nota"><b>Observação:</b> ${mov.observacao}</p>`}
    ${mov.tipo === 'transferencia' && html`<p class="nota"><b>Transferência não se corrige.</b> Se o destino ainda não recebeu, quem enviou pode cancelar na tela
      Transferências (a mercadoria volta para a origem). Depois de recebida e conferida pelo destino, não pode mais ser alterada: diferenças se acertam por inventário.</p>`}
    ${original && html`<p class="nota">Esta linha corrige o lançamento <b>#${original.id}</b> (${TIPOS_MOV[original.tipo]}, ${qu(original.quantidade, p?.unidade_estoque)}, ${dataHora(original.data_hora)}).</p>`}
    ${corr && corr.length > 0 && html`<h3>Correções deste lançamento</h3><ul class="lista-simples">${corr.map((c) => html`<li>#${c.id} · ${dataHora(c.data_hora)} · ${c.quantidade > 0 ? '+' : ''}${qu(c.quantidade, p?.unidade_estoque)}
      · ${dados.mapa.perfil.get(c.usuario_id)?.nome}<br /><small>${c.observacao} — Motivo: ${c.motivo}</small></li>`)}</ul>`}
  </${Modal}>`;
}

// Modal de correção (usado aqui e na tela de saídas)
// Prazo para corrigir: só o ADMINISTRADOR corrige a qualquer momento. Os demais: CONSUMO (no setor e pela receita)
// até 1 hora depois do lançamento; o resto só no MESMO DIA (erro de digitação com a nota na mão).
// Depois disso, o acerto é por inventário. O banco confere de novo (corrigir_movimento).
const CONSUMO = ['consumo', 'saida_receita'];
const prazoConsumoVencido = (mov) => Date.now() - new Date(mov.data_hora).getTime() > 3600000;
export const correcaoNoPrazo = (mov, papeis) => (papeis || []).includes('admin')
  || (diaLocal(mov.data_hora) === hojeISO() && !(CONSUMO.includes(mov.tipo) && prazoConsumoVencido(mov)));

function AvisoPrazoCorrecao({ mov, aoFechar }) {
  const { ir, podeFazer } = useApp();
  return html`<${Modal} titulo="Prazo para correção encerrado" aoFechar=${() => aoFechar(false)} semProtecao
    rodape=${html`<button class="btn btn-sec" onClick=${() => aoFechar(false)}>Entendi</button>
      ${podeFazer('inventario') && html`<button class="btn btn-pri" onClick=${() => { aoFechar(false); ir('inventario'); }}>Ir para o Inventário</button>`}`}>
    <div class="aviso-faixa aviso-prazo" role="alert"><span><${Icone} nome="aviso" tam=${22} /> <b>${CONSUMO.includes(mov.tipo)
      ? `Consumo só pode ser corrigido em até 1 hora depois do lançamento (este foi em ${dataHora(mov.data_hora)}).`
      : `Este lançamento é de ${data(diaLocal(mov.data_hora))} e só podia ser corrigido no mesmo dia.`}</b></span></div>
    <p>A correção serve para <b>erro de digitação logo depois de lançar</b>${CONSUMO.includes(mov.tipo) ? '' : ' (por exemplo, com a nota fiscal na mão no fim do expediente)'}.</p>
    <p>Passado o dia, a diferença no estoque é acertada por <b>inventário</b>: conte o que existe no local e registre a contagem. O sistema lança o ajuste e guarda o motivo.</p>
    <p class="nota">Dúvidas? Fale com o administrador do sistema.</p>
  </${Modal}>`;
}

export function CorrigirMovimento({ mov, aoFechar }) {
  const { papeis } = useApp();
  if (!correcaoNoPrazo(mov, papeis) && !['implantacao', 'inventario'].includes(mov.tipo)) return html`<${AvisoPrazoCorrecao} mov=${mov} aoFechar=${aoFechar} />`;
  return html`<${FormCorrecao} mov=${mov} aoFechar=${aoFechar} />`;
}

function FormCorrecao({ mov, aoFechar }) {
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
