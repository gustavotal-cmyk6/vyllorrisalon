// Página pública do salão + agendamento em etapas curtas. Sem cadastro, sem senha.
import { esc, money, toast, addDays, todayStr, weekday, fmtDayLong, fmtPhone, waLink, ic, avatar } from './core.js';

const slug = decodeURIComponent(location.pathname.split('/')[2] || '');
const root = document.getElementById('book');
const st = { salon: null, step: 'home', service: null, pro: undefined, date: todayStr(), time: null, contact: {}, location: 'salon', address: {}, area: '', geo: null };
const steps = () => ['service', ...(st.service?.home ? ['place'] : []), ...(prosNow().length > 1 ? ['pro'] : []), 'time', 'details', 'review'];
const STEP_LABEL = { service: 'Escolha o serviço', place: 'Onde você quer ser atendida?', pro: 'Escolha a profissional', time: 'Escolha o dia e o horário', details: 'Seus dados', review: 'Revise e confirme' };
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
// no domicílio, só as profissionais que vão até a cliente
const prosNow = () => (st.service ? st.service.pros.filter((p) => st.location !== 'home' || p.home) : []);
const feeNow = () => {
  const h = st.salon.home;
  if (st.location !== 'home' || !h) return 0;
  if (h.fee_mode === 'by_area') return h.areas.find((a) => a.name === st.area)?.fee_cents ?? 0;
  return h.fee_cents;
};
/** Mesmo cálculo do servidor (que é quem decide de fato): % sobre o serviço e, se configurado, sobre o deslocamento. */
const depositNow = () => {
  const d = st.salon.deposit;
  if (!d || !st.service?.deposit) return 0;
  return Math.round(((priceNow() + (d.include_travel ? feeNow() : 0)) * d.pct) / 100);
};
const priceNow = () => (st.pro ? st.service.pros.find((p) => p.id === st.pro.id)?.price_cents : null) ?? Math.max(...prosNow().map((p) => p.price_cents), st.service.price_cents);
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
  const fn = { home, service: chooseService, place: choosePlace, pro: choosePro, date: chooseTime, time: chooseTime, details, review, done: () => {}, mine }[st.step];
  fn?.();
}

