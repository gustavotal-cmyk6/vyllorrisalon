import { state, GET, POST, esc, todayStr, addDays, fmtDayLong, weekday, fmtShort, badge, can, empty, STATUS, ic, avatar, pageHead, toast, fail } from '../core.js';
import { newVisit, openVisit, newBlock, removeBlock } from './visits.js';
import { openCheckout } from './checkout.js';
import { refresh } from '../app.js';

const view = { mode: 'day', date: null, pro: '', service: '', status: 'active' };
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const STATUS_FILTERS = [['active', 'Ativos'], ['scheduled', 'A confirmar'], ['completed', 'Concluídos'], ['cancelled', 'Cancelados'], ['all', 'Todos']];
const NEXT = { scheduled: ['confirmed', 'Confirmar', 'check'], confirmed: ['waiting', 'Chegou', 'user'], waiting: ['in_progress', 'Iniciar', 'play'], in_progress: ['checkout', 'Concluir e receber', 'receipt'] };

const weekStart = (d) => addDays(d, -((new Date(d + 'T12:00:00').getDay() + 6) % 7));
function rangeOf(mode, date) {
  if (mode === 'day') return { from: date, to: date };
  if (mode === 'week') return { from: weekStart(date), to: addDays(weekStart(date), 6) };
  const first = date.slice(0, 8) + '01';
  const last = addDays(addDays(first, 32).slice(0, 8) + '01', -1);
  return { from: weekStart(first), to: addDays(weekStart(last), 6), first, last };
}

