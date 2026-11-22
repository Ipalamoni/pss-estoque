// =====================================================================
// REQUISIÇÕES (embalagens: o PCP pede em kg/bobinas, o almoxarifado separa e envia)
// + CONSUMO NO SETOR (baixa manual por bobina ou por kg)
// =====================================================================
import { html, useState, useEffect, useApp, Cabecalho, Abas, Tabela, Etiqueta, Modal, Campo, Numero, Escolher, Vazio, Carregando, useAcao, confirmar, avisar, n } from '../ui.js';
import { num, qu, dataHora, hojeISO, somarDias, operaLocal, pode, SITUACAO_REQ, mensagemErro, contem } from '../util.js';
import { Icone } from '../icones.js';
import { nomeLocal, saldoLocal, localTipo, minutos, tempoTexto, horaDia } from '../producao-util.js';
import { Exportar } from '../exportar.js';

const COR = { pendente: 'laranja', parcial: 'azul', atendida: 'verde', encerrada: 'cinza', cancelada: 'cinza' };
const inicioDia = (iso) => new Date(iso + 'T00:00:00').toISOString();
const mediaBobina = (s) => (s && s.qtd2 > 0 ? s.disponivel / s.qtd2 : null);

export function TelaRequisicoes() {
  const { dados, papeis, estadoRota, setEstadoRota } = useApp();
  const admin = papeis.includes('admin');
  const meus = new Set(dados.locais.filter((l) => operaLocal(papeis, l)).map((l) => l.id));
  const podePedir = pode(papeis, 'requisicao');
  const podeConsumir = pode(papeis, 'consumo');
  const comItens = (r) => ({ ...r, itens: dados.reqItens.filter((i) => i.requisicao_id === r.id) });
  const atender = dados.requisicoes.filter((r) => admin || meus.has(r.origem_id)).map(comItens);
  const minhas = dados.requisicoes.filter((r) => podePedir || meus.has(r.destino_id)).map(comItens);
  const abas = [
    ...(atender.length || !podePedir ? [{ id: 'atender', titulo: `A atender (${atender.length})` }] : []),
    ...(podePedir ? [{ id: 'minhas', titulo: `Pedidas em aberto (${minhas.length})` }] : []),
    ...(podeConsumir ? [{ id: 'consumo', titulo: 'Consumo no setor' }] : []),
    { id: 'historico', titulo: 'Histórico' },
  ];
  const [aba, setAba] = useState(abas[0].id);
  const [nova, setNova] = useState(false);
  const [atendendo, setAtendendo] = useState(null);
  useEffect(() => { if (estadoRota?.abrir?.id) { const r = atender.find((x) => x.id === estadoRota.abrir.id); if (r) { setAba('atender'); setAtendendo(r.id); } setEstadoRota(null); } }, []);
  return html`
    <${Cabecalho} titulo="Requisições" sub="O PCP pede o material (ex.: bobinas de embalagem), o almoxarifado separa e envia, o PCP recebe e dá baixa no consumo.">
      ${podePedir && html`<button class="btn btn-pri" onClick=${() => setNova(true)}><${Icone} nome="mais" tam=${16} /> Nova requisição</button>`}
    </${Cabecalho}>
    <${Abas} abas=${abas} ativa=${aba} aoMudar=${setAba} />
    ${aba === 'atender' && (!atender.length ? html`<${Vazio} texto="Nenhuma requisição esperando atendimento." />`
      : html`<div class="lista-transf">${atender.map((r) => html`<${CartaoReq} r=${r} key=${r.id} acao=${html`<button class="btn btn-pri btn-grande" onClick=${() => setAtendendo(r.id)}>Separar e enviar</button>`} />`)}</div>`)}
    ${aba === 'minhas' && (!minhas.length ? html`<${Vazio} texto="Nenhuma requisição em aberto. Toque em “Nova requisição” para pedir material." />`
      : html`<div class="lista-transf">${minhas.map((r) => html`<${CartaoReq} r=${r} key=${r.id} />`)}</div>`)}
    ${aba === 'consumo' && html`<${Consumo} />`}
    ${aba === 'historico' && html`<${Historico} />`}
    ${nova && html`<${NovaRequisicao} aoFechar=${() => setNova(false)} />`}
    ${atendendo && html`<${Atender} r=${atender.find((x) => x.id === atendendo)} aoFechar=${() => setAtendendo(null)} />`}`;
}

