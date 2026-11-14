// Carrossel "Veja por dentro" (igual ao site Vyllorri): celulares deslizam de lado,
// o vídeo da tela toca no celular do centro e a legenda troca junto com o vídeo.
const SRC = '/video/beauty-dentro.mp4';
const P = (i) => `/video/beauty-tour-${i}.jpg`;
export const TOUR = [['Início', 0, 6], ['Agendamento', 6, 15.6], ['Sua página', 15.6, 21.8], ['IA no WhatsApp', 26.4, 37.8], ['Agenda', 37.8, 44.2], ['Financeiro', 66, 72.4]]
  .map(([label, from, to], i) => ({ label, from, to, poster: P(i) }));
const CUES = [[0, '', 'Seu dia', 'em uma tela.', 'Próximos atendimentos e quanto entrou.'], [6, '', 'Seus clientes', 'agendam pelo link.', 'Serviço, profissional, dia e horário. 24h.'],
  [15.6, '', 'A página', 'com a sua cara.', 'Logo, capa, cor e frase.'], [21.8, '', 'Um link', 'para divulgar.', 'Na bio do Instagram e no WhatsApp.'],
  [26.4, 'Plano Pro', 'A IA responde', 'e marca sozinha.', 'Vê os horários livres e agenda na hora.'], [37.8, '', 'Tudo na', 'sua agenda.', 'Por dia, semana e profissional.'],
  [44.2, '', 'Avisos', 'no celular.', 'Agendamento, comprovante e cancelamento.'], [53.2, '', 'Menos faltas', 'com sinal por Pix.', 'O comprovante chega no app.'],
  [57.8, '', 'Serviços', 'e preços.', 'Duração e valor do seu jeito.'], [62, '', 'Cada cliente,', 'com histórico.', 'Visitas e quanto já gastou.'], [66, '', 'Quanto entrou,', 'saiu e sobrou.', 'Sem planilha.']];

export const tourHtml = () => `<div class="tour"><div class="vcap" aria-live="polite"></div>
  <div class="tour-ph">${TOUR.map((t, i) => `<div class="vframe ti" data-i="${i}"><img src="${t.poster}" alt="" loading="lazy"></div>`).join('')}
    <div class="vframe tpv"><video muted playsinline preload="metadata" aria-label="Vídeo do Vyllorri Beauty por dentro"></video></div></div>
  <p class="tour-hint"><i>‹</i> Arraste para o lado <i>›</i></p>
  <div class="tour-tabs" role="tablist">${TOUR.map((t, i) => `<button type="button" role="tab" data-t="${i}">${t.label}</button>`).join('')}</div></div>`;

export function mountTour(box) {
  if (!box) return;
  const $$ = (s) => [...box.querySelectorAll(s)];
  const vid = box.querySelector('video'), items = $$('.ti'), tabs = $$('[data-t]'), cap = box.querySelector('.vcap'), n = TOUR.length;
  let cur = 0, ci = -1, auto = true, tm, first = true, started = false;
  const paint = ([, tag, l1, l2, sub]) => {
    cap.innerHTML = (tag ? `<span class="vtag">${tag}</span>` : '') + `<strong>${l1}<br><span>${l2}</span></strong>` + (sub ? `<small>${sub}</small>` : '');
    cap.classList.remove('in'); void cap.offsetWidth; cap.classList.add('in');
  };
  const go = (i) => {
    cur = ((i % n) + n) % n; ci = -1;
    items.forEach((el, j) => {
      let o = ((j - cur + n * 1.5) % n) - n / 2; o = Math.max(-2, Math.min(2, o));
      el.style.setProperty('--o', o); el.style.setProperty('--a', Math.abs(o)); el.classList.toggle('far', Math.abs(o) > 1);
    });
    tabs.forEach((b, j) => { b.classList.toggle('on', j === cur); b.setAttribute('aria-selected', j === cur); });
    const t = TOUR[cur];
    clearTimeout(tm); vid.pause(); vid.classList.remove('on'); vid.poster = t.poster;
    paint(CUES.reduce((a, c) => (t.from + 0.01 >= c[0] ? c : a), CUES[0]));
    if (!started) return;
    const seek = () => { vid.currentTime = t.from; };
    if (!vid.src.endsWith(SRC)) { vid.src = SRC; vid.addEventListener('loadedmetadata', seek, { once: true }); } else seek();
    tm = setTimeout(() => { vid.classList.add('on'); vid.play().catch(() => {}); }, first ? 150 : 1000);
    first = false;
  };
  vid.addEventListener('timeupdate', () => {
    if (!vid.classList.contains('on')) return;
    const t = TOUR[cur], s = vid.currentTime;
    if (s >= t.to) { if (auto) go(cur + 1); else vid.currentTime = t.from; return; }
    if (s < t.from - 0.5) return;
    let k = 0; CUES.forEach((c, j) => { if (s >= c[0]) k = j; });
    if (k !== ci) { ci = k; paint(CUES[k]); }
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'), it = e.target.closest('.ti');
    if (b) { auto = false; box.classList.add('dragged'); go(+b.dataset.t); } else if (it && !it.classList.contains('far')) { auto = false; go(+it.dataset.i); }
  });
  const ph = box.querySelector('.tour-ph'); let x0 = null, moved = false;
  ph.addEventListener('pointerdown', (e) => { x0 = e.clientX; moved = false; });
  ph.addEventListener('pointermove', (e) => { if (x0 !== null && Math.abs(e.clientX - x0) > 12) { moved = true; box.classList.add('dragged'); } });
  ph.addEventListener('pointerup', (e) => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) { auto = false; go(cur + (dx < 0 ? 1 : -1)); } });
  ph.addEventListener('pointercancel', () => { x0 = null; });
  ph.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); moved = false; } }, true);
  go(0);
  // só baixa e toca o vídeo quando a seção aparece na tela
  const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); started = true; go(cur); } }, { rootMargin: '200px' });
  io.observe(box);
}
