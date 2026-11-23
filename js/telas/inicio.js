// Tela inicial: atalhos por perfil, indicadores e alertas
import { html, useState, useApp, Cartao, Tabela, Etiqueta, Cabecalho } from '../ui.js';
import { STATUS_ESTOQUE } from '../calc.js';
import { moeda, num, qtdDupla, numeroPedido, data, hojeISO, diasEntre, somarDias, pl, qu, acessoAmplo, pode, operaLocal, ehGestao } from '../util.js';
import { linhasFinanceiro } from './financeiro.js';
import { ResumoPrevisao } from './previsao.js';
import { resumoPedido } from './pedidos.js';
import { Icone } from '../icones.js';
import { AvisoFinalizar } from './producao.js';

export function TelaInicio() {
  const { papeis } = useApp();
  return acessoAmplo(papeis) ? html`<${InicioOperacao} />` : html`<${InicioRestrito} />`;
}

// Financeiro e faturamento: só pedidos a pagar e previsão de produção
function InicioRestrito() {
  const { usuario, dados, ir, podeFazer, papeis } = useApp();
  const h = new Date().getHours();
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const hoje = hojeISO();
  const fin = papeis.includes('financeiro');
  const l = fin ? linhasFinanceiro(dados) : [];
  const soma = (x) => moeda(x.reduce((s, p) => s + p.r.valor, 0));
  const grupo = {
    hoje: l.filter((p) => p.criadoDia === hoje),
    pendentes: l.filter((p) => !p.fin_lancado && p.status !== 'cancelado'),
    vence_hoje: l.filter((p) => p.diasPgto === 0 && p.status !== 'cancelado'),
    vence_7: l.filter((p) => p.diasPgto !== null && p.diasPgto >= 0 && p.diasPgto <= 7 && p.status !== 'cancelado'),
    alerta: l.filter((p) => p.alertaEntrega),
  };
  return html`
    <${Cabecalho} titulo=${`${saudacao}, ${usuario.nome.split(' ')[0]}!`} sub=${fin ? 'Pedidos a pagar e previsão de produção' : 'Previsão de produção'} />
    <div class="atalhos">
      ${fin && html`<button class="atalho" onClick=${() => ir('financeiro')}><${Icone} nome="financeiro" tam=${26} /><span>Pedidos a pagar</span></button>`}
      ${pode(papeis, 'previsao_producao') && html`<button class="atalho" onClick=${() => ir('previsao')}><${Icone} nome="previsao" tam=${26} /><span>Programado × produzido</span></button>`}
    </div>
    ${fin && html`<div class="cartoes">
      <${Cartao} titulo="Pedidos feitos hoje" valor=${grupo.hoje.length} sub=${soma(grupo.hoje)} aoClicar=${() => ir('financeiro', { rapido: 'hoje' })} />
      <${Cartao} titulo="Pendentes de lançar" valor=${grupo.pendentes.length} sub=${soma(grupo.pendentes)} cor=${grupo.pendentes.length ? 'c-laranja' : ''} aoClicar=${() => ir('financeiro', { rapido: 'pendentes' })} />
      <${Cartao} titulo="Vencem hoje" valor=${grupo.vence_hoje.length} sub=${soma(grupo.vence_hoje)} cor=${grupo.vence_hoje.length ? 'c-laranja' : ''} aoClicar=${() => ir('financeiro', { rapido: 'vence_hoje' })} />
      <${Cartao} titulo="Vencem em 7 dias" valor=${grupo.vence_7.length} sub=${soma(grupo.vence_7)} aoClicar=${() => ir('financeiro', { rapido: 'vence_7' })} />
      ${grupo.alerta.length > 0 && html`<${Cartao} titulo="Vencendo sem a mercadoria" valor=${grupo.alerta.length} sub="fale com o comprador" cor="c-vermelho" aoClicar=${() => ir('financeiro', { rapido: 'alerta' })} />`}
    </div>`}
    ${pode(papeis, 'previsao_producao') && html`<div class="duas-colunas">
      <${ResumoPrevisao} dia=${hoje} aoAbrir=${() => ir('previsao')} />
      <${ResumoPrevisao} dia=${somarDias(hoje, 1)} aoAbrir=${() => ir('previsao')} />
    </div>`}`;
}

