import { state, GET, POST, esc, modal, toast, fail, formData, submitting, loadRefs, fmtPhone, can, money, fmtDayLong, ic, avatar, ROLE_LABEL } from './core.js';
import { newVisit, openVisit, newBlock } from './pages/visits.js';
import { openCheckout } from './pages/checkout.js';
import { quickClient } from './pages/clients.js';

const PAGES = {
  '': () => import('./pages/dashboard.js'),
  agenda: () => import('./pages/agenda.js'),
  vendas: () => import('./pages/sales.js'),
  clientes: () => import('./pages/clients.js'),
  equipe: () => import('./pages/team.js'),
  comissoes: () => import('./pages/commissions.js'),
  servicos: () => import('./pages/services.js'),
  estoque: () => import('./pages/stock.js'),
  financeiro: () => import('./pages/finance.js'),
  relatorios: () => import('./pages/reports.js'),
  config: () => import('./pages/settings.js'),
  assinatura: () => import('./pages/billing.js'),
  ajuda: () => import('./pages/help.js'),
};
const ADMIN = ['owner', 'manager'], STAFF = ['owner', 'manager', 'reception'];

function navItems() {
  const r = state.user.role;
  return [
    { k: '', ico: 'home', label: 'Início', group: 'Dia a dia' },
    { k: 'agenda', ico: 'calendar', label: 'Agenda', group: 'Dia a dia' },
    { k: 'clientes', ico: 'users', label: 'Clientes', group: 'Dia a dia' },
    { k: 'vendas', ico: 'cart', label: 'Vendas', roles: STAFF, group: 'Dia a dia' },
    { k: 'equipe', ico: 'sparkle', label: 'Equipe', roles: ADMIN, group: 'Gestão' },
    { k: 'servicos', ico: 'scissors', label: 'Serviços', roles: ADMIN, group: 'Gestão' },
    { k: 'estoque', ico: 'box', label: 'Estoque', roles: STAFF, group: 'Gestão' },
    { k: 'financeiro', ico: 'wallet', label: 'Financeiro', roles: ADMIN, group: 'Gestão' },
    { k: 'comissoes', ico: 'percent', label: r === 'pro' ? 'Minhas comissões' : 'Comissões', roles: [...ADMIN, 'pro'], group: 'Gestão' },
    { k: 'relatorios', ico: 'chart', label: 'Relatórios', roles: ADMIN, group: 'Gestão' },
    { k: 'config', ico: 'settings', label: 'Configurações', group: 'Conta' },
    { k: 'assinatura', ico: 'star', label: 'Assinatura', roles: ['owner'], group: 'Conta' },
    { k: 'ajuda', ico: 'message', label: 'Ajuda e sugestões', group: 'Conta' },
  ].filter((i) => (!i.roles || i.roles.includes(r)) && !(can.solo() && ['equipe', 'comissoes'].includes(i.k)) && !(!can.products() && i.k === 'estoque'));
}
/** Barra inferior do celular: as 4 áreas mais usadas de cada perfil + "Mais". */
function bottomItems() {
  const r = state.user.role;
  if (can.solo() && can.admin()) return ['', 'agenda', 'clientes', 'financeiro'].map((k) => navItems().find((i) => i.k === k)).filter(Boolean);
  const pick = { owner: ['', 'agenda', 'equipe', 'financeiro'], manager: ['', 'agenda', 'equipe', 'financeiro'], reception: ['', 'agenda', 'clientes', 'vendas'], pro: ['', 'agenda', 'clientes', 'comissoes'] }[r];
  const items = navItems();
  return pick.map((k) => items.find((i) => i.k === k)).filter(Boolean);
}

const brandMark = () => `<span class="mark"><img src="${esc(state.user.logo_url || '/brand/vyllorri-v-192.png')}" alt=""></span>`;