function CartaoReq({ r, acao }) {
  const { dados, api, papeis, recarregar } = useApp();
  const [ocupado, executar] = useAcao();
  const podeEncerrar = pode(papeis, 'requisicao') || operaLocal(papeis, dados.mapa.local.get(r.origem_id));
  const chegando = dados.transferencias.filter((t) => t.requisicao_id === r.id && t.situacao !== 'recebida');
  async function encerrar() {
    let motivo = '';
    const parcial = r.itens.some((i) => Number(i.atendido) > 0);
    const ok = await confirmar({ titulo: parcial ? 'Encerrar o que falta' : 'Cancelar a requisição', ok: 'Confirmar', perigo: true, cancelar: 'Voltar',
      mensagem: html`<p>${parcial ? 'O que já foi enviado continua valendo; o restante deixa de ser pedido.' : 'A requisição será cancelada.'}</p>
        <${Campo} rotulo="Motivo" obrigatorio><input class="entrada" onInput=${(e) => { motivo = e.target.value; }} /></${Campo}>` });
    if (ok && (await executar(() => api.rpc('cancelar_requisicao', { p_id: r.id, p_motivo: motivo }), 'Pronto.')) !== null) await recarregar(true);
  }
  return html`<div class=${'transf-cartao s-req-' + r.situacao}>
    <div class="transf-topo"><span class="transf-num">Requisição nº ${r.id}</span><${Etiqueta} cor=${COR[r.situacao]}>${SITUACAO_REQ[r.situacao]}</${Etiqueta}>
      <small class="transf-tempo">pedido <b>${horaDia(r.criado_em)}</b> · ${(dados.mapa.perfil.get(r.solicitante_id)?.nome || '').split(' ')[0]}</small></div>
    <div class="transf-rota"><span>Atende: ${nomeLocal(dados, r.origem_id)}</span><span class="seta">→</span><b>${nomeLocal(dados, r.destino_id)}</b></div>
    <ul class="req-itens">${r.itens.map((i) => { const p = dados.mapa.produto.get(i.produto_id); const pct = Math.min(100, (Number(i.atendido) / Number(i.quantidade)) * 100);
      return html`<li><div class="req-linha"><b>${p?.descricao}</b><span>${qu(i.atendido, p?.unidade_estoque)} de ${qu(i.quantidade, p?.unidade_estoque)}${i.qtd2 ? ` (${num(i.qtd2, 0)} ${p?.unidade2 || 'vol.'})` : ''}</span></div>
        <div class="barra-fina"><i style=${`width:${pct}%`}></i></div></li>`; })}</ul>
    ${r.observacao && html`<p class="nota">${r.observacao}</p>`}
    ${chegando.length > 0 && html`<p class="nota azul"><${Icone} nome="caminhao" tam=${14} /> ${chegando.map((t) => `nº ${t.id} ${t.situacao === 'enviada' ? `enviada ${horaDia(t.enviado_em)}` : `separada ${horaDia(t.separado_em)}`}`).join(' · ')}</p>`}
    <div class="transf-acoes">${acao}${podeEncerrar && html`<button class="btn btn-perigo-sec" disabled=${ocupado} onClick=${encerrar}>${r.itens.some((i) => Number(i.atendido) > 0) ? 'Encerrar o que falta' : 'Cancelar'}</button>`}</div>
  </div>`;
}

