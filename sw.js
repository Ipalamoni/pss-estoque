// Service worker: deixa o app instalável e abre rápido.
// A CADA MUDANÇA DE TELA, AUMENTE O NÚMERO DA VERSÃO ABAIXO (ex.: v0.1.1).
const VERSAO = 'estoque-pss-v2.26.1';
const ARQUIVOS = ['./', 'index.html', 'versao.js', 'config.js', 'manifest.json', 'css/app.css',
  'js/app.js', 'js/aviso-producao.js', 'js/preferencias.js', 'js/api.js', 'js/demo.js', 'js/calc.js', 'js/util.js', 'js/ui.js', 'js/export.js', 'js/icones.js', 'js/historico.js', 'js/importacao.js', 'js/exportar.js',
  'js/graficos.js', 'js/frota-csv.js', 'js/frota-dados.js', 'js/producao-util.js', 'js/tema.js', 'js/planilha-worker.js', 'js/marca.js', 'js/resumos.js',
  'js/telas/auditoria.js', 'js/telas/cadastros-producao.js', 'js/telas/configuracoes.js', 'js/telas/contagem.js', 'js/telas/custos-producao.js', 'js/telas/custos.js', 'js/telas/estoque-local.js', 'js/telas/estoque.js', 'js/telas/fichas.js', 'js/telas/finalizar.js', 'js/telas/historico-producao.js', 'js/telas/financeiro.js', 'js/telas/fornecedores.js', 'js/telas/frota.js', 'js/telas/frota-veiculos.js', 'js/telas/frota-comum.js', 'js/telas/inicio.js', 'js/telas/inventario.js', 'js/telas/locais.js', 'js/telas/maceiras.js', 'js/telas/ordem-pesagem.js', 'js/telas/movimentos.js', 'js/telas/painel-producao.js', 'js/telas/painel.js', 'js/telas/pedidos.js', 'js/telas/pedidos-erp.js', 'js/telas/previsao.js', 'js/telas/producao.js', 'js/telas/produtos.js', 'js/telas/quadro-maceiras.js', 'js/telas/receber.js', 'js/telas/relatorios.js', 'js/telas/requisicoes.js', 'js/telas/saidas.js', 'js/telas/transferencias.js', 'js/telas/usuarios.js',
  'js/vendor/preact-htm.js', 'js/vendor/supabase.js', 'js/vendor/jspdf.umd.min.js', 'js/vendor/jspdf.plugin.autotable.min.js', 'js/vendor/xlsx.mini.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.svg', 'icons/favicon-32.png', 'icons/logo-pss.png', 'icons/logo-palamoni.png', 'icons/logo-palamoni-vertical.png', 'icons/marca-pss.png'];
// O modo demonstração (banco no navegador, ~16 MB) não fica no cache do app: só baixa se alguém abrir a demonstração.
const FORA_DO_CACHE = ['/js/vendor/pglite/', '/js/demo/'];

self.addEventListener('install', (e) => {
  // baixa a versão nova inteira direto do servidor (sem pegar cópia velha do navegador)
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Página, versão e configuração: rede primeiro (para perceber versão nova); sem internet, usa o cache.
// Demais arquivos do app (js, css, ícones): já vêm guardados na instalação desta versão, então abrem direto do
// aparelho (rápido mesmo no celular fraco); o que não estiver guardado vai à rede e fica guardado.
// Dados (Supabase) nunca passam pelo cache.
const SEMPRE_REDE = ['/', '/index.html', '/versao.js', '/config.js', '/manifest.json'];
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (FORA_DO_CACHE.some((p) => url.pathname.includes(p))) return;
  const guardar = (r) => { if (r && r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); } return r; };
  const caminho = url.pathname.replace(/^.*\/pss-estoque/, '') || '/';
  if (e.request.mode === 'navigate' || SEMPRE_REDE.includes(caminho)) {
    e.respondWith(fetch(e.request).then(guardar).catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((c) => c || fetch(e.request).then(guardar)));
});
