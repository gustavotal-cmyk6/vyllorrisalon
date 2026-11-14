/* Início rápido: se a última visita terminou sem login, vai direto para a página de vendas (sem baixar o app inteiro). */
try { if (localStorage.getItem('vy_in') === '0' && (!location.hash || location.hash === '#/')) location.replace('/vendas/'); } catch (e) {}
