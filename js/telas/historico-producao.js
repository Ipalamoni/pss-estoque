// =====================================================================
// HISTÓRICO DA PRODUÇÃO — uma linha por ação, com data, hora, padeiro e usuário/tablet.
// Programou, pesou, enviou, recebeu, iniciou (e "fora da ordem"), finalizou, cancelou,
// devolveu, perda, saída avulsa, avisos de mudança (e quem ficou ciente) e correções.
// Só consulta: ninguém altera nada por aqui. (engenharia, gestor da produção, diretoria, admin)
// =====================================================================
import { html, useState, useEffect, useMemo, useApp, Cabecalho, Tabela, Etiqueta, Cartao, Carregando, Filtros, Busca, avisar, useFiltroMudou, MultiEscolha, casaVarios } from '../ui.js';
import { num, data, dataHora, hojeISO, somarDias, contem, mensagemErro, pl } from '../util.js';
import { Exportar } from '../exportar.js';
import { localTipo } from '../producao-util.js';

const ACOES = {
  programou: ['Programou', 'azul'], pesou: ['Pesou', 'cinza'], enviou: ['Enviou p/ masseiras', 'cinza'], recebeu: ['Recebeu base', 'verde'],
  iniciou: ['Iniciou batelada', 'verde'], finalizou: ['Finalizou', 'azul'], cancelou: ['Cancelou batelada', 'vermelho'],
  devolveu: ['Devolveu base', 'laranja'], perda: ['Perda', 'vermelho'], saida_avulsa: ['Saída avulsa', 'cinza'],
  aviso: ['Mudança na programação', 'laranja'], ciente: ['Ficou ciente do aviso', 'verde'], correcao: ['Correção', 'roxo'],
};
const PERIODOS = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7', '7 dias'], ['30', '30 dias']];
const inicioDia = (iso) => new Date(iso + 'T00:00:00').toISOString();
const emPartes = (ids, n = 150) => { const r = []; for (let i = 0; i < ids.length; i += n) r.push(ids.slice(i, i + n)); return r; };
const unir = (...l) => { const m = new Map(); l.flat().forEach((x) => m.set(x.id, x)); return [...m.values()]; };

async function carregar(api, dados, de, ate) {
  const ini = inicioDia(de), fim = inicioDia(somarDias(ate, 1));
  const p = (tabela, campo, extra = {}) => api.listar(tabela, { campoData: campo, desde: ini, ate: fim, ...extra }).catch(() => []);
  const [batIni, batFim, trEnv, trRec, trSep, movs, pesagens, progs, avCri, avCie, corr] = await Promise.all([
    p('bateladas', 'iniciada_em'), p('bateladas', 'finalizada_em'),
    p('transferencias', 'enviado_em'), p('transferencias', 'recebido_em'), p('transferencias', 'separado_em'),
    p('movimentos', 'data_hora', { em: { tipo: ['perda', 'saida_avulsa'] } }),
    p('producoes', 'data_hora'), p('programacoes', 'criado_em'),
    p('avisos_producao', 'criado_em'), p('avisos_producao', 'ciente_em'), p('correcoes_producao', 'criado_em'),
  ]);
  const mac = localTipo(dados, 'maceiras');
  const trs = unir(trEnv, trRec, trSep).filter((t) => mac && (t.origem_id === mac.id || t.destino_id === mac.id));
  const itens = (await Promise.all(emPartes(trs.map((t) => t.id)).map((ids) => api.listar('transferencia_itens', { em: { transferencia_id: ids } }).catch(() => [])))).flat();
  return { bats: unir(batIni, batFim), trs, itens, movs, pesagens, progs, avisos: unir(avCri, avCie), corr };
}

