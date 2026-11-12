// Ícones simples em SVG (traço), no estilo "Feather" (licença MIT)
import { html } from './vendor/preact-htm.js';

const P = {
  inicio: 'M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  receber: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  saidas: 'M12 3v3M5 21h14M7 6h10l3 7a4 4 0 0 1-8 0zM4 13l3-7M12 6v15',
  inventario: 'M9 3h6v3H9zM7 4.5H5v16.5h14V4.5h-2M8.5 12l2 2 4-4M8.5 17h7',
  pedidos: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h6',
  estoque: 'M3 7l9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4',
  movimentos: 'M17 3l4 4-4 4M21 7H8M7 21l-4-4 4-4M3 17h13',
  relatorios: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  produtos: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  fornecedores: 'M1 4h14v12H1zM15 9h4l4 4v3h-8zM5.5 19.5a2 2 0 1 0 0-.1M18.5 19.5a2 2 0 1 0 0-.1',
  fichas: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  usuarios: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  configuracoes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  auditoria: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  sair: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 6h18M3 12h18M3 18h18',
  chave: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
  mais: 'M12 5v14M5 12h14',
  pdf: 'M6 2h9l5 5v15H6zM14 2v6h6M9 15h6',
  excel: 'M4 3h16v18H4zM4 9h16M4 15h16M10 3v18',
  imprimir: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  // balão de conversa com telefone (genérico, não é a marca do WhatsApp)
  whatsapp: 'M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3zM9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .8a4 4 0 0 1-2.2-2.2l.8-1-1-2z',
  voltar: 'M19 12H5M12 19l-7-7 7-7',
  recolher: 'M11 17l-5-5 5-5M18 17l-5-5 5-5',
  expandir: 'M13 17l5-5-5-5M6 17l5-5-5-5',
  programacao: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 14l2 2 4-4',
  'saidas-producao': 'M3 21h18M5 21V10l5 3V10l5 3V7l4 2v12M9 17h.01M14 17h.01',
  setaBaixo: 'M6 9l6 6 6-6',
  painel: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
};

export function Icone({ nome, tam = 20 }) {
  return html`<svg class="icone" width=${tam} height=${tam} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${P[nome] || P.inicio} /></svg>`;
}
