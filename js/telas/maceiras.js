// =====================================================================
// PRODUÇÃO MACEIRAS — tela do padeiro (pensada para tablet)
// Quadrados grandes por maceira, semáforo, fila por prioridade,
// receber misturas da pesagem, iniciar 1 batelada por vez, saída avulsa.
// O padeiro se identifica com o nome + senha de 6 números (troca rápida).
// =====================================================================
import { html, useState, useEffect, useRef, useApp, Cabecalho, Modal, Campo, Numero, Escolher, Etiqueta, Carregando, Vazio, useAcao, confirmar, avisar, n } from '../ui.js';
import { qtd, num, qu, hojeISO, pl, mensagemErro } from '../util.js';
import { Icone } from '../icones.js';
import { useFluxo, semaforo, saldoLocal, localTipo, misturaDaFicha, tempoTexto, useRelogio, somar, minutos, useEventos, LinhaTempo, hora, diaDe } from '../producao-util.js';

const ehFermento = (p) => /ferment/i.test(`${p?.grupo || ''} ${p?.descricao || ''}`);
const ehFarinha = (p) => /farinha/i.test(`${p?.grupo || ''} ${p?.descricao || ''}`);
const SAIR_APOS_MIN = 10;   // padeiro sem mexer no tablet: volta para a escolha de nome

