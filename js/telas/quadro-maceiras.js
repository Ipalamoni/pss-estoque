// =====================================================================
// QUADRO DAS MACEIRAS (PCP): cada coluna é uma maceira; arraste os cartões para
// mudar de maceira ou de ordem. Setas para quem usa o dedo. Dá para dividir.
// =====================================================================
import { html, useState, useApp, Modal, Campo, Numero, Etiqueta, Carregando, useAcao, avisar, n } from '../ui.js';
import { hora } from '../producao-util.js';
import { num, hojeISO } from '../util.js';
import { Icone } from '../icones.js';
import { useFluxo, ETAPAS, useEventos, LinhaTempo } from '../producao-util.js';

export function QuadroMaceiras({ dia, setDia, SeletorDia }) {
  const { dados, api, recarregar } = useApp();
  const fluxo = useFluxo(dia);
  const [arrastando, setArrastando] = useState(null);
  const [sobre, setSobre] = useState(null);
  const [dividir, setDividir] = useState(null);
  const [recado, setRecado] = useState(null);   // masseira que vai receber o recado
  const [ocupado, executar] = useAcao();
  const fx = new Map((fluxo?.fluxo || []).map((x) => [x.programacao_id, x]));
  const progs = dados.programacoes.filter((p) => p.data === dia && p.situacao === 'ativa' && !p.finalizada_em);
  const cols = [...dados.maceiras.filter((m) => m.ativa), { id: null, nome: 'Sem masseira' }];
  const daCol = (id) => progs.filter((p) => (p.maceira_id || null) === id).sort((a, b) => (a.prioridade ?? 999) - (b.prioridade ?? 999) || a.id - b.id);
  const eventos = useEventos(progs.map((p) => p.id));
  const travada = (p) => { const f = fx.get(p.id); return f && f.iniciado > 0 && f.iniciado >= Number(p.quantidade) - 0.0001; };

  async function mover(pid, macId, pos) {
    const p = progs.find((x) => x.id === pid); if (!p) return;
    const destino = daCol(macId).filter((x) => x.id !== pid);
    destino.splice(Math.max(0, Math.min(pos, destino.length)), 0, p);
    const lista = destino.map((x, i) => ({ id: x.id, maceira_id: macId, prioridade: i + 1 }));
    if ((p.maceira_id || null) !== macId) daCol(p.maceira_id || null).filter((x) => x.id !== pid).forEach((x, i) => lista.push({ id: x.id, maceira_id: x.maceira_id || null, prioridade: i + 1 }));
    if (await executar(() => api.rpc('reordenar_programacao', { p: lista }))) await recarregar(true);
  }
  function soltar(e, macId, pos) {
    e.preventDefault(); setSobre(null);
    const id = Number(e.dataTransfer.getData('text/plain') || arrastando);
    setArrastando(null);
    if (id) mover(id, macId, pos);
  }
  const alvo = (macId, pos) => ({
    onDragOver: (e) => { e.preventDefault(); setSobre(`${macId}-${pos}`); },
    onDragLeave: () => setSobre(null),
    onDrop: (e) => soltar(e, macId, pos),
  });

  return html`
    <${SeletorDia} dia=${dia} setDia=${setDia} />
    <p class="nota">Arraste os cartões para trocar de masseira ou mudar a ordem (o de cima é o próximo). No tablet/celular use as setas. O padeiro vê esta ordem.</p>
    ${!fluxo ? html`<${Carregando} />` : html`
    <div class="quadro">${cols.map((m) => { const itens = daCol(m.id); const tot = itens.reduce((s, p) => s + Number(p.quantidade), 0);
      return html`<section class=${'quadro-col' + (m.id ? '' : ' sem')} key=${m.id ?? 'sem'} ...${alvo(m.id, itens.length)}>
        <header><b class="qc-nome">${m.id ? html`<${Icone} nome="masseira" tam=${20} /> ` : ''}${m.nome}</b><small>${num(tot, 1)} receita(s)${m.capacidade_kg ? ` · ${num(m.capacidade_kg, 0)} kg` : ''}</small>
          ${m.id && (() => { const pend = (dados.avisos || []).filter((a) => a.maceira_id === m.id && !a.ciente_em);
            return html`${pend.length > 0 && html`<span class="qc-aviso" title="O tablet ainda não confirmou que viu"><${Icone} nome="aviso" tam=${14} /> ${pend.length} aviso(s) não visto(s) desde ${hora(pend[0].criado_em)}</span>`}
              <button type="button" class="btn btn-sec btn-peq qc-recado" onClick=${() => setRecado(m)}><${Icone} nome="aviso" tam=${14} /> Recado para o padeiro</button>`; })()}
        </header>
        ${itens.map((p, i) => { const f = dados.mapa.ficha.get(p.ficha_id); const fl = fx.get(p.id); const trav = travada(p);
          return html`<div class=${'quadro-cartao' + (sobre === `${m.id}-${i}` ? ' alvo' : '') + (arrastando === p.id ? ' arrastando' : '') + (trav ? ' travado' : '')} key=${p.id}
            draggable=${!trav} onDragStart=${(e) => { e.dataTransfer.setData('text/plain', String(p.id)); setArrastando(p.id); }} onDragEnd=${() => { setArrastando(null); setSobre(null); }}
            ...${alvo(m.id, i)}>
            <div class="qc-topo"><span class="qc-ordem">${i + 1}º</span><b>${f?.codigo}</b><span class="qc-nome">${f?.nome}</span></div>
            <div class="qc-qtd"><b>${num(p.quantidade, 1)}</b> receita(s)${p.operador_id ? html` · <small>${dados.mapa.operador.get(p.operador_id)?.nome}</small>` : ''}</div>
            ${fl && html`<div class="qc-barra">${ETAPAS.map((e) => fl[e.id] > 0.0001 && html`<i style=${`flex:${fl[e.id]};background:${e.cor}`} title=${`${e.titulo}: ${num(fl[e.id], 1)}`}></i>`)}</div>`}
            <div class="qc-horas"><${LinhaTempo} p=${p} ev=${eventos.get(p.id)} bateladas=${fluxo?.bateladas || []} curta /></div>
            ${p.itens_alterados && html`<${Etiqueta} cor="laranja">receita alterada</${Etiqueta}>`}
            <div class="qc-acoes">
              <button class="btn-icone" title="Subir" disabled=${ocupado || i === 0} onClick=${() => mover(p.id, m.id, i - 1)}>▲</button>
              <button class="btn-icone" title="Descer" disabled=${ocupado || i === itens.length - 1} onClick=${() => mover(p.id, m.id, i + 1)}>▼</button>
              <select class="entrada qc-mover" value=${m.id ?? ''} disabled=${ocupado || trav} title="Mudar de masseira" onChange=${(e) => mover(p.id, e.target.value ? Number(e.target.value) : null, 999)}>
                ${cols.map((c) => html`<option value=${c.id ?? ''}>${c.nome}</option>`)}</select>
              ${Number(p.quantidade) > 1 && html`<button class="btn btn-sec btn-peq" disabled=${ocupado} onClick=${() => setDividir(p)}>Dividir</button>`}
            </div>
          </div>`; })}
        ${!itens.length && html`<div class="quadro-vazio">Solte aqui</div>`}
      </section>`; })}</div>
    <div class="legenda">${ETAPAS.map((e) => html`<span><i style=${`background:${e.cor}`}></i>${e.titulo}</span>`)}</div>`}
    ${recado && html`<${EnviarRecado} m=${recado} aoFechar=${() => setRecado(null)} />`}
    ${dividir && html`<${Dividir} p=${dividir} fl=${fx.get(dividir.id)} aoFechar=${() => setDividir(null)} />`}`;
}

