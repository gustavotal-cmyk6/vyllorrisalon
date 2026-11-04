import { state, GET, POST, esc, modal, toast, fail, formData, submitting, loadRefs, fmtPhone, fmtShort, can, money, fmtDayLong } from './core.js';
import { newVisit, openVisit, newBlock } from './pages/visits.js';
import { openCheckout } from './pages/checkout.js';
import { quickClient } from './pages/clients.js';

const PAGES = {
  '': () => import('./pages/dashboard.js'),
  agenda: () => import('./pages/agenda.js'),
  vendas: () => import('./pages/sales.js'),
  clientes: () => import('./pages/clients.js'),
  equipe: () => import('./pages/team.js'),
  servicos: () => import('./pages/services.js'),
  estoque: () => import('./pages/stock.js'),
  financeiro: () => import('./pages/finance.js'),
  relatorios: () => import('./pages/reports.js'),
  config: () => import('./pages/settings.js'),
};

function navItems() {
  const r = state.user.role;
  const all = [
    { k: '', ico: '◉', label: 'Início' },
    { k: 'agenda', ico: '📅', label: 'Agenda' },
    { k: 'vendas', ico: '🧾', label: 'Vendas', roles: ['owner', 'reception'] },
    { k: 'clientes', ico: '👩', label: 'Clientes' },
    { k: 'equipe', ico: '💇', label: r === 'pro' ? 'Minhas comissões' : 'Equipe e comissões', roles: ['owner', 'pro'] },
    { k: 'servicos', ico: '✂️', label: 'Serviços e preços', roles: ['owner'] },
    { k: 'estoque', ico: '🧴', label: 'Estoque', roles: ['owner', 'reception'] },
    { k: 'financeiro', ico: '💰', label: 'Financeiro', roles: ['owner'] },
    { k: 'relatorios', ico: '📊', label: 'Relatórios', roles: ['owner'] },
    { k: 'config', ico: '⚙️', label: 'Configurações' },
  ];
  return all.filter((i) => !i.roles || i.roles.includes(r));
}

function shell() {
  const items = navItems();
  const third = can.staff() ? { k: 'vendas', ico: '🧾', label: 'Vendas' } : { k: 'clientes', ico: '👩', label: 'Clientes' };
  document.getElementById('app').innerHTML = `
  ${state.user.is_demo ? '<div class="demo-bar">Salão de DEMONSTRAÇÃO — os dados aqui são fictícios</div>' : ''}
  <div class="shell">
    <nav class="side" aria-label="Menu">
      <div class="brand"><img src="/icon.svg" alt=""><div>Vyllorri Beauty<small>${esc(state.user.salon_name)}</small></div></div>
      <button class="btn primary block" data-quick>＋ Ação rápida</button>
      ${items.map((i) => `${i.k === 'config' ? '<div class="sep"></div>' : ''}<a href="#/${i.k}" data-nav="${i.k}"><span>${i.ico}</span>${i.label}</a>`).join('')}
      <a href="#" data-logout><span>↩</span>Sair</a>
    </nav>
    <div>
      <header class="topbar">
        <div class="brand"><img src="/icon.svg" alt=""><div>Vyllorri<small>${esc(state.user.salon_name)}</small></div></div>
        <div class="search"><input id="gsearch" type="search" placeholder="Buscar cliente, telefone, serviço…" autocomplete="off" aria-label="Busca global"><div class="search-results hidden" id="gresults"></div></div>
      </header>
      <main class="main" id="page"></main>
    </div>
  </div>
  <nav class="bottom-nav" aria-label="Navegação">
    <a href="#/" data-nav=""><span class="ico">◉</span>Início</a>
    <a href="#/agenda" data-nav="agenda"><span class="ico">📅</span>Agenda</a>
    <button class="fab" data-quick aria-label="Ação rápida"><span class="ico">＋</span></button>
    <a href="#/${third.k}" data-nav="${third.k}"><span class="ico">${third.ico}</span>${third.label}</a>
    <button data-more><span class="ico">☰</span>Mais</button>
  </nav>`;
  document.querySelectorAll('[data-quick]').forEach((b) => (b.onclick = quickActions));
  document.querySelector('[data-more]').onclick = moreMenu;
  document.querySelector('[data-logout]').onclick = (e) => (e.preventDefault(), logout());
  setupSearch();
}

