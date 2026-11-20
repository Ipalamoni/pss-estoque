// Service worker: deixa o app instalável e abre rápido.
// A CADA MUDANÇA DE TELA, AUMENTE O NÚMERO DA VERSÃO ABAIXO (ex.: v0.1.1).
const VERSAO = 'estoque-pss-v2.0.0';
const ARQUIVOS = ['./', 'index.html', 'versao.js', 'config.js', 'manifest.json', 'css/app.css',
  'js/app.js', 'js/api.js', 'js/demo.js', 'js/calc.js', 'js/util.js', 'js/ui.js', 'js/export.js', 'js/icones.js', 'js/historico.js', 'js/importacao.js', 'js/exportar.js', 'js/modelo/planilha-modelo.js',
  'js/graficos.js', 'js/producao-util.js',
  'js/telas/auditoria.js', 'js/telas/cadastros-producao.js', 'js/telas/configuracoes.js', 'js/telas/contagem.js', 'js/telas/custos-producao.js', 'js/telas/custos.js', 'js/telas/estoque-local.js', 'js/telas/estoque.js', 'js/telas/fichas.js', 'js/telas/finalizar.js', 'js/telas/financeiro.js', 'js/telas/fornecedores.js', 'js/telas/inicio.js', 'js/telas/inventario.js', 'js/telas/locais.js', 'js/telas/maceiras.js', 'js/telas/movimentos.js', 'js/telas/painel-producao.js', 'js/telas/painel.js', 'js/telas/pedidos.js', 'js/telas/previsao.js', 'js/telas/producao.js', 'js/telas/produtos.js', 'js/telas/quadro-maceiras.js', 'js/telas/receber.js', 'js/telas/relatorios.js', 'js/telas/requisicoes.js', 'js/telas/saidas.js', 'js/telas/transferencias.js', 'js/telas/usuarios.js',
  'js/vendor/preact-htm.js', 'js/vendor/supabase.js', 'js/vendor/jspdf.umd.min.js', 'js/vendor/jspdf.plugin.autotable.min.js', 'js/vendor/xlsx.mini.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/logo-pss.png', 'icons/logo-palamoni.png', 'icons/logo-palamoni-vertical.png', 'icons/marca-pss.png'];
// O modo demonstração (banco no navegador, ~16 MB) não fica no cache do app: só baixa se alguém abrir a demonstração.
const FORA_DO_CACHE = ['/js/vendor/pglite/', '/js/demo/'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Arquivos do app: tenta a rede primeiro (pega versão nova) e usa o cache se estiver sem internet.
// Dados (Supabase) nunca passam pelo cache.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (FORA_DO_CACHE.some((p) => url.pathname.includes(p))) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copia = r.clone();
    caches.open(VERSAO).then((c) => c.put(e.request, copia));
    return r;
  }).catch(() => caches.match(e.request)));
});
