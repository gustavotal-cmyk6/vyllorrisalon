// Agendamentos: criação (vários serviços/profissionais), ações rápidas, reagendamento e bloqueios.
import {
  state, GET, POST, PUT, DEL, esc, money, moneyIn, toCents, modal, toast, fail, confirmBox, submitting, todayStr, nowHM,
  addMinutes, fmtDayLong, fmtPhone, waLink, badge, can, proById, ApiError, fmtDate, STATUS,
} from '../core.js';
import { openCheckout, openSale } from './checkout.js';

/** Envia; se houver conflito de horário, mostra os motivos e oferece encaixar. */
export async function withConflict(send) {
  try {
    return await send(false);
  } catch (e) {
    if (!(e instanceof ApiError) || e.data.code !== 'conflict') throw e;
    const ok = await new Promise((resolve) => {
      let answered = false;
      modal({
        title: 'Horário com conflito',
        body: `<div class="conflict-box"><b>Atenção:</b><ul>${e.data.conflicts.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
          <p class="small muted">Você pode escolher outro horário ou fazer um <b>encaixe</b> mesmo assim.</p>
          <div class="actions"><button class="btn ghost" data-close>Escolher outro horário</button><button class="btn primary" data-fit>Encaixar mesmo assim</button></div>`,
        onMount(el, close) {
          el.querySelector('[data-fit]').onclick = () => ((answered = true), close(), resolve(true));
          el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => !answered && resolve(false)));
          el.parentElement.addEventListener('click', (ev) => ev.target === el.parentElement && !answered && resolve(false));
        },
      });
    });
    if (!ok) throw Object.assign(new Error('cancelado'), { silent: true });
    return send(true);
  }
}

// ---- Seletor de cliente com busca e cadastro instantâneo ----
export function clientPicker(box, { initial = null, onChange = () => {}, required = true } = {}) {
  let picked = initial;
  const render = () => {
    if (picked) {
      box.innerHTML = `<div class="picked"><div class="avatar">${esc(picked.name[0] || '?')}</div><div class="grow"><b>${esc(picked.name)}</b>
        <div class="small muted">${picked.isNew ? 'Nova cliente' : fmtPhone(picked.phone) || 'sem telefone'}</div></div>
        <button type="button" class="btn sm ghost" data-change>Trocar</button></div>
        ${picked.notes ? `<div class="note-box" style="margin-top:6px">⚠ ${esc(picked.notes)}</div>` : ''}`;
      box.querySelector('[data-change]').onclick = () => ((picked = null), render(), onChange(null));
      return;
    }
    box.innerHTML = `<div class="client-pick"><input placeholder="Digite o nome ou telefone da cliente" autocomplete="off" data-q>
      <div class="opts hidden"></div></div>`;
    const q = box.querySelector('[data-q]'), opts = box.querySelector('.opts');
    let t, seq = 0;
    q.addEventListener('input', () => {
      clearTimeout(t);
      const v = q.value.trim();
      if (v.length < 2) return opts.classList.add('hidden');
      t = setTimeout(async () => {
        const my = ++seq;
        const list = await GET('/api/clients?q=' + encodeURIComponent(v)).catch(() => []);
        if (my !== seq) return;
        const digits = v.replace(/\D/g, '');
        opts.innerHTML = list.slice(0, 8).map((c, i) => `<button type="button" data-i="${i}">${esc(c.name)} <span class="muted small">${fmtPhone(c.phone)}${c.last_visit ? ' · última visita ' + fmtDate(c.last_visit) : ''}</span></button>`).join('') +
          `<button type="button" data-new><b>＋ Cadastrar “${esc(digits.length >= 8 ? 'nova cliente' : v)}”</b></button>`;
        opts.classList.remove('hidden');
        opts.querySelectorAll('[data-i]').forEach((b) => (b.onclick = async () => {
          const c = list[b.dataset.i];
          const full = await GET(`/api/clients/${c.id}`).catch(() => null);
          picked = { id: c.id, name: c.name, phone: c.phone, preferred_pro_id: c.preferred_pro_id, notes: full?.client.notes };
          render();
          onChange(picked);
        }));
        opts.querySelector('[data-new]').onclick = () => newInline(digits.length >= 8 ? '' : v, digits.length >= 8 ? v : '');
      }, 200);
    });
    setTimeout(() => q.focus(), 60);
  };
  const newInline = (name, phone) => {
    box.innerHTML = `<div class="row"><label class="field"><span>Nome da nova cliente</span><input data-n value="${esc(name)}" maxlength="80"></label>
      <label class="field"><span>Telefone (WhatsApp)</span><input data-p value="${esc(phone)}" inputmode="tel" maxlength="20"></label></div>
      <div class="actions" style="margin-top:0"><button type="button" class="btn sm ghost" data-back>Buscar existente</button><button type="button" class="btn sm primary" data-ok>Usar esta cliente</button></div>`;
    box.querySelector(name ? '[data-p]' : '[data-n]').focus();
    box.querySelector('[data-back]').onclick = render;
    box.querySelector('[data-ok]').onclick = () => {
      const n = box.querySelector('[data-n]').value.trim();
      if (!n) return toast('Informe o nome', 'err');
      picked = { isNew: true, name: n, phone: box.querySelector('[data-p]').value.trim() };
      render();
      onChange(picked);
    };
  };
  render();
  return {
    get: () => picked,
    payload() {
      if (!picked) {
        if (required) throw new Error('Selecione ou cadastre a cliente');
        return {};
      }
      return picked.isNew ? { new_client: { name: picked.name, phone: picked.phone } } : { client_id: picked.id };
    },
  };
}

