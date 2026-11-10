// Tutorial animado "Primeiros passos": toca sozinho com as telas reais do app e legendas.
// Pode ser gravado com a gravação de tela do celular para virar vídeo.
import { ic } from './core.js';

const T = (f) => `/tutorial/${f}.webp`;
export const STEPS = [
  { intro: true, title: 'Bem-vinda ao Vyllorri!', text: 'Em poucos minutos o seu negócio fica pronto para receber agendamentos sozinho. Veja o passo a passo.' },
  { img: T('t01-modo'), title: 'Diga como você trabalha', text: 'Em Configurações → Salão, escolha "Trabalho sozinha" ou "Tenho equipe". Logo abaixo, diga se vende produtos.', href: '#/config' },
  { img: T('t02-perfil'), title: 'Deixe a página com a sua cara', text: 'Coloque logo, foto de capa, a cor da sua página, uma frase de destaque, endereço, WhatsApp e Instagram.', href: '#/config' },
  { img: T('t03-horarios'), title: 'Seus dias e horários', text: 'Marque os dias que atende, o horário de início e fim e o intervalo. Só os horários livres aparecem para a cliente.', href: '#/equipe' },
  { img: T('t04-servicos'), title: 'Cadastre seus serviços', text: 'Cada serviço com preço e duração. Unhas, maquiagem, sobrancelha: cadastre tudo o que você faz.', href: '#/servicos' },
  { img: T('t06-online'), title: 'Ative o agendamento online', text: 'Ative a sua página, copie o link e coloque na bio do Instagram e no WhatsApp. As clientes marcam sozinhas.', href: '#/config' },
  { img: T('t07-pix'), title: 'Sinal por Pix (opcional)', text: 'Cadastre sua chave Pix e escolha quanto cobrar de sinal. Menos faltas, e o comprovante chega no app.', href: '#/config' },
  { img: T('t08-domicilio'), title: 'Atende em casa? (opcional)', text: 'Ative o domicílio, cadastre os bairros e a taxa de deslocamento de cada um.', href: '#/config' },
  { img: T('t09-avisos'), title: 'Receba avisos no celular', text: 'Toque em "Ativar notificações" no Início. No iPhone, adicione o app à Tela de Início pelo Safari.', href: '#/' },
  { img: T('t10-seguranca'), title: 'Proteja a sua conta', text: 'Em Configurações → Segurança, ative a verificação em 2 etapas e guarde os códigos de recuperação.', href: '#/config' },
  { img: T('t11-teste'), title: 'Faça um agendamento de teste', text: 'Abra o seu link como se fosse uma cliente e agende. Ele aparece na sua Agenda na hora.', href: '#/config' },
  { img: T('t12-agenda'), title: 'No dia a dia: a Agenda', text: 'Veja os horários do dia, marque "Chegou" e, no final, "Fechar conta" com o valor e a forma de pagamento.', href: '#/agenda' },
  { img: T('t13-financeiro'), title: 'E o Financeiro', text: 'Quanto entrou, quanto saiu e quanto sobrou, sem planilha.', href: '#/financeiro' },
  { outro: true, title: 'Pronto! 💜', text: 'Seu negócio está organizado. Dúvidas ou ideias? Toque em "Beta · Opinar" no topo do app e fale com a gente.' },
];
const DUR = 7000;

export function openTutorial() {
  let i = 0, playing = true, timer = null, started = 0, left = DUR;
  const el = document.createElement('div');
  el.className = 'tut';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Tutorial: primeiros passos');
  el.innerHTML = `<div class="tut-in">
    <header class="tut-top"><div class="tut-bars">${STEPS.map(() => '<i><b></b></i>').join('')}</div>
      <button class="tut-x" data-x aria-label="Fechar">${ic('x', 22)}</button></header>
    <div class="tut-stage">
      <div class="tut-phone"><div class="tut-screen">${STEPS.map((s, k) => (s.img ? `<img src="${s.img}" alt="" data-k="${k}" loading="${k < 3 ? 'eager' : 'lazy'}">` : `<div class="tut-cover" data-k="${k}"><img src="/brand/vyllorri-v-transparente-256.png" alt=""><b>Vyllorri</b><small>Beauty</small></div>`)).join('')}</div></div>
      <div class="tut-cap"><span class="tut-num"></span><h2></h2><p></p>
        <a class="btn soft sm tut-go" href="#">${ic('arrowRight', 16)} Fazer agora</a></div>
    </div>
    <footer class="tut-ctl"><button data-prev aria-label="Anterior">${ic('chevLeft', 24)}</button>
      <button data-play class="tut-play" aria-label="Pausar">${ic('pause', 26)}</button>
      <button data-next aria-label="Próximo">${ic('chevRight', 24)}</button></footer></div>`;
  document.body.appendChild(el);
  document.body.classList.add('no-scroll');
  const bars = [...el.querySelectorAll('.tut-bars i')];
  const shots = [...el.querySelectorAll('[data-k]')];
  const cap = el.querySelector('.tut-cap');
  const go = el.querySelector('.tut-go');
  const playBtn = el.querySelector('[data-play]');

  const close = () => {
    clearTimeout(timer);
    el.remove();
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const tick = () => {
    clearTimeout(timer);
    if (!playing) return;
    started = Date.now();
    timer = setTimeout(() => (i < STEPS.length - 1 ? show(i + 1) : ((playing = false), syncPlay())), left);
  };
  const syncPlay = () => {
    playBtn.innerHTML = ic(playing ? 'pause' : 'play', 26);
    playBtn.setAttribute('aria-label', playing ? 'Pausar' : 'Continuar');
    el.classList.toggle('paused', !playing);
  };
  function show(k) {
    i = Math.max(0, Math.min(STEPS.length - 1, k));
    const s = STEPS[i];
    shots.forEach((x) => x.classList.toggle('on', Number(x.dataset.k) === i));
    bars.forEach((b, n) => {
      b.className = n < i ? 'done' : n === i ? 'on' : '';
      b.firstElementChild.style.animation = 'none';
      void b.offsetWidth;
      b.firstElementChild.style.animation = '';
      b.firstElementChild.style.animationDuration = `${DUR}ms`;
    });
    cap.classList.remove('in');
    void cap.offsetWidth;
    cap.classList.add('in');
    cap.querySelector('.tut-num').textContent = s.intro || s.outro ? 'Primeiros passos' : `Passo ${i} de ${STEPS.length - 2}`;
    cap.querySelector('h2').textContent = s.title;
    cap.querySelector('p').textContent = s.text;
    go.hidden = !s.href;
    go.onclick = (e) => {
      e.preventDefault();
      close();
      location.hash = s.href;
    };
    left = DUR;
    tick();
  }
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') show(i + 1);
    if (e.key === 'ArrowLeft') show(i - 1);
    if (e.key === ' ') (e.preventDefault(), toggle());
  };
  function toggle() {
    if (playing) left = Math.max(800, left - (Date.now() - started));
    playing = !playing;
    syncPlay();
    tick();
  }
  el.querySelector('[data-x]').onclick = close;
  el.querySelector('[data-prev]').onclick = () => show(i - 1);
  el.querySelector('[data-next]').onclick = () => (i < STEPS.length - 1 ? show(i + 1) : close());
  playBtn.onclick = toggle;
  document.addEventListener('keydown', onKey);
  syncPlay();
  show(0);
}