function shell() {
  const items = navItems();
  let group = '';
  const sideLinks = items.map((i) => {
    const head = i.group !== group ? `<div class="group">${(group = i.group)}</div>` : '';
    return `${head}<a class="nav" href="#/${i.k}" data-nav="${i.k}">${ic(i.ico, 20)}<span>${i.label}</span></a>`;
  }).join('');
  document.getElementById('app').innerHTML = `
  ${state.user.is_demo ? '<div class="demo-bar">Salão de DEMONSTRAÇÃO — os dados aqui são fictícios</div>' : ''}
  <div class="shell">
    <nav class="side" aria-label="Menu principal">
      <div class="logo">${brandMark()}<div class="name">Vyllorri<small>${esc(state.user.salon_name)}</small></div></div>
      <button class="btn primary block quick-btn" data-quick>${ic('plus', 18)} Novo</button>
      ${sideLinks}
      <div class="me">${avatar(state.user.name, null, 'sm')}<div style="min-width:0;flex:1"><b>${esc(state.user.name)}</b><span class="tiny">${ROLE_LABEL[state.user.role]}</span></div>
        <button class="icon-btn" data-logout aria-label="Sair" style="color:#c9b2ec">${ic('logout', 20)}</button></div>
    </nav>
    <div style="min-width:0">
      <header class="topbar">
        <div class="logo">${brandMark()}<div class="name">Vyllorri<small>${esc(state.user.salon_name)}</small></div></div>
        <div class="search">${ic('search', 18)}<input id="gsearch" type="search" placeholder="Buscar cliente, telefone, serviço…" autocomplete="off" aria-label="Busca"><div class="search-results hidden" id="gresults"></div></div>
        <span class="spacer"></span>
        <a class="tb-beta" href="#/ajuda" title="Estamos em testes: mande sua opinião">${ic('message', 15)}<span>Beta · Opinar</span></a>
        <button class="tb-btn tb-plus m-only" data-quick aria-label="Novo: agendamento, venda, cliente…">${ic('plus', 22)}</button>
        <button class="tb-btn m-only" data-msearch aria-label="Buscar">${ic('search', 20)}</button>
        <button class="tb-btn" data-bell aria-label="Notificações">${ic('bell', 20)}<span class="dot hidden" data-bell-count></span></button>
      </header>
      <div id="billbar"></div>
      <main class="main" id="page"></main>
    </div>
  </div>
  <nav class="bottom-nav" aria-label="Navegação">
    ${bottomItems().map((i) => `<a href="#/${i.k}" data-nav="${i.k}">${ic(i.ico, 22)}${i.k === 'comissoes' ? 'Comissões' : i.label}</a>`).join('')}
    <button data-more>${ic('grid', 22)}Mais</button>
  </nav>`;
  document.querySelectorAll('[data-quick]').forEach((b) => (b.onclick = quickActions));
  document.querySelector('[data-more]').onclick = moreMenu;
  document.querySelector('[data-logout]').onclick = logout;
  document.querySelector('[data-bell]').onclick = notifications;
  document.querySelector('[data-msearch]').onclick = mobileSearch;
  setupSearch(document.getElementById('gsearch'), document.getElementById('gresults'));
}

async function logout() {
  await POST('/api/auth/logout').catch(() => {});
  state.user = null;
  state.pros = [];
  location.hash = '#/entrar';
  boot();
}

/** "Mais": todas as áreas que não cabem na barra inferior, organizadas em blocos. */
function moreMenu() {
  const inBar = bottomItems().map((i) => i.k);
  const items = navItems().filter((i) => !inBar.includes(i.k));
  modal({
    title: 'Mais opções',
    body: `<div class="tiles">${items.map((i) => `<a href="#/${i.k}" data-close><span class="t-ic">${ic(i.ico, 22)}</span>${i.label}</a>`).join('')}
      <button data-close data-out><span class="t-ic">${ic('logout', 22)}</span>Sair</button></div>
      <p class="tiny muted" style="text-align:center;margin-top:14px">${esc(state.user.name)} · ${ROLE_LABEL[state.user.role]} · ${esc(state.user.salon_name)}</p>`,
    onMount(el) {
      el.querySelector('[data-out]').onclick = logout;
    },
  });
}

/** Atalhos para as tarefas mais frequentes. */
export function quickActions() {
  const admin = can.admin(), staff = can.staff();
  const A = (k, icon, label) => `<button data-q="${k}"><span class="t-ic">${ic(icon, 22)}</span>${label}</button>`;
  const close = modal({
    title: 'O que você quer fazer?',
    body: `<div class="tiles">${A('visit', 'calendar', 'Novo agendamento')}${A('fit', 'zap', 'Encaixe agora')}${A('sale', 'cart', 'Registrar venda')}${A('client', 'userPlus', 'Cadastrar cliente')}
      ${admin ? A('service', 'scissors', 'Adicionar serviço') + (can.solo() ? '' : A('pro', 'sparkle', 'Cadastrar profissional')) : ''}
      ${staff ? A('block', 'ban', 'Bloquear horário') : ''}${admin ? A('expense', 'wallet', 'Lançar despesa') : ''}</div>`,
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
          if (q === 'expense') location.hash = '#/financeiro?nova=1';
          if (q === 'service') location.hash = '#/servicos?novo=1';
          if (q === 'pro') location.hash = '#/equipe?nova=1';
        }));
    },
  });
}