function NovaRequisicao({ aoFechar }) {
  const { dados, api, recarregar } = useApp();
  const almox = localTipo(dados, 'almoxarifado');
  const pcp = localTipo(dados, 'pcp');
  const [org, setOrg] = useState(almox?.id || null);
  const [dst, setDst] = useState(pcp?.id || null);
  const [linhas, setLinhas] = useState([{ k: 1, produto_id: null, q: '', q2: '' }]);
  const [obs, setObs] = useState('');
  const [ocupado, executar] = useAcao();
  const prods = dados.produtos.filter((p) => p.ativo && p.controla_estoque && p.baixa_requisicao);
  const mudar = (k, ch) => setLinhas((l) => l.map((x) => (x.k === k ? { ...x, ...ch } : x)));
  async function salvar() {
    const itens = linhas.filter((l) => l.produto_id && n(l.q) > 0).map((l) => ({ produto_id: l.produto_id, quantidade: n(l.q), qtd2: l.q2 === '' ? null : n(l.q2) }));
    if (!itens.length) return avisar('Informe pelo menos um item com quantidade.', 'erro');
    if (await executar(() => api.rpc('criar_requisicao', { p: { origem_id: org, destino_id: dst, itens, observacao: obs || null } }), 'Requisição enviada ao almoxarifado.')) { await recarregar(true); aoFechar(); }
  }
  return html`<${Modal} titulo="Nova requisição" aoFechar=${aoFechar} largo
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Voltar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${salvar}>Enviar requisição</button>`}>
    <div class="grade">
      <${Campo} rotulo="Quem atende"><select class="entrada" value=${org} onChange=${(e) => setOrg(Number(e.target.value))}>${dados.locais.filter((l) => l.ativo).map((l) => html`<option value=${l.id}>${nomeLocal(dados, l.id)}</option>`)}</select></${Campo}>
      <${Campo} rotulo="Entregar em"><select class="entrada" value=${dst} onChange=${(e) => setDst(Number(e.target.value))}>${dados.locais.filter((l) => l.ativo && l.id !== org).map((l) => html`<option value=${l.id}>${nomeLocal(dados, l.id)}</option>`)}</select></${Campo}>
    </div>
    ${!prods.length && html`<p class="aviso-amarelo">Nenhum produto está marcado como “baixa por requisição”. Ajuste no cadastro do produto (ex.: as embalagens).</p>`}
    <div class="linhas-itens">${linhas.map((l) => { const p = dados.mapa.produto.get(l.produto_id); const s = p ? saldoLocal(dados, p.id, org) : null;
      return html`<div class="linha-item linha-transf" key=${l.k}>
        <${Escolher} itens=${prods} valor=${l.produto_id} aoMudar=${(id) => mudar(l.k, { produto_id: id })} rotuloDe=${(x) => `${x.codigo} · ${x.descricao}`}
          detalheDe=${(x) => `no ${nomeLocal(dados, org)}: ${qu(saldoLocal(dados, x.id, org).disponivel, x.unidade_estoque)}`} />
        <div class="qtd-un"><${Numero} valor=${l.q} aoMudar=${(v) => mudar(l.k, { q: v })} placeholder=${p ? p.unidade_estoque : 'qtd'} />
          ${p?.unidade2 && html`<${Numero} valor=${l.q2} aoMudar=${(v) => mudar(l.k, { q2: v })} placeholder=${`${p.unidade2}s (opcional)`} />`}</div>
        <button class="btn-icone" onClick=${() => setLinhas((x) => x.filter((y) => y.k !== l.k))}>✕</button>
        ${s && html`<small class="larga">no ${nomeLocal(dados, org)}: ${qu(s.disponivel, p.unidade_estoque)}${p.unidade2 && s.qtd2 ? ` · ${num(s.qtd2, 0)} ${p.unidade2}s` : ''}</small>`}</div>`; })}</div>
    <button class="btn btn-sec btn-peq" onClick=${() => setLinhas((x) => [...x, { k: Math.random(), produto_id: null, q: '', q2: '' }])}>+ Item</button>
    <${Campo} rotulo="Observação"><input class="entrada" value=${obs} onInput=${(e) => setObs(e.target.value)} placeholder="ex.: para a produção de amanhã" /></${Campo}>
  </${Modal}>`;
}

function Atender({ r, aoFechar }) {
  const { dados, api, recarregar } = useApp();
  const [vals, setVals] = useState(() => Object.fromEntries((r?.itens || []).map((i) => {
    const falta = Math.max(0, Number(i.quantidade) - Number(i.atendido));
    return [i.id, { marcado: falta > 0, q: falta > 0 ? String(Number(falta.toFixed(3))).replace('.', ',') : '', q2: '' }];
  })));
  const [enviar, setEnviar] = useState(true);
  const [obs, setObs] = useState('');
  const [ocupado, executar] = useAcao();
  if (!r) return null;
  const mudar = (id, ch) => setVals((v) => ({ ...v, [id]: { ...v[id], ...ch } }));
  async function ok() {
    const itens = r.itens.filter((i) => vals[i.id].marcado && n(vals[i.id].q) > 0).map((i) => ({ produto_id: i.produto_id, quantidade: n(vals[i.id].q),
      unidade: dados.mapa.produto.get(i.produto_id).unidade_estoque, qtd2: vals[i.id].q2 === '' ? null : n(vals[i.id].q2), requisicao_item_id: i.id }));
    if (!itens.length) return avisar('Marque pelo menos um item e informe a quantidade separada.', 'erro');
    const falta = itens.find((it) => { const p = dados.mapa.produto.get(it.produto_id); return p.unidade2 && it.qtd2 == null; });
    if (falta) return avisar(`Informe quantas ${dados.mapa.produto.get(falta.produto_id).unidade2}s de ${dados.mapa.produto.get(falta.produto_id).descricao} foram separadas.`, 'erro');
    if (await executar(() => api.rpc('criar_transferencia', { p: { origem_id: r.origem_id, destino_id: r.destino_id, requisicao_id: r.id, itens, enviar, observacao: obs || r.observacao || null } }),
      enviar ? 'Separado e enviado. O PCP precisa receber.' : 'Separado. Envie quando sair.')) { await recarregar(true); aoFechar(); }
  }
  return html`<${Modal} titulo=${`Atender requisição nº ${r.id}`} aoFechar=${aoFechar} largo
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Voltar</button><button class="btn btn-pri btn-grande" disabled=${ocupado} onClick=${ok}>${enviar ? 'Separar e enviar' : 'Separar'}</button>`}>
    <p>Marque o que vai mandar agora. Pode mandar parte e o resto depois. Para bobinas, pese e conte: o sistema guarda o peso médio.</p>
    <div class="lista-conferencia">${r.itens.map((i) => { const p = dados.mapa.produto.get(i.produto_id); const v = vals[i.id]; const s = saldoLocal(dados, i.produto_id, r.origem_id);
      const falta = Math.max(0, Number(i.quantidade) - Number(i.atendido)); const m = mediaBobina(s);
      return html`<div class=${'conf-item ' + (v.marcado ? 'ok' : 'off')}>
        <label class="conf-cab check"><input type="checkbox" checked=${v.marcado} onChange=${(e) => mudar(i.id, { marcado: e.target.checked })} />
          <b>${p?.descricao}</b><span class="conf-info">pediu ${qu(i.quantidade, p?.unidade_estoque)}${i.qtd2 ? ` (${num(i.qtd2, 0)} ${p?.unidade2})` : ''} · já foi ${qu(i.atendido, p?.unidade_estoque)} · falta ${qu(falta, p?.unidade_estoque)}</span></label>
        ${v.marcado && html`<div class="conf-entrada"><span>Separado</span><${Numero} valor=${v.q} aoMudar=${(x) => mudar(i.id, { q: x })} /><span>${p?.unidade_estoque}</span>
          ${p?.unidade2 && html`<${Numero} valor=${v.q2} aoMudar=${(x) => mudar(i.id, { q2: x })} placeholder="qtd" /><span>${p.unidade2}s</span>`}</div>
          <small class=${s.disponivel < (n(v.q) || 0) ? 'texto-vermelho' : 'texto-cinza'}>Aqui tem ${qu(s.disponivel, p?.unidade_estoque)}${p?.unidade2 && s.qtd2 ? ` em ${num(s.qtd2, 0)} ${p.unidade2}s${m ? ` (média ${num(m, 2)} ${p.unidade_estoque} cada)` : ''}` : ''}</small>`}
      </div>`; })}</div>
    <label class="check destaque"><input type="checkbox" checked=${enviar} onChange=${(e) => setEnviar(e.target.checked)} /> Já sair agora (separar e enviar juntos)</label>
    <${Campo} rotulo="Observação"><input class="entrada" value=${obs} onInput=${(e) => setObs(e.target.value)} /></${Campo}>
  </${Modal}>`;
}

