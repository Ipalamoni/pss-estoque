// =====================================================================
// PREVISÃO · Pedidos em aberto (v2.25): tabelão dos pedidos de venda que vêm do ERP
// (integração a cada 30 min). Só leitura. Por enquanto só o administrador vê (regra no banco: pode('pedidos_erp')).
// =====================================================================
import { html, useState, useEffect, useMemo, useApp, Cabecalho, Tabela, Carregando, Etiqueta, avisar, Filtros, MultiEscolha, casaVarios, Busca } from '../ui.js';
import { data, dataHora, hojeISO, somarDias, mensagemErro, pl, num, moeda } from '../util.js';
import { Exportar } from '../exportar.js';

const SITUACOES = [{ valor: 'aberto', rotulo: 'Em aberto' }, { valor: 'saiu', rotulo: 'Saiu do ERP (faturado ou cancelado)' }];
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cliente = (r) => r.cliente_fantasia || r.cliente_nome || r.cliente_codigo || '';
const produto = (r) => `${r.produto_codigo} · ${r.produto_nome || ''}`;
const opcoesDe = (linhas, f) => [...new Set(linhas.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((v) => ({ valor: v, rotulo: v }));
const pacotes = (v) => num(v, 3, 0);
const br = (iso) => iso.split('-').reverse().join('/');

export function TelaPedidosErp() {
  const { api } = useApp();
  const [de, setDe] = useState(somarDias(hojeISO(), -30));
  const [ate, setAte] = useState(somarDias(hojeISO(), 30));
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState(['aberto']);
  const [produtos, setProdutos] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [cidades, setCidades] = useState([]);
  const [regs, setRegs] = useState(null);
  const [ultimo, setUltimo] = useState(null);

  function carregar(limpar) {
    if (limpar) setRegs(null);
    Promise.all([
      api.listar('erp_pedidos_itens', { campoData: 'data_venda', desde: de, ate: somarDias(ate, 1), ordem: ['data_venda', 'desc'] }),
      api.listar('erp_sincronizacoes', { ordem: ['id', 'desc'], limite: 1 }),
    ]).then(([l, s]) => { setRegs(l); setUltimo(s[0] || null); })
      .catch((e) => { avisar(mensagemErro(e), 'erro'); setRegs((r) => r || []); });
  }
  useEffect(() => { carregar(true); }, [de, ate]);
  // a integração envia a cada 30 min: confere de novo a cada 5 min sem apagar a tela
  useEffect(() => { const t = setInterval(() => carregar(false), 5 * 60 * 1000); return () => clearInterval(t); }, [de, ate]);

  const todos = regs || [];
  const lista = useMemo(() => {
    const b = semAcento(busca.trim());
    return todos.filter((r) => casaVarios(situacao, r.removido_em ? 'saiu' : 'aberto')
      && casaVarios(produtos, produto(r)) && casaVarios(grupos, r.grupo_nome) && casaVarios(vendedores, r.funcionario_nome) && casaVarios(cidades, r.cidade)
      && (!b || semAcento([r.numero, r.romaneio, r.cliente_codigo, r.cliente_nome, r.cliente_fantasia, r.rede_nome, r.produto_codigo, r.produto_nome].join(' ')).includes(b)));
  }, [regs, busca, situacao, produtos, grupos, vendedores, cidades]);
  const tot = useMemo(() => ({
    pedidos: new Set(lista.map((r) => r.empresa + '|' + r.numero)).size,
    pacotes: lista.reduce((s, r) => s + Number(r.quantidade || 0), 0),
    valor: lista.reduce((s, r) => s + Number(r.valor_total || 0), 0),
    semValor: lista.some((r) => r.valor_total === null || r.valor_total === undefined),
  }), [lista]);

  const ativos = [situacao.length !== 1 || situacao[0] !== 'aberto', produtos.length, grupos.length, vendedores.length, cidades.length, busca.trim()].filter(Boolean).length;
  const periodo = `${br(de)} a ${br(ate)}`;
  const colExp = [
    { titulo: 'Data da venda', valor: (r) => data(r.data_venda) },
    { titulo: 'Pedido', valor: (r) => r.numero },
    { titulo: 'Empresa', valor: (r) => r.empresa },
    { titulo: 'Romaneio', valor: (r) => r.romaneio },
    { titulo: 'Cód. cliente', valor: (r) => r.cliente_codigo },
    { titulo: 'Cliente', valor: cliente, largura: 30 },
    { titulo: 'Razão social', valor: (r) => r.cliente_nome, largura: 34 },
    { titulo: 'Rede', valor: (r) => r.rede_nome, largura: 20 },
    { titulo: 'Cidade', valor: (r) => (r.cidade ? `${r.cidade}${r.uf ? ' / ' + r.uf : ''}` : '') },
    { titulo: 'Cód. produto', valor: (r) => r.produto_codigo },
    { titulo: 'Produto', valor: (r) => r.produto_nome, largura: 34 },
    { titulo: 'Grupo', valor: (r) => r.grupo_nome },
    { titulo: 'Subgrupo', valor: (r) => r.subgrupo_nome },
    { titulo: 'Pacotes', valor: (r) => Number(r.quantidade), num: true },
    { titulo: 'Valor unitário', valor: (r) => (r.valor_unitario === null ? null : Number(r.valor_unitario)), num: true },
    { titulo: 'Valor total', valor: (r) => (r.valor_total === null ? null : Number(r.valor_total)), num: true },
    { titulo: 'Vendedor', valor: (r) => r.funcionario_nome, largura: 24 },
    { titulo: 'Colaborador', valor: (r) => r.colaborador_nome, largura: 24 },
    { titulo: 'Situação', valor: (r) => (r.removido_em ? 'Saiu do ERP' : 'Em aberto') },
    { titulo: 'Atualizado em', valor: (r) => dataHora(r.atualizado_em || r.criado_em) },
  ];

  // aviso compacto da integração: atrasada (> 70 min) ou com erro
  const minutos = ultimo ? Math.round((Date.now() - new Date(ultimo.criado_em).getTime()) / 60000) : null;
  const statusInteg = !ultimo ? html`<${Etiqueta} cor="laranja">Nenhum envio do ERP ainda</${Etiqueta}>`
    : ultimo.erro ? html`<${Etiqueta} cor="vermelho" titulo=${ultimo.erro}>ERP com problema no último envio (${dataHora(ultimo.criado_em)})</${Etiqueta}>`
    : minutos > 70 ? html`<${Etiqueta} cor="laranja">ERP sem enviar há ${minutos >= 120 ? Math.floor(minutos / 60) + ' h' : minutos + ' min'}</${Etiqueta}>`
    : html`<${Etiqueta} cor="verde">ERP atualizado ${dataHora(ultimo.criado_em)}</${Etiqueta}>`;

  return html`
    <${Cabecalho} titulo="Pedidos em aberto" sub="Pedidos de venda que vêm do ERP a cada 30 minutos (só leitura). Quando o pedido é faturado ou cancelado no ERP, ele sai daqui." />
    <${Filtros} fixo=${html`<${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Pedido, cliente ou produto…" />`} ativos=${ativos} resumo=${`Venda: ${periodo}`}
      acoes=${regs && html`${statusInteg}
        <span class="nota">${pl(tot.pedidos, 'pedido', 'pedidos')} · ${pl(lista.length, 'item', 'itens')}</span>
        <${Exportar} tabela="pedidos-erp.itens" titulo="Pedidos em aberto (ERP)" filtros=${`Data da venda: ${periodo}`} arquivo=${`pedidos-erp-${de}-a-${ate}`}
          linhas=${lista} colunas=${colExp} paisagem />`}>
      <label class="campo-inline">Venda de <input class="entrada" type="date" value=${de} onChange=${(e) => e.target.value && setDe(e.target.value)} /></label>
      <label class="campo-inline">até <input class="entrada" type="date" value=${ate} onChange=${(e) => e.target.value && setAte(e.target.value)} /></label>
      <${MultiEscolha} todos="Todas as situações" rotulo="Situação" valor=${situacao} aoMudar=${setSituacao} opcoes=${SITUACOES} />
      <${MultiEscolha} todos="Todos os produtos" rotulo="Produto" valor=${produtos} aoMudar=${setProdutos} opcoes=${opcoesDe(todos, produto)} />
      <${MultiEscolha} todos="Todos os grupos" rotulo="Grupo" valor=${grupos} aoMudar=${setGrupos} opcoes=${opcoesDe(todos, (r) => r.grupo_nome)} />
      <${MultiEscolha} todos="Todos os vendedores" rotulo="Vendedor" valor=${vendedores} aoMudar=${setVendedores} opcoes=${opcoesDe(todos, (r) => r.funcionario_nome)} />
      <${MultiEscolha} todos="Todas as cidades" rotulo="Cidade" valor=${cidades} aoMudar=${setCidades} opcoes=${opcoesDe(todos, (r) => r.cidade)} />
    </${Filtros}>
    ${regs === null ? html`<${Carregando} />` : html`<${Tabela} id="pedidos-erp.itens" linhas=${lista} max=${500} ordemInicial=${{ chave: 'data_venda', dir: -1 }}
      vazio=${todos.length ? 'Nenhum pedido com esses filtros.' : 'Nenhum pedido do ERP neste período.'}
      totais=${{ rotulo: `Total (${pl(tot.pedidos, 'pedido', 'pedidos')})`, quantidade: pacotes(tot.pacotes), valor_total: tot.semValor && !tot.valor ? '–' : moeda(tot.valor) }}
      colunas=${[
        { chave: 'data_venda', titulo: 'Data da venda', render: (r) => data(r.data_venda) },
        { chave: 'numero', titulo: 'Pedido', valor: (r) => Number(r.numero) || r.numero, render: (r) => html`<b>${r.numero}</b>` },
        { chave: 'romaneio', titulo: 'Romaneio', render: (r) => r.romaneio || '–' },
        { chave: 'cliente', titulo: 'Cliente', valor: cliente, render: (r) => html`<span title=${`${r.cliente_codigo || ''} · ${r.cliente_nome || ''}`}>${cliente(r)}</span>` },
        { chave: 'rede_nome', titulo: 'Rede', render: (r) => r.rede_nome || '–' },
        { chave: 'cidade', titulo: 'Cidade', render: (r) => (r.cidade ? `${r.cidade}${r.uf ? ' / ' + r.uf : ''}` : '–') },
        { chave: 'produto', titulo: 'Produto', valor: produto, render: (r) => html`<small class="mudo">${r.produto_codigo}</small> ${r.produto_nome}` },
        { chave: 'grupo_nome', titulo: 'Grupo', render: (r) => r.grupo_nome || '–' },
        { chave: 'subgrupo_nome', titulo: 'Subgrupo', render: (r) => r.subgrupo_nome || '–' },
        { chave: 'quantidade', titulo: 'Pacotes', num: true, valor: (r) => Number(r.quantidade), render: (r) => pacotes(r.quantidade) },
        { chave: 'valor_unitario', titulo: 'Valor unitário', num: true, valor: (r) => Number(r.valor_unitario ?? -1), render: (r) => (r.valor_unitario === null ? '–' : moeda(r.valor_unitario)) },
        { chave: 'valor_total', titulo: 'Valor total', num: true, valor: (r) => Number(r.valor_total ?? -1), render: (r) => (r.valor_total === null ? '–' : moeda(r.valor_total)) },
        { chave: 'funcionario_nome', titulo: 'Vendedor', render: (r) => r.funcionario_nome || '–' },
        { chave: 'colaborador_nome', titulo: 'Colaborador', render: (r) => r.colaborador_nome || '–' },
        { chave: 'situacao', titulo: 'Situação', valor: (r) => (r.removido_em ? 1 : 0),
          render: (r) => (r.removido_em ? html`<${Etiqueta} cor="cinza" titulo=${`Saiu do ERP em ${dataHora(r.removido_em)}`}>Saiu do ERP</${Etiqueta}>` : html`<${Etiqueta} cor="verde">Em aberto</${Etiqueta}>`) },
      ]} />`}`;
}
