// =====================================================================
// CONFIGURAÇÃO DO APP — único arquivo que muda entre demonstração e produção
// A chave publicável PODE ficar aqui (é pública). A chave secreta NUNCA.
// =====================================================================
window.CONFIG = {
  MODO: 'supabase',                 // 'demo' (dados de exemplo no navegador) ou 'supabase' (dados reais)
  SUPABASE_URL: 'https://kuttfnmjvzgzebjpjvvy.supabase.co', // ex.: https://abcdefgh.supabase.co
  SUPABASE_CHAVE_PUBLICAVEL: 'sb_publishable_W1GkfuG7Vilypc9FT5xYCQ_nauvh7Zj', // ex.: sb_publishable_xxxxxxxx
  DOMINIO_LOGIN: 'estoque.pss',     // login "carlos" vira carlos@estoque.pss no Supabase
  SAIR_APOS_MINUTOS_SEM_USO: 480,   // sai sozinho após 8 h sem uso
  COR_PDF: [2, 110, 87],           // cor principal nos PDFs (R, G, B)
};
