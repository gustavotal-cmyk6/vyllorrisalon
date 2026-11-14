// Gestos e movimento (ideias do "Designing Fluid Interfaces" da Apple, em JavaScript puro):
// resposta imediata ao toque, o conteúdo segue o dedo 1:1, a soltura continua na velocidade do dedo (mola),
// resistência nas bordas (rubber-band) e tudo pode ser agarrado de novo no meio do movimento.
// Cada gesto é um complemento: o botão de sempre continua existindo.

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Toque curto de vibração (Android). Só em momentos que importam: confirmar, passar do ponto, fechar. */
export const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch {} };

/** Para onde o movimento iria sozinho (px) com a velocidade de soltura (px/s), como a rolagem do iOS. */
export const project = (v, rate = 0.998) => ((v / 1000) * rate) / (1 - rate);

/** Resistência progressiva além do limite: quanto mais longe, menos o conteúdo acompanha. */
export const rubber = (x, dim, c = 0.55) => (x * dim * c) / (dim + c * Math.abs(x));

/** Mola: sai do valor atual com a velocidade do dedo. damping 1 = sem balanço; ~0.8 = um pouco de balanço (só para arremessos). */
export function spring({ from, to, velocity = 0, response = 0.35, damping = 1, onUpdate, onDone }) {
  if (reduce()) { onUpdate(to); onDone?.(); return () => {}; }
  const k = (2 * Math.PI / response) ** 2, c = (4 * Math.PI * damping) / response;
  let x = from, v = velocity, last = performance.now(), raf = 0, dead = false;
  const step = (t) => {
    if (dead) return;
    const dt = Math.min((t - last) / 1000, 1 / 30);
    last = t;
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (let i = 0; i < n; i++) { v += (-k * (x - to) - c * v) * h; x += v * h; }
    onUpdate(x);
    if (Math.abs(x - to) < 0.4 && Math.abs(v) < 8) { onUpdate(to); onDone?.(); return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => { dead = true; cancelAnimationFrame(raf); };
}

/** Velocidade do dedo (px/s) pelas últimas amostras (100 ms). */
function tracker() {
  const h = [];
  return {
    add(x, t = performance.now()) { h.push([x, t]); while (h.length > 1 && t - h[0][1] > 100) h.shift(); },
    v() { if (h.length < 2) return 0; const [x0, t0] = h[0], [x1, t1] = h[h.length - 1]; return t1 > t0 ? ((x1 - x0) / (t1 - t0)) * 1000 : 0; },
  };
}

/** Folha inferior: arrastar o cabeçalho para baixo fecha; solta no meio e ela volta. */
export function sheetDrag(wrap, sheet, close) {
  const head = sheet.querySelector('header');
  if (!head) return;
  head.style.touchAction = 'none';
  let y = 0, cancel = null, drag = null;
  const isSheet = () => getComputedStyle(wrap).alignItems === 'flex-end'; // no computador o modal fica no centro
  const set = (v) => {
    y = v;
    sheet.style.transform = `translateY(${v}px)`;
    wrap.style.backgroundColor = `rgba(29,5,53,${(0.5 * Math.max(0, 1 - Math.max(0, v) / (sheet.offsetHeight || 1))).toFixed(3)})`;
  };
  head.addEventListener('pointerdown', (e) => {
    if (!isSheet() || e.target.closest('button,a,input,select')) return;
    cancel?.(); // interrompe qualquer movimento em curso e continua de onde está
    sheet.style.animation = 'none';
    head.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, y0: e.clientY, base: y, t: tracker() };
    drag.t.add(e.clientY);
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.t.add(e.clientY);
    const dy = e.clientY - drag.y0 + drag.base;
    set(dy < 0 ? -rubber(-dy, 120) : dy);
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const v = drag.t.v();
    drag = null;
    const h = sheet.offsetHeight;
    if (v > 600 || y + project(v) > h * 0.45) {
      haptic(6);
      cancel = spring({ from: y, to: h + 40, velocity: v, response: 0.3, damping: 0.9, onUpdate: set, onDone: close });
    } else {
      cancel = spring({ from: y, to: 0, velocity: v, response: 0.35, damping: 0.8, onUpdate: set, onDone: () => { sheet.style.transform = ''; wrap.style.backgroundColor = ''; } });
    }
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
}

/**
 * Cartões com ações ao deslizar. Direita = ação positiva (ex.: Confirmar); esquerda = outra (ex.: Receber).
 * actions(el) -> { right?: {label, icon, tone, run}, left?: {...} }. O botão de sempre continua funcionando.
 */
export function swipeCards(root, { selector, actions }) {
  const LIMIT = 88; // quanto precisa arrastar para valer
  let s = null;
  const tone = (t) => (t === 'purple' ? 'linear-gradient(120deg,#7a2fd0,#5b17a6)' : 'linear-gradient(120deg,#1fa36b,#0f7a4f)');

  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest(selector);
    if (!el || !root.contains(el) || document.body.classList.contains('no-scroll')) return;
    if (s?.cancel) s.cancel();
    s = { el, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: 0, mode: 'wait', t: tracker(), acts: null, under: null, side: 0, armed: false };
    s.t.add(0);
  });
  root.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
    if (s.mode === 'wait') {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; // pequena folga antes de decidir a direção
      if (Math.abs(dy) > Math.abs(dx)) { s = null; return; } // era rolagem
      s.mode = 'drag';
      s.acts = actions(s.el) || {};
      s.el.setPointerCapture(e.pointerId);
      s.el.style.transition = 'none';
    }
    s.t.add(dx);
    const act = dx > 0 ? s.acts.right : s.acts.left;
    const side = dx > 0 ? 1 : -1;
    // sem ação para esse lado: só dá uma resistência curta
    s.x = act ? (Math.abs(dx) > LIMIT ? side * (LIMIT + rubber(Math.abs(dx) - LIMIT, 140)) : dx) : side * rubber(Math.abs(dx), 60);
    if (act && side !== s.side) { s.under?.remove(); s.under = underlay(s.el, side, act); s.side = side; s.armed = false; }
    if (!act) { s.under?.remove(); s.under = null; s.side = 0; }
    s.el.style.transform = `translateX(${s.x}px)`;
    if (s.under) {
      const p = Math.min(1, Math.abs(s.x) / LIMIT);
      s.under.style.opacity = String(0.45 + 0.55 * p);
      s.under.firstChild.style.transform = `scale(${0.85 + 0.2 * p})`;
      const armed = Math.abs(s.x) >= LIMIT;
      if (armed !== s.armed) { s.armed = armed; s.under.classList.toggle('armed', armed); if (armed) haptic(8); }
    }
  });
  const end = (e) => {
    if (!s || e.pointerId !== s.id) return;
    const cur = s;
    s = null;
    if (cur.mode !== 'drag') return;
    const v = cur.t.v();
    const act = cur.x > 0 ? cur.acts.right : cur.acts.left;
    const commit = act && (Math.abs(cur.x) >= LIMIT || (Math.abs(cur.x) > 40 && Math.abs(v) > 700 && Math.sign(v) === Math.sign(cur.x)));
    // o clique que vem logo depois de arrastar não deve abrir o cartão
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    root.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => root.removeEventListener('click', stop, { capture: true }), 120);
    if (commit) { haptic(12); try { localStorage.setItem('vb-sw-seen', '1'); } catch {} act.run(); }
    cur.cancel = spring({
      from: cur.x, to: 0, velocity: v, response: 0.38, damping: commit ? 1 : 0.8,
      onUpdate: (x) => { cur.el.style.transform = `translateX(${x}px)`; },
      onDone: () => { cur.el.style.transform = ''; cur.el.style.transition = ''; cur.el.style.background = ''; cur.under?.remove(); },
    });
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);

  function underlay(el, side, act) {
    const p = el.parentElement;
    if (getComputedStyle(p).position === 'static') p.style.position = 'relative';
    const cs = getComputedStyle(el);
    const u = document.createElement('div');
    u.className = `sw-under ${side > 0 ? 'to-right' : 'to-left'}`;
    u.style.cssText = `left:${el.offsetLeft}px;top:${el.offsetTop}px;width:${el.offsetWidth}px;height:${el.offsetHeight}px;border-radius:${cs.borderRadius};background:${tone(act.tone)}`;
    u.innerHTML = `<span>${act.icon}<b>${act.label}</b></span>`;
    p.insertBefore(u, el);
    el.style.position = 'relative';
    el.style.zIndex = '1';
    if (!cs.backgroundColor || cs.backgroundColor === 'rgba(0, 0, 0, 0)') el.style.background = '#fff';
    return u;
  }
}

