// Novo agendamento em passos, com o Vyllo: cliente → serviço → profissional → dia e horário → conferir.
// Um passo por tela, cartões grandes e só o que importa. O formulário completo (duração, preço, vários profissionais) continua em "Formulário completo".
import { state, GET, POST, esc, money, modal, toast, submitting, todayStr, addDays, addMinutes, fmtDayLong, fmtPhone, weekday, can, ic, avatar } from '../core.js';
import { clientPicker, withConflict, newVisit } from './visits.js';

const first = (n) => String(n || '').trim().split(/\s+/)[0];
const FACE = '/vendas/vyllo-rosto.png';

const prosFor = (serviceId) => {
  const s = state.services.find((x) => x.id === serviceId);
  return s ? state.pros.filter((p) => p.active && s.pros.some((l) => l.professional_id === p.id)) : [];
};
const priceFor = (serviceId, proId) => {
  const s = state.services.find((x) => x.id === serviceId);
  return s?.pros.find((l) => l.professional_id === proId)?.price_cents ?? s?.price_cents ?? 0;
};
/** Profissionais que fazem TODOS os serviços escolhidos. */
const candidates = (ids) => state.pros.filter((p) => p.active && ids.every((id) => prosFor(id).some((x) => x.id === p.id)));

export function novoAgendamento(opts = {}) {
  const S = { client: opts.client || null, picked: [], proId: null, date: opts.date || todayStr(), time: opts.time || null, notes: '', confirmed: false, cat: '', noteOpen: false };
  let step = '', close = () => {}, box;
  const myPro = can.pro() ? state.user.professional_id : null;

  // passos que existem agora (alguns somem: cliente já escolhida, profissional óbvia)
  function proAuto() {
    const c = candidates(S.picked);
    if (!c.length) return null;
    const want = [opts.proId, myPro].find((id) => id && c.some((p) => p.id === id));
    if (want) return want;
    if (can.solo() || c.length === 1) return c[0].id;
    return null;
  }
  // com poucas profissionais o passo "Com quem?" nem aparece (sozinha, ou só uma ativa): o contador de passos já nasce certo
  const oneActive = () => can.solo() || state.pros.filter((p) => p.active).length === 1;
  const flow = () => [...(opts.client ? [] : ['client']), 'svc', ...((S.picked.length ? proAuto() : oneActive()) ? [] : ['pro']), 'when', 'ok'];
  const idx = () => flow().indexOf(step);
  const total = () => S.picked.reduce((s, id) => s + priceFor(id, S.proId), 0);
  const minutes = () => S.picked.reduce((s, id) => s + state.services.find((x) => x.id === id).duration_min, 0);
  const endTime = () => addMinutes(`${S.date} ${S.time}`, minutes()).slice(11);

  const SAY = {
    client: () => 'Vamos marcar um horário! Quem vai ser atendida?',
    svc: () => `${S.client ? `Boa, ${esc(first(S.client.name))}! ` : ''}O que vamos fazer? Pode marcar mais de um serviço.`,
    pro: () => 'Com quem vai ser?',
    when: () => 'Qual dia e horário ficam bons? Só aparecem os horários livres.',
    ok: () => 'Tudo certo? Confere e toque em Agendar.',
  };

  function go(to) {
    const f = flow();
    let i = typeof to === 'number' ? idx() + to : f.indexOf(to);
    i = Math.max(0, Math.min(f.length - 1, i));
    step = f[i];
    if (step === 'pro' || step === 'when') S.proId = S.proId && candidates(S.picked).some((p) => p.id === S.proId) ? S.proId : proAuto();
    draw();
  }

  const head = () => {
    const f = flow(), i = idx();
    return `<div class="nv-top"><div class="nv-prog"><span>Passo ${i + 1} de ${f.length}</span><i><b style="width:${((i + 1) / f.length) * 100}%"></b></i></div>
      <div class="nv-say"><img src="${FACE}" alt="" width="40" height="40"><div class="vx-bub v">${SAY[step]()}</div></div></div>`;
  };
  const foot = ({ next, nextLabel = 'Continuar', hideNext = false } = {}) => `<div class="nv-foot">
    ${idx() > 0 ? `<button type="button" class="btn ghost" data-back>${ic('arrowLeft', 16)} Voltar</button>` : '<span></span>'}
    ${hideNext ? '' : `<button type="button" class="btn primary" data-next ${next ? '' : 'disabled'}>${nextLabel} ${ic('arrowRight', 16)}</button>`}</div>
    <p class="nv-full"><button type="button" data-full>Prefiro o formulário completo</button></p>`;
  const wire = (onNext) => {
    box.querySelector('[data-back]')?.addEventListener('click', () => go(-1));
    box.querySelector('[data-next]')?.addEventListener('click', () => onNext?.());
    box.querySelector('[data-full]')?.addEventListener('click', () => { close(); newVisit({ ...opts, client: S.client || opts.client, classic: true }); });
  };

  // ---- passo: cliente ----
  function stepClient() {
    box.innerHTML = `${head()}<div data-client></div>${S.client ? foot({ next: true }) : foot({ hideNext: true })}`;
    const picker = clientPicker(box.querySelector('[data-client]'), {
      initial: S.client,
      onChange(c) { S.client = c; if (c) { S.pref = c.preferred_pro_id || null; go(1); } else draw(); },
    });
    S.picker = picker;
    wire(() => go(1));
  }

  // ---- passo: serviço ----
  function stepSvc() {
    const cats = [...new Set(state.services.map((s) => s.category_name || 'Outros'))];
    const list = state.services.filter((s) => !S.cat || (s.category_name || 'Outros') === S.cat);
    box.innerHTML = `${head()}
      ${cats.length > 1 ? `<div class="nv-cats"><button type="button" class="${S.cat ? '' : 'on'}" data-cat="">Todos</button>${cats.map((c) => `<button type="button" class="${S.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
      <ul class="nv-list">${list.map((s) => `<li><button type="button" class="nv-card ${S.picked.includes(s.id) ? 'on' : ''}" data-s="${s.id}" aria-pressed="${S.picked.includes(s.id)}">
        <span class="nv-tick">${ic('check', 14)}</span><span class="nv-name">${esc(s.name)}</span><span class="nv-meta">${s.duration_min} min · ${money(s.price_cents)}</span></button></li>`).join('')}</ul>
      <p class="nv-warn" data-warn hidden></p>
      ${foot({ next: S.picked.length, nextLabel: S.picked.length > 1 ? `Continuar (${S.picked.length})` : 'Continuar' })}`;
    box.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { S.cat = b.dataset.cat; draw(); }));
    box.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => {
      const id = +b.dataset.s;
      S.picked = S.picked.includes(id) ? S.picked.filter((x) => x !== id) : [...S.picked, id];
      S.time = opts.time && S.picked.length ? S.time : null;
      draw();
    }));
    wire(() => {
      if (!candidates(S.picked).length) {
        const w = box.querySelector('[data-warn]');
        w.innerHTML = 'Esses serviços são de profissionais diferentes. Marque um de cada vez ou use o <button type="button" data-full2>formulário completo</button>.';
        w.hidden = false;
        w.querySelector('[data-full2]').onclick = () => { close(); newVisit({ ...opts, client: S.client || opts.client, classic: true }); };
        return;
      }
      go(1);
    });
  }

  // ---- passo: profissional ----
  function stepPro() {
    const c = candidates(S.picked);
    box.innerHTML = `${head()}<ul class="nv-list">${c.map((p) => `<li><button type="button" class="nv-card nv-pro ${S.proId === p.id ? 'on' : ''}" data-p="${p.id}">
      ${avatar(p.name, p.photo_url, 'sm')}<span class="nv-name">${esc(p.name)}${S.pref === p.id ? ' <em>preferida</em>' : ''}</span><span class="nv-meta">${esc(p.specialty || '')}</span></button></li>`).join('')}</ul>${foot({ hideNext: true })}`;
    box.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { S.proId = +b.dataset.p; S.time = null; go(1); }));
    wire();
  }

  // ---- passo: dia e horário ----
  async function stepWhen() {
    const days = Array.from({ length: 14 }, (_, i) => addDays(todayStr(), i));
    const custom = !days.includes(S.date);
    box.innerHTML = `${head()}
      <div class="nv-days">${days.map((d) => `<button type="button" class="${S.date === d ? 'on' : ''}" data-d="${d}"><small>${d === todayStr() ? 'Hoje' : weekday(d)}</small><b>${d.slice(8, 10)}</b></button>`).join('')}</div>
      <label class="nv-other ${custom ? 'on' : ''}"><span>${ic('calendar', 16)} Outro dia</span><input type="date" value="${S.date}" min="${todayStr()}" data-date></label>
      <p class="nv-hl">${esc(fmtDayLong(S.date))} · ${esc(first(state.pros.find((p) => p.id === S.proId)?.name))}</p>
      <div class="nv-slots" data-slots><span class="muted small">Buscando horários livres…</span></div>
      ${foot({ next: !!S.time })}`;
    box.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { S.date = b.dataset.d; S.time = null; draw(); }));
    box.querySelector('[data-date]').onchange = (e) => { if (e.target.value) { S.date = e.target.value; S.time = null; draw(); } };
    wire(() => go(1));
    const my = ++seq;
    const r = await GET(`/api/availability?professional_id=${S.proId}&date=${S.date}&duration=${minutes()}`).catch(() => ({ slots: [] }));
    if (my !== seq || step !== 'when') return;
    const slots = [...r.slots];
    if (S.time && !slots.includes(S.time)) slots.push(S.time), slots.sort();
    const el = box.querySelector('[data-slots]');
    el.innerHTML = slots.length
      ? slots.map((t) => `<button type="button" class="${S.time === t ? 'on' : ''}" data-t="${t}">${t}</button>`).join('')
      : '<span class="nv-warn">Sem horário livre neste dia. Escolha outro dia acima.</span>';
    el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { S.time = b.dataset.t; go(1); }));
  }
  let seq = 0;

  // ---- passo: conferir ----
  function stepOk() {
    const pro = state.pros.find((p) => p.id === S.proId);
    box.innerHTML = `${head()}
      <div class="nv-sum">
        <div class="nv-sum-row">${ic('user', 18)}<div><b>${esc(S.client?.name || '')}</b><small>${S.client?.isNew ? 'Nova cliente' : esc(fmtPhone(S.client?.phone) || 'sem telefone')}</small></div></div>
        <div class="nv-sum-row">${ic('calendar', 18)}<div><b>${esc(fmtDayLong(S.date))}</b><small>${S.time} às ${endTime()} · com ${esc(pro?.name || '')}</small></div></div>
        <ul class="nv-sum-svcs">${S.picked.map((id) => { const s = state.services.find((x) => x.id === id); return `<li><span>${esc(s.name)} <small>${s.duration_min} min</small></span><b>${money(priceFor(id, S.proId))}</b></li>`; }).join('')}
          <li class="tot"><span>Previsto</span><b>${money(total())}</b></li></ul></div>
      ${state.user.auto_confirm ? '' : `<label class="vx-sw nv-sw"><input type="checkbox" data-conf ${S.confirmed ? 'checked' : ''}><i></i><span>Cliente já confirmou</span></label>`}
      ${S.noteOpen ? `<label class="nv-note"><span>Observação</span><textarea maxlength="500" data-notes placeholder="Ex.: trazer foto da referência">${esc(S.notes)}</textarea></label>`
        : `<button type="button" class="nv-addnote" data-note>＋ Adicionar observação</button>`}
      ${foot({ next: true, nextLabel: 'Agendar' })}`;
    box.querySelector('[data-conf]')?.addEventListener('change', (e) => { S.confirmed = e.target.checked; });
    box.querySelector('[data-note]')?.addEventListener('click', () => { S.noteOpen = true; draw(); box.querySelector('[data-notes]')?.focus(); });
    box.querySelector('[data-notes]')?.addEventListener('input', (e) => { S.notes = e.target.value; });
    wire(async () => {
      const btn = box.querySelector('[data-next]');
      await submitting(btn, async () => {
        let off = 0;
        const items = S.picked.map((id) => {
          const s = state.services.find((x) => x.id === id);
          const it = { service_id: id, professional_id: S.proId, start_at: addMinutes(`${S.date} ${S.time}`, off) };
          off += s.duration_min;
          return it;
        });
        const payload = { ...S.picker.payload(), items, notes: S.notes, status: S.confirmed ? 'confirmed' : 'scheduled' };
        await withConflict((force) => POST('/api/visits', { ...payload, force }));
        close();
        toast('Agendamento criado');
        opts.onSaved?.();
      }).catch((err) => err?.silent);
    });
  }

  function draw() {
    ({ client: stepClient, svc: stepSvc, pro: stepPro, when: stepWhen, ok: stepOk })[step]();
    box.scrollIntoView?.({ block: 'nearest' });
  }

  modal({
    title: 'Novo agendamento',
    body: '<div class="nv"></div>',
    onMount(el, c) {
      close = c; box = el.querySelector('.nv');
      // quem já vem escolhida (clicou num horário da agenda, ficha da cliente…)
      if (opts.client) S.picker = clientPicker(document.createElement('div'), { initial: opts.client });
      step = flow()[0];
      draw();
    },
  });
}
