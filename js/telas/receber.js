// Recebimento de mercadoria (pensado para o celular), com divergência
import { html, useState, useMemo, useEffect, useApp, Campo, Numero, Escolher, QtdUnidade, Busca, Cabecalho, Vazio, useAcao, confirmar, avisar, n } from '../ui.js';
import { numeroPedido, data, qtd, moeda, contem, fator, qu, pl, plural } from '../util.js';
import { resumoPedido, PrazoEtiqueta } from './pedidos.js';

// Para onde vai (local) e, se o produto conta por volume (ex.: bobina), quantos volumes
const localPadrao = (dados, p) => p?.local_padrao_id || dados.locais.find((l) => l.tipo === 'almoxarifado' && l.ativo)?.id || null;
function Destino({ p, l, aoMudar }) {
  const { dados } = useApp();
  if (!p || p.controla_estoque === false) return null;
  const locais = dados.locais.filter((x) => x.ativo);
  return html`<div class="conf-destino">
    ${locais.length > 1 && html`<label class="campo-inline">Guardar em <select class="entrada" value=${l.local_id ?? localPadrao(dados, p) ?? ''} onChange=${(e) => aoMudar({ local_id: Number(e.target.value) })}>
      ${locais.map((x) => html`<option value=${x.id}>${x.nome}</option>`)}</select></label>`}
    ${p.unidade2 && html`<label class="campo-inline">Quantas ${p.unidade2}s? <${Numero} valor=${l.qtd2 || ''} aoMudar=${(v) => aoMudar({ qtd2: v })} placeholder="0" /></label>`}
  </div>`;
}
const extraDestino = (dados, l, p) => ({ local_id: l.local_id ?? localPadrao(dados, p), qtd2: l.qtd2 === undefined || l.qtd2 === '' ? null : n(l.qtd2) });

const virg = (v) => String(Math.round(v * 1000) / 1000).replace('.', ',');