function Dividir({ p, fl, aoFechar }) {
  const { dados, api, recarregar } = useApp();
  const livre = Math.max(0, Number(p.quantidade) - Number(fl?.pesado || 0));
  const [q, setQ] = useState(String(Math.floor(livre / 2) || ''));
  const [mac, setMac] = useState(dados.maceiras.find((m) => m.ativa && m.id !== p.maceira_id)?.id || '');
  const [ocupado, executar] = useAcao();
  const f = dados.mapa.ficha.get(p.ficha_id);
  async function ok() {
    if (!(n(q) > 0)) return avisar('Informe quantas receitas vão para a outra masseira.', 'erro');
    if (await executar(() => api.rpc('dividir_programacao', { p_id: p.id, p_qtd: n(q), p_maceira: mac || null }), 'Programação dividida.')) { await recarregar(true); aoFechar(); }
  }
  return html`<${Modal} titulo=${`Dividir ${f?.codigo} ${f?.nome}`} aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Voltar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${ok}>Dividir</button>`}>
    <p>Programado <b>${num(p.quantidade, 1)}</b> receitas na <b>${dados.mapa.maceira.get(p.maceira_id)?.nome || 'sem masseira'}</b>. Ainda não pesadas: <b>${num(livre, 1)}</b>.</p>
    <div class="grade">
      <${Campo} rotulo="Quantas receitas passar"><${Numero} valor=${q} aoMudar=${setQ} /></${Campo}>
      <${Campo} rotulo="Para a masseira"><select class="entrada" value=${mac} onChange=${(e) => setMac(e.target.value ? Number(e.target.value) : '')}>
        <option value="">Sem masseira</option>${dados.maceiras.filter((m) => m.ativa).map((m) => html`<option value=${m.id}>${m.nome}</option>`)}</select></${Campo}>
    </div>
  </${Modal}>`;
}

// recado do engenheiro/gestor: aparece no tablet como aviso de mudança (o padeiro confirma com nome + senha)
function EnviarRecado({ m, aoFechar }) {
  const { api, recarregar } = useApp();
  const [txt, setTxt] = useState('');
  const [ocupado, executar] = useAcao();
  async function enviar() {
    if (!txt.trim()) return avisar('Escreva o recado.', 'erro');
    const r = await executar(() => api.rpc('enviar_recado_producao', { p_maceira: m.id, p_texto: txt.trim() }), 'Recado enviado para o tablet.');
    if (r !== null) { await recarregar(true); aoFechar(); }
  }
  return html`<${Modal} titulo=${`Recado para ${m.nome}`} aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Cancelar</button><button class="btn btn-pri" disabled=${ocupado} onClick=${enviar}>Enviar recado</button>`}>
    <${Campo} rotulo="Recado" ajuda="Aparece em destaque no tablet. Escreva curto e direto (máx. 300 letras).">
      <textarea class="entrada" rows="3" maxlength="300" value=${txt} onInput=${(e) => setTxt(e.target.value)} placeholder="Ex.: Limpar a masseira antes do hot dog."></textarea></${Campo}>
  </${Modal}>`;
}
