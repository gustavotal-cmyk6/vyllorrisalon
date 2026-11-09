// Página de apresentação do Vyllorri para donas de salão (antes do login).
import { GET, esc, money, ic } from './core.js';

const FEATS = [
  ['calendar', 'Agenda online 24h', 'Suas clientes escolhem serviço, profissional e horário pelo link do salão — até de madrugada.'],
  ['zap', 'Sinal por Pix', 'Cobre um sinal na hora de agendar e reduza as faltas. O comprovante chega direto no app.'],
  ['home', 'Atendimento a domicílio', 'Taxa por bairro, endereço da cliente e tempo de deslocamento já calculados na agenda.'],
  ['wallet', 'Financeiro sem planilha', 'Quanto vendeu, recebeu, gastou e lucrou. Despesas fixas, caixa do dia e relatórios.'],
  ['users', 'Equipe e comissões', 'Agenda de cada profissional e comissão calculada sozinha em cada atendimento.'],
  ['bell', 'Avisos no celular', 'Notificação na hora de cada novo agendamento, comprovante ou cancelamento.'],
];
const FAQ = [
  ['Preciso de cartão de crédito para testar?', 'Não. Você cria a conta e usa tudo por 7 dias grátis, sem cadastrar cartão.'],
  ['Como pago a mensalidade?', 'Por Pix, com QR Code ou copia e cola. A confirmação é automática e o acesso continua na hora. Avisamos no app antes de vencer.'],
  ['Posso cancelar quando quiser?', 'Sim. Não existe fidelidade nem cobrança automática no cartão: se não quiser continuar, é só não pagar o próximo Pix.'],
  ['O que acontece com meus dados se eu parar?', 'Ficam guardados. O acesso é pausado e, se você voltar, está tudo lá: clientes, histórico e financeiro.'],
  ['Funciona no celular?', 'Funciona no celular, tablet e computador. No celular dá para instalar como aplicativo, com ícone na tela.'],
  ['Trabalho sozinha. Serve para mim?', 'Serve, e o plano é mais barato. No modo "Trabalho sozinha" o app esconde as telas de equipe e comissões.'],
];

