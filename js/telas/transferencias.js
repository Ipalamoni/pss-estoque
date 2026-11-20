// =====================================================================
// TRANSFERÊNCIAS entre locais e entre unidades
// Disponível → Separado → Em trânsito → Recebido (no destino)
// Cancelar envio → volta para separado · cancelar separação → volta ao disponível
// =====================================================================
import { html, useState, useEffect, useApp, Cabecalho, Abas, Tabela, Etiqueta, Modal, Campo, Numero, Escolher, Vazio, Carregando, useAcao, confirmar, avisar, n } from '../ui.js';
import { num, qu, dataHora, hojeISO, somarDias, operaLocal, ehGestao, SITUACAO_TRANSF, pl, mensagemErro, contem } from '../util.js';
import { Icone } from '../icones.js';
import { nomeLocal, saldoLocal, minutos, tempoTexto } from '../producao-util.js';
import { Exportar } from '../exportar.js';

const COR = { separada: 'laranja', enviada: 'azul', recebida: 'verde', cancelada: 'cinza' };
const inicioDia = (iso) => new Date(iso + 'T00:00:00').toISOString();

export function TelaTransferencias() {
  const { dados, papeis, estadoRota, setEstadoRota } = useApp();
  const gestao = ehGestao(papeis);
  const meus = new Set(dados.locais.filter((l) => operaLocal(papeis, l)).map((l) => l.id));
  const admin = papeis.includes('admin');
  const [aba, setAba] = useState('receber');
  const [nova, setNova] = useState(false);
  const [aberta, setAberta] = useState(null);
  useEffect(() => { if (estadoRota?.abrir?.id) { setAberta(estadoRota.abrir.id); setEstadoRota(null); } }, []);
  const comItens = (t) => ({ ...t, itens: dados.transfItens.filter((i) => i.transferencia_id === t.id) });
  const minhaOrigem = (t) => admin || meus.has(t.origem_id);
  const meuDestino = (t) => admin || meus.has(t.destino_id);
  const separadas = dados.transferencias.filter((t) => t.situacao === 'separada' && (minhaOrigem(t) || gestao)).map(comItens);
  const enviadas = dados.transferencias.filter((t) => t.situacao === 'enviada' && (minhaOrigem(t) || gestao)).map(comItens);
  const receber = dados.transferencias.filter((t) => t.situacao === 'enviada' && (meuDestino(t) || gestao)).map(comItens);
  const podeCriar = meus.size > 0;
  const abas = [
    { id: 'receber', titulo: `A receber (${receber.filter(meuDestino).length})` },
    { id: 'separadas', titulo: `Separadas (${separadas.length})` },
    { id: 'enviadas', titulo: `Enviadas (${enviadas.length})` },
    { id: 'historico', titulo: 'Histórico' },
  ];
  const lista = aba === 'receber' ? receber : aba === 'separadas' ? separadas : enviadas;
  return html`
    <${Cabecalho} titulo="Transferências" sub="Mover material entre locais e unidades: separar, enviar e o destino recebe.">
      ${podeCriar && html`<button class="btn btn-pri" onClick=${() => setNova(true)}><${Icone} nome="mais" tam=${16} /> Nova transferência</button>`}
    </${Cabecalho}>
    <${Abas} abas=${abas} ativa=${aba} aoMudar=${setAba} />
    ${aba === 'historico' ? html`<${Historico} aoAbrir=${setAberta} meus=${meus} gestao=${gestao} />`
      : !lista.length ? html`<${Vazio} texto=${aba === 'receber' ? 'Nada chegando para os seus locais.' : aba === 'separadas' ? 'Nenhuma transferência separada esperando envio.' : 'Nada em trânsito.'} />`
      : html`<div class="lista-transf">${lista.map((t) => html`<${CartaoTransf} t=${t} key=${t.id} aoAbrir=${() => setAberta(t.id)}
          podeOrigem=${minhaOrigem(t)} podeDestino=${meuDestino(t)} aba=${aba} />`)}</div>`}
    ${nova && html`<${NovaTransferencia} aoFechar=${() => setNova(false)} />`}
    ${aberta && html`<${DetalheTransf} id=${aberta} aoFechar=${() => setAberta(null)} />`}`;
}