function InicioOperacao() {
  const { usuario, dados, ir, podeFazer, papeis } = useApp();
  const [todosAtalhos, setTodosAtalhos] = useState(false);
  const { ind, pedidos, pedidoItens, mapa } = dados;
  const hoje = hojeISO();
  const h = new Date().getHours();
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  const ativos = ind.filter((p) => p.ativo && p.controla_estoque !== false && !['intermediario', 'produto_acabado'].includes(p.categoria));
  const conta = (s) => ativos.filter((p) => p.status === s).length;
  const valorEstoque = ativos.reduce((s, p) => s + Math.max(p.valor, 0), 0);
  const abertos = pedidos.filter((p) => p.status === 'aberto' || p.status === 'parcial');
  const atrasados = abertos.filter((p) => p.previsao_entrega && p.previsao_entrega < hoje);
  const proximos = abertos.filter((p) => p.previsao_entrega && p.previsao_entrega >= hoje && p.previsao_entrega <= somarDias(hoje, 7));
  const divPend = (dados.recebimentos || []).filter((r) => r.divergencia && !r.ciente_por);
  const valorPedido = (id) => (mapa.itensPedido.get(id) || []).reduce((s, i) => s + Number(i.valor_total), 0);

  const verProg = papeis.some((x) => ['admin', 'engenharia', 'pesagem', 'diretoria'].includes(x));
  const meus = new Set(dados.locais.filter((l) => operaLocal(papeis, l)).map((l) => l.id));
  const admin = papeis.includes('admin');
  const nReq = dados.requisicoes.filter((r) => admin || meus.has(r.origem_id)).length;
  const nChegando = dados.transferencias.filter((t) => t.situacao === 'enviada' && (admin || meus.has(t.destino_id))).length;
  const nSeparadas = dados.transferencias.filter((t) => t.situacao === 'separada' && (admin || meus.has(t.origem_id))).length;
  const gestao = papeis.some((x) => ['admin', 'diretoria', 'engenharia'].includes(x));
  const atalhos = [
    gestao && { t: 'Painel de Produção', i: 'painel-producao', f: () => ir('painel-producao'), destaque: true },
    papeis.some((x) => ['admin', 'padeiro', 'engenharia'].includes(x)) && { t: 'Produção Masseiras', i: 'maceiras', f: () => ir('maceiras') },
    podeFazer('finalizar_batelada') && { t: 'Finalizar bateladas', i: 'finalizar', f: () => ir('finalizar') },
    nReq > 0 && { t: 'Requisições para atender', i: 'requisicoes', f: () => ir('requisicoes'), n: nReq },
    nChegando > 0 && { t: 'Receber transferências', i: 'transferencias', f: () => ir('transferencias'), n: nChegando },
    nSeparadas > 0 && { t: 'Separadas para enviar', i: 'caminhao', f: () => ir('transferencias'), n: nSeparadas },
    podeFazer('requisicao') && { t: 'Pedir material (requisição)', i: 'requisicoes', f: () => ir('requisicoes') },
    papeis.some((x) => ['admin', 'diretoria', 'comprador', 'almoxarifado', 'engenharia'].includes(x)) && { t: 'Painel de Estoque e Compras', i: 'painel', f: () => ir('painel') },
    podeFazer('custos') && { t: 'Central de Custos', i: 'custos', f: () => ir('custos') },
    podeFazer('contagem_inicial') && !dados.produtos.some((p) => Number(p.saldo) !== 0) && { t: 'Contagem inicial (saldo)', i: 'contagem', f: () => ir('contagem') },
    podeFazer('previsao_producao') && !gestao && { t: 'Programado × produzido', i: 'previsao', f: () => ir('previsao') },
    papeis.some((x) => ['admin', 'diretoria'].includes(x)) && { t: 'Pedidos a pagar', i: 'financeiro', f: () => ir('financeiro') },
    (podeFazer('programacao') || (verProg && podeFazer('saida_receita'))) && { t: 'Programação e pesagem', i: 'programacao', f: () => ir('programacao') },
    podeFazer('recebimento') && { t: 'Receber mercadoria', i: 'receber', f: () => ir('receber') },
    podeFazer('saida_avulsa') && { t: 'Saída avulsa', i: 'saidas', f: () => ir('saidas', { aba: 'avulsa' }) },
    podeFazer('saida_almox') && { t: 'Saída almoxarifado', i: 'saidas', f: () => ir('saidas', { aba: 'almox' }) },
    podeFazer('inventario') && { t: 'Inventário', i: 'inventario', f: () => ir('inventario') },
    podeFazer('pedido') && { t: 'Novo pedido de compra', i: 'pedidos', f: () => ir('pedidos', { novo: true }) },
    papeis.some((x) => ['engenharia', 'pesagem'].includes(x)) && { t: 'Saídas da produção', i: 'saidas-producao', f: () => ir('saidas-producao') },
    { t: 'Estoque por local', i: 'estoque-local', f: () => ir('estoque-local') },
    { t: 'Posição de estoque', i: 'estoque', f: () => ir('estoque') },
  ].filter(Boolean);
  const verPed = papeis.some((x) => ['admin', 'comprador', 'almoxarifado', 'recebimento', 'diretoria'].includes(x));
  const agora = [
    ...atalhos.filter((a) => a.n > 0),
    verPed && atrasados.length > 0 && { t: 'Pedidos de compra atrasados', i: 'pedidos', n: atrasados.length, f: () => ir('pedidos', { filtro: 'atrasados' }) },
    podeFazer('pedido') && conta('zerado') + conta('critico') > 0 && { id: 'alerta', t: 'Itens zerados ou críticos', i: 'estoque', n: conta('zerado') + conta('critico'), f: () => ir('estoque', { status: 'alerta' }) },
  ].filter(Boolean);
  // o que já está em "Para fazer agora" não se repete nos cartões
  const naLista = (id) => agora.some((a) => a.id === id);
  const atrasadosNaLista = verPed && atrasados.length > 0;
  const outrosAtalhos = atalhos.filter((a) => !a.n);
  const LIMITE_ATALHOS = 6;
  const atalhosVisiveis = todosAtalhos ? outrosAtalhos : outrosAtalhos.slice(0, LIMITE_ATALHOS);
  const hora = (dados.carregadoEm || new Date()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const progHoje = (dados.programacoes || []).filter((p) => p.situacao === 'ativa' && p.data === hoje);
  const pendFinal = (dados.programacoes || []).filter((p) => p.situacao === 'ativa' && !p.finalizada_em && p.data < hoje);

  const atencao = ativos.filter((p) => ['zerado', 'critico', 'comprar'].includes(p.status))
    .sort((a, b) => a.status_ordem - b.status_ordem || (a.cobertura ?? 0) - (b.cobertura ?? 0));
  const entregas = [...abertos].sort((a, b) => String(a.previsao_entrega).localeCompare(String(b.previsao_entrega)));
  const verPedidos = papeis.some((x) => ['admin', 'comprador', 'almoxarifado', 'recebimento', 'diretoria'].includes(x));

  return html`
    <${Cabecalho} titulo=${`${saudacao}, ${usuario.nome.split(' ')[0]}!`} sub=${`O que você precisa fazer agora? · atualizado às ${hora}`} />
    ${podeFazer('programacao') && pendFinal.length > 0 && html`<${AvisoFinalizar} progs=${pendFinal} aoAbrir=${() => ir('programacao')} />`}
    ${agora.length > 0 && html`<section class="agora" aria-label="Para fazer agora">
      <h2 class="titulo-bloco">Para fazer agora</h2>
      <div class="agora-lista">${agora.map((a) => html`<button class="tarefa" onClick=${a.f}>
        <span class="tarefa-num">${a.n}</span><span class="tarefa-txt">${a.t}</span><${Icone} nome=${a.i} tam=${20} /></button>`)}</div>
    </section>`}

    <div class="cartoes">
      <${Cartao} titulo="Valor em estoque" valor=${moeda(valorEstoque)} sub=${pl(ativos.length, 'item ativo', 'itens ativos')} aoClicar=${() => ir('estoque')} />
      ${!naLista('alerta') && html`<${Cartao} titulo="Zerados ou críticos" valor=${conta('zerado') + conta('critico')} cor=${conta('zerado') + conta('critico') ? 'c-vermelho' : ''}
        sub=${conta('zerado') + conta('critico') ? `${conta('zerado')} zerados · ${conta('critico')} abaixo da segurança` : 'nenhum item em falta'} aoClicar=${() => ir('estoque', { status: 'alerta' })} />`}
      <${Cartao} titulo="Para comprar" valor=${conta('comprar')} cor=${conta('comprar') ? 'c-laranja' : ''} sub="no ponto de pedido" aoClicar=${() => ir('estoque', { status: 'comprar' })} />
      ${verProg && html`<${Cartao} titulo="Programado para hoje" valor=${qu(progHoje.reduce((t, p) => t + Number(p.quantidade), 0), 'receita')}
        sub=${pl(new Set(progHoje.map((p) => p.ficha_id)).size, 'tipo de pão', 'tipos de pão')} aoClicar=${() => ir('programacao')} />`}
      ${verPedidos && !atrasadosNaLista && html`<${Cartao} titulo="Pedidos atrasados" valor=${atrasados.length} sub="nenhum atraso" aoClicar=${() => ir('pedidos', { filtro: 'atrasados' })} />`}
      ${verPedidos && html`<${Cartao} titulo="Chegam em 7 dias" valor=${proximos.length} sub="pedidos com entrega prevista" aoClicar=${() => ir('pedidos', { filtro: 'semana' })} />`}
      ${verPedidos && html`<${Cartao} titulo="Recebimentos a conferir" valor=${divPend.length} cor=${divPend.length ? 'c-laranja' : ''}
        sub=${divPend.length ? 'com divergência ou sem pedido' : 'nenhum pendente'} aoClicar=${() => ir('pedidos', { pendencias: true })} />`}
    </div>

    <h2 class="titulo-bloco">Atalhos</h2>
    <div class="atalhos" id="inicio-atalhos">
      ${atalhosVisiveis.map((a) => html`<button class=${'atalho' + (a.destaque ? ' atalho-destaque' : '')} onClick=${a.f}><${Icone} nome=${a.i} tam=${22} /><span>${a.t}</span></button>`)}
    </div>
    ${outrosAtalhos.length > LIMITE_ATALHOS && html`<div class="mais-atalhos"><button type="button" class="btn-link" aria-expanded=${todosAtalhos} aria-controls="inicio-atalhos"
      onClick=${() => setTodosAtalhos(!todosAtalhos)}>${todosAtalhos ? 'Mostrar menos atalhos' : `Mais atalhos (${outrosAtalhos.length - LIMITE_ATALHOS})`}</button></div>`}

    ${podeFazer('previsao_producao') && html`<${ResumoPrevisao} dia=${hoje} aoAbrir=${() => ir('previsao')} />`}
    <div class="duas-colunas">
      <section class="painel">
        <h2>Itens que pedem atenção</h2>
        <${Tabela} linhas=${atencao} max=${12} vazio="Tudo certo: nenhum item zerado, crítico ou no ponto de compra."
          aoClicar=${(p) => ir('estoque', { status: p.status })} aoVerTodos=${() => ir('estoque', { status: 'alerta' })}
          colunas=${[
            { chave: 'descricao', titulo: 'Produto', render: (p) => html`<b>${p.descricao}</b><br /><small>${p.codigo}</small>` },
            { chave: 'saldo', titulo: 'Saldo', num: true, render: (p) => qtdDupla(p, p.saldo) },
            { chave: 'cobertura', titulo: 'Cobertura', num: true, render: (p) => (p.cobertura === null ? '–' : `${num(p.cobertura, 1)} ${p.cobertura < 2 ? 'dia' : 'dias'}`) },
            { chave: 'status_ordem', titulo: 'Situação', render: (p) => html`<${Etiqueta} cor=${STATUS_ESTOQUE[p.status].cor}>${STATUS_ESTOQUE[p.status].rotulo}</${Etiqueta}>` },
          ]} />
      </section>
      ${verPedidos && html`<section class="painel">
        <h2>Entregas pendentes</h2>
        <${Tabela} linhas=${entregas} max=${12} vazio="Nenhum pedido aguardando entrega."
          aoClicar=${(p) => ir('pedidos', { abrir: p.id })} aoVerTodos=${() => ir('pedidos', { filtro: 'pendentes' })}
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
