// Utilitários compartilhados da interface: API, formatação, modais, avisos e roteamento.
export const state = { user: null, methods: [], pros: [], services: [], categories: [] };

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || 'Erro de comunicação');
    this.status = status;
    this.data = data || {};
  }
}

export async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, { error: 'Sem conexão com o servidor. Verifique a internet.' });
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/auth')) {
    state.user = null;
    location.hash = '#/entrar';
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
export const GET = (u) => api('GET', u);
export const POST = (u, b) => api('POST', u, b || {});
export const PUT = (u, b) => api('PUT', u, b || {});
export const DEL = (u) => api('DELETE', u);

// ---- Formatação ----
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const money = (c) => ((c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const moneyIn = (c) => (c == null ? '' : ((c || 0) / 100).toFixed(2).replace('.', ','));
export function toCents(v) {
  if (v === '' || v == null) return null;
  let s = String(v).trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => ymd(new Date());
export const nowHM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const addDays = (s, n) => {
  const d = new Date(s + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const addMinutes = (dt, m) => {
  const d = new Date(dt.replace(' ', 'T') + ':00');
  d.setMinutes(d.getMinutes() + m);
  return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fmtDate = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');
export const fmtShort = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—');
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const WDL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const weekday = (s, long) => (long ? WDL : WD)[new Date(s + 'T12:00:00').getDay()];
export const fmtDayLong = (s) => {
  const t = todayStr();
  const rel = s === t ? 'Hoje' : s === addDays(t, 1) ? 'Amanhã' : s === addDays(t, -1) ? 'Ontem' : weekday(s, true);
  return `${rel}, ${fmtShort(s)}`;
};
export const fmtPhone = (p) => {
  if (!p) return '';
  const d = String(p).replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
};
export const waLink = (p, text = '') => {
  const d = String(p || '').replace(/\D/g, '');
  return d ? `https://wa.me/${d.length <= 11 ? '55' + d : d}${text ? '?text=' + encodeURIComponent(text) : ''}` : null;
};
export const pct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${String(v).replace('.', ',')}%`);
export const initials = (n) => (n || '?').split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

export const STATUS = {
  scheduled: { label: 'Agendado', cls: 'st-scheduled' },
  confirmed: { label: 'Confirmado', cls: 'st-confirmed' },
  waiting: { label: 'Chegou', cls: 'st-waiting' },
  in_progress: { label: 'Em atendimento', cls: 'st-progress' },
  completed: { label: 'Concluído', cls: 'st-completed' },
  cancelled: { label: 'Cancelado', cls: 'st-cancelled' },
  no_show: { label: 'Faltou', cls: 'st-noshow' },
};
export const badge = (s) => `<span class="badge ${STATUS[s]?.cls}">${STATUS[s]?.label || s}</span>`;
export const can = {
  owner: () => state.user?.role === 'owner',
  staff: () => ['owner', 'reception'].includes(state.user?.role),
  pro: () => state.user?.role === 'pro',
};

// ---- Avisos ----
export function toast(msg, type = 'ok') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}
export const fail = (e) => toast(e?.message || 'Algo deu errado', 'err');

// ---- Modais (viram "bottom sheet" no celular) ----
const stack = [];
const closeHooks = new Map();
export function modal({ title, body, wide = false, onMount }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fechar">✕</button></header>
    <div class="modal-body">${body}</div></div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  const close = () => {
    wrap.remove();
    stack.splice(stack.indexOf(close), 1);
    if (!stack.length) document.body.classList.remove('no-scroll');
    closeHooks.get(close)?.();
    closeHooks.delete(close);
  };
  stack.push(close);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
  });
  const el = wrap.querySelector('.modal');
  onMount?.(el, close);
  setTimeout(() => el.querySelector('[autofocus]')?.focus(), 50);
  return close;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) stack[stack.length - 1]();
});

export function confirmBox(text, { ok = 'Confirmar', danger = false, input = null } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const close = modal({
      title: 'Confirmar',
      body: `<p class="confirm-text">${esc(text)}</p>
        ${input ? `<label class="field"><span>${esc(input)}</span><input name="v" autofocus maxlength="200"></label>` : ''}
        <div class="actions"><button class="btn ghost" data-close>Voltar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button></div>`,
      onMount(el, c) {
        el.querySelector('[data-ok]').onclick = () => {
          const v = input ? el.querySelector('[name=v]').value.trim() : true;
          if (input && !v) return toast('Preencha o campo', 'err');
          done = true;
          c();
          resolve(v);
        };
      },
    });
    closeHooks.set(close, () => !done && resolve(false));
  });
}

/** Lê os campos de um formulário. Campos com data-money viram centavos. */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.multi) (out[el.name] ||= []).push(...(el.checked ? [el.value] : []));
      else out[el.name] = el.checked;
    } else if (el.dataset.money !== undefined) {
      const c = toCents(el.value);
      if (Number.isNaN(c)) throw new Error(`Valor inválido em "${el.closest('label')?.querySelector('span')?.textContent || el.name}"`);
      out[el.name] = c;
    } else out[el.name] = el.value;
  }
  return out;
}

/** Envia um formulário com estado de carregamento e mensagens de erro claras. */
export async function submitting(btn, fn) {
  if (btn.disabled) return;
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>';
  try {
    return await fn();
  } catch (e) {
    if (!e?.silent) fail(e);
    throw e;
  } finally {
    btn.disabled = false;
    btn.innerHTML = old;
  }
}

export function bind(root, handlers) {
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t || !root.contains(t)) return;
    const h = handlers[t.dataset.act];
    if (h) {
      e.preventDefault();
      h(t, e);
    }
  });
}

export const loading = () => '<div class="loading"><span class="spin"></span> Carregando…</div>';
export const empty = (text, action = '') => `<div class="empty"><p>${esc(text)}</p>${action}</div>`;

export function periodPicker(id, current = 'month') {
  return `<div class="period" id="${id}">
    <div class="seg">${[['today', 'Hoje'], ['week', 'Semana'], ['month', 'Mês'], ['lastmonth', 'Mês passado'], ['custom', 'Período']]
      .map(([k, l]) => `<button data-p="${k}" class="${k === current ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="custom-range hidden"><input type="date" name="from"><span>até</span><input type="date" name="to"><button class="btn sm primary" data-apply>Aplicar</button></div>
  </div>`;
}
export function rangeFor(p) {
  const t = todayStr();
  const d = new Date(t + 'T12:00:00');
  if (p === 'today') return { from: t, to: t };
  if (p === 'week') {
    const dow = (d.getDay() + 6) % 7;
    return { from: addDays(t, -dow), to: addDays(t, 6 - dow) };
  }
  if (p === 'lastmonth') {
    const first = new Date(d.getFullYear(), d.getMonth() - 1, 1), last = new Date(d.getFullYear(), d.getMonth(), 0);
    return { from: ymd(first), to: ymd(last) };
  }
  const first = new Date(d.getFullYear(), d.getMonth(), 1), last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: ymd(first), to: ymd(last) };
}
export function mountPeriod(root, id, onChange, initial = 'month') {
  const el = root.querySelector('#' + id);
  const custom = el.querySelector('.custom-range');
  let cur = rangeFor(initial);
  el.querySelector('[name=from]').value = cur.from;
  el.querySelector('[name=to]').value = cur.to;
  el.querySelectorAll('[data-p]').forEach((b) =>
    b.addEventListener('click', () => {
      el.querySelectorAll('[data-p]').forEach((x) => x.classList.toggle('on', x === b));
      if (b.dataset.p === 'custom') return custom.classList.remove('hidden');
      custom.classList.add('hidden');
      cur = rangeFor(b.dataset.p);
      onChange(cur);
    }));
  el.querySelector('[data-apply]').addEventListener('click', () => {
    const from = el.querySelector('[name=from]').value, to = el.querySelector('[name=to]').value;
    if (!from || !to || to < from) return toast('Período inválido', 'err');
    onChange((cur = { from, to }));
  });
  onChange(cur);
}
export const rangeLabel = ({ from, to }) => (from === to ? fmtDate(from) : `${fmtDate(from)} a ${fmtDate(to)}`);

/** Barras horizontais simples para rankings. */
export function bars(rows, { label = (r) => r.name, value = (r) => r.total, fmt = money, sub = null } = {}) {
  if (!rows.length) return '<p class="muted small">Sem dados no período.</p>';
  const max = Math.max(...rows.map(value), 1);
  return `<ul class="bars">${rows.map((r) => `<li><div class="bar-top"><span>${esc(label(r))}</span><b>${fmt(value(r))}</b></div>
    <div class="bar"><i style="width:${Math.max(2, (value(r) / max) * 100)}%"></i></div>${sub ? `<small class="muted">${sub(r)}</small>` : ''}</li>`).join('')}</ul>`;
}

export async function loadRefs(force = false) {
  if (!force && state.pros.length) return;
  const [pros, services, methods, categories] = await Promise.all([GET('/api/professionals'), GET('/api/services'), GET('/api/payment-methods'), GET('/api/categories')]);
  Object.assign(state, { pros, services, methods: methods.filter((m) => m.active), categories });
}
export const proById = (id) => state.pros.find((p) => p.id === id);