function CartaoTransf({ t, aoAbrir, podeOrigem, podeDestino, aba }) {
  const { dados, api, recarregar } = useApp();
  const [ocupado, executar] = useAcao();
  const [receber, setReceber] = useState(false);
  async function enviar() { if (await executar(() => api.rpc('enviar_transferencia', { p_id: t.id }), 'Enviado: agora está em trânsito.') !== null) await recarregar(true); }
  async function cancelar() {
    let motivo = '';
    const ok = await confirmar({ titulo: t.situacao === 'enviada' ? 'Cancelar o envio' : 'Cancelar a separação', ok: 'Confirmar', perigo: true, cancelar: 'Voltar',
      mensagem: html`<p>${t.situacao === 'enviada' ? 'O material volta para "separado" na origem.' : 'O material volta para o disponível da origem.'}</p>
        <${Campo} rotulo="Motivo" obrigatorio><input class="entrada" onInput=${(e) => { motivo = e.target.value; }} /></${Campo}>` });
    if (!ok) return;
    if (await executar(() => api.rpc('cancelar_transferencia', { p_id: t.id, p_motivo: motivo }), 'Cancelado.') !== null) await recarregar(true);
  }
  const desde = t.enviado_em || t.separado_em;
  return html`<div class=${'transf-cartao s-' + t.situacao}>
    <div class="transf-topo" onClick=${aoAbrir}>
      <span class="transf-num">Nº ${t.id}</span><${Etiqueta} cor=${COR[t.situacao]}>${SITUACAO_TRANSF[t.situacao]}</${Etiqueta}>
      ${t.requisicao_id && html`<${Etiqueta} cor="roxo">requisição ${t.requisicao_id}</${Etiqueta}>`}${t.anterior_id && html`<${Etiqueta} cor="cinza">diferença da nº ${t.anterior_id}</${Etiqueta}>`}
      <small class="transf-tempo">há ${tempoTexto(minutos(desde))}</small>
    </div>
    <div class="transf-rota" onClick=${aoAbrir}><span>${nomeLocal(dados, t.origem_id)}</span><span class="seta">→</span><b>${nomeLocal(dados, t.destino_id)}</b></div>
    <ul class="transf-itens" onClick=${aoAbrir}>${t.itens.map((i) => { const p = dados.mapa.produto.get(i.produto_id);
      return html`<li><b>${qu(i.quantidade, p?.unidade_estoque)}</b> ${p?.descricao}${i.qtd2 ? html` <small>(${num(i.qtd2, 0)} ${p?.unidade2 || 'vol.'})</small>` : ''}</li>`; })}</ul>
    ${t.observacao && html`<p class="nota">${t.observacao}</p>`}
    <div class="transf-acoes">
      ${aba === 'receber' && podeDestino && html`<button class="btn btn-pri btn-grande" onClick=${() => setReceber(true)}>Receber</button>`}
      ${aba === 'separadas' && podeOrigem && html`<button class="btn btn-pri" disabled=${ocupado} onClick=${enviar}><${Icone} nome="caminhao" tam=${16} /> Enviar</button>
        <button class="btn btn-perigo-sec" disabled=${ocupado} onClick=${cancelar}>Cancelar separação</button>`}
      ${aba === 'enviadas' && podeOrigem && html`<button class="btn btn-perigo-sec" disabled=${ocupado} onClick=${cancelar}>Cancelar envio</button>`}
    </div>
    ${receber && html`<${Receber} t=${t} aoFechar=${() => setReceber(false)} />`}
  </div>`;
}

