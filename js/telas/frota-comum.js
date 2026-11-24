// =====================================================================
// MANUTENÇÃO DE VEÍCULOS — peças comuns às telas (placa, etiquetas, base de data,
// janela "Apontar despesa" e "Apontar várias")
// =====================================================================
import { html, useState, useApp, Modal, Campo, Numero, Escolher, Etiqueta, useAcao, avisar } from '../ui.js';
import { Icone } from '../icones.js';
import { moeda, data, pl, num } from '../util.js';
import { BASES, NOME_GRUPO, placaBonita, nomeVeiculo } from '../frota-dados.js';

const COR_GRUPO = { corretiva: 'laranja', preventiva: 'verde', pneus: 'azul' };
export const EtqGrupo = ({ grupo }) => html`<${Etiqueta} cor=${COR_GRUPO[grupo] || 'cinza'}>${NOME_GRUPO[grupo] || grupo}</${Etiqueta}>`;

// placa no visual da placa Mercosul (faixa azul + letras grandes); "geral" e "não cadastrada" com texto
export function Placa({ s, placa, grande }) {
  const p = placa ?? (s ? (s.veiculo?.placa || s.placa_arquivo) : '');
  if (s && s.geral) return html`<span class="placa placa-geral" title="Nota sem veículo (placa vazia ou 9999999)">Geral da frota</span>`;
  return html`<span class=${'placa' + (grande ? ' placa-g' : '') + (s && s.desconhecida ? ' placa-desconhecida' : '')}
    title=${s && s.desconhecida ? 'Placa que não está no cadastro' : ''}><i aria-hidden="true"></i>${placaBonita(p)}</span>`;
}

export function SeletorBase({ base, aoMudar }) {
  return html`<div class="seg seg-base" role="group" aria-label="Ver os valores pela data de">
    ${BASES.map((b) => html`<button type="button" class=${base === b.id ? 'ativo' : ''} aria-pressed=${base === b.id} title=${b.ajuda}
      onClick=${() => aoMudar(b.id)}>${b.rotulo}</button>`)}</div>`;
}

export const TagsLidas = ({ ids, f }) => html`<span class="tags-lidas">${(ids || []).map((id) => html`<span class="tag-lida" key=${id}>${f.mapa.tag.get(id)?.nome || '?'}</span>`)}</span>`;

// etiquetas para tocar (várias); obrigatória pelo menos uma
export function EscolherTags({ f, valor, aoMudar }) {
  const ativas = f.tags.filter((t) => t.ativo || valor.includes(t.id));
  const alternar = (id) => aoMudar(valor.includes(id) ? valor.filter((x) => x !== id) : [...valor, id]);
  return html`<div class="tags-escolha" role="group" aria-label="Tipos de manutenção">
    ${ativas.map((t) => html`<button type="button" key=${t.id} class=${'tag-btn' + (valor.includes(t.id) ? ' ativo' : '')} aria-pressed=${valor.includes(t.id)}
      onClick=${() => alternar(t.id)}>${valor.includes(t.id) ? '✓ ' : ''}${t.nome}</button>`)}
  </div>`;
}

// detalhe da nota: parcelas (entrada, vencimento, pagamento)
export function ParcelasDaNota({ s }) {
  const ls = [...s.lancs].sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)) || String(a.parcela).localeCompare(String(b.parcela)));
  return html`<details class="parcelas-nota"><summary>${pl(s.parcelas, 'parcela', 'parcelas')} · ${s.pago >= s.total - 0.01 ? 'tudo pago' : `${moeda(s.aberto)} em aberto`}</summary>
    <table class="tabela tabela-mini"><thead><tr><th>Parcela</th><th>Conta</th><th>Vencimento</th><th>Pago em</th><th class="n">Valor</th></tr></thead>
      <tbody>${ls.map((l) => html`<tr key=${l.id}><td>${l.parcela || '–'}</td><td>${NOME_GRUPO[l.grupo]}</td><td>${data(l.vencimento) || '–'}</td>
        <td>${l.pagamento ? data(l.pagamento) : html`<span class="texto-laranja">em aberto</span>`}</td><td class="n">${moeda(l.valor)}</td></tr>`)}</tbody></table></details>`;
}

