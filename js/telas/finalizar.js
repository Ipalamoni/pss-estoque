// =====================================================================
// FINALIZAR BATELADAS (engenharia, normalmente à tarde, todas juntas)
// Lista na ordem de produção, rendimento editável na última coluna, finaliza 1, algumas ou todas.
// =====================================================================
import { html, useState, useEffect, useApp, Cabecalho, Abas, Tabela, Etiqueta, Campo, Numero, Vazio, Carregando, useAcao, confirmar, avisar, n } from '../ui.js';
import { num, dataHora, hojeISO, somarDias, pode, mensagemErro } from '../util.js';
import { Icone } from '../icones.js';
import { minutos, tempoTexto, diaDe } from '../producao-util.js';
import { Exportar } from '../exportar.js';

const hora = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const inicioDia = (iso) => new Date(iso + 'T00:00:00').toISOString();

export function TelaFinalizar() {
  const [aba, setAba] = useState('abertas');
  return html`
    <${Cabecalho} titulo="Finalizar bateladas" sub="Confira quanto cada batelada rendeu e finalize. O estoque da embalagem e o custo do produto saem daqui." />
    <${Abas} abas=${[{ id: 'abertas', titulo: 'Em produção' }, { id: 'finalizadas', titulo: 'Finalizadas' }]} ativa=${aba} aoMudar=${setAba} />
    ${aba === 'abertas' ? html`<${Abertas} />` : html`<${Finalizadas} />`}`;
}

