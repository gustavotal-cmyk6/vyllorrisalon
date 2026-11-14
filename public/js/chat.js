// Conversa guiada (roteirizada, sem IA): o Vyllo faz uma pergunta por vez e a pessoa responde digitando ou tocando.
// Cada resposta vira um balão com "editar": ao editar, a conversa volta naquele ponto e segue de novo.
import { esc } from './core.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const FACE = '/vendas/vyllo-rosto.png';
const face = (hidden) => (hidden ? '<span class="vx-face-gap"></span>' : `<img class="vx-face" src="${FACE}" alt="" width="32" height="32">`);

/**
 * steps: [{ id, say(a) -> string[], skip?(a), final?, input(ctx) -> HTMLElement }]
 * ctx = { a, submit(textoDoBalão, patch), goTo(id) }
 * O campo de resposta fica num "espaço reservado" que nunca encolhe: assim a página não pula no celular quando o campo troca.
 */
export function chatFlow(root, steps, initial = {}) {
  let a = { ...initial }, idx = -1, typing = false, token = 0, answered = 0;
  const log = []; // { k:'v'|'u', text, step }
  root.innerHTML = `<div class="vx-chat" aria-live="polite">
    <div class="vx-prog" hidden><span class="vx-prog-t"></span><i><b></b></i></div>
    <div class="vx-log"></div>
    <div class="vx-slot"></div></div>`;
  const $ = (s) => root.querySelector(s);
  const logEl = $('.vx-log'), slot = $('.vx-slot'), prog = $('.vx-prog');
  let slotMin = 0;

  const total = () => steps.filter((s) => !s.final && !s.skip?.(a)).length;
  const draw = () => {
    logEl.innerHTML = log.map((m, i) => m.k === 'v'
      ? `<div class="vx-row">${face(log[i - 1]?.k === 'v')}<div class="vx-bub v">${m.text}</div></div>`
      : `<div class="vx-row me"><div class="vx-bub u">${esc(m.text)}</div>${idx >= 0 && !typing ? `<button type="button" class="vx-edit" data-edit="${m.step}">editar</button>` : ''}</div>`).join('')
      + (typing ? `<div class="vx-row">${face(log[log.length - 1]?.k === 'v')}<div class="vx-bub v vx-typing"><i></i><i></i><i></i></div></div>` : '');
    const t = total(), done = Math.min(t, answered), left = t - done;
    prog.hidden = !(log.length && t > 1);
    prog.querySelector('.vx-prog-t').textContent = left === 0 ? 'Tudo respondido!' : left === 1 ? 'Falta 1 pergunta' : `Faltam ${left} perguntas`;
    prog.querySelector('b').style.width = `${(done / t) * 100}%`;
    logEl.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => editAt(+b.dataset.edit)));
  };
  // só desce (nunca sobe) até o fim da conversa
  const down = () => {
    const r = slot.getBoundingClientRect();
    if (r.bottom > innerHeight - 8) window.scrollBy({ top: r.bottom - innerHeight + 24, behavior: 'smooth' });
  };
  const showInput = (el) => {
    slot.replaceChildren(el);
    slotMin = Math.max(slotMin, slot.offsetHeight);
    slot.style.minHeight = slotMin + 'px';
    const f = el.querySelector('input,textarea');
    if (f) try { f.focus({ preventScroll: true }); } catch { f.focus(); }
    down();
  };

  async function go(from) {
    const my = ++token;
    let i = from;
    while (i < steps.length && steps[i].skip?.(a)) i++;
    if (i >= steps.length) return;
    idx = -1; slot.replaceChildren(); // o espaço continua reservado (minHeight)
    for (const text of steps[i].say(a)) {
      typing = true; draw(); down();
      await wait(350 + Math.min(text.length * 9, 700));
      if (token !== my) return;
      typing = false;
      log.push({ k: 'v', text, step: i });
      draw(); down();
      await wait(120);
      if (token !== my) return;
    }
    idx = i; draw();
    showInput(steps[i].input(ctx()));
  }
  const submit = (text, patch) => {
    slotMin = Math.max(slotMin, slot.offsetHeight); slot.style.minHeight = slotMin + 'px';
    a = { ...a, ...patch };
    log.push({ k: 'u', text, step: idx });
    answered = Math.min(total(), answered + 1);
    const from = idx + 1;
    draw();
    go(from);
  };
  const editAt = (s) => {
    for (let n = log.length - 1; n >= 0; n--) if (log[n].step >= s) log.pop();
    answered = log.filter((x) => x.k === 'u').length;
    go(s);
  };
  const goTo = (id) => { const s = steps.findIndex((x) => x.id === id); if (s >= 0) editAt(s); };
  const ctx = () => ({ a, submit, goTo });
  go(0);
  return { goTo };
}

/** Resposta digitada: campo + botão de enviar. `secret` ganha "Mostrar". */
export function textAnswer({ placeholder, type = 'text', value = '', validate, onSend, secret, autocomplete, inputmode, ic, skipLabel, onSkip }) {
  const f = document.createElement('form');
  f.className = 'vx-ans'; f.noValidate = true;
  f.innerHTML = `<div class="vx-ans-row"><div class="vx-ans-in"><input value="${esc(value)}" type="${secret ? 'password' : type}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"
      ${autocomplete ? `autocomplete="${autocomplete}"` : ''} ${inputmode ? `inputmode="${inputmode}"` : ''} ${type === 'email' || secret ? 'autocapitalize="none"' : ''} spellcheck="false">
      ${secret ? '<button type="button" class="vx-show" aria-pressed="false">Mostrar</button>' : ''}</div>
    <button type="submit" class="vx-send" aria-label="Enviar">${ic('arrowRight', 22)}</button></div><p class="vx-err" role="alert" hidden></p>
    ${skipLabel ? `<button type="button" class="vx-skip">${esc(skipLabel)}</button>` : ''}`;
  f.querySelector('.vx-skip')?.addEventListener('click', () => onSkip?.());
  const input = f.querySelector('input'), err = f.querySelector('.vx-err');
  f.querySelector('.vx-show')?.addEventListener('click', (e) => {
    const on = input.type === 'password';
    input.type = on ? 'text' : 'password';
    e.currentTarget.textContent = on ? 'Esconder' : 'Mostrar';
    e.currentTarget.setAttribute('aria-pressed', String(on));
  });
  input.addEventListener('input', () => { err.hidden = true; });
  f.onsubmit = (e) => {
    e.preventDefault();
    const v = secret ? input.value : input.value.trim();
    const bad = validate?.(v) ?? null;
    if (bad) { err.textContent = bad; err.hidden = false; return; }
    onSend(v);
  };
  return f;
}

/** Respostas em botões grandes: [{ label, sub?, onPick }] */
export function choiceAnswer(options) {
  const d = document.createElement('div');
  d.className = 'vx-choice';
  d.innerHTML = options.map((o, i) => `<button type="button" data-i="${i}"><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('');
  d.querySelectorAll('button').forEach((b) => (b.onclick = () => options[+b.dataset.i].onPick()));
  return d;
}
