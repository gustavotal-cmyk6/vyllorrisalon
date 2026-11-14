// Primeiro acesso em conversa: o Vyllo pergunta o que a pessoa faz, monta serviços, equipe e horários e liga a página de agendamento.
// Mesma ideia do Vyllorri Barber, com perguntas e falas de salão e beleza (unhas, cabelo, cílios, sobrancelhas, maquiagem, estética).
import { state, GET, POST, PUT, esc, ic, toast } from './core.js';
import { chatFlow, textAnswer, choiceAnswer } from './chat.js';
import { shell } from './auth.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const first = (n) => String(n).trim().split(/\s+/)[0];

// O que a pessoa faz → serviços sugeridos (nome, preço de exemplo, minutos). Os preços são só ponto de partida.
const RAMOS = [
  { k: 'unhas', label: 'Unhas', cat: 'Unhas', svcs: [['Manicure', 35, 45], ['Pedicure', 40, 50], ['Esmaltação em gel', 70, 60], ['Alongamento em gel', 160, 120]] },
  { k: 'cabelo', label: 'Cabelo', cat: 'Cabelo', svcs: [['Corte feminino', 90, 60], ['Escova', 60, 45], ['Hidratação', 70, 45], ['Coloração', 180, 120]] },
  { k: 'sobrancelhas', label: 'Sobrancelhas', cat: 'Sobrancelhas', svcs: [['Design de sobrancelha', 45, 30], ['Design com henna', 50, 40]] },
  { k: 'cilios', label: 'Cílios', cat: 'Cílios', svcs: [['Extensão fio a fio', 150, 110], ['Volume brasileiro', 180, 120], ['Manutenção de cílios', 100, 80], ['Lash lifting', 120, 60]] },
  { k: 'maquiagem', label: 'Maquiagem', cat: 'Maquiagem', svcs: [['Maquiagem social', 180, 60], ['Maquiagem de noiva', 450, 120], ['Penteado', 150, 60]] },
  { k: 'estetica', label: 'Estética', cat: 'Estética', svcs: [['Limpeza de pele', 120, 60], ['Massagem relaxante', 110, 60], ['Depilação', 60, 30]] },
];
const buildSvcs = (ks) => RAMOS.filter((r) => ks.includes(r.k)).flatMap((r) => r.svcs.map(([name, price, min]) => ({ on: true, name, price: String(price), min, cat: r.cat })));
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // semana começando na segunda
const TIMES = Array.from({ length: 33 }, (_, i) => { const m = 360 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`; });
const MINS = [10, 15, 20, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180];
const cents = (v) => Math.round(Number(String(v).replace(',', '.')) * 100) || 0;
const opts = (list, sel, f = (x) => x) => list.map((x) => `<option value="${x}" ${String(x) === String(sel) ? 'selected' : ''}>${f(x)}</option>`).join('');
const COLORS = ['#b4548c', '#7a5bd9', '#e2508c', '#0f9d8a', '#c8963e', '#3b82f6'];

// "Seg a Sáb: 9h às 19h" (texto da página pública)
const hh = (t) => { const [h, m] = t.split(':'); return `${+h}h${m === '00' ? '' : m}`; };
function openingText(h) {
  const on = ORDER.filter((d) => h.days[d]), groups = [];
  for (const d of on) {
    const g = groups[groups.length - 1];
    if (g && ORDER.indexOf(d) === ORDER.indexOf(g[g.length - 1]) + 1) g.push(d); else groups.push([d]);
  }
  return `${groups.map((g) => (g.length > 1 ? `${DAYS[g[0]]} a ${DAYS[g[g.length - 1]]}` : DAYS[g[0]])).join(', ')}: ${hh(h.open)} às ${hh(h.close)}`;
}
const hoursSummary = (h) => `${openingText(h)}${h.lunch ? ` · almoço ${h.ls}–${h.le}` : ''}`;

// ---------------- respostas especiais ----------------
function ramosAnswer(value, onDone) {
  const sel = new Set(value);
  const d = el(`<div class="vx-multi"><div class="vx-chips">${RAMOS.map((r) => `<button type="button" class="vx-chip" data-k="${r.k}" aria-pressed="${sel.has(r.k)}">${ic('check', 16)} ${r.label}</button>`).join('')}</div>
    <p class="vx-err" role="alert" hidden>Escolha pelo menos uma opção.</p><button type="button" class="btn primary block vx-go">Continuar ${ic('arrowRight', 18)}</button></div>`);
  d.querySelectorAll('.vx-chip').forEach((b) => (b.onclick = () => {
    const k = b.dataset.k; sel.has(k) ? sel.delete(k) : sel.add(k);
    b.setAttribute('aria-pressed', String(sel.has(k))); d.querySelector('.vx-err').hidden = true;
  }));
  d.querySelector('.vx-go').onclick = () => {
    if (!sel.size) return (d.querySelector('.vx-err').hidden = false);
    onDone(RAMOS.map((r) => r.k).filter((k) => sel.has(k)));
  };
  return d;
}

/** Serviços: toque para marcar, ✎ para editar nome, preço e duração, ✕ para remover e “＋ Adicionar serviço” para criar outro. */
function servicesAnswer(value, onDone) {
  let list = value.map((s) => ({ ...s })), editing = null, err = '';
  const d = el('<div class="vx-svcs"></div>');
  const draw = () => {
    d.innerHTML = `<ul>${list.map((s, i) => `<li class="${s.on ? 'on' : ''}">
        <div class="vx-svc-row"><button type="button" class="vx-svc-main" data-t="${i}" aria-pressed="${s.on}"><span class="vx-tick">${ic('check', 14)}</span>
          <span class="vx-svc-name">${esc(s.name) || 'Novo serviço'}</span><span class="vx-svc-meta">${s.price ? `R$ ${esc(s.price)}` : 'sem preço'} · ${s.min} min</span></button>
          <button type="button" class="vx-svc-edit ${editing === i ? 'on' : ''}" data-e="${i}" aria-label="Editar ${esc(s.name) || 'serviço'}">${ic('edit', 16)}</button></div>
        ${editing === i ? `<div class="vx-svc-form"><input data-f="name" value="${esc(s.name)}" placeholder="Nome do serviço (ex.: Design de sobrancelha)" maxlength="80" aria-label="Nome do serviço">
          <div class="vx-svc-two"><select data-f="min" aria-label="Duração">${opts(MINS, s.min, (m) => `${m} min`)}</select><span>R$</span><input data-f="price" value="${esc(s.price)}" inputmode="decimal" placeholder="0" aria-label="Preço"></div>
          <div class="vx-svc-btns"><button type="button" class="rm" data-r="${i}">Remover</button><button type="button" class="ok" data-ok>Feito</button></div></div>` : ''}</li>`).join('')}</ul>
      ${list.length < 12 ? `<button type="button" class="vx-add" data-add>＋ Adicionar serviço</button>` : ''}
      <p class="vx-err" role="alert" ${err ? '' : 'hidden'}>${esc(err)}</p>
      <button type="button" class="btn primary block vx-go" data-done>Pronto ${ic('arrowRight', 18)}</button>`;
    d.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { list[+b.dataset.t].on = !list[+b.dataset.t].on; err = ''; draw(); }));
    d.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => { editing = editing === +b.dataset.e ? null : +b.dataset.e; draw(); }));
    d.querySelectorAll('[data-f]').forEach((f) => (f.oninput = () => {
      const s = list[editing]; s[f.dataset.f] = f.dataset.f === 'min' ? +f.value : f.dataset.f === 'price' ? f.value.replace(/[^\d,.]/g, '') : f.value;
      if (f.dataset.f === 'price' && f.value !== s.price) f.value = s.price;
      const row = d.querySelectorAll('li')[editing];
      row.querySelector('.vx-svc-name').textContent = s.name || 'Novo serviço';
      row.querySelector('.vx-svc-meta').textContent = `${s.price ? `R$ ${s.price}` : 'sem preço'} · ${s.min} min`;
    }));
    d.querySelector('[data-ok]')?.addEventListener('click', () => { editing = null; draw(); });
    d.querySelector('[data-r]')?.addEventListener('click', (e) => { list.splice(+e.currentTarget.dataset.r, 1); editing = null; draw(); });
    d.querySelector('[data-add]')?.addEventListener('click', () => { list.push({ on: true, name: '', price: '', min: 45, cat: null }); editing = list.length - 1; err = ''; draw(); d.querySelector('[data-f=name]')?.focus(); });
    d.querySelector('[data-done]').onclick = () => {
      const ok = list.filter((s) => s.on && s.name.trim());
      if (!ok.length) { err = 'Toque em pelo menos um serviço, ou adicione o seu.'; return draw(); }
      onDone(list.filter((s) => s.name.trim()));
    };
  };
  draw();
  return d;
}

/** Nomes das profissionais da equipe (um por vez). */
function namesAnswer({ value, required, onDone }) {
  const names = [...value];
  const d = el('<div class="vx-names"></div>');
  const draw = () => {
    d.innerHTML = `${names.length ? `<ul>${names.map((n, i) => `<li><span>${esc(n)}</span><button type="button" data-x="${i}" aria-label="Remover ${esc(n)}">${ic('x', 16)}</button></li>`).join('')}</ul>` : ''}
      <form class="vx-ans-row"><div class="vx-ans-in"><input placeholder="Nome da profissional" maxlength="60" aria-label="Nome da profissional" autocomplete="off"></div><button type="submit" class="vx-send" aria-label="Adicionar">${ic('plus', 22)}</button></form>
      <p class="vx-err" role="alert" hidden></p>
      <button type="button" class="btn primary block vx-go" data-done>${names.length ? 'Continuar' : required ? 'Continuar' : 'Pular por agora'} ${ic('arrowRight', 18)}</button>`;
    d.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => { names.splice(+b.dataset.x, 1); draw(); }));
    const f = d.querySelector('form'), input = f.querySelector('input'), err = d.querySelector('.vx-err');
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (v.length < 2) { err.textContent = 'Escreva o nome da profissional.'; err.hidden = false; return; }
      if (names.length >= 15) { err.textContent = 'Já são muitas! Cadastre as outras depois, na tela Equipe.'; err.hidden = false; return; }
      names.push(v); draw(); d.querySelector('input').focus();
    };
    d.querySelector('[data-done]').onclick = () => {
      const v = input.value.trim();
      if (v.length >= 2) names.push(v); // o que está digitado também conta
      if (required && !names.length) { err.textContent = 'Escreva pelo menos um nome para continuar.'; err.hidden = false; return; }
      onDone(names);
    };
  };
  draw();
  return d;
}

/** Dias e horário: já vem Seg–Sáb das 9h às 19h, com almoço. Liga/desliga cada dia e ajusta o horário. */
function hoursAnswer(value, onDone) {
  const h = { ...value, days: [...value.days] };
  const d = el('<div class="vx-hours"></div>');
  const draw = () => {
    const bad = h.open >= h.close || (h.lunch && !(h.ls < h.le && h.ls > h.open && h.le < h.close));
    d.innerHTML = `<p class="vx-hl">Dias que você atende</p>
      <div class="vx-chips vx-days">${ORDER.map((i) => `<button type="button" class="vx-chip" data-d="${i}" aria-pressed="${h.days[i]}">${DAYS[i]}</button>`).join('')}</div>
      <p class="vx-hl">Horário</p>
      <div class="vx-time"><select data-k="open" aria-label="Abre às">${opts(TIMES, h.open)}</select><span>até</span><select data-k="close" aria-label="Fecha às">${opts(TIMES, h.close)}</select></div>
      <label class="vx-sw"><input type="checkbox" data-k="lunch" ${h.lunch ? 'checked' : ''}><i></i><span>Faço intervalo de almoço</span></label>
      ${h.lunch ? `<div class="vx-time"><select data-k="ls" aria-label="Almoço começa">${opts(TIMES, h.ls)}</select><span>até</span><select data-k="le" aria-label="Almoço termina">${opts(TIMES, h.le)}</select></div>` : ''}
      ${!h.days.some(Boolean) ? '<p class="vx-err" role="alert">Ligue pelo menos um dia.</p>' : bad ? '<p class="vx-err" role="alert">Confira os horários: o fim precisa ser depois do começo, e o almoço fica no meio do expediente.</p>' : ''}
      <button type="button" class="btn primary block vx-go" ${!h.days.some(Boolean) || bad ? 'disabled' : ''}>Pronto ${ic('arrowRight', 18)}</button>`;
    d.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { h.days[+b.dataset.d] = !h.days[+b.dataset.d]; draw(); }));
    d.querySelectorAll('select[data-k]').forEach((s) => (s.onchange = () => { h[s.dataset.k] = s.value; draw(); }));
    d.querySelector('input[data-k=lunch]').onchange = (e) => { h.lunch = e.target.checked; draw(); };
    d.querySelector('.vx-go').onclick = () => onDone(h);
  };
  draw();
  return d;
}

// ---------------- criar tudo de uma vez ----------------
async function ensureCategory(name, cats) {
  if (!name) return null;
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const f = cats.find((c) => norm(c.name) === norm(name));
  if (f) return f.id;
  const r = await POST('/api/categories', { name });
  cats.push({ id: r.id, name });
  return r.id;
}
/** Cria equipe, serviços, perfil e liga a página. Se der erro no meio, ao tentar de novo continua de onde parou (sem duplicar). */
async function createAll(a, progress) {
  const h = a.hours, work_days = ORDER.filter((d) => h.days[d]).sort().join(',');
  const hours = { work_days, start_time: h.open, end_time: h.close, break_start: h.lunch ? h.ls : '', break_end: h.lunch ? h.le : '' };
  const done = (progress.done ||= { pros: null, svcs: new Set(), profile: false });
  if (!done.pros) {
    const solo = state.user.team_mode === 'solo';
    const ids = [];
    const mk = (name, specialty, i) => ({ name, specialty, color: COLORS[i % COLORS.length], commission_type: 'pct', commission_value: 0, product_commission_pct: 0, ...hours });
    if (solo) {
      const mine = (await GET('/api/professionals')).find((p) => p.id === state.user.professional_id) || {};
      await PUT(`/api/professionals/${state.user.professional_id}`, { ...mk(a.name, mine.specialty || 'Proprietária', 0), color: mine.color || COLORS[0], active: 1 });
      ids.push(state.user.professional_id);
    } else {
      let n = 0;
      if (a.iWork) ids.push((await POST('/api/professionals', mk(a.name, 'Proprietária', n++))).id);
      for (const nm of a.others) ids.push((await POST('/api/professionals', mk(nm, '', n++))).id);
    }
    done.pros = ids;
  }
  const cats = await GET('/api/categories');
  for (const [i, s] of a.svcs.filter((x) => x.on && x.name.trim()).entries()) {
    if (done.svcs.has(i)) continue;
    await POST('/api/services', { name: s.name.trim(), category_id: await ensureCategory(s.cat, cats), price_cents: cents(s.price), duration_min: s.min, online: 1, pros: done.pros.map((id) => ({ professional_id: id })) });
    done.svcs.add(i);
  }
  const p = await GET('/api/salon');
  if (!done.profile) {
    await PUT('/api/salon/profile', { name: p.name, headline: p.headline, page_color: p.page_color, description: p.description, address: p.address, cancel_hours: p.cancel_hours,
      logo: p.logo, cover_photo: p.cover_photo, gallery: p.gallery, phone: a.whatsapp || p.phone || '', instagram: a.insta || p.instagram || '', opening_hours: openingText(h) });
    await PUT('/api/salon/booking', { enabled: true, slug: p.slug });
    done.profile = true;
  }
  return p.slug;
}

// ---------------- tela ----------------
export function setup({ boot }) {
  const solo = state.user.team_mode === 'solo';
  shell('<h1 class="sr">Montar a minha agenda</h1><div class="vx-chatbox"></div><p class="vx-or"><a href="#/config" data-skip>Prefiro a configuração completa</a> · <a href="#/" data-later>Fazer depois</a></p>');
  document.querySelector('[data-later]').onclick = () => { try { sessionStorage.removeItem('vy_new'); } catch {} };
  document.querySelector('[data-skip]').onclick = () => { try { sessionStorage.removeItem('vy_new'); } catch {} };
  const progress = {};
  const steps = [
    {
      id: 'ramo',
      say: (a) => [`Conta criada, ${esc(first(a.name))}! 🎉 Agora eu monto a sua agenda com você. São poucas perguntas, e quase tudo já vem pronto.`, 'Primeira: o que você faz? Pode marcar mais de uma coisa.'],
      input: ({ a, submit }) => ramosAnswer(a.ramos, (ks) => {
        const same = ks.join() === a.ramos.join() && a.svcs.length;
        submit(ks.map((k) => RAMOS.find((r) => r.k === k).label).join(', '), { ramos: ks, svcs: same ? a.svcs : buildSvcs(ks) });
      }),
    },
    {
      id: 'svc',
      say: () => ['Que lindo! Separei os serviços mais comuns de cada área para você.', 'Os preços são só exemplo: toque no lápis ✎ para colocar os seus. Desmarque o que você não faz e adicione o que estiver faltando.'],
      input: ({ a, submit }) => servicesAnswer(a.svcs, (v) => {
        const on = v.filter((s) => s.on);
        submit(on.length > 3 ? `${on.slice(0, 3).map((s) => s.name).join(', ')} e mais ${on.length - 3}` : on.map((s) => s.name).join(', '), { svcs: v });
      }),
    },
    {
      id: 'who', skip: () => solo,
      say: () => ['Boa! Agora a equipe. Você também atende clientes?'],
      input: ({ submit }) => choiceAnswer([
        { label: 'Sim, eu também atendo', onPick: () => submit('Sim, eu também atendo', { iWork: true }) },
        { label: 'Não, só cuido do salão', onPick: () => submit('Não, só cuido do salão', { iWork: false }) },
      ]),
    },
    {
      id: 'me', skip: (a) => !a.iWork,
      say: () => [solo ? 'Falta pouco! Como as clientes vão te ver na página de agendamento? Escreva o seu nome.' : 'Como as clientes vão te ver na página de agendamento? Escreva o seu nome.'],
      input: ({ a, submit }) => textAnswer({ ic, placeholder: 'Seu nome', value: a.name, autocomplete: 'name',
        validate: (v) => (v.length < 2 ? 'Escreva o seu nome para continuar.' : null), onSend: (v) => submit(v, { name: v }) }),
    },
    {
      id: 'team', skip: () => solo,
      say: (a) => [a.iWork ? 'E quem mais atende com você? Escreva o nome de cada profissional. Se quiser, pode pular e cadastrar depois.' : 'Então me diga quem atende no salão. Escreva o nome de cada profissional.'],
      input: ({ a, submit }) => namesAnswer({ value: a.others, required: !a.iWork,
        onDone: (v) => submit(v.length ? v.join(', ') : 'Pular por agora', { others: v }) }),
    },
    {
      id: 'hours',
      say: () => ['Já passamos da metade! Quando você atende?', `Já deixei de segunda a sábado, das 9h às 19h, com almoço.${solo ? '' : ' Vale para toda a equipe; depois cada profissional pode ter o seu horário na tela Equipe.'} Ajuste do seu jeito.`],
      input: ({ a, submit }) => hoursAnswer(a.hours, (h) => submit(hoursSummary(h), { hours: h })),
    },
    {
      id: 'insta',
      say: () => ['Quase lá! Qual é o seu Instagram? Ele aparece na sua página de agendamento. É opcional.'],
      input: ({ a, submit }) => textAnswer({ ic, placeholder: '@seuperfil', value: a.insta, autocomplete: 'off',
        validate: (v) => (v && !/^@?[A-Za-z0-9._]{2,30}$/.test(v) ? 'Escreva só o seu @, sem espaços.' : null),
        onSend: (v) => submit(v || 'Pular', { insta: v.replace(/^@/, '') }), skipLabel: 'Pular', onSkip: () => submit('Pular', { insta: '' }) }),
    },
    {
      id: 'wa',
      say: () => ['Última pergunta, e é opcional! Qual é o WhatsApp do seu negócio, com DDD? As clientes podem chamar você por ali.'],
      input: ({ a, submit }) => textAnswer({ ic, placeholder: '(11) 91234-5678', type: 'tel', inputmode: 'tel', value: a.whatsapp, autocomplete: 'tel',
        validate: (v) => (v && v.replace(/\D/g, '').length < 10 ? 'Coloque o DDD e o número.' : null),
        onSend: (v) => submit(v || 'Pular', { whatsapp: v }), skipLabel: 'Pular', onSkip: () => submit('Pular', { whatsapp: '' }) }),
    },
    {
      id: 'go', final: true,
      say: () => ['Terminamos! 🎉 Toque no botão e eu deixo a sua agenda pronta, já com a página de agendamento no ar para as clientes marcarem.'],
      input: ({ a }) => {
        const f = el(`<form class="vx-final"><div class="vx-alert" role="alert" hidden></div><button class="btn primary block vx-go" type="submit">Criar minha agenda ${ic('arrowRight', 18)}</button></form>`);
        f.onsubmit = async (e) => {
          e.preventDefault();
          const btn = f.querySelector('.vx-go'), box = f.querySelector('.vx-alert');
          btn.disabled = true; btn.textContent = 'Montando a sua agenda…'; box.hidden = true;
          try {
            const slug = await createAll(a, progress);
            try { sessionStorage.removeItem('vy_new'); } catch {}
            finish(a, slug, boot);
          } catch (err) {
            box.textContent = `${err?.message || 'Algo deu errado.'} Toque no botão para tentar de novo; o que já foi criado não se repete.`; box.hidden = false;
            btn.disabled = false; btn.innerHTML = `Tentar de novo ${ic('arrowRight', 18)}`;
          }
        };
        return f;
      },
    },
  ];
  chatFlow(document.querySelector('.vx-chatbox'), steps, {
    ramos: [], svcs: [], iWork: true, name: state.user.name, others: [], insta: '', whatsapp: '',
    hours: { days: [false, true, true, true, true, true, true], open: '09:00', close: '19:00', lunch: true, ls: '12:00', le: '13:00' },
  });
}

// ---------------- tela final: link e onde deixar com a sua cara ----------------
function finish(a, slug, boot) {
  const link = `${location.origin}/agendar/${slug}`;
  const box = document.querySelector('.vx-chatbox');
  document.querySelector('.vx-or')?.remove();
  window.scrollTo(0, 0);
  box.innerHTML = `<div class="vx-done">
    <div class="vx-vyllo"><img src="/vendas/vyllo.webp" alt="" width="60" height="124"><div><span class="vx-tag"><i></i>Vyllo · seu ajudante</span>
      <div class="vx-bub v">Prontinho! 🎉 A sua agenda está no ar. É só mandar este link para as suas clientes.</div></div></div>
    <div class="vx-card vx-link"><small>O link de agendamento do seu negócio</small><b>${esc(link.replace(/^https?:\/\//, ''))}</b>
      <div class="vx-link-btns"><button type="button" class="btn primary" data-copy>${ic('copy', 16)} Copiar link</button>
      <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Agende seu horário online: ' + link)}">${ic('whatsapp', 16)} Enviar no WhatsApp</a></div>
      <p>Coloque também na bio do Instagram.</p></div>
    <h2 class="vx-h2">Agora deixe com a sua cara</h2>
    <ul class="vx-todo">${[
      ['image', 'Logo, foto de capa e cor', 'Em Configurações → Salão. É o que as clientes veem primeiro.'],
      ['zap', 'Sinal por Pix', 'Em Configurações → Sinal online. Menos faltas, com o comprovante no app.'],
      ['home', 'Atende na casa da cliente?', 'Em Configurações → Domicílio, com taxa por bairro.'],
      ['bell', 'Avisos no celular', 'No Início, toque em “Ativar” para saber na hora de cada agendamento.'],
    ].map(([i, t, d]) => `<li><span>${ic(i, 20)}</span><div><b>${t}</b><small>${d}</small></div></li>`).join('')}</ul>
    <button type="button" class="btn primary block vx-go" data-panel>Ir para o meu painel ${ic('arrowRight', 18)}</button>
    <button type="button" class="vx-skip" data-tut>${ic('play', 16)} Ver o tutorial de 2 minutos</button>
    <p class="vx-bye">Eu fico por aqui. Obrigado! Qualquer coisa, é só chamar em <a href="#/ajuda">Ajuda</a>.</p></div>`;
  box.querySelector('[data-copy]').onclick = async () => {
    try { await navigator.clipboard.writeText(link); } catch { const t = document.createElement('textarea'); t.value = link; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
    toast('Link copiado!');
  };
  const leave = async (tut) => { location.hash = '#/'; await boot(); if (tut) import('./tutorial.js').then((m) => m.openTutorial()); }; // hash antes: o boot recarrega a equipe e os serviços já na tela certa
  box.querySelector('[data-panel]').onclick = () => leave(false);
  box.querySelector('[data-tut]').onclick = () => leave(true);
}
