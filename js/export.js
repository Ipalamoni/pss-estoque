// =====================================================================
// export.js — PDF (pedido de compra e relatórios), Excel e impressão
// Bibliotecas locais: jsPDF + AutoTable (PDF) e SheetJS (Excel)
// =====================================================================
import { numeroPedido, data, dataHora, qtd, moeda, num, formatarDoc, rotuloDoc } from './util.js';

const CFG = window.CONFIG || {};
const COR = CFG.COR_PDF || [2, 110, 87]; // cor principal no PDF (R, G, B)
const cacheLogo = {};

// As bibliotecas de PDF e Excel são pesadas (~600 KB): só são baixadas na primeira vez que alguém exporta.
const _scripts = {};
function carregarScript(src) {
  if (!_scripts[src]) _scripts[src] = new Promise((ok, erro) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => ok(); s.onerror = () => { delete _scripts[src]; erro(new Error('Não consegui carregar ' + src + '. Confira a internet e tente de novo.')); };
    document.head.appendChild(s);
  });
  return _scripts[src];
}
export async function carregarPDF() {
  if (!window.jspdf) await carregarScript('js/vendor/jspdf.umd.min.js');
  if (!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable)) await carregarScript('js/vendor/jspdf.plugin.autotable.min.js');
}
export async function carregarExcel() { if (!window.XLSX) await carregarScript('js/vendor/xlsx.mini.min.js'); return window.XLSX; }

// SEGURANÇA: planilha enviada pelo usuário é aberta num processo isolado (js/planilha-worker.js),
// com limite de tamanho e de tempo. Devolve um "leitor" com a mesma forma que a importação usa.
const LIMITE_PLANILHA_MB = 15, TEMPO_PLANILHA_MS = 20000;
export function lerPlanilhaIsolada(buffer) {
  if (!buffer || buffer.byteLength > LIMITE_PLANILHA_MB * 1024 * 1024) return Promise.reject(new Error(`Planilha maior que ${LIMITE_PLANILHA_MB} MB.`));
  const assinatura = new Uint8Array(buffer.slice(0, 4));
  const zip = assinatura[0] === 0x50 && assinatura[1] === 0x4b;               // .xlsx (PK..)
  const ole = assinatura[0] === 0xd0 && assinatura[1] === 0xcf;               // .xls antigo
  if (!zip && !ole) return Promise.reject(new Error('O arquivo não é uma planilha do Excel (.xlsx ou .xls).'));
  return new Promise((ok, erro) => {
    const w = new Worker('js/planilha-worker.js');
    const fim = setTimeout(() => { w.terminate(); erro(new Error('A planilha demorou demais para abrir e foi recusada.')); }, TEMPO_PLANILHA_MS);
    w.onmessage = (e) => {
      clearTimeout(fim); w.terminate();
      if (!e.data || !e.data.ok) return erro(new Error((e.data && e.data.erro) || 'Planilha inválida.'));
      const { nomes, abas } = e.data;
      const Sheets = Object.create(null); nomes.forEach((n) => { Sheets[n] = abas[n]; });
      ok({ read: () => ({ SheetNames: nomes, Sheets }), utils: { sheet_to_json: (linhas) => linhas } });
    };
    w.onerror = (e) => { clearTimeout(fim); w.terminate(); erro(new Error(e.message || 'Não consegui abrir a planilha.')); };
    w.postMessage(buffer, [buffer]);
  });
}

async function logo(caminho) {
  if (caminho in cacheLogo) return cacheLogo[caminho];
  try {
    const r = await fetch(caminho);
    if (!r.ok) throw new Error();
    const b = await r.blob();
    cacheLogo[caminho] = await new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(b); });
  } catch { cacheLogo[caminho] = null; }
  return cacheLogo[caminho];
}

function novoDoc(paisagem = false) {
  if (!window.jspdf) throw new Error('Biblioteca de PDF não carregou. Atualize a página.');
  return new window.jspdf.jsPDF({ orientation: paisagem ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
}

function rodapes(doc) {
  const total = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5); doc.setTextColor(120);
    doc.text(`Gerado em ${dataHora(new Date())} · Artas Indústria · software de propriedade da Palamoni Consultoria Empresarial`, 10, h - 6);
    doc.text(`Página ${i} de ${total}`, w - 10, h - 6, { align: 'right' });
  }
}

