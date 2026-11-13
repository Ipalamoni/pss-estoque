// =====================================================================
// demo.js — MODO DEMONSTRAÇÃO / TREINAMENTO
// Simula o banco do Supabase dentro do navegador, com as MESMAS regras
// das funções do arquivo sql/03_funcoes.sql. Serve para:
//  - ver e testar as telas sem internet e sem mexer nos dados reais;
//  - treinar a equipe.
// Os dados ficam só neste navegador (e podem ser reiniciados).
// =====================================================================
import { calcularEstatisticas } from './calc.js';
import { plural } from './util.js';

const CHAVE = 'pss-estoque-demo-v7';
let db = null;
let usuario = null;      // user_id logado
let relogio = null;      // usado só para gerar o histórico de exemplo

const agora = () => (relogio ? new Date(relogio) : new Date());
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoje = () => iso(agora());
const r4 = (v) => Math.round(v * 10000) / 10000;
const r2 = (v) => Math.round(v * 100) / 100;
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const txt = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim());
const numOuNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const erro = (m) => { throw new Error(m); };
const f3 = (v) => String(Math.round(Number(v) * 1000) / 1000).replace('.', ',');
const f2 = (v) => Number(v).toFixed(2).replace('.', ',');
const autoria = () => ({ atualizado_em: agora().toISOString(), atualizado_por: usuario });

const PERM = {
  cadastro_produto: ['admin', 'comprador'], cadastro_fornecedor: ['admin', 'comprador'],
  ficha_tecnica: ['admin', 'engenharia'], pedido: ['admin', 'comprador'],
  recebimento: ['admin', 'almoxarifado', 'recebimento'], saida_receita: ['admin', 'pesagem', 'almoxarifado'],
  saida_avulsa: ['admin', 'pesagem', 'almoxarifado'], saida_almox: ['admin', 'almoxarifado', 'recebimento'],
  inventario: ['admin', 'almoxarifado', 'recebimento'], corrigir: ['admin', 'almoxarifado'], implantacao: ['admin'],
  usuarios: ['admin'], parametros: ['admin'], auditoria: ['admin', 'diretoria'], importacao: ['admin'], programacao: ['admin', 'engenharia'],
  financeiro: ['admin', 'financeiro'], data_pagamento: ['admin', 'comprador', 'financeiro'],
  previsao_producao: ['admin', 'engenharia', 'diretoria', 'financeiro', 'faturamento'],
  custos: ['admin'],
};
// mesma regra de leitura do banco (02_seguranca.sql): financeiro e faturamento só leem o que precisam
const AMPLOS = ['admin', 'comprador', 'almoxarifado', 'recebimento', 'pesagem', 'engenharia', 'diretoria'];
const LEITURA_FIN = ['pedidos', 'pedido_itens', 'recebimentos', 'fornecedores', 'produtos'];
function podeLer(t) {
  if (t === 'perfis' || t === 'parametros' || t === 'versao_banco') return true;
  if (t === 'acessos') return papeis().includes('admin');
  if (papeis().some((x) => AMPLOS.includes(x))) return true;
  return papeis().includes('financeiro') && LEITURA_FIN.includes(t);
}
const temPapel = (p) => p && p.ativo && (p.papeis || []).length > 0;
const perfil = () => db.perfis.find((p) => p.user_id === usuario && temPapel(p));
const papeis = () => perfil()?.papeis || [];
const pode = (a) => (PERM[a] || []).some((x) => papeis().includes(x));
const exigir = (a) => { if (!pode(a)) erro(`Sem permissão para esta ação (${a}).`); };

function novoId(t) { db.seq[t] = (db.seq[t] || 0) + 1; return db.seq[t]; }
function inserir(t, reg, auditar = false) {
  const r = { id: novoId(t), ...reg };
  db[t].push(r);
  if (auditar) aud(t, 'INSERT', null, r);
  return r;
}
function aud(tabela, acao, antes, depois, ignorar = []) {
  if (acao === 'UPDATE') {
    const limpa = (o) => { const c = { ...o }; ignorar.forEach((k) => delete c[k]); return JSON.stringify(c); };
    if (limpa(antes) === limpa(depois)) return;
  }
  db.auditoria.push({ id: novoId('auditoria'), data_hora: agora().toISOString(), usuario_id: usuario, tabela,
    registro_id: String(depois?.id ?? antes?.id ?? depois?.user_id ?? depois?.chave ?? ''), acao, antes, depois });
}
function atualizar(t, reg, mudancas, ignorar = []) {
  const antes = { ...reg };
  Object.assign(reg, mudancas);
  aud(t, 'UPDATE', antes, { ...reg }, ignorar);
}
const param = (k) => db.parametros.find((p) => p.chave === k)?.valor;
const prod = (id) => db.produtos.find((p) => p.id === Number(id)) || erro(`Produto ${id} não encontrado.`);

function fator(id, un) {
  const p = prod(id);
  if (!un || un === p.unidade_estoque) return 1;
  if (un === p.unidade_compra) return Number(p.fator_compra);
  if (p.unidade_estoque.toLowerCase() === 'kg' && un.toLowerCase() === 'g') return 0.001;
  if (p.unidade_estoque.toLowerCase() === 'g' && un.toLowerCase() === 'kg') return 1000;
  if (p.unidade_estoque.toLowerCase() === 'l' && un.toLowerCase() === 'ml') return 0.001;
  if (p.unidade_estoque.toLowerCase() === 'ml' && un.toLowerCase() === 'l') return 1000;
  return erro(`Unidade "${un}" não serve para o produto ${p.codigo} (${p.descricao}).`);
}

// ------------------------------- MOTOR -------------------------------
function movimentar(produtoId, tipo, q, custo, extra = {}) {
  q = r4(q);
  if (!q) erro('Quantidade zerada não gera movimento.');
  const p = prod(produtoId);
  if ((param('permitir_saldo_negativo') || 'sim') === 'nao' && p.saldo + q < 0)
    erro(`Saldo insuficiente de ${p.codigo} (${p.descricao}).`);
  let medio = p.custo_medio, cMov;
  if (custo !== null && custo !== undefined && custo >= 0) {
    cMov = custo;
    const base = Math.max(p.saldo, 0);
    if (base + q > 0) medio = (base * p.custo_medio + q * custo) / (base + q);
    if (medio < 0 || (p.saldo <= 0 && q > 0)) medio = q > 0 ? custo : p.custo_medio;
  } else cMov = p.custo_medio;
  p.saldo = r4(p.saldo + q);
  p.custo_medio = r6(medio);
  return inserir('movimentos', {
    data_hora: agora().toISOString(), produto_id: p.id, tipo, quantidade: q,
    qtd_informada: numOuNull(extra.qtd_informada), unidade_informada: extra.unidade_informada || null,
    custo_unitario: r6(cMov), valor: r2(q * cMov), saldo_apos: p.saldo,
    motivo: txt(extra.motivo), observacao: txt(extra.observacao), destino: txt(extra.destino),
    usuario_id: usuario, recebimento_id: extra.recebimento_id || null, pedido_item_id: extra.pedido_item_id || null,
    producao_id: extra.producao_id || null, inventario_id: extra.inventario_id || null, corrige_id: extra.corrige_id || null,
  }).id;
}
function statusPedido(pedidoId) {
  const pe = db.pedidos.find((x) => x.id === pedidoId);
  if (['cancelado', 'encerrado'].includes(pe.status)) return;
  const its = db.pedido_itens.filter((x) => x.pedido_id === pedidoId);
  const completos = its.filter((x) => x.qtd_recebida_base >= x.quantidade_base * 0.999).length;
  const algum = its.some((x) => x.qtd_recebida_base > 0);
  pe.status = its.length && completos === its.length ? 'recebido' : algum ? 'parcial' : 'aberto';
}