export async function landing() {
  let plans = { solo: { name: 'Sozinha', price_cents: 3990 }, team: { name: 'Com equipe', price_cents: 6990 } }, days = 7;
  try {
    const r = await GET('/api/plans');
    (plans = r.plans), (days = r.trial_days);
  } catch {}
  const price = (c) => {
    const [r, cents] = money(c).replace('R$', '').trim().split(',');
    return `<small>R$</small>${r}<small>,${cents}</small>`;
  };
  const plan = (k, sub, feats, hl) => `<div class="ld-plan ${hl ? 'hl' : ''}">${hl ? '<span class="ld-pop">Mais escolhido</span>' : ''}
      <h3>${esc(plans[k].name)}</h3><p class="ld-plan-sub">${sub}</p>
      <p class="ld-price">${price(plans[k].price_cents)}<span>/mês</span></p>
      <ul>${feats.map((t) => `<li>${ic('check', 16)} ${t}</li>`).join('')}</ul>
      <a class="ld-btn ${hl ? '' : 'ghost'}" href="#/criar">Começar ${days} dias grátis</a></div>`;
  document.getElementById('app').innerHTML = `<div class="ld">
    <header class="ld-nav"><a class="ld-logo" href="#/"><img src="/brand/vyllorri-v-transparente-256.png" alt=""><span><b>Vyllorri</b><small>Beauty</small></span></a>
      <nav><a href="#recursos" data-scroll>Recursos</a><a href="#planos" data-scroll>Planos</a><a href="#duvidas" data-scroll>Dúvidas</a></nav>
      <a class="ld-login" href="#/entrar">Entrar</a></header>

    <section class="ld-hero">
      <div class="ld-hero-txt">
        <span class="ld-badge">${ic('star', 14)} ${days} dias grátis · sem cartão</span>
        <h1>Seu salão organizado e a agenda <em>sempre cheia.</em></h1>
        <p>Agenda online, sinal por Pix, clientes, comissões e financeiro em um só app — feito para salões, studios e profissionais da beleza.</p>
        <div class="ld-cta"><a class="ld-btn" href="#/criar">Começar ${days} dias grátis ${ic('arrowRight', 18)}</a><a class="ld-btn ghost" href="#/entrar">Já tenho conta</a></div>
        <ul class="ld-trust"><li>${ic('lock', 15)} Dados protegidos</li><li>${ic('checkCircle', 15)} Sem fidelidade</li><li>${ic('zap', 15)} Pronto em 1 minuto</li></ul>
      </div>
      <div class="ld-phone" aria-hidden="true"><div class="ld-screen">
        <div class="ld-s-top"><b>Hoje, terça</b><span>6 atendimentos</span></div>
        <div class="ld-s-kpi"><div><small>Vendido hoje</small><b>R$ 640</b></div><div><small>Livre</small><b>2 horários</b></div></div>
        ${[['09:00', 'Juliana M.', 'Coloração', 'ok'], ['10:30', 'Fernanda S.', 'Escova + hidratação', 'pix'], ['13:00', 'Camila R.', 'Manicure', 'new'], ['15:00', 'Patrícia L.', 'Corte feminino', '']]
          .map(([h, n, s, t]) => `<div class="ld-s-row"><span>${h}</span><div><b>${n}</b><small>${s}</small></div>${t === 'ok' ? '<i class="ok">Confirmado</i>' : t === 'pix' ? '<i class="pix">Sinal pago</i>' : t === 'new' ? '<i class="new">Online</i>' : ''}</div>`).join('')}
        <div class="ld-s-notif">${ic('bell', 14)}<span><b>Novo agendamento online</b> Ana marcou Design de sobrancelha · amanhã 10:00</span></div>
      </div></div>
    </section>

    <section class="ld-strip"><span>${ic('calendar', 18)} Agenda online</span><span>${ic('zap', 18)} Pix integrado</span><span>${ic('home', 18)} Domicílio</span><span>${ic('chart', 18)} Financeiro</span><span>${ic('bell', 18)} Notificações</span></section>

    <section class="ld-sec" id="recursos"><p class="ld-kicker">Tudo em um só lugar</p><h2>Menos tempo no WhatsApp, mais tempo atendendo</h2>
      <div class="ld-feats">${FEATS.map(([i, t, d]) => `<div class="ld-feat"><span>${ic(i, 22)}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}</div></section>

    <section class="ld-sec ld-steps"><p class="ld-kicker">Como começar</p><h2>Em 3 passos o seu salão está online</h2>
      <ol>${[['Crie sua conta', 'Nome do salão, seu e-mail e senha. Leva 1 minuto.'], ['Cadastre seus serviços', 'Preços, duração e seus horários de atendimento.'], ['Divulgue seu link', 'Coloque na bio do Instagram e no WhatsApp. As clientes marcam sozinhas.']]
        .map(([t, d], n) => `<li><span>${n + 1}</span><div><h3>${t}</h3><p>${d}</p></div></li>`).join('')}</ol></section>

    <section class="ld-sec" id="planos"><p class="ld-kicker">Planos</p><h2>Preço justo, sem surpresa</h2>
      <p class="ld-lead">Teste tudo por ${days} dias grátis. Depois, pague por Pix todo mês — sem fidelidade.</p>
      <div class="ld-plans">
        ${plan('solo', 'Para quem atende sozinha', ['Agenda e link de agendamento', 'Clientes e histórico', 'Sinal por Pix e domicílio', 'Financeiro e relatórios', 'Notificações no celular'], false)}
        ${plan('team', 'Para salões com profissionais', ['Tudo do plano Sozinha', 'Agenda de cada profissional', 'Comissões automáticas', 'Acessos para recepção e gerente', 'Relatórios por profissional'], true)}
      </div></section>

    <section class="ld-sec" id="duvidas"><p class="ld-kicker">Dúvidas</p><h2>Perguntas frequentes</h2>
      <div class="ld-faq">${FAQ.map(([q, a]) => `<details><summary>${q}${ic('chevDown', 18)}</summary><p>${a}</p></details>`).join('')}</div></section>

    <section class="ld-final"><h2>Pronta para organizar seu salão?</h2><p>Comece hoje. Em 1 minuto você já está usando.</p>
      <a class="ld-btn" href="#/criar">Começar ${days} dias grátis ${ic('arrowRight', 18)}</a><small>Sem cartão de crédito · Cancele quando quiser</small></section>

    <footer class="ld-foot"><img src="/brand/vyllorri-v-transparente-256.png" alt=""><span>© ${new Date().getFullYear()} Vyllorri Beauty · Gestão para salões de beleza</span></footer>
  </div>`;
  document.querySelectorAll('[data-scroll]').forEach((a) => (a.onclick = (e) => {
    e.preventDefault();
    document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}