/** Passar de um período para outro deslizando uma faixa (ex.: dias da semana). */
export function swipeNav(el, { onPrev, onNext }) {
  if (!el) return;
  el.style.touchAction = 'pan-y';
  let s = null;
  el.addEventListener('pointerdown', (e) => { s = { id: e.pointerId, x0: e.clientX, y0: e.clientY, mode: 'wait', t: tracker(), x: 0 }; });
  el.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
    if (s.mode === 'wait') {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dy) > Math.abs(dx)) { s = null; return; }
      s.mode = 'drag';
      el.setPointerCapture(e.pointerId);
    }
    s.t.add(dx);
    s.x = rubber(dx, 160) * 0.8;
    el.style.transform = `translateX(${s.x}px)`;
  });
  const end = (e) => {
    if (!s || e.pointerId !== s.id) return;
    const cur = s;
    s = null;
    if (cur.mode !== 'drag') return;
    const v = cur.t.v();
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    el.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => el.removeEventListener('click', stop, { capture: true }), 120);
    const go = Math.abs(cur.x) > 36 || Math.abs(v) > 600;
    if (go) { haptic(6); (cur.x < 0 || v < -600 ? onNext : onPrev)(); }
    spring({ from: cur.x, to: 0, velocity: v * 0.3, response: 0.35, damping: 0.85, onUpdate: (x) => { el.style.transform = `translateX(${x}px)`; }, onDone: () => { el.style.transform = ''; } });
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/** Puxar para atualizar (só no toque, só no topo da página, só em telas de lista). */
export function pullToRefresh({ enabled, onRefresh }) {
  let y0 = 0, x0 = 0, active = false, locked = false, dy = 0, ind = null, page = null, busy = false, cancel = null;
  const THRESH = 64;
  const apply = (v) => {
    dy = v;
    page.style.transform = v ? `translateY(${v}px)` : '';
    if (ind) {
      const p = Math.min(1, v / THRESH);
      ind.style.opacity = String(p);
      ind.firstChild.style.transform = busy ? '' : `rotate(${v * 4}deg) scale(${0.6 + 0.4 * p})`;
    }
  };
  document.addEventListener('touchstart', (e) => {
    if (busy || e.touches.length !== 1 || !enabled() || window.scrollY > 0 || document.body.classList.contains('no-scroll')) return;
    page = document.getElementById('page');
    if (!page) return;
    cancel?.();
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; active = true; locked = false; dy = 0;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!active) return;
    const t = e.touches[0], ry = t.clientY - y0, rx = t.clientX - x0;
    if (!locked) {
      if (Math.abs(ry) < 10 && Math.abs(rx) < 10) return;
      if (ry <= 0 || Math.abs(rx) > Math.abs(ry) || window.scrollY > 0) { active = false; return; }
      locked = true;
      ind = document.createElement('div');
      ind.className = 'ptr';
      ind.innerHTML = '<span><i class="spin"></i></span>';
      page.style.position = 'relative';
      page.prepend(ind);
    }
    e.preventDefault(); // o conteúdo acompanha o dedo, a página não rola junto
    const v = rubber(ry - 10, 240);
    if ((dy < THRESH) !== (v < THRESH) && v >= THRESH) haptic(8);
    apply(v);
  }, { passive: false });
  const end = async () => {
    if (!active) return;
    active = false;
    if (!locked) return;
    const fire = dy >= THRESH;
    if (fire) {
      busy = true;
      ind.classList.add('busy');
      cancel = spring({ from: dy, to: 54, response: 0.3, onUpdate: apply });
      try { await Promise.all([onRefresh?.(), new Promise((r) => setTimeout(r, 650))]); } catch {}
      busy = false;
    }
    cancel?.();
    spring({ from: dy, to: 0, response: 0.4, onUpdate: apply, onDone: () => { page.style.transform = ''; page.style.position = ''; document.querySelector('.ptr')?.remove(); ind = null; } });
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
}