// ------------------------------- RPCs --------------------------------
const RPC = {
  salvar_produto({ p }) {
    exigir('cadastro_produto');
    if (!txt(p.codigo)) erro('Informe o código do produto.');
    if (!txt(p.descricao)) erro('Informe a descrição do produto.');
    if (!txt(p.unidade_estoque)) erro('Informe a unidade de estoque.');
    let uc = txt(p.unidade_compra), f = numOuNull(p.fator_compra) ?? 1;
    if (!uc || uc === p.unidade_estoque) { uc = null; f = 1; }
    if (f <= 0) erro('O fator de conversão precisa ser maior que zero.');
    const id = numOuNull(p.id);
    if (db.produtos.some((x) => x.codigo.toLowerCase() === String(p.codigo).trim().toLowerCase() && x.id !== id))
      erro(`Já existe um produto com o código ${p.codigo}.`);
    if (!['materia_prima', 'embalagem', 'escritorio', 'limpeza', 'outros'].includes(p.categoria)) erro(`Categoria inválida: "${p.categoria}".`);
    const dados = {
      codigo: String(p.codigo).trim(), codigo_erp: txt(p.codigo_erp), descricao: String(p.descricao).trim(), categoria: p.categoria,
      grupo: txt(p.grupo), classificacao: txt(p.classificacao) ? String(p.classificacao).trim().toUpperCase() : null, marca: txt(p.marca),
      unidade_estoque: String(p.unidade_estoque).trim(), unidade_compra: uc, fator_compra: f,
      estoque_minimo: numOuNull(p.estoque_minimo), prazo_entrega_dias: numOuNull(p.prazo_entrega_dias),
      fornecedor_padrao_id: numOuNull(p.fornecedor_padrao_id), observacao: txt(p.observacao), ativo: p.ativo !== false,
    };
    if (!id) return inserir('produtos', { ...dados, saldo: 0, custo_medio: 0, criado_em: agora().toISOString(), ...autoria() }, true).id;
    const reg = prod(id);
    if (reg.unidade_estoque !== dados.unidade_estoque && db.movimentos.some((m) => m.produto_id === id))
      erro('A unidade de estoque não pode mudar depois que o produto já tem movimentos.');
    atualizar('produtos', reg, { ...dados, ...autoria() }, ['saldo', 'custo_medio']);
    return id;
  },
  salvar_fornecedor({ p }) {
    exigir('cadastro_fornecedor');
    if (!txt(p.nome)) erro('Informe o nome do fornecedor.');
    const uf = txt(p.uf) ? String(p.uf).trim().toUpperCase() : null;
    if (uf && !/^[A-Z]{2}$/.test(uf)) erro('UF deve ter 2 letras (ex.: SP).');
    const id = numOuNull(p.id);
    const dig = (x) => String(x || '').replace(/\D/g, '');
    if (txt(p.cnpj) && db.fornecedores.some((f) => dig(f.cnpj) === dig(p.cnpj) && f.id !== id)) erro(`Já existe um fornecedor com o CNPJ ${p.cnpj}.`);
    const dados = { nome: String(p.nome).trim(), razao_social: txt(p.razao_social), cnpj: txt(p.cnpj), inscricao_estadual: txt(p.inscricao_estadual),
      contato: txt(p.contato), telefone: txt(p.telefone), whatsapp: txt(p.whatsapp), email: txt(p.email), endereco: txt(p.endereco), bairro: txt(p.bairro),
      cidade: txt(p.cidade), uf, cep: txt(p.cep), condicao_pagamento: txt(p.condicao_pagamento),
      prazo_entrega_dias: numOuNull(p.prazo_entrega_dias), observacao: txt(p.observacao), ativo: p.ativo !== false };
    if (!id) return inserir('fornecedores', { ...dados, criado_em: agora().toISOString(), ...autoria() }, true).id;
    const reg = db.fornecedores.find((x) => x.id === id) || erro('Fornecedor não encontrado.');
    atualizar('fornecedores', reg, { ...dados, ...autoria() });
    return id;
  },
  salvar_ficha({ p }) {
    exigir('ficha_tecnica');
    if (!txt(p.nome)) erro('Informe o nome da ficha técnica.');
    if (!(p.itens || []).length) erro('A ficha técnica precisa de pelo menos 1 ingrediente.');
    const novos = new Map();
    for (const it of p.itens) {
      if (prod(it.produto_id).categoria !== 'materia_prima') erro('Ficha técnica só aceita matéria-prima.');
      if (!(Number(it.quantidade) > 0)) erro('Quantidade do ingrediente precisa ser maior que zero.');
      const id = Number(it.produto_id);
      novos.set(id, r4((novos.get(id) || 0) + Number(it.quantidade) * fator(id, it.unidade)));
    }
    let rq = numOuNull(p.rendimento_qtd), ru = txt(p.rendimento_unidade);
    if (rq === null && txt(p.rendimento)) {   // lê do texto: "180 pacotes", "1.000 unidades"
      const m = txt(p.rendimento).match(/^\s*([0-9][0-9.]*(,[0-9]+)?)\s*(.*)$/);
      if (m && m[3]) { rq = Number(m[1].replace(/\./g, '').replace(',', '.')); ru = ru || m[3].trim(); }
    }
    if (rq !== null && !(rq > 0)) erro('O rendimento precisa ser maior que zero.');
    const dados = { nome: String(p.nome).trim(), produto_final: txt(p.produto_final), rendimento: txt(p.rendimento),
      rendimento_qtd: rq, rendimento_unidade: rq === null ? null : ru, observacao: txt(p.observacao), ativo: p.ativo !== false };
    let id = numOuNull(p.id); const desc = [];
    if (txt(p.codigo) && db.fichas_tecnicas.some((f) => f.codigo.toLowerCase() === txt(p.codigo).toLowerCase() && f.id !== id))
      erro(`Já existe uma ficha técnica com o código ${p.codigo}.`);
    if (!id) {
      const cod = txt(p.codigo) || 'R' + String((db.seq.fichas_tecnicas || 0) + 1).padStart(3, '0');
      id = inserir('fichas_tecnicas', { codigo: cod, ...dados, criado_em: agora().toISOString(), ...autoria() }, true).id;
      desc.push(`Criou a ficha com ${novos.size} ${novos.size === 1 ? 'ingrediente' : 'ingredientes'}`);
      for (const [pid, q] of novos) inserir('ficha_itens', { ficha_id: id, produto_id: pid, quantidade: q }, true);
    } else {
      const reg = db.fichas_tecnicas.find((x) => x.id === id) || erro('Ficha técnica não encontrada.');
      if (txt(p.codigo) && reg.codigo !== txt(p.codigo)) { desc.push(`código: "${reg.codigo}" → "${txt(p.codigo)}"`); dados.codigo = txt(p.codigo); }
      if (reg.nome !== dados.nome) desc.push(`nome: "${reg.nome}" → "${dados.nome}"`);
      if ((reg.produto_final || null) !== dados.produto_final) desc.push(`produto final: "${reg.produto_final || ''}" → "${dados.produto_final || ''}"`);
      if ((reg.rendimento || null) !== dados.rendimento) desc.push(`rendimento: "${reg.rendimento || ''}" → "${dados.rendimento || ''}"`);
      if ((reg.rendimento_qtd ?? null) !== dados.rendimento_qtd || (reg.rendimento_unidade || null) !== dados.rendimento_unidade)
        desc.push(`rendimento por receita: ${reg.rendimento_qtd ?? '–'} ${reg.rendimento_unidade || ''} → ${dados.rendimento_qtd ?? '–'} ${dados.rendimento_unidade || ''}`);
      if ((reg.observacao || null) !== dados.observacao) desc.push('alterou a observação');
      if (reg.ativo !== dados.ativo) desc.push(dados.ativo ? 'reativou a ficha' : 'desativou a ficha');
      atualizar('fichas_tecnicas', reg, { ...dados, ...autoria() });
      for (const it of db.ficha_itens.filter((x) => x.ficha_id === id)) {
        const pr = prod(it.produto_id);
        if (!novos.has(it.produto_id)) {
          aud('ficha_itens', 'DELETE', it, null); db.ficha_itens = db.ficha_itens.filter((x) => x !== it);
          desc.push(`retirou ${pr.descricao} (${f3(it.quantidade)} ${plural(pr.unidade_estoque, it.quantidade)})`);
        } else if (Math.abs(novos.get(it.produto_id) - it.quantidade) > 0.00005) {
          const q = novos.get(it.produto_id);
          desc.push(`${pr.descricao}: ${f3(it.quantidade)} → ${f3(q)} ${plural(pr.unidade_estoque, q)}`);
          atualizar('ficha_itens', it, { quantidade: q });
        }
        novos.delete(it.produto_id);
      }
      for (const [pid, q] of novos) {
        const pr = prod(pid);
        inserir('ficha_itens', { ficha_id: id, produto_id: pid, quantidade: q }, true);
        desc.push(`incluiu ${pr.descricao} (${f3(q)} ${plural(pr.unidade_estoque, q)})`);
      }
    }
    if (desc.length) inserir('fichas_historico', { ficha_id: id, data_hora: agora().toISOString(), usuario_id: usuario, descricao: desc.join('; ') });
    return id;
  },
  salvar_pedido({ p }) {
    exigir('pedido');
    if (!p.fornecedor_id) erro('Escolha o fornecedor.');
    if (!p.data_pedido) erro('Informe a data do pedido.');
    if (!(p.itens || []).length) erro('O pedido precisa de pelo menos 1 item.');
    if (p.previsao_entrega && p.previsao_entrega < p.data_pedido) erro('A previsão de entrega não pode ser antes da data do pedido.');
    if (!p.previsao_pagamento) erro('Informe a previsão de pagamento.');
    if (p.previsao_pagamento < p.data_pedido) erro('A previsão de pagamento não pode ser antes da data do pedido.');
    const cab = { fornecedor_id: Number(p.fornecedor_id), data_pedido: p.data_pedido, previsao_entrega: p.previsao_entrega || null, previsao_pagamento: p.previsao_pagamento,
      condicao_pagamento: txt(p.condicao_pagamento), observacao: txt(p.observacao) };
    let id = numOuNull(p.id);
    if (!id) id = inserir('pedidos', { ...cab, status: 'aberto', motivo_cancelamento: null, comprador_id: usuario, criado_em: agora().toISOString(),
      fin_lancado: false, fin_lancado_em: null, fin_lancado_por: null, fin_obs: null }, true).id;
    else {
      const pe = db.pedidos.find((x) => x.id === id) || erro('Pedido não encontrado.');
      if (!['aberto', 'parcial'].includes(pe.status)) erro(`Pedido ${id} está ${pe.status} e não pode ser alterado.`);
      atualizar('pedidos', pe, { ...cab, ...autoria() }, ['status']);
    }
    const manter = new Set(p.itens.filter((x) => x.id).map((x) => Number(x.id)));
    const remover = db.pedido_itens.filter((x) => x.pedido_id === id && !manter.has(x.id));
    if (remover.some((x) => x.qtd_recebida_base > 0)) erro('Não é possível remover um item que já teve recebimento.');
    remover.forEach((x) => aud('pedido_itens', 'DELETE', x, null));
    db.pedido_itens = db.pedido_itens.filter((x) => !remover.includes(x));
    for (const it of p.itens) {
      const q = Number(it.quantidade), preco = Number(it.preco_unitario || 0);
      if (!(q > 0)) erro('Quantidade do item precisa ser maior que zero.');
      if (preco < 0) erro('Preço não pode ser negativo.');
      const base = r4(q * fator(it.produto_id, it.unidade));
      const dados = { produto_id: Number(it.produto_id), quantidade: q, unidade: it.unidade, quantidade_base: base,
        preco_unitario: preco, valor_total: r2(q * preco) };
      if (!it.id) inserir('pedido_itens', { pedido_id: id, ...dados, qtd_recebida_base: 0 }, true);
      else {
        const reg = db.pedido_itens.find((x) => x.id === Number(it.id) && x.pedido_id === id) || erro('Item não pertence ao pedido.');
        if (reg.qtd_recebida_base > 0 && reg.produto_id !== dados.produto_id) erro('Não é possível trocar o produto de um item que já teve recebimento.');
        if (base < reg.qtd_recebida_base - 0.0001) erro('A quantidade não pode ficar menor do que já foi recebido.');
        atualizar('pedido_itens', reg, dados, ['qtd_recebida_base']);
      }
    }
    statusPedido(id);
    return id;
  },
  cancelar_pedido({ p_id, p_motivo }) {
    exigir('pedido');
    if (!txt(p_motivo)) erro('Informe o motivo.');
    const pe = db.pedidos.find((x) => x.id === Number(p_id)) || erro('Pedido não encontrado.');
    if (!['aberto', 'parcial'].includes(pe.status)) erro(`Pedido já está ${pe.status}.`);
    const recebeu = db.pedido_itens.some((x) => x.pedido_id === pe.id && x.qtd_recebida_base > 0);
    atualizar('pedidos', pe, { status: recebeu ? 'encerrado' : 'cancelado', motivo_cancelamento: txt(p_motivo) }, ['status']);
  },
  registrar_recebimento({ p }) {
    exigir('recebimento');
    const pedId = numOuNull(p.pedido_id);
    const encerrar = !!p.encerrar_pendente;
    let pe = null;
    if (pedId) {
      pe = db.pedidos.find((x) => x.id === pedId) || erro('Pedido não encontrado.');
      if (!['aberto', 'parcial'].includes(pe.status)) erro(`Pedido está ${pe.status} e não aceita recebimento.`);
    }
    const rec = inserir('recebimentos', { data_hora: agora().toISOString(), pedido_id: pedId, fornecedor_id: pe ? pe.fornecedor_id : numOuNull(p.fornecedor_id),
      nota_fiscal: txt(p.nota_fiscal), divergencia: false, divergencia_detalhe: null, comprador_avisado: !!p.comprador_avisado,
      ciente_por: null, ciente_em: null, ciente_obs: null, observacao: txt(p.observacao), usuario_id: usuario }, true);
    const det = []; const ids = []; let n = 0;
    for (const it of p.itens || []) {
      const qi = Number(it.quantidade || 0);
      if (qi < 0) erro('Quantidade recebida não pode ser negativa.');
      const pr = prod(it.produto_id);
      const f = fator(it.produto_id, it.unidade);
      const qb = r4(qi * f);
      let custo = null;
      if (it.pedido_item_id) {
        const pi = db.pedido_itens.find((x) => x.id === Number(it.pedido_item_id) && x.pedido_id === pedId) || erro('Item não pertence ao pedido.');
        ids.push(pi.id);
        const fpi = fator(pi.produto_id, pi.unidade);
        const pend = Math.max(pi.quantidade_base - pi.qtd_recebida_base, 0);
        const tot = (pi.qtd_recebida_base + qb) / fpi;
        if (qb > pend + 0.0001) det.push(`${pr.descricao}: veio A MAIS — pedido ${f3(pi.quantidade)} ${plural(pi.unidade, pi.quantidade)}, recebido no total ${f3(tot)} ${plural(pi.unidade, tot)} (+${f3((pi.qtd_recebida_base + qb - pi.quantidade_base) / fpi)})`);
        else if (qb < pend - 0.0001 && encerrar) det.push(`${pr.descricao}: veio A MENOS — pedido ${f3(pi.quantidade)} ${plural(pi.unidade, pi.quantidade)}, recebido no total ${f3(tot)} ${plural(pi.unidade, tot)} (−${f3((pi.quantidade_base - pi.qtd_recebida_base - qb) / fpi)}); o restante não virá`);
        custo = pi.quantidade_base > 0 ? pi.valor_total / pi.quantidade_base : null;
        if (it.preco_nota !== null && it.preco_nota !== undefined && it.preco_nota !== '') {
          const pb = Number(it.preco_nota) / f;
          if (Math.abs(pb * fpi - pi.preco_unitario) >= 0.005) {
            det.push(`${pr.descricao}: PREÇO diferente — pedido R$ ${f2(pi.preco_unitario)} por ${pi.unidade}, nota R$ ${f2(pb * fpi)} por ${pi.unidade}`);
            custo = pb;
          }
        }
        if (qb === 0) continue;
        pi.qtd_recebida_base = r4(pi.qtd_recebida_base + qb);
      } else {
        if (qb === 0) continue;
        if (pedId) det.push(`${pr.descricao}: item FORA do pedido (${f3(qi)} ${plural(it.unidade, qi)})`);
        const pc = it.preco_nota ?? it.custo_unitario;
        if (pc !== null && pc !== undefined && pc !== '') custo = Number(pc) / f;
      }
      movimentar(it.produto_id, 'entrada', qb, custo, { recebimento_id: rec.id, pedido_item_id: numOuNull(it.pedido_item_id),
        qtd_informada: qi, unidade_informada: it.unidade, observacao: it.observacao });
      n++;
    }
    if (!n) erro('Nenhuma quantidade recebida foi informada.');
    if (!pedId) det.push('Recebido SEM PEDIDO de compra — ' + db.movimentos.filter((m) => m.recebimento_id === rec.id)
      .map((m) => `${prod(m.produto_id).descricao}: ${f3(m.qtd_informada)} ${plural(m.unidade_informada, m.qtd_informada)}`).join('; '));
    if (pedId) {
      if (encerrar) for (const pi of db.pedido_itens.filter((x) => x.pedido_id === pedId && !ids.includes(x.id) && x.qtd_recebida_base < x.quantidade_base - 0.0001)) {
        const falta = (pi.quantidade_base - pi.qtd_recebida_base) / fator(pi.produto_id, pi.unidade);
        det.push(`${prod(pi.produto_id).descricao}: NÃO VEIO — faltam ${f3(falta)} ${plural(pi.unidade, falta)}; o restante não virá`);
      }
      if (encerrar && db.pedido_itens.some((x) => x.pedido_id === pedId && x.qtd_recebida_base < x.quantidade_base - 0.0001)) {
        pe.status = 'encerrado'; pe.motivo_cancelamento = 'Encerrado no recebimento: entrega menor que o pedido (o restante não virá).';
      } else statusPedido(pedId);
    }
    if (det.length) {
      if (!txt(p.observacao)) erro('Recebimento com divergência: escreva a ressalva (o que aconteceu e com quem foi combinado).');
      atualizar('recebimentos', rec, { divergencia: true, divergencia_detalhe: det.join('\n') });
    }
    return rec.id;
  },
  dar_ciencia_divergencia({ p_recebimento, p_obs }) {
    exigir('pedido');
    const r = db.recebimentos.find((x) => x.id === Number(p_recebimento)) || erro('Recebimento não encontrado.');
    if (!r.divergencia) erro('Este recebimento não tem divergência.');
    if (r.ciente_por) erro('A ciência deste recebimento já foi registrada.');
    atualizar('recebimentos', r, { ciente_por: usuario, ciente_em: agora().toISOString(), ciente_obs: txt(p_obs) });
  },
  registrar_producao({ p }) {
    exigir('saida_receita');
    const mult = Number(p.multiplicador);
    if (!(mult > 0)) erro('Informe quantas receitas foram feitas.');
    let fichaId = numOuNull(p.ficha_id), alterada = !!p.alterada, itens = p.itens;
    const progId = numOuNull(p.programacao_id);
    if (progId) {
      const pg = db.programacoes.find((x) => x.id === progId);
      if (!pg || pg.situacao !== 'ativa') erro('Programação não encontrada ou cancelada.');
      if (pg.finalizada_em) erro('Esta programação já foi finalizada pela engenharia; lance como saída fora da programação.');
      if (!fichaId) fichaId = pg.ficha_id;
      if (fichaId !== pg.ficha_id) erro('A receita não confere com a programação.');
      if (!alterada && pg.itens_alterados) { alterada = true; itens = pg.itens_alterados; }
    }
    const ficha = db.fichas_tecnicas.find((x) => x.id === fichaId && x.ativo) || erro('Ficha técnica não encontrada ou inativa.');
    const pr = inserir('producoes', { data_hora: agora().toISOString(), ficha_id: ficha.id, multiplicador: mult, alterada,
      observacao: txt(p.observacao), programacao_id: progId, usuario_id: usuario });
    if (!alterada) {
      for (const it of db.ficha_itens.filter((x) => x.ficha_id === ficha.id))
        movimentar(it.produto_id, 'saida_receita', -(it.quantidade * mult), null, { producao_id: pr.id });
    } else {
      if (!(itens || []).length) erro('A receita alterada precisa de pelo menos 1 ingrediente.');
      for (const it of itens) {
        if (prod(it.produto_id).categoria !== 'materia_prima') erro('Saída por receita só aceita matéria-prima.');
        const q = Number(it.quantidade || 0) * fator(it.produto_id, it.unidade) * mult;
        if (q > 0) movimentar(it.produto_id, 'saida_receita', -q, null, { producao_id: pr.id });
      }
    }
    return pr.id;
  },
  salvar_programacao({ p }) {
    exigir('programacao');
    if (!txt(p.data)) erro('Informe o dia da produção.');
    const qtd = Number(p.quantidade);
    if (!(qtd > 0)) erro('Informe quantas receitas programar.');
    const fichaId = numOuNull(p.ficha_id);
    if (!db.fichas_tecnicas.some((x) => x.id === fichaId && x.ativo)) erro('Receita não encontrada ou inativa.');
    let itens = null;
    if ((p.itens || []).length) {
      itens = [];
      for (const it of p.itens) {
        if (!(Number(it.quantidade) > 0)) continue;
        if (prod(it.produto_id).categoria !== 'materia_prima') erro('A receita só aceita matéria-prima.');
        fator(it.produto_id, it.unidade);
        itens.push({ produto_id: Number(it.produto_id), quantidade: Number(it.quantidade), unidade: it.unidade });
      }
      if (!itens.length) erro('A receita alterada precisa de pelo menos 1 ingrediente.');
    }
    const id = numOuNull(p.id);
    if (!id) return inserir('programacoes', { data: p.data, ficha_id: fichaId, quantidade: qtd, itens_alterados: itens, observacao: txt(p.observacao),
      situacao: 'ativa', cancelado_motivo: null, criado_por: usuario, criado_em: agora().toISOString(), ...autoria() }, true).id;
    const reg = db.programacoes.find((x) => x.id === id) || erro('Programação não encontrada.');
    if (reg.situacao !== 'ativa') erro('Esta programação foi cancelada.');
    if (reg.finalizada_em) erro('Esta programação já foi finalizada.');
    const feito = db.producoes.filter((x) => x.programacao_id === id).reduce((s, x) => s + Number(x.multiplicador), 0);
    if (feito > 0 && (p.data !== reg.data || fichaId !== reg.ficha_id)) erro('Já houve baixa nesta programação: o dia e a receita não podem mudar. Programe o restante em outro dia.');
    if (qtd < feito) erro(`Já foram feitas ${f3(feito)} receitas desta programação; a quantidade não pode ficar menor.`);
    atualizar('programacoes', reg, { data: p.data, ficha_id: fichaId, quantidade: qtd, itens_alterados: itens, observacao: txt(p.observacao), ...autoria() });
    return id;
  },
  finalizar_programacao({ p_id, p_obs }) {
    exigir('programacao');
    const reg = db.programacoes.find((x) => x.id === Number(p_id) && x.situacao === 'ativa') || erro('Programação não encontrada ou cancelada.');
    if (reg.finalizada_em) erro('Esta programação já foi finalizada.');
    const feito = db.producoes.filter((x) => x.programacao_id === reg.id).reduce((s, x) => s + Number(x.multiplicador), 0);
    if (feito < reg.quantidade - 0.0005 && !txt(p_obs)) erro(`Foram feitas ${f3(feito)} de ${f3(reg.quantidade)} receitas: explique a diferença na observação.`);
    atualizar('programacoes', reg, { finalizada_em: agora().toISOString(), finalizada_por: usuario, finalizada_obs: txt(p_obs), ...autoria() });
  },
  financeiro_marcar({ p_pedido, p_lancado, p_obs }) {
    exigir('financeiro');
    const pe = db.pedidos.find((x) => x.id === Number(p_pedido)) || erro('Pedido não encontrado.');
    const quando = agora();
    const obs = txt(p_obs) ? [pe.fin_obs, `${String(quando.getDate()).padStart(2, '0')}/${String(quando.getMonth() + 1).padStart(2, '0')} ${txt(p_obs)}`].filter(Boolean).join(' | ') : pe.fin_obs;
    atualizar('pedidos', pe, p_lancado ? { fin_lancado: true, fin_lancado_em: quando.toISOString(), fin_lancado_por: usuario, fin_obs: obs }
      : { fin_lancado: false, fin_lancado_em: null, fin_lancado_por: null, fin_obs: obs });
  },
  ajustar_previsao_pagamento({ p_pedido, p_data, p_motivo }) {
    exigir('data_pagamento');
    const pe = db.pedidos.find((x) => x.id === Number(p_pedido)) || erro('Pedido não encontrado.');
    if (pe.status === 'cancelado') erro('Pedido cancelado.');
    if (!p_data) erro('Informe a nova data.');
    if (!txt(p_motivo)) erro('Informe o motivo da mudança.');
    if (p_data < pe.data_pedido) erro('A previsão de pagamento não pode ser antes da data do pedido.');
    if (p_data === pe.previsao_pagamento) return;
    const q = agora(), dd = (n) => String(n).padStart(2, '0'), br = (d) => (d ? d.split('-').reverse().join('/') : '–');
    const linha = `${dd(q.getDate())}/${dd(q.getMonth() + 1)} ${dd(q.getHours())}:${dd(q.getMinutes())} data ${br(pe.previsao_pagamento)} → ${br(p_data)}: ${txt(p_motivo)}`;
    atualizar('pedidos', pe, { previsao_pagamento: p_data, fin_obs: [pe.fin_obs, linha].filter(Boolean).join(' | '), ...autoria() });
  },
  custos_produtos() {
    exigir('custos');
    const ult = new Map();
    for (const m of db.movimentos) {
      if (!['entrada', 'implantacao'].includes(m.tipo) || !(Number(m.custo_unitario) > 0) || !(Number(m.quantidade) > 0)) continue;
      const a = ult.get(m.produto_id);
      if (a && (a.data_hora > m.data_hora || (a.data_hora === m.data_hora && a.id > m.id))) continue;
      ult.set(m.produto_id, m);
    }
    return [...ult.values()].map((m) => {
      const r = m.recebimento_id ? db.recebimentos.find((x) => x.id === m.recebimento_id) : null;
      const pi = m.pedido_item_id ? db.pedido_itens.find((x) => x.id === m.pedido_item_id) : null;
      const pe = pi ? db.pedidos.find((x) => x.id === pi.pedido_id) : null;
      return { produto_id: m.produto_id, ultimo_custo: Number(m.custo_unitario), ultima_data: m.data_hora, ultimo_tipo: m.tipo, ultima_qtd: Number(m.quantidade),
        fornecedor_id: r?.fornecedor_id || pe?.fornecedor_id || null, pedido_id: pi?.pedido_id || null };
    });
  },
  previsao_producao({ p_de, p_ate }) {
    exigir('previsao_producao');
    if (!p_de || !p_ate || p_ate < p_de) erro('Período inválido.');
    const m = new Map();
    for (const pg of db.programacoes.filter((x) => x.situacao === 'ativa' && x.data >= p_de && x.data <= p_ate)) {
      const f = db.fichas_tecnicas.find((x) => x.id === pg.ficha_id);
      const k = `${pg.data}|${f.id}`;
      const a = m.get(k) || { data: pg.data, ficha_id: f.id, codigo: f.codigo, nome: f.nome, produto_final: f.produto_final, receitas: 0, receitas_pesadas: 0,
        rendimento_qtd: f.rendimento_qtd ?? null, rendimento_unidade: f.rendimento_unidade || null, previsto: null, finalizada: true };
      a.receitas = r4(a.receitas + Number(pg.quantidade));
      a.receitas_pesadas = r4(a.receitas_pesadas + db.producoes.filter((x) => x.programacao_id === pg.id).reduce((s, x) => s + Number(x.multiplicador), 0));
      a.finalizada = a.finalizada && !!pg.finalizada_em;
      m.set(k, a);
    }
    return [...m.values()].map((a) => ({ ...a, previsto: a.rendimento_qtd === null ? null : r4(a.receitas * a.rendimento_qtd) }))
      .sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome));
  },
  registrar_acesso({ p_evento, p_detalhe, p_agente }) {
    if (!usuario) erro('Sem sessão.');
    if (!['entrada', 'saida', 'ver_como', 'senha_trocada'].includes(p_evento)) erro('Evento inválido.');
    if (p_evento === 'ver_como' && !papeis().includes('admin')) erro('Só o administrador usa "ver como".');
    inserir('acessos', { data_hora: agora().toISOString(), usuario_id: usuario, evento: p_evento, detalhe: txt(p_detalhe), agente: txt(p_agente) });
  },
  cancelar_programacao({ p_id, p_motivo }) {
    exigir('programacao');
    if (!txt(p_motivo)) erro('Informe o motivo do cancelamento.');
    const reg = db.programacoes.find((x) => x.id === Number(p_id) && x.situacao === 'ativa' && !x.finalizada_em) || erro('Programação não encontrada, já cancelada ou já finalizada.');
    atualizar('programacoes', reg, { situacao: 'cancelada', cancelado_motivo: String(p_motivo).trim(), ...autoria() });
  },
  registrar_saida({ p }) {
    if (!['saida_avulsa', 'saida_almox'].includes(p.tipo)) erro('Tipo de saída inválido.');
    exigir(p.tipo);
    if (p.tipo === 'saida_avulsa' && !txt(p.observacao)) erro('Na saída avulsa a observação (justificativa) é obrigatória.');
    let n = 0;
    for (const it of p.itens || []) {
      if (p.tipo === 'saida_avulsa' && prod(it.produto_id).categoria !== 'materia_prima') erro('Saída avulsa da pesagem só aceita matéria-prima.');
      const q = Number(it.quantidade || 0) * fator(it.produto_id, it.unidade);
      if (q < 0) erro('Quantidade não pode ser negativa.');
      if (!q) continue;
      movimentar(it.produto_id, p.tipo, -q, null, { qtd_informada: it.quantidade, unidade_informada: it.unidade,
        observacao: txt(it.observacao) || txt(p.observacao), destino: p.destino, motivo: p.motivo });
      n++;
    }
    if (!n) erro('Nenhuma quantidade informada.');
    return n;
  },
  registrar_inventario({ p }) {
    exigir('inventario');
    const inv = inserir('inventarios', { data_hora: agora().toISOString(), observacao: txt(p.observacao), usuario_id: usuario });
    let n = 0;
    for (const it of p.itens || []) {
      if (it.contado === null || it.contado === undefined || it.contado === '') continue;
      const pr = prod(it.produto_id);
      const cont = r4(Number(it.contado) * fator(pr.id, it.unidade));
      if (cont < 0) erro(`Quantidade contada não pode ser negativa (${pr.codigo}).`);
      const dif = r4(cont - pr.saldo);
      if (dif !== 0 && !txt(it.motivo)) erro(`Informe o motivo da diferença do item ${pr.codigo} (${pr.descricao}).`);
      if (it.motivo === 'outros' && !txt(it.observacao)) erro(`Motivo "outros": escreva a observação do item ${pr.codigo} (${pr.descricao}).`);
      inserir('inventario_itens', { inventario_id: inv.id, produto_id: pr.id, saldo_sistema: pr.saldo, contado: cont, diferenca: dif,
        motivo: dif !== 0 ? txt(it.motivo) : null, observacao: txt(it.observacao) });
      if (dif !== 0) movimentar(pr.id, 'inventario', dif, null, { inventario_id: inv.id, motivo: it.motivo, observacao: it.observacao,
        qtd_informada: it.contado, unidade_informada: it.unidade });
      n++;
    }
    if (!n) erro('Nenhum item contado.');
    return inv.id;
  },
  corrigir_movimento({ p_id, p_quantidade_correta, p_unidade, p_motivo }) {
    if (!perfil()) erro('Usuário inativo.');
    if (!txt(p_motivo)) erro('Informe o motivo da correção.');
    const o = db.movimentos.find((m) => m.id === Number(p_id)) || erro('Lançamento não encontrado.');
    if (o.tipo === 'correcao') erro('Corrija o lançamento original, não a correção.');
    const proprio = o.usuario_id === usuario && iso(new Date(o.data_hora)) === hoje()
      && ['entrada', 'saida_receita', 'saida_avulsa', 'saida_almox'].includes(o.tipo);
    if (['implantacao', 'inventario'].includes(o.tipo)) { if (!papeis().includes('admin')) erro('Só o administrador corrige implantação de saldo e inventário.'); }
    else if (!(pode('corrigir') || proprio)) erro('Sem permissão: você só pode corrigir os seus próprios lançamentos do dia.');
    const qc = numOuNull(p_quantidade_correta);
    if (qc === null || qc < 0) erro('Informe a quantidade correta (zero se o lançamento não deveria existir).');
    const efetiva = o.quantidade + db.movimentos.filter((c) => c.corrige_id === o.id).reduce((s, c) => s + c.quantidade, 0);
    const nova = Math.sign(o.quantidade) * qc * fator(o.produto_id, p_unidade);
    const delta = r4(nova - efetiva);
    if (delta === 0) erro('A quantidade informada é igual à atual; nada a corrigir.');
    const pr = prod(o.produto_id);
    const f3 = (v) => String(Math.round(Math.abs(v) * 1000) / 1000);
    const id = movimentar(o.produto_id, 'correcao', delta, o.quantidade > 0 ? o.custo_unitario : null, {
      corrige_id: o.id, motivo: p_motivo, observacao: `Corrige lançamento #${o.id}: de ${f3(efetiva)} para ${f3(nova)} ${pr.unidade_estoque}` });
    if (o.pedido_item_id) {
      const pi = db.pedido_itens.find((x) => x.id === o.pedido_item_id);
      pi.qtd_recebida_base = Math.max(r4(pi.qtd_recebida_base + delta), 0);
      statusPedido(pi.pedido_id);
    }
    return id;
  },
  implantar_saldo({ p }) {
    exigir('implantacao');
    let n = 0;
    for (const it of p.itens || []) {
      const f = fator(it.produto_id, it.unidade);
      const q = Number(it.quantidade || 0) * f;
      if (q < 0) erro('Quantidade não pode ser negativa.');
      if (!q) continue;
      movimentar(it.produto_id, 'implantacao', q, Number(it.custo_unitario || 0) / f,
        { observacao: txt(p.observacao) || 'Implantação de saldo', qtd_informada: it.quantidade, unidade_informada: it.unidade });
      n++;
    }
    if (!n) erro('Nenhuma quantidade informada.');
    return n;
  },
  salvar_perfil({ p }) {
    exigir('usuarios');
    if (p.user_id === usuario && (p.ativo === false || !(p.papeis || []).includes('admin'))) erro('Você não pode desativar nem tirar o papel de administrador de si mesmo.');
    const reg = db.perfis.find((x) => x.user_id === p.user_id) || erro('Usuário não encontrado.');
    atualizar('perfis', reg, { nome: txt(p.nome) || reg.nome, funcao: txt(p.funcao), papeis: [...(p.papeis || [])], ativo: !!p.ativo });
  },
  salvar_parametros({ p }) {
    exigir('parametros');
    for (const [k, v] of Object.entries(p)) {
      const reg = db.parametros.find((x) => x.chave === k);
      if (reg) atualizar('parametros', reg, { valor: v });
    }
  },
  importar_cadastros({ p }) {
    exigir('importacao');
    const r = { fornecedores_novos: 0, fornecedores_atualizados: 0, produtos_novos: 0, produtos_atualizados: 0, receitas_novas: 0, receitas_atualizadas: 0, saldos_implantados: 0 };
    const linha = (aba, l, fn) => { try { return fn(); } catch (e) { erro(`Aba ${aba}, linha ${l}: ${e.message}`); } };
    const soDig = (x) => String(x || '').replace(/\D/g, '');
    for (const it of p.fornecedores || []) linha('Fornecedores', it.linha, () => {
      const ex = db.fornecedores.find((f) => (txt(it.cnpj) && soDig(f.cnpj) === soDig(it.cnpj)) || f.nome.toLowerCase() === String(it.nome || '').trim().toLowerCase());
      RPC.salvar_fornecedor({ p: { ...it, id: ex?.id || null } }); r[ex ? 'fornecedores_atualizados' : 'fornecedores_novos']++;
    });
    for (const it of p.produtos || []) linha('Produtos', it.linha, () => {
      let forn = null;
      if (txt(it.fornecedor)) { forn = db.fornecedores.find((f) => f.nome.toLowerCase() === it.fornecedor.trim().toLowerCase()); if (!forn) erro(`fornecedor "${it.fornecedor}" não está cadastrado.`); }
      const ex = db.produtos.find((x) => x.codigo.toLowerCase() === String(it.codigo || '').trim().toLowerCase());
      RPC.salvar_produto({ p: { ...it, id: ex?.id || null, fornecedor_padrao_id: forn?.id || null } }); r[ex ? 'produtos_atualizados' : 'produtos_novos']++;
    });
    for (const it of p.receitas || []) {
      const itens = (it.itens || []).map((g) => linha('Receitas', g.linha, () => {
        const pr = db.produtos.find((x) => x.codigo.toLowerCase() === String(g.codigo_produto || '').trim().toLowerCase());
        if (!pr) erro(`ingrediente com código "${g.codigo_produto}" não está cadastrado.`);
        return { produto_id: pr.id, quantidade: g.quantidade, unidade: g.unidade };
      }));
      linha('Receitas', it.linha, () => {
        const ex = db.fichas_tecnicas.find((f) => f.codigo.toLowerCase() === String(it.codigo || '').trim().toLowerCase());
        RPC.salvar_ficha({ p: { ...it, id: ex?.id || null, itens } }); r[ex ? 'receitas_atualizadas' : 'receitas_novas']++;
      });
    }
    for (const it of p.saldos || []) linha('Saldo inicial', it.linha, () => {
      const pr = db.produtos.find((x) => x.codigo.toLowerCase() === String(it.codigo_produto || '').trim().toLowerCase());
      if (!pr) erro(`produto com código "${it.codigo_produto}" não está cadastrado.`);
      RPC.implantar_saldo({ p: { observacao: 'Implantação de saldo (planilha)', itens: [{ produto_id: pr.id, quantidade: it.quantidade, unidade: it.unidade, custo_unitario: it.custo_unitario }] } });
      r.saldos_implantados++;
    });
    return r;
  },
  estatisticas_estoque({ p_janela }) {
    if (!perfil()) erro('Usuário inativo.');
    if (!papeis().some((x) => AMPLOS.includes(x))) return [];
    return calcularEstatisticas({ produtos: db.produtos, movimentos: db.movimentos, pedidos: db.pedidos,
      pedidoItens: db.pedido_itens, janela: Number(p_janela || 90), hoje: hoje() });
  },
  // só no modo demonstração: cria um login de teste
  demo_criar_usuario({ usuario: u, nome, funcao }) {
    exigir('usuarios');
    if (!txt(u)) erro('Informe o usuário.');
    if (db.perfis.some((x) => x.usuario === u.toLowerCase())) erro('Usuário já existe.');
    const reg = { user_id: 'u-' + u.toLowerCase(), usuario: u.toLowerCase(), nome: txt(nome) || u, funcao: txt(funcao), papeis: [], ativo: false, criado_em: agora().toISOString() };
    db.perfis.push(reg);
    aud('perfis', 'INSERT', null, reg);
  },
};