/** Cabeçalho das etapas: voltar, título e barra de progresso. */
function top(step) {
  const STEPS = steps();
  const i = STEPS.indexOf(step);
  return `<div class="bk-top"><div class="r"><button class="back" data-back aria-label="Voltar">${ic('arrowLeft', 20)}</button>
    <div style="flex:1;min-width:0"><h2>${STEP_LABEL[step]}</h2><div class="bk-step-label">Etapa ${i + 1} de ${STEPS.length} · ${esc(st.salon.name)}</div></div></div>
    <div class="bk-steps" aria-hidden="true" style="grid-template-columns:repeat(${STEPS.length},1fr)">${STEPS.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'on' : ''}"></i>`).join('')}</div></div>`;
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

// ---------- 0. Página inicial do salão (vitrine) ----------
// ícone de cada serviço pelo nome ou categoria
const SERVICE_IC = [
  [/escova|progressiva|chapinha|secagem|babyliss/i, 'dryer'], [/colora|tinta|luzes|mecha|balayage|tonaliza|descolor/i, 'drop'],
  [/corte|franja|aparar/i, 'scissors'], [/unha|manicure|pedicure|nail|alongamento|esmalta/i, 'hand'],
  [/maquia|make/i, 'brush'], [/sobrancelha|cílio|cilio|lash|henna/i, 'eye'], [/limpeza|pele|estética|estetica|massagem|depila/i, 'leaf'],
  [/hidrata|cauteriza|reconstru|tratamento|botox|nutri/i, 'sparkle'],
];
const svcIcon = (sv) => (SERVICE_IC.find(([re]) => re.test(`${sv.name} ${sv.category || ''}`)) || [0, 'sparkle'])[1];
/** "Cuide da sua *beleza*" → a palavra entre asteriscos fica em destaque. */
const headlineHtml = (t) => esc(t).replace(/\*([^*]+)\*/g, '<em>$1</em>');

function home() {
  const s = st.salon;
  const mineCount = store.get(KEY, []).length;
  const mapLink = s.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}` : null;
  const wa = waLink(s.phone, `Olá! Vim pela página de agendamento do ${s.name}.`);
  const featured = s.services.slice(0, 6);
  root.innerHTML = `<div class="lp">
    <header class="lp-hero">${s.cover_url ? `<img class="lp-cover" src="${esc(s.cover_url)}" alt="">` : ''}
      <div class="lp-top">
        <div class="lp-brand">${s.logo_url ? `<img src="${esc(s.logo_url)}" alt="">` : ''}<div><b>${esc(s.name)}</b><small>Salão de beleza</small></div></div>
        <button class="lp-menu" data-menu aria-label="Menu">${ic('menu', 24)}</button>
      </div>
      <div class="lp-hero-in">
        <h1>${headlineHtml(s.headline || 'Cuide da sua *beleza* com quem entende!')}</h1>
        ${s.description ? `<p>${esc(s.description)}</p>` : ''}
        ${s.services.length ? `<button class="lp-cta" data-start>${ic('calendar', 22)} Agendar agora ${ic('arrowRight', 20)}</button>` : ''}
      </div>
    </header>

    ${featured.length ? `<section class="lp-sec" id="servicos"><h2 class="lp-title"><span>Nossos serviços</span></h2>
      <div class="lp-svcs">${featured.map((sv) => `<button class="lp-svc" data-s="${sv.id}"><span class="lp-svc-ic">${ic(svcIcon(sv), 34)}</span><b>${esc(sv.name)}</b><small>${priceRange(sv)}</small></button>`).join('')}</div>
      ${s.services.length > featured.length ? `<button class="lp-link" data-all>Ver todos os serviços (${s.services.length}) ${ic('arrowRight', 16)}</button>` : ''}</section>`
      : `<section class="lp-sec"><p class="lp-muted">Nenhum serviço disponível para agendamento online no momento.${wa ? ' Fale com o salão pelo WhatsApp.' : ''}</p></section>`}

    ${s.gallery_urls.length ? `<section class="lp-sec"><h2 class="lp-title"><span>Resultados que inspiram</span></h2>
      <div class="lp-gallery">${s.gallery_urls.map((u, i) => `<img src="${esc(u)}" alt="Trabalho ${i + 1} do salão" loading="lazy">`).join('')}</div></section>` : ''}

    ${s.professionals.length > 1 ? `<section class="lp-sec"><h2 class="lp-title"><span>Nossa equipe</span></h2>
      <div class="lp-team">${s.professionals.map((p) => `<div>${avatar(p.name, p.photo_url)}<b>${esc(p.name.split(' ')[0])}</b><small>${esc(p.specialty || '')}</small></div>`).join('')}</div></section>` : ''}

    ${s.address || s.opening_hours || wa || s.instagram || s.home ? `<section class="lp-sec" id="contato"><h2 class="lp-title"><span>Onde estamos</span></h2><div class="lp-info">
      ${s.address ? `<a href="${mapLink}" target="_blank" rel="noopener">${ic('pin', 20)}<span>${esc(s.address)}</span></a>` : ''}
      ${s.opening_hours ? `<div>${ic('clock', 20)}<span class="pre"><b>No salão:</b> ${esc(s.opening_hours)}</span></div>` : ''}
      ${s.home ? `<div>${ic('home', 20)}<span><b>A domicílio:</b> das ${esc(s.home.start)} às ${esc(s.home.end)}${s.home.areas.length ? ` · ${esc(s.home.areas.map((a) => a.name).join(', '))}` : ''}</span></div>` : ''}
      ${wa ? `<a href="${wa}" target="_blank" rel="noopener">${ic('whatsapp', 20)}<span>${fmtPhone(s.phone)}</span></a>` : ''}
      ${s.instagram ? `<a href="https://instagram.com/${encodeURIComponent(s.instagram)}" target="_blank" rel="noopener">${ic('instagram', 20)}<span>@${esc(s.instagram)}</span></a>` : ''}</div></section>` : ''}

    <section class="lp-sec"><button class="lp-link" data-mine>${ic('calendar', 18)} ${mineCount ? `Meus agendamentos (${mineCount})` : 'Consultar meu agendamento'}</button></section>
    <p class="lp-foot"><img src="/brand/vyllorri-v-transparente-256.png" alt="">Agendamento online por Vyllorri Beauty</p>
    ${s.services.length ? `<div class="lp-bar"><button class="lp-cta block" data-start>${ic('calendar', 22)} Agendar agora</button></div>` : ''}
  </div>`;
  root.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => pickService(Number(b.dataset.s))));
  root.querySelectorAll('[data-start],[data-all]').forEach((b) => (b.onclick = () => go('service')));
  root.querySelector('[data-mine]').onclick = () => go('mine');
  // botão fixo só aparece quando o da capa sai da tela (nunca dois iguais ao mesmo tempo)
  const heroCta = root.querySelector('.lp-hero [data-start]'), bar = root.querySelector('.lp-bar');
  if (heroCta && bar && 'IntersectionObserver' in window) new IntersectionObserver(([e]) => bar.classList.toggle('show', !e.isIntersecting)).observe(heroCta);
  else bar?.classList.add('show');
  root.querySelector('[data-menu]').onclick = () => {
    const links = [
      s.services.length && ['service', 'calendar', 'Agendar horário'], ['mine', 'search', 'Meus agendamentos'],
      wa && ['wa', 'whatsapp', 'Falar no WhatsApp'], s.instagram && ['ig', 'instagram', 'Instagram'], mapLink && ['map', 'pin', 'Como chegar'],
    ].filter(Boolean);
    const sheet = document.createElement('div');
    sheet.className = 'lp-sheet';
    sheet.innerHTML = `<div class="lp-sheet-in" role="dialog" aria-label="Menu"><button class="lp-menu lp-close" aria-label="Fechar">${ic('x', 22)}</button>
      ${links.map(([k, icon, label]) => `<button data-k="${k}">${ic(icon, 20)} ${label}</button>`).join('')}</div>`;
    document.body.appendChild(sheet);
    const close = () => sheet.remove();
    sheet.onclick = (e) => {
      const b = e.target.closest('[data-k]');
      if (e.target === sheet || e.target.closest('.lp-close')) return close();
      if (!b) return;
      close();
      ({ service: () => go('service'), mine: () => go('mine'), wa: () => window.open(wa, '_blank', 'noopener'), ig: () => window.open(`https://instagram.com/${encodeURIComponent(s.instagram)}`, '_blank', 'noopener'), map: () => window.open(mapLink, '_blank', 'noopener') })[b.dataset.k]();
    };
  };
}