// ---------------------------------------------------------------------
// APONTAR: uma nota por vez; "Salvar e próxima" segue a fila recebida
// ---------------------------------------------------------------------
export function ModalApontar({ f, fila, inicio = 0, aoFechar }) {
  const { api } = useApp();
  const [i, setI] = useState(inicio);
  const s = fila[i];
  const [tags, setTags] = useState(s?.tags || []);
  const [obs, setObs] = useState(s?.observacao || '');
  const [km, setKm] = useState(s?.hodometro ? String(s.hodometro) : '');
  const [veic, setVeic] = useState(s?.veiculo_manual_id || null);
  const [trocar, setTrocar] = useState(false);
  const partesDe = (n) => (n?.rateios || []).map((r) => ({ veiculo_id: r.veiculo_id, valor: String(r.valor).replace('.', ','), tags: r.tags }));
  const [partes, setPartes] = useState(() => partesDe(s));
  const [ocupado, executar] = useAcao();
  if (!s) return null;
  const ir = (k) => { const n = fila[k]; setI(k); setTags(n?.tags || []); setObs(n?.observacao || ''); setKm(n?.hodometro ? String(n.hodometro) : ''); setVeic(n?.veiculo_manual_id || null); setTrocar(false); setPartes(partesDe(n)); };
  const nBr = (x) => { const t = String(x ?? '').trim(); if (!t) return 0; const v = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(v) ? v : 0; };
  const somaPartes = partes.reduce((t, pt) => t + nBr(pt.valor), 0);
  const resta = Math.round((s.total - somaPartes) * 100) / 100;
  const parteOk = (pt) => pt.veiculo_id && nBr(pt.valor) > 0 && pt.tags.length > 0;
  const divisaoOk = partes.every(parteOk) && resta >= 0;
  const mudaParte = (k, campo, v) => setPartes((l) => l.map((pt, j) => (j === k ? { ...pt, [campo]: v } : pt)));
  const placaOrig = s.veiculo ? placaBonita(s.veiculo.placa) : s.geral ? 'nota sem veículo' : placaBonita(s.placa_arquivo);
  const ultimo = i >= fila.length - 1;
  async function salvar(proxima) {
    if (!tags.length) { avisar('Marque pelo menos um tipo de manutenção.', 'aviso'); return; }
    if (!divisaoOk) { avisar(resta < 0 ? 'A divisão passa do valor da nota.' : 'Complete cada parte da divisão: veículo, valor e tipo de manutenção.', 'aviso'); return; }
    const p = { servico_id: s.id, tags, observacao: obs, hodometro: km ? String(Math.round(Number(km.replace(/\./g, '').replace(',', '.')))) : '' };
    if (partes.length || (s.rateios || []).length) p.partes = partes.map((pt) => ({ veiculo_id: pt.veiculo_id, valor: String(nBr(pt.valor)), tags: pt.tags }));
    if (trocar || veic !== (s.veiculo_manual_id || null)) p.veiculo_id = veic;
    const ok = await executar(() => api.rpc('frota_apontar', { p }), proxima && !ultimo ? 'Apontado. Próxima nota.' : 'Apontamento salvo.');
    if (!ok) return;
    if (proxima && !ultimo) ir(i + 1); else aoFechar(true);
  }
  const veicNome = (v) => `${placaBonita(v.placa)} · ${nomeVeiculo(v)}`;
  return html`<${Modal} titulo="Apontar despesa" aoFechar=${() => aoFechar(false)} semProtecao
    rodape=${html`<span class="nota apontar-pos">${fila.length > 1 ? `${i + 1} de ${fila.length}` : ''}</span>
      ${fila.length > 1 && !ultimo && html`<button class="btn btn-sec" disabled=${ocupado} onClick=${() => ir(i + 1)}>Pular</button>`}
      <button class="btn btn-pri" disabled=${ocupado || !tags.length || !divisaoOk} onClick=${() => salvar(true)}>${ocupado ? 'Salvando…' : fila.length > 1 && !ultimo ? 'Salvar e próxima' : 'Salvar apontamento'}</button>`}>
    <div class="apontar-cab">
      <${Placa} s=${s} grande />
      <div class="apontar-veic"><b>${s.veiculo ? nomeVeiculo(s.veiculo) : s.geral ? 'Despesa sem veículo (estoque de peças, vários veículos…)' : `Placa ${placaBonita(s.placa_arquivo)} não está no cadastro`}</b>
        <small>${s.veiculo ? s.veiculo.categoria : ''}</small></div>
      <div class="apontar-valor"><b>${moeda(s.total)}</b><small>nota de ${data(s.entrada)}</small></div>
    </div>
    <div class="apontar-info">
      <span>${s.grupos.map((g) => html`<${EtqGrupo} grupo=${g} /> `)}</span>
      <span><b>${s.fornecedor}</b> · título ${s.titulo}</span>
    </div>
    ${s.obsFinanceiro && html`<p class="apontar-obs" title="Observação digitada no contas a pagar">“${s.obsFinanceiro}”</p>`}
    <${ParcelasDaNota} s=${s} />
    ${(s.geral || s.desconhecida || trocar) ? html`<${Campo} rotulo=${s.desconhecida ? 'Qual veículo é? (ou resolva a placa em "Placas a resolver")' : 'Veículo desta nota (opcional)'}>
        <${Escolher} itens=${f.veiculos} valor=${veic} aoMudar=${(id) => setVeic(id)} rotuloDe=${veicNome} placeholder="Digite a placa ou o modelo" /></${Campo}>`
      : html`<button type="button" class="btn-link" onClick=${() => setTrocar(true)}>Esta nota é de outro veículo? Trocar o veículo</button>`}
    <${Campo} rotulo=${partes.length ? `O que foi feito no ${placaOrig}? (marque um ou mais)` : 'O que foi feito? (marque um ou mais)'} obrigatorio>
      <${EscolherTags} f=${f} valor=${tags} aoMudar=${setTags} /></${Campo}>
    <div class="fr-dividir">
      ${partes.length > 0 && html`<div class="fr-div-cab"><b>Nota dividida entre veículos</b>
        <span class=${resta < 0 ? 'texto-vermelho' : ''}>Fica no ${placaOrig}: <b>${moeda(Math.max(resta, 0))}</b>${resta < 0 ? ` · passou ${moeda(-resta)} do valor da nota` : ''}</span></div>`}
      ${partes.map((pt, k) => html`<div class="fr-parte" key=${k}>
        <div class="fr-parte-linha">
          <${Campo} rotulo=${`Veículo ${k + 2}`} obrigatorio><${Escolher} itens=${f.veiculos} valor=${pt.veiculo_id || null} aoMudar=${(id) => mudaParte(k, 'veiculo_id', id)}
            rotuloDe=${veicNome} placeholder="Digite a placa ou o modelo" /></${Campo}>
          <${Campo} rotulo="Valor (R$)" obrigatorio><${Numero} valor=${pt.valor} aoMudar=${(v) => mudaParte(k, 'valor', v)} placeholder="ex.: 10.000,00" /></${Campo}>
          <button type="button" class="btn btn-sec fr-parte-tirar" aria-label=${`Tirar o veículo ${k + 2} da divisão`} onClick=${() => setPartes((l) => l.filter((_, j) => j !== k))}>Tirar</button>
        </div>
        <${Campo} rotulo="O que foi feito neste veículo?" obrigatorio><${EscolherTags} f=${f} valor=${pt.tags} aoMudar=${(v) => mudaParte(k, 'tags', v)} /></${Campo}>
      </div>`)}
      <button type="button" class="btn btn-sec" onClick=${() => setPartes((l) => [...l, { veiculo_id: null, valor: '', tags: [] }])}>
        <${Icone} nome="mais" tam=${16} /> ${partes.length ? 'Dividir com mais um veículo' : 'Dividir esta nota com outro veículo'}</button>
      ${!partes.length && html`<small class="nota">Use quando a oficina mandou uma nota só para mais de um veículo.</small>`}
    </div>
    <div class="grade">
      <${Campo} rotulo="Observação (opcional)" classe="larga"><textarea class="entrada" rows="2" maxlength="1000" value=${obs} onInput=${(e) => setObs(e.target.value)}
        placeholder="ex.: troca do kit de embreagem e do platô" /></${Campo}>
      <${Campo} rotulo="Km do veículo no serviço (opcional)" ajuda="Com o km, o sistema calcula o custo por km."><${Numero} valor=${km} aoMudar=${setKm} placeholder="ex.: 152.300" /></${Campo}>
    </div>
  </${Modal}>`;
}