const prosFor = (serviceId) => {
  const s = state.services.find((x) => x.id === serviceId);
  return s ? state.pros.filter((p) => p.active && s.pros.some((l) => l.professional_id === p.id)) : [];
};
const priceFor = (serviceId, proId) => {
  const s = state.services.find((x) => x.id === serviceId);
  return s?.pros.find((l) => l.professional_id === proId)?.price_cents ?? s?.price_cents ?? 0;
};
function serviceOptions(selected) {
  const groups = {};
  for (const s of state.services) (groups[s.category_name || 'Outros'] ||= []).push(s);
  return '<option value="">Escolha o serviço…</option>' + Object.entries(groups).map(([g, list]) =>
    `<optgroup label="${esc(g)}">${list.map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)} · ${s.duration_min}min · ${money(s.price_cents)}</option>`).join('')}</optgroup>`).join('');
}

/**
 * Novo agendamento / edição.
 * opts: { date, time, proId, client, fitIn, visit, onSaved }
 */
export function newVisit(opts = {}) {
  if (!state.services.length) {
    toast(can.owner() ? 'Cadastre seus serviços antes de agendar.' : 'Peça para a proprietária cadastrar os serviços.', 'err');
    if (can.owner()) location.hash = '#/servicos';
    return;
  }
  const editing = opts.visit;
  const myPro = can.pro() ? state.user.professional_id : null;
  let date = editing?.date || opts.date || todayStr();
  let lines = editing
    ? editing.items.map((i) => ({ service_id: i.service_id, professional_id: i.professional_id, time: i.start_at.slice(11), price: i.price_cents, duration: i.duration_min, auto: false }))
    : [{ service_id: null, professional_id: opts.proId || myPro, time: opts.time || (opts.fitIn ? roundNow() : ''), price: null, duration: null, auto: !opts.time }];

  modal({
    title: editing ? 'Editar agendamento' : opts.fitIn ? 'Encaixe' : 'Novo agendamento',
    wide: true,
    body: `<form novalidate>
      <div class="field"><span>Cliente</span><div data-client></div></div>
      <div class="row"><label class="field"><span>Data</span><input type="date" name="date" value="${date}"></label>
        <label class="field"><span>Situação</span><select name="status" ${editing ? 'disabled' : ''}>
          <option value="scheduled">Agendado</option><option value="confirmed">Já confirmado</option>${opts.fitIn ? '<option value="waiting" selected>Cliente já chegou</option>' : ''}</select></label></div>
      <div data-lines></div>
      <button type="button" class="btn sm" data-add>＋ Adicionar outro serviço</button>
      <div class="total-box" data-total></div>
      <label class="field"><span>Observações do agendamento</span><textarea name="notes" maxlength="500" placeholder="Ex.: trazer foto da referência">${esc(editing?.notes || '')}</textarea></label>
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="submit" class="btn primary">${editing ? 'Salvar alterações' : 'Agendar'}</button></div>
    </form>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      const picker = clientPicker(el.querySelector('[data-client]'), {
        initial: editing ? { id: editing.client_id, name: editing.client_name, phone: editing.client_phone, notes: editing.client_notes } : opts.client || null,
        onChange(c) {
          // profissional preferida da cliente já vem selecionada
          if (c?.preferred_pro_id && lines.length === 1 && !lines[0].professional_id) {
            lines[0].professional_id = c.preferred_pro_id;
            renderLines();
          }
        },
      });
      const linesBox = el.querySelector('[data-lines]');
      form.date.onchange = () => ((date = form.date.value), renderLines());
      el.querySelector('[data-add]').onclick = () => {
        const prev = lines[lines.length - 1];
        lines.push({ service_id: null, professional_id: null, time: endOf(prev) || '', price: null, duration: null, auto: true });
        renderLines();
      };

      function endOf(l) {
        if (!l?.time || !l.service_id) return '';
        return addMinutes(`${date} ${l.time}`, l.duration || svc(l.service_id).duration_min).slice(11);
      }
      const svc = (id) => state.services.find((s) => s.id === id);

      function renderLines() {
        linesBox.innerHTML = lines.map((l, i) => {
          const pros = l.service_id ? prosFor(l.service_id) : [];
          if (l.service_id && pros.length && !pros.some((p) => p.id === l.professional_id)) l.professional_id = myPro && pros.some((p) => p.id === myPro) ? myPro : pros.length === 1 ? pros[0].id : null;
          return `<div class="svc-line" data-i="${i}">
            <div class="head"><span>Serviço ${i + 1}</span>${lines.length > 1 ? `<button type="button" class="icon-btn" data-rm="${i}" aria-label="Remover">🗑</button>` : ''}</div>
            <label class="field"><select data-f="service_id">${serviceOptions(l.service_id)}</select></label>
            <div class="row"><label class="field"><span>Profissional</span><select data-f="professional_id" ${!l.service_id ? 'disabled' : ''}>
              <option value="">${l.service_id ? (pros.length ? 'Escolha…' : 'Nenhuma habilitada') : '—'}</option>
              ${pros.map((p) => `<option value="${p.id}" ${p.id === l.professional_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
              <label class="field"><span>Horário</span><input type="time" data-f="time" value="${l.time}" step="300"></label></div>
            <div class="slots" data-slots></div>
            ${l.service_id ? `<div class="row" style="margin-top:8px"><label class="field"><span>Duração (min)</span><input inputmode="numeric" data-f="duration" value="${l.duration || svc(l.service_id).duration_min}"></label>
              <label class="field"><span>Preço</span><input inputmode="decimal" data-f="price" value="${moneyIn(l.price ?? priceFor(l.service_id, l.professional_id))}"></label></div>` : ''}
          </div>`;
        }).join('');
        linesBox.querySelectorAll('.svc-line').forEach((box) => {
          const i = Number(box.dataset.i), l = lines[i];
          box.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener('change', () => {
            const f = inp.dataset.f;
            if (f === 'service_id') Object.assign(l, { service_id: Number(inp.value) || null, price: null, duration: null });
            if (f === 'professional_id') Object.assign(l, { professional_id: Number(inp.value) || null, price: null });
            if (f === 'time') Object.assign(l, { time: inp.value, auto: false });
            if (f === 'duration') l.duration = Number(inp.value) || null;
            if (f === 'price') l.price = toCents(inp.value);
            chain(i);
            if (f === 'price') return renderTotal();
            renderLines();
          }));
          box.querySelector('[data-rm]')?.addEventListener('click', () => (lines.splice(i, 1), renderLines()));
          if (l.service_id && l.professional_id && date) loadSlots(box.querySelector('[data-slots]'), l);
        });
        renderTotal();
      }
      // serviços seguintes "automáticos" começam quando o anterior termina
      function chain(from) {
        for (let j = from + 1; j < lines.length; j++) if (lines[j].auto) lines[j].time = endOf(lines[j - 1]) || lines[j].time;
      }
      async function loadSlots(box, l) {
        const dur = l.duration || svc(l.service_id).duration_min;
        const r = await GET(`/api/availability?professional_id=${l.professional_id}&date=${date}&duration=${dur}${editing ? '&exclude_visit=' + editing.id : ''}`).catch(() => ({ slots: [] }));
        box.innerHTML = r.slots.length
          ? `<span class="small muted" style="width:100%">Horários livres de ${esc(proById(l.professional_id)?.name)}:</span>` + r.slots.map((s) => `<button type="button" class="chip ${s === l.time ? 'on' : ''}" data-s="${s}">${s}</button>`).join('')
          : `<span class="small warn-t">Sem horário livre neste dia para esta duração${opts.fitIn ? ' — use encaixe' : ''}.</span>`;
        box.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => {
          Object.assign(l, { time: b.dataset.s, auto: false });
          chain(lines.indexOf(l));
          renderLines();
        }));
      }
      function renderTotal() {
        const total = lines.reduce((s, l) => s + (l.service_id ? l.price ?? priceFor(l.service_id, l.professional_id) : 0), 0);
        const times = lines.filter((l) => l.time && l.service_id);
        const start = times.map((l) => l.time).sort()[0];
        const end = times.map(endOf).sort().pop();
        el.querySelector('[data-total]').innerHTML = `<div class="line"><span>${fmtDayLong(date)}${start ? ` · ${start}–${end}` : ''}</span></div>
          <div class="line big"><span>Previsto</span><span>${money(total)}</span></div>`;
      }
      renderLines();

      form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('[type=submit]');
        await submitting(btn, async () => {
          const items = lines.map((l, i) => {
            if (!l.service_id) throw new Error(`Escolha o serviço ${i + 1}`);
            if (!l.professional_id) throw new Error(`Escolha a profissional do serviço ${i + 1}`);
            if (!l.time) throw new Error(`Escolha o horário do serviço ${i + 1}`);
            if (Number.isNaN(l.price)) throw new Error(`Preço inválido no serviço ${i + 1}`);
            return { service_id: l.service_id, professional_id: l.professional_id, start_at: `${date} ${l.time}`, duration_min: l.duration || undefined, price_cents: l.price ?? undefined };
          });
          const payload = { ...(editing ? {} : picker.payload()), items, notes: form.notes.value, status: form.status.value };
          await withConflict((force) => (editing ? PUT(`/api/visits/${editing.id}`, { ...payload, force }) : POST('/api/visits', { ...payload, force })));
          close();
          toast(editing ? 'Agendamento atualizado' : 'Agendamento criado ✓');
          opts.onSaved?.();
        }).catch((err) => err?.silent);
      };
    },
  });
}
const roundNow = () => {
  const [h, m] = nowHM().split(':').map(Number);
  const t = Math.ceil((h * 60 + m) / 5) * 5;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** Ficha do agendamento com as ações rápidas do dia a dia. */
export async function openVisit(id, onChange = () => {}) {
  let v;
  try {
    v = await GET(`/api/visits/${id}`);
  } catch (e) {
    return fail(e);
  }
  const st = v.status;
  const A = (act, label, cls = '') => `<button class="btn ${cls}" data-a="${act}">${label}</button>`;
  const acts = {
    scheduled: [A('confirmed', '✓ Confirmar', 'primary'), A('waiting', '🛎 Chegou'), A('in_progress', '▶ Iniciar'), A('checkout', '💳 Concluir e receber'), A('reschedule', '🔁 Reagendar'), A('edit', '✏️ Editar'), A('no_show', '🚫 Faltou'), A('cancelled', '✕ Cancelar')],
    confirmed: [A('waiting', '🛎 Chegou', 'primary'), A('in_progress', '▶ Iniciar'), A('checkout', '💳 Concluir e receber'), A('reschedule', '🔁 Reagendar'), A('edit', '✏️ Editar'), A('no_show', '🚫 Faltou'), A('cancelled', '✕ Cancelar')],
    waiting: [A('in_progress', '▶ Iniciar atendimento', 'primary'), A('checkout', '💳 Concluir e receber'), A('late', '⏱ Registrar atraso'), A('edit', '✏️ Editar'), A('reschedule', '🔁 Reagendar'), A('cancelled', '✕ Cancelar')],
    in_progress: [A('checkout', '💳 Concluir e receber', 'ok'), A('edit', '✏️ Editar serviços'), A('waiting', '↩ Voltar para “chegou”')],
    completed: [v.sale_id ? A('sale', '🧾 Ver venda', 'primary') : ''],
    cancelled: [A('reopen', '↺ Reativar'), A('reschedule', '🔁 Reagendar')],
    no_show: [A('reopen', '↺ Reativar'), A('reschedule', '🔁 Reagendar')],
  }[st];
  const first = v.client_name.split(' ')[0];
  const wa = waLink(v.client_phone, `Olá, ${first}! Confirmando seu horário ${fmtDayLong(v.date).toLowerCase()} às ${v.start_at.slice(11)} (${v.items.map((i) => i.service_name).join(', ')}). Podemos confirmar?`);
  const close = modal({
    title: v.client_name,
    body: `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">${badge(st)}
        ${v.late_min ? `<span class="tag warn">atraso ${v.late_min} min</span>` : ''}${v.items.some((i) => i.overbook) ? '<span class="tag">encaixe</span>' : ''}${v.source === 'online' ? '<span class="tag ok">agendado online</span>' : ''}
        <span class="muted small">${fmtDayLong(v.date)} · ${v.start_at.slice(11)}–${v.end_at.slice(11)}</span></div>
      ${v.client_notes ? `<div class="note-box" style="margin-bottom:10px">⚠ ${esc(v.client_notes)}</div>` : ''}
      <ul class="list">${v.items.map((i) => `<li><span class="dot" style="background:${esc(i.pro_color)}"></span><div class="grow"><div class="title">${esc(i.service_name)}</div>
        <div class="meta">${i.start_at.slice(11)}–${i.end_at.slice(11)} · ${esc(i.pro_name)}</div></div><b>${money(i.price_cents)}</b></li>`).join('')}</ul>
      ${v.notes ? `<p class="small"><b>Obs.:</b> ${esc(v.notes)}</p>` : ''}
      <div class="actions" style="justify-content:flex-start;margin:6px 0 14px">
        <a class="btn sm" href="#/clientes/${v.client_id}" data-close>👩 Ficha da cliente</a>
        ${wa ? `<a class="btn sm" href="${wa}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
      </div>
      <div class="sheet-actions">${acts.join('')}</div>`,
    onMount(el, close) {
      el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = async () => {
        const a = b.dataset.a;
        try {
          if (a === 'checkout') return close(), openCheckout({ visit: v, onDone: onChange });
          if (a === 'sale') return close(), openSale(v.sale_id, onChange);
          if (a === 'edit') return close(), newVisit({ visit: v, onSaved: onChange });
          if (a === 'reschedule') return close(), reschedule(v, onChange);
          if (a === 'late') {
            const m = await confirmBox('Quantos minutos de atraso?', { ok: 'Registrar', input: 'Minutos' });
            if (!m) return;
            await POST(`/api/visits/${v.id}/status`, { status: 'waiting', late_min: Number(m) });
            toast('Atraso registrado');
            return close(), onChange();
          }
          const status = a === 'reopen' ? 'scheduled' : a;
          if ((status === 'cancelled' || status === 'no_show') && !(await confirmBox(status === 'cancelled' ? `Cancelar o agendamento de ${v.client_name}?` : `Marcar que ${v.client_name} não compareceu?`, { ok: 'Sim', danger: true }))) return;
          const r = await POST(`/api/visits/${v.id}/status`, { status });
          toast(`${STATUS[status].label}${r.late_min ? ` · atraso de ${r.late_min} min registrado` : ''}`);
          close();
          onChange();
        } catch (e) {
          fail(e);
        }
      }));
    },
  });
  return close;
}

