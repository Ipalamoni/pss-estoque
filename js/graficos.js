// =====================================================================
// graficos.js — gráficos simples (sem biblioteca), nas cores da PSS
// Paleta: verde-escuro + laranja-claro, com luminosidade bem diferente (dá para
// distinguir em preto e branco e com daltonismo). As cores vêm do CSS (--serie-1/2),
// que tem versão própria no tema escuro.
// =====================================================================
import { html, useState, useEffect, useRef } from './ui.js';

export const COR_SERIE = ['var(--serie-1)', 'var(--serie-2)'];

// Barras horizontais ordenadas (uma série, uma cor). Rótulo à esquerda,
// valor à direita, dica ao passar o mouse/tocar.
// itens: [{ rotulo, valor, texto?, sub?, dica? }]
export function BarrasH({ itens, formatar = String, cor = COR_SERIE[0], vazio = 'Sem dados no período.', aoClicar }) {
  const max = Math.max(0, ...itens.map((i) => Number(i.valor) || 0));
  if (!itens.length || max <= 0) return html`<p class="nota">${vazio}</p>`;
  return html`<div class="barras-h" role="list">
    ${itens.map((i) => {
      const w = Math.max(0, (Number(i.valor) / max) * 100);
      return html`<div class=${'bh-linha' + (aoClicar ? ' clicavel' : '')} role="listitem" title=${i.dica || `${i.rotulo}: ${i.texto || formatar(i.valor)}`}
        onClick=${aoClicar ? () => aoClicar(i) : undefined}>
        <span class="bh-rotulo">${i.rotulo}${i.sub && html`<small>${i.sub}</small>`}</span>
        <span class="bh-trilho" aria-hidden="true"><span class="bh-barra" style=${{ width: `${w}%`, background: cor }}></span></span>
        <span class="bh-valor">${i.texto || formatar(i.valor)}</span>
        ${i.dica && html`<span class="so-leitor">${i.dica}</span>`}
      </div>`;
    })}
  </div>`;
}