// ---- Notificações: o que precisa de atenção, por tipo; as já vistas ficam marcadas ----
let attention = [];
const ALERT_IC = { online: 'globe', late: 'clock', checkout: 'receipt', receivable: 'coin', confirm: 'message', stock: 'box', bills: 'wallet', birthday: 'heart' };
const ALERT_GROUP = { online: 'Agenda', late: 'Agenda', confirm: 'Agenda', checkout: 'Agenda', receivable: 'Dinheiro', bills: 'Dinheiro', stock: 'Estoque', birthday: 'Clientes' };
const seenKey = () => `vb_vistas_${state.user?.id}`;
const alertKey = (a) => `${a.type}|${a.text}`;
function seen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(seenKey()) || '[]'));
  } catch {
    return new Set();
  }
}
function markSeen() {
  try {
    localStorage.setItem(seenKey(), JSON.stringify(attention.map(alertKey)));
  } catch {}
}
async function refreshBell() {
  if (can.pro() || state.user?.billing?.blocked) return;
  try {
    attention = (await GET('/api/dashboard')).attention || [];
  } catch {
    attention = [];
  }
  const fresh = attention.filter((a) => !seen().has(alertKey(a))).length;
  const dot = document.querySelector('[data-bell-count]');
  if (dot) (dot.textContent = fresh), dot.classList.toggle('hidden', !fresh);
}
export async function notifications() {
  await refreshBell();
  const was = seen();
  const groups = {};
  for (const a of attention) (groups[ALERT_GROUP[a.type] || 'Outros'] ||= []).push(a);
  modal({
    title: 'Notificações',
    body: attention.length
      ? Object.entries(groups).map(([g, list]) => `<h3 class="tiny muted" style="text-transform:uppercase;letter-spacing:.08em;margin:6px 0 8px">${g}</h3>
          ${list.map((a) => { const old = was.has(alertKey(a)); return `<a class="alert ${a.level}" href="${a.link}" data-close style="${old ? 'opacity:.6' : ''}"><span class="a-ic">${ic(ALERT_IC[a.type] || 'info', 18)}</span>
            <span style="flex:1">${esc(a.text)}${old ? '' : ' <span class="tag pink">nova</span>'}</span>${a.amount ? `<b>${money(a.amount)}</b>` : ''}</a>`; }).join('')}`).join('')
      : `<div class="empty"><div class="e-ic">${ic('checkCircle', 26)}</div><p>Tudo em dia. Nada precisa da sua atenção agora.</p></div>`,
  });
  markSeen();
  const dot = document.querySelector('[data-bell-count]');
  if (dot) dot.classList.add('hidden');
}

function mobileSearch() {
  modal({
    title: 'Buscar',
    body: `<div class="searchbox">${ic('search', 18)}<input type="search" placeholder="Cliente, telefone, serviço…" autofocus data-ms></div><div data-mr style="margin-top:10px"></div>`,
    onMount(el, close) {
      setupSearch(el.querySelector('[data-ms]'), el.querySelector('[data-mr]'), close, true);
    },
  });
}

function setupSearch(input, box, onPick = () => {}, inline = false) {
  let timer, seq = 0;
  const hide = () => !inline && box.classList.add('hidden');
  if (inline) box.className = 'search-results', box.style.cssText = 'position:static;box-shadow:none;border:0;max-height:none';
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return inline ? (box.innerHTML = '') : hide();
    timer = setTimeout(async () => {
      const my = ++seq;
      try {
        const r = await GET('/api/search?q=' + encodeURIComponent(q));
        if (my !== seq) return;
        const sec = (t, rows, fn) => (rows.length ? `<h4>${t}</h4>${rows.map(fn).join('')}` : '');
        box.innerHTML =
          sec('Clientes', r.clients, (c) => `<a href="#/clientes/${c.id}">${avatar(c.name, null, 'sm')}<span>${esc(c.name)} <span class="muted small">${fmtPhone(c.phone)}</span></span></a>`) +
          sec('Agendamentos', r.visits, (v) => `<a href="#" data-visit="${v.id}">${ic('calendar', 18, 'brand-t')}<span>${esc(v.client_name)} <span class="muted small">${fmtDayLong(v.start_at.slice(0, 10))} ${v.start_at.slice(11)} · ${esc(v.services)}</span></span></a>`) +
          sec('Serviços', r.services, (s) => `<a href="#/${can.admin() ? 'servicos' : 'agenda'}">${ic('scissors', 18, 'brand-t')}<span>${esc(s.name)} <span class="muted small">${money(s.price_cents)} · ${s.duration_min} min</span></span></a>`) +
          sec('Produtos', r.products, (p) => `<a href="#/estoque">${ic('box', 18, 'brand-t')}<span>${esc(p.name)} <span class="muted small">${p.stock} ${esc(p.unit)} em estoque</span></span></a>`) ||
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
    onPick();
  });
  if (!inline) document.addEventListener('click', (e) => !e.target.closest('.search') && hide());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') box.querySelector('a')?.click();
    if (e.key === 'Escape') (input.value = ''), hide();
  });
}