export function TelaMaceiras() {
  const { dados, podeFazer, papeis, api, recarregar } = useApp();
  const soPadeiro = (papeis || []).length === 1 && papeis[0] === 'padeiro';
  const opera = podeFazer('batelada');
  const [operador, setOperador] = useState(null);       // { id, nome, pin }
  const [trocar, setTrocar] = useState(false);
  const fluxo = useFluxo(hojeISO());
  const agora = useRelogio(20);
  const ultimo = useRef(Date.now());
  useEffect(() => {   // troca rápida: sem uso por alguns minutos, pede o nome de novo
    const marcar = () => { ultimo.current = Date.now(); };
    ['click', 'touchstart', 'keydown'].forEach((e) => document.addEventListener(e, marcar, { passive: true }));
    const t = setInterval(() => { if (operador && Date.now() - ultimo.current > SAIR_APOS_MIN * 60000) setOperador(null); }, 30000);
    return () => { clearInterval(t); ['click', 'touchstart', 'keydown'].forEach((e) => document.removeEventListener(e, marcar)); };
  }, [operador]);
  const [aberta, setAberta] = useState(null);
  const [iniciar, setIniciar] = useState(null);
  const [receber, setReceber] = useState(false);
  const [avulsa, setAvulsa] = useState(false);
  const [ciente, setCiente] = useState(false);   // "Entendi" do aviso: escolher nome + senha
  const avisos = (dados.avisos || []).filter((a) => !a.ciente_em);
  useAlertaSonoro(opera ? avisos.length : 0);
  const mac = localTipo(dados, 'maceiras');
  const maceiras = dados.maceiras.filter((m) => m.ativa);
  if (!mac) return html`<${Vazio} texto="Cadastre o local Produção Masseiras em Configurações." />`;
  if (!fluxo) return html`<${Carregando} texto="Carregando a produção de hoje…" />`;

  const chegando = dados.transferencias.filter((t) => t.situacao === 'enviada' && t.destino_id === mac.id);
  const qChegando = dados.transfItens.filter((i) => chegando.some((t) => t.id === i.transferencia_id)).reduce((s, i) => s + Number(i.quantidade), 0);
  const hoje = fluxo.fluxo.filter((l) => l.data === hojeISO());
  const exigir = (f) => () => { if (!opera) return avisar('Só o padeiro (ou o PCP) opera esta tela.', 'aviso'); if (!operador) return setTrocar(true); f(); };

  return html`<${Cabecalho} titulo="Produção Masseiras" semVoltar=${soPadeiro} semTrilha=${soPadeiro} />
  <div class="maceiras-tela">
    ${avisos.length > 0 && html`<${FaixaMudanca} avisos=${avisos} opera=${opera} aoEntendi=${() => setCiente(true)} />`}
    <div class="mac-topo">
      <div class="mac-quem">
        ${opera ? html`<button class=${'mac-operador' + (operador ? '' : ' vazio')} onClick=${() => setTrocar(true)}>
          <span class="mac-avatar">${operador ? operador.nome.slice(0, 1) : '?'}</span>
          <span><small>${operador ? 'Padeiro' : 'Toque para entrar'}</small><b>${operador ? operador.nome : 'Quem está trabalhando?'}</b></span>
          <span class="mac-trocar"><${Icone} nome="trocar" tam=${16} /> ${operador ? 'Trocar' : 'Entrar'}</span></button>`
        : html`<div class="alerta">Visualização: só o padeiro (ou o PCP) inicia bateladas nesta tela.</div>`}
      </div>
      <div class="mac-contadores">
        <div class="mac-cont"><small>Prontas para iniciar</small><b>${num(somar(hoje, 'pronto'), 0)}</b></div>
        <div class="mac-cont"><small>Em produção</small><b>${num(somar(hoje, 'em_producao'), 0)}</b></div>
        <button class=${'mac-cont botao' + (qChegando > 0 ? ' chegando' : '')} onClick=${exigir(() => setReceber(true))} disabled=${!chegando.length}>
          <small>Chegando da pesagem</small><b>${num(qChegando, 0)}</b>${chegando.length > 0 && html`<span class="mac-acao">Receber</span>`}</button>
        <button class="mac-cont botao" onClick=${exigir(() => setAvulsa(true))}><small>Farinha para máquina, óleo…</small><b class="mac-txt">Saída avulsa</b></button>
      </div>
    </div>


    <div class="mac-grade">
      ${maceiras.map((m) => {
        const s = semaforo(dados, m, fluxo.fluxo, fluxo.bateladas, agora);
        const prox = s.progs.filter((l) => l.pronto > 0 || l.a_caminho > 0 || l.na_pesagem > 0 || l.a_pesar > 0).sort((a, b) => a.prioridade - b.prioridade)[0];
        const nomesOp = (m.operadores || []).map((id) => dados.mapa.operador.get(id)?.nome).filter(Boolean);
        return html`<button class=${'mac-tile s-' + s.cor} key=${m.id} onClick=${() => setAberta(m)}>
          ${avisos.some((a) => a.maceira_id === m.id) && html`<div class="mac-mudou"><${Icone} nome="aviso" tam=${18} /> MUDANÇA</div>`}
          <div class="mac-tile-topo"><b class="mac-nome">${m.nome}</b>${m.capacidade_kg && html`<span class="mac-cap">${num(m.capacidade_kg, 0)} kg</span>`}</div>
          <div class="mac-linhas">${(m.linhas || []).map((id) => dados.mapa.linha.get(id)?.nome).filter(Boolean).join(' · ') || 'sem linha definida'}</div>
          ${nomesOp.length > 0 && html`<div class="mac-ops">👤 ${nomesOp.join(' · ')}</div>`}
          <div class="mac-status"><span class="mac-luz"></span><b>${s.rotulo}</b>${s.min !== null && s.cor !== 'cinza' && !s.batendo ? html`<small> · ${tempoTexto(s.min)} sem iniciar</small>` : ''}</div>
          ${s.batendo && html`<div class="mac-batendo">${dados.mapa.ficha.get(s.batendo.ficha_id)?.nome}</div>`}
          <div class="mac-prox">${prox ? html`<span>Próxima: <b>${dados.mapa.ficha.get(prox.ficha_id)?.nome}</b></span>
              <span class="mac-num">${num(prox.pronto, 0)} pronta${prox.pronto === 1 ? '' : 's'} · ${num(somar(s.progs, 'pronto'), 0)} na fila</span>`
            : html`<span class="mac-sem">Sem nada programado para hoje</span>`}</div>
        </button>`;
      })}
    </div>
    <p class="nota">Semáforo: <span class="leg s-azul"></span> pronta para começar · <span class="leg s-verde"></span> no ritmo · <span class="leg s-laranja"></span> tempo médio em atraso · <span class="leg s-vermelho"></span> produção em atraso · <span class="leg s-cinza"></span> aguardando. É só um sinal: nada fica travado.</p>

    ${trocar && html`<${EntrarOperador} aoFechar=${() => setTrocar(false)} aoEntrar=${(o) => { setOperador(o); setTrocar(false); ultimo.current = Date.now(); }} />`}
    ${ciente && html`<${EntrarOperador} titulo="Quem viu o aviso?" aoFechar=${() => setCiente(false)}
      aoEntrar=${async (o) => { const r = await confirmarAvisos({ api, recarregar }, o, avisos); if (r !== null) { setCiente(false); setOperador(o); ultimo.current = Date.now(); } }} />`}
    ${aberta && html`<${MaceiraAberta} m=${aberta} fluxo=${fluxo} agora=${agora} opera=${opera} aoFechar=${() => setAberta(null)}
      aoIniciar=${exigir2(opera, operador, setTrocar, (p) => { setIniciar({ prog: p, maceira: aberta }); })} operador=${operador} />`}
    ${iniciar && html`<${IniciarBatelada} prog=${iniciar.prog} maceira=${iniciar.maceira} operador=${operador} fluxo=${fluxo} agora=${agora}
      aoFechar=${(ok) => { setIniciar(null); if (ok) setAberta(null); }} />`}
    ${receber && html`<${ReceberMisturas} chegando=${chegando} operador=${operador} aoFechar=${() => setReceber(false)} />`}
    ${avulsa && html`<${SaidaAvulsaPadeiro} operador=${operador} aoFechar=${() => setAvulsa(false)} />`}
  </div>`;
}
// ------------------------- AVISO DE MUDANÇA NA PROGRAMAÇÃO -------------------------
// Faixa grande e chamativa; só some quando um padeiro toca em ENTENDI e confirma com nome + senha.
function FaixaMudanca({ avisos, opera, aoEntendi }) {
  const { dados } = useApp();
  const porMac = new Map();
  avisos.forEach((a) => { const k = a.maceira_id || 0; if (!porMac.has(k)) porMac.set(k, []); porMac.get(k).push(a); });
  const ultimo = avisos.reduce((u, a) => (String(a.criado_em) > String(u.criado_em) ? a : u), avisos[0]);
  const quem = dados.mapa.perfil.get(ultimo.criado_por)?.nome;
  return html`<section class="faixa-mudanca" role="alert" aria-live="assertive">
    <div class="fm-titulo"><${Icone} nome="aviso" tam=${40} /><span>MUDANÇA NA PROGRAMAÇÃO</span></div>
    <div class="fm-lista">${[...porMac.entries()].map(([mid, l]) => html`<div class="fm-mac">
      <b class="fm-nome">${dados.mapa.maceira.get(mid)?.nome || 'Produção'}</b>
      <ul>${l.sort((a, b) => a.id - b.id).map((a) => html`<li>${a.texto}</li>`)}</ul></div>`)}</div>
    <p class="fm-nota">A batelada que já está batendo <b>continua normalmente</b>. A mudança vale a partir da <b>próxima</b>.</p>
    <p class="fm-quem">${quem ? `Mudado por ${quem.split(' ')[0]}` : 'Mudança'} às ${hora(ultimo.criado_em)}</p>
    ${opera ? html`<button class="fm-botao" onClick=${aoEntendi}><${Icone} nome="finalizar" tam=${30} /> ENTENDI</button>`
      : html`<p class="fm-nota">Aguardando o padeiro confirmar no tablet.</p>`}
  </section>`;
}
async function confirmarAvisos({ api, recarregar }, o, avisos) {
  try {
    await api.rpc('confirmar_avisos_producao', { p: { ids: avisos.map((a) => a.id), operador_id: o.id, pin: o.pin } });
    avisar(`Obrigado, ${o.nome.split(' ')[0]}! Aviso confirmado.`);
    await recarregar(true);
    return true;
  } catch (e) { avisar(mensagemErro(e), 'erro'); return null; }
}
// bipe curto + vibração quando chega aviso novo (chama a atenção no barulho da fábrica)
function useAlertaSonoro(qtdAvisos) {
  const antes = useRef(qtdAvisos);
  useEffect(() => {
    if (qtdAvisos > antes.current) {
      try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch { /* sem vibração */ }
      try {
        const C = window.AudioContext || window.webkitAudioContext; const ctx = new C();
        [0, 0.35].forEach((t) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.25;
          o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22); });
        setTimeout(() => ctx.close(), 1200);
      } catch { /* aparelho sem som */ }
    }
    antes.current = qtdAvisos;
  }, [qtdAvisos]);
}