function Consumo() {
  const { dados, papeis, api, recarregar } = useApp();
  const locais = dados.locais.filter((l) => l.ativo && operaLocal(papeis, l));
  const pcp = localTipo(dados, 'pcp');
  const [loc, setLoc] = useState(locais.find((l) => l.id === pcp?.id)?.id || locais[0]?.id || null);
  const [vals, setVals] = useState({});
  const [modo, setModo] = useState({});
  const [obs, setObs] = useState('');
  const [ocupado, executar] = useAcao();
  const prods = dados.produtos.filter((p) => p.ativo && p.controla_estoque && p.baixa_requisicao).map((p) => ({ p, s: saldoLocal(dados, p.id, loc) })).filter((x) => x.s.disponivel > 0.0001 || x.s.qtd2 > 0);
  async function baixar() {
    const itens = prods.filter(({ p }) => n(vals[p.id]) > 0).map(({ p }) => ((modo[p.id] || (p.unidade2 ? 'vol' : 'qtd')) === 'vol'
      ? { produto_id: p.id, qtd2: n(vals[p.id]) } : { produto_id: p.id, quantidade: n(vals[p.id]), unidade: p.unidade_estoque }));
    if (!itens.length) return avisar('Informe quanto foi consumido.', 'erro');
    if (await executar(() => api.rpc('registrar_consumo', { p: { local_id: loc, itens, observacao: obs || null } }), 'Consumo baixado.')) { setVals({}); setObs(''); await recarregar(true); }
  }
  if (!locais.length) return html`<${Vazio} texto="Você não opera nenhum local." />`;
  return html`<div class="cartao-bloco">
    <div class="filtros"><span>Local:</span><select class="entrada" value=${loc} onChange=${(e) => { setLoc(Number(e.target.value)); setVals({}); }}>${locais.map((l) => html`<option value=${l.id}>${nomeLocal(dados, l.id)}</option>`)}</select></div>
    ${!prods.length ? html`<${Vazio} texto="Nada para consumir neste local. O material chega por requisição/transferência." />`
      : html`<div class="lista-consumo">${prods.map(({ p, s }) => { const md = modo[p.id] || (p.unidade2 ? 'vol' : 'qtd'); const m = mediaBobina(s); const v = n(vals[p.id]) || 0;
        const kg = md === 'vol' ? (m ? Math.min(s.disponivel, v * m) : 0) : v;
        return html`<div class="consumo-item" key=${p.id}>
          <div class="consumo-info"><b>${p.descricao}</b><small>tem ${qu(s.disponivel, p.unidade_estoque)}${p.unidade2 ? ` · ${num(s.qtd2, 0)} ${p.unidade2}s${m ? ` · média ${num(m, 2)} ${p.unidade_estoque}` : ''}` : ''}</small></div>
          ${p.unidade2 && html`<div class="seg"><button class=${md === 'vol' ? 'ativo' : ''} onClick=${() => setModo({ ...modo, [p.id]: 'vol' })}>${p.unidade2}s</button><button class=${md === 'qtd' ? 'ativo' : ''} onClick=${() => setModo({ ...modo, [p.id]: 'qtd' })}>${p.unidade_estoque}</button></div>`}
          <div class="passo"><button class="btn-passo" onClick=${() => setVals({ ...vals, [p.id]: String(Math.max(0, v - 1)) })}>−</button>
            <${Numero} valor=${vals[p.id] || ''} aoMudar=${(x) => setVals({ ...vals, [p.id]: x })} placeholder="0" />
            <button class="btn-passo" onClick=${() => setVals({ ...vals, [p.id]: String(v + 1) })}>+</button></div>
          ${v > 0 && md === 'vol' && html`<small class="texto-azul">≈ ${qu(kg, p.unidade_estoque)} pela média</small>`}
        </div>`; })}</div>
        <${Campo} rotulo="Observação (opcional)"><input class="entrada" value=${obs} onInput=${(e) => setObs(e.target.value)} /></${Campo}>
        <button class="btn btn-pri btn-grande" disabled=${ocupado} onClick=${baixar}>Baixar consumo</button>`}
  </div>`;
}