export function reschedule(v, onChange) {
  let date = v.date;
  const single = v.items.length === 1;
  const it = v.items[0];
  const pros = single ? prosFor(it.service_id) : [];
  const dur = Math.round((new Date(v.end_at.replace(' ', 'T')) - new Date(v.start_at.replace(' ', 'T'))) / 60000);
  modal({
    title: `Reagendar ${v.client_name.split(' ')[0]}`,
    body: `<form novalidate><p class="small muted">Atual: ${fmtDayLong(v.date)} às ${v.start_at.slice(11)}${v.items.length > 1 ? ' · os serviços são movidos juntos' : ''}</p>
      <div class="row"><label class="field"><span>Nova data</span><input type="date" name="date" value="${date}"></label>
      <label class="field"><span>Novo horário</span><input type="time" name="time" value="${v.start_at.slice(11)}" step="300"></label></div>
      ${single && pros.length > 1 && !can.pro() ? `<label class="field"><span>Profissional</span><select name="pro">${pros.map((p) => `<option value="${p.id}" ${p.id === it.professional_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
      <div class="slots" data-slots></div>
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Voltar</button><button class="btn primary" type="submit">Reagendar</button></div></form>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      const pro = () => Number(form.pro?.value) || it.professional_id;
      const slots = async () => {
        const box = el.querySelector('[data-slots]');
        if (v.items.length > 1 && new Set(v.items.map((i) => i.professional_id)).size > 1) return (box.innerHTML = '<span class="small muted">Visita com várias profissionais: escolha o horário de início.</span>');
        const r = await GET(`/api/availability?professional_id=${pro()}&date=${form.date.value}&duration=${dur}&exclude_visit=${v.id}`).catch(() => ({ slots: [] }));
        box.innerHTML = r.slots.length ? r.slots.map((s) => `<button type="button" class="chip" data-s="${s}">${s}</button>`).join('') : '<span class="small warn-t">Sem horários livres nesta data.</span>';
        box.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => {
          form.time.value = b.dataset.s;
          box.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
        }));
      };
      form.date.onchange = slots;
      if (form.pro) form.pro.onchange = slots;
      slots();
      form.onsubmit = async (e) => {
        e.preventDefault();
        await submitting(form.querySelector('[type=submit]'), async () => {
          if (!form.date.value || !form.time.value) throw new Error('Escolha data e horário');
          await withConflict((force) => POST(`/api/visits/${v.id}/reschedule`, { start_at: `${form.date.value} ${form.time.value}`, professional_id: form.pro ? pro() : undefined, force }));
          close();
          toast('Reagendado ✓');
          onChange();
        }).catch(() => {});
      };
    },
  });
}

/** Bloqueio de horário: folga, almoço, compromisso, curso… */
export function newBlock({ date = todayStr(), proId = null, onSaved } = {}) {
  modal({
    title: 'Bloquear horário',
    body: `<form novalidate>
      <label class="field"><span>Para quem</span><select name="pro"><option value="">Salão inteiro (feriado, reforma…)</option>
        ${state.pros.filter((p) => p.active).map((p) => `<option value="${p.id}" ${p.id === proId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Data</span><input type="date" name="date" value="${date}"></label>
      <label class="check"><input type="checkbox" name="allday"> Dia inteiro (folga)</label>
      <div class="row" data-hours><label class="field"><span>Das</span><input type="time" name="start" value="12:00"></label><label class="field"><span>Até</span><input type="time" name="end" value="13:00"></label></div>
      <label class="field"><span>Motivo</span><input name="reason" maxlength="80" placeholder="Almoço, médico, curso…"></label>
      <div class="chips">${['Almoço', 'Folga', 'Médico', 'Curso', 'Pessoal'].map((r) => `<button type="button" class="chip" data-r="${r}">${r}</button>`).join('')}</div>
      <div class="actions stretch"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" type="submit">Bloquear</button></div></form>`,
    onMount(el, close) {
      const f = el.querySelector('form');
      f.allday.onchange = () => el.querySelector('[data-hours]').classList.toggle('hidden', f.allday.checked);
      el.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => {
        f.reason.value = b.dataset.r;
        if (b.dataset.r === 'Folga') (f.allday.checked = true), f.allday.onchange();
      }));
      f.onsubmit = async (e) => {
        e.preventDefault();
        await submitting(f.querySelector('[type=submit]'), async () => {
          const d = f.date.value;
          const [s, en] = f.allday.checked ? ['00:00', '23:59'] : [f.start.value, f.end.value];
          await POST('/api/blocks', { professional_id: f.pro.value || null, start_at: `${d} ${s}`, end_at: `${d} ${en}`, reason: f.reason.value });
          close();
          toast('Horário bloqueado');
          onSaved?.();
        }).catch(() => {});
      };
    },
  });
}

export async function removeBlock(b, onChange) {
  if (!can.staff()) return;
  if (!(await confirmBox(`Remover o bloqueio ${b.reason ? `“${b.reason}” ` : ''}das ${b.start_at.slice(11)} às ${b.end_at.slice(11)}?`, { ok: 'Remover', danger: true }))) return;
  await DEL(`/api/blocks/${b.id}`).then(() => (toast('Bloqueio removido'), onChange())).catch(fail);
}
