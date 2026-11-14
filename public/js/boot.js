/* Início rápido: se a última visita terminou sem login, vai direto para a página de vendas (sem baixar o app inteiro). */
try { if (localStorage.getItem('vy_in') === '0' && (!location.hash || location.hash === '#/')) location.replace('/vendas/'); } catch (e) {}

/* Auto-reparo: depois de uma atualização, o celular pode ficar com um arquivo velho guardado junto com um novo
   (erro "Importing binding name ... is not found"). Quando isso acontece, baixa de novo os arquivos do app, sem cache, e recarrega uma vez. */
(function () {
  var BAD = /Importing binding name|does not provide an export|error loading dynamically imported module|Failed to fetch dynamically imported module|Unexpected token '<'/i;
  // lista dos arquivos do app (atualizar ao criar um arquivo novo em /js)
  var FILES = ['app', 'auth', 'chat', 'core', 'icons', 'landing', 'plans', 'push', 'setup', 'tour', 'tutorial', 'agendar',
    'pages/agenda', 'pages/billing', 'pages/checkout', 'pages/clients', 'pages/commissions', 'pages/dashboard', 'pages/finance', 'pages/help', 'pages/novo-agendamento',
    'pages/reports', 'pages/sales', 'pages/security', 'pages/services', 'pages/settings', 'pages/stock', 'pages/team', 'pages/visits', 'pages/whatsapp'];
  function heal(msg) {
    try {
      if (!BAD.test(String(msg || ''))) return false;
      var last = Number(sessionStorage.getItem('vy_heal') || 0);
      if (Date.now() - last < 60000) return false; // só uma tentativa por minuto (evita laço)
      sessionStorage.setItem('vy_heal', String(Date.now()));
      var urls = FILES.map(function (f) { return '/js/' + f + '.js'; }).concat(['/css/app.css']);
      Promise.all(urls.map(function (u) { return fetch(u, { cache: 'reload' }).catch(function () { return 0; }); })).then(function () { location.reload(); });
      return true;
    } catch (e) { return false; }
  }
  window.__vyHeal = heal;
  window.addEventListener('error', function (e) { heal(e && e.message); });
  window.addEventListener('unhandledrejection', function (e) { heal(e && e.reason && e.reason.message); });
})();