export function TelaHistoricoProducao() {
  const { dados, api } = useApp();
  const h = hojeISO();
  const [per, setPer] = useState('hoje');
  const [de, setDe] = useState(h);
  const [ate, setAte] = useState(h);
  const [fPad, setFPad] = useState([]);   // vários (vazio = todos)
  const [fMac, setFMac] = useState([]);
  const [fAcao, setFAcao] = useState([]);
  const [busca, setBusca] = useState('');
  const [bruto, setBruto] = useState(null);
  const mudou = useFiltroMudou([de, ate]);
  useEffect(() => {
    let vivo = true; if (mudou()) setBruto(null);
    carregar(api, dados, de, ate).then((r) => vivo && setBruto(r)).catch((e) => { avisar(mensagemErro(e), 'erro'); if (vivo) setBruto(null); });
    return () => { vivo = false; };
  }, [de, ate, dados.carregadoEm]);
  function escolherPeriodo(id) {
    setPer(id);
    if (id === 'hoje') { setDe(h); setAte(h); } else if (id === 'ontem') { setDe(somarDias(h, -1)); setAte(somarDias(h, -1)); }
    else { setDe(somarDias(h, -(Number(id) - 1))); setAte(h); }
  }

  const M = dados.mapa;
  const pessoa = (u) => (u ? M.perfil.get(u)?.nome || '—' : '');
  const padeiro = (o) => (o ? M.operador.get(o)?.nome || '—' : '');
  const masseira = (id) => (id ? M.maceira.get(id)?.nome || '—' : '');
  const linhas = useMemo(() => {
    if (!bruto) return null;
    const progMap = new Map([...dados.programacoes, ...bruto.progs].map((p) => [p.id, p]));
    const receitaProg = (pid) => M.ficha.get(progMap.get(pid)?.ficha_id)?.nome || '';
    const naFaixa = (ts) => ts && ts >= inicioDia(de) && ts < inicioDia(somarDias(ate, 1));
    const L = [];
    const add = (o) => { if (naFaixa(o.quando)) L.push(o); };
    bruto.progs.forEach((p) => add({ k: `prog${p.id}`, quando: p.criado_em, acao: 'programou', usuario: pessoa(p.criado_por), masseira: masseira(p.maceira_id),
      receita: M.ficha.get(p.ficha_id)?.nome, qtd: `${num(p.quantidade, 1)} receitas`, obs: `para ${data(p.data)}${p.prioridade ? ` · ${p.prioridade}º` : ''}` }));
    bruto.pesagens.forEach((x) => add({ k: `pes${x.id}`, quando: x.data_hora, acao: 'pesou', usuario: pessoa(x.usuario_id), masseira: masseira(progMap.get(x.programacao_id)?.maceira_id),
      receita: M.ficha.get(x.ficha_id)?.nome, qtd: `${num(x.multiplicador, 1)} receitas`, obs: x.observacao || '' }));
    const itensDe = (tid) => bruto.itens.filter((i) => i.transferencia_id === tid);
    const mac = localTipo(dados, 'maceiras');
    bruto.trs.forEach((t) => {
      const its = itensDe(t.id); const q = its.reduce((s, i) => s + Number(i.quantidade), 0);
      const rec = [...new Set(its.map((i) => receitaProg(i.programacao_id) || M.produto.get(i.produto_id)?.descricao).filter(Boolean))].join(', ');
      const devolucao = t.origem_id === mac?.id;
      if (devolucao) {
        add({ k: `dev${t.id}`, quando: t.enviado_em || t.separado_em, acao: 'devolveu', padeiro: padeiro(t.operador_id), usuario: pessoa(t.enviado_por || t.separado_por),
          receita: rec, qtd: `${num(q, 0)} bases`, obs: t.observacao || '' });
      } else {
        add({ k: `env${t.id}`, quando: t.enviado_em, acao: 'enviou', usuario: pessoa(t.enviado_por), receita: rec, qtd: `${num(q, 0)} bases`, obs: `transferência nº ${t.id}` });
        add({ k: `rec${t.id}`, quando: t.recebido_em, acao: 'recebeu', padeiro: padeiro(t.operador_id), usuario: pessoa(t.recebido_por), receita: rec,
          qtd: `${num(its.reduce((s, i) => s + Number(i.recebido ?? i.quantidade), 0), 0)} bases`, obs: t.recebido_obs || `transferência nº ${t.id}` });
      }
    });
    bruto.bats.forEach((b) => {
      const rec = M.ficha.get(b.ficha_id)?.nome;
      add({ k: `ini${b.id}`, quando: b.iniciada_em, acao: 'iniciou', padeiro: padeiro(b.operador_id), usuario: pessoa(b.usuario_id), masseira: masseira(b.maceira_id),
        receita: rec, qtd: '1 batelada', obs: `nº ${b.id}`, fora: b.fora_da_ordem });
      if (b.situacao === 'finalizada') add({ k: `fin${b.id}`, quando: b.finalizada_em, acao: 'finalizou', padeiro: padeiro(b.finalizada_operador_id), usuario: pessoa(b.finalizada_por), masseira: masseira(b.maceira_id),
        receita: rec, qtd: `${num(b.quantidade_produzida, 0)} un.`, obs: `nº ${b.id}${b.iniciada_em && b.finalizada_em ? ` · ${Math.round((new Date(b.finalizada_em) - new Date(b.iniciada_em)) / 60000)} min` : ''}${b.finalizada_operador_id ? ' · finalizada no tablet (rendimento médio)' : ''}` });
      if (b.situacao === 'cancelada') add({ k: `can${b.id}`, quando: b.finalizada_em, acao: 'cancelou', usuario: pessoa(b.finalizada_por), masseira: masseira(b.maceira_id),
        receita: rec, qtd: '1 batelada', obs: `nº ${b.id} · ${b.cancelada_motivo || ''}` });
    });
    bruto.movs.filter((m) => m.operador_id || m.local_id === mac?.id).forEach((m) => add({ k: `mov${m.id}`, quando: m.data_hora, acao: m.tipo === 'perda' ? 'perda' : 'saida_avulsa',
      padeiro: padeiro(m.operador_id), usuario: pessoa(m.usuario_id), receita: M.produto.get(m.produto_id)?.descricao,
      qtd: `${num(Math.abs(Number(m.quantidade)), 2)} ${M.produto.get(m.produto_id)?.unidade_estoque || ''}`, obs: [m.motivo, m.observacao].filter(Boolean).join(' · ') }));
    bruto.avisos.forEach((a) => {
      add({ k: `av${a.id}`, quando: a.criado_em, acao: 'aviso', usuario: pessoa(a.criado_por), masseira: a.setor === 'pesagem' ? 'Pesagem' : masseira(a.maceira_id), receita: receitaProg(a.programacao_id), obs: a.texto });
      add({ k: `ci${a.id}`, quando: a.ciente_em, acao: 'ciente', padeiro: padeiro(a.ciente_operador_id), usuario: pessoa(a.ciente_por), masseira: a.setor === 'pesagem' ? 'Pesagem' : masseira(a.maceira_id), obs: a.texto });
    });
    bruto.corr.forEach((c) => {
      const b = bruto.bats.find((x) => x.id === c.batelada_id);
      const antes = c.tipo === 'masseira' ? masseira(c.antes?.maceira_id) : padeiro(c.antes?.operador_id);
      const depois = c.tipo === 'masseira' ? masseira(c.depois?.maceira_id) : padeiro(c.depois?.operador_id);
      add({ k: `cor${c.id}`, quando: c.criado_em, acao: 'correcao', usuario: pessoa(c.criado_por), receita: b ? M.ficha.get(b.ficha_id)?.nome : '',
        masseira: b ? masseira(b.maceira_id) : '', obs: `Batelada nº ${c.batelada_id}: ${c.tipo} ${antes} → ${depois} · ${c.motivo}` });
    });
    return L.sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
  }, [bruto, dados, de, ate]);

  const filtradas = (linhas || []).filter((l) => casaVarios(fAcao, l.acao) && casaVarios(fPad, l.padeiro) && casaVarios(fMac, l.masseira)
    && contem(`${l.receita || ''} ${l.obs || ''} ${l.usuario || ''} ${l.padeiro || ''}`, busca));
  const conta = (a) => (linhas || []).filter((l) => l.acao === a).length;
  const padeiros = dados.operadores.map((o) => o.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const masseiras = dados.maceiras.map((m) => m.nome);
  const ativos = [fPad.length, fMac.length, fAcao.length].filter(Boolean).length;
  const periodo = de === ate ? data(de) : `${data(de)} a ${data(ate)}`;

  return html`
    <${Cabecalho} titulo="Histórico da produção" sub=${`Tudo o que foi feito na produção, com data, hora e quem fez · ${periodo}`} />
    <div class="periodo-barra">
      <span class="periodo-rotulo">Período</span>
      <span class="chips" role="group" aria-label="Período">${PERIODOS.map(([id, t]) => html`<button class=${'chip' + (per === id ? ' ativo' : '')} aria-pressed=${per === id} onClick=${() => escolherPeriodo(id)}>${t}</button>`)}</span>
      <label class="campo-inline">De <input class="entrada" type="date" value=${de} max=${ate} onChange=${(e) => { setPer(''); setDe(e.target.value); }} /></label>
      <label class="campo-inline">até <input class="entrada" type="date" value=${ate} min=${de} max=${h} onChange=${(e) => { setPer(''); setAte(e.target.value); }} /></label>
    </div>
    ${!linhas ? html`<${Carregando} texto="Montando o histórico…" />` : html`
    <div class="cartoes">
      <${Cartao} titulo="Bateladas iniciadas" valor=${conta('iniciou')} aoClicar=${() => setFAcao(['iniciou'])} />
      <${Cartao} titulo="Fora da ordem" valor=${linhas.filter((l) => l.fora).length} cor=${linhas.some((l) => l.fora) ? 'c-laranja' : ''} sub="iniciadas antes da 1ª da fila" />
      <${Cartao} titulo="Mudanças na programação" valor=${conta('aviso')} sub=${`${conta('ciente')} confirmadas no tablet`} aoClicar=${() => setFAcao(['aviso', 'ciente'])} />
      <${Cartao} titulo="Correções" valor=${conta('correcao') + conta('cancelou')} cor=${conta('correcao') + conta('cancelou') ? 'c-laranja' : ''} sub="pelo engenheiro / gestor" aoClicar=${() => setFAcao(['correcao', 'cancelou'])} />
    </div>
    <${Filtros} acoes=${linhas && html`<span class="nota">${pl(filtradas.length, 'registro', 'registros')}</span>
      <${Exportar} tabela="historico-producao.telahistoricoproducao" titulo="Histórico da produção" filtros=${periodo} arquivo=${`historico-producao-${de}-a-${ate}`} paisagem=${true}
        linhas=${filtradas} colunas=${[{ titulo: 'Data e hora', valor: (l) => dataHora(l.quando), largura: 16 }, { titulo: 'Ação', valor: (l) => ACOES[l.acao][0] + (l.fora ? ' (fora da ordem)' : ''), largura: 22 },
          { titulo: 'Padeiro', valor: (l) => l.padeiro || '' }, { titulo: 'Usuário / tablet', valor: (l) => l.usuario || '' }, { titulo: 'Masseira', valor: (l) => l.masseira || '' },
          { titulo: 'Receita / produto', valor: (l) => l.receita || '', largura: 26 }, { titulo: 'Quantidade', valor: (l) => l.qtd || '' }, { titulo: 'Detalhe', valor: (l) => l.obs || '', largura: 40 }]} />`} ativos=${ativos} fixo=${html`<${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Receita, produto, nome ou detalhe" />`}>
      <${MultiEscolha} todos="Todas as ações" rotulo="Ações" valor=${fAcao} aoMudar=${setFAcao} opcoes=${Object.entries(ACOES).map(([k, [t]]) => ({ valor: k, rotulo: t }))} />
      <${MultiEscolha} todos="Todos os padeiros" rotulo="Padeiros" valor=${fPad} aoMudar=${setFPad} opcoes=${padeiros.map((p) => ({ valor: p, rotulo: p }))} />
      <${MultiEscolha} todos="Todas as masseiras" rotulo="Masseiras" valor=${fMac} aoMudar=${setFMac} opcoes=${masseiras.map((m) => ({ valor: m, rotulo: m }))} />
    </${Filtros}>
    <${Tabela} id="historico-producao.telahistoricoproducao" linhas=${filtradas} chave="k" max=${500} vazio="Nada registrado neste período com esses filtros." colunas=${[
      { chave: 'quando', titulo: 'Data e hora', render: (l) => html`<b>${dataHora(l.quando).slice(9)}</b> <small>${dataHora(l.quando).slice(0, 8)}</small>` },
      { chave: 'acao', titulo: 'Ação', valor: (l) => ACOES[l.acao][0], render: (l) => html`<${Etiqueta} cor=${ACOES[l.acao][1]}>${ACOES[l.acao][0]}</${Etiqueta}>${l.fora ? html` <${Etiqueta} cor="laranja">fora da ordem</${Etiqueta}>` : ''}` },
      { chave: 'padeiro', titulo: 'Padeiro', render: (l) => l.padeiro || '–' },
      { chave: 'usuario', titulo: 'Usuário / tablet', render: (l) => l.usuario || '–' },
      { chave: 'masseira', titulo: 'Masseira', render: (l) => l.masseira || '–' },
      { chave: 'receita', titulo: 'Receita / produto', render: (l) => l.receita || '–' },
      { chave: 'qtd', titulo: 'Quantidade', render: (l) => l.qtd || '–' },
      { chave: 'obs', titulo: 'Detalhe', ordenar: false, render: (l) => (l.obs ? html`<small>${l.obs}</small>` : '–') },
    ]} />`}`;
}
