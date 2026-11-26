// =====================================================================
// app.js — esqueleto do sistema: login, menu, navegação e dados comuns
// =====================================================================
import { html, render, useState, useEffect, useRef, Ctx, Avisos, HostConfirmacao, avisar, Carregando, Modal, Campo, haEdicao, confirmarDescarte, protegido } from './ui.js';
import { api } from './api.js';
import { PAPEIS, pode, porId, mensagemErro, papeisTexto, operaLocal, pl, veValores, definirOcultarValores, numeroPedido, data, recebeNoLocal } from './util.js';
import { prazoBatelada, duracaoBatelada, estadoTempo, tempoTexto } from './producao-util.js';
import { indicadores } from './calc.js';
import { Icone } from './icones.js';
import { MarcaArtas } from './marca.js';
import { carregarPreferencias } from './preferencias.js';

import { TelaInicio } from './telas/inicio.js';


// Telas carregadas sob demanda: o celular só baixa/lê a tela quando ela é aberta
// (e, com o app parado, adianta as telas que a pessoa pode usar).
function preguicosa(carregar, nome) {
  let Comp = null; let prom = null;
  const buscar = () => {
    // se o sistema foi atualizado com o app aberto, a tela nova pode não combinar com a versão em uso: recarrega
    if (!prom && window.__versaoTrocou) { location.reload(); return new Promise(() => {}); }
    return (prom = prom || carregar().then((m) => { Comp = m[nome]; }).catch((e) => { prom = null; throw e; }));
  };
  function Tela(props) {
    const [, forcar] = useState(0);
    useEffect(() => {
      if (Comp) return undefined;
      let vivo = true;
      buscar().then(() => { if (vivo) forcar(1); }).catch(() => { if (vivo) avisar('Não consegui abrir esta tela. Confira a internet e tente de novo.', 'erro'); });
      return () => { vivo = false; };
    }, []);
    return Comp ? html`<${Comp} ...${props} />` : html`<${Carregando} texto="Abrindo…" />`;
  }
  Tela.precarregar = () => (window.__versaoTrocou ? Promise.resolve() : buscar().catch(() => {}));
  return Tela;
}
const TelaReceber = preguicosa(() => import('./telas/receber.js'), 'TelaReceber');
const TelaFrotaPainel = preguicosa(() => import('./telas/frota.js'), 'TelaFrotaPainel');
const TelaFrotaApontar = preguicosa(() => import('./telas/frota.js'), 'TelaFrotaApontar');
const TelaFrotaPlacas = preguicosa(() => import('./telas/frota.js'), 'TelaFrotaPlacas');
const TelaFrotaImportar = preguicosa(() => import('./telas/frota.js'), 'TelaFrotaImportar');
const TelaFrotaTipos = preguicosa(() => import('./telas/frota.js'), 'TelaFrotaTipos');
const TelaFrotaVeiculos = preguicosa(() => import('./telas/frota-veiculos.js'), 'TelaFrotaVeiculos');
const TelaSaidas = preguicosa(() => import('./telas/saidas.js'), 'TelaSaidas');
const TelaInventario = preguicosa(() => import('./telas/inventario.js'), 'TelaInventario');
const TelaPedidos = preguicosa(() => import('./telas/pedidos.js'), 'TelaPedidos');
const TelaEstoque = preguicosa(() => import('./telas/estoque.js'), 'TelaEstoque');
const TelaMovimentos = preguicosa(() => import('./telas/movimentos.js'), 'TelaMovimentos');
const TelaRelatorios = preguicosa(() => import('./telas/relatorios.js'), 'TelaRelatorios');
const TelaProdutos = preguicosa(() => import('./telas/produtos.js'), 'TelaProdutos');
const TelaFornecedores = preguicosa(() => import('./telas/fornecedores.js'), 'TelaFornecedores');
const TelaFichas = preguicosa(() => import('./telas/fichas.js'), 'TelaFichas');
const TelaUsuarios = preguicosa(() => import('./telas/usuarios.js'), 'TelaUsuarios');
const TelaConfiguracoes = preguicosa(() => import('./telas/configuracoes.js'), 'TelaConfiguracoes');
const TelaAuditoria = preguicosa(() => import('./telas/auditoria.js'), 'TelaAuditoria');
const TelaProgramacao = preguicosa(() => import('./telas/producao.js'), 'TelaProgramacao');
const TelaSaidasProducao = preguicosa(() => import('./telas/producao.js'), 'TelaSaidasProducao');
const TelaPainel = preguicosa(() => import('./telas/painel.js'), 'TelaPainel');
const TelaFinanceiro = preguicosa(() => import('./telas/financeiro.js'), 'TelaFinanceiro');
const TelaPrevisao = preguicosa(() => import('./telas/previsao.js'), 'TelaPrevisao');
const TelaCustos = preguicosa(() => import('./telas/custos.js'), 'TelaCustos');
const TelaContagemInicial = preguicosa(() => import('./telas/contagem.js'), 'TelaContagemInicial');
const TelaEstoqueLocal = preguicosa(() => import('./telas/estoque-local.js'), 'TelaEstoqueLocal');
const TelaTransferencias = preguicosa(() => import('./telas/transferencias.js'), 'TelaTransferencias');
const TelaRequisicoes = preguicosa(() => import('./telas/requisicoes.js'), 'TelaRequisicoes');
const TelaMaceiras = preguicosa(() => import('./telas/maceiras.js'), 'TelaMaceiras');
const TelaFinalizar = preguicosa(() => import('./telas/finalizar.js'), 'TelaFinalizar');
const TelaPainelProducao = preguicosa(() => import('./telas/painel-producao.js'), 'TelaPainelProducao');
const TelaCadastrosProducao = preguicosa(() => import('./telas/cadastros-producao.js'), 'TelaCadastrosProducao');
const TelaHistoricoProducao = preguicosa(() => import('./telas/historico-producao.js'), 'TelaHistoricoProducao');
const TelaPedidosErp = preguicosa(() => import('./telas/pedidos-erp.js'), 'TelaPedidosErp');

const CFG = window.CONFIG || {};
const TODOS = Object.keys(PAPEIS).filter((p) => !['financeiro', 'faturamento', 'padeiro', 'frota', 'integracao'].includes(p));   // frota: só o módulo de veículos   // financeiro: só pedidos/pagamentos e previsão; faturamento: só previsão; padeiro: só a produção
const GESTAO = ['admin', 'diretoria', 'engenharia', 'gestor_producao'];