function Abertas() {
  const { dados, api, papeis, recarregar } = useApp();
  const [lista, setLista] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [rend, setRend] = useState({});
  const [filtroMac, setFiltroMac] = useState('');
  const [ocupado, executar] = useAcao();
  const prazo = Number(dados.params.producao_prazo_finalizar_h || 12) * 60;
  const podeFin = pode(papeis, 'finalizar_batelada');
  useEffect(() => {
    let vivo = true;
    api.listar('bateladas', { eq: { situacao: 'em_producao' }, ordem: ['iniciada_em', 'asc'] })
      .then((l) => { if (!vivo) return; setLista(l);
        setRend((r) => { const x = { ...r }; l.forEach((b) => { if (x[b.id] === undefined) x[b.id] = b.rendimento_padrao != null ? String(Number(b.rendimento_padrao)).replace('.', ',') : ''; }); return x; });
        setSel((s) => new Set([...s].filter((id) => l.some((b) => b.id === id)))); })
      .catch((e) => { avisar(mensagemErro(e), 'erro'); if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, [dados.carregadoEm]);
  if (!lista) return html`<${Carregando} />`;
  const vis = lista.filter((b) => !filtroMac || String(b.maceira_id) === filtroMac);
  const todos = vis.length > 0 && vis.every((b) => sel.has(b.id));
  const ficha = (b) => dados.mapa.ficha.get(b.ficha_id);
  const atrasadas = vis.filter((b) => minutos(b.iniciada_em) > prazo).length;
  const alterou = (b) => b.rendimento_padrao != null && Math.abs((n(rend[b.id]) ?? 0) - Number(b.rendimento_padrao)) > 0.0001;
  async function finalizar(ids) {
    const bs = lista.filter((b) => ids.includes(b.id));
    const semQtd = bs.find((b) => n(rend[b.id]) == null);
    if (semQtd) return avisar(`Digite quanto rendeu a batelada nº ${semQtd.id} (${ficha(semQtd)?.nome}).`, 'erro');
    const total = bs.reduce((s, b) => s + (n(rend[b.id]) || 0), 0);
    if (bs.length > 1 && !(await confirmar({ titulo: `Finalizar ${bs.length} bateladas`, ok: 'Finalizar', cancelar: 'Voltar',
      mensagem: html`<p>Total produzido: <b>${num(total, 0)}</b>. ${bs.filter(alterou).length ? `${bs.filter(alterou).length} com rendimento diferente do padrão.` : 'Todas no rendimento padrão.'}</p>` }))) return;
    const r = await executar(() => api.rpc('finalizar_bateladas', { p: { itens: bs.map((b) => ({ id: b.id, quantidade: n(rend[b.id]) })) } }),
      bs.length > 1 ? `${bs.length} bateladas finalizadas.` : 'Batelada finalizada.');
    if (r !== null) { setSel(new Set()); await recarregar(true); }
  }
  async function cancelar(b) {
    let motivo = '';
    const ok = await confirmar({ titulo: `Cancelar a batelada nº ${b.id}`, ok: 'Cancelar batelada', perigo: true, cancelar: 'Voltar',
      mensagem: html`<p>Use só se foi iniciada por engano. A farinha, o fermento e a mistura voltam para o estoque.</p>
        <${Campo} rotulo="Motivo" obrigatorio><input class="entrada" onInput=${(e) => { motivo = e.target.value; }} /></${Campo}>` });
    if (ok && (await executar(() => api.rpc('cancelar_batelada', { p_id: b.id, p_motivo: motivo }), 'Batelada cancelada.')) !== null) await recarregar(true);
  }
  const macs = [...new Set(lista.map((b) => b.maceira_id))].map((id) => dados.mapa.maceira.get(id)).filter(Boolean);
  return html`
    ${atrasadas > 0 && html`<div class="alerta-faixa laranja"><${Icone} nome="relogio" tam=${18} /> ${atrasadas} batelada(s) iniciada(s) há mais de ${tempoTexto(prazo)} ainda sem finalizar.</div>`}
    <div class="filtros fin-barra">
      <select class="entrada" value=${filtroMac} onChange=${(e) => setFiltroMac(e.target.value)}><option value="">Todas as maceiras</option>${macs.map((m) => html`<option value=${m.id}>${m.nome}</option>`)}</select>
      <span class="flex1"></span>
      ${podeFin && html`<button class="btn btn-sec" disabled=${ocupado || !sel.size} onClick=${() => finalizar([...sel])}>Finalizar selecionadas (${sel.size})</button>
        <button class="btn btn-pri" disabled=${ocupado || !vis.length} onClick=${() => finalizar(vis.map((b) => b.id))}><${Icone} nome="finalizar" tam=${16} /> Finalizar todas (${vis.length})</button>`}
    </div>
    ${!vis.length ? html`<${Vazio} texto="Nenhuma batelada em produção. Quando o padeiro iniciar, ela aparece aqui." />` : html`
    <div class="tabela-rolagem"><table class="tabela fin-tabela">
      <thead><tr>
        ${podeFin && html`<th class="col-check"><input type="checkbox" checked=${todos} onChange=${(e) => setSel(e.target.checked ? new Set(vis.map((b) => b.id)) : new Set())} /></th>`}
        <th>Nº</th><th>Início</th><th>Maceira</th><th>Padeiro</th><th>Receita</th><th class="n">Padrão</th><th class="n col-rend">Rendeu</th>${podeFin && html`<th></th>`}
      </tr></thead>
      <tbody>${vis.map((b) => { const f = ficha(b); const m = minutos(b.iniciada_em); const alt = alterou(b);
        return html`<tr key=${b.id} class=${(sel.has(b.id) ? 'sel ' : '') + (m > prazo ? 'linha-alerta' : '')}>
          ${podeFin && html`<td class="col-check"><input type="checkbox" checked=${sel.has(b.id)} onChange=${(e) => { const s = new Set(sel); e.target.checked ? s.add(b.id) : s.delete(b.id); setSel(s); }} /></td>`}
          <td class="n">${b.id}</td>
          <td><b>${hora(b.iniciada_em)}</b>${diaDe(b.iniciada_em) !== hojeISO() ? html` <small>${dataHora(b.iniciada_em).slice(0, 5)}</small>` : ''}<br /><small class="texto-cinza">há ${tempoTexto(m)}</small></td>
          <td>${dados.mapa.maceira.get(b.maceira_id)?.nome || '–'}</td>
          <td>${dados.mapa.operador.get(b.operador_id)?.nome || '–'}</td>
          <td><b>${f?.codigo}</b> ${f?.nome}${(b.itens || []).some((i) => i.trocou_de) ? html` <${Etiqueta} cor="roxo" titulo="O padeiro trocou a marca da farinha">trocou farinha</${Etiqueta}>` : ''}</td>
          <td class="n">${b.rendimento_padrao != null ? `${num(b.rendimento_padrao, 0)} ${f?.rendimento_unidade || ''}` : '–'}</td>
          <td class="n col-rend">${podeFin ? html`<div class=${'rend-campo' + (alt ? ' alterado' : '')}><${Numero} valor=${rend[b.id] ?? ''} aoMudar=${(v) => setRend({ ...rend, [b.id]: v })} />
              ${alt && html`<small>${(n(rend[b.id]) || 0) > Number(b.rendimento_padrao) ? '+' : ''}${num((n(rend[b.id]) || 0) - Number(b.rendimento_padrao), 0)}</small>`}</div>` : num(b.rendimento_padrao, 0)}</td>
          ${podeFin && html`<td class="acoes-linha"><button class="btn btn-pri btn-peq" disabled=${ocupado} onClick=${() => finalizar([b.id])}>Finalizar</button>
            <button class="btn-icone" title="Cancelar batelada (iniciada por engano)" disabled=${ocupado} onClick=${() => cancelar(b)}>✕</button></td>`}
        </tr>`; })}</tbody>
      <tfoot><tr>${podeFin && html`<td></td>`}<td colspan="5"><b>${vis.length} batelada(s)</b></td>
        <td class="n">${num(vis.reduce((s, b) => s + Number(b.rendimento_padrao || 0), 0), 0)}</td>
        <td class="n col-rend"><b>${num(vis.reduce((s, b) => s + (n(rend[b.id]) || 0), 0), 0)}</b></td>${podeFin && html`<td></td>`}</tr></tfoot>
    </table></div>`}`;
}

function Finalizadas() {
  const { dados, api } = useApp();
  const [de, setDe] = useState(hojeISO());
  const [ate, setAte] = useState(hojeISO());
  const [lista, setLista] = useState(null);
  useEffect(() => {
    let vivo = true; setLista(null);
    api.listar('bateladas', { campoData: 'iniciada_em', desde: inicioDia(de), ate: inicioDia(somarDias(ate, 1)), ordem: ['iniciada_em', 'asc'] })
      .then((l) => { if (vivo) setLista(l.filter((b) => b.situacao !== 'em_producao')); })
      .catch((e) => { avisar(mensagemErro(e), 'erro'); if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, [de, ate, dados.carregadoEm]);
  const f = (b) => dados.mapa.ficha.get(b.ficha_id);
  const pes = (u) => dados.mapa.perfil.get(u)?.nome || '';
  const dif = (b) => (b.situacao === 'finalizada' && b.rendimento_padrao != null ? Number(b.quantidade_produzida) - Number(b.rendimento_padrao) : null);
  const colunasExp = [
    { titulo: 'Nº', valor: (b) => b.id }, { titulo: 'Início', valor: (b) => dataHora(b.iniciada_em) }, { titulo: 'Maceira', valor: (b) => dados.mapa.maceira.get(b.maceira_id)?.nome || '' },
    { titulo: 'Padeiro', valor: (b) => dados.mapa.operador.get(b.operador_id)?.nome || '' }, { titulo: 'Receita', valor: (b) => `${f(b)?.codigo} ${f(b)?.nome}` },
    { titulo: 'Situação', valor: (b) => (b.situacao === 'finalizada' ? 'Finalizada' : 'Cancelada') },
    { titulo: 'Padrão', valor: (b) => Number(b.rendimento_padrao || 0), num: true }, { titulo: 'Produzido', valor: (b) => Number(b.quantidade_produzida || 0), num: true },
    { titulo: 'Diferença', valor: (b) => dif(b) ?? '', num: true }, { titulo: 'Finalizou', valor: (b) => `${pes(b.finalizada_por)} ${b.finalizada_em ? dataHora(b.finalizada_em) : ''}` },
    { titulo: 'Motivo cancelamento', valor: (b) => b.cancelada_motivo || '' }];
  return html`<div class="filtros"><input class="entrada" type="date" value=${de} onChange=${(e) => setDe(e.target.value)} /> até <input class="entrada" type="date" value=${ate} onChange=${(e) => setAte(e.target.value)} />
      ${lista && html`<${Exportar} titulo="Bateladas finalizadas" filtros=${`${de} a ${ate}`} arquivo="bateladas" linhas=${lista} colunas=${colunasExp} />`}</div>
    ${!lista ? html`<${Carregando} />` : html`<${Tabela} linhas=${lista} vazio="Nenhuma batelada finalizada no período." colunas=${[
      { chave: 'id', titulo: 'Nº', num: true },
      { chave: 'ini', titulo: 'Início', valor: (b) => b.iniciada_em, render: (b) => dataHora(b.iniciada_em) },
      { chave: 'mac', titulo: 'Maceira', render: (b) => dados.mapa.maceira.get(b.maceira_id)?.nome || '–' },
      { chave: 'op', titulo: 'Padeiro', render: (b) => dados.mapa.operador.get(b.operador_id)?.nome || '–' },
      { chave: 'f', titulo: 'Receita', render: (b) => `${f(b)?.codigo} ${f(b)?.nome}` },
      { chave: 'q', titulo: 'Produzido', num: true, valor: (b) => Number(b.quantidade_produzida || 0),
        render: (b) => (b.situacao === 'cancelada' ? html`<${Etiqueta} cor="cinza" titulo=${b.cancelada_motivo}>cancelada</${Etiqueta}>` : num(b.quantidade_produzida, 0)) },
      { chave: 'd', titulo: 'Dif. padrão', num: true, valor: (b) => dif(b) ?? 0,
        render: (b) => { const d = dif(b); return d == null ? '–' : html`<span class=${d < 0 ? 'texto-vermelho' : d > 0 ? 'texto-verde' : ''}>${d > 0 ? '+' : ''}${num(d, 0)}</span>`; } },
      { chave: 'fin', titulo: 'Finalizou', render: (b) => html`<small>${pes(b.finalizada_por)}</small>` },
    ]} rodape=${html`<tr><td colspan="5"><b>Total</b></td><td class="n"><b>${num(lista.reduce((s, b) => s + Number(b.quantidade_produzida || 0), 0), 0)}</b></td><td colspan="2"></td></tr>`} />`}`;
}