/** Faixa discreta: dias de teste restantes ou mensalidade perto de vencer (só para a proprietária). */
function billBar(key) {
  const el = document.getElementById('billbar');
  const b = state.user.billing;
  if (!el) return;
  let msg = '';
  if (can.owner() && b && key !== 'assinatura') {
    if (b.status === 'trial') msg = `${ic('star', 16)}<span><b>Teste grátis:</b> ${b.days_left === 1 ? 'hoje é o último dia' : `faltam ${b.days_left} dias`}</span><a href="#/assinatura">Assinar</a>`;
    else if (b.status === 'active' && b.overdue) msg = `${ic('alert', 16)}<span><b>Mensalidade vencida.</b> Pague para não pausar o acesso.</span><a href="#/assinatura">Pagar com Pix</a>`;
    else if (b.status === 'active' && b.due_soon) msg = `${ic('clock', 16)}<span>Sua mensalidade vence ${b.days_left === 0 ? 'hoje' : `em ${b.days_left} dia(s)`}.</span><a href="#/assinatura">Pagar com Pix</a>`;
  }
  el.className = msg ? `billbar ${b.overdue || (b.status === 'trial' && b.days_left <= 2) ? 'warn' : ''}` : '';
  el.innerHTML = msg;
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
  if (!state.user) return key === '' ? import('./landing.js').then((m) => m.landing()) : authScreen(key === 'criar' ? 'signup' : 'login');
  if (key === 'entrar' || key === 'criar') return (location.hash = '#/');
  if (!document.getElementById('page')) shell();
  // acesso pausado: só a tela de assinatura fica disponível
  if (state.user.billing?.blocked && !['assinatura', 'ajuda'].includes(key)) return (location.hash = '#/assinatura');
  billBar(key);
  const allowed = navItems().some((i) => i.k === key) || key === 'assinatura' || key === 'ajuda';
  const loader = PAGES[allowed ? key : ''];
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === (allowed ? key : '')));
  const page = document.getElementById('page');
  const token = (current = Symbol());
  if (!soft) page.innerHTML = '<div class="loading"><span class="spin"></span> Carregando…</div>';
  try {
    if (!state.user.billing?.blocked) await loadRefs();
    const mod = await loader();
    if (token !== current) return;
    const root = document.createElement('div');
    await mod.default(root, { id: rest[0], query: Object.fromEntries(new URLSearchParams(qs || '')) });
    if (token !== current) return;
    page.replaceChildren(root);
    if (!soft) window.scrollTo(0, 0);
    refreshBell();
  } catch (e) {
    if (token !== current) return;
    page.innerHTML = `<div class="empty" style="padding-top:60px"><div class="e-ic">${ic('alert', 26)}</div><p>${esc(e.message || 'Não foi possível carregar esta tela.')}</p><button class="btn primary" id="retry">Tentar novamente</button></div>`;
    page.querySelector('#retry').onclick = () => route();
  }
}
window.addEventListener('hashchange', () => route());

