/* Guia do Vyllo: passo a passo opcional (nome → explicação → vídeo → plano).
   O nome fica só neste navegador (sessionStorage) e não é enviado a lugar nenhum. */
(() => {
  const SIGNUP = null;
  const base = "/#/criar";
  const store = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} } };
  if (store.get("vy-guia-salao") === "fechado") return;
  const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let nome = "";

  const el = document.createElement("div");
  el.className = "guia";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Guia do Vyllo");
  el.innerHTML = `<div class="guia__in">
    <div class="guia__top"><span class="guia__dots"><i></i><i></i><i></i><i></i><i></i><i></i></span><button type="button" class="guia__skip">Pular</button></div>
    <div class="guia__body">
      <img class="guia__robo" src="vyllo.webp" alt="Vyllo, o seu ajudante" width="200" height="414">
      <div class="guia__chat"><span class="robo-name"><i></i>Vyllo · seu ajudante</span><div class="guia__msgs" aria-live="polite"></div></div>
    </div>
    <div class="guia__acts"></div>
  </div>`;
  document.body.appendChild(el);
  document.body.classList.add("guia-on");
  const msgs = el.querySelector(".guia__msgs"), acts = el.querySelector(".guia__acts"), dots = [...el.querySelectorAll(".guia__dots i")];

  const fechar = () => { store.set("vy-guia-salao", "fechado"); el.classList.add("out"); document.body.classList.remove("guia-on"); setTimeout(() => el.remove(), 350); window.scrollTo(0, 0); };
  el.querySelector(".guia__skip").addEventListener("click", fechar);

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const fala = async (lines) => {
    msgs.innerHTML = ""; acts.innerHTML = "";
    for (const t of lines) {
      const p = document.createElement("p"); p.className = "robo-msg typing"; p.innerHTML = t; msgs.appendChild(p);
      await wait(550); p.classList.remove("typing"); p.classList.add("in"); await wait(200);
    }
  };
  const botoes = list => {
    acts.innerHTML = "";
    list.forEach(([txt, fn, cls]) => { const b = document.createElement(fn.href ? "a" : "button"); b.className = "guia__btn " + (cls || ""); b.innerHTML = txt; if (fn.href) b.href = fn.href; else { b.type = "button"; b.addEventListener("click", fn); } acts.appendChild(b); });
  };
  const passo = n => { el.dataset.step = n; dots.forEach((d, i) => d.classList.toggle("on", i <= n)); };

  const p0 = async () => {
    passo(0);
    await fala(["Oi, oi! Eu sou o <b>Vyllo</b>, o seu ajudante.", "Quer que eu te mostre como funciona? É rapidinho."]);
    botoes([["Me mostra", p1, "is-main"], ["Prefiro ver tudo", fechar]]);
  };
  const p1 = async () => {
    passo(1);
    await fala(["Antes, como você se chama?"]);
    acts.innerHTML = `<form class="guia__form"><input id="guiaNome" maxlength="30" autocomplete="given-name" placeholder="Seu nome" aria-label="Seu nome"><button class="guia__btn is-main" type="submit">Continuar</button></form>`;
    const f = acts.querySelector("form"), i = acts.querySelector("input");
    setTimeout(() => i.focus(), 50);
    f.addEventListener("submit", e => { e.preventDefault(); nome = i.value.trim().split(/\s+/)[0] || ""; p2(); });
  };
  const p2 = async () => {
    passo(2);
    const oi = nome ? `Prazer, <b>${esc(nome)}</b>!` : "Prazer!";
    await fala([`${oi} Esse é o <b>Vyllorri Beauty</b>, a agenda online do seu negócio de beleza.`, "A cliente marca o horário sozinha, pelo seu link, a qualquer hora.", "Você cuida da agenda, da equipe e do financeiro pelo celular."]);
    botoes([["Continuar", p3, "is-main"]]);
  };
  const p3 = async () => {
    passo(3);
    await fala(["Olha ele por dentro:"]);
    acts.innerHTML = `<div class="guia__phone"><div class="iphone"><div class="iphone__scr"><video src="video.mp4" poster="video.jpg" muted playsinline autoplay loop preload="auto"></video></div></div></div>`;
    const v = acts.querySelector("video");
    const cap = document.createElement("p"); cap.className = "vcap2 guia__cap"; cap.id = "guiaCap"; cap.setAttribute("aria-live", "polite");
    acts.insertBefore(cap, acts.firstChild);
    const A = 3.8, B = 75.3, C = [[3.5,"Painel","Seu dia em uma tela"],[9.5,"Página de agendamento","Suas clientes agendam pelo link"],[17,"Sua marca","A página com a sua cara"],[25,"Link de agendamento","Um link para divulgar"],[30,"WhatsApp · Plano Pro","Responde e marca sozinho"],[41.5,"Agenda","Por dia, semana e profissional"],[47.5,"Avisos","Agendamento, comprovante e cancelamento"],[57,"Sinal por Pix","Menos faltas"],[61,"Serviços","Duração e valor do seu jeito"],[65.5,"Clientes","Cada cliente com histórico"],[69.5,"Financeiro","Quanto entrou, saiu e sobrou"]]; let k = -1;
    const show = j => { cap.innerHTML = "<b>" + C[j][1] + "</b><span>" + C[j][2] + "</span>"; cap.classList.remove("in"); void cap.offsetWidth; cap.classList.add("in"); };
    show(0); k = 0;
    const go = () => { try { v.currentTime = A; } catch (e) {} v.playbackRate = 1.6; v.play().catch(() => {}); };
    v.addEventListener("loadedmetadata", go, { once: true });
    v.addEventListener("timeupdate", () => { const t = v.currentTime; if (t >= B) return go(); let j = 0; C.forEach((x, i) => { if (t >= x[0]) j = i; }); if (j !== k) { k = j; show(j); } });
    const b = document.createElement("div"); b.className = "guia__row";
    b.innerHTML = `<button type="button" class="guia__btn is-main">Gostei! O que mais?</button>`;
    b.querySelector("button").addEventListener("click", pNovo);
    acts.appendChild(b);
  };
  const pNovo = async () => {
    passo(4);
    await fala(["Tem novidade! No <b>plano Pro</b> eu atendo o seu WhatsApp.", "Enquanto você atende, eu respondo a cliente e já marco na agenda. Olha:"]);
    acts.innerHTML = `<div class="guia__wa"><span class="guia__wa-top">WhatsApp · seu negócio</span>
      <p class="wa in">Tem horário amanhã à tarde pra escova?</p>
      <p class="wa out">Tenho 14:00, 15:30 e 17:00. Qual prefere?</p>
      <p class="wa in">15:30</p>
      <p class="wa out">Fechado! Amanhã às 15:30. Te lembro antes. ✅</p></div>
      <button type="button" class="guia__btn is-main">Legal! E o preço?</button>`;
    acts.querySelectorAll(".wa").forEach((m, i) => setTimeout(() => m.classList.add("show"), 400 + i * 900));
    acts.querySelector(".guia__btn").addEventListener("click", p4);
  };
  const p4 = async () => {
    passo(5);
    await fala([`${nome ? esc(nome) + ", qual" : "Qual"} plano combina com você?`]);
    acts.innerHTML = `<div class="guia__seg" role="tablist" aria-label="Como você trabalha?">
      <button type="button" class="on" data-w="solo">Atendo sozinha</button><button type="button" data-w="team">Tenho equipe</button></div>
    <div class="guia__plans" id="guiaPlans"></div>
    <p class="guia__note">O <b>Pro</b> soma R$ 20/mês e deixa o Vyllo atender o seu WhatsApp.</p>
    <button type="button" class="guia__btn guia__more">Ver a página completa</button>`;
    const P = {
      solo: [["Individual", "R$ 39,90/mês", "Agenda, sinal por Pix e financeiro.", "7 dias grátis, sem cartão", false], ["Individual Pro", "R$ 59,90/mês", "Tudo do Individual + o Vyllo atende o seu WhatsApp e marca sozinho.", "7 dias grátis, sem cartão", true]],
      team: [["Com equipe", "R$ 49,90/mês", "Até 5 profissionais, cada uma com a sua agenda.", "7 dias grátis, sem cartão", false], ["Com equipe Pro", "R$ 69,90/mês", "Tudo do Com equipe + o Vyllo atende o seu WhatsApp e marca sozinho.", "7 dias grátis, sem cartão", true]],
    };
    const draw = w => { acts.querySelector("#guiaPlans").innerHTML = P[w].map(([n, v, t, e, pro]) => `<a class="guia__plan${pro ? " is-pro" : ""}" href="${base}"><b>${n} · ${v}</b><span>${t}</span><em>${e} →</em></a>`).join(""); acts.querySelectorAll(".guia__seg button").forEach(x => x.classList.toggle("on", x.dataset.w === w)); };
    acts.querySelectorAll(".guia__seg button").forEach(x => x.addEventListener("click", () => draw(x.dataset.w)));
    draw("solo");
    acts.querySelector(".guia__more").addEventListener("click", fechar);
  };
  p0();
})();