function pickService(id) {
  st.service = st.salon.services.find((s) => s.id === id);
  st.time = null;
  st.location = 'salon';
  if (st.service.home) return go('place');
  afterPlace();
}
function afterPlace() {
  const pros = prosNow();
  st.pro = pros.length === 1 ? { id: pros[0].id } : undefined;
  go(pros.length === 1 ? 'time' : 'pro');
}

// ---------- Onde: salão ou casa ----------
function choosePlace() {
  if (!st.service) return go('service', false);
  const h = st.salon.home;
  const feeText = h.fee_mode === 'by_area' ? `taxa de deslocamento a partir de ${money(Math.min(...h.areas.map((a) => a.fee_cents)))}` : h.fee_cents ? `taxa de deslocamento de ${money(h.fee_cents)}` : 'sem taxa de deslocamento';
  root.innerHTML = `<div class="bk">${top('place')}<div class="bk-body">${summaryChip()}
    <button class="bk-opt" data-place="salon"><span class="thumb">${ic('home', 26)}</span><span class="grow"><b>No salão</b><small>${esc(st.salon.address || st.salon.name)}</small></span>${ic('chevRight', 20, 'brand-t')}</button>
    <button class="bk-opt" data-place="home"><span class="thumb" style="background:var(--hero);color:#fff">${ic('pin', 26)}</span><span class="grow"><b>Na minha casa</b><small>A profissional vai até você · ${feeText}</small>
      ${h.areas.length ? `<small>Atendemos: ${esc(h.areas.map((a) => a.name).join(', '))}</small>` : ''}</span>${ic('chevRight', 20, 'brand-t')}</button></div></div>`;
  bindBack();
  root.querySelectorAll('[data-place]').forEach((b) => (b.onclick = () => {
    st.location = b.dataset.place;
    afterPlace();
  }));
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
    ${prosNow().map((sp) => { const p = proOf(sp.id) || { name: 'Profissional' }; return `<button class="bk-opt" data-p="${sp.id}">${avatar(p.name, p.photo_url, 'lg')}<span class="grow"><b>${esc(p.name)}</b>${p.specialty ? `<small>${esc(p.specialty)}</small>` : ''}</span><span class="price">${money(sp.price_cents)}</span></button>`; }).join('')}
  </div></div>`;
  bindBack();
  root.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => {
    st.pro = Number(b.dataset.p) ? { id: Number(b.dataset.p) } : null;
    st.time = null;
    go('time');
  }));
}

// ---------- 3. Data ----------
// ---------- 3. Dia e horário (na mesma tela) ----------
async function chooseTime() {
  if (!st.service) return go('service', false);
  const days = [...Array(30)].map((_, i) => addDays(todayStr(), i));
  if (st.date < todayStr()) st.date = todayStr();
  root.innerHTML = `<div class="bk">${top('time')}<div class="bk-body">${summaryChip()}
    <div class="card" style="margin:0"><div class="bk-days-nav"><h2 style="text-transform:capitalize">${MONTHS[Number(st.date.slice(5, 7)) - 1]} ${st.date.slice(0, 4)}</h2>
      <span style="display:flex;gap:6px"><button type="button" data-scroll="-1" aria-label="Dias anteriores">${ic('chevLeft', 18)}</button><button type="button" data-scroll="1" aria-label="Próximos dias">${ic('chevRight', 18)}</button></span></div>
      <div class="bk-days">${days.map((d) => `<button class="bk-day ${d === st.date ? 'on' : ''}" data-d="${d}" aria-label="${fmtDayLong(d)}"><small>${weekday(d)}</small><b>${d.slice(8)}</b></button>`).join('')}</div></div>
    <div class="card" style="margin:0"><h2 style="margin-bottom:10px" data-dayname>${fmtDayLong(st.date)}</h2><div data-slots></div></div></div>
    <div class="bk-bar"><div class="in"><button class="btn primary block" data-next disabled>Escolha um horário</button></div></div></div>`;
  bindBack();
  const box = root.querySelector('[data-slots]');
  const next = root.querySelector('[data-next]');
  const sync = () => {
    next.disabled = !st.time;
    next.innerHTML = st.time ? `Continuar com ${fmtDayLong(st.date).toLowerCase()} às ${st.time} ${ic('arrowRight', 18)}` : 'Escolha um horário';
  };
  next.onclick = () => st.time && go('details');
  let seq = 0;
  const loadSlots = async () => {
    const my = ++seq;
    box.innerHTML = '<div class="loading" style="padding:20px"><span class="spin"></span></div>';
    root.querySelector('[data-dayname]').textContent = fmtDayLong(st.date);
    sync();
    try {
      const r = await call('GET', `/api/public/${encodeURIComponent(slug)}/slots?service_id=${st.service.id}&date=${st.date}${st.pro ? '&professional_id=' + st.pro.id : ''}${st.location === 'home' ? '&location=home' : ''}`);
      if (my !== seq) return;
      if (!r.slots.length) return (box.innerHTML = '<p class="muted" style="padding:6px 0">Sem horários livres neste dia. Toque em outro dia acima.</p>');
      const parts = [['Manhã', (t) => t < '12:00'], ['Tarde', (t) => t >= '12:00' && t < '18:00'], ['Noite', (t) => t >= '18:00']];
      box.innerHTML = parts.map(([label, test]) => {
        const list = r.slots.filter(test);
        return list.length ? `<h3 class="muted" style="margin:4px 0 8px;font-size:.8rem">${label}</h3><div class="bk-slots" style="margin-bottom:10px">${list.map((t) => `<button data-t="${t}" class="${t === st.time ? 'on' : ''}">${t}</button>`).join('')}</div>` : '';
      }).join('');
      box.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
        st.time = b.dataset.t;
        box.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b));
        sync();
      }));
    } catch (e) {
      box.innerHTML = `<p class="err-t">${esc(e.message)}</p>`;
    }
  };
  root.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => {
    st.date = b.dataset.d;
    st.time = null;
    root.querySelectorAll('[data-d]').forEach((x) => x.classList.toggle('on', x === b));
    loadSlots();
  }));
  const strip = root.querySelector('.bk-days');
  root.querySelectorAll('[data-scroll]').forEach((b) => (b.onclick = () => strip.scrollBy({ left: Number(b.dataset.scroll) * strip.clientWidth * 0.8, behavior: 'smooth' })));
  // rola só a faixa (scrollIntoView rolaria a página inteira)
  const on = root.querySelector('.bk-day.on');
  if (on) strip.scrollLeft = on.offsetLeft - strip.clientWidth / 2 + on.clientWidth / 2;
  loadSlots();
}

// ---------- 4. Dados ----------
function details() {
  if (!st.time) return go('time', false);
  const saved = { ...store.get('vb_contato', {}), ...st.contact };
  root.innerHTML = `<div class="bk">${top('details')}<div class="bk-body">${summaryChip()}
    <form class="card" style="margin:0" novalidate>
      <label class="field"><span>Seu nome *</span><input name="name" maxlength="80" autocomplete="name" value="${esc(saved.name || '')}" required></label>
      <label class="field"><span>WhatsApp com DDD *</span><input name="phone" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="(11) 99999-9999" value="${esc(saved.phone || '')}" required></label>
      ${st.location === 'home' ? addressFields() : ''}
      <label class="field"><span>Observação <small>(opcional)</small></span><textarea name="notes" maxlength="300" placeholder="Ex.: cabelo longo, quero tirar uma dúvida sobre a cor…">${esc(st.contact.notes || '')}</textarea></label>
      <p class="tiny muted">${ic('lock', 13)} Seus dados são usados só pelo salão para confirmar o atendimento. Não é preciso criar conta.</p>
    </form></div>
    <div class="bk-bar"><div class="in"><button class="btn primary block" data-next>Revisar agendamento ${ic('arrowRight', 18)}</button></div></div></div>`;
  bindBack();
  const f = root.querySelector('form');
  if (st.location === 'home') bindAddress(f);
  root.querySelector('[data-next]').onclick = () => {
    const name = f.name.value.trim(), phone = f.phone.value.trim();
    if (!name) return toast('Informe seu nome', 'err'), f.name.focus();
    if (phone.replace(/\D/g, '').length < 10) return toast('Informe seu WhatsApp com DDD', 'err'), f.phone.focus();
    if (st.location === 'home' && !readAddress(f)) return;
    st.contact = { name, phone, notes: f.notes.value.trim() };
    store.set('vb_contato', { name, phone });
    go('review');
  };
}

// ---------- 5. Revisão ----------
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
      ${st.location === 'home' ? Row('pin', 'Atendimento na sua casa', esc(addrLine(st.address))) : s.address ? Row('pin', 'No salão', esc(s.address)) : ''}
      ${Row('phone', 'Seus dados', `${esc(st.contact.name)} · ${esc(st.contact.phone)}`)}
    </div></div>
    ${totalsCard(priceNow(), feeNow(), depositNow(), !st.pro && prosNow().length > 1)}
    <p class="small muted" style="text-align:center">${s.cancel_hours ? `Você pode cancelar pelo link da reserva até ${s.cancel_hours}h antes.` : 'Você pode cancelar pelo link da reserva.'}</p>
  </div>
  <div class="bk-bar"><div class="in"><button class="btn primary block" data-confirm>${ic('check', 20)} ${depositNow() ? 'Confirmar e pagar o sinal' : 'Confirmar agendamento'}</button></div></div></div>`;
  bindBack();
  const btn = root.querySelector('[data-confirm]');
  btn.onclick = async () => {
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Confirmando…';
    try {
      const r = await call('POST', `/api/public/${encodeURIComponent(slug)}/book`, {
        service_id: st.service.id, professional_id: st.pro ? st.pro.id : null, start_at: `${st.date} ${st.time}`, ...st.contact,
        location: st.location, address: st.location === 'home' ? st.address : undefined, area: st.area || undefined, lat: st.geo?.lat, lng: st.geo?.lng,
      });
      store.set(KEY, [r.token, ...store.get(KEY, []).filter((t) => t !== r.token)].slice(0, 20));
      history.replaceState({ step: 'done' }, '', `${location.pathname}?reserva=${r.token}`);
      st.step = 'done';
      bookingCard(r, true);
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
      btn.innerHTML = `${ic('check', 20)} Tentar de novo`;
      if (err.status === 409) setTimeout(() => ((st.time = null), go('time')), 1400);
    }
  };
}