async function topo(doc, params, titulo, subtitulo) {
  const w = doc.internal.pageSize.getWidth();
  const lg = await logo('icons/logo-pss.png');
  let x = 10;
  if (lg) { try { doc.addImage(lg, 'PNG', 10, 9, 44, 17); x = 58; } catch { /* sem logo */ } }
  doc.setTextColor(30); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(params.empresa_nome || 'Pães São Sebastião', x, 13);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(80);
  const linhas = [params.empresa_cnpj && `CNPJ ${formatarDoc(params.empresa_cnpj)}`, params.empresa_endereco, params.empresa_telefone].filter(Boolean);
  linhas.forEach((l, i) => doc.text(l, x, 18 + i * 4));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...COR);
  doc.text(titulo, w - 10, 14, { align: 'right' });
  if (subtitulo) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80); doc.text(subtitulo, w - 10, 20, { align: 'right' }); }
  doc.setDrawColor(...COR); doc.setLineWidth(0.6); doc.line(10, 33, w - 10, 33);
  return 38;
}

// ------------------------- PEDIDO DE COMPRA -------------------------
export async function pdfPedido({ pedido, itens, fornecedor, produtos, params, comprador }) {
  await carregarPDF();
  const doc = novoDoc();
  const w = doc.internal.pageSize.getWidth();
  let y = await topo(doc, params, 'PEDIDO DE COMPRA', numeroPedido(pedido.id));

  doc.setFontSize(9); doc.setTextColor(30);
  const bloco = (rot, val, xx, yy) => { doc.setFont('helvetica', 'bold'); doc.text(rot, xx, yy); const w0 = doc.getTextWidth(rot); doc.setFont('helvetica', 'normal'); doc.text(String(val || '–'), xx + w0 + 2, yy); };
  bloco('Data do pedido:', data(pedido.data_pedido), 10, y);
  bloco('Previsão de entrega:', data(pedido.previsao_entrega), 75, y);
  bloco('Situação:', pedido.status_rotulo || pedido.status, 150, y);
  y += 7;
  doc.setFillColor(244, 246, 249); doc.roundedRect(10, y - 4, w - 20, 22, 2, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Fornecedor', 13, y + 1);
  doc.setFontSize(9); doc.text(fornecedor?.nome || '–', 13, y + 6.5);
  doc.setFont('helvetica', 'normal');
  const fl = [fornecedor?.razao_social && fornecedor.razao_social !== fornecedor.nome && fornecedor.razao_social, fornecedor?.cnpj && `${rotuloDoc(fornecedor.tipo_pessoa)} ${formatarDoc(fornecedor.cnpj, fornecedor.tipo_pessoa)}`,
    fornecedor?.inscricao_estadual && `IE ${fornecedor.inscricao_estadual}`, fornecedor?.contato && `Contato: ${fornecedor.contato}`,
    (fornecedor?.whatsapp || fornecedor?.telefone) && `Tel.: ${fornecedor.whatsapp || fornecedor.telefone}`, fornecedor?.email,
    [fornecedor?.cidade, fornecedor?.uf].filter(Boolean).join('/')].filter(Boolean).join('   ·   ');
  doc.text(fl || ' ', 13, y + 11.5, { maxWidth: w - 26 });
  y += 24;

  let total = 0;
  const corpo = itens.map((it, i) => {
    const p = produtos.get(it.produto_id) || {};
    total += Number(it.valor_total);
    return [i + 1, p.codigo || '', p.descricao || '', qtd(it.quantidade), it.unidade, moeda(it.preco_unitario), moeda(it.valor_total)];
  });
  doc.autoTable({
    startY: y, head: [['#', 'Código', 'Descrição', 'Qtd', 'Unid.', 'Preço unit.', 'Total']], body: corpo,
    foot: [['', '', '', '', '', 'TOTAL', moeda(total)]],
    styles: { fontSize: 8.5, cellPadding: 1.8 }, headStyles: { fillColor: COR }, footStyles: { fillColor: [230, 234, 240], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 22 }, 3: { halign: 'right' }, 4: { cellWidth: 16 }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    margin: { left: 10, right: 10 },
  });
  y = doc.lastAutoTable.finalY + 8;
  const texto = (rot, val) => {
    if (!val) return;
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.text(rot, 10, y); doc.setFont('helvetica', 'normal');
    const ls = doc.splitTextToSize(String(val), w - 20); doc.text(ls, 10, y + 5); y += 6 + ls.length * 4.2;
  };
  texto('Condição de pagamento', pedido.condicao_pagamento);
  texto('Observações', pedido.observacao);
  texto('Importante', params.pedido_rodape);
  if (y > 255) { doc.addPage(); y = 30; }
  y = Math.max(y + 12, 250);
  doc.setDrawColor(120); doc.line(10, y, 90, y);
  doc.setFontSize(8.5); doc.text(`Comprador: ${comprador || ''}`, 10, y + 4.5);
  rodapes(doc);
  return doc;
}

// ------------------------- RELATÓRIO EM TABELA ----------------------
// colunas: [{ titulo, valor:(l)=>texto, num:true }]
export async function pdfTabela({ titulo, filtros, colunas, linhas, paisagem = true, totais, params = {} }) {
  await carregarPDF();
  const doc = novoDoc(paisagem);
  const y = await topo(doc, params, titulo, filtros);
  doc.autoTable({
    startY: y, head: [colunas.map((c) => c.titulo)],
    body: linhas.map((l) => colunas.map((c) => { const v = c.texto ? c.texto(l) : c.valor(l); return v === null || v === undefined ? '' : String(v); })),
    foot: totais ? [colunas.map((c, i) => (totais[i] ?? ''))] : undefined,
    styles: { fontSize: 7.5, cellPadding: 1.4 }, headStyles: { fillColor: COR, fontSize: 7.5 },
    footStyles: { fillColor: [230, 234, 240], textColor: 20, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(colunas.map((c, i) => [i, c.num ? { halign: 'right' } : {}])),
    margin: { left: 8, right: 8 },
  });
  rodapes(doc);
  return doc;
}

export function salvarPDF(doc, nome) { doc.save(nome); }

export function imprimirPDF(doc) {
  doc.autoPrint();
  const url = doc.output('bloburl');
  const janela = window.open(url, '_blank');
  if (!janela) doc.save('imprimir.pdf');
}

// ------------------------- EXCEL ------------------------------------
// abas: [{ nome, colunas:[{titulo, valor:(l)=>valor bruto}], linhas }]
function livroExcel(abas) {
  if (!window.XLSX) throw new Error('Biblioteca de Excel não carregou. Atualize a página.');
  const wb = window.XLSX.utils.book_new();
  for (const a of abas) {
    const aoa = [a.colunas.map((c) => c.titulo), ...a.linhas.map((l) => a.colunas.map((c) => {
      const v = c.valor(l);
      return v === null || v === undefined ? '' : v;
    }))];
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = a.colunas.map((c) => ({ wch: c.largura || Math.max(10, Math.min(45, c.titulo.length + 4)) }));
    window.XLSX.utils.book_append_sheet(wb, ws, a.nome.replace(/[\\/?*[\]:]/g, '-').slice(0, 31));
  }
  return wb;
}
export async function excel(nomeArquivo, abas) { await carregarExcel(); window.XLSX.writeFile(livroExcel(abas), nomeArquivo); }
export async function excelBlob(abas) {
  await carregarExcel();
  const dados = window.XLSX.write(livroExcel(abas), { bookType: 'xlsx', type: 'array' });
  return new Blob([dados], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
export const pdfBlob = (doc) => doc.output('blob');

// ------------------------- ENVIAR (WhatsApp e outros) -----------------
// No celular (Android/iPhone) e no Windows abre a janela "Compartilhar" do
// sistema já com o arquivo: é só escolher o WhatsApp e o contato.
// Onde o navegador não deixa compartilhar arquivo, baixa o arquivo e abre o
// WhatsApp para a pessoa escolher o contato e anexar.
export async function compartilhar(blob, nome, texto) {
  const arquivo = new File([blob], nome, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try { await navigator.share({ files: [arquivo], title: nome, text: texto }); return 'compartilhado'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelado'; }
  }
  baixar(blob, nome);
  window.open('https://wa.me/?text=' + encodeURIComponent(`${texto}\n(anexe o arquivo ${nome} que acabou de baixar)`), '_blank', 'noopener');
  return 'baixado';
}
export function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
