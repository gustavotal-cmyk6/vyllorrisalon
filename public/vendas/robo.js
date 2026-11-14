/* Robô da Vyllorri: as falas aparecem uma de cada vez, como numa conversa.
   Cada balão já ocupa o seu espaço desde o início, então a página nunca pula. */
(() => {
  const start = box => {
    if (box.dataset.on) return; box.dataset.on = 1;
    const msgs = [...box.querySelectorAll(".robo-msg")];
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { msgs.forEach(m => m.classList.add("in")); return; }
    box.classList.add("talking");
    let k = 0;
    const next = () => {
      if (k >= msgs.length) return;
      const m = msgs[k];
      m.classList.add("typing");
      setTimeout(() => { m.classList.remove("typing"); m.classList.add("in"); k++; setTimeout(next, 250); }, k === 0 ? 500 : 700);
    };
    next();
  };
  const init = () => {
    const boxes = document.querySelectorAll("[data-robo]:not([data-on])");
    if (!("IntersectionObserver" in window)) { boxes.forEach(start); return; }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { start(e.target); io.unobserve(e.target); } }), { threshold: 0.4 });
    boxes.forEach(b => io.observe(b));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