async function logout() {
  await POST('/api/auth/logout').catch(() => {});
  state.user = null;
  state.pros = [];
  location.hash = '#/entrar';
  boot();
}

function moreMenu() {
  const items = navItems();
  modal({
    title: 'Menu',
    body: `<div class="sheet-actions">${items.map((i) => `<a class="btn" href="#/${i.k}" data-close>${i.ico} ${i.label}</a>`).join('')}
      <button class="btn" data-close data-out>↩ Sair</button></div>`,
    onMount(el) {
      el.querySelector('[data-out]').onclick = logout;
    },
  });
}

/** Atalhos para as tarefas mais frequentes do dia a dia. */
export function quickActions() {
  const staff = can.staff();
  const close = modal({
    title: 'O que você quer fazer?',
    body: `<div class="sheet-actions">
      <button class="btn primary" data-q="visit">📅 Novo agendamento</button>
      <button class="btn" data-q="fit">⚡ Encaixe agora</button>
      <button class="btn" data-q="sale">🧾 Registrar venda</button>
      <button class="btn" data-q="client">👩 Nova cliente</button>
      ${staff ? '<button class="btn" data-q="block">⛔ Bloquear horário</button>' : ''}
      ${can.owner() ? '<a class="btn" href="#/financeiro?nova=1" data-close>💸 Lançar despesa</a>' : ''}
    </div>`,
    onMount(el) {
      el.querySelectorAll('[data-q]').forEach((b) =>
        (b.onclick = async () => {
          close();
          await loadRefs();
          const q = b.dataset.q;
          if (q === 'visit') newVisit({ onSaved: refresh });
          if (q === 'fit') newVisit({ fitIn: true, onSaved: refresh });
          if (q === 'sale') openCheckout({ onDone: refresh });
          if (q === 'client') quickClient({ onSaved: (id) => (location.hash = `#/clientes/${id}`) });
          if (q === 'block') newBlock({ onSaved: refresh });
        }));
    },
  });
}

function setupSearch() {
  const input = document.getElementById('gsearch');
  const box = document.getElementById('gresults');
  let timer, seq = 0;
  const hide = () => box.classList.add('hidden');
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return hide();
    timer = setTimeout(async () => {
      const my = ++seq;
      try {
        const r = await GET('/api/search?q=' + encodeURIComponent(q));
        if (my !== seq) return;
        const sec = (t, rows, fn) => (rows.length ? `<h4>${t}</h4>${rows.map(fn).join('')}` : '');
        box.innerHTML =
          sec('Clientes', r.clients, (c) => `<a href="#/clientes/${c.id}">${esc(c.name)} <span class="muted small">${fmtPhone(c.phone)}</span></a>`) +
          sec('Agendamentos', r.visits, (v) => `<a href="#" data-visit="${v.id}">${esc(v.client_name)} <span class="muted small">${fmtDayLong(v.start_at.slice(0, 10))} ${v.start_at.slice(11)} · ${esc(v.services)}</span></a>`) +
          sec('Serviços', r.services, (s) => `<a href="#/${can.owner() ? 'servicos' : 'agenda'}">${esc(s.name)} <span class="muted small">${money(s.price_cents)} · ${s.duration_min} min</span></a>`) +
          sec('Produtos', r.products, (p) => `<a href="#/estoque">${esc(p.name)} <span class="muted small">${p.stock} ${esc(p.unit)} em estoque</span></a>`) ||
          '<p class="muted small" style="padding:12px">Nada encontrado.</p>';
        box.classList.remove('hidden');
      } catch (e) {
        fail(e);
      }
    }, 220);
  });
  box.addEventListener('click', async (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    if (a.dataset.visit) {
      e.preventDefault();
      await loadRefs();
      openVisit(Number(a.dataset.visit), refresh);
    }
    input.value = '';
    hide();
  });
  document.addEventListener('click', (e) => !e.target.closest('.search') && hide());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') box.querySelector('a')?.click();
    if (e.key === 'Escape') (input.value = ''), hide();
  });
}

