// Quem alterou por último e histórico de alterações de um registro (auditoria)
import { html, useState, useEffect, useApp, Carregando } from './ui.js';
import { dataHora, nomeUsuario } from './util.js';

const NOMES = {
  codigo: 'código', descricao: 'descrição', categoria: 'categoria', unidade_estoque: 'unidade de estoque', unidade_compra: 'unidade de compra',
  fator_compra: 'fator de compra', estoque_minimo: 'estoque mínimo', prazo_entrega_dias: 'prazo de entrega (dias)', fornecedor_padrao_id: 'fornecedor principal',
  observacao: 'observação', ativo: 'ativo', nome: 'nome', cnpj: 'CNPJ', contato: 'contato', telefone: 'telefone', email: 'e-mail',
  fornecedor_id: 'fornecedor', data_pedido: 'data do pedido', previsao_entrega: 'previsão de entrega', condicao_pagamento: 'condição de pagamento',
  produto_id: 'produto', quantidade: 'quantidade', unidade: 'unidade', preco_unitario: 'preço unitário', valor_total: 'valor total',
  papeis: 'papéis', funcao: 'função', valor: 'valor', motivo_cancelamento: 'motivo do cancelamento', ciente_obs: 'obs. da ciência',
  produto_final: 'produto final', rendimento: 'rendimento', nota_fiscal: 'nota fiscal',
  razao_social: 'razão social', inscricao_estadual: 'inscrição estadual', whatsapp: 'WhatsApp', endereco: 'endereço', bairro: 'bairro',
  cidade: 'cidade', uf: 'UF', cep: 'CEP', codigo_erp: 'código ERP', grupo: 'grupo', classificacao: 'classificação', marca: 'marca',
  data: 'dia', ficha_id: 'receita', itens_alterados: 'ingredientes alterados', situacao: 'situação', cancelado_motivo: 'motivo do cancelamento',
};
const IGNORAR = new Set(['saldo', 'custo_medio', 'qtd_recebida_base', 'status', 'atualizado_em', 'atualizado_por', 'criado_em', 'criado_por', 'id', 'user_id']);
const fmt = (v) => (v === null || v === undefined || v === '' ? '(vazio)' : v === true ? 'sim' : v === false ? 'não' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function mudancas(a) {
  const nome = (k) => NOMES[k] || k;
  if (a.acao === 'INSERT') return 'Criou o registro';
  if (a.acao === 'DELETE') return 'Removeu: ' + Object.entries(a.antes || {}).filter(([k, v]) => v !== null && !IGNORAR.has(k)).map(([k, v]) => `${nome(k)} ${fmt(v)}`).join(' · ');
  const out = [];
  for (const k of new Set([...Object.keys(a.antes || {}), ...Object.keys(a.depois || {})])) {
    if (IGNORAR.has(k)) continue;
    if (JSON.stringify(a.antes?.[k]) !== JSON.stringify(a.depois?.[k])) out.push(`${nome(k)}: ${fmt(a.antes?.[k])} → ${fmt(a.depois?.[k])}`);
  }
  return out.join(' · ') || 'Alteração interna';
}

// "Última alteração: Juliano (Engenheiro de produção) em 22/10/26 15:00"
export function UltimaAlteracao({ reg, rotulo = 'Última alteração' }) {
  const { dados } = useApp();
  if (!reg?.atualizado_em) return null;
  return html`<p class="autoria">${rotulo}: <b>${nomeUsuario(dados.mapa.perfil.get(reg.atualizado_por))}</b> em ${dataHora(reg.atualizado_em)}</p>`;
}

// Lista de alterações registradas pelo banco para um registro
export function HistoricoAuditoria({ tabela, id, tabelasExtras = [] }) {
  const { dados, api } = useApp();
  const [aberto, setAberto] = useState(false);
  const [regs, setRegs] = useState(null);
  useEffect(() => {
    if (!aberto || regs) return;
    Promise.all([tabela, ...tabelasExtras].map((t) => api.listar('auditoria', { eq: { tabela: t, registro_id: String(id) }, ordem: ['id', 'desc'], limite: 100 })))
      .then((l) => setRegs(l.flat().sort((a, b) => b.id - a.id))).catch(() => setRegs([]));
  }, [aberto]);
  return html`<div class="historico">
    <button class="btn btn-sec btn-bloco" onClick=${() => setAberto(!aberto)}>${aberto ? 'Esconder histórico' : 'Ver histórico de alterações'}</button>
    ${aberto && (regs === null ? html`<${Carregando} />` : regs.length === 0 ? html`<p class="nota">Sem alterações registradas.</p>`
      : html`<ul class="linha-tempo">${regs.map((r) => html`<li>
          <div><b>${nomeUsuario(dados.mapa.perfil.get(r.usuario_id))}</b> <small>${dataHora(r.data_hora)}</small></div>
          <div class="quebra">${mudancas(r)}</div></li>`)}</ul>`)}
  </div>`;
}
