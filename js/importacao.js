// =====================================================================
// importacao.js — lê a planilha-modelo de cadastro em massa e confere
// tudo antes de enviar ao banco (função importar_cadastros, só admin).
// Também gera a planilha no mesmo formato com o cadastro atual.
// =====================================================================
import { lerNumero, normalizar, CATEGORIAS, formatarDoc } from './util.js';

const CAB_INICIAL = { fornecedores: 'nome', produtos: 'codigo', receitas: 'codigo da receita', saldos: 'codigo do produto' };
const ABAS = { fornecedores: 'fornecedores', produtos: 'produtos', receitas: 'receitas', saldos: 'saldo inicial' };
const COLUNAS = {
  fornecedores: { nome: 'nome', razao_social: 'razao social', cnpj: 'cnpj', inscricao_estadual: 'inscricao estadual', contato: 'contato', telefone: 'telefone',
    whatsapp: 'whatsapp', email: 'e-mail', endereco: 'endereco', bairro: 'bairro', cidade: 'cidade', uf: 'uf', cep: 'cep', condicao_pagamento: 'condicao',
    prazo_entrega_dias: 'prazo', observacao: 'observacao', ativo: 'ativo' },
  produtos: { codigo: 'codigo', codigo_erp: 'codigo no erp', descricao: 'descricao', categoria: 'categoria', grupo: 'grupo', classificacao: 'classificacao', marca: 'marca',
    unidade_estoque: 'unidade de estoque', unidade_compra: 'unidade de compra', fator_compra: 'quantas', estoque_minimo: 'estoque minimo',
    prazo_entrega_dias: 'prazo', fornecedor: 'fornecedor', observacao: 'observacao', ativo: 'ativo' },
  receitas: { codigo: 'codigo da receita', nome: 'nome da receita', produto_final: 'produto final', rendimento: 'rendimento',
    codigo_produto: 'codigo do ingrediente', quantidade: 'quantidade', unidade: 'unidade' },
  saldos: { codigo_produto: 'codigo do produto', quantidade: 'quantidade', unidade: 'unidade', custo_unitario: 'custo' },
};
const CATEG = { 'materia-prima': 'materia_prima', 'materia prima': 'materia_prima', materia_prima: 'materia_prima', embalagem: 'embalagem',
  'material de escritorio': 'escritorio', escritorio: 'escritorio', 'material de limpeza': 'limpeza', limpeza: 'limpeza', outros: 'outros' };

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v) => (typeof v === 'number' ? v : lerNumero(txt(v)));

function acharAba(wb, alvo) {
  return wb.SheetNames.find((n) => normalizar(n).trim() === alvo);
}
function mapearColunas(cab, mapa) {
  const idx = {};
  const cabN = cab.map((c) => normalizar(txt(c)).replace(/\*/g, '').trim());
  for (const [campo, chave] of Object.entries(mapa)) {
    // "unidade" não pode casar com "unidade de estoque"; procura o cabeçalho que começa com a chave
    let i = cabN.findIndex((c) => c === chave);
    if (i < 0) i = cabN.findIndex((c) => c.startsWith(chave) && !c.includes('automatico'));
    if (i < 0) i = cabN.findIndex((c) => c.includes(chave) && !c.includes('automatico'));
    idx[campo] = i;
  }
  return idx;
}