// Menu: quem vê cada tela (as gravações são conferidas de novo no banco)
const MENU = [
  { id: 'inicio', titulo: 'Início', papeis: [...TODOS, 'financeiro', 'faturamento', 'padeiro'], tela: TelaInicio },
  { grupo: 'Gestão' },
  { id: 'painel-producao', titulo: 'Painel de Produção', papeis: GESTAO, tela: TelaPainelProducao, aoVivo: true },
  { id: 'custos', titulo: 'Central de Custos', papeis: ['admin', 'diretoria'], tela: TelaCustos },
  { id: 'financeiro', titulo: 'Pedidos a pagar', papeis: ['admin', 'financeiro', 'diretoria'], tela: TelaFinanceiro },
  { id: 'previsao', titulo: 'Programado × produzido', papeis: ['admin', 'engenharia', 'diretoria', 'financeiro', 'faturamento', 'gestor_producao'], tela: TelaPrevisao, aoVivo: true },
  { id: 'painel', titulo: 'Painel de Estoque e Compras', papeis: ['admin', 'diretoria', 'comprador', 'almoxarifado', 'engenharia', 'gestor_producao'], tela: TelaPainel },
  { grupo: 'Previsão', papeis: ['admin'] },   // módulo em construção: por enquanto só o administrador
  { id: 'pedidos-erp', titulo: 'Pedidos em aberto', papeis: ['admin'], tela: TelaPedidosErp },
  { grupo: 'Produção' },
  { id: 'maceiras', titulo: 'Produção Masseiras', papeis: ['admin', 'padeiro', 'engenharia', 'diretoria', 'gestor_producao'], tela: TelaMaceiras, aoVivo: true },
  { id: 'programacao', titulo: 'Programação e pesagem', papeis: ['admin', 'engenharia', 'pesagem', 'diretoria', 'gestor_producao'], tela: TelaProgramacao, aoVivo: true },
  { id: 'finalizar', titulo: 'Finalizar bateladas', papeis: ['admin', 'engenharia', 'diretoria', 'gestor_producao'], tela: TelaFinalizar, aoVivo: true },
  { id: 'historico-producao', titulo: 'Histórico da produção', papeis: ['admin', 'engenharia', 'gestor_producao', 'diretoria'], tela: TelaHistoricoProducao, aoVivo: true },
  { id: 'saidas-producao', titulo: 'Saídas da produção', papeis: ['admin', 'engenharia', 'pesagem', 'almoxarifado', 'diretoria', 'gestor_producao'], tela: TelaSaidasProducao },
  { grupo: 'Estoque' },
  { id: 'estoque-local', titulo: 'Estoque por local', papeis: TODOS, tela: TelaEstoqueLocal, aoVivo: true },
  { id: 'transferencias', titulo: 'Transferências', papeis: ['admin', 'almoxarifado', 'recebimento', 'pesagem', 'engenharia', 'diretoria', 'gestor_producao'], tela: TelaTransferencias, aoVivo: true },
  { id: 'requisicoes', titulo: 'Requisições e consumo', papeis: ['admin', 'engenharia', 'almoxarifado', 'recebimento', 'diretoria', 'gestor_producao'], tela: TelaRequisicoes, aoVivo: true },
  { id: 'receber', titulo: 'Receber mercadoria', papeis: ['admin', 'almoxarifado', 'recebimento'], tela: TelaReceber },
  { id: 'saidas', titulo: 'Saídas', papeis: ['admin', 'pesagem', 'almoxarifado', 'recebimento'], tela: TelaSaidas },
  { id: 'inventario', titulo: 'Inventário', papeis: ['admin', 'almoxarifado', 'recebimento'], tela: TelaInventario },
  { id: 'contagem', titulo: 'Contagem inicial', papeis: ['admin', 'almoxarifado'], tela: TelaContagemInicial },
  { grupo: 'Compras' },
  { id: 'pedidos', titulo: 'Pedidos de compra', papeis: ['admin', 'comprador', 'almoxarifado', 'recebimento', 'diretoria'], tela: TelaPedidos },
  { id: 'estoque', titulo: 'Posição de estoque', papeis: TODOS, tela: TelaEstoque, aoVivo: true },
  { id: 'movimentos', titulo: 'Kardex (movimentações)', papeis: TODOS, tela: TelaMovimentos },
  { id: 'relatorios', titulo: 'Relatórios', papeis: ['admin', 'comprador', 'almoxarifado', 'diretoria'], tela: TelaRelatorios },
  { grupo: 'Cadastros' },
  { id: 'produtos', titulo: 'Produtos', papeis: TODOS, tela: TelaProdutos },
  { id: 'fornecedores', titulo: 'Fornecedores', papeis: ['admin', 'comprador', 'almoxarifado', 'recebimento', 'diretoria'], tela: TelaFornecedores },
  { id: 'fichas', titulo: 'Fichas técnicas', papeis: ['admin', 'engenharia', 'pesagem', 'almoxarifado', 'diretoria'], tela: TelaFichas },
  { id: 'cadastros-producao', titulo: 'Masseiras e padeiros', papeis: ['admin', 'engenharia', 'diretoria', 'gestor_producao'], tela: TelaCadastrosProducao },
  { grupo: 'Manutenção de veículos', papeis: ['admin', 'frota'] },
  { id: 'frota', titulo: 'Painel da frota', papeis: ['admin', 'frota'], tela: TelaFrotaPainel },
  { id: 'frota-apontar', titulo: 'Apontar despesas', papeis: ['admin', 'frota'], tela: TelaFrotaApontar },
  { id: 'frota-veiculos', titulo: 'Veículos', papeis: ['admin', 'frota'], tela: TelaFrotaVeiculos },
  { id: 'frota-placas', titulo: 'Placas a resolver', papeis: ['admin', 'frota'], tela: TelaFrotaPlacas },
  { id: 'frota-importar', titulo: 'Importar despesas', papeis: ['admin'], tela: TelaFrotaImportar },   // só o administrador importa
  { id: 'frota-tipos', titulo: 'Tipos de manutenção', papeis: ['admin', 'frota'], tela: TelaFrotaTipos },
  { grupo: 'Administração', papeis: ['admin', 'diretoria'] },
  { id: 'usuarios', titulo: 'Usuários e acessos', papeis: ['admin'], tela: TelaUsuarios },
  { id: 'configuracoes', titulo: 'Configurações e locais', papeis: ['admin'], tela: TelaConfiguracoes },
  { id: 'auditoria', titulo: 'Auditoria (log)', papeis: ['admin', 'diretoria'], tela: TelaAuditoria },
];
// tabelas que, quando mudam, atualizam as telas abertas (tempo real)
// OPERACAO: atualização leve (saldos, transferências, requisições, programação)
// BASE: atualização completa (pedidos, recebimentos, cadastros) — só chegam aqui se a tabela estiver na
// publicação de tempo real do Supabase; sem isso, a conferência periódica (abaixo) cobre.
const TABELAS_OPERACAO = ['movimentos', 'estoque_local', 'transferencias', 'requisicoes', 'bateladas', 'programacoes', 'producoes', 'avisos_producao', 'correcoes_producao'];
const TABELAS_BASE = ['pedidos', 'pedido_itens', 'recebimentos', 'produtos', 'fornecedores', 'fichas_tecnicas', 'ficha_itens', 'parametros',
  'perfis', 'locais', 'unidades', 'maceiras', 'operadores', 'linhas_producao'];
const TABELAS_AO_VIVO = [...TABELAS_OPERACAO, ...TABELAS_BASE];
// conferência periódica (só com a aba visível): telas "ao vivo" a cada 30 s, as demais a cada 90 s;
// a carga completa (pedidos, recebimentos, cadastros) a cada 3 min; consumo médio (estatística pesada) a cada 15 min
const CICLO_VIVO_MS = 30000, CICLO_OUTRAS_MS = 90000, CICLO_COMPLETO_MS = 180000, CICLO_STATS_MS = 900000;