// ---------- Confirmação / consulta da reserva ----------
function bookingCard(r, fresh = false) {
  const cancelled = r.status === 'cancelled';
  const wa = waLink(r.phone, `Olá! Tenho um agendamento de ${r.service} em ${fmtDayLong(r.start_at.slice(0, 10)).toLowerCase()} às ${r.start_at.slice(11)}.`);
  const Row = (icon, label, value) => `<div><span class="r-ic">${ic(icon, 20)}</span><span style="flex:1;min-width:0"><small>${label}</small><b>${value}</b></span></div>`;
  root.innerHTML = `<div class="bk"><div class="bk-body" style="padding-top:28px">
    <div style="text-align:center"><div class="bk-done-ic" style="${cancelled ? 'background:var(--muted)' : ''}">${ic(cancelled ? 'x' : 'check', 40)}</div>
      <h1 class="serif" style="font-size:1.7rem;font-weight:600">${fresh && r.charge?.status === 'pending' ? 'Falta só o sinal!' : fresh ? 'Agendamento enviado!' : cancelled ? 'Reserva cancelada' : 'Sua reserva'}</h1>
      <p class="muted" style="margin-top:6px">${esc(r.salon)}</p>
      <span class="badge ${r.status === 'confirmed' ? 'st-confirmed' : cancelled ? 'st-cancelled' : r.status === 'completed' ? 'st-completed' : 'st-scheduled'}" style="margin-top:10px">${esc(r.status_text)}</span></div>
    <div class="card" style="margin:0"><div class="bk-review">
      ${Row('scissors', 'Serviço', esc(r.service))}${Row('user', 'Profissional', esc(r.professional))}
      ${Row('calendar', 'Data', fmtDayLong(r.start_at.slice(0, 10)))}${Row('clock', 'Horário', `${r.start_at.slice(11)} às ${r.end_at.slice(11)}`)}
      ${r.location === 'home' && r.home_address ? Row('pin', 'Atendimento na sua casa', esc(addrLine(r.home_address))) : r.address ? Row('pin', 'Endereço', `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}" target="_blank" rel="noopener">${esc(r.address)}</a>`) : ''}
    </div></div>
    ${totalsCard(r.price_cents, r.travel_fee_cents, r.charge?.amount_cents || 0, false, r.paid_cents)}
    ${r.charge && !cancelled ? payBox(r) : ''}
    ${fresh && !r.charge ? '<p class="small muted" style="text-align:center">O salão vai confirmar seu horário. Guarde este link para consultar ou cancelar.</p>' : ''}
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
  bindPay(r);
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

