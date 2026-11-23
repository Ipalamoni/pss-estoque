// =====================================================================
// AVISO DE MUDANÇA NA PRODUÇÃO (tablet das masseiras e tela da pesagem)
// Faixa AMARELA com "AVISO" em vermelho. Tudo em letra grande:
//   · o QUE MUDOU em vermelho (ex.: "BISNAGUINHA passou para o 1º lugar: PRIORIDADE MÁXIMA.")
//   · a nova ordem e o que fazer, em preto
// Só some com ENTENDI (padeiro: nome + senha; pesagem: o próprio login). Fica registrado.
// =====================================================================
import { html, useEffect, useRef, useApp } from './ui.js';
import { Icone } from './icones.js';
import { hojeISO } from './util.js';
import { hora } from './producao-util.js';

// o que a pessoa deve fazer (fixo, em preto)
const INSTRUCAO = {
  masseira: [
    html`A batelada que já está batendo <b>continua normalmente</b>.`,
    html`Se a base ainda <b>não chegou</b>: continue o que está fazendo.`,
    html`<b>Quando a base chegar: receba e faça na nova ordem.</b>`,
  ],
  pesagem: [
    html`O que você já está pesando <b>continua normalmente</b>.`,
    html`<b>Depois, pese na nova ordem.</b> A lista abaixo já está atualizada.`,
  ],
};

export function FaixaAviso({ avisos, setor = 'masseira', podeConfirmar, aoEntendi, esperando }) {
  const { dados } = useApp();
  // agrupa por masseira (no tablet aparecem as 4); na pesagem é um grupo só
  const grupos = new Map();
  [...avisos].sort((a, b) => a.id - b.id).forEach((a) => {
    const k = setor === 'pesagem' ? 0 : a.maceira_id || 0;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(a);
  });
  const ultimo = avisos.reduce((u, a) => (String(a.criado_em) > String(u.criado_em) ? a : u), avisos[0]);
  const quem = dados.mapa.perfil.get(ultimo.criado_por)?.nome;
  const urgente = avisos.some((a) => a.tipo === 'urgente');
  const hoje = hojeISO();
  return html`<section class="faixa-aviso" role="alert" aria-live="assertive">
    <div class="fa-topo"><${Icone} nome="aviso" tam=${46} /><span class="fa-aviso">${urgente ? 'URGENTE' : 'AVISO'}</span></div>
    <p class="fa-sub">${setor === 'pesagem' ? 'Mudou a ordem da pesagem' : 'Mudou a ordem da produção'}</p>
    <div class="fa-grupos">${[...grupos.entries()].map(([k, l]) => {
      // ordem ATUAL da masseira (calculada agora: o texto guardado no aviso pode ter ficado velho)
      const fila = setor === 'pesagem' ? [] : dados.programacoes.filter((p) => p.maceira_id === k && p.data === hoje && p.situacao === 'ativa' && !p.finalizada_em)
        .sort((a, b) => (a.prioridade ?? 999) - (b.prioridade ?? 999) || a.id - b.id).slice(0, 6);
      const det = fila.length ? `Ordem agora: ${fila.map((p, i) => `${i + 1}º ${dados.mapa.ficha.get(p.ficha_id)?.nome || ''}`).join(' · ')}` : '';
      return html`<div class="fa-grupo" key=${k}>
        ${setor !== 'pesagem' && html`<b class="fa-mac">${dados.mapa.maceira.get(k)?.nome || 'Produção'}</b>`}
        <ul class="fa-mudou">${l.map((a) => html`<li key=${a.id}>${a.texto}</li>`)}</ul>
        ${det && html`<p class="fa-ordem">${det}</p>`}
      </div>`;
    })}</div>
    <ul class="fa-instrucao">${INSTRUCAO[setor].map((t, i) => html`<li key=${i}>${t}</li>`)}</ul>
    <p class="fa-quem">${quem ? `Mudado por ${quem.split(' ')[0]}` : 'Mudança'} às ${hora(ultimo.criado_em)}</p>
    ${podeConfirmar ? html`<button class="fa-botao" onClick=${aoEntendi}><${Icone} nome="finalizar" tam=${32} /> ENTENDI</button>`
      : html`<p class="fa-esperando">${esperando || 'Aguardando confirmar.'}</p>`}
  </section>`;
}

// bipe curto + vibração quando chega aviso novo (chama a atenção no barulho da fábrica)
export function useAlertaSonoro(qtdAvisos) {
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

// avisos ainda não vistos de um setor
export const avisosPendentes = (dados, setor) => (dados.avisos || []).filter((a) => !a.ciente_em && (a.setor || 'masseira') === setor);
