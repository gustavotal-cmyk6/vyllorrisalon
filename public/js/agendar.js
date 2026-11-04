// Página pública do salão + agendamento em etapas curtas. Sem cadastro, sem senha.
import { esc, money, toast, addDays, todayStr, weekday, fmtDayLong, fmtPhone, waLink, ic, avatar } from './core.js';

const slug = decodeURIComponent(location.pathname.split('/')[2] || '');
const root = document.getElementById('book');
const st = { salon: null, step: 'home', service: null, pro: undefined, date: todayStr(), time: null, contact: {} };
const STEPS = ['service', 'pro', 'date', 'time', 'details', 'review'];
const STEP_LABEL = { service: 'Escolha o serviço', pro: 'Escolha a profissional', date: 'Escolha o dia', time: 'Escolha o horário', details: 'Seus dados', review: 'Revise e confirme' };
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const KEY = `vb_reservas_${slug}`;

async function call(method, url, body) {
  let res;
  try {
    res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Sem conexão. Verifique sua internet.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Erro ao carregar'), { status: res.status });
  return data;
}
const store = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};
const proOf = (id) => st.salon.professionals.find((p) => p.id === id);
const priceNow = () => (st.pro ? st.service.pros.find((p) => p.id === st.pro.id)?.price_cents : null) ?? st.service.price_cents;
function priceRange(s) {
  const ps = s.pros.map((p) => p.price_cents);
  const min = Math.min(...ps), max = Math.max(...ps);
  return min === max ? money(min) : `a partir de ${money(min)}`;
}
const thumb = (url, icon = 'scissors') => `<span class="thumb">${url ? `<img src="${esc(url)}" alt="" loading="lazy">` : ic(icon, 26)}</span>`;
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`);

// ---------- navegação com o botão "voltar" do celular ----------
function go(step, push = true) {
  st.step = step;
  if (push) history.pushState({ step }, '', location.pathname + location.search);
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', (e) => {
  st.step = e.state?.step || 'home';
  render();
});

function render() {
  const fn = { home, service: chooseService, pro: choosePro, date: chooseDate, time: chooseTime, details, review, done: () => {}, mine }[st.step];
  fn?.();
}

/** Cabeçalho das etapas: voltar, título e barra de progresso. */
function top(step) {
  const i = STEPS.indexOf(step);
  return `<div class="bk-top"><div class="r"><button class="back" data-back aria-label="Voltar">${ic('arrowLeft', 20)}</button>
    <div style="flex:1;min-width:0"><h2>${STEP_LABEL[step]}</h2><div class="bk-step-label">Etapa ${i + 1} de ${STEPS.length} · ${esc(st.salon.name)}</div></div></div>
    <div class="bk-steps" aria-hidden="true">${STEPS.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'on' : ''}"></i>`).join('')}</div></div>`;
}
function summaryChip() {
  if (!st.service) return '';
  const p = st.pro ? proOf(st.pro.id) : null;
  return `<div class="bk-summary">${thumb(st.service.photo_url).replace('class="thumb"', 'class="thumb" style="width:44px;height:44px;border-radius:12px;overflow:hidden;flex:none;display:grid;place-items:center;background:var(--lav-100);color:var(--brand)"')}
    <div style="flex:1;min-width:0"><b>${esc(st.service.name)}</b><div class="muted tiny">${dur(st.service.duration_min)} · ${money(priceNow())}${st.pro !== undefined ? ` · ${p ? esc(p.name) : 'qualquer profissional'}` : ''}${st.time && ['details', 'review'].includes(st.step) ? ` · ${fmtDayLong(st.date)} às ${st.time}` : ''}</div></div></div>`;
}
function bindBack() {
  root.querySelector('[data-back]')?.addEventListener('click', () => history.back());
}