// Colunas agrupadas (até 2 séries) com eixo, grade discreta, legenda e dica.
// categorias: ['jun', 'jul', ...]; series: [{ nome, valores: [] }]
export function Colunas({ categorias, series, formatar = String, formatarEixo = formatar, altura = 220 }) {
  const [foco, setFoco] = useState(null);
  const [larg, setLarg] = useState(640);
  const caixa = useRef();
  useEffect(() => {   // desenha na largura real (o texto do eixo não encolhe no celular)
    if (!caixa.current || !window.ResizeObserver) return;
    const ro = new ResizeObserver(([e]) => setLarg(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(caixa.current); return () => ro.disconnect();
  }, []);
  const W = larg, H = altura, m = { e: 58, d: 6, t: 10, b: 26 };
  const max = Math.max(0, ...series.flatMap((s) => s.valores.map(Number)));
  if (max <= 0) return html`<p class="nota">Sem dados no período.</p>`;
  const passo = escala(max);
  const topo = Math.ceil(max / passo) * passo;
  const gw = (W - m.e - m.d) / categorias.length;
  const bw = Math.max(4, Math.min(28, (gw - 12) / series.length));
  const y = (v) => m.t + (H - m.t - m.b) * (1 - v / topo);
  const marcas = []; for (let v = 0; v <= topo + 1e-9; v += passo) marcas.push(v);
  const resumo = (i) => `${categorias[i]}: ${series.map((s) => `${s.nome} ${formatar(s.valores[i])}`).join(', ')}`;
  return html`<div class="colunas">
    ${series.length > 1 && html`<div class="legenda-graf" aria-hidden="true">${series.map((s, k) => html`<span><i style=${{ background: COR_SERIE[k] }}></i>${s.nome}</span>`)}</div>`}
    <table class="so-leitor"><caption>${series.map((s) => s.nome).join(' e ')}</caption>
      <thead><tr><th scope="col">Período</th>${series.map((s) => html`<th scope="col">${s.nome}</th>`)}</tr></thead>
      <tbody>${categorias.map((c, i) => html`<tr><th scope="row">${c}</th>${series.map((s) => html`<td>${formatar(s.valores[i])}</td>`)}</tr>`)}</tbody></table>
    <div class="colunas-area" ref=${caixa} aria-hidden="true">
      <svg viewBox=${`0 0 ${W} ${H}`} width=${W} height=${H} onMouseLeave=${() => setFoco(null)}>
        ${marcas.map((v) => html`<g><line x1=${m.e} x2=${W - m.d} y1=${y(v)} y2=${y(v)} class=${v === 0 ? 'eixo' : 'grade'} />
          <text x=${m.e - 6} y=${y(v) + 4} text-anchor="end" class="rot-eixo">${formatarEixo(v)}</text></g>`)}
        ${categorias.map((c, i) => {
          const x0 = m.e + gw * i + (gw - bw * series.length - 2 * (series.length - 1)) / 2;
          return html`<g onMouseEnter=${() => setFoco(i)} onClick=${() => setFoco(i)} onFocus=${() => setFoco(i)} onBlur=${() => setFoco(null)}
            tabindex="0" class="col-alvo" aria-label=${resumo(i)}>
            <rect x=${m.e + gw * i} y=${m.t} width=${gw} height=${H - m.t - m.b} class=${'alvo' + (foco === i ? ' ativo' : '')} />
            ${series.map((s, k) => { const v = Number(s.valores[i]) || 0; const h = Math.max(0, y(0) - y(v));
              return html`<path d=${coluna(x0 + k * (bw + 2), y(0), bw, h)} style=${{ fill: COR_SERIE[k] }} />`; })}
            <text x=${m.e + gw * i + gw / 2} y=${H - 8} text-anchor="middle" class="rot-eixo">${c}</text>
          </g>`;
        })}
      </svg>
      ${foco !== null && html`<div class="dica-grafico" style=${{ left: `${((m.e + gw * (foco + 0.5)) / W) * 100}%` }}>
        <b>${categorias[foco]}</b>${series.map((s, k) => html`<span><i style=${{ background: COR_SERIE[k] }}></i>${s.nome}: <b>${formatar(s.valores[foco])}</b></span>`)}
      </div>`}
    </div>
  </div>`;
}

// coluna com topo arredondado (4px) apoiada na linha de base
function coluna(x, base, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${base}V${base - h + r}Q${x},${base - h} ${x + r},${base - h}H${x + w - r}Q${x + w},${base - h} ${x + w},${base - h + r}V${base}Z`;
}
function escala(max) {
  const bruto = max / 4;
  const p = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 2.5, 5, 10].map((f) => f * p).find((v) => v >= bruto);
}

// Barra 100% (parte do todo, até 6 partes) — usada para "estoque + a caminho"
export function BarraParte({ partes, formatar = String }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (total <= 0) return null;
  return html`<div class="barra-parte">
    <div class="bp-trilho">${partes.map((p, k) => p.valor > 0 && html`<span title=${`${p.nome}: ${formatar(p.valor)} (${Math.round((p.valor / total) * 100)}%)`}
      style=${{ width: `${(p.valor / total) * 100}%`, background: COR_SERIE[k] }}></span>`)}</div>
    <div class="legenda-graf">${partes.map((p, k) => html`<span><i style=${{ background: COR_SERIE[k] }}></i>${p.nome}: <b>${formatar(p.valor)}</b> (${Math.round((p.valor / total) * 100)}%)</span>`)}</div>
  </div>`;
}

// Colunas EMPILHADAS (até 4 partes, cor fixa de cada parte) com eixo, grade discreta, legenda,
// dica ao passar o mouse/tocar, total no topo da coluna focada e tabela para leitor de tela.
// series: [{ nome, cor, valores: [] }] · aoClicar(i): ex. filtrar o mês
export function ColunasEmpilhadas({ categorias, series, formatar = String, formatarEixo = formatar, altura = 240, aoClicar, selecionada = null }) {
  const [foco, setFoco] = useState(null);
  const [larg, setLarg] = useState(640);
  const caixa = useRef();
  useEffect(() => {
    if (!caixa.current || !window.ResizeObserver) return;
    const ro = new ResizeObserver(([e]) => setLarg(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(caixa.current); return () => ro.disconnect();
  }, []);
  const W = larg, H = altura, m = { e: 62, d: 6, t: 12, b: 26 };
  const totais = categorias.map((_, i) => series.reduce((t, s) => t + (Number(s.valores[i]) || 0), 0));
  const max = Math.max(0, ...totais);
  if (max <= 0) return html`<p class="nota">Sem despesas neste período.</p>`;
  const passo = escala(max);
  const topo = Math.ceil(max / passo) * passo;
  const gw = (W - m.e - m.d) / categorias.length;
  const bw = Math.max(8, Math.min(40, gw - 10));
  const y = (v) => m.t + (H - m.t - m.b) * (1 - v / topo);
  const marcas = []; for (let v = 0; v <= topo + 1e-9; v += passo) marcas.push(v);
  const resumo = (i) => `${categorias[i]}: total ${formatar(totais[i])}; ${series.map((s) => `${s.nome} ${formatar(s.valores[i])}`).join(', ')}`;
  const ver = foco ?? selecionada;
  return html`<div class="colunas">
    <div class="legenda-graf">${series.map((s) => html`<span><i style=${{ background: s.cor }}></i>${s.nome}</span>`)}</div>
    <table class="so-leitor"><caption>${series.map((s) => s.nome).join(', ')} por mês</caption>
      <thead><tr><th scope="col">Mês</th>${series.map((s) => html`<th scope="col">${s.nome}</th>`)}<th scope="col">Total</th></tr></thead>
      <tbody>${categorias.map((c, i) => html`<tr><th scope="row">${c}</th>${series.map((s) => html`<td>${formatar(s.valores[i])}</td>`)}<td>${formatar(totais[i])}</td></tr>`)}</tbody></table>
    <div class="colunas-area" ref=${caixa}>
      <svg viewBox=${`0 0 ${W} ${H}`} width=${W} height=${H} onMouseLeave=${() => setFoco(null)} aria-hidden="true">
        ${marcas.map((v) => html`<g><line x1=${m.e} x2=${W - m.d} y1=${y(v)} y2=${y(v)} class=${v === 0 ? 'eixo' : 'grade'} />
          <text x=${m.e - 6} y=${y(v) + 4} text-anchor="end" class="rot-eixo">${formatarEixo(v)}</text></g>`)}
        ${categorias.map((c, i) => {
          const x0 = m.e + gw * i + (gw - bw) / 2;
          let acum = 0;
          const partes = series.map((s) => { const v = Number(s.valores[i]) || 0; const ini = acum; acum += v; return { s, v, ini }; }).filter((p) => p.v > 0);
          return html`<g onMouseEnter=${() => setFoco(i)} onClick=${() => { setFoco(i); if (aoClicar) aoClicar(i); }}>
            <rect x=${m.e + gw * i} y=${m.t} width=${gw} height=${H - m.t - m.b} class=${'alvo' + (ver === i ? ' ativo' : '')} />
            ${partes.map((p, k) => {
              const yTopo = y(p.ini + p.v); const yBase = y(p.ini); const h = Math.max(0, yBase - yTopo - (k > 0 ? 2 : 0));   // 2px de respiro entre as partes
              return k === partes.length - 1 ? html`<path d=${coluna(x0, yBase - (k > 0 ? 2 : 0), bw, h)} style=${{ fill: p.s.cor }} />`
                : html`<rect x=${x0} y=${yBase - (k > 0 ? 2 : 0) - h} width=${bw} height=${h} style=${{ fill: p.s.cor }} />`;
            })}
            <text x=${m.e + gw * i + gw / 2} y=${H - 8} text-anchor="middle" class=${'rot-eixo' + (selecionada === i ? ' rot-ativo' : '')}>${c}</text>
          </g>`;
        })}
      </svg>
      ${ver !== null && totais[ver] > 0 && html`<div class="dica-grafico" style=${{ left: `${((m.e + gw * (ver + 0.5)) / W) * 100}%` }}>
        <b>${categorias[ver]} · ${formatar(totais[ver])}</b>${series.map((s) => html`<span><i style=${{ background: s.cor }}></i>${s.nome}: <b>${formatar(s.valores[ver])}</b></span>`)}
      </div>`}
    </div>
    ${aoClicar && html`<div class="botoes-mes" role="group" aria-label="Escolher o mês">${categorias.map((c, i) => totais[i] > 0 && html`<button type="button"
      class=${'chip' + (selecionada === i ? ' ativo' : '')} aria-pressed=${selecionada === i} title=${resumo(i)} onClick=${() => aoClicar(i)}>${c}</button>`)}</div>`}
  </div>`;
}