const exigir2 = (opera, operador, setTrocar, f) => (...a) => { if (!opera) return avisar('Só o padeiro (ou o PCP) opera esta tela.', 'aviso'); if (!operador) return setTrocar(true); return f(...a); };

// ------------------------- entrar: nome + senha de 6 números -------------------------
function EntrarOperador({ aoFechar, aoEntrar, titulo }) {
  const { dados, api } = useApp();
  const [quem, setQuem] = useState(null);
  const [pin, setPin] = useState('');
  const [ocupado, executar] = useAcao();
  const ops = dados.operadores.filter((o) => o.ativo).sort((a, b) => a.nome.localeCompare(b.nome));
  async function tecla(d) {
    if (d === 'apagar') return setPin((p) => p.slice(0, -1));
    const novo = (pin + d).slice(0, 6);
    setPin(novo);
    if (novo.length === 6) {
      const r = await executar(() => api.rpc('entrar_operador', { p_operador: quem.id, p_pin: novo }));
      if (r) aoEntrar({ id: quem.id, nome: quem.nome, pin: novo }); else setPin('');
    }
  }
  return html`<${Modal} titulo=${quem ? `Senha de ${quem.nome}` : (titulo || 'Quem está trabalhando?')} aoFechar=${aoFechar} largo>
    ${!quem ? html`<div class="op-grade">${ops.map((o) => html`<button class="op-botao" onClick=${() => { setQuem(o); setPin(''); }}>
        <span class="mac-avatar grande">${o.nome.slice(0, 1)}</span><b>${o.nome}</b></button>`)}</div>
      ${!ops.length && html`<${Vazio} texto="Nenhum padeiro cadastrado. O PCP cadastra em Cadastros › Masseiras, linhas e padeiros." />`}`
    : html`<div class="pin">
        <div class="pin-pontos">${[0, 1, 2, 3, 4, 5].map((i) => html`<span class=${i < pin.length ? 'cheio' : ''}></span>`)}</div>
        <div class="pin-teclado">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'voltar', '0', 'apagar'].map((d) => d === 'voltar'
          ? html`<button class="pin-tecla sec" onClick=${() => { setQuem(null); setPin(''); }}>‹ Nomes</button>`
          : html`<button class=${'pin-tecla' + (d === 'apagar' ? ' sec' : '')} disabled=${ocupado} onClick=${() => tecla(d)}>${d === 'apagar' ? '⌫' : d}</button>`)}</div>
        ${api.modo === 'demo' && html`<p class="nota">Demonstração: a senha de todos os padeiros é <b>123456</b>.</p>`}
      </div>`}
  </${Modal}>`;
}