// ---------- Endereço (atendimento a domicílio) ----------
const addrLine = (a) => [`${a.street || ''}, ${a.number || ''}`, a.complement, a.district, a.city].filter(Boolean).join(' · ');
function addressFields() {
  const a = st.address, h = st.salon.home;
  return `<h3 style="margin:6px 0 10px">Endereço do atendimento</h3>
    <div class="row"><label class="field"><span>CEP *</span><input name="cep" inputmode="numeric" maxlength="9" placeholder="00000-000" value="${esc(a.cep || '')}" autocomplete="postal-code"></label>
      <label class="field"><span>Número *</span><input name="number" maxlength="15" value="${esc(a.number || '')}"></label></div>
    <label class="field"><span>Rua *</span><input name="street" maxlength="120" value="${esc(a.street || '')}" autocomplete="address-line1"></label>
    <label class="field"><span>Complemento</span><input name="complement" maxlength="60" value="${esc(a.complement || '')}" placeholder="Apto, bloco, casa…"></label>
    ${h.areas.length ? `<label class="field"><span>Bairro / região atendida *</span><select name="area"><option value="">Escolha…</option>${h.areas.map((x) => `<option ${x.name === st.area ? 'selected' : ''} value="${esc(x.name)}">${esc(x.name)}${h.fee_mode === 'by_area' ? ` · ${money(x.fee_cents)}` : ''}</option>`).join('')}</select></label>` : ''}
    <div class="row"><label class="field"><span>Bairro *</span><input name="district" maxlength="60" value="${esc(a.district || '')}"></label>
      <label class="field"><span>Cidade</span><input name="city" maxlength="60" value="${esc(a.city || '')}"></label></div>
    <label class="field"><span>Ponto de referência <small>(opcional)</small></span><input name="reference" maxlength="120" value="${esc(a.reference || '')}"></label>
    <button type="button" class="btn sm soft" data-geo style="margin-bottom:12px">${ic('pin', 16)} ${st.geo ? 'Localização adicionada' : 'Enviar minha localização (opcional)'}</button>
    <div class="total-box" data-fee style="margin-top:0"></div>`;
}
function bindAddress(f) {
  const showFee = () => {
    st.area = f.area?.value || '';
    const fee = feeNow();
    f.querySelector('[data-fee]').innerHTML = `<div class="line"><span>Taxa de deslocamento</span><b>${st.salon.home.fee_mode === 'by_area' && !st.area ? 'escolha o bairro' : money(fee)}</b></div>`;
  };
  showFee();
  f.area?.addEventListener('change', showFee);
  // CEP preenche rua, bairro e cidade automaticamente
  f.cep.addEventListener('input', async () => {
    const cep = f.cep.value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json());
      if (r.erro) return toast('CEP não encontrado. Preencha o endereço manualmente.', 'err');
      if (!f.street.value) f.street.value = r.logradouro || '';
      if (!f.district.value) f.district.value = r.bairro || '';
      if (!f.city.value) f.city.value = r.localidade ? `${r.localidade}/${r.uf}` : '';
      if (f.area && !f.area.value) {
        const match = [...f.area.options].find((o) => o.value && o.value.toLowerCase() === (r.bairro || '').toLowerCase());
        if (match) (f.area.value = match.value), showFee();
      }
      f.number.focus();
    } catch {
      /* sem internet para o CEP: segue preenchimento manual */
    }
  });
  f.querySelector('[data-geo]').onclick = (e) => {
    if (!navigator.geolocation) return toast('Seu aparelho não permite compartilhar a localização.', 'err');
    const b = e.currentTarget;
    b.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        st.geo = { lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 };
        b.innerHTML = `${ic('check', 16)} Localização adicionada`;
      },
      () => {
        b.disabled = false;
        toast('Não foi possível obter a localização. O endereço já é suficiente.', 'err');
      },
      { timeout: 10000 },
    );
  };
}
function readAddress(f) {
  const a = { cep: f.cep.value.replace(/\D/g, ''), street: f.street.value.trim(), number: f.number.value.trim(), complement: f.complement.value.trim(), district: f.district.value.trim(), city: f.city.value.trim(), reference: f.reference.value.trim() };
  const need = [[a.cep.length === 8, 'cep', 'Informe um CEP válido'], [a.street, 'street', 'Informe a rua'], [a.number, 'number', 'Informe o número'], [a.district, 'district', 'Informe o bairro']];
  if (f.area) need.push([f.area.value, 'area', 'Escolha o bairro ou região atendida']);
  for (const [ok, field, msg] of need) if (!ok) return toast(msg, 'err'), f[field].focus(), false;
  st.address = a;
  st.area = f.area?.value || '';
  return true;
}