function authScreen(mode) {
  const signup = mode === 'signup';
  window.scrollTo(0, 0);
  const feat = (icon, t, s) => `<li><span>${ic(icon, 18)}</span><div><b>${t}</b><small>${s}</small></div></li>`;
  document.getElementById('app').innerHTML = `<div class="auth2">
    <aside class="au-brand">
      <a class="au-logo" href="#/" aria-label="Página inicial do Vyllorri"><img src="/brand/vyllorri-v-transparente-256.png" alt=""><div><b>Vyllorri</b><small>Beauty</small></div></a>
      <div class="au-pitch">
        <h1>A gestão do seu salão, <em>na palma da mão.</em></h1>
        <p>Agenda, clientes, vendas e financeiro em um só lugar — simples de usar no dia a dia.</p>
        <ul class="au-feats">
          ${feat('calendar', 'Agenda online 24h', 'Seus clientes marcam pelo link pelo link do salão')}
          ${feat('wallet', 'Sinal por Pix', 'Menos faltas, com o comprovante direto no app')}
          ${feat('chart', 'Financeiro claro', 'Quanto vendeu, gastou e lucrou, sem planilha')}
        </ul>
      </div>
      <p class="au-copy">© ${new Date().getFullYear()} Vyllorri Beauty</p>
    </aside>
    <main class="au-main"><form class="au-form" novalidate>
      <div class="au-head"><h2>${signup ? 'Crie a conta do seu salão' : 'Que bom te ver de novo'}</h2>
        <p>${signup ? 'Leva 1 minuto. Você já começa usando.' : 'Entre para ver a agenda de hoje.'}</p></div>
      ${signup ? `<label class="field"><span>Nome do salão</span><div class="au-in">${ic('home', 18)}<input name="salon_name" required maxlength="80" autofocus placeholder="Ex.: Studio Bella"></div></label>
        <label class="field"><span>Seu nome</span><div class="au-in">${ic('user', 18)}<input name="name" required maxlength="80" autocomplete="name" placeholder="Como quer ser chamada"></div></label>
        <fieldset class="field" style="border:0;padding:0;margin:0 0 12px"><legend class="au-legend">Como você trabalha?</legend>
          <div class="mode-pick">
            <label><input type="radio" name="team_mode" value="solo" class="sr"><span>${ic('user', 22)}<b>Trabalho solo</b><small>Só eu atendo</small></span></label>
            <label><input type="radio" name="team_mode" value="team" class="sr" checked><span>${ic('users', 22)}<b>Tenho equipe</b><small>Mais profissionais</small></span></label>
          </div><small>Dá para mudar depois em Configurações.</small></fieldset>` : ''}
      <label class="field"><span>E-mail</span><div class="au-in">${ic('mail', 18)}<input name="email" type="email" required autocomplete="email" inputmode="email" placeholder="voce@email.com" ${signup ? '' : 'autofocus'}></div></label>
      <label class="field"><span>Senha</span><div class="au-in">${ic('lock', 18)}<input name="password" type="password" required minlength="8" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? 'Mínimo de 8 caracteres' : 'Sua senha'}">
        <button type="button" class="au-eye" data-eye aria-label="Mostrar senha">${ic('eye', 18)}</button></div></label>
      <label class="field" data-code hidden><span>Código de verificação</span><div class="au-in">${ic('lock', 18)}<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="11" placeholder="6 números do app autenticador"></div>
        <small>Abra o seu aplicativo autenticador (Google Authenticator, Microsoft Authenticator…). Sem o celular? Use um código de recuperação.</small></label>
      <button class="btn primary block au-submit" type="submit">${signup ? 'Criar meu salão' : 'Entrar'} ${ic('arrowRight', 18)}</button>
      <p class="au-safe">${ic('lock', 14)} Conexão segura · seus dados ficam protegidos</p>
      <div class="au-sep"><span>${signup ? 'Já tem conta?' : 'Ainda não usa o Vyllorri?'}</span></div>
      <a class="btn block au-alt" href="${signup ? '#/entrar' : '#/criar'}">${signup ? 'Entrar na minha conta' : 'Criar conta do salão'}</a>
    </form></main>
  </div>`;
  const form = document.querySelector('.au-form');
  const eye = form.querySelector('[data-eye]');
  eye.onclick = () => {
    const p = form.password;
    p.type = p.type === 'password' ? 'text' : 'password';
    eye.setAttribute('aria-label', p.type === 'password' ? 'Mostrar senha' : 'Esconder senha');
    eye.classList.toggle('on', p.type === 'text');
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('.au-submit');
    try {
      const data = formData(form);
      if (!data.code) delete data.code;
      btn.disabled = true;
      await POST(signup ? '/api/auth/signup' : '/api/auth/login', data);
      await boot();
      if (signup) import('./tutorial.js').then((m) => m.openTutorial());
      if (signup) toast(data.team_mode === 'solo' ? 'Pronto! Agora cadastre seus serviços e confira seus horários.' : 'Salão criado! Comece cadastrando sua equipe e seus serviços.');
    } catch (err) {
      // conta com verificação em 2 etapas: mostra o campo do código
      if (err?.data?.code === '2fa') {
        const box = form.querySelector('[data-code]');
        const first = box.hidden;
        box.hidden = false;
        form.code.focus();
        if (!first || form.code.value) toast(err.message, 'err');
      } else toast(err?.message || 'Algo deu errado', 'err');
    } finally {
      btn.disabled = false;
    }
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