// várias notas de uma vez, com as mesmas etiquetas (pôr em dia o que já existia)
export function ModalApontarVarios({ f, servicos, aoFechar }) {
  const { api } = useApp();
  const [tags, setTags] = useState([]);
  const [obs, setObs] = useState('');
  const [ocupado, executar] = useAcao();
  const total = servicos.reduce((t, s) => t + s.total, 0);
  const salvar = async () => {
    const n = await executar(() => api.rpc('frota_apontar_varios', { p: { ids: servicos.map((s) => s.id), tags, observacao: obs } }));
    if (n) { avisar(`${pl(n, 'nota apontada', 'notas apontadas')}.`, 'ok'); aoFechar(true); }
  };
  return html`<${Modal} titulo=${`Apontar ${pl(servicos.length, 'nota', 'notas')} de uma vez`} aoFechar=${() => aoFechar(false)}
    rodape=${html`<button class="btn btn-sec" onClick=${() => aoFechar(false)}>Cancelar</button>
      <button class="btn btn-pri" disabled=${ocupado || !tags.length} onClick=${salvar}>${ocupado ? 'Salvando…' : `Apontar ${pl(servicos.length, 'nota', 'notas')}`}</button>`}>
    <p>Total das notas escolhidas: <b>${moeda(total)}</b>. As mesmas etiquetas vão para todas${servicos.some((s) => s.apontado) ? ' (as que já tinham etiquetas serão substituídas)' : ''}.</p>
    <${Campo} rotulo="O que foi feito? (marque um ou mais)" obrigatorio><${EscolherTags} f=${f} valor=${tags} aoMudar=${setTags} /></${Campo}>
    <${Campo} rotulo="Observação (opcional, vale para todas)"><textarea class="entrada" rows="2" maxlength="1000" value=${obs} onInput=${(e) => setObs(e.target.value)} /></${Campo}>
  </${Modal}>`;
}

// AVISOS COMPACTOS: vários avisos lado a lado numa linha só (espaço da tela é para os dados)
export function AvisosLinha({ itens }) {
  const lista = (itens || []).filter(Boolean);
  if (!lista.length) return null;
  return html`<div class="avisos-linha" role="status">${lista.map((a, k) => html`<div class=${'aviso-chip' + (a.cor ? ' aviso-chip-' + a.cor : '')} key=${k}>
    <${Icone} nome=${a.icone || 'aviso'} tam=${18} /><span>${a.texto}</span>
    ${a.botao && html`<button type="button" class="btn btn-destaque btn-peq" onClick=${a.acao}>${a.botao}</button>`}</div>`)}</div>`;
}

export const fmtK = (v) => (Math.abs(v) >= 1000 ? `${num(v / 1000, v >= 100000 ? 0 : 1)} mil` : num(v, 0));
