// =====================================================================
// ORDEM DA PESAGEM: uma fila única do dia para a pesagem (1º, 2º, 3º… em amarelo)
//  · Pesagem (Nayara): vê a ordem e o botão "Pesar" em cada linha.
//  · Engenharia / gestor da produção / admin: mudam a ordem (▲ ▼), marcam URGENTE
//    (1º na pesagem e 1º na masseira, de uma vez) e podem montar a ordem das masseiras
//    a partir desta. Quem protege é o banco (reordenar_pesagem / programacao_urgente).
// =====================================================================
import { html, useApp, useAcao, confirmar } from '../ui.js';
import { num, pl } from '../util.js';
import { Icone } from '../icones.js';
import { FaixaAviso, useAlertaSonoro, avisosPendentes } from '../aviso-producao.js';

const aberta = (pg) => pg.situacao === 'ativa' && !pg.finalizada_em;
const ordemP = (a, b) => (a.prioridade_pesagem ?? 9999) - (b.prioridade_pesagem ?? 9999) || a.id - b.id;

export function OrdemPesagem({ dia, feito, engenharia, pesagem, aoPesar }) {
  const { dados, api, recarregar } = useApp();
  const [ocupado, executar] = useAcao();
  const doDia = dados.programacoes.filter((p) => p.data === dia && aberta(p)).sort(ordemP);
  const falta = (p) => Math.max(Number(p.quantidade) - feito(p), 0);
  const lista = doDia.filter((p) => falta(p) > 0.0001);          // o que ainda falta pesar
  const ficha = (p) => dados.mapa.ficha.get(p.ficha_id);
  const naoVistos = avisosPendentes(dados, 'pesagem').length;
  if (!lista.length && !engenharia) return null;

  // manda a fila inteira: as que faltam pesar na ordem nova, depois as já pesadas
  async function gravar(ids, msg) {
    const resto = doDia.filter((p) => !ids.includes(p.id)).map((p) => p.id);
    if (await executar(() => api.rpc('reordenar_pesagem', { p: [...ids, ...resto] }), msg)) await recarregar(true);
  }
  function mover(i, d) {
    const ids = lista.map((p) => p.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    gravar(ids, 'Ordem da pesagem mudada. A pesagem recebe o aviso.');
  }
  async function urgente(p) {
    const mac = dados.mapa.maceira.get(p.maceira_id)?.nome;
    if (!(await confirmar({ titulo: `URGENTE: ${ficha(p)?.nome}`, ok: 'Sim, é urgente', cancelar: 'Voltar',
      mensagem: html`<p>Vai para o <b>1º lugar na pesagem</b>${mac ? html` e o <b>1º lugar na ${mac}</b>` : ''}.</p>
        <p>A pesagem e o padeiro recebem o aviso. O padeiro termina o que já tem a base na mão e faz esta assim que a base chegar.</p>` }))) return;
    if (await executar(() => api.rpc('programacao_urgente', { p_id: p.id }), 'Marcada como urgente. Pesagem e masseira avisadas.')) await recarregar(true);
  }
  // cada masseira: primeiro o que já foi pesado (mantém a ordem atual), depois na ordem da pesagem
  async function aplicarNasMasseiras() {
    const porMac = new Map();
    doDia.filter((p) => p.maceira_id).forEach((p) => porMac.set(p.maceira_id, [...(porMac.get(p.maceira_id) || []), p]));
    const itens = [];
    porMac.forEach((l, mac) => {
      l.sort((a, b) => (falta(a) > 0.0001) - (falta(b) > 0.0001) || (falta(a) > 0.0001 ? ordemP(a, b) : (a.prioridade ?? 999) - (b.prioridade ?? 999) || a.id - b.id))
        .forEach((p, i) => itens.push({ id: p.id, maceira_id: mac, prioridade: i + 1 }));
    });
    if (!itens.length) return;
    if (!(await confirmar({ titulo: 'Montar a ordem das masseiras', ok: 'Montar a ordem', cancelar: 'Voltar',
      mensagem: html`<p>Cada masseira fica na mesma sequência da pesagem (o que já foi pesado continua na frente).</p>
        <p>O padeiro recebe o aviso. Depois você ainda pode ajustar no <b>Quadro das masseiras</b>.</p>` }))) return;
    if (await executar(() => api.rpc('reordenar_programacao', { p: itens }), 'Ordem das masseiras montada pela pesagem.')) await recarregar(true);
  }

  return html`<section class="ordem-pesagem">
    <div class="titulo-com-acao"><h3>Ordem da pesagem</h3>
      ${engenharia && lista.length > 1 && html`<button class="btn btn-sec btn-peq" disabled=${ocupado} onClick=${aplicarNasMasseiras}>
        <${Icone} nome="trocar" tam=${16} /> Montar ordem das masseiras pela pesagem</button>`}</div>
    <p class="nota">${pesagem && !engenharia ? 'Pese nesta ordem: o 1º primeiro.' : 'A pesagem pesa nesta ordem. Use ▲ ▼ para mudar, ou URGENTE para pôr em 1º na pesagem e na masseira.'}
      ${engenharia && naoVistos > 0 && html` <b class="texto-laranja">A pesagem ainda não confirmou ${pl(naoVistos, 'aviso', 'avisos')}.</b>`}</p>
    ${!lista.length ? html`<p class="nota">Nada para pesar neste dia.</p>` : html`<ol class="op-lista">${lista.map((p, i) => {
      const mac = dados.mapa.maceira.get(p.maceira_id);
      return html`<li class=${'op-item' + (i === 0 ? ' primeiro' : '')} key=${p.id}>
        <span class="fila-pos" aria-label=${`${i + 1}º da pesagem`}>${i + 1}º</span>
        <div class="op-info"><b>${ficha(p)?.nome}</b>
          <small>${mac ? `${mac.nome} · ${p.prioridade ?? '–'}º na masseira` : 'sem masseira'} · falta pesar <b>${num(falta(p), falta(p) % 1 ? 1 : 0)}</b> ${falta(p) === 1 ? 'receita' : 'receitas'}</small></div>
        <div class="op-acoes">
          ${engenharia && html`<button class="btn-icone op-seta" title="Subir" aria-label=${`Subir ${ficha(p)?.nome}`} disabled=${ocupado || i === 0} onClick=${() => mover(i, -1)}>▲</button>
            <button class="btn-icone op-seta" title="Descer" aria-label=${`Descer ${ficha(p)?.nome}`} disabled=${ocupado || i === lista.length - 1} onClick=${() => mover(i, 1)}>▼</button>
            <button class="btn btn-sec btn-peq op-urgente" disabled=${ocupado} onClick=${() => urgente(p)}><${Icone} nome="aviso" tam=${15} /> Urgente</button>`}
          ${pesagem && html`<button class="btn btn-pri op-pesar" onClick=${() => aoPesar(p)}>Pesar</button>`}
        </div>
      </li>`;
    })}</ol>`}
  </section>`;
}

// faixa de aviso da PESAGEM: só para quem é da pesagem; confirma com o próprio login
export function AvisoPesagem() {
  const { dados, api, recarregar, papeis } = useApp();
  const [ocupado, executar] = useAcao();
  const ehPesagem = (papeis || []).includes('pesagem');
  const avisos = avisosPendentes(dados, 'pesagem');
  useAlertaSonoro(ehPesagem ? avisos.length : 0);
  if (!ehPesagem || !avisos.length) return null;
  async function entendi() {
    if (ocupado) return;
    if (await executar(() => api.rpc('confirmar_avisos_pesagem', { p: { ids: avisos.map((a) => a.id) } }), 'Obrigado! Aviso confirmado.')) await recarregar(true);
  }
  return html`<${FaixaAviso} avisos=${avisos} setor="pesagem" podeConfirmar=${true} aoEntendi=${entendi} />`;
}