function Historico() {
  const { dados, api } = useApp();
  const [de, setDe] = useState(somarDias(hojeISO(), -30));
  const [ate, setAte] = useState(hojeISO());
  const [busca, setBusca] = useState('');
  const [r, setR] = useState(null);
  useEffect(() => {
    let vivo = true; setR(null);
    api.listar('requisicoes', { campoData: 'criado_em', desde: inicioDia(de), ate: inicioDia(somarDias(ate, 1)), ordem: ['id', 'desc'] })
      .then(async (rs) => { const its = rs.length ? await api.listar('requisicao_itens', { em: { requisicao_id: rs.map((x) => x.id) } }) : []; if (vivo) setR({ rs, its }); })
      .catch((e) => { avisar(mensagemErro(e), 'erro'); if (vivo) setR({ rs: [], its: [] }); });
    return () => { vivo = false; };
  }, [de, ate, dados.carregadoEm]);
  if (!r) return html`<${Carregando} />`;
  const texto = (x) => x.itens.map((i) => { const p = dados.mapa.produto.get(i.produto_id); return `${p?.descricao}: ${num(i.atendido, 3)}/${num(i.quantidade, 3)} ${p?.unidade_estoque}`; }).join(' · ');
  const linhas = r.rs.map((x) => ({ ...x, itens: r.its.filter((i) => i.requisicao_id === x.id) })).filter((x) => contem(`${x.id} ${texto(x)} ${x.observacao || ''}`, busca));
  return html`<div class="filtros"><input class="entrada" type="date" value=${de} onChange=${(e) => setDe(e.target.value)} /> até <input class="entrada" type="date" value=${ate} onChange=${(e) => setAte(e.target.value)} />
      <input class="entrada busca" placeholder="Buscar" value=${busca} onInput=${(e) => setBusca(e.target.value)} />
      <${Exportar} titulo="Relatório de requisições" filtros=${`${de} a ${ate}`} arquivo="requisicoes" linhas=${linhas} colunas=${[
        { titulo: 'Nº', valor: (x) => x.id }, { titulo: 'Data', valor: (x) => dataHora(x.criado_em) }, { titulo: 'Situação', valor: (x) => SITUACAO_REQ[x.situacao] },
        { titulo: 'Pediu', valor: (x) => dados.mapa.perfil.get(x.solicitante_id)?.nome || '' }, { titulo: 'Atende', valor: (x) => nomeLocal(dados, x.origem_id) },
        { titulo: 'Para', valor: (x) => nomeLocal(dados, x.destino_id) }, { titulo: 'Itens (atendido/pedido)', valor: texto, largura: 60 }, { titulo: 'Motivo encerramento', valor: (x) => x.encerrada_motivo || '' }]} /></div>
    <${Tabela} linhas=${linhas} vazio="Nenhuma requisição no período." colunas=${[
      { chave: 'id', titulo: 'Nº', num: true }, { chave: 'criado_em', titulo: 'Data', render: (x) => dataHora(x.criado_em) },
      { chave: 'sit', titulo: 'Situação', valor: (x) => x.situacao, render: (x) => html`<${Etiqueta} cor=${COR[x.situacao]}>${SITUACAO_REQ[x.situacao]}</${Etiqueta}>` },
      { chave: 'quem', titulo: 'Pediu', render: (x) => dados.mapa.perfil.get(x.solicitante_id)?.nome || '' },
      { chave: 'it', titulo: 'Itens', render: (x) => html`<small>${texto(x)}</small>` },
    ]} />`;
}