function Receber({ t, aoFechar }) {
  const { dados, api, recarregar } = useApp();
  const [vals, setVals] = useState(() => Object.fromEntries(t.itens.map((i) => [i.id, { q: String(Number(i.quantidade)).replace('.', ','), q2: i.qtd2 != null ? String(Number(i.qtd2)) : '' }])));
  const [obs, setObs] = useState('');
  const [ocupado, executar] = useAcao();
  const dif = t.itens.some((i) => Math.abs((n(vals[i.id].q) ?? 0) - Number(i.quantidade)) > 0.0001);
  async function ok() {
    if (dif && !obs.trim()) return avisar('Chegou diferente do enviado: escreva o que aconteceu.', 'erro');
    const r = await executar(() => api.rpc('receber_transferencia', { p: { id: t.id, observacao: obs || null,
      itens: t.itens.map((i) => ({ item_id: i.id, recebido: n(vals[i.id].q) ?? 0, qtd2: vals[i.id].q2 === '' ? null : n(vals[i.id].q2) })) } }),
      dif ? 'Recebido. A diferença voltou para "separado" na origem.' : 'Recebido.');
    if (r !== null) { await recarregar(true); aoFechar(); }
  }
  return html`<${Modal} titulo=${`Receber transferência nº ${t.id}`} aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Voltar</button><button class="btn btn-pri btn-grande" disabled=${ocupado} onClick=${ok}>${dif ? 'Receber com diferença' : 'Receber tudo'}</button>`}>
    <p>De <b>${nomeLocal(dados, t.origem_id)}</b> para <b>${nomeLocal(dados, t.destino_id)}</b>. Confira o que chegou:</p>
    <div class="lista-conferencia">${t.itens.map((i) => { const p = dados.mapa.produto.get(i.produto_id); const v = vals[i.id];
      const d = Math.abs((n(v.q) ?? 0) - Number(i.quantidade)) > 0.0001;
      return html`<div class=${'conf-item ' + (d ? 'dif' : 'ok')}><div class="conf-cab"><b>${p?.descricao}</b><span class="conf-info">enviado ${qu(i.quantidade, p?.unidade_estoque)}${i.qtd2 ? ` · ${num(i.qtd2, 0)} ${p?.unidade2}` : ''}</span></div>
        <div class="conf-entrada"><span>Chegou</span><${Numero} valor=${v.q} aoMudar=${(x) => setVals({ ...vals, [i.id]: { ...v, q: x } })} /><span>${p?.unidade_estoque}</span>
          ${p?.unidade2 && html`<${Numero} valor=${v.q2} aoMudar=${(x) => setVals({ ...vals, [i.id]: { ...v, q2: x } })} /><span>${p.unidade2}s</span>`}</div>
        ${d && html`<span class="conf-dif">Diferença: ${qu(Number(i.quantidade) - (n(v.q) || 0), p?.unidade_estoque)} volta para "separado" na origem</span>`}</div>`; })}</div>
    <${Campo} rotulo=${dif ? 'Observação (obrigatória)' : 'Observação (opcional)'}><input class="entrada" value=${obs} onInput=${(e) => setObs(e.target.value)} /></${Campo}>
  </${Modal}>`;
}

function NovaTransferencia({ aoFechar }) {
  const { dados, papeis, api, recarregar } = useApp();
  const origens = dados.locais.filter((l) => l.ativo && operaLocal(papeis, l));
  const [org, setOrg] = useState(origens[0]?.id || null);
  const [dst, setDst] = useState(null);
  const [linhas, setLinhas] = useState([{ k: 1, produto_id: null, q: '', q2: '' }]);
  const [obs, setObs] = useState('');
  const [enviar, setEnviar] = useState(true);
  const [anexo, setAnexo] = useState(null);
  const [ocupado, executar] = useAcao();
  const destinos = dados.locais.filter((l) => l.ativo && l.id !== org);
  const prods = dados.produtos.filter((p) => p.ativo && p.controla_estoque && saldoLocal(dados, p.id, org).disponivel > 0);
  const mudar = (k, ch) => setLinhas((l) => l.map((x) => (x.k === k ? { ...x, ...ch } : x)));
  const outraUnidade = org && dst && dados.mapa.local.get(org)?.unidade_id !== dados.mapa.local.get(dst)?.unidade_id;
  async function lerArquivo(f) {
    if (!f) return setAnexo(null);
    if (f.size > 3 * 1024 * 1024) return avisar('Arquivo maior que 3 MB. Tire uma foto menor ou envie o PDF reduzido.', 'erro');
    const b64 = await new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = erro; r.readAsDataURL(f); });
    setAnexo({ nome: f.name, tipo: f.type, conteudo: b64 });
  }
  async function salvar() {
    const itens = linhas.filter((l) => l.produto_id && n(l.q) > 0).map((l) => ({ produto_id: l.produto_id, quantidade: n(l.q), unidade: dados.mapa.produto.get(l.produto_id).unidade_estoque, qtd2: l.q2 === '' ? null : n(l.q2) }));
    if (!dst) return avisar('Escolha o destino.', 'erro');
    if (!itens.length) return avisar('Informe pelo menos um item com quantidade.', 'erro');
    const r = await executar(() => api.rpc('criar_transferencia', { p: { origem_id: org, destino_id: dst, itens, enviar, observacao: obs || null, anexo } }),
      enviar ? 'Separado e enviado: em trânsito até o destino receber.' : 'Separado. Envie quando sair.');
    if (r) { await recarregar(true); aoFechar(); }
  }
  return html`<${Modal} titulo="Nova transferência" aoFechar=${aoFechar} largo
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Voltar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>${enviar ? 'Separar e enviar' : 'Separar'}</button>`}>
    <div class="grade">
      <${Campo} rotulo="Sai de (origem)"><select class="entrada" value=${org} onChange=${(e) => { setOrg(Number(e.target.value)); setLinhas([{ k: 1, produto_id: null, q: '', q2: '' }]); }}>
        ${origens.map((l) => html`<option value=${l.id}>${nomeLocal(dados, l.id)}</option>`)}</select></${Campo}>
      <${Campo} rotulo="Vai para (destino)"><select class="entrada" value=${dst || ''} onChange=${(e) => setDst(Number(e.target.value) || null)}>
        <option value="">Escolha…</option>${destinos.map((l) => html`<option value=${l.id}>${nomeLocal(dados, l.id)}</option>`)}</select></${Campo}>
    </div>
    <div class="linhas-itens">${linhas.map((l) => { const p = dados.mapa.produto.get(l.produto_id); const s = p ? saldoLocal(dados, p.id, org) : null;
      return html`<div class="linha-item linha-transf" key=${l.k}>
        <${Escolher} itens=${prods} valor=${l.produto_id} aoMudar=${(id) => mudar(l.k, { produto_id: id })} rotuloDe=${(x) => `${x.codigo} · ${x.descricao}`}
          detalheDe=${(x) => `disponível ${qu(saldoLocal(dados, x.id, org).disponivel, x.unidade_estoque)}`} />
        <div class="qtd-un"><${Numero} valor=${l.q} aoMudar=${(v) => mudar(l.k, { q: v })} placeholder=${p ? p.unidade_estoque : 'qtd'} />
          ${p?.unidade2 && html`<${Numero} valor=${l.q2} aoMudar=${(v) => mudar(l.k, { q2: v })} placeholder=${p.unidade2 + 's'} />`}</div>
        <button class="btn-icone" onClick=${() => setLinhas((x) => x.filter((y) => y.k !== l.k))}>✕</button>
        ${s && html`<small class="larga">disponível ${qu(s.disponivel, p.unidade_estoque)}${p.unidade2 ? ` · ${num(s.qtd2, 0)} ${p.unidade2}s` : ''}</small>`}</div>`; })}</div>
    <button class="btn btn-sec btn-peq" onClick=${() => setLinhas((x) => [...x, { k: Math.random(), produto_id: null, q: '', q2: '' }])}>+ Item</button>
    <label class="check destaque"><input type="checkbox" checked=${enviar} onChange=${(e) => setEnviar(e.target.checked)} /> Já sair agora (separar e enviar juntos). Desmarque para só separar e enviar depois.</label>
    <${Campo} rotulo="Observação"><input class="entrada" value=${obs} onInput=${(e) => setObs(e.target.value)} placeholder="ex.: entregar para o Juliano" /></${Campo}>
    ${outraUnidade && html`<${Campo} rotulo="Nota fiscal de transferência (opcional)" ajuda="PDF ou foto, até 3 MB. A nota continua sendo emitida no ERP.">
      <input class="entrada" type="file" accept="application/pdf,image/*" onChange=${(e) => lerArquivo(e.target.files[0])} /></${Campo}>`}
  </${Modal}>`;
}