export function lerPlanilha(XLSX, dadosArquivo) {
  const wb = XLSX.read(dadosArquivo, { type: 'array' });
  const r = { fornecedores: [], produtos: [], receitas: [], saldos: [], erros: [], abasLidas: [] };
  const erro = (aba, linha, msg) => r.erros.push({ aba, linha, msg });

  for (const [tipo, nomeAba] of Object.entries(ABAS)) {
    const nome = acharAba(wb, nomeAba);
    if (!nome) continue;
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: '', raw: true, blankrows: true });
    const iCab = linhas.slice(0, 15).findIndex((l) => normalizar(txt(l[0])).replace(/\*/g, '').trim().startsWith(CAB_INICIAL[tipo]));
    if (iCab < 0) { erro(nome, 1, 'não encontrei o cabeçalho desta aba (use a planilha-modelo).'); continue; }
    const col = mapearColunas(linhas[iCab], COLUNAS[tipo]);
    const v = (l, campo) => (col[campo] >= 0 ? l[col[campo]] : '');
    r.abasLidas.push(nome);
    let receita = null;
    for (let i = iCab + 1; i < linhas.length; i++) {
      const l = linhas[i]; const linha = i + 1;
      const usados = Object.keys(COLUNAS[tipo]).map((c) => txt(v(l, c)));
      if (usados.every((x) => x === '')) { if (tipo === 'receitas') receita = receita; continue; }

      if (tipo === 'fornecedores') {
        if (!txt(v(l, 'nome'))) { erro(nome, linha, 'falta o nome do fornecedor.'); continue; }
        const uf = txt(v(l, 'uf')).toUpperCase();
        if (uf && !/^[A-Z]{2}$/.test(uf)) erro(nome, linha, `UF "${uf}" inválida (use 2 letras, ex.: SP).`);
        r.fornecedores.push({ linha, nome: txt(v(l, 'nome')), razao_social: txt(v(l, 'razao_social')), cnpj: txt(v(l, 'cnpj')), inscricao_estadual: txt(v(l, 'inscricao_estadual')),
          contato: txt(v(l, 'contato')), telefone: txt(v(l, 'telefone')), whatsapp: txt(v(l, 'whatsapp')), email: txt(v(l, 'email')),
          endereco: txt(v(l, 'endereco')), bairro: txt(v(l, 'bairro')), cidade: txt(v(l, 'cidade')), uf, cep: txt(v(l, 'cep')), condicao_pagamento: txt(v(l, 'condicao_pagamento')),
          prazo_entrega_dias: num(v(l, 'prazo_entrega_dias')), observacao: txt(v(l, 'observacao')),
          ativo: !/^n/i.test(txt(v(l, 'ativo'))) });
      }
      if (tipo === 'produtos') {
        const cat = CATEG[normalizar(txt(v(l, 'categoria')))];
        const p = { linha, codigo: txt(v(l, 'codigo')), codigo_erp: txt(v(l, 'codigo_erp')), descricao: txt(v(l, 'descricao')), categoria: cat, grupo: txt(v(l, 'grupo')),
          classificacao: txt(v(l, 'classificacao')).toUpperCase(), marca: txt(v(l, 'marca')), unidade_estoque: txt(v(l, 'unidade_estoque')),
          unidade_compra: txt(v(l, 'unidade_compra')), fator_compra: num(v(l, 'fator_compra')) ?? 1, estoque_minimo: num(v(l, 'estoque_minimo')),
          prazo_entrega_dias: num(v(l, 'prazo_entrega_dias')), fornecedor: txt(v(l, 'fornecedor')), observacao: txt(v(l, 'observacao')),
          ativo: !/^n/i.test(txt(v(l, 'ativo'))) };
        if (!p.codigo) erro(nome, linha, 'falta o código.');
        else if (!p.descricao) erro(nome, linha, 'falta a descrição.');
        else if (!cat) erro(nome, linha, `categoria "${txt(v(l, 'categoria'))}" inválida. Use: ${Object.values(CATEGORIAS).join(', ')}.`);
        else if (!p.unidade_estoque) erro(nome, linha, 'falta a unidade de estoque.');
        else if (p.unidade_compra && p.unidade_compra !== p.unidade_estoque && !(p.fator_compra > 0)) erro(nome, linha, 'informe quantas unidades de estoque tem 1 unidade de compra.');
        else if (r.produtos.some((x) => x.codigo.toLowerCase() === p.codigo.toLowerCase())) erro(nome, linha, `código ${p.codigo} repetido na planilha.`);
        else r.produtos.push(p);
      }
      if (tipo === 'receitas') {
        const cod = txt(v(l, 'codigo')); const nm = txt(v(l, 'nome'));
        if (cod && (!receita || receita.codigo.toLowerCase() !== cod.toLowerCase())) {
          if (r.receitas.some((x) => x.codigo.toLowerCase() === cod.toLowerCase())) { erro(nome, linha, `receita ${cod} aparece em dois lugares; deixe os ingredientes juntos.`); receita = null; continue; }
          if (!nm) { erro(nome, linha, `falta o nome da receita ${cod}.`); receita = null; continue; }
          receita = { linha, codigo: cod, nome: nm, produto_final: txt(v(l, 'produto_final')), rendimento: txt(v(l, 'rendimento')), itens: [] };
          r.receitas.push(receita);
        } else if (!cod && nm && (!receita || receita.nome !== nm)) { erro(nome, linha, 'receita sem código.'); receita = null; continue; }
        if (!receita) { erro(nome, linha, 'ingrediente sem receita acima (preencha o código e o nome na 1ª linha da receita).'); continue; }
        const cp = txt(v(l, 'codigo_produto')); const q = num(v(l, 'quantidade')); const un = txt(v(l, 'unidade'));
        if (!cp && q === null) continue;            // linha só com o cabeçalho da receita
        if (!cp) erro(nome, linha, 'falta o código do ingrediente.');
        else if (!(q > 0)) erro(nome, linha, 'quantidade do ingrediente precisa ser maior que zero.');
        else if (!un) erro(nome, linha, 'falta a unidade do ingrediente (ex.: kg ou g).');
        else receita.itens.push({ linha, codigo_produto: cp, quantidade: q, unidade: un });
      }
      if (tipo === 'saldos') {
        const s = { linha, codigo_produto: txt(v(l, 'codigo_produto')), quantidade: num(v(l, 'quantidade')), unidade: txt(v(l, 'unidade')), custo_unitario: num(v(l, 'custo_unitario')) ?? 0 };
        if (!s.codigo_produto) erro(nome, linha, 'falta o código do produto.');
        else if (!(s.quantidade > 0)) erro(nome, linha, 'quantidade precisa ser maior que zero.');
        else if (!s.unidade) erro(nome, linha, 'falta a unidade.');
        else r.saldos.push(s);
      }
    }
  }
  for (const rc of r.receitas) if (!rc.itens.length) erro('Receitas', rc.linha, `a receita ${rc.codigo} está sem ingredientes.`);
  return r;
}

