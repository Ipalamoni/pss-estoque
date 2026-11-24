// Auditoria: quem alterou o quê nos cadastros, pedidos, usuários e configurações
import { html, useState, useEffect, useMemo, useApp, Cabecalho, Tabela, Carregando, Etiqueta, avisar, Filtros } from '../ui.js';
import { dataHora, hojeISO, somarDias, mensagemErro, nomeUsuario } from '../util.js';
import { mudancas } from '../historico.js';
import { Exportar } from '../exportar.js';

const TABELAS = { produtos: 'Produtos', fornecedores: 'Fornecedores', fichas_tecnicas: 'Fichas técnicas', ficha_itens: 'Itens de ficha',
  pedidos: 'Pedidos', pedido_itens: 'Itens de pedido', recebimentos: 'Recebimentos', programacoes: 'Programação de produção', perfis: 'Usuários', parametros: 'Configurações' };
const ACAO = { INSERT: ['criou', 'verde'], UPDATE: ['alterou', 'azul'], DELETE: ['removeu', 'vermelho'] };
export function TelaAuditoria() {
  const { dados, api } = useApp();
  const [de, setDe] = useState(somarDias(hojeISO(), -30));
  const [ate, setAte] = useState(hojeISO());
  const [tabela, setTabela] = useState('');
  const [regs, setRegs] = useState(null);
  useEffect(() => {
    setRegs(null);
    api.listar('auditoria', { desde: new Date(de + 'T00:00:00').toISOString(), ate: new Date(somarDias(ate, 1) + 'T00:00:00').toISOString(), ordem: ['id', 'desc'], limite: 3000 })
      .then(setRegs).catch((e) => { avisar(mensagemErro(e), 'erro'); setRegs([]); });
  }, [de, ate]);
  const lista = useMemo(() => (regs || []).filter((r) => !tabela || r.tabela === tabela), [regs, tabela]);
  return html`
    <${Cabecalho} titulo="Auditoria" sub="Registro automático (feito pelo banco) de toda criação e alteração em cadastros, pedidos, programação, usuários e configurações. Não pode ser editado nem apagado.">
      ${regs && html`<${Exportar} tabela="auditoria.telaauditoria" titulo="Auditoria" filtros=${`${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`} arquivo=${`auditoria-${de}-a-${ate}`} linhas=${lista}
        colunas=${[{ titulo: 'Data/hora', valor: (r) => dataHora(r.data_hora) }, { titulo: 'Usuário', valor: (r) => (r.usuario_id ? nomeUsuario(dados.mapa.perfil.get(r.usuario_id)) : 'sistema'), largura: 28 },
          { titulo: 'Ação', valor: (r) => ACAO[r.acao]?.[0] }, { titulo: 'Onde', valor: (r) => `${TABELAS[r.tabela] || r.tabela} #${r.registro_id}`, largura: 26 },
          { titulo: 'O que mudou', valor: (r) => mudancas(r), largura: 80 }]} />`}
    </${Cabecalho}>
    <${Filtros} ativos=${tabela ? 1 : 0} resumo=${`Período: ${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`}>
      <label class="campo-inline">De <input class="entrada" type="date" value=${de} onChange=${(e) => setDe(e.target.value)} /></label>
      <label class="campo-inline">até <input class="entrada" type="date" value=${ate} onChange=${(e) => setAte(e.target.value)} /></label>
      <select class="entrada" value=${tabela} onChange=${(e) => setTabela(e.target.value)}><option value="">Tudo</option>
        ${Object.entries(TABELAS).map(([k, t]) => html`<option value=${k}>${t}</option>`)}</select>
    </${Filtros}>
    <p class="nota">As movimentações de estoque não aparecem aqui porque elas mesmas já são um registro permanente (veja “Movimentações”).</p>
    ${regs === null ? html`<${Carregando} />` : html`<${Tabela} id="auditoria.telaauditoria" linhas=${lista} max=${500} colunas=${[
      { chave: 'data_hora', titulo: 'Data/hora', render: (r) => dataHora(r.data_hora) },
      { chave: 'u', titulo: 'Usuário', valor: (r) => dados.mapa.perfil.get(r.usuario_id)?.nome, render: (r) => (r.usuario_id ? nomeUsuario(dados.mapa.perfil.get(r.usuario_id)) : html`<small>sistema</small>`) },
      { chave: 'acao', titulo: 'Ação', render: (r) => html`<${Etiqueta} cor=${ACAO[r.acao]?.[1]}>${ACAO[r.acao]?.[0]}</${Etiqueta}>` },
      { chave: 'tabela', titulo: 'Onde', render: (r) => `${TABELAS[r.tabela] || r.tabela} #${r.registro_id}` },
      { chave: 'm', titulo: 'O que mudou', ordenar: false, render: (r) => html`<small class="quebra">${mudancas(r)}</small>` },
    ]} />`}`;
}
