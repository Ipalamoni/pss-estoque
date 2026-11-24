// =====================================================================
// FINALIZAR BATELADAS (engenharia, normalmente à tarde, todas juntas)
// Lista na ordem de produção, rendimento editável na última coluna, finaliza 1, algumas ou todas.
// =====================================================================
import { html, AreaProtegida, useState, useEffect, useApp, Cabecalho, Abas, Tabela, Etiqueta, Campo, Numero, Vazio, Modal, Carregando, useAcao, confirmar, avisar, n, useFiltroMudou } from '../ui.js';
import { num, dataHora, hojeISO, somarDias, pode, mensagemErro } from '../util.js';
import { Icone } from '../icones.js';
import { minutos, tempoTexto, diaDe } from '../producao-util.js';
import { Exportar } from '../exportar.js';

const hora = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const inicioDia = (iso) => new Date(iso + 'T00:00:00').toISOString();

export function TelaFinalizar() {
  const [aba, setAba] = useState('abertas');
  return html`
    <${Cabecalho} titulo="Finalizar bateladas" sub="O padeiro finaliza no tablet (com o rendimento médio da receita). Use esta tela só para bateladas esquecidas abertas ou para corrigir." />
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
  const [corrigir, setCorrigir] = useState(null);   // batelada aberta para correção
  const macs = [...new Set(lista.map((b) => b.maceira_id))].map((id) => dados.mapa.maceira.get(id)).filter(Boolean);
  return html`<${AreaProtegida} rotulo="rendimento das bateladas">
    ${atrasadas > 0 && html`<div class="alerta-faixa laranja"><${Icone} nome="relogio" tam=${18} /> ${atrasadas} batelada(s) iniciada(s) há mais de ${tempoTexto(prazo)} ainda sem finalizar.</div>`}
    <div class="filtros fin-barra">
      <select class="entrada" value=${filtroMac} onChange=${(e) => setFiltroMac(e.target.value)}><option value="">Todas as masseiras</option>${macs.map((m) => html`<option value=${m.id}>${m.nome}</option>`)}</select>
      <span class="flex1"></span>
      ${podeFin && html`<button class="btn btn-sec" disabled=${ocupado || !sel.size} onClick=${() => finalizar([...sel])}>Finalizar selecionadas (${sel.size})</button>
        <button class="btn btn-pri" disabled=${ocupado || !vis.length} onClick=${() => finalizar(vis.map((b) => b.id))}><${Icone} nome="finalizar" tam=${16} /> Finalizar todas (${vis.length})</button>`}
    </div>
    ${!vis.length ? html`<${Vazio} texto="Nenhuma batelada em produção. Quando o padeiro iniciar, ela aparece aqui." />` : html`
    <div class="tabela-rolagem"><table class="tabela fin-tabela">
      <thead><tr>
        ${podeFin && html`<th class="col-check"><input type="checkbox" checked=${todos} onChange=${(e) => setSel(e.target.checked ? new Set(vis.map((b) => b.id)) : new Set())} /></th>`}
        <th>Nº</th><th>Início</th><th>Masseira</th><th>Padeiro</th><th>Receita</th><th class="n">Padrão</th><th class="n col-rend">Rendeu</th>${podeFin && html`<th></th>`}
      </tr></thead>
      <tbody>${vis.map((b) => { const f = ficha(b); const m = minutos(b.iniciada_em); const alt = alterou(b);
        return html`<tr key=${b.id} class=${(sel.has(b.id) ? 'sel ' : '') + (m > prazo ? 'linha-alerta' : '')}>
          ${podeFin && html`<td class="col-check"><input type="checkbox" checked=${sel.has(b.id)} onChange=${(e) => { const s = new Set(sel); e.target.checked ? s.add(b.id) : s.delete(b.id); setSel(s); }} /></td>`}
          <td class="n">${b.id}</td>
          <td><b>${hora(b.iniciada_em)}</b>${diaDe(b.iniciada_em) !== hojeISO() ? html` <small>${dataHora(b.iniciada_em).slice(0, 5)}</small>` : ''}<br /><small class="texto-cinza">há ${tempoTexto(m)}</small></td>
          <td>${dados.mapa.maceira.get(b.maceira_id)?.nome || '–'}</td>
          <td>${dados.mapa.operador.get(b.operador_id)?.nome || '–'}</td>
          <td><b>${f?.codigo}</b> ${f?.nome}${(b.itens || []).some((i) => i.trocou_de) ? html` <${Etiqueta} cor="roxo" titulo="O padeiro trocou a marca da farinha">trocou farinha</${Etiqueta}>` : ''}${b.fora_da_ordem ? html` <${Etiqueta} cor="laranja" titulo="Iniciada antes da 1ª da fila (o padeiro confirmou que já tinha carregado a masseira)">fora da ordem</${Etiqueta}>` : ''}</td>
          <td class="n">${b.rendimento_padrao != null ? `${num(b.rendimento_padrao, 0)} ${f?.rendimento_unidade || ''}` : '–'}</td>
          <td class="n col-rend">${podeFin ? html`<div class=${'rend-campo' + (alt ? ' alterado' : '')}><${Numero} valor=${rend[b.id] ?? ''} aoMudar=${(v) => setRend({ ...rend, [b.id]: v })} />
              ${alt && html`<small>${(n(rend[b.id]) || 0) > Number(b.rendimento_padrao) ? '+' : ''}${num((n(rend[b.id]) || 0) - Number(b.rendimento_padrao), 0)}</small>`}</div>` : num(b.rendimento_padrao, 0)}</td>
          ${podeFin && html`<td class="acoes-linha"><button class="btn btn-pri btn-peq" disabled=${ocupado} onClick=${() => finalizar([b.id])}>Finalizar</button>
            <button class="btn btn-sec btn-peq" disabled=${ocupado} onClick=${() => setCorrigir(b)}><${Icone} nome="corrigir" tam=${14} /> Corrigir</button></td>`}
        </tr>`; })}</tbody>
      <tfoot><tr>${podeFin && html`<td></td>`}<td colspan="5"><b>${vis.length} batelada(s)</b></td>
        <td class="n">${num(vis.reduce((s, b) => s + Number(b.rendimento_padrao || 0), 0), 0)}</td>
        <td class="n col-rend"><b>${num(vis.reduce((s, b) => s + (n(rend[b.id]) || 0), 0), 0)}</b></td>${podeFin && html`<td></td>`}</tr></tfoot>
    </table></div>`}
    ${corrigir && html`<${CorrigirBatelada} b=${corrigir} aoFechar=${() => setCorrigir(null)} />`}</${AreaProtegida}>`;
}

// ------------------------- CORRIGIR BATELADA (engenharia / gestor da produção / admin) -------------------------
// Nada é apagado: a correção fica registrada (quem, quando, antes → depois e o motivo) e aparece no Histórico.
const MOTIVOS_CORRECAO = ['Padeiro iniciou por engano', 'Iniciou na masseira errada', 'Iniciou com o nome de outro padeiro', 'Receita errada', 'Outro'];
export function CorrigirBatelada({ b, aoFechar }) {
  const { dados, api, recarregar } = useApp();
  const [tipo, setTipo] = useState(null);         // masseira | padeiro | cancelar
  const [mac, setMac] = useState(b.maceira_id);
  const [oper, setOper] = useState(b.operador_id);
  const [motivo, setMotivo] = useState('');
  const [outro, setOutro] = useState('');
  const [ocupado, executar] = useAcao();
  const f = dados.mapa.ficha.get(b.ficha_id);
  const textoMotivo = motivo === 'Outro' ? outro.trim() : motivo;
  async function salvar() {
    if (!textoMotivo || textoMotivo.length < 3) return avisar('Escolha ou escreva o motivo.', 'erro');
    let r;
    if (tipo === 'cancelar') r = await executar(() => api.rpc('cancelar_batelada', { p_id: b.id, p_motivo: textoMotivo }), 'Batelada cancelada. Os ingredientes voltaram para o estoque.');
    else if (tipo === 'masseira') {
      if (mac === b.maceira_id) return avisar('Escolha a masseira certa.', 'erro');
      r = await executar(() => api.rpc('corrigir_batelada', { p: { id: b.id, maceira_id: mac, motivo: textoMotivo } }), 'Masseira corrigida.');
    } else {
      if (oper === b.operador_id) return avisar('Escolha o padeiro certo.', 'erro');
      r = await executar(() => api.rpc('corrigir_batelada', { p: { id: b.id, operador_id: oper, motivo: textoMotivo } }), 'Padeiro corrigido.');
    }
    if (r !== null) { await recarregar(true); aoFechar(); }
  }
  const OPCOES = [['masseira', 'Trocar a masseira', 'Foi feita em outra masseira'], ['padeiro', 'Trocar o padeiro', 'Foi feita por outro padeiro'],
    ['cancelar', 'Cancelar a batelada', 'Iniciada por engano: os ingredientes voltam ao estoque']];
  return html`<${Modal} titulo=${`Corrigir a batelada nº ${b.id}`} aoFechar=${aoFechar}
    rodape=${tipo && html`<button class="btn btn-sec" onClick=${() => setTipo(null)}>Voltar</button>
      <button class=${'btn ' + (tipo === 'cancelar' ? 'btn-perigo' : 'btn-pri')} disabled=${ocupado} onClick=${salvar}>${tipo === 'cancelar' ? 'Cancelar batelada' : 'Salvar correção'}</button>`}>
    <p class="nota"><b>${f?.nome}</b> · ${dados.mapa.maceira.get(b.maceira_id)?.nome || 'sem masseira'} · ${dados.mapa.operador.get(b.operador_id)?.nome || 'sem padeiro'} · iniciada às ${hora(b.iniciada_em)}</p>
    ${!tipo ? html`<div class="opcoes">${OPCOES.map(([id, t, d]) => html`<button type="button" class="opcao" onClick=${() => { setTipo(id); setMotivo(''); }}>
        <${Icone} nome=${id === 'cancelar' ? 'aviso' : 'corrigir'} tam=${22} /><span><b>${t}</b><small>${d}</small></span></button>`)}</div>`
    : html`
      ${tipo === 'masseira' && html`<${Campo} rotulo="Masseira certa"><select class="entrada" value=${mac} onChange=${(e) => setMac(Number(e.target.value))}>
        ${dados.maceiras.filter((m) => m.ativa || m.id === b.maceira_id).map((m) => html`<option value=${m.id}>${m.nome}</option>`)}</select></${Campo}>`}
      ${tipo === 'padeiro' && html`<${Campo} rotulo="Padeiro certo"><select class="entrada" value=${oper} onChange=${(e) => setOper(Number(e.target.value))}>
        ${dados.operadores.filter((o) => o.ativo || o.id === b.operador_id).map((o) => html`<option value=${o.id}>${o.nome}</option>`)}</select></${Campo}>`}
      ${tipo === 'cancelar' && html`<div class="alerta">A farinha, o fermento e a base voltam para o estoque. A batelada continua no histórico como <b>cancelada</b>.</div>`}
      <div class="campo"><span class="campo-rotulo">Motivo <b class="obrig">*</b></span>
        <div class="chips">${MOTIVOS_CORRECAO.map((m) => html`<button type="button" class=${'chip' + (motivo === m ? ' ativo' : '')} aria-pressed=${motivo === m} onClick=${() => setMotivo(m)}>${m}</button>`)}</div></div>
      ${motivo === 'Outro' && html`<${Campo} rotulo="Escreva o motivo"><input class="entrada" maxlength="300" value=${outro} onInput=${(e) => setOutro(e.target.value)} /></${Campo}>`}
      <p class="nota">Fica registrado quem corrigiu, quando, o que era antes e o motivo.</p>`}
  </${Modal}>`;
}

function Finalizadas() {
  const { dados, api } = useApp();
  const [de, setDe] = useState(hojeISO());
  const [ate, setAte] = useState(hojeISO());
  const [lista, setLista] = useState(null);
  const mudou = useFiltroMudou([de, ate]);
  useEffect(() => {
    let vivo = true; if (mudou()) setLista(null);
    api.listar('bateladas', { campoData: 'iniciada_em', desde: inicioDia(de), ate: inicioDia(somarDias(ate, 1)), ordem: ['iniciada_em', 'asc'] })
      .then((l) => { if (vivo) setLista(l.filter((b) => b.situacao !== 'em_producao')); })
      .catch((e) => { avisar(mensagemErro(e), 'erro'); if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, [de, ate, dados.carregadoEm]);
  const f = (b) => dados.mapa.ficha.get(b.ficha_id);
  const pes = (u) => dados.mapa.perfil.get(u)?.nome || '';
  const dif = (b) => (b.situacao === 'finalizada' && b.rendimento_padrao != null ? Number(b.quantidade_produzida) - Number(b.rendimento_padrao) : null);
  const colunasExp = [
    { titulo: 'Nº', valor: (b) => b.id }, { titulo: 'Início', valor: (b) => dataHora(b.iniciada_em) }, { titulo: 'Masseira', valor: (b) => dados.mapa.maceira.get(b.maceira_id)?.nome || '' },
    { titulo: 'Padeiro', valor: (b) => dados.mapa.operador.get(b.operador_id)?.nome || '' }, { titulo: 'Receita', valor: (b) => `${f(b)?.codigo} ${f(b)?.nome}` },
    { titulo: 'Situação', valor: (b) => (b.situacao === 'finalizada' ? 'Finalizada' : 'Cancelada') },
    { titulo: 'Padrão', valor: (b) => Number(b.rendimento_padrao || 0), num: true }, { titulo: 'Produzido', valor: (b) => Number(b.quantidade_produzida || 0), num: true },
    { titulo: 'Diferença', valor: (b) => dif(b) ?? '', num: true }, { titulo: 'Finalizou', valor: (b) => `${pes(b.finalizada_por)} ${b.finalizada_em ? dataHora(b.finalizada_em) : ''}` },
    { titulo: 'Motivo cancelamento', valor: (b) => b.cancelada_motivo || '' }];
  return html`<div class="filtros filtros-com-acoes"><label class="campo-inline">De <input class="entrada" type="date" value=${de} onChange=${(e) => setDe(e.target.value)} /></label> <label class="campo-inline">até <input class="entrada" type="date" value=${ate} onChange=${(e) => setAte(e.target.value)} /></label>
      <div class="filtros-acoes">${lista && html`<${Exportar} tabela="finalizar.finalizadas" titulo="Bateladas finalizadas" filtros=${`${de} a ${ate}`} arquivo="bateladas" linhas=${lista} colunas=${colunasExp} />`}</div></div>
    ${!lista ? html`<${Carregando} />` : html`<${Tabela} id="finalizar.finalizadas" linhas=${lista} vazio="Nenhuma batelada finalizada no período." colunas=${[
      { chave: 'id', titulo: 'Nº', num: true },
      { chave: 'ini', titulo: 'Início', valor: (b) => b.iniciada_em, render: (b) => dataHora(b.iniciada_em) },
      { chave: 'mac', titulo: 'Masseira', render: (b) => dados.mapa.maceira.get(b.maceira_id)?.nome || '–' },
      { chave: 'op', titulo: 'Padeiro', render: (b) => dados.mapa.operador.get(b.operador_id)?.nome || '–' },
      { chave: 'f', titulo: 'Receita', render: (b) => `${f(b)?.codigo} ${f(b)?.nome}` },
      { chave: 'q', titulo: 'Produzido', num: true, valor: (b) => Number(b.quantidade_produzida || 0),
        render: (b) => (b.situacao === 'cancelada' ? html`<${Etiqueta} cor="cinza" titulo=${b.cancelada_motivo}>cancelada</${Etiqueta}>` : num(b.quantidade_produzida, 0)) },
      { chave: 'd', titulo: 'Dif. padrão', num: true, valor: (b) => dif(b) ?? 0,
        render: (b) => { const d = dif(b); return d == null ? '–' : html`<span class=${d < 0 ? 'texto-vermelho' : d > 0 ? 'texto-verde' : ''}>${d > 0 ? '+' : ''}${num(d, 0)}</span>`; } },
      { chave: 'fin', titulo: 'Finalizou', render: (b) => html`<small>${pes(b.finalizada_por)}</small>` },
    ]} totais=${{ rotulo: 'Total', q: num(lista.reduce((s, b) => s + Number(b.quantidade_produzida || 0), 0), 0) }} />`}`;
}
