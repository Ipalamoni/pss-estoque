// =====================================================================
// exportar.js — botões padrão de exportação (Excel, PDF, Imprimir, WhatsApp)
// usados em todas as telas de consulta e relatórios
// =====================================================================
import { html, useState, useEffect, useRef, useApp, avisar, useCelular } from './ui.js';
import { excelBlob, pdfTabela, pdfBlob, imprimirPDF, baixar, compartilhar } from './export.js';
import { mensagemErro, hojeISO } from './util.js';
import { Icone } from './icones.js';
import { usePreferencia } from './preferencias.js';

const limpar = (t) => String(t || 'relatorio').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Props:
//  titulo, filtros (texto do período/filtros), colunas [{titulo, valor, texto?, num?, largura?}], linhas, totais, paisagem
//  arquivo (nome sem extensão; padrão = título + data)
//  abas: () => [{nome, colunas, linhas}]   (Excel com mais abas/colunas, opcional)
//  pdf: async (params) => doc               (PDF próprio, opcional)
//  sem: ['imprimir', ...]                   (esconder botões)
export function Exportar(props) {
  const { dados } = useApp();
  const [menu, setMenu] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!menu) return;
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', f); document.addEventListener('touchstart', f);
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('touchstart', f); };
  }, [menu]);
  const nome = props.arquivo || `${limpar(props.titulo)}-${hojeISO()}`;
  const sem = new Set(props.sem || []);
  const escondidas = usePreferencia(props.tabela ? `colunas.${props.tabela}` : '_', []);
  const colunasExp = (props.colunas || []).filter((c) => !props.tabela || !escondidas.includes(String(c.titulo)));

  async function gerar(tipo) {
    if (tipo === 'excel') {
      const abas = props.abas ? props.abas() : [{ nome: props.titulo, linhas: props.linhas,
        colunas: colunasExp.map((c) => ({ titulo: c.titulo, valor: c.valor, largura: c.largura })) }];
      return { blob: await excelBlob(abas), nome: `${nome}.xlsx` };
    }
    const doc = props.pdf ? await props.pdf(dados.params)
      : await pdfTabela({ titulo: props.titulo, filtros: props.filtros, colunas: colunasExp, linhas: props.linhas,
        totais: props.totais, paisagem: props.paisagem !== false, params: dados.params });
    return { doc, blob: pdfBlob(doc), nome: `${nome}.pdf` };
  }
  const cel = useCelular();
  async function fazer(tipo, enviar = false) {
    setMenu(false);
    if (ocupado) return;
    setOcupado(true);
    try {
      const r = await gerar(tipo);
      if (enviar) {
        const res = await compartilhar(r.blob, r.nome, `${props.titulo}${props.filtros ? ' · ' + props.filtros : ''}`);
        if (res === 'baixado') avisar(`Arquivo baixado. No WhatsApp que abriu, escolha o contato e anexe "${r.nome}".`, 'aviso');
      } else if (tipo === 'imprimir') imprimirPDF(r.doc);
      else baixar(r.blob, r.nome);
    } catch (e) { avisar(mensagemErro(e), 'erro'); }
    finally { setOcupado(false); }
  }
  if (cel) return html`<div class="exportar exportar-cel" ref=${ref}>
    <button class="btn btn-sec btn-peq" disabled=${ocupado} aria-expanded=${menu} onClick=${() => setMenu(!menu)}>
      <${Icone} nome="excel" tam=${16} /> ${ocupado ? 'Gerando…' : 'Exportar'} <${Icone} nome="setaBaixo" tam=${14} /></button>
    ${menu && html`<div class="menu-suspenso">
      <button onClick=${() => fazer('excel')}><${Icone} nome="excel" tam=${16} /> Baixar em Excel</button>
      <button onClick=${() => fazer('pdf')}><${Icone} nome="pdf" tam=${16} /> Baixar em PDF</button>
      <button onClick=${() => fazer('pdf', true)}><${Icone} nome="whatsapp" tam=${16} /> WhatsApp (PDF)</button>
      <button onClick=${() => fazer('excel', true)}><${Icone} nome="whatsapp" tam=${16} /> WhatsApp (Excel)</button>
    </div>`}
  </div>`;
  return html`<div class="exportar" ref=${ref}>
    <button class="btn btn-sec btn-peq" disabled=${ocupado} title="Baixar em Excel" onClick=${() => fazer('excel')}><${Icone} nome="excel" tam=${16} /> Excel</button>
    <button class="btn btn-sec btn-peq" disabled=${ocupado} title="Baixar em PDF" onClick=${() => fazer('pdf')}><${Icone} nome="pdf" tam=${16} /> PDF</button>
    ${!sem.has('imprimir') && html`<button class="btn btn-sec btn-peq so-tela" disabled=${ocupado} title="Imprimir" onClick=${() => fazer('imprimir')}><${Icone} nome="imprimir" tam=${16} /></button>`}
    <span class="exportar-envio">
      <button class="btn btn-zap btn-peq" disabled=${ocupado} title="Enviar pelo WhatsApp" onClick=${() => setMenu(!menu)}>
        <${Icone} nome="whatsapp" tam=${16} /> WhatsApp <${Icone} nome="setaBaixo" tam=${14} /></button>
      ${menu && html`<div class="menu-suspenso">
        <button onClick=${() => fazer('pdf', true)}><${Icone} nome="pdf" tam=${16} /> Enviar em PDF</button>
        <button onClick=${() => fazer('excel', true)}><${Icone} nome="excel" tam=${16} /> Enviar em Excel</button>
      </div>`}
    </span>
  </div>`;
}