// ------------------------- Carregamento dos dados comuns ------------
// Histórico: ao entrar, só os últimos HISTORICO_DIAS dias (+ tudo que está em aberto). Período mais antigo
// é buscado quando alguém pesquisa (useHistorico). A atualização automática é "leve": só o que muda na operação.
const HISTORICO_DIAS = 60;
const hojeMenos = (d) => { const x = new Date(); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };
const agrupar = (lista, campo) => { const m = new Map(); for (const x of lista) { const k = x[campo]; if (k === null || k === undefined) continue; const l = m.get(k); if (l) l.push(x); else m.set(k, [x]); } return m; };
const unir = (...listas) => { const m = new Map(); listas.flat().forEach((x) => m.set(x.id, x)); return [...m.values()].sort((a, b) => a.id - b.id); };
async function porIds(tabela, campo, ids, seguro) {
  const partes = []; for (let i = 0; i < ids.length; i += 150) partes.push(ids.slice(i, i + 150));
  const r = await Promise.all(partes.map((p) => seguro(api.listar(tabela, { em: { [campo]: p } }))));
  return r.flat();
}
async function carregarDados(anterior, opcoes = {}) {
  const seguro = (pr) => pr.catch(() => []);   // papéis restritos (financeiro/faturamento) não leem tudo
  const leve = !!(opcoes.leve && anterior);
  const desde = opcoes.desde || anterior?.historicoDesde || hojeMenos(HISTORICO_DIAS);
  const ini = new Date(desde + 'T00:00:00').toISOString();
  const operacao = () => Promise.all([
    api.listar('produtos'), seguro(api.listar('estoque_local')),
    seguro(api.listar('transferencias', { em: { situacao: ['separada', 'enviada'] } })),
    seguro(api.listar('requisicoes', { em: { situacao: ['pendente', 'parcial'] } })),
    Promise.all([api.listar('programacoes', { campoData: 'data', desde }), api.listar('programacoes', { eq: { situacao: 'ativa' }, nulo: ['finalizada_em'] })]).then((x) => unir(...x)),
    // avisos de mudança na programação ainda não vistos no tablet (últimos 2 dias)
    seguro(api.listar('avisos_producao', { nulo: ['ciente_em'], campoData: 'criado_em', desde: new Date(Date.now() - 2 * 864e5).toISOString() })),
    // sininho: bateladas batendo (atraso para engenharia/gestor) e o que esta pessoa já viu
    seguro(api.listar('bateladas', { eq: { situacao: 'em_producao' } })),
    seguro(api.listar('sininho_vistos', { campoData: 'visto_em', desde: new Date(Date.now() - 30 * 864e5).toISOString() })),
    // manutenção de veículos: quantas notas esperam apontamento e placas a resolver (nulo para quem não tem a frota)
    api.rpc('frota_pendencias').catch(() => null),
  ]);
  // DESEMPENHO: a parte da operação começa junto com o resto (antes esperava tudo terminar);
  // a carga completa vai em 2 rodadas paralelas (antes eram 4 em sequência)
  const opP = operacao();
  opP.catch(() => {});   // o erro é tratado no await abaixo
  let base;
  if (leve) {
    base = anterior;
  } else {
    const [parametros, fornecedores, fichas, fichaItens, pedidos, perfis, unidades, locais, linhas, maceiras, operadores] = await Promise.all([
      api.listar('parametros'), api.listar('fornecedores'), api.listar('fichas_tecnicas'), api.listar('ficha_itens'),
      Promise.all([api.listar('pedidos', { campoData: 'data_pedido', desde }), api.listar('pedidos', { em: { status: ['aberto', 'parcial'] } })]).then((x) => unir(...x)),
      api.listar('perfis'),
      seguro(api.listar('unidades')), seguro(api.listar('locais')), seguro(api.listar('linhas_producao')),
      seguro(api.listar('maceiras')), seguro(api.listar('operadores')),
    ]);
    const params = Object.fromEntries(parametros.map((p) => [p.chave, p.valor]));
    const ids = pedidos.map((p) => p.id);
    const statsVelhas = anterior && !opcoes.renovarStats ? anterior.stats : null;
    const [pedidoItens, recebimentos, stats] = await Promise.all([
      porIds('pedido_itens', 'pedido_id', ids, seguro),
      Promise.all([api.listar('recebimentos', { desde: ini }), porIds('recebimentos', 'pedido_id', ids, seguro),
        seguro(api.listar('recebimentos', { eq: { divergencia: true }, nulo: ['ciente_por'] }))]).then((x) => unir(...x)),
      statsVelhas ? Promise.resolve(statsVelhas) : api.rpc('estatisticas_estoque', { p_janela: Number(params.janela_consumo_dias || 90) }),
    ]);
    base = { parametros, params, fornecedores, fichas, fichaItens, pedidos, pedidoItens, perfis, recebimentos, stats, unidades, locais, linhas, maceiras, operadores,
      statsEm: statsVelhas ? anterior.statsEm : Date.now(), completoEm: Date.now() };
  }
  const [produtos, estoqueLocal, transferencias, requisicoes, programacoes, avisos, bateladasAbertas, vistos, frotaPend] = await opP;
  const [transfItens, reqItens] = await Promise.all([
    transferencias.length ? porIds('transferencia_itens', 'transferencia_id', transferencias.map((t) => t.id), seguro) : [],
    requisicoes.length ? porIds('requisicao_itens', 'requisicao_id', requisicoes.map((t) => t.id), seguro) : [],
  ]);
  const { parametros, params, fornecedores, fichas, fichaItens, pedidos, pedidoItens, perfis, recebimentos, stats, unidades, locais, linhas, maceiras, operadores } = base;
  const ind = indicadores(produtos, stats || [], params, fornecedores);
  // índices (DESEMPENHO): as telas acham os itens/recebimentos de um pedido e o saldo de um produto num local
  // sem varrer a lista inteira para cada linha
  const itensPedido = leve && anterior.mapa.itensPedido ? anterior.mapa.itensPedido : agrupar(pedidoItens, 'pedido_id');
  const recPedido = leve && anterior.mapa.recPedido ? anterior.mapa.recPedido : agrupar(recebimentos, 'pedido_id');
  const saldoLocal = new Map(estoqueLocal.map((e) => [`${e.produto_id}|${e.local_id}`, e]));
  return {
    statsEm: base.statsEm, completoEm: base.completoEm,
    produtos, fornecedores, fichas, fichaItens, pedidos, pedidoItens, perfis, recebimentos, programacoes, parametros, params, stats, ind,
    unidades, locais: [...locais].sort((a, b) => a.ordem - b.ordem || a.id - b.id), estoqueLocal, linhas, maceiras: [...maceiras].sort((a, b) => a.ordem - b.ordem || a.id - b.id), operadores,
    transferencias, transfItens, requisicoes, reqItens, avisos: avisos || [], bateladasAbertas: bateladasAbertas || [], vistos: vistos || [], frotaPend: frotaPend || null, historicoDesde: desde,
    mapa: { produto: porId(produtos), fornecedor: porId(fornecedores), ficha: porId(fichas), perfil: porId(perfis), ind: porId(ind),
      local: porId(locais), unidade: porId(unidades), maceira: porId(maceiras), operador: porId(operadores), linha: porId(linhas),
      itensPedido, recPedido, saldoLocal },
    carregadoEm: new Date(),
  };
}

// SININHO POR RESPONSÁVEL: cada aviso vai só para quem precisa agir. O admin NÃO recebe tudo:
// só o que for dos outros papéis que ele também tiver. Avisos só informativos (ex.: "mercadoria
// recebida") somem quando a pessoa abre; os de ação somem quando a ação é feita.
const SEMANA_MS = 7 * 864e5;
export function pendencias(dados, papeis, eu, agora = Date.now()) {
  if (!dados) return [];
  const resp = (papeis || []).filter((p) => p !== 'admin');
  const tem = (p) => resp.includes(p);
  const meus = new Set(dados.locais.filter((l) => (l.papeis || []).some((x) => resp.includes(x))).map((l) => l.id));
  const vistos = new Set((dados.vistos || []).map((v) => v.chave));
  const itens = [];
  const add = (i) => { if (!i.chave || !vistos.has(i.chave)) itens.push(i); };
  const forn = (id) => dados.mapa.fornecedor.get(id)?.nome || '';
  // ESTOQUE: requisição para atender (local de origem) e transferência chegando (local de destino)
  dados.requisicoes.filter((x) => meus.has(x.origem_id)).forEach((x) => add({ tipo: 'req', icone: 'requisicoes', id: x.id, rota: 'requisicoes',
    texto: `Requisição nº ${x.id} para atender`, sub: `${dados.mapa.local.get(x.destino_id)?.nome || ''} · ${dados.mapa.perfil.get(x.solicitante_id)?.nome || ''}`, quando: x.criado_em }));
  const recebo = new Set(dados.locais.filter((l) => recebeNoLocal(papeis, l)).map((l) => l.id));
  dados.transferencias.filter((t) => t.situacao === 'enviada' && recebo.has(t.destino_id)).forEach((t) => add({ tipo: 'tr', icone: 'transferencias', id: t.id, rota: 'transferencias',
    texto: `Transferência nº ${t.id} chegando`, sub: `de ${dados.mapa.local.get(t.origem_id)?.nome || ''} para ${dados.mapa.local.get(t.destino_id)?.nome || ''}`, quando: t.enviado_em }));
  // FINANCEIRO: pedido para lançar (some quando marcar "lançado") e cancelado já lançado (estornar)
  if (tem('financeiro')) {
    const lancar = dados.pedidos.filter((x) => !x.fin_lancado && x.status !== 'cancelado').sort((a, b) => b.id - a.id);
    if (lancar.length > 3) {   // muitos: uma linha só (abre a lista já filtrada)
      add({ tipo: 'fin', icone: 'financeiro', id: 'lancar', rota: 'financeiro', estado: { rapido: 'pendentes' }, texto: `${lancar.length} pedidos para lançar no seu sistema`,
        sub: `o mais novo: ${numeroPedido(lancar[0].id)} · ${forn(lancar[0].fornecedor_id)}`, quando: lancar[0].criado_em || lancar[0].data_pedido });
    } else {
      lancar.forEach((x) => add({ tipo: 'fin', icone: 'financeiro', id: x.id, rota: 'financeiro', estado: { rapido: 'pendentes' },
        texto: `Pedido ${numeroPedido(x.id)} para lançar no seu sistema`, sub: `${forn(x.fornecedor_id)}${x.previsao_entrega ? ` · entrega prevista ${data(x.previsao_entrega)}` : ''}`, quando: x.criado_em || x.data_pedido }));
    }
    dados.pedidos.filter((x) => x.status === 'cancelado' && x.fin_lancado).forEach((x) => add({ tipo: 'fin', icone: 'financeiro', id: x.id, rota: 'financeiro', estado: { rapido: 'cancelados' },
      texto: `Pedido ${numeroPedido(x.id)} CANCELADO: estornar no seu sistema`, sub: forn(x.fornecedor_id), quando: x.criado_em || x.data_pedido }));
  }
  // MERCADORIA RECEBIDA (últimos 7 dias): para o comprador do pedido e para o financeiro (some ao abrir)
  const pedidoDe = new Map(dados.pedidos.map((x) => [x.id, x]));
  const compradorAtivo = (uid) => !!dados.mapa.perfil.get(uid)?.ativo;
  dados.recebimentos.filter((x) => agora - new Date(x.data_hora).getTime() < SEMANA_MS).forEach((x) => {
    const ped = x.pedido_id ? pedidoDe.get(x.pedido_id) : null;
    const doComprador = tem('comprador') && (!ped || ped.comprador_id === eu || !compradorAtivo(ped.comprador_id));
    if (!doComprador && !tem('financeiro')) return;
    add({ tipo: 'rec', icone: 'receber', id: x.id, chave: `rec:${x.id}`, rota: doComprador ? 'pedidos' : 'financeiro',
      texto: x.pedido_id ? `Mercadoria recebida: ${numeroPedido(x.pedido_id)}` : 'Mercadoria recebida SEM pedido',
      sub: `${forn(x.fornecedor_id)}${x.nota_fiscal ? ` · NF ${x.nota_fiscal}` : ''}${x.divergencia ? ' · com diferença' : ''}`, quando: x.data_hora });
  });
  // COMPRADOR: recebimento com diferença ou sem pedido esperando a ciência dele; pré-cadastros para completar
  if (tem('comprador')) {
    dados.recebimentos.filter((x) => !x.ciente_por && (x.divergencia || !x.pedido_id)).forEach((x) => {
      const ped = x.pedido_id ? pedidoDe.get(x.pedido_id) : null;
      if (ped && ped.comprador_id !== eu && compradorAtivo(ped.comprador_id)) return;
      add({ tipo: 'rec', icone: 'aviso', id: x.id, rota: 'pedidos', texto: x.pedido_id ? `Dar ciência: ${numeroPedido(x.pedido_id)} chegou diferente` : 'Dar ciência: recebido sem pedido',
        sub: `${forn(x.fornecedor_id)}${x.nota_fiscal ? ` · NF ${x.nota_fiscal}` : ''}`, quando: x.data_hora });
    });
    dados.produtos.filter((x) => x.pre_cadastro).forEach((x) => add({ tipo: 'pre', icone: 'produtos', id: x.id, rota: 'produtos', estado: { abrirId: x.id },
      texto: `Completar cadastro: ${x.descricao}`, sub: 'Produto pré-cadastrado no recebimento', quando: x.pre_cadastro_em }));
    dados.fornecedores.filter((x) => x.pre_cadastro).forEach((x) => add({ tipo: 'pre', icone: 'fornecedores', id: x.id, rota: 'fornecedores', estado: { abrirId: x.id },
      texto: `Completar cadastro: ${x.nome}`, sub: 'Fornecedor pré-cadastrado no recebimento', quando: x.pre_cadastro_em }));
  }
  // PRODUÇÃO: batelada ATRASADA (passou do tempo + tolerância) — engenharia e gestor da produção
  if (tem('engenharia') || tem('gestor_producao')) {
    (dados.bateladasAbertas || []).forEach((b) => {
      const m = dados.mapa.maceira.get(b.maceira_id); const pz = prazoBatelada(dados, b.ficha_id, m); const min = duracaoBatelada(b, agora);
      if (estadoTempo(min, pz) !== 'atraso') return;
      add({ tipo: 'atraso', icone: 'relogio', id: b.id, rota: 'painel-producao',
        texto: `Batelada ATRASADA: ${m?.nome || 'masseira'}${b.operador_id ? ` (${dados.mapa.operador.get(b.operador_id)?.nome || ''})` : ''}`,
        sub: `${dados.mapa.ficha.get(b.ficha_id)?.nome || ''} · ${tempoTexto(min)} (prazo ${pz.tempo} + ${pz.tol} min)`, quando: b.iniciada_em });
    });
  }
  // MANUTENÇÃO DE VEÍCULOS: notas novas para apontar e placas para cadastrar/corrigir (quem tem o papel "frota")
  const fp = dados.frotaPend;
  if (fp && tem('frota')) {
    if (fp.apontar > 0) add({ tipo: 'frota', icone: 'frota-apontar', id: 'apontar', rota: 'frota-apontar', estado: {},
      texto: `${pl(fp.apontar, 'despesa de veículo para apontar', 'despesas de veículos para apontar')}`, sub: 'Marque o tipo de manutenção de cada nota', quando: fp.ultima_importacao });
    if (fp.placas > 0) add({ tipo: 'frota', icone: 'frota-placas', id: 'placas', rota: 'frota-placas', estado: {},
      texto: `${pl(fp.placas, 'placa para cadastrar ou corrigir', 'placas para cadastrar ou corrigir')}`, sub: 'Apareceram nas despesas e não estão no cadastro', quando: fp.ultima_importacao });
  }
  return itens.sort((a, b) => String(b.quando || '').localeCompare(String(a.quando || '')));
}

