// Tema claro/escuro, aplicado antes de a tela aparecer (sem "piscar" branco).
// Sem escolha da pessoa: segue o tema do celular/computador (e acompanha se ele mudar).
// Se a pessoa tocar no botão do topo, a escolha fica guardada neste aparelho.
(function () {
  function escolhido() { try { var t = localStorage.getItem('pss-tema'); return t === 'claro' || t === 'escuro' ? t : null; } catch (e) { return null; } }
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function aplicar(t) {
    document.documentElement.setAttribute('data-tema', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'escuro' ? '#1e2124' : '#026e57');
    try { window.dispatchEvent(new CustomEvent('pss-tema', { detail: t })); } catch (e) { /* navegador antigo */ }
  }
  aplicar(escolhido() || (mq && mq.matches ? 'escuro' : 'claro'));
  if (mq) {
    var mudou = function () { if (!escolhido()) aplicar(mq.matches ? 'escuro' : 'claro'); };
    if (mq.addEventListener) mq.addEventListener('change', mudou); else if (mq.addListener) mq.addListener(mudou);
  }
  window.PSS_TEMA = { aplicar: aplicar };
})();
