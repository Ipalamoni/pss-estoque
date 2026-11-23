// Inventário: contagem física pelo celular e ajuste das diferenças
import { html, useRascunho, useState, useMemo, useEffect, useApp, Modal, Campo, QtdUnidade, Busca, Etiqueta, Cabecalho, Abas, Tabela, Carregando, useAcao, confirmar, avisar, n, Filtros } from '../ui.js';
import { CATEGORIAS, MOTIVOS_INVENTARIO, qtd, moeda, num, contem, fator, qtdDupla, dataHora, mensagemErro, qu, plural, pl, nomeUsuario, hojeISO } from '../util.js';
import { Exportar } from '../exportar.js';
import { SeletorLocal, useLocalInicial } from '../producao-util.js';

export function TelaInventario() {
  const [aba, setAba] = useState('contagem');
  return html`
    <${Cabecalho} titulo="Inventário" sub="Conte o que existe fisicamente; o sistema calcula a diferença e registra o ajuste" />
    <${Abas} abas=${[{ id: 'contagem', titulo: 'Nova contagem' }, { id: 'historico', titulo: 'Contagens anteriores' }]} ativa=${aba} aoMudar=${setAba} />
    ${aba === 'contagem' ? html`<${Contagem} aoConcluir=${() => setAba('historico')} />` : html`<${Historico} />`}`;
}

