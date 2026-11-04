// Página pública: a cliente escolhe serviço → profissional → dia e horário → seus dados.
import { esc, money, toast, addDays, todayStr, weekday, fmtShort, fmtDayLong } from './core.js';

const slug = decodeURIComponent(location.pathname.split('/')[2] || '');
const root = document.getElementById('book');
const st = { salon: null, service: null, pro: null, date: todayStr(), time: null };

async function call(method, url, body) {
  let res;
  try {
    res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Sem conexão. Verifique a internet.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Erro ao carregar'), { status: res.status });
  return data;
}

function frame(step, inner) {
  const steps = ['Serviço', 'Profissional', 'Horário', 'Seus dados'];
  return `<div class="book-wrap">
    <header class="book-head"><img src="/icon.svg" alt=""><div><h1>${esc(st.salon.name)}</h1><p>Agende seu horário online</p></div></header>
    ${step < 4 ? `<ol class="book-steps">${steps.map((s, i) => `<li class="${i < step ? 'done' : i === step ? 'on' : ''}">${s}</li>`).join('')}</ol>` : ''}
    ${st.service && step > 0 && step < 4 ? `<div class="book-summary">${summary()}</div>` : ''}
    ${inner}
    <p class="legend" style="text-align:center;margin-top:24px">Agendamento por Vyllorri Beauty</p>
  </div>`;
}
const summary = () => [
  `<b>${esc(st.service.name)}</b> · ${st.service.duration_min} min · ${money(st.pro?.price_cents ?? st.service.price_cents)}`,
  st.pro !== null && st.step > 1 ? `com ${st.pro ? esc(st.pro.name) : 'qualquer profissional'}` : '',
  st.time && st.step > 2 ? `${fmtDayLong(st.date)} às ${st.time}` : '',
].filter(Boolean).join(' · ');

function go(step) {
  st.step = step;
  [chooseService, choosePro, chooseTime, details][step]();
  window.scrollTo(0, 0);
}

function chooseService() {
  const groups = {};
  for (const s of st.salon.services) (groups[s.category || 'Serviços'] ||= []).push(s);
  root.innerHTML = frame(0, st.salon.services.length ? Object.entries(groups).map(([g, list]) => `<h2 class="book-group">${esc(g)}</h2>
    <div class="book-list">${list.map((s) => `<button class="book-item" data-s="${s.id}"><div><b>${esc(s.name)}</b>${s.description ? `<small>${esc(s.description)}</small>` : ''}
      <small>${s.duration_min} min</small></div><span>${priceRange(s)}</span></button>`).join('')}</div>`).join('')
    : '<div class="empty"><p>Nenhum serviço disponível para agendamento online no momento.</p></div>');
  root.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => {
    st.service = st.salon.services.find((s) => s.id === Number(b.dataset.s));
    st.pro = st.service.pros.length === 1 ? st.service.pros[0] : null;
    st.time = null;
    go(st.service.pros.length === 1 ? 2 : 1);
  }));
}
function priceRange(s) {
  const ps = s.pros.map((p) => p.price_cents);
  const min = Math.min(...ps), max = Math.max(...ps);
  return min === max ? money(min) : `${money(min)} a ${money(max)}`;
}

function choosePro() {
  root.innerHTML = frame(1, `<h2 class="book-group">Com quem você prefere?</h2><div class="book-list">
    <button class="book-item" data-p="0"><div><b>Sem preferência</b><small>Mostra todos os horários disponíveis</small></div></button>
    ${st.service.pros.map((p) => `<button class="book-item" data-p="${p.id}"><div><b>${esc(p.name)}</b>${p.specialty ? `<small>${esc(p.specialty)}</small>` : ''}</div><span>${money(p.price_cents)}</span></button>`).join('')}</div>
    <button class="btn ghost block" data-back style="margin-top:12px">← Trocar serviço</button>`);
  root.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => {
    st.pro = st.service.pros.find((p) => p.id === Number(b.dataset.p)) || false;
    st.time = null;
    go(2);
  }));
  root.querySelector('[data-back]').onclick = () => go(0);
}