// ---------- Valores: serviço, deslocamento, total, sinal e restante ----------
function totalsCard(price, fee, deposit, varies = false, paid = null) {
  const total = price + fee;
  const pct = st.salon.deposit?.pct;
  return `<div class="card" style="margin:0"><div class="total-box" style="margin:0;background:transparent;padding:0">
    <div class="line"><span>Serviço</span><span>${money(price)}${varies ? ' <span class="muted tiny">(até)</span>' : ''}</span></div>
    ${fee ? `<div class="line"><span>Deslocamento</span><span>${money(fee)}</span></div>` : ''}
    <div class="line big"><span>Total</span><span>${money(total)}</span></div>
    ${deposit ? `<div class="line" style="margin-top:8px"><span><b>Sinal${pct ? ` (${String(pct).replace('.', ',')}%)` : ''}</b> — pago agora por Pix</span><b class="brand-t">${money(deposit)}</b></div>
      <div class="line"><span>Restante no atendimento</span><span>${money(total - deposit)}</span></div>` : ''}
    ${paid != null && paid > 0 ? `<div class="line"><span>Já pago</span><span class="ok-t">${money(paid)}</span></div>` : ''}</div></div>`;
}

// ---------- Pagamento do sinal por Pix ----------
function payBox(r) {
  const c = r.charge;
  if (['pending', 'rejected'].includes(c.status)) {
    const until = c.expires_at ? c.expires_at.slice(11, 16) : null;
    return `<div class="card" style="margin:0;text-align:center">
      <h2 style="margin-bottom:4px">Pague o sinal de ${money(c.amount_cents)} por Pix</h2>
      <p class="small muted" style="margin-bottom:10px">${until ? `Pague até <b>${until}</b> para garantir seu horário.` : ''} O restante (${money(c.remaining_cents)}) é pago no atendimento.</p>
      ${c.status === 'rejected' ? `<div class="alert err" style="text-align:left"><span class="a-ic">${ic('alert', 18)}</span><span>O salão não localizou o pagamento${c.reject_reason ? `: ${esc(c.reject_reason)}` : ''}. Confira e envie o comprovante novamente.</span></div>` : ''}
      <div style="width:220px;max-width:70vw;margin:0 auto 12px">${c.qr_svg}</div>
      <button class="btn block" data-copy>${ic('copy', 18)} Copiar código Pix</button>
      <ol class="small" style="text-align:left;margin:14px 0 6px;padding-left:18px;line-height:1.7">
        <li>Abra o app do seu banco e escolha <b>Pix</b>.</li><li>Leia o QR Code ou cole o código (Pix Copia e Cola).</li><li>Confira o valor de <b>${money(c.amount_cents)}</b> e pague.</li><li>Envie o comprovante aqui embaixo.</li></ol>
      <button class="btn primary block" data-receipt>${ic('image', 18)} Enviar comprovante</button>
      <p class="tiny muted" style="margin-top:8px">O horário é confirmado depois que o salão confere o recebimento.</p></div>`;
  }
  const tone = { submitted: 'warn', approved: 'ok', refund_due: 'warn', refunded: 'ok', retained: '', expired: 'err', cancelled: '' }[c.status] || '';
  return `<div class="alert ${tone}" style="margin:0"><span class="a-ic">${ic(c.status === 'approved' ? 'checkCircle' : c.status === 'submitted' ? 'clock' : 'info', 18)}</span><span>${esc(c.status_text)}${c.status === 'approved' ? ` · restante ${money(r.remaining_cents)} no atendimento` : ''}</span></div>`;
}
function bindPay(r) {
  root.querySelector('[data-copy]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(r.charge.brcode);
      toast('Código Pix copiado. Cole no app do seu banco.');
    } catch {
      prompt('Copie o código Pix:', r.charge.brcode);
    }
  });
  root.querySelector('[data-receipt]')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const btn = root.querySelector('[data-receipt]');
      btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span> Enviando…';
      try {
        const data = await shrink(file);
        bookingCard(await call('POST', `/api/public/${encodeURIComponent(slug)}/booking/${r.token}/receipt`, { data }));
        toast('Comprovante enviado! O salão vai conferir.');
      } catch (err) {
        toast(err.message, 'err');
        btn.disabled = false;
        btn.innerHTML = `${ic('image', 18)} Enviar comprovante`;
      }
    };
    input.click();
  });
}
/** Reduz a foto/print do comprovante no próprio celular antes de enviar. */
async function shrink(file) {
  const img = await new Promise((ok, bad) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => bad(new Error('Não foi possível ler esta imagem. Envie um print do comprovante.'));
    i.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return c.toDataURL('image/jpeg', 0.8);
}