// ------------------------------- DADOS DE EXEMPLO ---------------------
function semente() {
  db = { seq: {} };
  for (const t of ['perfis', 'parametros', 'fornecedores', 'produtos', 'fichas_tecnicas', 'fichas_historico', 'ficha_itens', 'pedidos', 'pedido_itens',
    'recebimentos', 'programacoes', 'producoes', 'inventarios', 'inventario_itens', 'movimentos', 'auditoria', 'acessos']) db[t] = [];
  db.versao_banco = [{ versao: '1.0.0', descricao: 'Instalação inicial', aplicada_em: agora().toISOString() },
    { versao: '1.1.0', descricao: 'Financeiro, previsão de produção e perfil faturamento', aplicada_em: agora().toISOString() },
    { versao: '1.2.0', descricao: 'Gestão de custos e últimas compras', aplicada_em: agora().toISOString() }];

  const P = [
    ['empresa_nome', 'Indústria e Comércio de Pães São Sebastião', 'Nome no cabeçalho do pedido de compra'],
    ['empresa_cnpj', '', 'CNPJ no cabeçalho do pedido'],
    ['empresa_endereco', 'Franca/SP', 'Endereço no cabeçalho do pedido'],
    ['empresa_telefone', '', 'Telefone no cabeçalho do pedido'],
    ['pedido_rodape', 'Favor informar o número do pedido na nota fiscal.', 'Texto no rodapé do pedido'],
    ['permitir_saldo_negativo', 'sim', 'sim = deixa dar saída mesmo sem saldo (fica alerta); nao = bloqueia'],
    ['janela_consumo_dias', '90', 'Quantos dias para trás usar na média de consumo'],
    ['dias_minimos_calculo', '30', 'Dias de uso necessários para mostrar o estoque mínimo calculado'],
    ['nivel_servico_z', '1.65', 'Fator de segurança (1,65 = 95% de chance de não faltar)'],
    ['ciclo_compra_dias', '30', 'Para quantos dias de consumo a sugestão de compra deve abastecer'],
    ['prazo_entrega_padrao', '7', 'Prazo de entrega (dias) usado quando não há histórico nem cadastro'],
    ['usar_minimo', 'definido', 'Qual mínimo usar nos alertas: definido, calculado ou maior'],
  ];
  db.parametros = P.map(([chave, valor, descricao]) => ({ chave, valor, descricao }));

  const U = [
    ['ithalo', 'Ithalo', 'Controladoria', 'admin'], ['comprador', 'Ivan', 'Comprador', 'comprador'],
    ['carlos', 'Carlos', 'Responsável do almoxarifado', 'almoxarifado'], ['recebimento', 'Assistente', 'Assistente de almoxarifado', 'recebimento'],
    ['pesagem', 'Nayara', 'Responsável da pesagem', 'pesagem'], ['auxpesagem', 'Sheila', 'Auxiliar de pesagem', 'pesagem'],
    ['juliano', 'Juliano', 'Engenheiro de produção', 'engenharia'], ['abner', 'Abner', 'Gerente de produção', 'engenharia'],
    ['diretoria', 'Eduardo', 'Diretor', 'diretoria'], ['leonardo', 'Leonardo', 'Diretor', 'diretoria'],
    ['financeiro', 'Financeiro', 'Contas a pagar', 'financeiro'], ['faturamento', 'Faturamento', 'Faturamento', 'faturamento'],
  ];
  db.perfis = U.map(([u, nome, funcao, pap]) => ({ user_id: 'u-' + u, usuario: u, nome, funcao, papeis: [pap], ativo: true, criado_em: new Date().toISOString() }));

  const base = new Date(); base.setHours(0, 0, 0, 0);
  const dia = (d, h = 9, m = 0) => { const x = new Date(base); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
  const como = (u, d, h, fn) => { usuario = 'u-' + u; relogio = dia(d, h); return fn(); };

  // cadastros
  const F = {};
  como('comprador', -61, 8, () => {
    F.moinho = RPC.salvar_fornecedor({ p: { nome: 'Moinho Exemplo Ltda', razao_social: 'Moinho Exemplo Indústria de Farinhas Ltda', cnpj: '00.000.000/0001-00', prazo_entrega_dias: 10, contato: 'Vendas', telefone: '(16) 0000-0000', whatsapp: '(16) 90000-0000', cidade: 'Franca', uf: 'SP', condicao_pagamento: '28 dias' } });
    F.ferm = RPC.salvar_fornecedor({ p: { nome: 'Fermentos Exemplo S.A.', prazo_entrega_dias: 7 } });
    F.alim = RPC.salvar_fornecedor({ p: { nome: 'Atacadista de Alimentos Exemplo', prazo_entrega_dias: 5 } });
    F.emb = RPC.salvar_fornecedor({ p: { nome: 'Embalagens Exemplo Ind.', prazo_entrega_dias: 15 } });
    F.esc = RPC.salvar_fornecedor({ p: { nome: 'Papelaria e Limpeza Exemplo', prazo_entrega_dias: 4 } });
  });
  const PR = {};
  const GRUPO = { MP001: ['Farinha', 'A', 'Moinho Exemplo'], MP009: ['Farinha', 'A', 'Marca Y'], MP010: ['Farinha', 'B', 'Marca Z'], MP002: ['Farinha integral', null, 'Moinho Exemplo'],
    MP003: ['Fermento', null, null], MP004: ['Melhorador', null, null], MP005: ['Açúcar', null, null], MP006: ['Sal', null, null], MP007: ['Gordura', null, null],
    MP008: ['Leite', null, null], EM001: ['Bobina', null, null], EM002: ['Bobina', null, null], EM003: ['Saco', null, null], EM004: ['Etiqueta', null, null],
    ES001: ['Papel', null, null], LI001: ['Detergente', null, null] };
  const novoP = (k, codigo, descricao, categoria, ue, uc, fat, min, forn) =>
    (PR[k] = RPC.salvar_produto({ p: { codigo, descricao, categoria, unidade_estoque: ue, unidade_compra: uc, fator_compra: fat, estoque_minimo: min, fornecedor_padrao_id: forn,
      grupo: GRUPO[codigo]?.[0], classificacao: GRUPO[codigo]?.[1], marca: GRUPO[codigo]?.[2] } }));
  como('comprador', -61, 9, () => {
    novoP('far', 'MP001', 'Farinha de trigo tipo A Moinho Exemplo', 'materia_prima', 'kg', 'saco', 25, 2500, F.moinho);
    novoP('farY', 'MP009', 'Farinha de trigo tipo A Marca Y', 'materia_prima', 'kg', 'saco', 25, null, F.moinho);
    novoP('farB', 'MP010', 'Farinha de trigo tipo B Marca Z', 'materia_prima', 'kg', 'saco', 25, 600, F.moinho);
    novoP('int', 'MP002', 'Farinha de trigo integral', 'materia_prima', 'kg', 'saco', 25, 300, F.moinho);
    novoP('fer', 'MP003', 'Fermento biológico seco', 'materia_prima', 'kg', 'caixa', 10, 30, F.ferm);
    novoP('mel', 'MP004', 'Melhorador de farinha', 'materia_prima', 'kg', 'caixa', 10, 15, F.ferm);
    novoP('acu', 'MP005', 'Açúcar refinado', 'materia_prima', 'kg', 'fardo', 30, 250, F.alim);
    novoP('sal', 'MP006', 'Sal refinado', 'materia_prima', 'kg', 'fardo', 30, 60, F.alim);
    novoP('gor', 'MP007', 'Gordura vegetal', 'materia_prima', 'kg', 'caixa', 24, 120, F.alim);
    novoP('lei', 'MP008', 'Leite em pó', 'materia_prima', 'kg', 'saco', 25, 60, F.alim);
    novoP('bf', 'EM001', 'Bobina pão de forma 500 g', 'embalagem', 'kg', 'bobina', 5, 40, F.emb);
    novoP('bb', 'EM002', 'Bobina bisnaguinha', 'embalagem', 'kg', 'bobina', 10, 30, F.emb);
    novoP('sf', 'EM003', 'Saco pão francês', 'embalagem', 'un', 'fardo', 1000, 4000, F.emb);
    novoP('eti', 'EM004', 'Etiqueta adesiva validade', 'embalagem', 'rolo', 'caixa', 12, 12, F.emb);
    novoP('a4', 'ES001', 'Papel A4', 'escritorio', 'resma', 'caixa', 10, 5, F.esc);
    novoP('det', 'LI001', 'Detergente neutro 5 L', 'limpeza', 'galão', 'caixa', 4, 6, F.esc);
  });
  const FT = {};
  como('juliano', -61, 10, () => {
    FT.forma = RPC.salvar_ficha({ p: { codigo: 'R001', nome: 'Pão de forma tradicional', produto_final: 'Pão de forma 500 g', rendimento: '180 pacotes', itens: [
      { produto_id: PR.far, quantidade: 50, unidade: 'kg' }, { produto_id: PR.fer, quantidade: 600, unidade: 'g' },
      { produto_id: PR.mel, quantidade: 250, unidade: 'g' }, { produto_id: PR.acu, quantidade: 3, unidade: 'kg' },
      { produto_id: PR.sal, quantidade: 1, unidade: 'kg' }, { produto_id: PR.gor, quantidade: 2, unidade: 'kg' },
      { produto_id: PR.lei, quantidade: 1, unidade: 'kg' }] } });
    FT.frances = RPC.salvar_ficha({ p: { codigo: 'R002', nome: 'Pão francês', produto_final: 'Pão francês', rendimento: '1.000 unidades', itens: [
      { produto_id: PR.far, quantidade: 35, unidade: 'kg' }, { produto_id: PR.farB, quantidade: 15, unidade: 'kg' }, { produto_id: PR.fer, quantidade: 500, unidade: 'g' },
      { produto_id: PR.mel, quantidade: 300, unidade: 'g' }, { produto_id: PR.sal, quantidade: 1, unidade: 'kg' },
      { produto_id: PR.acu, quantidade: 500, unidade: 'g' }] } });
    FT.bisna = RPC.salvar_ficha({ p: { codigo: 'R003', nome: 'Bisnaguinha', produto_final: 'Bisnaguinha 300 g', rendimento: '120 pacotes', itens: [
      { produto_id: PR.far, quantidade: 25, unidade: 'kg' }, { produto_id: PR.acu, quantidade: 4, unidade: 'kg' },
      { produto_id: PR.gor, quantidade: 3, unidade: 'kg' }, { produto_id: PR.fer, quantidade: 400, unidade: 'g' },
      { produto_id: PR.lei, quantidade: 1, unidade: 'kg' }, { produto_id: PR.sal, quantidade: 400, unidade: 'g' }] } });
    FT.integral = RPC.salvar_ficha({ p: { codigo: 'R004', nome: 'Pão integral', produto_final: 'Pão integral 500 g', rendimento: '100 pacotes', itens: [
      { produto_id: PR.int, quantidade: 30, unidade: 'kg' }, { produto_id: PR.far, quantidade: 20, unidade: 'kg' },
      { produto_id: PR.fer, quantidade: 600, unidade: 'g' }, { produto_id: PR.acu, quantidade: 2, unidade: 'kg' },
      { produto_id: PR.sal, quantidade: 1, unidade: 'kg' }, { produto_id: PR.gor, quantidade: 1.5, unidade: 'kg' }] } });
  });

  // saldo inicial (60 dias atrás)
  como('ithalo', -60, 7, () => RPC.implantar_saldo({ p: { observacao: 'Implantação de saldo (contagem inicial)', itens: [
    { produto_id: PR.far, quantidade: 200, unidade: 'saco', custo_unitario: 115 },
    { produto_id: PR.int, quantidade: 24, unidade: 'saco', custo_unitario: 140 },
    { produto_id: PR.farY, quantidade: 40, unidade: 'saco', custo_unitario: 112 },
    { produto_id: PR.farB, quantidade: 50, unidade: 'saco', custo_unitario: 98 },
    { produto_id: PR.fer, quantidade: 10, unidade: 'caixa', custo_unitario: 320 },
    { produto_id: PR.mel, quantidade: 4, unidade: 'caixa', custo_unitario: 410 },
    { produto_id: PR.acu, quantidade: 20, unidade: 'fardo', custo_unitario: 135 },
    { produto_id: PR.sal, quantidade: 8, unidade: 'fardo', custo_unitario: 42 },
    { produto_id: PR.gor, quantidade: 14, unidade: 'caixa', custo_unitario: 260 },
    { produto_id: PR.lei, quantidade: 7, unidade: 'saco', custo_unitario: 610 },
    { produto_id: PR.bf, quantidade: 52, unidade: 'bobina', custo_unitario: 92 },
    { produto_id: PR.bb, quantidade: 15, unidade: 'bobina', custo_unitario: 170 },
    { produto_id: PR.sf, quantidade: 25, unidade: 'fardo', custo_unitario: 85 },
    { produto_id: PR.eti, quantidade: 2, unidade: 'caixa', custo_unitario: 96 },
    { produto_id: PR.a4, quantidade: 1, unidade: 'caixa', custo_unitario: 260 },
    { produto_id: PR.det, quantidade: 3, unidade: 'caixa', custo_unitario: 120 },
  ] } }));

  // pedidos (dia do pedido, dia da entrega, itens) — entrega null = ainda não chegou
  const pedidos = [
    { d: -56, prev: 10, forn: F.moinho, itens: [[PR.far, 250, 'saco', 118]], ent: [[-46, 1]] },
    { d: -52, prev: 7, forn: F.ferm, itens: [[PR.fer, 10, 'caixa', 325], [PR.mel, 4, 'caixa', 415]], ent: [[-44, 1]] },
    { d: -48, prev: 5, forn: F.alim, itens: [[PR.acu, 20, 'fardo', 138], [PR.lei, 7, 'saco', 615], [PR.gor, 14, 'caixa', 265], [PR.sal, 7, 'fardo', 43]], ent: [[-42, 1]] },
    { d: -45, prev: 10, forn: F.moinho, itens: [[PR.far, 250, 'saco', 119], [PR.int, 22, 'saco', 141]], ent: [[-35, 1]] },
    { d: -40, prev: 15, forn: F.emb, itens: [[PR.bf, 40, 'bobina', 95], [PR.bb, 22, 'bobina', 172], [PR.sf, 33, 'fardo', 86]], ent: [[-24, 1]] },
    { d: -36, prev: 10, forn: F.moinho, itens: [[PR.far, 250, 'saco', 121], [PR.farB, 60, 'saco', 100]], ent: [[-25, 1]] },
    { d: -30, prev: 7, forn: F.ferm, itens: [[PR.fer, 12, 'caixa', 330], [PR.mel, 4, 'caixa', 415]],
      ent: [[-22, 1, { quem: 'carlos', preco: { [PR.fer]: 342 }, ressalva: 'Nota veio com preço maior. Liguei para o comprador e ele mandou receber.', ciencia: -21 }]] },
    { d: -24, prev: 5, forn: F.alim, itens: [[PR.acu, 20, 'fardo', 140], [PR.sal, 6, 'fardo', 44], [PR.gor, 14, 'caixa', 268], [PR.lei, 7, 'saco', 618]],
      ent: [[-18, 1, { mais: { [PR.acu]: 1 } , ressalva: 'Veio 1 fardo de açúcar a mais. Avisei o comprador por WhatsApp e ele autorizou receber.' }]] },
    { d: -21, prev: 10, forn: F.moinho, itens: [[PR.far, 150, 'saco', 124]], ent: [[-10, 0.66]] },
    { d: -9, prev: 3, forn: F.moinho, itens: [[PR.int, 20, 'saco', 143]],
      ent: [[-2, 1, { mais: { [PR.int]: 2 }, ressalva: 'Chegaram 22 sacos. Comprador autorizou por WhatsApp; a produção precisava.' }]] },
    { d: -14, prev: 7, forn: F.alim, itens: [[PR.lei, 6, 'saco', 620]], ent: [] },
    { d: -11, prev: 7, forn: F.ferm, itens: [[PR.fer, 8, 'caixa', 335]], ent: [] },
    { d: -4, prev: 15, forn: F.emb, itens: [[PR.bf, 30, 'bobina', 96], [PR.eti, 4, 'caixa', 98]], ent: [] },
    { d: -1, prev: 4, forn: F.esc, itens: [[PR.a4, 1, 'caixa', 265], [PR.det, 2, 'caixa', 122]], ent: [] },
  ];
  const agenda = [];
  for (const pd of pedidos) {
    agenda.push({ d: pd.d, h: 10, fn: () => como('comprador', pd.d, 10, () => {
      pd.id = RPC.salvar_pedido({ p: { fornecedor_id: pd.forn, data_pedido: hoje(), previsao_entrega: iso(new Date(dia(pd.d + pd.prev))),
        condicao_pagamento: '28 dias', previsao_pagamento: iso(new Date(dia(pd.d + pd.prev + 28))), itens: pd.itens.map(([produto_id, quantidade, unidade, preco_unitario]) => ({ produto_id, quantidade, unidade, preco_unitario })) } });
    }) });
    for (const [de, frac, div] of pd.ent) {
      agenda.push({ d: de, h: 8, fn: () => como(div?.quem || 'recebimento', de, 8, () => {
        const its = db.pedido_itens.filter((x) => x.pedido_id === pd.id);
        const rid = RPC.registrar_recebimento({ p: { pedido_id: pd.id, nota_fiscal: String(10000 + pd.id * 7), observacao: div?.ressalva,
          comprador_avisado: !!div, itens: its.map((x) => ({ produto_id: x.produto_id, pedido_item_id: x.id,
            quantidade: Math.round(x.quantidade * frac) + (div?.mais?.[x.produto_id] || 0), unidade: x.unidade,
            preco_nota: div?.preco?.[x.produto_id] })) } });
        if (div?.ciencia) agenda.push({ d: div.ciencia, h: 14, fn: () => como('comprador', div.ciencia, 14,
          () => RPC.dar_ciencia_divergencia({ p_recebimento: rid, p_obs: 'Ciente. Autorizei por telefone.' })) });
      }) });
    }
  }
  agenda.push({ d: -15, h: 11, fn: () => como('carlos', -15, 11, () => RPC.registrar_recebimento({ p: { fornecedor_id: F.esc, nota_fiscal: '5531',
    observacao: 'Compra emergencial no balcão', itens: [{ produto_id: PR.det, quantidade: 1, unidade: 'caixa', custo_unitario: 130 }] } })) });
  agenda.push({ d: -7, h: 16, fn: () => como('carlos', -7, 16, () => RPC.registrar_inventario({ p: { observacao: 'Contagem semanal matéria-prima',
    itens: [{ produto_id: PR.fer, contado: Math.max(0, Math.round(prod(PR.fer).saldo - 2)), unidade: 'kg', motivo: 'avariado', observacao: 'Embalagem rasgada' },
      { produto_id: PR.sal, contado: prod(PR.sal).saldo, unidade: 'kg' }] } })) });

  // consumo diário (gerador com semente fixa para sempre dar o mesmo exemplo)
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  for (let d = -60; d <= -1; d++) {
    const dom = new Date(dia(d)).getDay() === 0;
    const qtdForma = dom ? 1 : 3 + Math.round(rnd() * 3);
    const qtdFrances = dom ? 1 : 2 + Math.round(rnd() * 2);
    const qtdBisna = dom ? 0 : 1 + Math.round(rnd() * 2);
    const qtdInt = dom ? 0 : Math.round(rnd() * 1.4);
    const prog = {};
    if (d >= -10) agenda.push({ d: d - 1, h: 16, fn: () => como('juliano', d - 1, 16, () => {
      const dataProd = iso(new Date(dia(d)));
      [[FT.forma, qtdForma], [FT.frances, qtdFrances], [FT.bisna, qtdBisna], [FT.integral, qtdInt]].forEach(([fid, q], k) => {
        const extra = (d === -2 && k === 0) ? 2 : (d === -5 && k === 1) ? 1 : 0;   // dias em que a pesagem fez menos que o programado
        if (q + extra > 0) prog[fid] = RPC.salvar_programacao({ p: { data: dataProd, ficha_id: fid, quantidade: q + extra } });
      });
    }) });
    // a engenharia confere e finaliza no dia seguinte (ontem fica pendente, para mostrar o lembrete)
    if (d >= -10 && d <= -2) agenda.push({ d: d + 1, h: 9, fn: () => como('juliano', d + 1, 9, () => Object.values(prog).forEach((id) => {
      try { RPC.finalizar_programacao({ p_id: id, p_obs: 'Conferido com a pesagem' }); } catch { /* já finalizada */ }
    })) });
    agenda.push({ d, h: 6, fn: () => {
      const u = rnd() > 0.5 ? 'pesagem' : 'auxpesagem';
      const pr = (fid, q, h) => como(u, d, h, () => RPC.registrar_producao({ p: { ficha_id: fid, multiplicador: q, programacao_id: prog[fid] || null } }));
      if (qtdForma) pr(FT.forma, qtdForma, 6);
      if (qtdFrances) pr(FT.frances, qtdFrances, 6);
      if (qtdBisna) pr(FT.bisna, qtdBisna, 7);
      if (qtdInt) pr(FT.integral, qtdInt, 7);
      if (!dom) como('carlos', d, 13, () => RPC.registrar_saida({ p: { tipo: 'saida_almox', destino: 'Embalagem / Expedição', itens: [
        { produto_id: PR.bf, quantidade: qtdForma > 4 ? 2 : 1, unidade: 'bobina' },
        ...(qtdBisna ? [{ produto_id: PR.bb, quantidade: qtdBisna > 2 ? 1 : (rnd() > 0.5 ? 1 : 0), unidade: 'bobina' }] : []),
        { produto_id: PR.sf, quantidade: qtdFrances * 300, unidade: 'un' },
        ...(rnd() > 0.7 ? [{ produto_id: PR.eti, quantidade: 1, unidade: 'rolo' }] : []),
      ].filter((x) => x.quantidade > 0) } }));
      if (d % 9 === 0) como('carlos', d, 15, () => RPC.registrar_saida({ p: { tipo: 'saida_almox', destino: 'Escritório', itens: [{ produto_id: PR.a4, quantidade: 1, unidade: 'resma' }] } }));
      if (d % 6 === 0) como('carlos', d, 15, () => RPC.registrar_saida({ p: { tipo: 'saida_almox', destino: 'Limpeza', itens: [{ produto_id: PR.det, quantidade: 1, unidade: 'galão' }] } }));
    } });
  }
  // um engano corrigido + uma substituição de farinha
  agenda.push({ d: -9, h: 9, fn: () => {
    const id = como('pesagem', -9, 9, () => { RPC.registrar_saida({ p: { tipo: 'saida_avulsa', observacao: 'Massa caiu no chão', itens: [{ produto_id: PR.far, quantidade: 10, unidade: 'kg' }] } });
      return db.movimentos[db.movimentos.length - 1].id; });
    como('pesagem', -9, 9, () => RPC.corrigir_movimento({ p_id: id, p_quantidade_correta: 6, p_unidade: 'kg', p_motivo: 'Digitei 10 em vez de 6' }));
  } });
  agenda.push({ d: -20, h: 15, fn: () => como('juliano', -20, 15, () => {
    const its = db.ficha_itens.filter((x) => x.ficha_id === FT.forma).map((x) => ({ produto_id: x.produto_id, quantidade: x.produto_id === PR.fer ? 0.65 : x.quantidade, unidade: 'kg' }));
    RPC.salvar_ficha({ p: { ...db.fichas_tecnicas.find((f) => f.id === FT.forma), itens: its } });
  }) });
  agenda.push({ d: -3, h: 7, fn: () => como('pesagem', -3, 7, () => RPC.registrar_producao({ p: { ficha_id: FT.forma, multiplicador: 2, alterada: true,
    observacao: 'Substituição: farinha especial trocada por integral (faltou no turno)', itens: [
      { produto_id: PR.int, quantidade: 50, unidade: 'kg' }, { produto_id: PR.fer, quantidade: 600, unidade: 'g' },
      { produto_id: PR.mel, quantidade: 250, unidade: 'g' }, { produto_id: PR.acu, quantidade: 3, unidade: 'kg' },
      { produto_id: PR.sal, quantidade: 1, unidade: 'kg' }, { produto_id: PR.gor, quantidade: 2, unidade: 'kg' }, { produto_id: PR.lei, quantidade: 1, unidade: 'kg' }] } })) });

  // programação de hoje (parte já pesada) e de amanhã
  agenda.push({ d: -1, h: 17, fn: () => como('juliano', -1, 17, () => {
    const h0 = iso(new Date(dia(0))), h1 = iso(new Date(dia(1)));
    const a = RPC.salvar_programacao({ p: { data: h0, ficha_id: FT.forma, quantidade: 6, observacao: 'Pedido extra do atacado' } });
    RPC.salvar_programacao({ p: { data: h0, ficha_id: FT.frances, quantidade: 4, observacao: 'Hoje só farinha tipo A (tipo B acabando)',
      itens: db.ficha_itens.filter((x) => x.ficha_id === FT.frances && x.produto_id !== PR.farB)
        .map((x) => ({ produto_id: x.produto_id, quantidade: x.produto_id === PR.far ? 50 : x.quantidade, unidade: prod(x.produto_id).unidade_estoque })) } });
    RPC.salvar_programacao({ p: { data: h0, ficha_id: FT.bisna, quantidade: 2 } });
    RPC.salvar_programacao({ p: { data: h1, ficha_id: FT.forma, quantidade: 5 } });
    RPC.salvar_programacao({ p: { data: h1, ficha_id: FT.frances, quantidade: 4 } });
    RPC.salvar_programacao({ p: { data: h1, ficha_id: FT.integral, quantidade: 1 } });
    agenda.push({ d: 0, h: 6, fn: () => como('pesagem', 0, 6, () => RPC.registrar_producao({ p: { programacao_id: a, multiplicador: 2 } })) });
    const h2 = iso(new Date(dia(2)));
    RPC.salvar_programacao({ p: { data: h2, ficha_id: FT.forma, quantidade: 6 } });
    RPC.salvar_programacao({ p: { data: h2, ficha_id: FT.bisna, quantidade: 3 } });
  }) });
  // financeiro: lança no contas a pagar os pedidos com mais de 2 dias; um vence hoje sem a mercadoria
  agenda.push({ d: 0, h: 8, fn: () => como('financeiro', 0, 8, () => {
    const h = iso(new Date(dia(0)));
    db.pedidos.filter((p) => p.data_pedido <= iso(new Date(dia(-2))) && p.status !== 'cancelado').forEach((p) => RPC.financeiro_marcar({ p_pedido: p.id, p_lancado: true, p_obs: null }));
    const aberto = db.pedidos.filter((p) => ['aberto', 'parcial'].includes(p.status) && p.data_pedido < h).sort((a, b) => a.id - b.id)[0];
    if (aberto) RPC.ajustar_previsao_pagamento({ p_pedido: aberto.id, p_data: h, p_motivo: 'Boleto antecipado pelo fornecedor' });
  }) });

  while (agenda.length) {
    agenda.sort((a, b) => a.d - b.d || a.h - b.h);
    agenda.shift().fn();
  }
  relogio = null;
  usuario = null;
}

// ------------------------------- API ---------------------------------
function garantir() {
  if (db) return;
  let ok = false;
  try { const t = localStorage.getItem(CHAVE); if (t) { db = JSON.parse(t); ok = true; } } catch { /* sem armazenamento */ }
  if (!ok) { semente(); persistir(); }
}
function persistir() { try { localStorage.setItem(CHAVE, JSON.stringify(db)); } catch { /* ignora */ } }
const clone = (x) => JSON.parse(JSON.stringify(x));

export const apiDemo = {
  modo: 'demo',
  async usuariosDemo() { garantir(); return db.perfis.filter(temPapel).map(clone); },
  async entrar(u) {
    garantir();
    const p = db.perfis.find((x) => x.usuario === String(u).toLowerCase().trim());
    if (!p) throw new Error('Usuário ou senha incorretos.');
    if (!temPapel(p)) throw new Error('Usuário sem acesso liberado. Fale com o administrador.');
    usuario = p.user_id;
    try { sessionStorage.setItem(CHAVE + '-sessao', usuario); } catch { /* ignora */ }
    return clone(p);
  },
  async sessaoAtual() {
    garantir();
    if (!usuario) { try { usuario = sessionStorage.getItem(CHAVE + '-sessao'); } catch { /* ignora */ } }
    const p = usuario && db.perfis.find((x) => x.user_id === usuario && temPapel(x));
    return p ? clone(p) : null;
  },
  async sair() { usuario = null; try { sessionStorage.removeItem(CHAVE + '-sessao'); } catch { /* ignora */ } },
  async trocarSenha() { throw new Error('No modo demonstração não há senha.'); },
  // imita a função segura do servidor (admin-usuarios)
  async adminUsuarios(p) {
    garantir();
    if (!papeis().includes('admin')) throw new Error('Só o administrador gerencia usuários.');
    const senha = () => Array.from({ length: 12 }, () => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 55)]).join('');
    const reg = (evento, detalhe) => { db.acessos.push({ id: novoId('acessos'), data_hora: agora().toISOString(), usuario_id: usuario, evento, detalhe, agente: 'demo' }); };
    let r;
    if (p.acao === 'criar') {
      const u = String(p.usuario || '').trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(u)) throw new Error('Usuário deve ter de 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado (sem espaço e sem acento).');
      if (db.perfis.some((x) => x.usuario === u)) throw new Error(`Já existe o usuário "${u}".`);
      if (!String(p.nome || '').trim()) throw new Error('Informe o nome.');
      if (!(p.papeis || []).length) throw new Error('Marque pelo menos um papel.');
      const id = 'demo-' + u;
      db.perfis.push({ user_id: id, usuario: u, nome: String(p.nome).trim(), funcao: txt(p.funcao), papeis: [...p.papeis], ativo: true, criado_em: agora().toISOString() });
      reg('usuario_criado', `${u} (${p.nome})`); r = { user_id: id, usuario: u, senha_temporaria: senha() };
    } else {
      const pf = db.perfis.find((x) => x.user_id === p.user_id) || erro('Usuário não encontrado.');
      if (p.acao === 'redefinir_senha') { reg('senha_redefinida', pf.usuario); r = { senha_temporaria: senha() }; }
      else if (p.acao === 'bloquear') {
        if (pf.user_id === usuario && p.bloquear) throw new Error('Você não pode bloquear a si mesmo.');
        atualizar('perfis', pf, { ativo: !p.bloquear }); reg(p.bloquear ? 'usuario_bloqueado' : 'usuario_desbloqueado', pf.usuario); r = { ok: true };
      } else throw new Error('Ação desconhecida.');
    }
    persistir(); return clone(r);
  },
  async listar(tabela, o = {}) {
    garantir();
    if (!perfil() && tabela !== 'perfis') return [];
    if (!podeLer(tabela)) return [];
    let l = db[tabela] || [];
    const campo = o.campoData || 'data_hora';
    if (o.desde) l = l.filter((x) => String(x[campo]) >= o.desde);
    if (o.ate) l = l.filter((x) => String(x[campo]) < o.ate);
    if (o.eq) for (const [k, v] of Object.entries(o.eq)) l = l.filter((x) => x[k] === v);
    if (o.em) for (const [k, v] of Object.entries(o.em)) { const s = new Set(v); l = l.filter((x) => s.has(x[k])); }
    if (o.ordem) { const [k, dir] = o.ordem; l = [...l].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (dir === 'desc' ? -1 : 1)); }
    if (o.limite) l = l.slice(0, o.limite);
    return clone(l);
  },
  async rpc(nome, args = {}) {
    garantir();
    const f = RPC[nome];
    if (!f) throw new Error('Função desconhecida: ' + nome);
    const copia = JSON.stringify(db);
    try {
      const r = f(clone(args));
      persistir();
      return r === undefined ? null : clone(r);
    } catch (e) {
      db = JSON.parse(copia);   // desfaz tudo, como uma transação do banco
      throw e;
    }
  },
  async reiniciarDemo() { semente(); persistir(); usuario = null; try { sessionStorage.removeItem(CHAVE + '-sessao'); } catch { /* ignora */ } },
};