function Sininho({ dados, papeis, ir, usuario, recarregar }) {
  const [aberto, setAberto] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) setAgora(Date.now()); }, 60000); return () => clearInterval(t); }, []);
  const itens = pendencias(dados, papeis, usuario?.user_id, agora);
  const informativos = itens.filter((i) => i.chave);
  const marcar = (chaves) => api.rpc('marcar_vistos', { p: chaves }).then(() => recarregar(true)).catch(() => { /* sem conexão: tenta de novo na próxima */ });
  const ant = useRef(null);
  useEffect(() => {   // aviso do aparelho quando chega algo novo (se a pessoa ativou)
    const n = itens.length;
    if (ant.current !== null && n > ant.current && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification('Artas Indústria', { body: itens[0]?.texto || 'Nova pendência', icon: 'icons/icon-192.png', tag: 'pss-pendencias' }); } catch { /* ignora */ }
    }
    ant.current = n;
  }, [itens.length]);
  useEffect(() => {   // Esc fecha a lista de avisos
    if (!aberto) return undefined;
    const f = (e) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('keydown', f); return () => document.removeEventListener('keydown', f);
  }, [aberto]);
  const podeAvisar = 'Notification' in window && Notification.permission === 'default';
  return html`<div class="sininho">
    <button class="btn-icone" title=${itens.length ? `${itens.length} pendência(s)` : 'Sem pendências'} aria-label=${itens.length ? `Avisos: ${pl(itens.length, 'pendência', 'pendências')}` : 'Avisos: nenhuma pendência'} aria-expanded=${aberto} aria-haspopup="true" onClick=${() => setAberto(!aberto)}>
      <${Icone} nome="sino" />${itens.length > 0 && html`<span class="sino-num">${itens.length > 99 ? '99+' : itens.length}</span>`}</button>
    ${aberto && html`<div class="menu-fundo transparente" onClick=${() => setAberto(false)}></div><div class="sino-caixa">
      <b>${itens.length ? `Você tem ${pl(itens.length, 'pendência', 'pendências')}` : 'Nenhuma pendência agora'}</b>
      ${itens.slice(0, 12).map((i) => html`<button class="sino-item" key=${i.tipo + i.id + (i.chave || '')} onClick=${() => { setAberto(false); if (i.chave) marcar([i.chave]); ir(i.rota, i.estado || { abrir: i }); }}>
        <span class=${'sino-ico ' + i.tipo} aria-hidden="true"><${Icone} nome=${i.icone || 'sino'} tam=${18} /></span><span><b>${i.texto}</b><small>${i.sub}</small></span></button>`)}
      ${itens.length > 12 && html`<small class="sino-mais">e mais ${itens.length - 12}…</small>`}
      ${informativos.length > 0 && html`<button class="btn btn-sec btn-peq" onClick=${() => marcar(informativos.map((i) => i.chave))}>Marcar recebimentos como vistos (${informativos.length})</button>`}
      ${podeAvisar && html`<button class="btn btn-sec btn-peq" onClick=${() => Notification.requestPermission()}>Ativar avisos neste aparelho</button>`}
    </div>`}
  </div>`;
}