// ------------------------- maceira aberta: fila por prioridade -------------------------
function MaceiraAberta({ m, fluxo, agora, opera, aoFechar, aoIniciar, operador }) {
  const { dados } = useApp();
  const [acao, setAcao] = useState(null);
  const [foraOrdem, setForaOrdem] = useState(null);   // produção escolhida que não é a 1ª da fila
  const s = semaforo(dados, m, fluxo.fluxo, fluxo.bateladas, agora);
  const hoje = hojeISO();
  const fila = s.progs.filter((l) => !l.finalizada).sort((a, b) => (a.prioridade ?? 999) - (b.prioridade ?? 999));
  // a "1ª da fila" é a primeira (ordem do PCP) que ainda tem batelada para iniciar e mistura pronta ou chegando
  const primeira = fila.find((l) => l.iniciado < l.programado && (l.pronto > 0 || l.a_caminho > 0));
  const iniciar = (l, extra) => (primeira && l.programacao_id !== primeira.programacao_id
    ? setForaOrdem({ l, extra }) : aoIniciar({ ...l, maceira_destino: m.id, ...extra }));
  const batidas = fluxo.bateladas.filter((b) => b.maceira_id === m.id && b.situacao !== 'cancelada' && diaDe(b.iniciada_em) === hoje).sort((a, b) => String(b.iniciada_em).localeCompare(String(a.iniciada_em)));
  const eventos = useEventos(fila.map((l) => l.programacao_id));
  return html`<${Modal} titulo=${m.nome} aoFechar=${aoFechar} largo>
    <div class=${'mac-faixa s-' + s.cor}><span class="mac-luz"></span><b>${s.rotulo}</b>
      <span>${s.batendo ? `começou há ${tempoTexto(s.batendo.min)}` : s.min !== null && s.cor !== 'cinza' ? `${tempoTexto(s.min)} sem iniciar` : ''} · tempo médio ${s.T} min</span></div>
    <div class="titulo-com-acao"><h3>Fila desta masseira (ordem do PCP)</h3></div>
    ${!fila.length ? html`<${Vazio} texto="Nada programado para esta masseira hoje." />`
      : html`<div class="fila">${fila.map((l, i) => {
        const f = dados.mapa.ficha.get(l.ficha_id);
        const podeIniciar = l.pronto > 0;
        return html`<div class=${'fila-item' + (podeIniciar ? ' pronto' : '')} key=${l.programacao_id}>
          <div class="fila-pos">${i + 1}º</div>
          <div class="fila-info"><b>${f?.nome}</b>
            <div class="fila-nums">
              <span>Programado <b>${num(l.programado, 0)}</b></span>
              <span class="n-pronto">Pronto p/ iniciar <b>${num(l.pronto, 0)}</b></span>
              <span>A caminho <b>${num(l.a_caminho, 0)}</b></span>
              <span>Na pesagem <b>${num(l.a_pesar + l.na_pesagem, 0)}</b></span>
              <span>Iniciadas <b>${num(l.iniciado, 0)}</b></span>
            </div>
            <small class="fila-horas"><${LinhaTempo} p=${{ id: l.programacao_id, quantidade: l.programado }} ev=${eventos.get(l.programacao_id)} bateladas=${fluxo.bateladas} curta /></small>
            ${l.operador_id && html`<small>Padeiro sugerido: ${dados.mapa.operador.get(l.operador_id)?.nome}</small>`}
          </div>
          <div class="fila-acoes">
            ${podeIniciar ? html`<button class="btn btn-pri btn-gigante" disabled=${!opera} onClick=${() => iniciar(l, {})}><${Icone} nome="play" tam=${18} /> Iniciar 1 batelada</button>`
              : l.a_caminho > 0 ? html`<button class="btn btn-destaque btn-gigante" disabled=${!opera} onClick=${() => iniciar(l, { receber: true })}>Receber e iniciar</button>`
              : html`<span class="fila-espera">${l.iniciado >= l.programado ? 'Tudo iniciado ✔' : 'Aguardando a pesagem'}</span>`}
            ${opera && l.pronto > 0 && html`<button class="btn-link" onClick=${() => setAcao(l)}>devolver / perda</button>`}
          </div>
        </div>`;
      })}</div>`}
    <h3>Bateladas de hoje nesta masseira</h3>
    ${batidas.length ? html`<div class="batidas">${batidas.slice(0, 12).map((b, i) => html`<span class=${'batida ' + b.situacao}>
      <b>${batidas.length - i}ª</b> · iniciada ${hora(b.iniciada_em)} · ${dados.mapa.ficha.get(b.ficha_id)?.nome} · ${dados.mapa.operador.get(b.operador_id)?.nome || ''}
      ${b.situacao === 'finalizada' ? ' ✔' : ''}</span>`)}</div>` : html`<p class="nota">Nenhuma batelada iniciada hoje.</p>`}
    ${acao && html`<${DevolverPerda} l=${acao} operador=${operador} aoFechar=${() => setAcao(null)} />`}
    ${foraOrdem && html`<${Modal} semProtecao titulo="Atenção: esta não é a 1ª da fila" aoFechar=${() => setForaOrdem(null)}>
      <div class="fora-ordem">
        <p>A 1ª da fila agora é <b>${dados.mapa.ficha.get(primeira?.ficha_id)?.nome}</b>.</p>
        <p>Você escolheu <b>${dados.mapa.ficha.get(foraOrdem.l.ficha_id)?.nome}</b>.</p>
        <p class="fo-pergunta">Você <b>já colocou os ingredientes</b> na masseira?</p>
        <button class="btn btn-pri btn-gigante btn-bloco" onClick=${() => { const x = foraOrdem; setForaOrdem(null); aoIniciar({ ...x.l, maceira_destino: m.id, ...x.extra }); }}>
          SIM, iniciar mesmo assim</button>
        <button class="btn btn-sec btn-gigante btn-bloco" onClick=${() => setForaOrdem(null)}>NÃO, voltar</button>
        <p class="nota">Fica registrado que foi iniciada fora da ordem. O engenheiro acompanha.</p>
      </div></${Modal}>`}
  </${Modal}>`;
}

