// =====================================================================
// CONFIGURAÇÃO DO APP — único arquivo que muda entre demonstração e produção
// A chave publicável PODE ficar aqui (é pública). A chave secreta NUNCA.
// =====================================================================
window.CONFIG = {
  MODO: 'demo',                     // 'demo' (dados de exemplo no navegador) ou 'supabase' (dados reais)
  SUPABASE_URL: '',                 // ex.: https://abcdefgh.supabase.co
  SUPABASE_CHAVE_PUBLICAVEL: '',    // ex.: sb_publishable_xxxxxxxx
  DOMINIO_LOGIN: 'estoque.pss',     // login "carlos" vira carlos@estoque.pss no Supabase
  SAIR_APOS_MINUTOS_SEM_USO: 480,   // sai sozinho após 8 h sem uso
  COR_PDF: [2, 110, 87],           // cor principal nos PDFs (R, G, B)
};
