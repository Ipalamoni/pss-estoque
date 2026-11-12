// Tela inicial: atalhos por perfil, indicadores e alertas
import { html, useApp, Cartao, Tabela, Etiqueta, Cabecalho } from '../ui.js';
import { STATUS_ESTOQUE } from '../calc.js';
import { moeda, num, qtdDupla, numeroPedido, data, hojeISO, diasEntre, somarDias, pl, qu } from '../util.js';
import { resumoPedido } from './pedidos.js';
import { Icone } from '../icones.js';

export function TelaInicio() {
  const { usuario, dados, ir, podeFazer, papeis } = useApp();
  const { ind, pedidos, pedidoItens, mapa } = dados;
  const hoje = hojeISO();
  const h = new Date().getHours();
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  const ativos = ind.filter((p) => p.ativo);
  const conta = (s) => ativos.filter((p) => p.status === s).length;
  const valorEstoque = ativos.reduce((s, p) => s + Math.max(p.valor, 0), 0);
  const abertos = pedidos.filter((p) => p.status === 'aberto' || p.status === 'parcial');
  const atrasados = abertos.filter((p) => p.previsao_entrega && p.previsao_entrega < hoje);
  const proximos = abertos.filter((p) => p.previsao_entrega && p.previsao_entrega >= hoje && p.previsao_entrega <= somarDias(hoje, 7));
  const divPend = (dados.recebimentos || []).filter((r) => r.divergencia && !r.ciente_por);
  const valorPedido = (id) => pedidoItens.filter((i) => i.pedido_id === id).reduce((s, i) => s + Number(i.valor_total), 0);

  const verProg = papeis.some((x) => ['admin', 'engenharia', 'pesagem', 'diretoria'].includes(x));
  const atalhos = [
    podeFazer('programacao') ? { t: 'Programar produção', i: 'programacao', f: () => ir('programacao') }
      : verProg && podeFazer('saida_receita') && { t: 'Programação de hoje', i: 'programacao', f: () => ir('programacao') },
    podeFazer('recebimento') && { t: 'Receber mercadoria', i: 'receber', f: () => ir('receber') },
    podeFazer('saida_receita') && { t: 'Saída por receita', i: 'saidas', f: () => ir('saidas', { aba: 'receita' }) },
    podeFazer('saida_avulsa') && { t: 'Saída avulsa', i: 'saidas', f: () => ir('saidas', { aba: 'avulsa' }) },
    podeFazer('saida_almox') && { t: 'Saída almoxarifado', i: 'saidas', f: () => ir('saidas', { aba: 'almox' }) },
    podeFazer('inventario') && { t: 'Inventário', i: 'inventario', f: () => ir('inventario') },
    podeFazer('pedido') && { t: 'Novo pedido de compra', i: 'pedidos', f: () => ir('pedidos', { novo: true }) },
    papeis.some((x) => ['engenharia', 'pesagem'].includes(x)) && { t: 'Saídas da produção', i: 'saidas-producao', f: () => ir('saidas-producao') },
    { t: 'Posição de estoque', i: 'estoque', f: () => ir('estoque') },
  ].filter(Boolean);
  const progHoje = (dados.programacoes || []).filter((p) => p.situacao === 'ativa' && p.data === hoje);

  const atencao = ativos.filter((p) => ['zerado', 'critico', 'comprar'].includes(p.status))
    .sort((a, b) => a.status_ordem - b.status_ordem || (a.cobertura ?? 0) - (b.cobertura ?? 0));
  const entregas = [...abertos].sort((a, b) => String(a.previsao_entrega).localeCompare(String(b.previsao_entrega)));
  const verPedidos = papeis.some((x) => ['admin', 'comprador', 'almoxarifado', 'recebimento', 'diretoria'].includes(x));

  return html`
    <${Cabecalho} titulo=${`${saudacao}, ${usuario.nome.split(' ')[0]}!`} sub="O que você precisa fazer agora?" />
    <div class="atalhos">
      ${atalhos.map((a) => html`<button class="atalho" onClick=${a.f}><${Icone} nome=${a.i} tam=${26} /><span>${a.t}</span></button>`)}
    </div>

    <div class="cartoes">
      <${Cartao} titulo="Valor em estoque" valor=${moeda(valorEstoque)} sub=${pl(ativos.length, 'item ativo', 'itens ativos')} aoClicar=${() => ir('estoque')} />
      <${Cartao} titulo="Zerados" valor=${conta('zerado')} cor=${conta('zerado') ? 'c-vermelho' : ''} aoClicar=${() => ir('estoque', { status: 'zerado' })} />
      <${Cartao} titulo="Críticos" valor=${conta('critico')} cor=${conta('critico') ? 'c-vermelho' : ''} sub="abaixo da segurança" aoClicar=${() => ir('estoque', { status: 'critico' })} />
      <${Cartao} titulo="Para comprar" valor=${conta('comprar')} cor=${conta('comprar') ? 'c-laranja' : ''} sub="no ponto de pedido" aoClicar=${() => ir('estoque', { status: 'comprar' })} />
      ${verProg && html`<${Cartao} titulo="Programado para hoje" valor=${qu(progHoje.reduce((t, p) => t + Number(p.quantidade), 0), 'receita')}
        sub=${pl(new Set(progHoje.map((p) => p.ficha_id)).size, 'tipo de pão', 'tipos de pão')} aoClicar=${() => ir('programacao')} />`}
      ${verPedidos && html`<${Cartao} titulo="Pedidos atrasados" valor=${atrasados.length} cor=${atrasados.length ? 'c-vermelho' : ''} aoClicar=${() => ir('pedidos', { filtro: 'atrasados' })} />`}
      ${verPedidos && html`<${Cartao} titulo="Chegam em 7 dias" valor=${proximos.length} aoClicar=${() => ir('pedidos', { filtro: 'pendentes' })} />`}
      ${verPedidos && html`<${Cartao} titulo="Recebidos com divergência ou sem pedido" valor=${divPend.length} cor=${divPend.length ? 'c-laranja' : ''}
        sub=${divPend.length ? 'aguardando ciência do comprador' : 'nenhuma pendente'} aoClicar=${() => ir('pedidos', { pendencias: true })} />`}
    </div>

    <div class="duas-colunas">
      <section class="painel">
        <h2>Itens que pedem atenção</h2>
        <${Tabela} linhas=${atencao} max=${12} vazio="Tudo certo: nenhum item zerado, crítico ou no ponto de compra."
          aoClicar=${() => ir('estoque')}
          colunas=${[
            { chave: 'descricao', titulo: 'Produto', render: (p) => html`<b>${p.descricao}</b><br /><small>${p.codigo}</small>` },
            { chave: 'saldo', titulo: 'Saldo', num: true, render: (p) => qtdDupla(p, p.saldo) },
            { chave: 'cobertura', titulo: 'Cobertura', num: true, render: (p) => (p.cobertura === null ? '–' : `${num(p.cobertura, 1)} ${p.cobertura >= 1 && p.cobertura < 2 ? 'dia' : 'dias'}`) },
            { chave: 'status_ordem', titulo: 'Situação', render: (p) => html`<${Etiqueta} cor=${STATUS_ESTOQUE[p.status].cor}>${STATUS_ESTOQUE[p.status].rotulo}</${Etiqueta}>` },
          ]} />
      </section>
      ${verPedidos && html`<section class="painel">
        <h2>Entregas pendentes</h2>
        <${Tabela} linhas=${entregas} max=${12} vazio="Nenhum pedido aguardando entrega."
          aoClicar=${(p) => ir('pedidos', { abrir: p.id })}
          colunas=${[
            { chave: 'id', titulo: 'Pedido', render: (p) => html`<b>${numeroPedido(p.id)}</b><br /><small>${mapa.fornecedor.get(p.fornecedor_id)?.nome}</small>` },
            { chave: 'previsao_entrega', titulo: 'Previsão', render: (p) => data(p.previsao_entrega) },
            { chave: 'dias', titulo: 'Faltam', num: true, valor: (p) => (p.previsao_entrega ? diasEntre(hoje, p.previsao_entrega) : 999),
              render: (p) => { if (!p.previsao_entrega) return '–'; const d = diasEntre(hoje, p.previsao_entrega);
                return d < 0 ? html`<${Etiqueta} cor="vermelho">${pl(-d, 'dia', 'dias')} de atraso</${Etiqueta}>` : d === 0 ? html`<${Etiqueta} cor="laranja">hoje</${Etiqueta}>` : pl(d, 'dia', 'dias'); } },
            { chave: 'valor', titulo: 'Valor', num: true, valor: (p) => valorPedido(p.id), render: (p) => moeda(valorPedido(p.id)) },
          ]} />
      </section>`}
    </div>`;
}
