// Posição de estoque: saldo, valor, consumo médio, cobertura, mínimos, sugestão de compra
import { html, useState, useMemo, useEffect, useApp, Modal, Busca, Etiqueta, Cabecalho, Tabela, avisar, Filtros } from '../ui.js';
import { STATUS_ESTOQUE } from '../calc.js';
import { CATEGORIAS, qtd, num, moeda, contem, qtdDupla, dataHora, hojeISO, mensagemErro, qu, plural, pl } from '../util.js';
import { pdfTabela } from '../export.js';
import { Exportar } from '../exportar.js';
import { Icone } from '../icones.js';

const v = (x, c = 2) => (x === null || x === undefined ? '–' : num(x, c));

export function TelaEstoque() {
  const { dados, estadoRota, setEstadoRota, ir } = useApp();
  const [cats, setCats] = useState(new Set(Object.keys(CATEGORIAS)));
  const [status, setStatus] = useState(estadoRota?.status || '');
  const [busca, setBusca] = useState('');
  const [completo, setCompleto] = useState(window.innerWidth > 760);
  const [aberto, setAberto] = useState(null);
  const [grupo, setGrupo] = useState('');
  const [classif, setClassif] = useState('');
  const [agrupar, setAgrupar] = useState(false);
  useEffect(() => { if (estadoRota) setEstadoRota(null); }, []);
  const distintos = (l, c) => [...new Set(l.map((x) => x[c]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const grupos = distintos(dados.produtos, 'grupo');
  const classifs = distintos(dados.produtos.filter((p) => !grupo || p.grupo === grupo), 'classificacao');
  const alternar = (k) => setCats((s) => { const x = new Set(s); x.has(k) ? x.delete(k) : x.add(k); return x; });

  const linhas = useMemo(() => dados.ind.filter((p) => p.ativo && cats.has(p.categoria) && (!status || p.status === status)
    && (!grupo || p.grupo === grupo) && (!classif || p.classificacao === classif)
    && contem(`${p.codigo} ${p.descricao} ${p.marca || ''}`, busca)), [dados, cats, status, busca, grupo, classif]);
  // visão somada por grupo + classificação (ex.: toda a farinha tipo A, de todas as marcas)
  const grupos2 = useMemo(() => {
    const m = new Map();
    for (const p of linhas) {
      const k = `${p.grupo || '(sem grupo)'}|${p.classificacao || ''}|${p.unidade_estoque}`;
      const g = m.get(k) || { k, grupo: p.grupo || '(sem grupo)', classificacao: p.classificacao || '', unidade: p.unidade_estoque, itens: [], saldo: 0, valor: 0, media: 0, receber: 0, pior: 9 };
      g.itens.push(p); g.saldo += p.saldo; g.valor += p.valor; g.media += p.media_dia; g.receber += p.a_receber; g.pior = Math.min(g.pior, p.status_ordem);
      m.set(k, g);
    }
    return [...m.values()].map((g) => ({ ...g, cobertura: g.media > 0 ? g.saldo / g.media : null,
      statusPior: Object.entries(STATUS_ESTOQUE).find(([, v]) => v.ordem === g.pior)?.[0] || 'ok' }));
  }, [linhas]);
  const valorTotal = linhas.reduce((s, p) => s + p.valor, 0);
  const params = dados.params;

  const colunas = [
    { chave: 'codigo', titulo: 'Código', render: (p) => html`<b>${p.codigo}</b>`, exp: (p) => p.codigo },
    { chave: 'descricao', titulo: 'Descrição', classe: 'col-desc', exp: (p) => p.descricao, largura: 34 },
    completo && { chave: 'grupo', titulo: 'Grupo', render: (p) => p.grupo || '–', exp: (p) => p.grupo },
    { chave: 'classificacao', titulo: 'Classif.', render: (p) => (p.classificacao ? html`<${Etiqueta} cor="azul">${p.classificacao}</${Etiqueta}>` : '–'), exp: (p) => p.classificacao },
    completo && { chave: 'categoria', titulo: 'Categoria', render: (p) => CATEGORIAS[p.categoria], exp: (p) => CATEGORIAS[p.categoria] },
    { chave: 'saldo', titulo: 'Saldo (unid. padrão)', num: true, render: (p) => html`${qtd(p.saldo)} <small>${plural(p.unidade_estoque, p.saldo)}</small>`, exp: (p) => p.saldo, txt: (p) => `${qu(p.saldo, p.unidade_estoque)}` },
    { chave: 'saldo_compra', titulo: 'Saldo (embalagem do fornecedor)', num: true, render: (p) => (p.unidade_compra ? html`${num(p.saldo_compra, 2)} <small>${plural(p.unidade_compra, p.saldo_compra)}</small>
        <br /><small class="mudo">1 ${p.unidade_compra} = ${qu(Number(p.fator_compra), p.unidade_estoque)}</small>` : '–'),
      exp: (p) => (p.unidade_compra ? Math.round(p.saldo_compra * 100) / 100 : ''), txt: (p) => (p.unidade_compra ? `${qu(p.saldo_compra, p.unidade_compra, 2)} (1 = ${qu(Number(p.fator_compra), p.unidade_estoque)})` : '') },
    completo && { chave: 'custo_medio', titulo: 'Custo médio', num: true, render: (p) => moeda(p.custo_medio), exp: (p) => p.custo_medio, txt: (p) => moeda(p.custo_medio) },
    { chave: 'valor', titulo: 'Valor total', num: true, render: (p) => moeda(p.valor), exp: (p) => Math.round(p.valor * 100) / 100, txt: (p) => moeda(p.valor) },
    completo && { chave: 'media_dia', titulo: 'Consumo/dia', num: true, render: (p) => v(p.media_dia), exp: (p) => p.media_dia, txt: (p) => v(p.media_dia) },
    completo && { chave: 'media_semana', titulo: 'Consumo/semana', num: true, render: (p) => v(p.media_semana, 1), exp: (p) => p.media_semana, txt: (p) => v(p.media_semana, 1) },
    completo && { chave: 'media_mes', titulo: 'Consumo/mês', num: true, render: (p) => v(p.media_mes, 1), exp: (p) => p.media_mes, txt: (p) => v(p.media_mes, 1) },
    { chave: 'cobertura', titulo: 'Cobertura (dias)', num: true, valor: (p) => p.cobertura ?? 99999, render: (p) => (p.cobertura === null ? '–' : num(p.cobertura, 1)), exp: (p) => p.cobertura, txt: (p) => v(p.cobertura, 1) },
    completo && { chave: 'min_definido', titulo: 'Mín. definido', num: true, render: (p) => v(p.min_definido, 1), exp: (p) => p.min_definido, txt: (p) => v(p.min_definido, 1) },
    completo && { chave: 'min_calculado', titulo: 'Mín. calculado', num: true, render: (p) => (p.min_calculado === null ? html`<small title=${`Precisa de ${params.dias_minimos_calculo || 30} dias de uso`}>aguardando</small>` : v(p.min_calculado, 1)),
      exp: (p) => p.min_calculado, txt: (p) => v(p.min_calculado, 1) },
    completo && { chave: 'a_receber', titulo: 'A receber', num: true, render: (p) => (p.a_receber ? v(p.a_receber, 1) : '–'), exp: (p) => p.a_receber, txt: (p) => (p.a_receber ? v(p.a_receber, 1) : '') },
    { chave: 'sugestao_compra', titulo: 'Sugestão de compra', num: true, render: (p) => (p.sugestao_compra ? html`<b>${p.sugestao_compra}</b> <small>${plural(p.unidade_compra || p.unidade_estoque, p.sugestao_compra)}</small>` : '–'),
      exp: (p) => p.sugestao_compra, txt: (p) => (p.sugestao_compra ? qu(p.sugestao_compra, p.unidade_compra || p.unidade_estoque, 0) : '') },
    { chave: 'status_ordem', titulo: 'Situação', render: (p) => html`<${Etiqueta} cor=${STATUS_ESTOQUE[p.status].cor}>${STATUS_ESTOQUE[p.status].rotulo}</${Etiqueta}>`, exp: (p) => STATUS_ESTOQUE[p.status].rotulo },
  ].filter(Boolean);

  const colsExp = colunas.map((c) => ({ titulo: c.titulo, valor: c.exp, texto: c.txt || c.exp, num: c.num, largura: c.largura }));
  const abasExcel = () => [{ nome: 'Posição de estoque', linhas, colunas: [
    ['Código', (p) => p.codigo], ['Código ERP', (p) => p.codigo_erp], ['Descrição', (p) => p.descricao], ['Categoria', (p) => CATEGORIAS[p.categoria]], ['Grupo', (p) => p.grupo], ['Classificação', (p) => p.classificacao],
    ['Marca', (p) => p.marca], ['Unid. estoque', (p) => p.unidade_estoque],
    ['Saldo (unid. padrão)', (p) => p.saldo], ['Embalagem do fornecedor', (p) => p.unidade_compra], ['Conteúdo da embalagem', (p) => (p.unidade_compra ? Number(p.fator_compra) : '')],
    ['Saldo (embalagens)', (p) => (p.unidade_compra ? p.saldo_compra : '')], ['Custo médio', (p) => p.custo_medio],
    ['Valor total', (p) => Math.round(p.valor * 100) / 100], ['Consumo/dia', (p) => p.media_dia], ['Consumo/semana', (p) => p.media_semana], ['Consumo/mês', (p) => p.media_mes],
    ['Desvio padrão/dia', (p) => p.desvio_dia], ['Dias de histórico', (p) => p.dias_historico], ['Cobertura (dias)', (p) => p.cobertura], ['Prazo de entrega (dias)', (p) => p.prazo],
    ['Origem do prazo', (p) => p.fonte_prazo], ['Estoque de segurança', (p) => p.estoque_seguranca], ['Mín. definido', (p) => p.min_definido], ['Mín. calculado', (p) => p.min_calculado],
    ['A receber', (p) => p.a_receber], ['Sugestão (un. compra)', (p) => p.sugestao_compra], ['Situação', (p) => STATUS_ESTOQUE[p.status].rotulo],
  ].map(([titulo, valor]) => ({ titulo, valor: (p) => { const x = valor(p); return typeof x === 'number' ? Math.round(x * 1000) / 1000 : x; } })) }];
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const colsGrupo = [{ titulo: 'Grupo', valor: (g) => g.grupo }, { titulo: 'Classificação', valor: (g) => g.classificacao }, { titulo: 'Produtos / marcas', valor: (g) => g.itens.map((p) => p.marca || p.codigo).join(', '), largura: 34 },
    { titulo: 'Saldo total', valor: (g) => r3(g.saldo), texto: (g) => qu(g.saldo, g.unidade), num: true }, { titulo: 'Unid.', valor: (g) => g.unidade },
    { titulo: 'Valor', valor: (g) => Math.round(g.valor * 100) / 100, texto: (g) => moeda(g.valor), num: true }, { titulo: 'Consumo/dia', valor: (g) => r3(g.media), num: true },
    { titulo: 'Cobertura (dias)', valor: (g) => (g.cobertura === null ? '' : Math.round(g.cobertura * 10) / 10), num: true }, { titulo: 'A receber', valor: (g) => r3(g.receber), num: true },
    { titulo: 'Pior situação', valor: (g) => STATUS_ESTOQUE[g.statusPior].rotulo }];
  const pdfEstoque = (prm) => { const iValor = colsExp.findIndex((c) => c.titulo === 'Valor total');
    return pdfTabela({ titulo: 'Posição de estoque', filtros: `${pl(linhas.length, 'item', 'itens')} · ${dataHora(new Date())}`, colunas: colsExp, linhas, params: prm,
      totais: colsExp.map((c, i) => (i === iValor ? moeda(valorTotal) : i === 0 ? 'TOTAL' : '')) }); };

  return html`
    <${Cabecalho} titulo="Posição de estoque" sub=${`Atualizado em ${dataHora(dados.carregadoEm)} · consumo médio dos últimos ${params.janela_consumo_dias || 90} dias`}>
      ${agrupar ? html`<${Exportar} titulo="Estoque por grupo e classificação" filtros=${dataHora(new Date())} arquivo=${`estoque-por-classificacao-${hojeISO()}`}
          colunas=${colsGrupo} linhas=${grupos2} totais=${['TOTAL', '', '', '', '', moeda(valorTotal), '', '', '', '']} />`
        : html`<${Exportar} titulo="Posição de estoque" filtros=${`${pl(linhas.length, 'item', 'itens')} · ${dataHora(new Date())}`} arquivo=${`posicao-estoque-${hojeISO()}`}
          colunas=${colsExp} linhas=${linhas} abas=${abasExcel} pdf=${pdfEstoque} />`}
    </${Cabecalho}>
    <div class="filtros">
      ${Object.entries(CATEGORIAS).map(([k, t]) => html`<label class="check"><input type="checkbox" checked=${cats.has(k)} onChange=${() => alternar(k)} /> ${t}</label>`)}
    </div>
    <${Filtros} ativos=${[status, grupo, classif].filter(Boolean).length} fixo=${html`<${Busca} valor=${busca} aoMudar=${setBusca} placeholder="Buscar produto" />`}>
      <select class="entrada" value=${status} onChange=${(e) => setStatus(e.target.value)}>
        <option value="">Todas as situações</option>
        ${Object.entries(STATUS_ESTOQUE).map(([k, s]) => html`<option value=${k}>${s.rotulo}</option>`)}
      </select>
      <select class="entrada" value=${grupo} onChange=${(e) => { setGrupo(e.target.value); setClassif(''); }}>
        <option value="">Todos os grupos</option>${grupos.map((g) => html`<option>${g}</option>`)}</select>
      <select class="entrada" value=${classif} onChange=${(e) => setClassif(e.target.value)}>
        <option value="">Todas as classificações</option>${classifs.map((c) => html`<option value=${c}>Classificação ${c}</option>`)}</select>
    </${Filtros}>
    <div class="filtros">
      <div class="alternador">
        <button class=${'btn ' + (!agrupar ? 'btn-pri' : 'btn-sec')} onClick=${() => setAgrupar(false)}>Por produto (marca)</button>
        <button class=${'btn ' + (agrupar ? 'btn-pri' : 'btn-sec')} onClick=${() => setAgrupar(true)}>Somado por grupo e classificação</button>
      </div>
      ${!agrupar && html`<label class="check"><input type="checkbox" checked=${completo} onChange=${(e) => setCompleto(e.target.checked)} /> Todas as colunas</label>`}
    </div>
    ${agrupar ? html`<${Tabela} linhas=${grupos2} chave="k" ordemInicial=${{ chave: 'grupo', dir: 1 }}
        aoClicar=${(g) => { setGrupo(g.grupo === '(sem grupo)' ? '' : g.grupo); setClassif(g.classificacao); setAgrupar(false); }}
        colunas=${[
          { chave: 'grupo', titulo: 'Grupo', valor: (g) => `${g.grupo} ${g.classificacao}`, render: (g) => html`<b>${g.grupo}</b>` },
          { chave: 'classificacao', titulo: 'Classificação', render: (g) => (g.classificacao ? html`<${Etiqueta} cor="azul">${g.classificacao}</${Etiqueta}>` : '–') },
          { chave: 'n', titulo: 'Produtos / marcas', valor: (g) => g.itens.length, render: (g) => html`${pl(g.itens.length, 'produto', 'produtos')}<br /><small>${g.itens.map((p) => p.marca || p.codigo).join(', ')}</small>` },
          { chave: 'saldo', titulo: 'Saldo total', num: true, render: (g) => html`<b>${qu(g.saldo, g.unidade)}</b>` },
          { chave: 'valor', titulo: 'Valor', num: true, render: (g) => moeda(g.valor) },
          { chave: 'media', titulo: 'Consumo/dia', num: true, render: (g) => v(g.media) },
          { chave: 'cobertura', titulo: 'Cobertura (dias)', num: true, valor: (g) => g.cobertura ?? 99999, render: (g) => (g.cobertura === null ? '–' : num(g.cobertura, 1)) },
          { chave: 'receber', titulo: 'A receber', num: true, render: (g) => (g.receber ? qu(g.receber, g.unidade, 1) : '–') },
          { chave: 'pior', titulo: 'Pior situação', render: (g) => html`<${Etiqueta} cor=${STATUS_ESTOQUE[g.statusPior].cor}>${STATUS_ESTOQUE[g.statusPior].rotulo}</${Etiqueta}>` },
        ]} />
        <p class="nota">Toque numa linha para ver os produtos (marcas) daquele grupo e classificação.</p>`
    : html`<${Tabela} linhas=${linhas} colunas=${colunas} aoClicar=${setAberto} ordemInicial=${{ chave: 'status_ordem', dir: 1 }}
      rodape=${html`<tr><td colspan=${colunas.findIndex((c) => c.chave === 'valor')}>${pl(linhas.length, "item", "itens")}</td><td class="n"><b>${moeda(valorTotal)}</b></td><td colspan=${colunas.length}></td></tr>`} />`}
    <details class="legenda">
      <summary>Como ler esta tela</summary>
      <ul>
        <li><b>Consumo/dia</b>: média do que saiu por dia (receitas, saídas avulsas e do almoxarifado), contando também os dias sem saída.</li>
        <li><b>Cobertura</b>: quantos dias o saldo atual dura no ritmo de consumo médio.</li>
        <li><b>Mín. definido</b>: digitado no cadastro pela experiência da equipe. <b>Mín. calculado</b>: aparece depois de ${params.dias_minimos_calculo || 30} dias de uso =
          consumo médio × prazo de entrega + estoque de segurança (folga para variação do consumo e do prazo, com ${params.nivel_servico_z || 1.65} desvios‑padrão).</li>
        <li><b>Situação</b>: <b>Zerado</b> sem saldo · <b>Crítico</b> saldo abaixo da segurança (ou de metade do mínimo) · <b>Comprar</b> saldo + o que já está pedido não cobre o mínimo ·
          <b>Aguardando entrega</b> abaixo do mínimo mas com pedido a caminho · <b>OK</b>.</li>
        <li><b>Sugestão de compra</b>: quanto pedir para voltar ao mínimo e ainda cobrir ${params.ciclo_compra_dias || 30} dias de consumo, já descontando o que está a receber. É só uma orientação para o comprador.</li>
      </ul>
    </details>
    ${aberto && html`<${DetalheItem} p=${aberto} aoFechar=${() => setAberto(null)} aoVerMov=${() => ir('movimentos', { produto: aberto.id })} />`}`;
}

function DetalheItem({ p, aoFechar, aoVerMov }) {
  const linha = (rot, val, ajuda) => html`<div><small>${rot}</small><b>${val}</b>${ajuda && html`<small class="dica">${ajuda}</small>`}</div>`;
  return html`<${Modal} titulo=${`${p.codigo} · ${p.descricao}`} aoFechar=${aoFechar} largo
    rodape=${html`<button class="btn btn-sec" onClick=${aoVerMov}>Ver movimentações</button><button class="btn btn-pri" onClick=${aoFechar}>Fechar</button>`}>
    <p><${Etiqueta} cor=${STATUS_ESTOQUE[p.status].cor}>${STATUS_ESTOQUE[p.status].rotulo}</${Etiqueta}></p>
    <div class="info-grade">
      ${linha('Grupo / classificação / marca', [p.grupo, p.classificacao && `classificação ${p.classificacao}`, p.marca].filter(Boolean).join(' · ') || '–')}
      ${linha('Saldo', qtdDupla(p, p.saldo))}
      ${linha('Custo médio', `${moeda(p.custo_medio)} / ${p.unidade_estoque}`)}
      ${linha('Valor em estoque', moeda(p.valor))}
      ${linha('Consumo médio', `${v(p.media_dia)} ${p.unidade_estoque}/dia`, `${v(p.media_semana, 1)}/semana · ${v(p.media_mes, 1)}/mês · ${pl(p.dias_historico, 'dia', 'dias')} de histórico`)}
      ${linha('Variação diária (desvio)', `${v(p.desvio_dia)} ${p.unidade_estoque}`)}
      ${linha('Cobertura', p.cobertura === null ? 'sem consumo' : `${num(p.cobertura, 1)} ${p.cobertura >= 1 && p.cobertura < 2 ? 'dia' : 'dias'}`)}
      ${linha('Prazo de entrega', `${num(p.prazo, 1)} ${p.prazo >= 1 && p.prazo < 2 ? 'dia' : 'dias'}`, `origem: ${p.fonte_prazo}`)}
      ${linha('Estoque de segurança', p.estoque_seguranca === null ? 'aguardando histórico' : `${v(p.estoque_seguranca, 1)} ${p.unidade_estoque}`)}
      ${linha('Mínimo definido', p.min_definido === null ? '–' : `${v(p.min_definido, 1)} ${p.unidade_estoque}`)}
      ${linha('Mínimo calculado', p.min_calculado === null ? 'aguardando histórico' : `${v(p.min_calculado, 1)} ${p.unidade_estoque}`)}
      ${linha('A receber (pedidos)', `${v(p.a_receber, 1)} ${p.unidade_estoque}`)}
      ${linha('Sugestão de compra', p.sugestao_compra ? qu(p.sugestao_compra, p.unidade_compra || p.unidade_estoque, 0) : '–')}
      ${linha('Última saída', p.ultima_saida ? dataHora(p.ultima_saida) : '–')}
    </div>
    <p class="nota">Mínimo usado nos alertas: <b>${p.fonte_min || 'nenhum'}</b>. Os números ajudam o comprador a se orientar; a decisão de compra é dele.</p>
  </${Modal}>`;
}