// Planilha no mesmo formato, com o cadastro atual (para conferir ou atualizar em massa)
export function planilhaDoCadastro(XLSX, dados) {
  const forn = dados.mapa.fornecedor; const prod = dados.mapa.produto;
  const aba = (titulo, dica, cab, linhas) => {
    const ws = XLSX.utils.aoa_to_sheet([[titulo], [dica], cab, ...linhas]);
    ws['!cols'] = cab.map((c) => ({ wch: Math.max(12, Math.min(40, c.length + 4)) }));
    return ws;
  };
  const wb = XLSX.utils.book_new();
  const c = (x) => x ?? '';
  XLSX.utils.book_append_sheet(wb, aba('Fornecedores', 'Cadastro atual exportado do sistema', ['Nome fantasia *', 'Razão social', 'CNPJ', 'Inscrição estadual', 'Contato', 'Telefone', 'WhatsApp',
    'E-mail', 'Endereço (rua, número)', 'Bairro', 'Cidade', 'UF', 'CEP', 'Condição de pagamento', 'Prazo de entrega (dias)', 'Observação', 'Ativo'],
    dados.fornecedores.map((f) => [f.nome, c(f.razao_social), c(formatarDoc(f.cnpj, f.tipo_pessoa)), c(f.inscricao_estadual), c(f.contato), c(f.telefone), c(f.whatsapp), c(f.email), c(f.endereco), c(f.bairro),
      c(f.cidade), c(f.uf), c(f.cep), c(f.condicao_pagamento), c(f.prazo_entrega_dias), c(f.observacao), f.ativo ? 'SIM' : 'NÃO'])), 'Fornecedores');
  XLSX.utils.book_append_sheet(wb, aba('Produtos', 'Cadastro atual exportado do sistema', ['Código *', 'Código no ERP', 'Descrição *', 'Categoria *', 'Grupo', 'Classificação', 'Marca', 'Unidade de estoque *', 'Unidade de compra',
    'Quantas unid. de estoque tem 1 unid. de compra', 'Estoque mínimo (unid. de estoque)', 'Prazo de entrega (dias)', 'Fornecedor principal', 'Observação', 'Ativo'],
    dados.produtos.map((p) => [p.codigo, c(p.codigo_erp), p.descricao, CATEGORIAS[p.categoria], p.grupo || '', p.classificacao || '', p.marca || '', p.unidade_estoque, p.unidade_compra || '',
      p.unidade_compra ? Number(p.fator_compra) : '', p.estoque_minimo ?? '', p.prazo_entrega_dias ?? '', forn.get(p.fornecedor_padrao_id)?.nome || '', p.observacao || '', p.ativo ? 'SIM' : 'NÃO'])), 'Produtos');
  const rec = [];
  for (const f of dados.fichas) {
    dados.fichaItens.filter((i) => i.ficha_id === f.id).forEach((i, k) => {
      const p = prod.get(i.produto_id);
      rec.push([k === 0 ? f.codigo : '', k === 0 ? f.nome : '', k === 0 ? f.produto_final || '' : '', k === 0 ? f.rendimento || '' : '',
        p?.codigo, p?.descricao, p?.grupo || '', p?.classificacao || '', Number(i.quantidade), p?.unidade_estoque]);
    });
    rec.push([]);
  }
  XLSX.utils.book_append_sheet(wb, aba('Receitas', 'Cadastro atual exportado do sistema (uma receita embaixo da outra)', ['Código da receita *', 'Nome da receita *', 'Produto final', 'Rendimento',
    'Código do ingrediente *', 'Ingrediente (automático)', 'Grupo (automático)', 'Classificação (automático)', 'Quantidade por receita *', 'Unidade *'], rec), 'Receitas');
  return wb;
}