// ------------------------- Login ------------------------------------
function Login({ aoEntrar }) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [demo, setDemo] = useState([]);
  useEffect(() => { if (api.modo === 'demo') api.usuariosDemo().then(setDemo); }, []);

  // Proteção contra tentativa e erro: depois de 5 erros, espera crescente (o Supabase também limita no servidor)
  async function entrar(u = usuario, s = senha) {
    const k = 'pss-estoque-tentativas';
    let t = { n: 0, ate: 0 }; try { t = JSON.parse(localStorage.getItem(k)) || t; } catch { /* ignora */ }
    if (api.modo !== 'demo' && Date.now() < t.ate) return avisar(`Muitas tentativas erradas. Tente de novo em ${Math.ceil((t.ate - Date.now()) / 1000)} segundos.`, 'erro');
    setOcupado(true);
    try {
      const p = await api.entrar(u, s);
      try { localStorage.removeItem(k); } catch { /* ignora */ }
      api.rpc('registrar_acesso', { p_evento: 'entrada', p_detalhe: null, p_agente: navigator.userAgent }).catch(() => {});
      aoEntrar(p);
    } catch (e) {
      if (api.modo !== 'demo') { t.n += 1; if (t.n >= 5) t.ate = Date.now() + Math.min(15 * 60, 30 * 2 ** (t.n - 5)) * 1000; try { localStorage.setItem(k, JSON.stringify(t)); } catch { /* ignora */ } }
      avisar(/invalid login|credentials/i.test(mensagemErro(e)) ? 'Usuário ou senha incorretos.' : mensagemErro(e), 'erro');
    } finally { setOcupado(false); setSenha(''); }
  }
  return html`<div class="login">
    <div class="login-tema"><${BotaoTema} /></div>
    <div class="login-caixa">
      <div class="login-marca">
        <img src="icons/logo-pss.png" alt="Pães São Sebastião" />
        <${MarcaArtas} classe="marca-login" />
      </div>
      ${api.modo === 'demo' ? html`
        <p class="login-demo">Modo demonstração: escolha um perfil para testar. Os dados são fictícios e ficam só neste navegador.</p>
        <div class="login-perfis">
          ${demo.map((p) => html`<button class="btn btn-sec" disabled=${ocupado} onClick=${() => entrar(p.usuario, '')}>
            <strong>${p.nome}</strong><small>${p.funcao || papeisTexto(p.papeis)}</small></button>`)}
        </div>` : html`
        <form onSubmit=${(e) => { e.preventDefault(); entrar(); }}>
          <${Campo} rotulo="Usuário"><input class="entrada" autocomplete="username" autocapitalize="none" value=${usuario}
            onInput=${(e) => setUsuario(e.target.value)} required /></${Campo}>
          <${Campo} rotulo="Senha"><input class="entrada" type="password" autocomplete="current-password" value=${senha}
            onInput=${(e) => setSenha(e.target.value)} required /></${Campo}>
          <button class="btn btn-pri btn-bloco" disabled=${ocupado}>${ocupado ? 'Entrando…' : 'Entrar'}</button>
        </form>
        <p class="nota">Esqueceu a senha? Fale com o administrador do sistema.</p>`}
      <${Assinatura} />
    </div>
  </div>`;
}

// ------------------------- Assinatura de propriedade -----------------
const ANO = new Date().getFullYear();
function Assinatura() {
  return html`<div class="assinatura">
    <img src="icons/logo-palamoni.png" alt="Palamoni Consultoria Empresarial" />
    <p>Artas Indústria ${window.VERSAO_APP || ''} · licenciado para Pães São Sebastião · © ${ANO} Palamoni Consultoria Empresarial</p>
  </div>`;
}

// Botão do tema (claro / escuro), no topo
function BotaoTema() {
  const [tema, setTema] = useState(() => document.documentElement.getAttribute('data-tema') || 'claro');
  useEffect(() => { const f = (e) => setTema(e.detail); window.addEventListener('pss-tema', f); return () => window.removeEventListener('pss-tema', f); }, []);
  function trocar() {
    const t = tema === 'escuro' ? 'claro' : 'escuro';
    try { localStorage.setItem('pss-tema', t); } catch { /* sem armazenamento */ }
    if (window.PSS_TEMA) window.PSS_TEMA.aplicar(t); else document.documentElement.setAttribute('data-tema', t);
    setTema(t);
  }
  const escuro = tema === 'escuro';
  return html`<button class="botao-tema" onClick=${trocar} aria-pressed=${escuro} title=${escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro (descansa a vista)'}
    aria-label=${escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}>
    <span class="bt-trilho"><span class="bt-bola">${escuro
      ? html`<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8Z" /></svg>`
      : html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>`}</span></span>
    <span class="bt-txt">${escuro ? 'Escuro' : 'Claro'}</span></button>`;
}

// Barra de baixo no celular: 4 atalhos do papel da pessoa + Menu (ao alcance do polegar)
function BarraInferior({ papeis, visiveis, atual, dados, abrirMenu, menuAberto }) {
  const tem = (id) => visiveis.some((m) => m.id === id);
  const um = (...ids) => ids.find(tem);
  const admin = papeis.includes('admin');
  const meus = new Set((dados?.locais || []).filter((l) => operaLocal(papeis, l)).map((l) => l.id));
  const nTransf = (dados?.transferencias || []).filter((t) => (t.situacao === 'enviada' && (admin || meus.has(t.destino_id))) || (t.situacao === 'separada' && (admin || meus.has(t.origem_id)))).length;
  const nReq = (dados?.requisicoes || []).filter((r) => admin || meus.has(r.origem_id)).length;
  const itens = [
    { id: um('inicio'), t: 'Início', i: 'inicio' },
    { id: um('painel-producao', 'maceiras', 'programacao', 'previsao'), t: 'Produção' },
    { id: um('estoque-local', 'estoque'), t: 'Estoque' },
    { id: papeis.some((p) => ['almoxarifado', 'recebimento'].includes(p)) ? um('requisicoes', 'receber') : papeis.includes('comprador') ? um('pedidos') : um('transferencias', 'custos', 'financeiro'),
      t: null },
    { id: papeis.includes('frota') ? um('frota-apontar') : null },
    { id: papeis.includes('frota') ? um('frota') : null },
    { id: papeis.includes('frota') ? um('frota-veiculos') : null },
  ].filter((x) => x.id).filter((x, i, l) => l.findIndex((y) => y.id === x.id) === i).slice(0, 4);
  const nome = (id) => ({ 'painel-producao': 'Produção', maceiras: 'Masseiras', programacao: 'Pesagem', previsao: 'Produção', 'estoque-local': 'Estoque', estoque: 'Estoque',
    requisicoes: 'Requisições', receber: 'Receber', pedidos: 'Pedidos', transferencias: 'Transferir', custos: 'Custos', financeiro: 'A pagar', inicio: 'Início',
    frota: 'Frota', 'frota-apontar': 'Apontar', 'frota-veiculos': 'Veículos' })[id];
  const conta = (id) => (id === 'requisicoes' ? nReq : id === 'transferencias' ? nTransf : id === 'frota-apontar' ? (dados?.frotaPend?.apontar || 0) : 0);
  return html`<nav class="barra-inferior" aria-label="Atalhos">
    ${itens.map((x) => html`<a href=${'#' + x.id} class=${'bi-item' + (atual === x.id && !menuAberto ? ' ativo' : '')} aria-current=${atual === x.id ? 'page' : null}>
      <span class="bi-ico"><${Icone} nome=${x.id} tam=${22} />${conta(x.id) > 0 && html`<b class="bi-num">${conta(x.id)}</b>`}</span><span>${nome(x.id)}</span></a>`)}
    <button class=${'bi-item' + (menuAberto ? ' ativo' : '')} onClick=${abrirMenu} aria-label="Abrir o menu completo"><span class="bi-ico"><${Icone} nome="menu" tam=${22} /></span><span>Menu</span></button>
  </nav>`;
}

// ------------------------- Trocar senha -----------------------------
// Regras de senha: 10+ caracteres, letras e números, diferente do usuário
export function problemaSenha(senha, usuario) {
  if (senha.length < 10) return 'A senha precisa de pelo menos 10 caracteres.';
  if (!/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) return 'Use letras e números na senha.';
  if (usuario && senha.toLowerCase().includes(String(usuario).toLowerCase())) return 'A senha não pode conter o seu usuário.';
  if (/^(.)\1+$/.test(senha) || /^(0123|1234|abcd|senha|pss)/i.test(senha)) return 'Senha muito fácil de adivinhar.';
  return null;
}
function TrocarSenha({ aoFechar, obrigatoria, usuario, aoConcluir }) {
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [oc, setOc] = useState(false);
  async function salvar() {
    const prob = problemaSenha(a, usuario?.usuario);
    if (prob) return avisar(prob, 'erro');
    if (a !== b) return avisar('As duas senhas não são iguais.', 'erro');
    setOc(true);
    try {
      await api.trocarSenha(a);
      api.rpc('registrar_acesso', { p_evento: 'senha_trocada', p_detalhe: null, p_agente: navigator.userAgent }).catch(() => {});
      avisar('Senha alterada.'); (aoConcluir || aoFechar)();
    } catch (e) { avisar(mensagemErro(e), 'erro'); } finally { setOc(false); }
  }
  return html`<${Modal} titulo=${obrigatoria ? 'Crie a sua senha' : 'Trocar minha senha'} aoFechar=${obrigatoria ? null : aoFechar}
    rodape=${html`${!obrigatoria ? html`<button class="btn btn-sec" onClick=${aoFechar}>Cancelar</button>`
      : html`<button class="btn btn-sec" onClick=${async () => { await api.sair(); location.reload(); }}>Sair</button>`}<button class="btn btn-pri" disabled=${oc} onClick=${salvar}>Salvar</button>`}>
    ${obrigatoria && html`<p>Este é o seu primeiro acesso (ou a senha foi redefinida). Crie uma senha só sua; ninguém, nem o administrador, fica sabendo qual é.</p>`}
    <${Campo} rotulo="Nova senha" ajuda="Pelo menos 10 caracteres, com letras e números."><input class="entrada" type="password" autocomplete="new-password" value=${a} onInput=${(e) => setA(e.target.value)} /></${Campo}>
    <${Campo} rotulo="Repita a nova senha"><input class="entrada" type="password" autocomplete="new-password" value=${b} onInput=${(e) => setB(e.target.value)} /></${Campo}>
  </${Modal}>`;
}