// ------------------------- iniciar 1 batelada -------------------------
function IniciarBatelada({ prog, maceira, operador, fluxo, agora, aoFechar }) {
  const { dados, api, recarregar } = useApp();
  const f = dados.mapa.ficha.get(prog.ficha_id);
  const pg = dados.programacoes.find((p) => p.id === prog.programacao_id);
  const mp = dados.mapa.produto;
  const dep = localTipo(dados, 'deposito');
  const m = dados.mapa.maceira.get(prog.maceira_destino) || maceira;
  // itens da maceira: da programação alterada pelo PCP ou da ficha
  const base = (pg?.itens_alterados ? pg.itens_alterados.map((i) => ({ produto_id: i.produto_id, quantidade: Number(i.quantidade) }))
    : dados.fichaItens.filter((i) => i.ficha_id === prog.ficha_id).map((i) => ({ produto_id: i.produto_id, quantidade: Number(i.quantidade) })))
    .filter((i) => { const p = mp.get(i.produto_id); return p?.categoria === 'materia_prima' && p.usado_na === 'maceira' && p.baixa_producao; });
  const [itens, setItens] = useState(() => base.map((i) => ({ ...i, padrao: i.quantidade, original: i.produto_id, editar: false, txt: String(i.quantidade).replace('.', ',') })));
  const [trocando, setTrocando] = useState(null);
  const [ocupado, executar] = useAcao();
  const s = semaforo(dados, m, fluxo.fluxo, fluxo.bateladas, agora);
  const totalKg = itens.reduce((t, i) => t + (['kg'].includes(mp.get(i.produto_id)?.unidade_estoque) ? Number(i.quantidade) : 0), 0)
    + dados.fichaItens.filter((i) => i.ficha_id === prog.ficha_id && mp.get(i.produto_id)?.usado_na !== 'maceira' && mp.get(i.produto_id)?.categoria === 'materia_prima' && mp.get(i.produto_id)?.unidade_estoque === 'kg').reduce((t, i) => t + Number(i.quantidade), 0);
  const mudar = (k, ch) => setItens((l) => l.map((x, j) => (j === k ? { ...x, ...ch } : x)));
  const passo = (q) => (q >= 10 ? 0.5 : 0.1);
  async function ok() {
    if (s.batendo && !(await confirmar({ titulo: `${m.nome} já está batendo`, ok: 'Iniciar mesmo assim', mensagem: `Começou ${dados.mapa.ficha.get(s.batendo.ficha_id)?.nome} há ${tempoTexto(s.batendo.min)}. Confirma que vai iniciar outra batelada agora?` }))) return;
    if (m.capacidade_kg && totalKg > Number(m.capacidade_kg) * 1.001
      && !(await confirmar({ titulo: 'Acima da capacidade', ok: 'Iniciar mesmo assim', mensagem: `A massa tem cerca de ${num(totalKg, 0)} kg e a ${m.nome} é de ${num(m.capacidade_kg, 0)} kg.` }))) return;
    const r = await executar(() => api.rpc('iniciar_batelada', { p: { programacao_id: prog.programacao_id, maceira_id: m.id, operador_id: operador.id, pin: operador.pin,
      receber: !!prog.receber, itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: Number(i.quantidade), padrao: i.padrao, trocou_de: i.produto_id !== i.original ? i.original : null })) } }),
      `Batelada iniciada: ${f?.nome} na ${m.nome}.`);
    if (r) { await recarregar(true); aoFechar(true); }
  }
  return html`<${Modal} titulo=${`Iniciar 1 batelada · ${f?.nome}`} aoFechar=${() => aoFechar(false)} largo
    rodape=${html`<button class="btn btn-sec btn-grande" onClick=${() => aoFechar(false)}>Voltar</button>
      <button class="btn btn-pri btn-gigante" disabled=${ocupado} onClick=${ok}><${Icone} nome="play" tam=${20} /> ${ocupado ? 'Iniciando…' : 'INICIAR'}</button>`}>
    <div class="ini-cab"><span>👤 <b>${operador?.nome}</b></span><span>🛢 <b>${m.nome}</b>${m.capacidade_kg ? ` (${num(m.capacidade_kg, 0)} kg)` : ''}</span>
      ${prog.receber && html`<${Etiqueta} cor="laranja">vai receber a mistura que está a caminho</${Etiqueta}>`}</div>
    ${pg?.itens_alterados && html`<div class="alerta">O PCP alterou a receita nesta programação.</div>`}
    <p class="nota">Pegue no Depósito Produção e coloque na masseira:</p>
    <div class="ini-itens">${itens.map((i, k) => {
      const p = mp.get(i.produto_id);
      const sal = dep ? saldoLocal(dados, i.produto_id, dep.id).disponivel : null;
      const ferm = ehFermento(p);
      return html`<div class=${'ini-item' + (ferm ? ' fermento' : '')} key=${k}>
        <div class="ini-nome"><b>${p?.descricao}</b><small>${[p?.marca, sal !== null && `estoque ${qu(sal, p?.unidade_estoque)}`].filter(Boolean).join(' · ')}</small>
          ${i.produto_id !== i.original && html`<${Etiqueta} cor="laranja">trocada (era ${mp.get(i.original)?.descricao})</${Etiqueta}>`}</div>
        ${ferm ? html`<div class="ini-stepper">
            <button class="btn btn-sec btn-quadrado grande" onClick=${() => { const v = Math.max(Math.round((Number(i.quantidade) - passo(i.quantidade)) * 100) / 100, 0); mudar(k, { quantidade: v, txt: String(v).replace('.', ',') }); }}>−</button>
            <div class="ini-valor"><input class="entrada" inputmode="decimal" value=${i.txt} onInput=${(e) => mudar(k, { txt: e.target.value, quantidade: n(e.target.value) || 0 })} /><small>${p?.unidade_estoque} · média da ficha ${qtd(i.padrao)}</small></div>
            <button class="btn btn-sec btn-quadrado grande" onClick=${() => { const v = Math.round((Number(i.quantidade) + passo(i.quantidade)) * 100) / 100; mudar(k, { quantidade: v, txt: String(v).replace('.', ',') }); }}>+</button>
          </div>`
        : html`<div class="ini-conf">
            ${i.editar ? html`<div class="ini-valor"><input class="entrada" inputmode="decimal" value=${i.txt} onInput=${(e) => mudar(k, { txt: e.target.value, quantidade: n(e.target.value) || 0 })} /><small>${p?.unidade_estoque}</small></div>`
              : html`<b class="ini-qtd">${qu(i.quantidade, p?.unidade_estoque)}</b>`}
            <span class="ini-ok">✓</span>
            <button class="btn btn-sec btn-peq" onClick=${() => setTrocando(k)} title="Acabou esta? Trocar por outra que tenha no estoque"><${Icone} nome="trocar" tam=${14} /> Trocar</button>
            <button class="btn-icone discreto" title="Alterar a quantidade (só em caso atípico)" onClick=${() => mudar(k, { editar: !i.editar })}><${Icone} nome="lapis" tam=${15} /></button>
          </div>`}
      </div>`;
    })}</div>
    ${!itens.length && html`<p class="nota">Esta receita não tem itens marcados como "usado na masseira" (farinha/fermento).</p>`}
    ${trocando !== null && html`<${TrocarFarinha} atual=${itens[trocando]} aoFechar=${() => setTrocando(null)}
      aoEscolher=${(id) => { mudar(trocando, { produto_id: id }); setTrocando(null); }} />`}
  </${Modal}>`;
}