function Contagem({ aoConcluir }) {
  const { dados, recarregar, api } = useApp();
  const [cats, setCats] = useState(new Set(['materia_prima']));
  const [busca, setBusca] = useState('');
  const [so, setSo] = useState(false);
  const [ocupado, executar] = useAcao();
  const [loc, setLoc] = useLocalInicial('almoxarifado');
  // rascunho automático por local: fechar o app, trocar de tela ou de local não perde a contagem
  const recuperou = (t) => avisar(`Contagem recuperada (rascunho de ${dataHora(new Date(t))}). Continue de onde parou.`, 'aviso');
  const [cont, setCont, limparCont] = useRascunho(`inventario:${loc || ''}`, {}, { aoRecuperar: recuperou });   // produto_id -> { q, un, motivo, obs }
  const [obsGeral, setObsGeral, limparObs] = useRascunho(`inventario-obs:${loc || ''}`, '');
  const mpBase = dados.mapa.ind;
  // saldo físico NO LOCAL (disponível + separado) — o inventário é por local
  const aqui = (p) => { const e = dados.mapa.saldoLocal.get(`${p.id}|${loc}`); return e ? Number(e.disponivel) + Number(e.separado) : 0; };
  const mp = useMemo(() => new Map([...mpBase].map(([id, p]) => [id, { ...p, saldo: loc ? aqui(p) : p.saldo }])), [dados, loc]);

  const itens = useMemo(() => [...mp.values()].filter((p) => p.ativo && p.controla_estoque !== false && cats.has(p.categoria) && contem(`${p.codigo} ${p.descricao}`, busca)
    && (!so || cont[p.id]?.q)).sort((a, b) => a.descricao.localeCompare(b.descricao)), [mp, cats, busca, so, cont]);
  const mudar = (id, ch) => setCont((c) => ({ ...c, [id]: { un: mp.get(id).unidade_compra || mp.get(id).unidade_estoque, ...c[id], ...ch } }));
  const dif = (p) => { const c = cont[p.id]; if (!c || c.q === '' || c.q === undefined || n(c.q) === null) return null; return Math.round((n(c.q) * fator(p, c.un) - p.saldo) * 10000) / 10000; };
  const contados = Object.entries(cont).filter(([, c]) => c.q !== '' && c.q !== undefined && n(c.q) !== null);
  const comDif = contados.filter(([id]) => dif(mp.get(Number(id))) !== 0);
  const valorDif = comDif.reduce((s, [id]) => { const p = mp.get(Number(id)); return s + dif(p) * p.custo_medio; }, 0);
  const alternar = (k) => setCats((s) => { const x = new Set(s); x.has(k) ? x.delete(k) : x.add(k); return x; });

  async function finalizar() {
    const faltaMotivo = comDif.find(([id, c]) => !c.motivo || (c.motivo === 'outros' && !(c.obs || '').trim()));
    if (faltaMotivo) return avisar(`Informe o motivo da diferença de ${mp.get(Number(faltaMotivo[0])).descricao}${faltaMotivo[1].motivo === 'outros' ? ' (em “outros”, escreva a observação)' : ''}.`, 'erro');
    const ok = await confirmar({ titulo: 'Finalizar contagem', ok: 'Registrar inventário', mensagem: html`
      <p><b>${pl(contados.length, 'item contado', 'itens contados')}</b>, <b>${comDif.length}</b> com diferença.</p>
      ${comDif.length > 0 && html`<ul class="lista-simples">${comDif.map(([id, c]) => { const p = mp.get(Number(id)); const d = dif(p);
        return html`<li>${p.descricao}: <b class=${d < 0 ? 'texto-vermelho' : 'texto-verde'}>${d > 0 ? '+' : ''}${qu(d, p.unidade_estoque)}</b> (${MOTIVOS_INVENTARIO[c.motivo]})</li>`; })}</ul>
        <p>Valor das diferenças: <b>${moeda(valorDif)}</b></p>`}
      <p class="nota">As diferenças viram lançamentos de “Ajuste de inventário”, com seu usuário, data e hora.</p>` });
    if (!ok) return;
    const r = await executar(() => api.rpc('registrar_inventario', { p: { observacao: obsGeral, local_id: loc, itens: contados.map(([id, c]) => ({ produto_id: Number(id), contado: n(c.q), unidade: c.un, motivo: c.motivo || null, observacao: c.obs || null })) } }),
      'Inventário registrado e estoque ajustado.');
    if (r) { limparCont(); limparObs(); setCont({}); setObsGeral(''); await recarregar(); aoConcluir(); }
  }

  return html`
    <div class="filtros"><${SeletorLocal} valor=${loc} aoMudar=${(v) => setLoc(v)} rotulo="Contando o local" /></div>
    <${Filtros} ativos=${cats.size < Object.keys(CATEGORIAS).length ? 1 : 0} fixo=${html`<${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Buscar item" />`}>
      <div class="grupo-checks">${Object.entries(CATEGORIAS).map(([k, v]) => html`<label class="check"><input type="checkbox" checked=${cats.has(k)} onChange=${() => alternar(k)} /> ${v}</label>`)}</div>
    </${Filtros}>
    <div class="filtros">
      <${Exportar} titulo="Folha de contagem de estoque" filtros=${`${pl(itens.length, 'item', 'itens')} · ${dataHora(new Date())}`} arquivo=${`folha-contagem-${hojeISO()}`} linhas=${itens} paisagem=${false}
        colunas=${[{ titulo: 'Código', valor: (p) => p.codigo }, { titulo: 'Produto', valor: (p) => p.descricao, largura: 38 }, { titulo: 'Unid.', valor: (p) => p.unidade_compra || p.unidade_estoque },
          { titulo: 'No sistema', valor: (p) => Math.round(p.saldo * 1000) / 1000, texto: (p) => qtdDupla(p, p.saldo), num: true },
          { titulo: 'Contado', valor: (p) => (cont[p.id]?.q ? n(cont[p.id].q) : ''), texto: (p) => (cont[p.id]?.q ? `${cont[p.id].q} ${cont[p.id].un}` : '________'), num: true },
          { titulo: 'Observação', valor: () => '', texto: () => '' }]} />
      <label class="check"><input type="checkbox" checked=${so} onChange=${(e) => setSo(e.target.checked)} /> Só os já contados</label>
    </div>
    <div class="lista-conferencia">
      ${itens.map((p) => { const c = cont[p.id] || {}; const d = dif(p);
        return html`<div class=${'conf-item' + (d === 0 ? ' ok' : d ? ' dif' : '')} key=${p.id}>
          <div class="conf-cab"><b>${p.descricao}</b><small>${p.codigo}</small></div>
          <div class="conf-info">No sistema: <b>${qtdDupla(p, p.saldo)}</b></div>
          <div class="conf-entrada"><span>Contado:</span>
            <${QtdUnidade} produto=${p} valor=${c.q ?? ''} unidade=${c.un || p.unidade_compra || p.unidade_estoque} aoMudar=${(v, u) => mudar(p.id, { q: v, un: u })} /></div>
          ${d !== null && (d === 0 ? html`<div class="conf-ok">✓ Confere</div>` : html`
            <div class="conf-dif">Diferença: <b>${d > 0 ? '+' : ''}${qu(d, p.unidade_estoque)}</b>${p.unidade_compra ? ` (${qu(d / p.fator_compra, p.unidade_compra, 2)})` : ''} · ${moeda(d * p.custo_medio)}</div>
            <div class="conf-motivo">
              <select class="entrada" value=${c.motivo || ''} onChange=${(e) => mudar(p.id, { motivo: e.target.value })}>
                <option value="">Motivo da diferença…</option>
                ${Object.entries(MOTIVOS_INVENTARIO).map(([k, v]) => html`<option value=${k}>${v}</option>`)}
              </select>
              <input class="entrada" placeholder=${c.motivo === 'outros' ? 'Observação (obrigatória)' : 'Observação'} value=${c.obs || ''} onInput=${(e) => mudar(p.id, { obs: e.target.value })} />
            </div>`)}
        </div>`; })}
    </div>
    <${Campo} rotulo="Observação geral da contagem"><input class="entrada" value=${obsGeral} onInput=${(e) => setObsGeral(e.target.value)} placeholder="ex.: contagem semanal da câmara" /></${Campo}>
    <div class="barra-acao fixa">
      <span><b>${pl(contados.length, 'contado', 'contados')}</b> · <b>${comDif.length}</b> com diferença · ${moeda(valorDif)}</span>
      <button class="btn btn-pri" disabled=${ocupado || !contados.length} onClick=${finalizar}>${ocupado ? 'Registrando…' : 'Finalizar contagem'}</button>
    </div>`;
}

function Historico() {
  const { dados, api } = useApp();
  const [invs, setInvs] = useState(null);
  const [itens, setItens] = useState([]);
  const [aberto, setAberto] = useState(null);
  useEffect(() => {
    // DESEMPENHO: só os itens das 200 contagens mostradas (antes baixava os itens de TODAS as contagens a cada atualização)
    api.listar('inventarios', { ordem: ['id', 'desc'], limite: 200 }).then(async (a) => {
      const ids = a.map((x) => x.id); const partes = [];
      for (let i = 0; i < ids.length; i += 150) partes.push(ids.slice(i, i + 150));
      const b = (await Promise.all(partes.map((pt) => api.listar('inventario_itens', { em: { inventario_id: pt } })))).flat();
      return [a, b];
    })
      .then(([a, b]) => { setInvs(a); setItens(b); }).catch((e) => { avisar(mensagemErro(e), 'erro'); setInvs([]); });
  }, [dados.carregadoEm]);
  if (!invs) return html`<${Carregando} />`;
  const porInv = useMemo(() => { const m = new Map(); itens.forEach((i) => { const l = m.get(i.inventario_id); if (l) l.push(i); else m.set(i.inventario_id, [i]); }); return m; }, [itens]);
  const de = (id) => porInv.get(id) || [];
  const valor = (id) => de(id).reduce((s, i) => s + Number(i.diferenca) * Number(dados.mapa.produto.get(i.produto_id)?.custo_medio || 0), 0);
  const inv = aberto && invs.find((x) => x.id === aberto);
  return html`
    <${Tabela} linhas=${invs} aoClicar=${(x) => setAberto(x.id)} vazio="Nenhuma contagem registrada ainda." colunas=${[
      { chave: 'id', titulo: 'Nº', num: true },
      { chave: 'data_hora', titulo: 'Data/hora', render: (x) => dataHora(x.data_hora) },
      { chave: 'u', titulo: 'Responsável', render: (x) => nomeUsuario(dados.mapa.perfil.get(x.usuario_id)) },
      { chave: 'n', titulo: 'Itens contados', num: true, valor: (x) => de(x.id).length, render: (x) => de(x.id).length },
      { chave: 'd', titulo: 'Com diferença', num: true, valor: (x) => de(x.id).filter((i) => Number(i.diferenca) !== 0).length, render: (x) => de(x.id).filter((i) => Number(i.diferenca) !== 0).length },
      { chave: 'v', titulo: 'Valor aprox. das diferenças', num: true, valor: (x) => valor(x.id), render: (x) => moeda(valor(x.id)) },
      { chave: 'observacao', titulo: 'Observação' },
    ]} />
    <p class="nota">Valor aproximado pelo custo médio atual.</p>
    ${inv && html`<${Modal} titulo=${`Inventário nº ${inv.id} · ${dataHora(inv.data_hora)}`} aoFechar=${() => setAberto(null)} largo>
      <div class="filtros"><span>Responsável: <b>${nomeUsuario(dados.mapa.perfil.get(inv.usuario_id))}</b></span>
        <${Exportar} titulo=${`Inventário nº ${inv.id}`} filtros=${`${dataHora(inv.data_hora)} · ${nomeUsuario(dados.mapa.perfil.get(inv.usuario_id))}`} arquivo=${`inventario-${inv.id}`} linhas=${de(inv.id)}
          colunas=${[{ titulo: 'Código', valor: (i) => dados.mapa.produto.get(i.produto_id)?.codigo }, { titulo: 'Produto', valor: (i) => dados.mapa.produto.get(i.produto_id)?.descricao, largura: 34 },
            { titulo: 'Sistema', valor: (i) => Number(i.saldo_sistema), num: true }, { titulo: 'Contado', valor: (i) => Number(i.contado), num: true },
            { titulo: 'Diferença', valor: (i) => Number(i.diferenca), num: true }, { titulo: 'Unid.', valor: (i) => dados.mapa.produto.get(i.produto_id)?.unidade_estoque },
            { titulo: 'Motivo', valor: (i) => MOTIVOS_INVENTARIO[i.motivo] || '' }, { titulo: 'Observação', valor: (i) => i.observacao, largura: 30 }]} /></div>
      <${Tabela} linhas=${de(inv.id)} colunas=${[
        { chave: 'p', titulo: 'Produto', valor: (i) => dados.mapa.produto.get(i.produto_id)?.descricao, render: (i) => dados.mapa.produto.get(i.produto_id)?.descricao },
        { chave: 'saldo_sistema', titulo: 'Sistema', num: true, render: (i) => `${qu(i.saldo_sistema, dados.mapa.produto.get(i.produto_id)?.unidade_estoque)}` },
        { chave: 'contado', titulo: 'Contado', num: true, render: (i) => qtd(i.contado) },
        { chave: 'diferenca', titulo: 'Diferença', num: true, render: (i) => html`<b class=${i.diferenca < 0 ? 'texto-vermelho' : i.diferenca > 0 ? 'texto-verde' : ''}>${i.diferenca > 0 ? '+' : ''}${qtd(i.diferenca)}</b>` },
        { chave: 'motivo', titulo: 'Motivo', render: (i) => (i.motivo ? html`<${Etiqueta} cor="laranja">${MOTIVOS_INVENTARIO[i.motivo]}</${Etiqueta}>` : '') },
        { chave: 'observacao', titulo: 'Observação' },
      ]} />
    </${Modal}>`}`;
}