// Administrador: escolher entrar no próprio acesso ou VER COMO outra pessoa
// (não derruba a pessoa; o que for feito fica registrado em nome do administrador)
function EscolherVisao({ admin, aoEscolher, aoFechar }) {
  const [lista, setLista] = useState(null);
  useEffect(() => { api.listar('perfis').then((l) => setLista(l.filter((p) => p.ativo && (p.papeis || []).length))).catch(() => setLista([])); }, []);
  return html`<${Modal} titulo="Entrar como" aoFechar=${aoFechar}>
    <p class="nota">Escolha o seu acesso ou veja o sistema exatamente como outra pessoa vê (mesmas telas e botões), sem tirar a pessoa do sistema.</p>
    <div class="login-perfis">
      <button class="btn btn-pri" onClick=${() => aoEscolher(null)}><strong>Meu acesso · ${admin.nome}</strong><small>Administrador: tudo liberado</small></button>
      ${(lista || []).filter((p) => p.user_id !== admin.user_id).map((p) => html`<button class="btn btn-sec" onClick=${() => aoEscolher(p)}>
        <strong>${p.nome}</strong><small>${p.funcao || papeisTexto(p.papeis)}</small></button>`)}
    </div>
    ${!lista && html`<${Carregando} />`}
  </${Modal}>`;
}