function TrocarFarinha({ atual, aoFechar, aoEscolher }) {
  const { dados } = useApp();
  const dep = localTipo(dados, 'deposito');
  const p0 = dados.mapa.produto.get(atual.produto_id);
  const opcoes = dados.produtos.filter((p) => p.ativo && p.categoria === 'materia_prima' && p.usado_na === 'maceira' && p.id !== atual.produto_id
      && (ehFarinha(p0) ? ehFarinha(p) : (p.grupo || '') === (p0?.grupo || '')))
    .map((p) => ({ p, s: dep ? saldoLocal(dados, p.id, dep.id).disponivel : 0 }))
    .sort((a, b) => b.s - a.s);
  return html`<${Modal} titulo=${`Trocar ${p0?.descricao}`} aoFechar=${aoFechar}>
    <p class="nota">Só as que têm estoque aparecem primeiro. A quantidade continua a mesma (${qu(atual.quantidade, p0?.unidade_estoque)}).</p>
    <div class="opcoes">${opcoes.map(({ p, s }) => html`<button class="opcao" disabled=${s <= 0} onClick=${() => aoEscolher(p.id)}>
      <span><b>${p.descricao}</b><small>${[p.marca, p.classificacao && `classificação ${p.classificacao}`].filter(Boolean).join(' · ')} · estoque ${qu(s, p.unidade_estoque)}</small></span></button>`)}</div>
    ${!opcoes.length && html`<${Vazio} texto="Não há outra opção cadastrada." />`}
  </${Modal}>`;
}