function DetalheTransf({ id, aoFechar }) {
  const { dados, api } = useApp();
  const [r, setR] = useState(null);
  useEffect(() => {
    Promise.all([api.listar('transferencias', { eq: { id } }), api.listar('transferencia_itens', { eq: { transferencia_id: id } })])
      .then(([t, i]) => setR({ t: t[0], itens: i })).catch((e) => avisar(mensagemErro(e), 'erro'));
  }, [id, dados.carregadoEm]);
  async function abrirAnexo() {
    try {
      const [a] = await api.rpc('ler_anexo', { p_id: r.t.anexo_id });
      const bin = Uint8Array.from(atob(a.conteudo), (c) => c.charCodeAt(0));
      window.open(URL.createObjectURL(new Blob([bin], { type: a.tipo || 'application/octet-stream' })), '_blank');
    } catch (e) { avisar(mensagemErro(e), 'erro'); }
  }
  if (!r) return html`<${Modal} titulo=${`Transferência nº ${id}`} aoFechar=${aoFechar}><${Carregando} /></${Modal}>`;
  const { t, itens } = r;
  if (!t) return html`<${Modal} titulo="Transferência" aoFechar=${aoFechar}><${Vazio} texto="Não encontrada." /></${Modal}>`;
  const pes = (u) => dados.mapa.perfil.get(u)?.nome || '–';
  return html`<${Modal} titulo=${`Transferência nº ${t.id}`} aoFechar=${aoFechar} largo>
    <div class="info-grade">
      <div><small>Situação</small><span><${Etiqueta} cor=${COR[t.situacao]}>${SITUACAO_TRANSF[t.situacao]}</${Etiqueta}></span></div>
      <div><small>Origem</small><b>${nomeLocal(dados, t.origem_id)}</b></div><div><small>Destino</small><b>${nomeLocal(dados, t.destino_id)}</b></div>
      ${t.requisicao_id && html`<div><small>Requisição</small><b>nº ${t.requisicao_id}</b></div>`}
    </div>
    <${Tabela} linhas=${itens} colunas=${[
      { chave: 'p', titulo: 'Produto', render: (i) => dados.mapa.produto.get(i.produto_id)?.descricao },
      { chave: 'quantidade', titulo: 'Enviado', num: true, render: (i) => qu(i.quantidade, dados.mapa.produto.get(i.produto_id)?.unidade_estoque) },
      { chave: 'qtd2', titulo: '2ª medida', num: true, render: (i) => (i.qtd2 ? `${num(i.qtd2, 0)} ${dados.mapa.produto.get(i.produto_id)?.unidade2 || ''}` : '–') },
      { chave: 'recebido', titulo: 'Recebido', num: true, render: (i) => (i.recebido == null ? '–' : qu(i.recebido, dados.mapa.produto.get(i.produto_id)?.unidade_estoque)) },
    ]} />
    <ol class="linha-tempo">
      <li>Separado por <b>${pes(t.separado_por)}</b> em ${dataHora(t.separado_em)}${t.operador_id && !t.recebido_em ? ` · padeiro ${dados.mapa.operador.get(t.operador_id)?.nome}` : ''}</li>
      ${t.enviado_em && html`<li>Enviado por <b>${pes(t.enviado_por)}</b> em ${dataHora(t.enviado_em)}</li>`}
      ${t.recebido_em && html`<li>Recebido por <b>${pes(t.recebido_por)}</b>${t.operador_id ? ` (padeiro ${dados.mapa.operador.get(t.operador_id)?.nome})` : ''} em ${dataHora(t.recebido_em)}${t.recebido_obs ? ` · ${t.recebido_obs}` : ''}</li>`}
      ${t.cancelado_em && html`<li>Cancelado por <b>${pes(t.cancelado_por)}</b> em ${dataHora(t.cancelado_em)} · ${t.cancelado_motivo}</li>`}
    </ol>
    ${t.observacao && html`<p class="nota">${t.observacao}</p>`}
    ${t.anexo_id && html`<button class="btn btn-sec" onClick=${abrirAnexo}><${Icone} nome="anexo" tam=${16} /> Abrir nota fiscal anexada</button>`}
  </${Modal}>`;
}