// ------------------------- Aplicativo --------------------------------
function App() {
  const [usuario, setUsuario] = useState(undefined);
  const [dados, setDados] = useState(null);
  const [rota, setRota] = useState((location.hash || '#inicio').slice(1));
  const [estadoRota, setEstadoRota] = useState(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [senha, setSenha] = useState(false);
  const [visao, setVisao] = useState(null);
  const [novaVersao, setNovaVersao] = useState(false);
  useEffect(() => { if (usuario?.user_id) carregarPreferencias(usuario.user_id); }, [usuario?.user_id]);   // colunas escolhidas por esta pessoa
  useEffect(() => {   // aviso de versão nova (o service worker trocou os arquivos)
    if (!('serviceWorker' in navigator)) return;
    let tinha = !!navigator.serviceWorker.controller;
    const f = () => { if (tinha) { setNovaVersao(true); window.__versaoTrocou = true; } tinha = true; };
    navigator.serviceWorker.addEventListener('controllerchange', f);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', f);
  }, []);            // perfil que o administrador está vendo
  const [escolher, setEscolher] = useState(false);
  const [recolhido, setRecolhido] = useState(() => { try { return localStorage.getItem('pss-menu-recolhido') === '1'; } catch { return false; } });
  const pilha = useRef([]);         // telas visitadas (para o botão "voltar")
  const voltando = useRef(false);
  const liberado = useRef(false);   // a pessoa já confirmou sair sem salvar
  const rotaAtual = useRef(rota);
  const [gruposFechados, setGruposFechados] = useState(() => { try { return JSON.parse(localStorage.getItem('pss-menu-grupos') || '[]'); } catch { return []; } });
  function alternarGrupo(g) {
    const v = gruposFechados.includes(g) ? gruposFechados.filter((x) => x !== g) : [...gruposFechados, g];
    setGruposFechados(v); try { localStorage.setItem('pss-menu-grupos', JSON.stringify(v)); } catch { /* sem armazenamento */ }
  }
  function alternarMenu() {
    const v = !recolhido; setRecolhido(v);
    try { localStorage.setItem('pss-menu-recolhido', v ? '1' : '0'); } catch { /* sem armazenamento */ }
  }

  useEffect(() => { api.sessaoAtual().then((u) => setUsuario(u)).catch(() => setUsuario(null)); }, []);
  useEffect(() => {
    const f = () => {
      const nova = (location.hash || '#inicio').slice(1);
      if (nova === rotaAtual.current) { voltando.current = false; return; }
      // há algo digitado e não salvo: pergunta antes de trocar de tela (a tela atual continua aberta)
      if (!liberado.current && haEdicao()) {
        const eraVoltar = voltando.current; voltando.current = false;
        try { history.replaceState(null, '', '#' + rotaAtual.current); } catch { /* ignora */ }
        confirmarDescarte().then((ok) => {
          if (!ok) { if (eraVoltar) pilha.current.push(nova); return; }
          liberado.current = true; voltando.current = eraVoltar; location.hash = '#' + nova;
        });
        return;
      }
      liberado.current = false;
      if (!voltando.current && nova !== rotaAtual.current) pilha.current.push(rotaAtual.current);
      voltando.current = false; rotaAtual.current = nova;
      setRota(nova); setMenuAberto(false);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  useEffect(() => { if (usuario) carregar(3, { avisarErro: true }); }, [usuario?.user_id]);
  // administrador: depois de entrar, escolhe o próprio acesso ou o de outra pessoa (uma vez por sessão)
  useEffect(() => {
    if (!usuario || !(usuario.papeis || []).includes('admin')) return;
    // a escolha vale para todas as abas do mesmo navegador até sair (abrir nova aba não pergunta de novo)
    let ja = null; try { ja = localStorage.getItem('pss-estoque-visao:' + usuario.user_id); } catch { /* ignora */ }
    if (ja === null && api.modo !== 'demo') setEscolher(true);
    else if (ja) api.listar('perfis', { eq: { user_id: ja } }).then((l) => l[0] && l[0].ativo && setVisao(l[0])).catch(() => {});
  }, [usuario?.user_id]);
  function escolherVisao(p) {
    setVisao(p); setEscolher(false);   // continua na mesma tela (não volta para o Início)
    try { localStorage.setItem('pss-estoque-visao:' + usuario.user_id, p ? p.user_id : ''); } catch { /* ignora */ }
    if (p) api.rpc('registrar_acesso', { p_evento: 'ver_como', p_detalhe: `${p.usuario} (${p.nome})`, p_agente: navigator.userAgent }).catch(() => {});
  }

  // Saiu em outra janela do sistema: esta também volta para a tela de entrada (segurança)
  useEffect(() => {
    if (!usuario) return;
    const f = (e) => { if (e.key === 'pss-estoque-saida' && e.newValue) location.reload(); };
    window.addEventListener('storage', f);
    return () => window.removeEventListener('storage', f);
  }, [usuario?.user_id]);

  // Sai sozinho depois de muito tempo sem uso (computador compartilhado)
  useEffect(() => {
    if (!usuario) return;
    // SEGURANÇA: perfis com mais poder (administrador, diretoria, financeiro) saem antes (2 h parado);
    // os demais em 8 h. Com algo digitado e não salvo, espera o prazo maior (não perder o que foi digitado).
    const gestao = (usuario.papeis || []).some((p) => ['admin', 'diretoria', 'financeiro'].includes(p));
    const longo = (CFG.SAIR_APOS_MINUTOS_SEM_USO || 480) * 60000;
    const curto = Math.min(longo, (CFG.SAIR_APOS_MINUTOS_SEM_USO_GESTAO || 120) * 60000);
    // várias janelas abertas: o uso em QUALQUER uma conta (uma janela esquecida não derruba a que está em uso)
    const CHAVE_USO = 'pss-estoque-ultimo-uso';
    const lerUso = () => { try { return Number(localStorage.getItem(CHAVE_USO)) || 0; } catch { return 0; } };
    let ultimo = Date.now(); let gravado = 0;
    const marcar = () => { ultimo = Date.now();
      if (ultimo - gravado > 15000) { gravado = ultimo; try { localStorage.setItem(CHAVE_USO, String(ultimo)); } catch { /* ignora */ } } };
    marcar();
    ['click', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, marcar, { passive: true }));
    const t = setInterval(() => {
      const limite = gestao && !haEdicao() ? curto : longo;
      if (Date.now() - Math.max(ultimo, lerUso()) > limite) { sair(); avisar('Sessão encerrada por falta de uso (segurança). Entre de novo para continuar.', 'aviso'); }
    }, 60000);
    return () => { clearInterval(t); ['click', 'keydown', 'touchstart'].forEach((ev) => document.removeEventListener(ev, marcar)); };
  }, [usuario?.user_id]);

  const dadosRef = useRef(null);
  dadosRef.current = dados;
  // FILA ÚNICA DE ATUALIZAÇÃO (desempenho e consistência): nunca roda duas cargas ao mesmo tempo
  // (em rede lenta, uma resposta velha podia sobrescrever uma nova). Pedidos que chegam durante uma
  // carga são juntados numa só carga seguinte, do nível mais alto pedido.
  // nível 1 = leve (operação) · 2 = completa reaproveitando o consumo médio · 3 = completa com consumo médio novo
  const carga = useRef({ ativa: false, nivel: 0, esperando: [], desde: null, avisarErro: false });
  function carregar(nivel, { avisarErro = false, desde = null } = {}) {
    const c = carga.current;
    c.nivel = Math.max(c.nivel, nivel); c.avisarErro = c.avisarErro || avisarErro;
    if (desde && (!c.desde || desde < c.desde)) c.desde = desde;
    const p = new Promise((resolve) => c.esperando.push(resolve));
    if (!c.ativa) rodarCarga();
    return p;
  }
  async function rodarCarga() {
    const c = carga.current;
    c.ativa = true;
    while (c.nivel > 0) {
      const ant = dadosRef.current;
      let nivel = c.nivel; const quem = c.esperando; const desde = c.desde; const avisarErro = c.avisarErro;
      c.nivel = 0; c.esperando = []; c.desde = null; c.avisarErro = false;
      if (!ant) nivel = 3;
      else if (nivel === 2 && Date.now() - (ant.statsEm || 0) > CICLO_STATS_MS) nivel = 3;
      try {
        const novo = await carregarDados(ant, { leve: nivel === 1, renovarStats: nivel === 3, desde });
        dadosRef.current = novo; setDados(novo);
      } catch (e) {
        if (avisarErro || !ant) avisar(mensagemErro(e), 'erro');
        if (desde && desde === buscandoHist.current) buscandoHist.current = null;
      }
      quem.forEach((r) => r());
    }
    c.ativa = false;
  }
  // depois de salvar algo: carga completa (o consumo médio só é recalculado se estiver velho)
  const recarregar = (silencioso) => carregar(2, { avisarErro: silencioso !== true });
  const recarregarLeve = () => carregar(1);
  // pesquisa de período antigo: busca o histórico que falta (uma vez) e mantém
  const buscandoHist = useRef(null);
  function garantirHistorico(de) {
    const atual = dadosRef.current; if (!atual || !de || de >= atual.historicoDesde || buscandoHist.current === de) return;
    buscandoHist.current = de;
    carregar(2, { desde: de, avisarErro: true }).finally(() => { if (buscandoHist.current === de) buscandoHist.current = null; });
  }
  // TEMPO REAL: quando alguém muda algo, a tela aberta se atualiza sozinha.
  // 1) aviso instantâneo do banco (operação → carga leve; pedidos/recebimentos/cadastros → completa;
  //    entrada de mercadoria também muda o pedido → completa)
  // 2) conferência periódica com a aba visível, em TODAS as telas (as "ao vivo" com mais frequência)
  // 3) ao voltar para a aba/app depois de um tempo, atualiza na hora
  // O que a pessoa está digitando não se perde: as telas guardam o que foi digitado no próprio estado,
  // e só voltam para "carregando…" quando a própria pessoa troca um filtro.
  const rotaViva = useRef(false);
  const pendenteAoVoltar = useRef(0);   // aviso que chegou com a aba escondida: aplica ao voltar
  useEffect(() => {
    if (!usuario || !api.aoMudar) return undefined;
    let t = null; let nivelAviso = 0;
    const desligar = api.aoMudar(TABELAS_AO_VIVO, (tabelas, carga) => {
      const lista = Array.isArray(tabelas) ? tabelas : [tabelas];
      const base = lista.some((x) => x === '*' || TABELAS_BASE.includes(x)) || (lista.includes('movimentos') && carga?.new?.tipo === 'entrada');
      nivelAviso = Math.max(nivelAviso, base ? 2 : 1);
      clearTimeout(t);
      t = setTimeout(() => { const nv = nivelAviso; nivelAviso = 0; if (!document.hidden) carregar(nv); else pendenteAoVoltar.current = Math.max(pendenteAoVoltar.current, nv); }, 1200);
    });
    let ultimaLeve = Date.now();
    const ciclo = setInterval(() => {
      if (document.hidden) return;
      const d = dadosRef.current; const agora = Date.now();
      if (d && agora - (d.completoEm || 0) >= CICLO_COMPLETO_MS) { ultimaLeve = agora; carregar(2); return; }
      if (agora - ultimaLeve >= (rotaViva.current ? CICLO_VIVO_MS : CICLO_OUTRAS_MS) - 1000) { ultimaLeve = agora; carregar(1); }
    }, 10000);
    const voltou = () => {
      if (document.hidden) return;
      const d = dadosRef.current; const parado = d ? Date.now() - (d.carregadoEm?.getTime?.() || 0) : Infinity;
      const pend = pendenteAoVoltar.current; pendenteAoVoltar.current = 0;
      if (pend || parado > 15000) { ultimaLeve = Date.now(); carregar(Math.max(pend, d && Date.now() - (d.completoEm || 0) > 60000 ? 2 : 1)); }
    };
    window.__pssAtualizar = recarregarLeve;   // usado nos testes automáticos (força a atualização automática)
    document.addEventListener('visibilitychange', voltou);
    window.addEventListener('focus', voltou);
    window.addEventListener('online', voltou);
    return () => { clearTimeout(t); clearInterval(ciclo); desligar && desligar(); document.removeEventListener('visibilitychange', voltou);
      window.removeEventListener('focus', voltou); window.removeEventListener('online', voltou); };
  }, [usuario?.user_id]);
  async function sair() {
    try { localStorage.setItem('pss-estoque-saida', String(Date.now())); } catch { /* ignora */ }   // avisa as outras janelas
    await api.rpc('registrar_acesso', { p_evento: 'saida', p_detalhe: null, p_agente: navigator.userAgent }).catch(() => {});
    await api.sair(); setUsuario(null); setVisao(null); setDados(null); location.hash = '#inicio';
    try { Object.keys(localStorage).filter((k) => k.startsWith('pss-estoque-visao')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignora */ }
  }
  // Nova janela do sistema (no app instalado no computador abre outra janela do próprio app). Mesmo login.
  function abrirNovaJanela(hash) {
    const url = location.href.split('#')[0] + hash;
    const j = window.open(url, '_blank');
    if (!j) avisar('O computador bloqueou a nova janela. Libere as janelas pop-up para este sistema e tente de novo.', 'aviso');
  }
  function voltar() {
    const ant = pilha.current.pop() || 'inicio';
    voltando.current = true; setEstadoRota(null);
    location.hash = '#' + ant; window.scrollTo(0, 0);
  }
  function ir(destino, estado = null) { setEstadoRota(estado); if (location.hash.slice(1) === destino) setRota(destino); else location.hash = '#' + destino; window.scrollTo(0, 0); }

  const telasRef = useRef(null);
  useEffect(() => {   // com o app parado, adianta as telas que esta pessoa pode abrir
    if (!dados) return undefined;
    const ociosa = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
    let i = 0; const lista = (telasRef.current || []).filter((m) => m.tela && m.tela.precarregar);
    let cancelado = false;
    const proxima = () => { if (cancelado || i >= lista.length) return; lista[i++].tela.precarregar().then(() => ociosa(proxima)); };
    const t = setTimeout(() => ociosa(proxima), 2500);
    return () => { cancelado = true; clearTimeout(t); };
  }, [!!dados, !!usuario]);
  if (usuario === undefined) return html`<${Carregando} />`;
  if (!usuario) return html`<${Login} aoEntrar=${setUsuario} /><${Avisos} />`;
  if (usuario.trocar_senha && api.modo !== 'demo') return html`<div class="login"><${TrocarSenha} obrigatoria usuario=${usuario}
    aoConcluir=${() => setUsuario({ ...usuario, trocar_senha: false })} /></div><${Avisos} />`;

  const real = usuario;                       // quem está logado (é quem fica registrado)
  const atual = visao || usuario;             // de quem são as telas mostradas
  const papeis = atual.papeis || [];
  definirOcultarValores(!veValores(papeis));   // pesagem/padeiro: nenhum R$ na tela
  const visiveis = MENU.filter((m) => !m.papeis || m.papeis.some((x) => papeis.includes(x)))
    .filter((m, i, l) => !m.grupo || (l[i + 1] && !l[i + 1].grupo));   // esconde grupo vazio
  const padrao = papeis.length === 1 && papeis[0] === 'padeiro' ? visiveis.find((m) => m.id === 'maceiras') : null;
  const itemAtual = (rota === 'inicio' && padrao) || visiveis.find((m) => m.id === rota) || visiveis.find((m) => !m.grupo);
  rotaViva.current = !!itemAtual.aoVivo;
  const grupoDe = (g) => g;
  const grupoAtual = (() => { let g = null; for (const m of visiveis) { if (m.grupo) g = m.grupo; else if (m.id === itemAtual.id) return g; } return null; })();
  const Tela = itemAtual.tela;
  telasRef.current = visiveis;
  const ctx = { usuario: atual, real, vendoComo: !!visao, verComo: escolherVisao, papeis, dados, recarregar, ir, voltar, rota: itemAtual.id, garantirHistorico, trilha: { grupo: grupoAtual, titulo: itemAtual.titulo }, estadoRota, setEstadoRota, podeFazer: (a) => pode(papeis, a), api };

  return html`<${Ctx.Provider} value=${ctx}>
    ${api.modo === 'demo' && html`<div class="faixa-demo">MODO DEMONSTRAÇÃO · dados fictícios
      <button class="btn-link" onClick=${async () => { await api.reiniciarDemo(); location.reload(); }}>reiniciar dados</button>
      ${window.self !== window.top && html`<br /><small>Nesta prévia, PDF, Excel e Imprimir ficam bloqueados pelo visualizador; no endereço publicado funcionam normalmente.</small>`}</div>`}
    <a class="pular" href="#conteudo" onClick=${(e) => { e.preventDefault(); document.getElementById('conteudo')?.focus(); }}>Pular para o conteúdo</a>
    <header class="topo">
      <button class="btn-icone so-celular" aria-label="Abrir menu" onClick=${() => setMenuAberto(!menuAberto)}><${Icone} nome="menu" /></button>
      <a class="marca" href="#inicio" title="Ir para o Início" aria-label="Ir para o Início">
        <img src="icons/logo-pss.png" alt="Pães São Sebastião" />
        <span class="marca-sep" aria-hidden="true"></span><${MarcaArtas} classe="marca-sistema" />
      </a>
      <div class="topo-usuario">
        <span class="so-tela"><strong>${atual.nome}</strong><small>${atual.funcao || papeisTexto(papeis)}</small></span>
        <${BotaoTema} />
        ${dados && html`<${Sininho} dados=${dados} papeis=${papeis} ir=${ir} usuario=${atual} recarregar=${recarregar} />`}
        ${(real.papeis || []).includes('admin') && html`<button class="btn-icone so-tela" title="Entrar como / ver como outra pessoa" aria-label="Ver como outra pessoa" onClick=${() => setEscolher(true)}><${Icone} nome="usuarios" /></button>`}
        ${api.modo !== 'demo' && html`<button class="btn-icone so-tela" title="Trocar senha" aria-label="Trocar senha" onClick=${() => setSenha(true)}><${Icone} nome="chave" /></button>`}
        <button class="btn-icone so-tela so-mouse" title="Abrir esta tela em uma nova janela (Ctrl + clique num item do menu também abre em nova janela)"
          aria-label="Abrir em nova janela" onClick=${() => abrirNovaJanela(location.hash || '#inicio')}><${Icone} nome="novaJanela" /></button>
        <button class="btn-icone so-tela" title="Sair" aria-label="Sair" onClick=${protegido(sair)}><${Icone} nome="sair" /></button>
      </div>
    </header>
    ${visao && html`<div class="faixa-vendo"><${Icone} nome="usuarios" tam=${16} /> Vendo como <b>${visao.nome}</b> (${visao.funcao || papeisTexto(visao.papeis)}). O que você fizer fica registrado em seu nome (${real.nome}).
      <button class="btn btn-sec btn-peq" onClick=${() => escolherVisao(null)}>Voltar ao meu acesso</button></div>`}
    <div class="corpo">
      <nav class=${'menu' + (menuAberto ? ' aberto' : '') + (recolhido ? ' recolhido' : '')}>
        <button class="menu-recolher so-tela" title=${recolhido ? 'Mostrar o menu' : 'Esconder o menu (mais espaço na tela)'} onClick=${alternarMenu}>
          <${Icone} nome=${recolhido ? 'expandir' : 'recolher'} tam=${18} /></button>
        <div class="menu-usuario so-celular"><strong>${atual.nome}</strong><small>${atual.funcao || papeisTexto(papeis)}</small>
          <div class="mu-acoes">
            ${(real.papeis || []).includes('admin') && html`<button class="btn btn-sec btn-peq" onClick=${() => { setMenuAberto(false); setEscolher(true); }}><${Icone} nome="usuarios" tam=${16} /> Ver como</button>`}
            ${api.modo !== 'demo' && html`<button class="btn btn-sec btn-peq" onClick=${() => { setMenuAberto(false); setSenha(true); }}><${Icone} nome="chave" tam=${16} /> Senha</button>`}
            <button class="btn btn-sec btn-peq" onClick=${protegido(sair)}><${Icone} nome="sair" tam=${16} /> Sair</button>
          </div></div>
        ${(() => { let g = null; return visiveis.map((m) => {
          if (m.grupo) { g = m.grupo; const fechado = gruposFechados.includes(m.grupo) && grupoDe(m.grupo) !== grupoAtual;
            return html`<button class=${'menu-grupo' + (fechado ? ' fechado' : '')} aria-expanded=${!fechado} onClick=${() => alternarGrupo(m.grupo)}>
              <span>${m.grupo}</span><span class="mg-seta" aria-hidden="true">▾</span></button>`; }
          if (g && gruposFechados.includes(g) && g !== grupoAtual) return null;
          return html`<a href=${'#' + m.id} title=${m.titulo} class=${'menu-item' + (m.id === itemAtual.id ? ' ativo' : '')} aria-current=${m.id === itemAtual.id ? 'page' : null} onClick=${(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); abrirNovaJanela('#' + m.id); return; } setEstadoRota(null); setMenuAberto(false); }}
            onAuxClick=${(e) => { if (e.button === 1) { e.preventDefault(); abrirNovaJanela('#' + m.id); } }}>
              <${Icone} nome=${m.id} /> <span>${m.titulo}</span></a>`; }); })()}
        <div class="menu-rodape">
          <small>Desenvolvido por</small>
          <img class="logo-cheio" src="icons/logo-palamoni.png" alt="Palamoni Consultoria Empresarial" />
          <img class="logo-mini" src="icons/logo-palamoni-vertical.png" alt="Palamoni Consultoria Empresarial" />
          <small>versão ${window.VERSAO_APP || ''}</small>
        </div>
      </nav>
      ${menuAberto && html`<div class="menu-fundo" onClick=${() => setMenuAberto(false)}></div>`}
      <main class="conteudo" id="conteudo" tabindex="-1">
        <div class="conteudo-miolo">${dados ? html`<${Tela} key=${itemAtual.id} />` : html`<${Carregando} texto="Carregando dados…" />`}</div>
        <footer class="rodape"><${Assinatura} /></footer>
      </main>
    </div>
    <${BarraInferior} papeis=${papeis} visiveis=${visiveis} atual=${itemAtual.id} dados=${dados} menuAberto=${menuAberto} abrirMenu=${() => setMenuAberto(!menuAberto)} />
    ${senha && html`<${TrocarSenha} usuario=${real} aoFechar=${() => setSenha(false)} />`}
    ${escolher && html`<${EscolherVisao} admin=${real} aoEscolher=${escolherVisao} aoFechar=${() => escolherVisao(visao)} />`}
    ${novaVersao && html`<div class="faixa-versao">Há uma versão nova do sistema. <button class="btn btn-pri btn-peq" onClick=${protegido(() => location.reload())}>Atualizar agora</button></div>`}
    <${HostConfirmacao} />
    <${Avisos} />
  </${Ctx.Provider}>`;
}

// SEGURANÇA (anti-clickjacking): com dados reais, o sistema não abre dentro de outro site
// (golpe em que um site falso mostra o sistema "por baixo" para a pessoa clicar sem saber)
let dentroDeOutroSite = false; try { dentroDeOutroSite = window.self !== window.top; } catch { dentroDeOutroSite = true; }
if (CFG.MODO === 'supabase' && dentroDeOutroSite) {
  render(html`<div class="login"><div class="login-caixa"><div class="login-marca"><img src="icons/logo-pss.png" alt="Pães São Sebastião" /><${MarcaArtas} classe="marca-login" /></div>
    <p>Por segurança, o sistema só funciona no endereço oficial, fora de outros sites.</p>
    <a class="btn btn-pri btn-bloco" href=${location.href} target="_top" rel="noopener noreferrer">Abrir o sistema com segurança</a></div></div>`, document.getElementById('app'));
} else {
  render(html`<${App} />`, document.getElementById('app'));
}

// App instalável (PWA): registra o service worker quando possível
// funciona offline e pode ser instalado como aplicativo (fora da prévia, que roda dentro de um quadro)
let foraDeQuadro = true; try { foraDeQuadro = window.self === window.top; } catch { foraDeQuadro = false; }
if ('serviceWorker' in navigator && (CFG.MODO === 'supabase' || foraDeQuadro)) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