export function TelaReceber() {
  const { dados, estadoRota, setEstadoRota } = useApp();
  const [busca, setBusca] = useState('');
  const [pedidoId, setPedidoId] = useState(estadoRota?.pedido || null);
  const [semPedido, setSemPedido] = useState(false);
  useEffect(() => { if (estadoRota) setEstadoRota(null); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [pedidoId, semPedido]);

  const pendentes = useMemo(() => dados.pedidos.filter((p) => p.status === 'aberto' || p.status === 'parcial')
    .map((p) => ({ ...p, r: resumoPedido(p, dados) }))
    .filter((p) => contem(`${numeroPedido(p.id)} ${p.id} ${p.r.fornecedor?.nome} ${p.r.itens.map((i) => dados.mapa.produto.get(i.produto_id)?.descricao).join(' ')}`, busca))
    .sort((a, b) => String(a.previsao_entrega).localeCompare(String(b.previsao_entrega))), [dados, busca]);

  if (pedidoId) return html`<${ConferirPedido} pedido=${dados.pedidos.find((p) => p.id === pedidoId)} aoVoltar=${() => setPedidoId(null)} />`;
  if (semPedido) return html`<${ReceberSemPedido} aoVoltar=${() => setSemPedido(false)} />`;

  return html`
    <${Cabecalho} titulo="Receber mercadoria" sub="Escolha o pedido que está chegando para conferir">
      <button class="btn btn-sec" onClick=${() => setSemPedido(true)}>Recebimento sem pedido</button>
    </${Cabecalho}>
    <div class="filtros"><${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Nº do pedido, fornecedor ou produto" /></div>
    ${pendentes.length === 0 ? html`<${Vazio} texto="Nenhum pedido aguardando entrega. Se chegou mercadoria sem pedido, use “Recebimento sem pedido”." />`
      : html`<div class="lista-cartoes">${pendentes.map((p) => html`<button class="cartao-lista" onClick=${() => setPedidoId(p.id)}>
          <div class="cl-topo"><b>${numeroPedido(p.id)}</b><${PrazoEtiqueta} r=${p.r} /></div>
          <div class="cl-titulo">${p.r.fornecedor?.nome}</div>
          <div class="cl-sub">Previsão ${data(p.previsao_entrega)} · ${pl(p.r.itens.length, 'item', 'itens')}${p.status === 'parcial' ? ' · já recebido em parte' : ''}</div>
          <div class="cl-itens">${p.r.itens.slice(0, 3).map((i) => dados.mapa.produto.get(i.produto_id)?.descricao).join(' · ')}${p.r.itens.length > 3 ? ' …' : ''}</div>
        </button>`)}</div>`}`;
}

function ConferirPedido({ pedido, aoVoltar }) {
  const { dados, recarregar, api } = useApp();
  const r = resumoPedido(pedido, dados);
  const [nf, setNf] = useState('');
  const [obs, setObs] = useState('');
  const [avisado, setAvisado] = useState(false);
  const [restante, setRestante] = useState('aguardar');   // aguardar | encerrar
  const [linhas, setLinhas] = useState(() => r.itens.map((i) => {
    const p = dados.mapa.produto.get(i.produto_id); const f = fator(p, i.unidade);
    const falta = Math.max(i.quantidade_base - i.qtd_recebida_base, 0) / f;
    return { k: i.id, pedido_item_id: i.id, produto_id: i.produto_id, unidade: i.unidade, quantidade: virg(falta), falta,
      conferido: false, mudarPreco: false, preco: virg(Number(i.preco_unitario)) };
  }));
  const [extras, setExtras] = useState([]);
  const [ocupado, executar] = useAcao();
  const mudar = (k, ch) => setLinhas((l) => l.map((x) => (x.k === k ? { ...x, ...ch } : x)));
  const mudarExtra = (k, ch) => setExtras((l) => l.map((x) => (x.k === k ? { ...x, ...ch } : x)));
  const item = (l) => r.itens.find((i) => i.id === l.pedido_item_id);

  // diferenças em relação ao pedido, calculadas na hora
  const analise = useMemo(() => {
    const div = []; let falta = false;
    for (const l of linhas) {
      const p = dados.mapa.produto.get(l.produto_id); const it = item(l);
      const q = n(l.quantidade) || 0; const d = q - l.falta;
      if (d > 0.0005) div.push(`${p.descricao}: veio ${qu(d, l.unidade)} a mais`);
      if (d < -0.0005) { falta = true; if (restante === 'encerrar') div.push(`${p.descricao}: veio ${qu(-d, l.unidade)} a menos (o restante não virá)`); }
      if (l.mudarPreco && Math.abs((n(l.preco) || 0) - Number(it.preco_unitario)) >= 0.005)
        div.push(`${p.descricao}: preço da nota ${moeda(n(l.preco))} por ${it.unidade} (pedido ${moeda(it.preco_unitario)})`);
    }
    for (const e of extras.filter((x) => x.produto_id && n(x.quantidade) > 0)) div.push(`${dados.mapa.produto.get(e.produto_id)?.descricao}: item fora do pedido`);
    return { div, falta };
  }, [linhas, extras, restante]);
  const temDiv = analise.div.length > 0;

  async function registrar() {
    if (temDiv && !obs.trim()) return avisar('Recebimento com divergência: escreva a ressalva antes de confirmar.', 'erro');
    const its = [...linhas, ...extras.filter((e) => e.produto_id)];
    const ok = await confirmar({ titulo: temDiv ? 'Confirmar recebimento COM DIVERGÊNCIA' : 'Confirmar recebimento', ok: 'Dar entrada no estoque', mensagem: html`
      <p>Pedido <b>${numeroPedido(pedido.id)}</b> · ${r.fornecedor?.nome}${nf ? ` · NF ${nf}` : ''}</p>
      <ul class="lista-simples">${its.filter((l) => n(l.quantidade) > 0).map((l) => html`<li><b>${qu(n(l.quantidade), l.unidade)}</b> ${dados.mapa.produto.get(l.produto_id)?.descricao}</li>`)}</ul>
      ${analise.falta && html`<p class="nota">O que faltou: <b>${restante === 'encerrar' ? 'não vem mais, o pedido será encerrado' : 'ainda vai chegar (entrega parcial)'}</b>.</p>`}
      ${temDiv && html`<div class="alerta"><b>Divergências:</b><ul class="lista-simples">${analise.div.map((d) => html`<li>${d}</li>`)}</ul>
        O pedido ficará marcado como <b>recebido com divergência</b> até o comprador dar ciência no sistema.</div>`}` });
    if (!ok) return;
    const res = await executar(() => api.rpc('registrar_recebimento', { p: { pedido_id: pedido.id, nota_fiscal: nf, observacao: obs, comprador_avisado: avisado,
      encerrar_pendente: analise.falta && restante === 'encerrar',
      itens: its.map((l) => {
        const it = l.pedido_item_id ? item(l) : null; const p = dados.mapa.produto.get(l.produto_id);
        // preço da nota é digitado por unidade do pedido; envia na unidade da quantidade
        const precoNota = it && l.mudarPreco ? (n(l.preco) || 0) * fator(p, l.unidade) / fator(p, it.unidade) : null;
        return { produto_id: l.produto_id, pedido_item_id: l.pedido_item_id || null, quantidade: n(l.quantidade) || 0, unidade: l.unidade, preco_nota: precoNota, ...extraDestino(dados, l, p) };
      }) } }), temDiv ? 'Recebido com divergência. O comprador vai ver o aviso no sistema.' : 'Recebimento registrado. Estoque atualizado!');
    if (res) { await recarregar(); aoVoltar(); }
  }

  return html`
    <${Cabecalho} aoVoltar=${aoVoltar} titulo=${`Conferir ${numeroPedido(pedido.id)}`} sub=${`${r.fornecedor?.nome} · pedido em ${data(pedido.data_pedido)} · previsão ${data(pedido.previsao_entrega)}`} />
    <${Campo} rotulo="Nº da nota fiscal"><input class="entrada" inputmode="numeric" value=${nf} onInput=${(e) => setNf(e.target.value)} /></${Campo}>
    <p class="nota">Confira cada item e informe a quantidade que <b>chegou agora</b>. Já vem preenchido com o que falta receber.</p>
    <div class="lista-conferencia">
      ${linhas.map((l) => { const p = dados.mapa.produto.get(l.produto_id); const it = item(l);
        const recebido = it.qtd_recebida_base / fator(p, it.unidade);
        const dif = (n(l.quantidade) || 0) - l.falta;
        return html`<div class=${'conf-item' + (Math.abs(dif) > 0.0005 || (l.mudarPreco && Math.abs((n(l.preco) || 0) - it.preco_unitario) >= 0.005) ? ' dif' : l.conferido ? ' ok' : '')} key=${l.k}>
          <div class="conf-cab"><b>${p?.descricao}</b><small>${p?.codigo}</small></div>
          <div class="conf-info">Pedido: <b>${qu(it.quantidade, it.unidade)}</b>${recebido > 0 ? html` · já recebido ${qu(recebido, it.unidade)}` : ''} · falta <b>${qu(l.falta, it.unidade)}</b> · ${moeda(it.preco_unitario)} por ${it.unidade}</div>
          <div class="conf-rotulo">Quantidade que chegou:</div>
          <div class="conf-entrada">
            <${QtdUnidade} produto=${p} valor=${l.quantidade} unidade=${l.unidade} aoMudar=${(v, u) => mudar(l.k, u !== l.unidade
              ? { unidade: u, quantidade: virg((n(v) || 0) * fator(p, l.unidade) / fator(p, u)), falta: l.falta * fator(p, l.unidade) / fator(p, u) } : { quantidade: v })} />
            <button class=${'btn ' + (l.conferido ? 'btn-ok' : 'btn-sec')} onClick=${() => mudar(l.k, { conferido: !l.conferido })}>${l.conferido ? '✓ Conferido' : 'Conferir'}</button>
          </div>
          <${Destino} p=${p} l=${l} aoMudar=${(ch) => mudar(l.k, ch)} />
          ${Math.abs(dif) > 0.0005 && html`<div class="conf-dif">${dif < 0 ? `Faltando ${qu(-dif, l.unidade)}` : `Veio ${qu(dif, l.unidade)} a mais`}</div>`}
          <label class="check"><input type="checkbox" checked=${l.mudarPreco} onChange=${(e) => mudar(l.k, { mudarPreco: e.target.checked })} /> Preço da nota diferente do pedido</label>
          ${l.mudarPreco && html`<${Campo} rotulo=${`Preço na nota (por ${it.unidade})`}><${Numero} valor=${l.preco} aoMudar=${(v) => mudar(l.k, { preco: v })} /></${Campo}>`}
        </div>`; })}
    </div>
    ${extras.length > 0 && html`<h3>Itens que vieram fora do pedido</h3>`}
    <div class="linhas-itens">${extras.map((e) => { const p = dados.mapa.produto.get(e.produto_id); return html`<div class="linha-item" key=${e.k}>
      <${Escolher} itens=${dados.produtos.filter((x) => x.ativo)} valor=${e.produto_id} rotuloDe=${(x) => `${x.codigo} · ${x.descricao}`}
        aoMudar=${(id, pr) => mudarExtra(e.k, { produto_id: id, unidade: pr.unidade_compra || pr.unidade_estoque })} />
      <${QtdUnidade} produto=${p} valor=${e.quantidade} unidade=${e.unidade} desabilitado=${!p} aoMudar=${(v, u) => mudarExtra(e.k, { quantidade: v, unidade: u })} />
      <button class="btn-icone btn-remover" onClick=${() => setExtras((x) => x.filter((y) => y.k !== e.k))}>✕</button>
      <${Destino} p=${p} l=${e} aoMudar=${(ch) => mudarExtra(e.k, ch)} /></div>`; })}</div>
    <button class="btn btn-sec btn-bloco-cel" onClick=${() => setExtras((x) => [...x, { k: Math.random(), produto_id: null, quantidade: '', unidade: null }])}>+ Item fora do pedido</button>

    ${analise.falta && html`<div class="painel opcoes">
      <b>Chegou menos do que o pedido. E o restante?</b>
      <label class="opcao"><input type="radio" name="rest" checked=${restante === 'aguardar'} onChange=${() => setRestante('aguardar')} />
        <span><b>Ainda vai chegar</b><small>Entrega parcial: o pedido continua aberto esperando o restante.</small></span></label>
      <label class="opcao"><input type="radio" name="rest" checked=${restante === 'encerrar'} onChange=${() => setRestante('encerrar')} />
        <span><b>Não vem mais</b><small>Recebe o que chegou, encerra o pedido e marca como divergência para o comprador.</small></span></label>
    </div>`}

    ${temDiv && html`<div class="painel painel-alerta">
      <h3>⚠ Recebimento com divergência</h3>
      <ul class="lista-simples">${analise.div.map((d) => html`<li>${d}</li>`)}</ul>
      <p class="nota">Você pode receber normalmente. O pedido fica marcado como <b>recebido com divergência</b> e o comprador precisa dar ciência no sistema.</p>
      <label class="check destaque"><input type="checkbox" checked=${avisado} onChange=${(e) => setAvisado(e.target.checked)} /> Avisei o comprador e ele autorizou receber</label>
    </div>`}
    <${Campo} rotulo=${temDiv ? 'Ressalva (obrigatória)' : 'Observação'} obrigatorio=${temDiv}
      ajuda="Ex.: veio 510 sacos, comprador autorizou por WhatsApp; 2 sacos rasgados; motorista volta amanhã…">
      <textarea class="entrada" rows="3" value=${obs} onInput=${(e) => setObs(e.target.value)}></textarea></${Campo}>
    <div class="barra-acao"><button class=${'btn btn-grande ' + (temDiv ? 'btn-alerta' : 'btn-pri')} disabled=${ocupado} onClick=${registrar}>
      ${ocupado ? 'Registrando…' : temDiv ? 'Receber com divergência' : 'Confirmar recebimento'}</button></div>`;
}

function ReceberSemPedido({ aoVoltar }) {
  const { dados, recarregar, api } = useApp();
  const [forn, setForn] = useState(null);
  const [nf, setNf] = useState('');
  const [obs, setObs] = useState('');
  const [avisado, setAvisado] = useState(false);
  const [linhas, setLinhas] = useState([{ k: 1, produto_id: null, quantidade: '', unidade: null, custo: '' }]);
  const [ocupado, executar] = useAcao();
  const mudar = (k, ch) => setLinhas((l) => l.map((x) => (x.k === k ? { ...x, ...ch } : x)));

  async function registrar() {
    const its = linhas.filter((l) => l.produto_id && n(l.quantidade) > 0);
    if (!its.length) return avisar('Informe pelo menos 1 item e a quantidade.', 'erro');
    if (!obs.trim()) return avisar('Escreva a ressalva: por que chegou sem pedido e com quem foi combinado.', 'erro');
    const ok = await confirmar({ titulo: 'Confirmar recebimento SEM PEDIDO', ok: 'Dar entrada no estoque', mensagem: html`
      <ul class="lista-simples">${its.map((l) => html`<li><b>${qu(n(l.quantidade), l.unidade)}</b> ${dados.mapa.produto.get(l.produto_id)?.descricao}</li>`)}</ul>
      <div class="alerta">Entra no estoque agora e fica marcado como <b>recebido sem pedido</b> até o comprador dar ciência no sistema.</div>` });
    if (!ok) return;
    const res = await executar(() => api.rpc('registrar_recebimento', { p: { fornecedor_id: forn, nota_fiscal: nf, observacao: obs, comprador_avisado: avisado,
      itens: its.map((l) => ({ produto_id: l.produto_id, quantidade: n(l.quantidade), unidade: l.unidade, custo_unitario: n(l.custo), ...extraDestino(dados, l, dados.mapa.produto.get(l.produto_id)) })) } }), 'Recebido sem pedido. O comprador vai ver o aviso no sistema.');
    if (res) { await recarregar(); aoVoltar(); }
  }
  return html`
    <${Cabecalho} aoVoltar=${aoVoltar} titulo="Recebimento sem pedido" sub="Mercadoria que chegou sem pedido de compra no sistema" />
    <div class="grade">
      <${Campo} rotulo="Fornecedor"><${Escolher} itens=${dados.fornecedores.filter((x) => x.ativo)} valor=${forn} aoMudar=${setForn} rotuloDe=${(x) => x.nome} placeholder="(opcional)" /></${Campo}>
      <${Campo} rotulo="Nº da nota fiscal"><input class="entrada" value=${nf} onInput=${(e) => setNf(e.target.value)} /></${Campo}>
    </div>
    <h3>O que chegou</h3>
    <div class="linhas-itens">
      ${linhas.map((l) => { const p = dados.mapa.produto.get(l.produto_id); return html`<div class="linha-item linha-pedido" key=${l.k}>
        <div class="li-prod"><${Escolher} itens=${dados.produtos.filter((x) => x.ativo)} valor=${l.produto_id} rotuloDe=${(x) => `${x.codigo} · ${x.descricao}`}
          aoMudar=${(id, pr) => mudar(l.k, { produto_id: id, unidade: pr.unidade_compra || pr.unidade_estoque })} placeholder="Produto…" /></div>
        <${QtdUnidade} produto=${p} valor=${l.quantidade} unidade=${l.unidade} desabilitado=${!p} aoMudar=${(v, u) => mudar(l.k, { quantidade: v, unidade: u })} />
        <div class="li-preco"><small>Preço por ${l.unidade || 'unidade'} (opcional)</small><${Numero} valor=${l.custo} aoMudar=${(v) => mudar(l.k, { custo: v })} placeholder="0,00" /></div>
        <button class="btn-icone btn-remover" onClick=${() => setLinhas((x) => x.filter((y) => y.k !== l.k))}>✕</button>
        <${Destino} p=${p} l=${l} aoMudar=${(ch) => mudar(l.k, ch)} />
      </div>`; })}
    </div>
    <button class="btn btn-sec btn-bloco-cel" onClick=${() => setLinhas((x) => [...x, { k: Math.random(), produto_id: null, quantidade: '', unidade: null, custo: '' }])}>+ Item</button>
    <div class="painel painel-alerta">
      <h3>⚠ Recebimento sem pedido de compra</h3>
      <p class="nota">Você pode receber normalmente. Fica registrado como <b>recebido sem pedido</b> e o comprador precisa dar ciência no sistema.</p>
      <label class="check destaque"><input type="checkbox" checked=${avisado} onChange=${(e) => setAvisado(e.target.checked)} /> Avisei o comprador e ele autorizou receber</label>
    </div>
    <${Campo} rotulo="Ressalva (obrigatória)" obrigatorio ajuda="Por que chegou sem pedido? Com quem foi combinado?"><textarea class="entrada" rows="3" value=${obs} onInput=${(e) => setObs(e.target.value)}></textarea></${Campo}>
    <p class="nota">Sem preço informado, a entrada usa o custo médio atual do produto.</p>
    <div class="barra-acao"><button class="btn btn-alerta btn-grande" disabled=${ocupado} onClick=${registrar}>${ocupado ? 'Registrando…' : 'Receber sem pedido'}</button></div>`;
}