function Historico({ aoAbrir, meus, gestao }) {
  const { dados, api } = useApp();
  const [de, setDe] = useState(somarDias(hojeISO(), -30));
  const [ate, setAte] = useState(hojeISO());
  const [busca, setBusca] = useState('');
  const [r, setR] = useState(null);
  useEffect(() => {
    let vivo = true; setR(null);
    api.listar('transferencias', { campoData: 'separado_em', desde: inicioDia(de), ate: inicioDia(somarDias(ate, 1)), ordem: ['id', 'desc'] })
      .then(async (ts) => { const its = ts.length ? await api.listar('transferencia_itens', { em: { transferencia_id: ts.map((t) => t.id) } }) : []; if (vivo) setR({ ts, its }); })
      .catch((e) => { avisar(mensagemErro(e), 'erro'); if (vivo) setR({ ts: [], its: [] }); });
    return () => { vivo = false; };
  }, [de, ate, dados.carregadoEm]);
  if (!r) return html`<${Carregando} />`;
  const linhas = r.ts.filter((t) => gestao || meus.has(t.origem_id) || meus.has(t.destino_id)).map((t) => ({ ...t, itens: r.its.filter((i) => i.transferencia_id === t.id) }))
    .filter((t) => contem(`${t.id} ${nomeLocal(dados, t.origem_id)} ${nomeLocal(dados, t.destino_id)} ${t.itens.map((i) => dados.mapa.produto.get(i.produto_id)?.descricao).join(' ')}`, busca));
  const texto = (t) => t.itens.map((i) => `${num(i.quantidade, 3)} ${dados.mapa.produto.get(i.produto_id)?.unidade_estoque} ${dados.mapa.produto.get(i.produto_id)?.descricao}`).join(' · ');
  const pes = (u) => dados.mapa.perfil.get(u)?.nome || '';
  return html`<div class="filtros"><input class="entrada" type="date" value=${de} onChange=${(e) => setDe(e.target.value)} /> até <input class="entrada" type="date" value=${ate} onChange=${(e) => setAte(e.target.value)} />
      <input class="entrada busca" placeholder="Buscar produto, local, nº" value=${busca} onInput=${(e) => setBusca(e.target.value)} />
      <${Exportar} titulo="Relatório de transferências" filtros=${`${de} a ${ate}`} arquivo="transferencias" linhas=${linhas} colunas=${[
        { titulo: 'Nº', valor: (t) => t.id }, { titulo: 'Situação', valor: (t) => SITUACAO_TRANSF[t.situacao] },
        { titulo: 'Origem', valor: (t) => nomeLocal(dados, t.origem_id) }, { titulo: 'Destino', valor: (t) => nomeLocal(dados, t.destino_id) },
        { titulo: 'Itens', valor: texto, largura: 50 },
        { titulo: 'Enviado', valor: (t) => t.itens.reduce((s, i) => s + Number(i.quantidade), 0), num: true },
        { titulo: 'Recebido', valor: (t) => t.itens.reduce((s, i) => s + Number(i.recebido || 0), 0), num: true },
        { titulo: 'Separou', valor: (t) => `${pes(t.separado_por)} ${dataHora(t.separado_em)}` }, { titulo: 'Enviou', valor: (t) => (t.enviado_em ? `${pes(t.enviado_por)} ${dataHora(t.enviado_em)}` : '') },
        { titulo: 'Recebeu', valor: (t) => (t.recebido_em ? `${pes(t.recebido_por)} ${dataHora(t.recebido_em)}` : '') },
        { titulo: 'Cancelou', valor: (t) => (t.cancelado_em ? `${pes(t.cancelado_por)} · ${t.cancelado_motivo}` : '') }]} /></div>
    <${Tabela} linhas=${linhas} aoClicar=${(t) => aoAbrir(t.id)} vazio="Nenhuma transferência no período." colunas=${[
      { chave: 'id', titulo: 'Nº', num: true },
      { chave: 'sep', titulo: 'Data', valor: (t) => t.separado_em, render: (t) => dataHora(t.separado_em) },
      { chave: 'sit', titulo: 'Situação', valor: (t) => t.situacao, render: (t) => html`<${Etiqueta} cor=${COR[t.situacao]}>${SITUACAO_TRANSF[t.situacao]}</${Etiqueta}>` },
      { chave: 'rota', titulo: 'Origem → destino', render: (t) => html`${nomeLocal(dados, t.origem_id)} → <b>${nomeLocal(dados, t.destino_id)}</b>` },
      { chave: 'it', titulo: 'Itens', render: (t) => html`<small>${texto(t)}</small>` },
      { chave: 'quem', titulo: 'Recebeu', render: (t) => html`<small>${pes(t.recebido_por)}</small>` },
    ]} />`;
}