async function chooseTime() {
  const days = [...Array(21)].map((_, i) => addDays(todayStr(), i));
  root.innerHTML = frame(2, `<h2 class="book-group">Escolha o dia</h2>
    <div class="book-days">${days.map((d) => `<button class="book-day ${d === st.date ? 'on' : ''}" data-d="${d}"><small>${weekday(d)}</small><b>${d.slice(8)}</b><small>${fmtShort(d).slice(3)}</small></button>`).join('')}</div>
    <h2 class="book-group">Horários disponíveis</h2><div data-slots class="book-slots"><div class="loading"><span class="spin"></span></div></div>
    <button class="btn ghost block" data-back style="margin-top:12px">← Voltar</button>`);
  root.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => {
    st.date = b.dataset.d;
    root.querySelectorAll('[data-d]').forEach((x) => x.classList.toggle('on', x === b));
    loadSlots();
  }));
  root.querySelector('[data-back]').onclick = () => go(st.service.pros.length === 1 ? 0 : 1);
  root.querySelector('.book-day.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  loadSlots();
}
async function loadSlots() {
  const box = root.querySelector('[data-slots]');
  box.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  try {
    const r = await call('GET', `/api/public/${encodeURIComponent(slug)}/slots?service_id=${st.service.id}&date=${st.date}${st.pro ? '&professional_id=' + st.pro.id : ''}`);
    box.innerHTML = r.slots.length ? r.slots.map((t) => `<button class="chip" data-t="${t}">${t}</button>`).join('') : '<p class="muted">Sem horários livres neste dia. Tente outro dia.</p>';
    box.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
      st.time = b.dataset.t;
      go(3);
    }));
  } catch (e) {
    box.innerHTML = `<p class="err-t">${esc(e.message)}</p>`;
  }
}

function details() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('vb_booking_contact') || '{}');
  } catch {}
  root.innerHTML = frame(3, `<form novalidate class="card">
    <label class="field"><span>Seu nome *</span><input name="name" maxlength="80" autocomplete="name" value="${esc(saved.name || '')}" required></label>
    <label class="field"><span>WhatsApp *</span><input name="phone" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="(11) 99999-9999" value="${esc(saved.phone || '')}" required></label>
    <label class="field"><span>Observação <small>(opcional)</small></span><textarea name="notes" maxlength="300" placeholder="Ex.: cabelo longo, quero tirar dúvida sobre a cor…"></textarea></label>
    <p class="small muted">Seus dados são usados apenas pelo salão para confirmar o atendimento.</p>
    <button class="btn primary block" type="submit">Confirmar agendamento</button>
    <button class="btn ghost block" type="button" data-back style="margin-top:8px">← Escolher outro horário</button></form>`);
  const f = root.querySelector('form');
  root.querySelector('[data-back]').onclick = () => go(2);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('[type=submit]');
    if (!f.name.value.trim() || f.phone.value.replace(/\D/g, '').length < 10) return toast('Informe seu nome e WhatsApp com DDD', 'err');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>';
    try {
      const r = await call('POST', `/api/public/${encodeURIComponent(slug)}/book`, {
        service_id: st.service.id, professional_id: st.pro ? st.pro.id : null, start_at: `${st.date} ${st.time}`,
        name: f.name.value, phone: f.phone.value, notes: f.notes.value,
      });
      try {
        localStorage.setItem('vb_booking_contact', JSON.stringify({ name: f.name.value.trim(), phone: f.phone.value.trim() }));
      } catch {}
      done(r);
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
      btn.textContent = 'Confirmar agendamento';
      if (err.status === 409) setTimeout(() => go(2), 1200);
    }
  };
}

function done(r) {
  st.step = 4;
  root.innerHTML = frame(4, `<div class="card book-done"><div class="book-check">✓</div><h2>Agendamento enviado!</h2>
    <p><b>${esc(r.service)}</b> com ${esc(r.professional)}<br>${fmtDayLong(r.start_at.slice(0, 10))} às ${r.start_at.slice(11)}<br>${money(r.price_cents)}</p>
    <p class="small muted">O salão vai confirmar seu horário pelo WhatsApp. Se precisar remarcar ou cancelar, fale direto com o salão.</p>
    <button class="btn block" data-again>Agendar outro serviço</button></div>`);
  root.querySelector('[data-again]').onclick = () => {
    Object.assign(st, { service: null, pro: null, time: null });
    go(0);
  };
}

(async () => {
  try {
    st.salon = await call('GET', `/api/public/${encodeURIComponent(slug)}`);
    document.title = `Agendar · ${st.salon.name}`;
    go(0);
  } catch (e) {
    root.innerHTML = `<div class="book-wrap"><div class="empty"><p>${esc(e.message)}</p></div></div>`;
  }
})();
