// =====================================================================
// PAINEL DE PRODUÇÃO — visão ao vivo para Ítalo, diretoria, PCP e gestor
// (sem custos). Atualiza sozinho quando alguém mexe na produção.
// =====================================================================
import { html, useState, useMemo, useApp, Cabecalho, Carregando, Vazio, Etiqueta, Modal } from '../ui.js';
import { num, hojeISO, somarDias, data, pl, qtd } from '../util.js';
import { Colunas, BarrasH } from '../graficos.js';
import { useFluxo, ETAPAS, somar, semaforo, tempoTexto, tempoMedio, useRelogio, diaDe, minutos, hora } from '../producao-util.js';
import { Exportar } from '../exportar.js';

const DIAS = [{ id: -1, t: 'Ontem' }, { id: 0, t: 'Hoje' }, { id: 1, t: 'Amanhã' }];

export function TelaPainelProducao() {
  const { dados } = useApp();
  const [desloc, setDesloc] = useState(0);
  const [linha, setLinha] = useState('');
  const dia = somarDias(hojeISO(), desloc);
  const fluxo = useFluxo(dia);
  const agora = useRelogio(20);
  const [tela, setTela] = useState(() => { try { return localStorage.getItem('pss-painel-tv') === '1'; } catch { return false; } });
  if (!fluxo) return html`<${Cabecalho} titulo="Painel de Produção" /><${Carregando} texto="Carregando a produção…" />`;

  const fichaLinha = (fid) => dados.mapa.ficha.get(fid)?.linha_id;
  const linhas = fluxo.fluxo.filter((l) => l.data === dia && (!linha || String(fichaLinha(l.ficha_id)) === linha));
  const tot = Object.fromEntries(['programado', ...ETAPAS.map((e) => e.id), 'iniciado', 'produzido'].map((c) => [c, somar(linhas, c)]));
  const previsto = linhas.reduce((s, l) => s + l.programado * Number(dados.mapa.ficha.get(l.ficha_id)?.rendimento_qtd || 0), 0);
  const pct = tot.programado ? (tot.finalizado / tot.programado) * 100 : 0;
  const pctIni = tot.programado ? (tot.iniciado / tot.programado) * 100 : 0;
  const maceiras = dados.maceiras.filter((m) => m.ativa);
  const sems = maceiras.map((m) => ({ m, s: semaforo(dados, m, fluxo.fluxo, fluxo.bateladas, agora) }));
  const atrasadas = desloc === 0 ? sems.filter((x) => ['laranja', 'vermelho'].includes(x.s.cor)) : [];
  // previsão de término: o que falta iniciar em cada maceira × tempo médio (a maceira mais carregada define)
  const fim = desloc === 0 ? (() => {
    let maxMin = 0;
    maceiras.forEach((m) => {
      const falta = linhas.filter((l) => l.maceira_id === m.id).reduce((s, l) => s + Math.max(l.programado - l.iniciado, 0) * tempoMedio(dados, l.ficha_id, m), 0);
      maxMin = Math.max(maxMin, falta);
    });
    const semMac = linhas.filter((l) => !l.maceira_id).reduce((s, l) => s + Math.max(l.programado - l.iniciado, 0) * tempoMedio(dados, l.ficha_id), 0);
    maxMin = Math.max(maxMin, semMac);
    return maxMin > 0 ? new Date(agora + maxMin * 60000) : null;
  })() : null;
  const bats = fluxo.bateladas.filter((b) => b.situacao !== 'cancelada' && diaDe(b.iniciada_em) === dia);
  const semFinalizar = fluxo.bateladas.filter((b) => b.situacao === 'em_producao' && minutos(b.iniciada_em, agora) > Number(dados.params.producao_prazo_finalizar_h || 12) * 60);
  const misturaParada = dados.transferencias.length >= 0 && linhas.filter((l) => l.na_pesagem > 0);

  function alternarTela() { const v = !tela; setTela(v); try { localStorage.setItem('pss-painel-tv', v ? '1' : '0'); } catch { /* ignora */ } }

  return html`<div class=${'painel-prod' + (tela ? ' modo-tv' : '')}>
    <${Cabecalho} titulo="Painel de Produção" sub=${`${data(dia)} · atualiza sozinho · ${new Date(agora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}>
      <div class="chips">${DIAS.map((d) => html`<button class=${'chip' + (desloc === d.id ? ' ativo' : '')} aria-pressed=${!!(desloc === d.id)} onClick=${() => setDesloc(d.id)}>${d.t}</button>`)}</div>
      ${dados.linhas.length > 0 && html`<select class="entrada entrada-auto" aria-label="Linha de produção" value=${linha} onChange=${(e) => setLinha(e.target.value)}>
        <option value="">Todas as linhas</option>${dados.linhas.map((l) => html`<option value=${String(l.id)}>${l.nome}</option>`)}</select>`}
      <button class="btn btn-sec btn-peq" onClick=${alternarTela} title="Tela cheia (ex.: numa TV da fábrica)">${tela ? 'Sair da tela cheia' : 'Tela cheia'}</button>
    </${Cabecalho}>

    ${!linhas.length ? html`<${Vazio} texto=${`Nada programado para ${data(dia)}${linha ? ' nesta linha' : ''}.`} />` : html`
    <div class="kpis">
      <div class="kpi"><small>Programado</small><b>${num(tot.programado, 0)}</b><span>bateladas · ${num(previsto, 0)} un. previstas</span></div>
      <div class="kpi verde"><small>Finalizado</small><b>${num(tot.finalizado, 0)}</b><span>${num(tot.produzido, 0)} un. produzidas</span></div>
      <div class="kpi laranja"><small>Em produção</small><b>${num(tot.em_producao, 0)}</b><span>iniciadas, aguardando finalizar</span></div>
      <div class="kpi"><small>Andamento</small><b>${num(pct, 0)}%</b><span class="kpi-barra" role="img" aria-label=${`${num(pct, 0)}% finalizado`}><i style=${{ width: `${Math.min(pct, 100)}%` }}></i></span><span>finalizado · ${num(pctIni, 0)}% iniciado</span></div>
      <div class="kpi azul"><small>Previsão de término</small><b>${fim ? fim.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : desloc === 0 ? 'Concluído' : '–'}</b><span>${fim ? 'no ritmo do tempo médio' : ''}</span></div>
      <div class=${'kpi ' + (atrasadas.length ? 'vermelho' : 'verde')}><small>Atrasos</small><b>${atrasadas.length}</b><span>${atrasadas.length ? atrasadas.map((x) => x.m.nome).join(', ') : 'tudo no ritmo'}</span></div>
    </div>

    <section class="painel">
      <div class="painel-topo"><h2>Onde está a produção</h2><small>${pl(linhas.length, 'programação', 'programações')} · ${num(tot.programado, 0)} bateladas</small></div>
      <${Funil} tot=${tot} />
    </section>

    <section class="painel">
        <h2>Masseiras</h2>
        <div class="tabela-rolagem"><table class="tabela tabela-mac">
          <thead><tr><th>Masseira</th><th>Situação</th><th>Padeiro</th><th>Agora</th><th class="n">Programado</th><th class="n">Iniciado</th><th class="n">Pronto</th><th class="n">Na pesagem</th><th>Horários</th></tr></thead>
          <tbody>${sems.map(({ m, s }) => {
            const ult = s.ultima;
            return html`<tr key=${m.id}><td data-rotulo="Masseira"><b>${m.nome}</b></td>
              <td data-rotulo="Situação"><span class=${'semaf s-' + s.cor}><i></i>${desloc === 0 ? s.rotulo : '–'}</span></td>
              <td data-rotulo="Padeiro">${ult ? dados.mapa.operador.get(ult.operador_id)?.nome : '–'}</td>
              <td data-rotulo="Agora">${s.batendo ? html`${dados.mapa.ficha.get(s.batendo.ficha_id)?.nome} <small>há ${tempoTexto(s.batendo.min)}</small>` : s.min !== null && desloc === 0 && s.cor !== 'cinza' ? html`<small>${tempoTexto(s.min)} sem iniciar</small>` : '–'}</td>
              <td class="n" data-rotulo="Programado">${num(somar(s.progs, 'programado'), 0)}</td><td class="n" data-rotulo="Iniciado">${num(somar(s.progs, 'iniciado'), 0)}</td>
              <td class="n" data-rotulo="Pronto">${num(somar(s.progs, 'pronto'), 0)}</td><td class="n" data-rotulo="Na pesagem">${num(somar(s.progs, 'a_pesar') + somar(s.progs, 'na_pesagem'), 0)}</td>
              <td data-rotulo="Horários" class="horarios">${s.primeira || ult ? html`${s.primeira ? html`<small>1ª: <b>${hora(s.primeira.iniciada_em)}</b></small>` : ''}${ult ? html`<small>última: <b>${hora(ult.iniciada_em)}</b> (${s.iniciadasHoje} no dia)</small>` : ''}` : '–'}</td></tr>`;
          })}</tbody></table></div>
      </section>
    <section class="painel">
        <h2>Ritmo do dia</h2>
        <${Ritmo} bats=${bats} linhas=${linhas} />
        ${(semFinalizar.length > 0 || atrasadas.length > 0 || misturaParada.length > 0) && html`<h3>Alertas</h3><ul class="alertas-lista">
          ${atrasadas.map((x) => html`<li class=${'al-' + x.s.cor}><b>${x.m.nome}</b>: ${x.s.rotulo.toLowerCase()} (${tempoTexto(x.s.min)} sem iniciar)</li>`)}
          ${semFinalizar.length > 0 && html`<li class="al-laranja"><b>${pl(semFinalizar.length, 'batelada', 'bateladas')}</b> em produção há mais de ${dados.params.producao_prazo_finalizar_h || 12} h sem finalizar</li>`}
          ${misturaParada.map((l) => html`<li class="al-cinza"><b>${num(l.na_pesagem, 0)} mistura(s) de ${dados.mapa.ficha.get(l.ficha_id)?.nome}</b> pesadas e ainda não enviadas</li>`)}
        </ul>`}
      </section>

    <section class="painel">
      <div class="painel-topo"><h2>Programações na ordem de prioridade</h2>
        <${Exportar} titulo="Painel de Produção" filtros=${data(dia)} arquivo=${`painel-producao-${dia}`} linhas=${linhas} colunas=${[
          { titulo: 'Masseira', valor: (l) => dados.mapa.maceira.get(l.maceira_id)?.nome || 'Sem masseira' }, { titulo: 'Prioridade', valor: (l) => l.prioridade },
          { titulo: 'Receita', valor: (l) => dados.mapa.ficha.get(l.ficha_id)?.nome, largura: 30 }, { titulo: 'Programado', valor: (l) => l.programado, num: true },
          ...ETAPAS.map((e) => ({ titulo: e.titulo, valor: (l) => l[e.id], num: true })), { titulo: 'Produzido (un.)', valor: (l) => l.produzido, num: true }]} /></div>
      <${ProgPrioridade} linhas=${linhas} dados=${dados} />
    </section>

    <${Indicadores} bats=${bats} dados=${dados} />
    `}
  </div>`;
}

function Funil({ tot }) {
  const total = Math.max(tot.programado, 1);
  return html`<div class="funil">
    <div class="funil-barra">${ETAPAS.map((e) => tot[e.id] > 0 && html`<span title=${`${e.titulo}: ${num(tot[e.id], 0)}`} style=${{ width: `${(tot[e.id] / total) * 100}%`, background: e.cor }}>${tot[e.id] / total > 0.06 ? num(tot[e.id], 0) : ''}</span>`)}</div>
    <div class="funil-etapas">${ETAPAS.map((e) => html`<div class="funil-etapa"><i style=${{ background: e.cor }}></i><small>${e.titulo}</small><b>${num(tot[e.id], 0)}</b></div>`)}</div>
  </div>`;
}

function ProgPrioridade({ linhas, dados }) {
  const grupos = new Map();
  [...linhas].sort((a, b) => (dados.mapa.maceira.get(a.maceira_id)?.ordem ?? 999) - (dados.mapa.maceira.get(b.maceira_id)?.ordem ?? 999) || a.prioridade - b.prioridade)
    .forEach((l) => { const k = l.maceira_id || 0; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(l); });
  return html`<div class="prog-grupos">${[...grupos.entries()].map(([mid, ls]) => html`<div class="prog-grupo">
    <h3>${dados.mapa.maceira.get(mid)?.nome || 'Sem masseira definida'}</h3>
    ${ls.map((l) => {
      const f = dados.mapa.ficha.get(l.ficha_id);
      const sit = l.finalizada ? ['verde', 'Finalizada'] : l.finalizado >= l.programado ? ['verde', 'Pronta para fechar'] : l.em_producao > 0 || l.iniciado > 0 ? ['laranja', 'Em produção'] : l.pronto > 0 ? ['roxo', 'Aguardando a masseira'] : l.pesado > 0 ? ['azul', 'Na pesagem / a caminho'] : ['cinza', 'A pesar'];
      return html`<div class="prog-linha" key=${l.programacao_id}>
        <span class="prog-pri">${l.prioridade || '–'}º</span>
        <div class="prog-info"><b>${f?.nome}</b><small>${num(l.programado, 0)} bateladas${l.operador_id ? ` · ${dados.mapa.operador.get(l.operador_id)?.nome}` : ''}${l.produzido ? ` · ${num(l.produzido, 0)} ${f?.rendimento_unidade || 'un.'}` : ''}</small></div>
        <div class="prog-barra">${ETAPAS.slice().reverse().map((e) => l[e.id] > 0 && html`<span title=${`${e.titulo}: ${num(l[e.id], 0)}`} style=${{ width: `${(l[e.id] / Math.max(l.programado, 1)) * 100}%`, background: e.cor }}></span>`)}</div>
        <${Etiqueta} cor=${sit[0]}>${sit[1]}</${Etiqueta}>
      </div>`;
    })}</div>`)}</div>`;
}

function Ritmo({ bats, linhas }) {
  const horas = []; for (let h = 5; h <= 20; h++) horas.push(h);
  const real = horas.map((h) => bats.filter((b) => new Date(b.iniciada_em).getHours() === h).length);
  const ativas = horas.filter((h, i) => real[i] > 0);
  if (!ativas.length) return html`<p class="nota">Nenhuma batelada iniciada ainda.</p>`;
  const ini = Math.max(5, Math.min(...ativas) - 1); const fimH = Math.min(20, Math.max(...ativas, new Date().getHours()) + 1);
  const cats = horas.filter((h) => h >= ini && h <= fimH);
  return html`<${Colunas} categorias=${cats.map((h) => `${h}h`)} series=${[{ nome: 'Bateladas iniciadas', valores: cats.map((h) => real[horas.indexOf(h)]) }]} formatar=${(v) => num(v, 0)} altura=${180} />`;
}

function Indicadores({ bats, dados }) {
  const fins = bats.filter((b) => b.situacao === 'finalizada' && b.rendimento_padrao);
  const rend = fins.length ? fins.reduce((s, b) => s + Number(b.quantidade_produzida), 0) / fins.reduce((s, b) => s + Number(b.rendimento_padrao), 0) * 100 : null;
  let fermUsado = 0, fermPadrao = 0, trocas = 0;
  bats.forEach((b) => (b.itens || []).forEach((i) => {
    const p = dados.mapa.produto.get(i.produto_id);
    if (/ferment/i.test(`${p?.grupo} ${p?.descricao}`) && i.padrao) { fermUsado += Number(i.quantidade); fermPadrao += Number(i.padrao); }
    if (i.trocou_de) trocas += 1;
  }));
  const porPadeiro = new Map(); bats.forEach((b) => { const nome = dados.mapa.operador.get(b.operador_id)?.nome || '?'; porPadeiro.set(nome, (porPadeiro.get(nome) || 0) + 1); });
  return html`<section class="painel">
    <h2>Indicadores do dia</h2>
    <div class="info-grade">
      <div><small>Rendimento real × ficha</small><b class=${rend !== null && rend < 98 ? 'texto-vermelho' : ''}>${rend === null ? '–' : `${num(rend, 1)}%`}</b><small>${pl(fins.length, 'batelada finalizada', 'bateladas finalizadas')}</small></div>
      <div><small>Fermento usado × média da ficha</small><b>${fermPadrao ? `${num((fermUsado / fermPadrao) * 100, 0)}%` : '–'}</b><small>${fermPadrao ? `${qtd(fermUsado)} kg usados · ${qtd(fermPadrao)} kg pela ficha` : ''}</small></div>
      <div><small>Trocas de farinha</small><b>${trocas}</b></div>
      <div><small>Bateladas iniciadas</small><b>${bats.length}</b></div>
    </div>
    <h3>Bateladas por padeiro</h3>
    <${BarrasH} itens=${[...porPadeiro.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ rotulo: k, valor: v }))} formatar=${(v) => num(v, 0)} vazio="Nenhuma batelada." />
  </section>`;
}