// ---- Roteamento ----
let current = null;
export function refresh() {
  route(true);
}
async function route(soft = false) {
  const hash = location.hash.slice(2) || '';
  const [path, qs] = hash.split('?');
  const [key, ...rest] = path.split('/');
  if (!state.user) return authScreen(key === 'criar' ? 'signup' : 'login');
  if (key === 'entrar' || key === 'criar') return (location.hash = '#/');
  if (!document.getElementById('page')) shell();
  const allowed = navItems().some((i) => i.k === key);
  const loader = PAGES[allowed ? key : ''];
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === (allowed ? key : '')));
  const page = document.getElementById('page');
  const token = (current = Symbol());
  if (!soft) page.innerHTML = '<div class="loading"><span class="spin"></span> Carregando…</div>';
  try {
    await loadRefs();
    const mod = await loader();
    if (token !== current) return;
    const root = document.createElement('div');
    await mod.default(root, { id: rest[0], query: Object.fromEntries(new URLSearchParams(qs || '')) });
    if (token !== current) return;
    page.replaceChildren(root);
    if (!soft) window.scrollTo(0, 0);
  } catch (e) {
    if (token !== current) return;
    page.innerHTML = `<div class="empty"><p>${esc(e.message || 'Não foi possível carregar esta tela.')}</p><button class="btn" id="retry">Tentar novamente</button></div>`;
    page.querySelector('#retry').onclick = () => route();
  }
}
window.addEventListener('hashchange', () => route());

function authScreen(mode) {
  const signup = mode === 'signup';
  document.getElementById('app').innerHTML = `<div class="auth"><form class="box" novalidate>
    <div class="logo"><img src="/icon.svg" alt=""><h1>Vyllorri Beauty</h1><p>${signup ? 'Crie a conta do seu salão em 1 minuto' : 'Gestão simples para o seu salão'}</p></div>
    ${signup ? `<label class="field"><span>Nome do salão</span><input name="salon_name" required maxlength="80" autofocus></label>
      <label class="field"><span>Seu nome</span><input name="name" required maxlength="80" autocomplete="name"></label>` : ''}
    <label class="field"><span>E-mail</span><input name="email" type="email" required autocomplete="email" ${signup ? '' : 'autofocus'}></label>
    <label class="field"><span>Senha</span><input name="password" type="password" required minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}">
      ${signup ? '<small>Mínimo de 8 caracteres</small>' : ''}</label>
    <button class="btn primary block" type="submit">${signup ? 'Criar meu salão' : 'Entrar'}</button>
    <p class="switch">${signup ? 'Já tem conta? <a href="#/entrar">Entrar</a>' : 'Novo por aqui? <a href="#/criar">Criar conta do salão</a>'}</p>
  </form></div>`;
  const form = document.querySelector('.auth form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    await submitting(form.querySelector('button'), async () => {
      await POST(signup ? '/api/auth/signup' : '/api/auth/login', formData(form));
      await boot();
      if (signup) toast('Salão criado! Comece cadastrando sua equipe e seus serviços.');
    }).catch(() => {});
  };
}

async function boot() {
  try {
    const { user } = await GET('/api/me');
    state.user = user;
  } catch {
    state.user = null;
  }
  state.pros = [];
  document.getElementById('app').innerHTML = '';
  if (state.user && (location.hash === '#/entrar' || location.hash === '#/criar')) location.hash = '#/';
  route();
}
boot();