// ------------------------- receber misturas da pesagem -------------------------
function ReceberMisturas({ chegando, operador, aoFechar }) {
  const { dados, api, recarregar } = useApp();
  const [ocupado, executar] = useAcao();
  async function receber(t) {
    const r = await executar(() => api.rpc('receber_transferencia', { p: { id: t.id, operador_id: operador.id, pin: operador.pin } }), 'Recebido.');
    if (r !== null) await recarregar(true);
  }
  async function receberTudo() {
    for (const t of chegando) { const r = await executar(() => api.rpc('receber_transferencia', { p: { id: t.id, operador_id: operador.id, pin: operador.pin } })); if (r === null) break; }
    await recarregar(true); avisar('Tudo recebido.'); aoFechar();
  }
  return html`<${Modal} titulo="Chegando da pesagem" aoFechar=${aoFechar} largo
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Fechar</button>${chegando.length > 1 && html`<button class="btn btn-pri btn-grande" disabled=${ocupado} onClick=${receberTudo}>Receber tudo</button>`}`}>
    ${!chegando.length ? html`<${Vazio} texto="Nada a caminho agora." />` : html`<div class="lista-receber">${chegando.map((t) => html`<div class="receber-item" key=${t.id}>
      <div><b>Transferência nº ${t.id}</b><small>enviado ${t.enviado_em ? `há ${tempoTexto(minutos(t.enviado_em))}` : ''}</small>
        <ul>${dados.transfItens.filter((i) => i.transferencia_id === t.id).map((i) => html`<li><b>${num(i.quantidade, 0)}</b> × ${dados.mapa.produto.get(i.produto_id)?.descricao}</li>`)}</ul></div>
      <button class="btn btn-pri btn-grande" disabled=${ocupado} onClick=${() => receber(t)}>Receber</button></div>`)}</div>`}
  </${Modal}>`;
}

// ------------------------- devolver mistura à pesagem / perda -------------------------
function DevolverPerda({ l, operador, aoFechar }) {
  const { dados, api, recarregar } = useApp();
  const [q, setQ] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [ocupado, executar] = useAcao();
  const mis = misturaDaFicha(dados, l.ficha_id);
  const mac = localTipo(dados, 'maceiras'); const pes = localTipo(dados, 'pesagem');
  async function devolver() {
    if (!(n(q) > 0) || n(q) > l.pronto) return avisar(`Informe de 1 a ${num(l.pronto, 0)}.`, 'erro');
    const r = await executar(() => api.rpc('criar_transferencia', { p: { origem_id: mac.id, destino_id: pes.id, enviar: true, operador_id: operador.id, pin: operador.pin,
      observacao: motivo || 'Devolvido pela masseira', itens: [{ produto_id: mis.id, quantidade: n(q), programacao_id: l.programacao_id }] } }), 'Devolvido para a pesagem.');
    if (r) { await recarregar(true); aoFechar(); }
  }
  async function perda() {
    if (!motivo.trim()) return avisar('Escreva o motivo da perda.', 'erro');
    if (!(n(q) > 0)) return avisar('Informe a quantidade.', 'erro');
    const r = await executar(() => api.rpc('registrar_perda', { p: { local_id: mac.id, produto_id: mis.id, quantidade: n(q), motivo, programacao_id: l.programacao_id,
      operador_id: operador.id, pin: operador.pin } }), 'Perda registrada.');
    if (r) { await recarregar(true); aoFechar(); }
  }
  return html`<${Modal} titulo=${`Mistura de ${dados.mapa.ficha.get(l.ficha_id)?.nome}`} aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-perigo-sec" disabled=${ocupado} onClick=${perda}>Registrar perda</button><span class="espaco"></span>
      <button class="btn btn-pri" disabled=${ocupado} onClick=${devolver}>Devolver à pesagem</button>`}>
    <p>Prontas aqui: <b>${num(l.pronto, 0)}</b>. Mudou a prioridade? Devolva à pesagem ou deixe aqui pendente. A mistura não volta a ser matéria-prima: ou é produzida ou vira perda.</p>
    <div class="grade"><${Campo} rotulo="Quantas"><${Numero} valor=${q} aoMudar=${setQ} /></${Campo}>
      <${Campo} rotulo="Motivo / observação"><input class="entrada" value=${motivo} onInput=${(e) => setMotivo(e.target.value)} placeholder="ex.: priorizar bisnaguinha" /></${Campo}></div>
  </${Modal}>`;
}

