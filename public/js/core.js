// Utilitários compartilhados da interface: API, formatação, modais, avisos e roteamento.
import { ic } from './icons.js';
export { ic };
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
export const initials = (n) => (String(n || '?').match(/\p{L}[\p{L}'-]*/gu) || ['?']).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

export const STATUS = {
  scheduled: { label: 'A confirmar', cls: 'st-scheduled' },
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
  // proprietária ou gerente: gestão completa (financeiro, comissões, equipe, relatórios)
  admin: () => ['owner', 'manager'].includes(state.user?.role),
  staff: () => ['owner', 'manager', 'reception'].includes(state.user?.role),
  pro: () => state.user?.role === 'pro',
  // trabalha sozinha: sem telas de equipe, ela é a única profissional
  solo: () => state.user?.team_mode === 'solo',
};
/** A profissional da dona, no modo "trabalho sozinha". */
export const soloPro = () => state.pros.find((p) => p.id === state.user?.professional_id) || state.pros.find((p) => p.active);
export const ROLE_LABEL = { owner: 'Proprietária', manager: 'Gerente', reception: 'Recepção', pro: 'Profissional' };

/** Avatar com foto ou iniciais; a cor do degradê varia com o nome. */
const AV_GRADS = [['#9d5ce8', '#ef6cb2'], ['#5b17a6', '#9d5ce8'], ['#d63d92', '#f6a5cf'], ['#7a2fd0', '#c6a4f1'], ['#4e1590', '#d63d92']];
export function avatar(name, photo = null, cls = '') {
  if (photo) return `<span class="avatar ${cls}"><img src="${esc(photo)}" alt="" loading="lazy"></span>`;
  const n = [...String(name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_GRADS.length;
  return `<span class="avatar ${cls}" style="background:linear-gradient(140deg,${AV_GRADS[n][0]},${AV_GRADS[n][1]})">${esc(initials(name))}</span>`;
}

/** Reduz a foto no próprio aparelho e envia; devolve { id, url }. */
export function pickImage({ max = 900, square = false } = {}) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const img = await new Promise((ok, bad) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.onerror = () => bad(new Error('Não foi possível ler esta imagem.'));
          i.src = URL.createObjectURL(file);
        });
        let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
        if (square) {
          const m = Math.min(sw, sh);
          sx = (sw - m) / 2; sy = (sh - m) / 2; sw = sh = m;
        }
        const scale = Math.min(1, max / Math.max(sw, sh));
        const c = document.createElement('canvas');
        c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
        c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(await POST('/api/images', { data: c.toDataURL('image/jpeg', 0.84) }));
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
/** Campo de foto reutilizável: devolve { get() } com o id atual. */
export function photoField(box, { current = null, label = 'Foto', round = false, wide = false, max = 900 } = {}) {
  let value = current;
  const draw = () => {
    box.innerHTML = `<div class="photo-pick"><div class="ph ${round ? 'round' : ''} ${wide ? 'wide' : ''}">${value ? `<img src="${esc(value)}" alt="">` : ic('camera', 26)}</div>
      <div class="c" style="display:flex;flex-direction:column;gap:6px"><b class="small">${esc(label)}</b><div style="display:flex;gap:6px;flex-wrap:wrap">
      <button type="button" class="btn sm soft" data-up>${ic('image', 16)} ${value ? 'Trocar' : 'Enviar foto'}</button>${value ? '<button type="button" class="btn sm ghost" data-rm>Remover</button>' : ''}</div></div></div>`;
    box.querySelector('[data-up]').onclick = async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const r = await pickImage({ max, square: round });
        if (r) (value = r.url), draw();
      } catch (err) {
        fail(err);
      } finally {
        b.disabled = false;
      }
    };
    box.querySelector('[data-rm]')?.addEventListener('click', () => ((value = null), draw()));
  };
  draw();
  return { get: () => value };
}

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
    <header><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fechar">${ic('x', 20)}</button></header>
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
    if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else if (el.type === 'checkbox') {
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
/** Faixa roxa de título da página. */
export const pageHead = (title, sub = '', actions = '', extra = '') =>
  `<div class="page-head"><div style="position:relative;z-index:1;min-width:0">${extra}<h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
export const empty = (text, action = '', icon = 'sparkle') => `<div class="empty"><div class="e-ic">${ic(icon, 26)}</div><p>${esc(text)}</p>${action}</div>`;
/** Selo de variação percentual (verde subiu, vermelho caiu). */
export const trend = (v, suffix = '') => (v == null ? '<small class="muted">sem dados anteriores para comparar</small>' : `<span class="trend ${v > 0 ? 'up' : v < 0 ? 'down' : 'flat'}">${ic(v >= 0 ? 'trendUp' : 'trendDown', 13)} ${pct(v)}${suffix}</span>`);

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