// ---------- 0. Página inicial do salão ----------
function home() {
  const s = st.salon;
  const mineCount = store.get(KEY, []).length;
  const groups = {};
  for (const sv of s.services) (groups[sv.category || 'Serviços'] ||= []).push(sv);
  const mapLink = s.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}` : null;
  const wa = waLink(s.phone, `Olá! Vim pela página de agendamento do ${s.name}.`);
  root.innerHTML = `<div class="bk">
    <header class="bk-hero">${s.cover_url ? `<img src="${esc(s.cover_url)}" alt="">` : ''}
      <div class="in"><span class="logo-b">${s.logo_url ? `<img src="${esc(s.logo_url)}" alt="">` : `<b>${esc(s.name[0] || 'V')}</b>`}</span>
        <div style="min-width:0"><h1>${esc(s.name)}</h1><p>Agende seu horário online em poucos passos</p></div></div></header>
    <div class="bk-body">
      ${s.description ? `<p style="line-height:1.55">${esc(s.description)}</p>` : ''}
      ${s.address || s.opening_hours || s.phone || s.instagram ? `<div class="card" style="margin:0"><div class="bk-info">
        ${s.address ? `<a href="${mapLink}" target="_blank" rel="noopener">${ic('pin', 20)}<span>${esc(s.address)}</span></a>` : ''}
        ${s.opening_hours ? `<div>${ic('clock', 20)}<span>${esc(s.opening_hours)}</span></div>` : ''}
        ${wa ? `<a href="${wa}" target="_blank" rel="noopener">${ic('whatsapp', 20)}<span>${fmtPhone(s.phone)}</span></a>` : ''}
        ${s.instagram ? `<a href="https://instagram.com/${encodeURIComponent(s.instagram)}" target="_blank" rel="noopener">${ic('instagram', 20)}<span>@${esc(s.instagram)}</span></a>` : ''}</div></div>` : ''}
      ${s.gallery_urls.length ? `<section><h2 style="margin-bottom:10px">Nosso espaço e trabalhos</h2><div class="bk-gallery">${s.gallery_urls.map((u, i) => `<img src="${esc(u)}" alt="Foto ${i + 1} do salão" loading="lazy">`).join('')}</div></section>` : ''}
      ${s.professionals.length ? `<section><h2 style="margin-bottom:10px">Nossa equipe</h2><div class="bk-team">${s.professionals.map((p) => `<div>${avatar(p.name, p.photo_url)}${esc(p.name.split(' ')[0])}<div class="muted" style="font-weight:500;font-size:.7rem">${esc(p.specialty || '')}</div></div>`).join('')}</div></section>` : ''}
      <section id="servicos"><h2 style="margin-bottom:10px">Serviços</h2>
        ${s.services.length ? Object.entries(groups).map(([g, list]) => `<h3 class="muted" style="margin:14px 0 8px;font-size:.82rem;text-transform:uppercase;letter-spacing:.06em">${esc(g)}</h3>
          <div style="display:grid;gap:10px">${list.map((sv) => `<button class="bk-opt" data-s="${sv.id}">${thumb(sv.photo_url)}<span class="grow"><b>${esc(sv.name)}</b>${sv.description ? `<small>${esc(sv.description)}</small>` : ''}
            <small>${ic('clock', 13)} ${dur(sv.duration_min)}</small></span><span class="c" style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><span class="price">${priceRange(sv)}</span><span class="plus">${ic('plus', 18)}</span></span></button>`).join('')}</div>`).join('')
          : '<div class="card"><p class="muted">Nenhum serviço disponível para agendamento online no momento. Fale com o salão pelo WhatsApp.</p></div>'}</section>
      ${mineCount ? `<button class="btn soft block" data-mine>${ic('calendar', 18)} Meus agendamentos (${mineCount})</button>` : `<button class="btn ghost block" data-mine>${ic('search', 18)} Consultar meu agendamento</button>`}
      <p class="bk-foot"><img src="/brand/vyllorri-v-transparente-256.png" alt="" style="width:28px;display:inline-block;vertical-align:middle;margin-right:6px">Agendamento online por Vyllorri Beauty</p>
    </div>
    ${s.services.length ? `<div class="bk-bar"><div class="in"><a class="btn primary block" href="#servicos" data-start>${ic('calendar', 20)} Agendar horário</a></div></div>` : ''}
  </div>`;
  root.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => pickService(Number(b.dataset.s))));
  root.querySelector('[data-start]')?.addEventListener('click', (e) => (e.preventDefault(), go('service')));
  root.querySelector('[data-mine]').onclick = () => go('mine');
}

function pickService(id) {
  st.service = st.salon.services.find((s) => s.id === id);
  st.time = null;
  st.pro = st.service.pros.length === 1 ? { id: st.service.pros[0].id } : undefined;
  go(st.service.pros.length === 1 ? 'date' : 'pro');
}

// ---------- 1. Serviço ----------
function chooseService() {
  root.innerHTML = `<div class="bk">${top('service')}<div class="bk-body">
    ${st.salon.services.map((sv) => `<button class="bk-opt" data-s="${sv.id}">${thumb(sv.photo_url)}<span class="grow"><b>${esc(sv.name)}</b>${sv.description ? `<small>${esc(sv.description)}</small>` : ''}<small>${ic('clock', 13)} ${dur(sv.duration_min)}</small></span>
      <span class="price">${priceRange(sv)}</span></button>`).join('')}</div></div>`;
  bindBack();
  root.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => pickService(Number(b.dataset.s))));
}

// ---------- 2. Profissional ----------
function choosePro() {
  if (!st.service) return go('service', false);
  root.innerHTML = `<div class="bk">${top('pro')}<div class="bk-body">${summaryChip()}
    <button class="bk-opt" data-p="0"><span class="thumb" style="background:var(--hero);color:#fff">${ic('sparkle', 26)}</span><span class="grow"><b>Qualquer profissional disponível</b><small>Mostra todos os horários livres</small></span>${ic('chevRight', 20, 'brand-t')}</button>
    ${st.service.pros.map((sp) => { const p = proOf(sp.id) || { name: 'Profissional' }; return `<button class="bk-opt" data-p="${sp.id}">${avatar(p.name, p.photo_url, 'lg')}<span class="grow"><b>${esc(p.name)}</b>${p.specialty ? `<small>${esc(p.specialty)}</small>` : ''}</span><span class="price">${money(sp.price_cents)}</span></button>`; }).join('')}
  </div></div>`;
  bindBack();
  root.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => {
    st.pro = Number(b.dataset.p) ? { id: Number(b.dataset.p) } : null;
    st.time = null;
    go('date');
  }));
}

// ---------- 3. Data ----------
function chooseDate() {
  if (!st.service) return go('service', false);
  const days = [...Array(30)].map((_, i) => addDays(todayStr(), i));
  if (st.date < todayStr()) st.date = todayStr();
  const m = Number(st.date.slice(5, 7)) - 1;
  root.innerHTML = `<div class="bk">${top('date')}<div class="bk-body">${summaryChip()}
    <div class="card" style="margin:0"><div class="card-head"><h2 style="text-transform:capitalize">${MONTHS[m]} ${st.date.slice(0, 4)}</h2>${ic('calendar', 20, 'brand-t')}</div>
      <div class="bk-days">${days.map((d) => `<button class="bk-day ${d === st.date ? 'on' : ''}" data-d="${d}" aria-label="${fmtDayLong(d)}"><small>${weekday(d)}</small><b>${d.slice(8)}</b><small>${MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)}</small></button>`).join('')}</div>
      <p class="small muted" style="margin-top:8px">${ic('info', 14)} Na próxima etapa mostramos só os horários realmente livres.</p></div></div>
    <div class="bk-bar"><div class="in"><button class="btn primary block" data-next>Ver horários de ${fmtDayLong(st.date).toLowerCase()} ${ic('arrowRight', 18)}</button></div></div></div>`;
  bindBack();
  root.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => {
    st.date = b.dataset.d;
    st.time = null;
    go('time');
  }));
  root.querySelector('[data-next]').onclick = () => go('time');
  root.querySelector('.bk-day.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// ---------- 4. Horário ----------
async function chooseTime() {
  if (!st.service) return go('service', false);
  root.innerHTML = `<div class="bk">${top('time')}<div class="bk-body">${summaryChip()}
    <div class="card" style="margin:0"><div class="card-head"><h2>${fmtDayLong(st.date)}</h2><button class="btn xs soft" data-change>Trocar dia</button></div>
      <div data-slots><div class="loading"><span class="spin"></span></div></div></div></div>
    <div class="bk-bar"><div class="in"><button class="btn primary block" data-next disabled>Escolha um horário</button></div></div></div>`;
  bindBack();
  root.querySelector('[data-change]').onclick = () => history.back();
  const box = root.querySelector('[data-slots]');
  const next = root.querySelector('[data-next]');
  try {
    const r = await call('GET', `/api/public/${encodeURIComponent(slug)}/slots?service_id=${st.service.id}&date=${st.date}${st.pro ? '&professional_id=' + st.pro.id : ''}`);
    if (!r.slots.length) {
      box.innerHTML = `<div class="empty"><div class="e-ic">${ic('calendar', 26)}</div><p>Sem horários livres neste dia.</p><button class="btn soft" data-other>Escolher outro dia</button></div>`;
      box.querySelector('[data-other]').onclick = () => history.back();
      return;
    }
    const parts = [['Manhã', (t) => t < '12:00'], ['Tarde', (t) => t >= '12:00' && t < '18:00'], ['Noite', (t) => t >= '18:00']];
    box.innerHTML = parts.map(([label, test]) => {
      const list = r.slots.filter(test);
      return list.length ? `<h3 class="muted" style="margin:6px 0 8px;font-size:.8rem">${label}</h3><div class="bk-slots" style="margin-bottom:10px">${list.map((t) => `<button data-t="${t}" class="${t === st.time ? 'on' : ''}">${t}</button>`).join('')}</div>` : '';
    }).join('');
    const sync = () => {
      next.disabled = !st.time;
      next.innerHTML = st.time ? `Continuar com ${st.time} ${ic('arrowRight', 18)}` : 'Escolha um horário';
    };
    box.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
      st.time = b.dataset.t;
      box.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b));
      sync();
    }));
    next.onclick = () => st.time && go('details');
    sync();
  } catch (e) {
    box.innerHTML = `<p class="err-t">${esc(e.message)}</p>`;
  }
}

// ---------- 5. Dados ----------
function details() {
  if (!st.time) return go('time', false);
  const saved = { ...store.get('vb_contato', {}), ...st.contact };
  root.innerHTML = `<div class="bk">${top('details')}<div class="bk-body">${summaryChip()}
    <form class="card" style="margin:0" novalidate>
      <label class="field"><span>Seu nome *</span><input name="name" maxlength="80" autocomplete="name" value="${esc(saved.name || '')}" required></label>
      <label class="field"><span>WhatsApp com DDD *</span><input name="phone" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="(11) 99999-9999" value="${esc(saved.phone || '')}" required></label>
      <label class="field"><span>Observação <small>(opcional)</small></span><textarea name="notes" maxlength="300" placeholder="Ex.: cabelo longo, quero tirar uma dúvida sobre a cor…">${esc(st.contact.notes || '')}</textarea></label>
      <p class="tiny muted">${ic('lock', 13)} Seus dados são usados só pelo salão para confirmar o atendimento. Não é preciso criar conta.</p>
    </form></div>
    <div class="bk-bar"><div class="in"><button class="btn primary block" data-next>Revisar agendamento ${ic('arrowRight', 18)}</button></div></div></div>`;
  bindBack();
  const f = root.querySelector('form');
  root.querySelector('[data-next]').onclick = () => {
    const name = f.name.value.trim(), phone = f.phone.value.trim();
    if (!name) return toast('Informe seu nome', 'err'), f.name.focus();
    if (phone.replace(/\D/g, '').length < 10) return toast('Informe seu WhatsApp com DDD', 'err'), f.phone.focus();
    st.contact = { name, phone, notes: f.notes.value.trim() };
    store.set('vb_contato', { name, phone });
    go('review');
  };
}

// ---------- 6. Revisão ----------
function review() {
  if (!st.contact.name) return go('details', false);
  const p = st.pro ? proOf(st.pro.id) : null;
  const s = st.salon;
  const Row = (icon, label, value) => `<div><span class="r-ic">${ic(icon, 20)}</span><span style="flex:1;min-width:0"><small>${label}</small><b>${value}</b></span></div>`;
  root.innerHTML = `<div class="bk">${top('review')}<div class="bk-body">
    <div class="card" style="margin:0"><div class="bk-review">
      ${Row('scissors', 'Serviço', `${esc(st.service.name)} · ${dur(st.service.duration_min)}`)}
      ${Row('user', 'Profissional', p ? esc(p.name) : 'Qualquer profissional disponível')}
      ${Row('calendar', 'Data', fmtDayLong(st.date))}
      ${Row('clock', 'Horário', st.time)}
      ${Row('coin', 'Valor', `${money(priceNow())}${st.pro ? '' : ' <span class="muted tiny">(pode variar conforme a profissional)</span>'}`)}
      ${s.address ? Row('pin', 'Endereço', esc(s.address)) : ''}
      ${Row('phone', 'Seus dados', `${esc(st.contact.name)} · ${esc(st.contact.phone)}`)}
    </div></div>
    <p class="small muted" style="text-align:center">${s.cancel_hours ? `Você pode cancelar pelo link da reserva até ${s.cancel_hours}h antes.` : 'Você pode cancelar pelo link da reserva.'}</p>
  </div>
  <div class="bk-bar"><div class="in"><button class="btn primary block" data-confirm>${ic('check', 20)} Confirmar agendamento</button></div></div></div>`;
  bindBack();
  const btn = root.querySelector('[data-confirm]');
  btn.onclick = async () => {
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Confirmando…';
    try {
      const r = await call('POST', `/api/public/${encodeURIComponent(slug)}/book`, {
        service_id: st.service.id, professional_id: st.pro ? st.pro.id : null, start_at: `${st.date} ${st.time}`, ...st.contact,
      });
      store.set(KEY, [r.token, ...store.get(KEY, []).filter((t) => t !== r.token)].slice(0, 20));
      history.replaceState({ step: 'done' }, '', `${location.pathname}?reserva=${r.token}`);
      st.step = 'done';
      bookingCard(r, true);
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
      btn.innerHTML = `${ic('check', 20)} Confirmar agendamento`;
      if (err.status === 409) setTimeout(() => ((st.time = null), go('time')), 1400);
    }
  };
}

// ---------- 7. Confirmação / consulta da reserva ----------
function bookingCard(r, fresh = false) {
  const cancelled = r.status === 'cancelled';
  const wa = waLink(r.phone, `Olá! Tenho um agendamento de ${r.service} em ${fmtDayLong(r.start_at.slice(0, 10)).toLowerCase()} às ${r.start_at.slice(11)}.`);
  const Row = (icon, label, value) => `<div><span class="r-ic">${ic(icon, 20)}</span><span style="flex:1;min-width:0"><small>${label}</small><b>${value}</b></span></div>`;
  root.innerHTML = `<div class="bk"><div class="bk-body" style="padding-top:28px">
    <div style="text-align:center"><div class="bk-done-ic" style="${cancelled ? 'background:var(--muted)' : ''}">${ic(cancelled ? 'x' : 'check', 40)}</div>
      <h1 class="serif" style="font-size:1.7rem;font-weight:600">${fresh ? 'Agendamento enviado!' : cancelled ? 'Reserva cancelada' : 'Sua reserva'}</h1>
      <p class="muted" style="margin-top:6px">${esc(r.salon)}</p>
      <span class="badge ${r.status === 'confirmed' ? 'st-confirmed' : cancelled ? 'st-cancelled' : r.status === 'completed' ? 'st-completed' : 'st-scheduled'}" style="margin-top:10px">${esc(r.status_text)}</span></div>
    <div class="card" style="margin:0"><div class="bk-review">
      ${Row('scissors', 'Serviço', esc(r.service))}${Row('user', 'Profissional', esc(r.professional))}
      ${Row('calendar', 'Data', fmtDayLong(r.start_at.slice(0, 10)))}${Row('clock', 'Horário', `${r.start_at.slice(11)} às ${r.end_at.slice(11)}`)}
      ${Row('coin', 'Valor', money(r.price_cents))}${r.address ? Row('pin', 'Endereço', `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}" target="_blank" rel="noopener">${esc(r.address)}</a>`) : ''}
    </div></div>
    ${fresh ? '<p class="small muted" style="text-align:center">O salão vai confirmar seu horário. Guarde este link para consultar ou cancelar.</p>' : ''}
    <div style="display:grid;gap:8px">
      ${wa && !cancelled ? `<a class="btn block" href="${wa}" target="_blank" rel="noopener">${ic('whatsapp', 18)} Falar com o salão</a>` : ''}
      ${r.can_cancel ? `<button class="btn ghost block" data-cancel style="color:var(--err)">${ic('x', 18)} Cancelar reserva</button>` : !cancelled && ['scheduled', 'confirmed'].includes(r.status) ? `<p class="tiny muted" style="text-align:center">Cancelamento online só até ${r.cancel_hours}h antes. Depois disso, fale com o salão.</p>` : ''}
      <button class="btn primary block" data-again>${ic('calendar', 18)} Agendar outro horário</button></div>
    <p class="bk-foot">Agendamento online por Vyllorri Beauty</p></div></div>`;
  window.scrollTo(0, 0);
  root.querySelector('[data-again]').onclick = () => {
    Object.assign(st, { service: null, pro: undefined, time: null });
    history.pushState({ step: 'home' }, '', location.pathname);
    st.step = 'home';
    render();
  };
  root.querySelector('[data-cancel]')?.addEventListener('click', async (e) => {
    if (!confirm('Cancelar esta reserva?')) return;
    e.currentTarget.disabled = true;
    try {
      bookingCard(await call('POST', `/api/public/${encodeURIComponent(slug)}/booking/${r.token}/cancel`));
      toast('Reserva cancelada');
    } catch (err) {
      toast(err.message, 'err');
      e.currentTarget.disabled = false;
    }
  });
}

// ---------- Meus agendamentos (guardados neste aparelho) ----------
async function mine() {
  const tokens = store.get(KEY, []);
  root.innerHTML = `<div class="bk"><div class="bk-top"><div class="r"><button class="back" data-back aria-label="Voltar">${ic('arrowLeft', 20)}</button><div><h2>Meus agendamentos</h2><div class="bk-step-label">${esc(st.salon.name)}</div></div></div></div>
    <div class="bk-body" data-list>${tokens.length ? '<div class="loading"><span class="spin"></span></div>' : ''}</div></div>`;
  bindBack();
  const box = root.querySelector('[data-list]');
  if (!tokens.length) {
    box.innerHTML = `<div class="empty"><div class="e-ic">${ic('calendar', 26)}</div><p>Os agendamentos feitos neste celular aparecem aqui.<br>Se agendou em outro aparelho, use o link recebido ou fale com o salão.</p>
      ${waLink(st.salon.phone) ? `<a class="btn soft" href="${waLink(st.salon.phone)}" target="_blank" rel="noopener">${ic('whatsapp', 18)} Falar com o salão</a>` : ''}</div>`;
    return;
  }
  const list = (await Promise.all(tokens.map((t) => call('GET', `/api/public/${encodeURIComponent(slug)}/booking/${t}`).catch(() => null)))).filter(Boolean);
  store.set(KEY, list.map((b) => b.token));
  box.innerHTML = list.length ? list.map((b) => `<button class="bk-opt" data-tk="${b.token}"><span class="thumb">${ic('calendar', 24)}</span><span class="grow"><b>${esc(b.service)}</b>
      <small>${fmtDayLong(b.start_at.slice(0, 10))} às ${b.start_at.slice(11)} · ${esc(b.professional)}</small></span><span class="badge ${b.status === 'confirmed' ? 'st-confirmed' : b.status === 'cancelled' ? 'st-cancelled' : 'st-scheduled'}">${esc(b.status_text)}</span></button>`).join('')
    : '<p class="muted">Nenhuma reserva encontrada.</p>';
  box.querySelectorAll('[data-tk]').forEach((b) => (b.onclick = () => {
    history.pushState({ step: 'mine' }, '', `${location.pathname}?reserva=${b.dataset.tk}`);
    bookingCard(list.find((x) => x.token === b.dataset.tk));
  }));
}

(async () => {
  try {
    st.salon = await call('GET', `/api/public/${encodeURIComponent(slug)}`);
    document.title = `Agendar · ${st.salon.name}`;
    const token = new URLSearchParams(location.search).get('reserva');
    history.replaceState({ step: 'home' }, '', location.pathname + location.search);
    if (token) {
      st.step = 'done';
      bookingCard(await call('GET', `/api/public/${encodeURIComponent(slug)}/booking/${encodeURIComponent(token)}`));
    } else render();
  } catch (e) {
    root.innerHTML = `<div class="bk"><div class="empty" style="padding-top:80px"><div class="e-ic">${ic('alert', 26)}</div><p>${esc(e.message)}</p></div></div>`;
  }
})();