// ------------------------- saída avulsa do padeiro -------------------------
const MOTIVOS = ['Polvilhar máquinas', 'Untar formas', 'Derramou / perda', 'Teste de massa'];
function SaidaAvulsaPadeiro({ operador, aoFechar }) {
  const { dados, api, recarregar } = useApp();
  const dep = localTipo(dados, 'deposito');
  const [local, setLocal] = useState(dep?.id || null);
  const [prod, setProd] = useState(null);
  const [q, setQ] = useState('');
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [obs, setObs] = useState('');
  const [ocupado, executar] = useAcao();
  const locais = dados.locais.filter((l) => l.ativo && ['deposito', 'maceiras'].includes(l.tipo));
  const produtos = dados.produtos.filter((p) => p.ativo && p.controla_estoque && saldoLocal(dados, p.id, local).disponivel > 0);
  const p = dados.mapa.produto.get(prod);
  async function ok() {
    if (!prod || !(n(q) > 0)) return avisar('Escolha o produto e a quantidade.', 'erro');
    const r = await executar(() => api.rpc('registrar_saida', { p: { tipo: 'saida_avulsa', local_id: local, operador_id: operador.id, pin: operador.pin, motivo, observacao: obs || null,
      itens: [{ produto_id: prod, quantidade: n(q), unidade: p.unidade_estoque }] } }), 'Saída avulsa registrada.');
    if (r) { await recarregar(true); aoFechar(); }
  }
  return html`<${Modal} titulo="Saída avulsa" aoFechar=${aoFechar}
    rodape=${html`<button class="btn btn-sec" onClick=${aoFechar}>Voltar</button><button class="btn btn-pri btn-grande" disabled=${ocupado} onClick=${ok}>Dar baixa</button>`}>
    <p class="nota">Para o que sai fora da receita (farinha para a máquina, óleo para untar…). Não entra no custo do pão: fica num relatório próprio.</p>
    <div class="chips">${locais.map((l) => html`<button class=${'chip' + (local === l.id ? ' ativo' : '')} aria-pressed=${!!(local === l.id)} onClick=${() => { setLocal(l.id); setProd(null); }}>${l.nome}</button>`)}</div>
    <${Campo} rotulo="Produto"><${Escolher} itens=${produtos} valor=${prod} aoMudar=${setProd} rotuloDe=${(x) => `${x.descricao}`}
      detalheDe=${(x) => [x.marca, `estoque ${qu(saldoLocal(dados, x.id, local).disponivel, x.unidade_estoque)}`].filter(Boolean).join(' · ')} /></${Campo}>
    <${Campo} rotulo=${`Quantidade${p ? ` (${p.unidade_estoque})` : ''}`}><${Numero} valor=${q} aoMudar=${setQ} /></${Campo}>
    <div class="chips">${MOTIVOS.map((m) => html`<button class=${'chip' + (motivo === m ? ' ativo' : '')} aria-pressed=${!!(motivo === m)} onClick=${() => setMotivo(m)}>${m}</button>`)}</div>
    <${Campo} rotulo="Observação (opcional)"><input class="entrada" value=${obs} onInput=${(e) => setObs(e.target.value)} /></${Campo}>
  </${Modal}>`;
}
