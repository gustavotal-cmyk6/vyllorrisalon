import { state, GET, esc, money, todayStr, addDays, fmtDayLong, weekday, fmtShort, badge, can, empty, STATUS } from '../core.js';
import { newVisit, openVisit, newBlock, removeBlock } from './visits.js';
import { refresh } from '../app.js';

const view = { mode: 'day', date: null, pro: '', hideCancelled: true };
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export default async function agenda(root, { query }) {
  if (query.data && query.data !== view.fromLink) view.date = view.fromLink = query.data;
  view.date ||= todayStr();
  if (can.pro()) view.pro = String(state.user.professional_id);
  const from = view.mode === 'day' ? view.date : weekStart(view.date);
  const to = view.mode === 'day' ? view.date : addDays(from, 6);
  const data = await GET(`/api/agenda?from=${from}&to=${to}${view.pro ? '&professional_id=' + view.pro : ''}${view.hideCancelled ? '&hide_cancelled=1' : ''}`);
  const pros = state.pros.filter((p) => p.active && (!view.pro || String(p.id) === view.pro));

  root.innerHTML = `
  <div class="page-head"><div><h1>Agenda</h1><div class="sub">${view.mode === 'day' ? fmtDayLong(view.date) : `Semana de ${fmtShort(from)} a ${fmtShort(to)}`}</div></div>
    <div class="actions" style="margin:0">${can.staff() ? '<button class="btn" data-act="block">⛔ Bloquear</button>' : ''}<button class="btn primary" data-act="new">＋ Agendar</button></div></div>
  <div class="agenda-bar">
    <div class="seg"><button data-mode="day" class="${view.mode === 'day' ? 'on' : ''}">Dia</button><button data-mode="week" class="${view.mode === 'week' ? 'on' : ''}">Semana</button></div>
    <div class="date-nav"><button class="icon-btn" data-act="prev" aria-label="Anterior">‹</button><b>${view.mode === 'day' ? fmtShort(view.date) + ' ' + weekday(view.date) : fmtShort(from) + '–' + fmtShort(to)}</b><button class="icon-btn" data-act="next" aria-label="Próximo">›</button></div>
    <button class="btn sm" data-act="today">Hoje</button>
    <input type="date" value="${view.date}" data-pick style="width:auto">
    ${can.pro() ? '' : `<select data-pro><option value="">Todas as profissionais</option>${state.pros.filter((p) => p.active).map((p) => `<option value="${p.id}" ${String(p.id) === view.pro ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`}
    <label class="check" style="margin:0"><input type="checkbox" data-hide ${view.hideCancelled ? 'checked' : ''}> Ocultar canceladas/faltas</label>
  </div>
  <div data-body></div>
  <p class="legend">${Object.values(STATUS).map((s) => `<span class="badge ${s.cls}">${s.label}</span>`).join(' ')}</p>`;

  const body = root.querySelector('[data-body]');
  if (!state.pros.length) body.innerHTML = empty('Nenhuma profissional cadastrada ainda.', can.owner() ? '<a class="btn primary" href="#/equipe">Cadastrar equipe</a>' : '');
  else if (view.mode === 'week') body.innerHTML = weekView(data, from);
  else body.innerHTML = dayView(data, pros);

  const go = (patch) => (Object.assign(view, patch), refresh());
  root.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => go({ mode: b.dataset.mode })));
  root.querySelector('[data-pick]').onchange = (e) => e.target.value && go({ date: e.target.value });
  root.querySelector('[data-pro]')?.addEventListener('change', (e) => go({ pro: e.target.value }));
  root.querySelector('[data-hide]').onchange = (e) => go({ hideCancelled: e.target.checked });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act],[data-visit],[data-free],[data-block],[data-day]');
    if (!b) return;
    const step = view.mode === 'day' ? 1 : 7;
    if (b.dataset.act === 'prev') go({ date: addDays(view.date, -step) });
    if (b.dataset.act === 'next') go({ date: addDays(view.date, step) });
    if (b.dataset.act === 'today') go({ date: todayStr() });
    if (b.dataset.act === 'new') newVisit({ date: view.date, proId: Number(view.pro) || null, onSaved: refresh });
    if (b.dataset.act === 'block') newBlock({ date: view.date, proId: Number(view.pro) || null, onSaved: refresh });
    if (b.dataset.visit) openVisit(Number(b.dataset.visit), refresh);
    if (b.dataset.free) newVisit({ date: b.dataset.date || view.date, proId: Number(b.dataset.free), time: b.dataset.time, onSaved: refresh });
    if (b.dataset.block) removeBlock(data.blocks.find((x) => x.id === Number(b.dataset.block)), refresh);
    if (b.dataset.day) go({ mode: 'day', date: b.dataset.day });
  });
}

const weekStart = (d) => addDays(d, -((new Date(d + 'T12:00:00').getDay() + 6) % 7));

function card(v, item, { compact = false } = {}) {
  const dim = ['cancelled', 'no_show'].includes(v.status) ? 'dim' : '';
  const own = item ? [item] : v.items;
  return `<button class="appt ${dim}" style="--c:${esc(own[0].pro_color)}" data-visit="${v.id}">
    <div class="top"><span class="time">${own[0].start_at.slice(11)}${compact ? '' : '–' + own[own.length - 1].end_at.slice(11)}</span>${badge(v.status)}</div>
    <div class="who">${esc(v.client_name)}${v.late_min ? ` <span class="tag warn">+${v.late_min}min</span>` : ''}${own.some((i) => i.overbook) ? ' <span class="tag">encaixe</span>' : ''}</div>
    <div class="what">${own.map((i) => esc(i.service_name)).join(' + ')}${item ? '' : ' · ' + [...new Set(v.items.map((i) => esc(i.pro_name)))].join(', ')}${compact ? '' : ' · ' + money(own.reduce((s, i) => s + i.price_cents, 0))}</div>
  </button>`;
}
const blockCard = (b) => `<button class="appt block" data-block="${b.id}" title="Toque para remover"><div class="top"><span class="time">${b.start_at.slice(11)}–${b.end_at.slice(11)}</span><span class="tag">bloqueado</span></div>
  <div class="what">${esc(b.reason || 'Bloqueio')}${b.professional_id ? '' : ' · salão inteiro'}</div></button>`;

function dayView(data, pros) {
  const date = view.date;
  const dow = new Date(date + 'T12:00:00').getDay();
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
    if (works && p.break_start) entries.push({ start: p.break_start, end: p.break_end, html: `<div class="appt block"><div class="what">Intervalo ${p.break_start}–${p.break_end}</div></div>`, busy: true });
    entries.sort((a, b) => (a.start < b.start ? -1 : 1));
    // espaços livres entre compromissos, clicáveis para agendar
    const out = [];
    if (works) {
      let cur = toMin(p.start_time);
      const now = date === todayStr() ? new Date().getHours() * 60 + new Date().getMinutes() : date < todayStr() ? 1e9 : 0;
      for (const en of entries.concat([{ start: p.end_time, end: p.end_time, html: '', busy: true, sentinel: true }])) {
        const s = Math.max(cur, Math.ceil(now / 15) * 15);
        if (en.busy && toMin(en.start) - s >= 30) out.push(`<button class="slot-free" data-free="${p.id}" data-time="${hm(s)}">＋ Livre ${hm(s)}–${en.start}</button>`);
        if (!en.sentinel) out.push(en.html);
        if (en.busy) cur = Math.max(cur, toMin(en.end));
      }
    } else out.push(...entries.map((e) => e.html), '<p class="muted small">Não trabalha neste dia.</p>');
    return `<div class="pro-col card"><h3><span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)} <small class="muted">${works ? `${p.start_time}–${p.end_time}` : 'folga'}</small></h3>${out.join('')}</div>`;
  });
  return `<div class="pro-cols ${pros.length > 1 ? 'multi' : ''}">${cols.join('')}</div>`;
}

function weekView(data, from) {
  const days = [...Array(7)].map((_, i) => addDays(from, i));
  return `<div class="week">${days.map((d) => {
    const vs = data.visits.filter((v) => v.date === d);
    const bs = data.blocks.filter((b) => b.start_at.slice(0, 10) <= d && b.end_at.slice(0, 10) >= d);
    const total = vs.filter((v) => !['cancelled', 'no_show'].includes(v.status)).length;
    return `<div class="day ${d === todayStr() ? 'today' : ''}"><h3 data-day="${d}" style="cursor:pointer">${weekday(d)} ${fmtShort(d)}<br><small>${total} agend.</small></h3>
      ${vs.map((v) => card(v, null, { compact: true })).join('')}${bs.map(blockCard).join('')}
      ${!vs.length && !bs.length ? '<p class="muted small" style="text-align:center">Livre</p>' : ''}</div>`;
  }).join('')}</div>`;
}