export default async function agenda(root, { query }) {
  if (query.data && query.data !== view.fromLink) view.date = view.fromLink = query.data;
  view.date ||= todayStr();
  if (can.pro()) view.pro = String(state.user.professional_id);
  const r = rangeOf(view.mode, view.date);
  const data = await GET(`/api/agenda?from=${r.from}&to=${r.to}${view.pro ? '&professional_id=' + view.pro : ''}`);
  // filtros de serviço e situação
  data.visits = data.visits.filter((v) =>
    (!view.service || v.items.some((i) => String(i.service_id) === view.service)) &&
    (view.status === 'all' || (view.status === 'active' ? !['cancelled', 'no_show'].includes(v.status) : view.status === 'cancelled' ? ['cancelled', 'no_show'].includes(v.status) : v.status === view.status)));
  const pros = state.pros.filter((p) => p.active && (!view.pro || String(p.id) === view.pro));
  const title = view.mode === 'day' ? fmtDayLong(view.date) : view.mode === 'week' ? `Semana de ${fmtShort(r.from)} a ${fmtShort(r.to)}` : `${MONTHS[Number(view.date.slice(5, 7)) - 1]} de ${view.date.slice(0, 4)}`;
  const activeFilters = (view.pro && !can.pro() ? 1 : 0) + (view.service ? 1 : 0);
  const counts = { total: data.visits.length, pend: data.visits.filter((v) => v.status === 'scheduled').length, done: data.visits.filter((v) => v.status === 'completed').length };

  root.innerHTML = `
  ${pageHead('Agenda', `${title} · ${counts.total} agendamento(s)${counts.pend ? ` · ${counts.pend} a confirmar` : ''}`,
    `${can.staff() ? `<button class="btn" data-act="block">${ic('ban', 18)} Bloquear</button>` : ''}<button class="btn primary" data-act="new">${ic('plus', 18)} Agendar</button>`,
    `<div class="seg" style="margin-bottom:12px">${[['day', 'Dia'], ['week', 'Semana'], ['month', 'Mês']].map(([k, l]) => `<button data-mode="${k}" class="${view.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>`)}
  <div class="agenda-bar">
    <div class="date-nav"><button class="icon-btn" data-act="prev" aria-label="Anterior">${ic('chevLeft', 20)}</button><b>${view.mode === 'month' ? `${MONTHS[Number(view.date.slice(5, 7)) - 1]}` : view.mode === 'week' ? `${fmtShort(r.from)} – ${fmtShort(r.to)}` : `${weekday(view.date)}, ${fmtShort(view.date)}`}</b><button class="icon-btn" data-act="next" aria-label="Próximo">${ic('chevRight', 20)}</button></div>
    <button class="btn sm" data-act="today">Hoje</button>
    <button class="btn sm m-filter" data-act="filters" aria-expanded="${view.filtersOpen ? 'true' : 'false'}">${ic('filter', 16)} Filtros${activeFilters ? ` (${activeFilters})` : ''}</button>
    <div class="agenda-filters ${view.filtersOpen ? 'open' : ''}">
    <input type="date" value="${view.date}" data-pick style="width:auto;min-height:40px" aria-label="Ir para data">
    ${can.pro() || can.solo() ? '' : `<select data-pro aria-label="Profissional"><option value="">Todas as profissionais</option>${state.pros.filter((p) => p.active).map((p) => `<option value="${p.id}" ${String(p.id) === view.pro ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`}
    <select data-svc aria-label="Serviço"><option value="">Todos os serviços</option>${state.services.map((s) => `<option value="${s.id}" ${String(s.id) === view.service ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    </div>
  </div>
  <div class="chips scroll" style="margin-bottom:14px">${STATUS_FILTERS.map(([k, l]) => `<button class="chip ${view.status === k ? 'on' : ''}" data-st="${k}">${l}</button>`).join('')}</div>
  ${view.mode === 'day' ? dayStrip(view.date) : ''}
  <div data-body></div>
`;

  const body = root.querySelector('[data-body]');
  if (!state.pros.length) body.innerHTML = `<div class="card">${empty('Nenhuma profissional cadastrada ainda.', can.admin() ? '<a class="btn primary" href="#/equipe?nova=1">Cadastrar equipe</a>' : '', 'users')}</div>`;
  else if (view.mode === 'week') body.innerHTML = weekView(data, r.from);
  else if (view.mode === 'month') body.innerHTML = monthView(data, r);
  else body.innerHTML = dayView(data, pros);

  const go = (patch) => (Object.assign(view, patch), refresh());
  root.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => go({ mode: b.dataset.mode })));
  root.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => go({ status: b.dataset.st })));
  root.querySelector('[data-pick]').onchange = (e) => e.target.value && go({ date: e.target.value });
  root.querySelector('[data-pro]')?.addEventListener('change', (e) => go({ pro: e.target.value }));
  root.querySelector('[data-svc]').onchange = (e) => go({ service: e.target.value });
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-visit]')) (e.preventDefault(), e.target.click());
  });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act],[data-visit],[data-free],[data-block],[data-day],[data-step]');
    if (!b) return;
    const step = view.mode === 'day' ? 1 : view.mode === 'week' ? 7 : 0;
    const shiftMonth = (n) => {
      const d = new Date(view.date.slice(0, 8) + '15T12:00:00');
      d.setMonth(d.getMonth() + n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    };
    try {
      if (b.dataset.step) {
        e.stopPropagation();
        if (b.dataset.step === 'checkout') return openCheckout({ visit: await GET(`/api/visits/${b.dataset.id}`), onDone: refresh });
        b.disabled = true;
        await POST(`/api/visits/${b.dataset.id}/status`, { status: b.dataset.step });
        toast(STATUS[b.dataset.step].label);
        return refresh();
      }
      if (b.dataset.act === 'prev') go({ date: step ? addDays(view.date, -step) : shiftMonth(-1) });
      if (b.dataset.act === 'next') go({ date: step ? addDays(view.date, step) : shiftMonth(1) });
      if (b.dataset.act === 'today') go({ date: todayStr() });
      if (b.dataset.act === 'filters') {
        view.filtersOpen = !view.filtersOpen;
        root.querySelector('.agenda-filters').classList.toggle('open', view.filtersOpen);
        b.setAttribute('aria-expanded', String(view.filtersOpen));
      }
      if (b.dataset.act === 'new') newVisit({ date: view.date, proId: Number(view.pro) || null, onSaved: refresh });
      if (b.dataset.act === 'block') newBlock({ date: view.date, proId: Number(view.pro) || null, onSaved: refresh });
      if (b.dataset.visit) openVisit(Number(b.dataset.visit), refresh);
      if (b.dataset.free) newVisit({ date: b.dataset.date || view.date, proId: Number(b.dataset.free), time: b.dataset.time, onSaved: refresh });
      if (b.dataset.block) removeBlock(data.blocks.find((x) => x.id === Number(b.dataset.block)), refresh);
      if (b.dataset.day) go({ mode: 'day', date: b.dataset.day });
    } catch (err) {
      b.disabled = false;
      fail(err);
    }
  });
}

function dayStrip(date) {
  const start = weekStart(date);
  return `<div class="daystrip">${[...Array(7)].map((_, i) => {
    const d = addDays(start, i);
    return `<button data-day="${d}" class="${d === date ? 'on' : ''} ${d === todayStr() ? 'today' : ''}"><small>${weekday(d)}</small><b>${d.slice(8)}</b></button>`;
  }).join('')}</div>`;
}

/** Cartão do agendamento com a próxima ação à mão. */
function card(v, item, { compact = false, showPro = false } = {}) {
  const dim = ['cancelled', 'no_show'].includes(v.status) ? 'dim' : '';
  const own = item ? [item] : v.items;
  const n = !compact && NEXT[v.status];
  return `<div class="appt ${dim}" style="--c:${esc(own[0].pro_color)}" data-visit="${v.id}" role="button" tabindex="0">
    <div class="top"><span class="time">${own[0].start_at.slice(11)}${compact ? '' : '–' + own[own.length - 1].end_at.slice(11)}</span>${badge(v.status)}</div>
    <div class="who">${esc(v.client_name)}${v.late_min ? ` <span class="tag warn">+${v.late_min}min</span>` : ''}${own.some((i) => i.overbook) ? ' <span class="tag">encaixe</span>' : ''}${v.source === 'online' ? ' <span class="tag pink">online</span>' : ''}</div>
    <div class="what">${own.map((i) => esc(i.service_name)).join(' + ')}${showPro && !can.solo() ? ' · ' + [...new Set(v.items.map((i) => esc(i.pro_name)))].join(', ') : ''}</div>
    ${n ? `<div class="quick-acts"><button class="btn xs ${n[0] === 'checkout' ? 'ok' : 'soft'}" data-step="${n[0]}" data-id="${v.id}">${ic(n[2], 14)} ${n[1]}</button></div>` : ''}
  </div>`;
}
const blockCard = (b) => `<button class="appt block" data-block="${b.id}" title="Toque para remover"><div class="top"><span class="time">${b.start_at.slice(11)}–${b.end_at.slice(11)}</span><span class="tag">${ic('ban', 12)} bloqueado</span></div>
  <div class="what">${esc(b.reason || 'Bloqueio')}${b.professional_id ? '' : ' · salão inteiro'}</div></button>`;

function dayView(data, pros) {
  const date = view.date;
  const dow = new Date(date + 'T12:00:00').getDay();
  if (!data.visits.length && !data.blocks.length && view.status !== 'active') return `<div class="card">${empty('Nenhum agendamento com esse filtro.', '', 'calendar')}</div>`;
  const cols = pros.map((p) => {
    const works = p.work_days.split(',').includes(String(dow));
    const entries = [];
    for (const v of data.visits) {
      const its = v.items.filter((i) => i.professional_id === p.id);
      if (its.length) entries.push({ start: its[0].start_at.slice(11), end: its[its.length - 1].end_at.slice(11), html: card(v, its.length === v.items.length ? null : its[0]), busy: !['cancelled', 'no_show'].includes(v.status) });
    }
    for (const b of data.blocks.filter((b) => !b.professional_id || b.professional_id === p.id)) {
      const s = b.start_at.slice(0, 10) < date ? '00:00' : b.start_at.slice(11), e = b.end_at.slice(0, 10) > date ? '23:59' : b.end_at.slice(11);
      entries.push({ start: s, end: e, html: blockCard(b), busy: true });
    }
    if (works && p.break_start) entries.push({ start: p.break_start, end: p.break_end, html: `<div class="appt block"><div class="what">${ic('clock', 14)} Intervalo ${p.break_start}–${p.break_end}</div></div>`, busy: true });
    entries.sort((a, b) => (a.start < b.start ? -1 : 1));
    const out = [];
    if (works) {
      let cur = toMin(p.start_time);
      const now = date === todayStr() ? new Date().getHours() * 60 + new Date().getMinutes() : date < todayStr() ? 1e9 : 0;
      for (const en of entries.concat([{ start: p.end_time, end: p.end_time, html: '', busy: true, sentinel: true }])) {
        const s = Math.max(cur, Math.ceil(now / 15) * 15);
        if (en.busy && toMin(en.start) - s >= 30 && view.status === 'active') out.push(`<button class="slot-free" data-free="${p.id}" data-time="${hm(s)}">${ic('plus', 16)} Livre ${hm(s)}–${en.start}</button>`);
        if (!en.sentinel) out.push(en.html);
        if (en.busy) cur = Math.max(cur, toMin(en.end));
      }
    } else out.push(...entries.map((e) => e.html), `<p class="muted small">${ic('info', 16)} Não trabalha neste dia.</p>`);
    const n = entries.filter((e) => e.html.includes('data-visit')).length;
    return `<div class="pro-col card"><h3>${avatar(p.name, p.photo_url, 'sm')}<span style="flex:1">${esc(p.name)}<br><small class="muted" style="font-weight:600">${works ? `${p.start_time}–${p.end_time} · ${n} agend.` : 'folga'}</small></span></h3>${out.join('') || '<p class="muted small">Sem horários livres.</p>'}</div>`;
  });
  return `<div class="pro-cols ${pros.length > 1 ? 'multi' : ''}">${cols.join('')}</div>`;
}

function weekView(data, from) {
  const days = [...Array(7)].map((_, i) => addDays(from, i));
  return `<div class="week">${days.map((d) => {
    const vs = data.visits.filter((v) => v.date === d);
    const bs = data.blocks.filter((b) => b.start_at.slice(0, 10) <= d && b.end_at.slice(0, 10) >= d);
    return `<div class="day ${d === todayStr() ? 'today' : ''}"><h3 data-day="${d}" style="cursor:pointer">${weekday(d)} ${fmtShort(d)}<br><small>${vs.length} agend.</small></h3>
      ${vs.map((v) => card(v, null, { compact: true, showPro: true })).join('')}${bs.map(blockCard).join('')}
      ${!vs.length && !bs.length ? `<button class="slot-free" data-free="${view.pro || state.pros.find((p) => p.active)?.id || ''}" data-date="${d}">${ic('plus', 16)} Livre</button>` : ''}</div>`;
  }).join('')}</div>`;
}

function monthView(data, r) {
  const days = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) days.push(d);
  const head = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((w) => `<div class="wd">${w}</div>`).join('');
  return `<div class="card"><div class="month">${head}${days.map((d) => {
    const vs = data.visits.filter((v) => v.date === d);
    const pend = vs.filter((v) => v.status === 'scheduled').length;
    return `<button data-day="${d}" class="${d < r.first || d > r.last ? 'out' : ''} ${d === todayStr() ? 'today' : ''}" aria-label="${fmtDayLong(d)}: ${vs.length} agendamentos">
      <b>${Number(d.slice(8))}</b>${vs.length ? `<span class="mc">${vs.length} agend.</span>` : ''}${pend ? `<span class="mc pend">${pend} a confirmar</span>` : ''}</button>`;
  }).join('')}</div><p class="legend">Toque em um dia para ver os horários.</p></div>`;
}
