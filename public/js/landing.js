// Página de vendas do Vyllorri Beauty (antes do login): direta, profissional, mostrando o app de verdade.
import { GET, esc, money, ic } from './core.js';
import { planTable } from './plans.js';

const SITE = 'meusalao.vyllorri.com.br/agendar/';

// Cada negócio tem a própria página de agendamento: cor, nome, serviços e regras diferentes.
const BIZ = [
  { k: 'nails', tab: 'Manicure', name: 'Nail Bar Camila', slug: 'nail-bar-camila', color: '#ec3f87', who: 'Manicure que atende sozinha no próprio espaço',
    feats: ['Cor rosa e frase da marca na página', 'Alongamento com sinal por Pix para evitar faltas', 'Manutenção com duração própria na agenda', 'Plano Individual'] },
  { k: 'lash', tab: 'Lash', name: 'Duda Lash Studio', slug: 'duda-lash-studio', color: '#7c3aed', who: 'Lash designer com agenda de procedimentos longos',
    feats: ['Página roxa com os serviços de cílios e sobrancelhas', 'Sinal obrigatório nos procedimentos de 2 horas', 'Lembrete de manutenção para a cliente voltar', 'Plano Individual'] },
  { k: 'makeup', tab: 'Maquiadora', name: 'Bia Souza Makeup', slug: 'bia-souza-makeup', color: '#c8963e', who: 'Maquiadora que vai até a noiva',
    feats: ['Página dourada para noivas e festas', 'Atendimento a domicílio com taxa por bairro', 'Endereço da cliente já na agenda', 'Plano Individual'] },
  { k: 'hair', tab: 'Salão', name: 'Studio Verano', slug: 'studio-verano', color: '#0f9d8a', who: 'Salão com 4 profissionais e recepção',
    feats: ['Cliente escolhe o serviço e a profissional', 'Agenda separada para cada profissional', 'Comissões calculadas sozinhas', 'Plano Com equipe'] },
];

// O painel por dentro: telas reais do app.
const PANEL = [
  { k: 'agenda', tab: 'Agenda', img: '/tutorial/t12-agenda.webp', title: 'A agenda do dia em uma tela', items: ['Horários do dia por profissional', 'Agendamentos online chegam sozinhos', '"Chegou" e "Fechar conta" com um toque'] },
  { k: 'servicos', tab: 'Serviços', img: '/tutorial/t04-servicos.webp', title: 'Seus serviços, seus preços', items: ['Preço e duração de cada serviço', 'Categorias: unhas, cílios, cabelo, maquiagem', 'Sinal e domicílio por serviço'] },
  { k: 'online', tab: 'Link de agendamento', img: '/tutorial/t06-online.webp', title: 'Seu link pronto para divulgar', items: ['Ative a página com um botão', 'Copie o link para o Instagram e o WhatsApp', 'Escolha a cor, a logo e a capa'] },
  { k: 'pix', tab: 'Sinal por Pix', img: '/tutorial/t07-pix.webp', title: 'Menos faltas com sinal por Pix', items: ['Você define a porcentagem do sinal', 'A cliente paga ao agendar', 'O comprovante chega no app'] },
  { k: 'fin', tab: 'Financeiro', img: '/tutorial/t13-financeiro.webp', title: 'Quanto entrou, saiu e sobrou', items: ['Vendas e despesas do mês', 'Caixa do dia', 'Relatórios sem planilha'] },
];

const FAQ = [
  ['Preciso entender de tecnologia?', 'Não. Ao criar a conta, um tutorial de 2 minutos mostra cada passo com as telas do app. Se travar em algo, é só falar com a gente dentro do próprio app.'],
  ['Preciso de cartão de crédito para testar?', 'Não. Você cria a conta e usa tudo por 7 dias grátis, sem cadastrar cartão.'],
  ['Tenho que instalar alguma coisa?', 'Não. Funciona no navegador do celular, do tablet e do computador. Se quiser, adiciona à tela inicial e fica igual a um aplicativo.'],
  ['Como pago a mensalidade?', 'Por Pix, com QR Code ou copia e cola. A confirmação é automática. Não existe fidelidade: se não quiser continuar, é só não pagar o próximo mês.'],
  ['O que acontece com meus dados se eu parar?', 'Ficam guardados. O acesso é pausado e, se você voltar, está tudo lá.'],
  ['Meus dados estão seguros?', 'Sim. Conexão criptografada, verificação em 2 etapas opcional e cada negócio só enxerga os próprios dados.'],
];

const phone = (src, alt, cls = '') => `<div class="lx-phone ${cls}"><img src="${src}" alt="${esc(alt)}" loading="lazy"></div>`;

export async function landing() {
  let plans = { solo: { name: 'Individual', price_cents: 3990 }, team: { name: 'Com equipe', price_cents: 4990 } }, days = 7;
  try {
    const r = await GET('/api/plans');
    (plans = r.plans), (days = r.trial_days);
  } catch {}
  const price = (c) => {
    const [r, cents] = money(c).replace('R$', '').trim().split(',');
    return `<small>R$</small>${r}<small>,${cents}</small>`;
  };
  const plan = (k, sub, feats, hl) => `<div class="ld-plan ${hl ? 'hl' : ''}">${hl ? '<span class="ld-pop">Para salões</span>' : ''}
      <h3>${esc(plans[k].name)}</h3><p class="ld-plan-sub">${sub}</p>
      <p class="ld-price">${price(plans[k].price_cents)}<span>/mês</span></p>
      <ul>${feats.map((t) => `<li>${ic('check', 16)} ${t}</li>`).join('')}</ul>
      <a class="ld-btn ${hl ? '' : 'ghost'}" href="#/criar">Testar ${days} dias grátis</a></div>`;

  document.getElementById('app').innerHTML = `<div class="ld lx">
    <header class="ld-nav"><a class="ld-logo" href="#/"><img src="/brand/vyllorri-v-transparente-256.png" alt=""><span><b>Vyllorri</b><small>Beauty</small></span></a>
      <nav><a href="#facil" data-scroll>Como funciona</a><a href="#paginas" data-scroll>Páginas</a><a href="#painel" data-scroll>Painel</a><a href="#planos" data-scroll>Planos</a></nav>
      <a class="ld-login" href="#/entrar">Entrar</a></header>

    <section class="lx-hero">
      <div class="lx-hero-txt">
        <span class="lx-badge">${days} dias grátis · sem cartão · sem fidelidade</span>
        <h1>Agenda, clientes e financeiro do seu negócio de beleza. <em>Sem complicação.</em></h1>
        <p>Suas clientes agendam sozinhas por um link com a cara da sua marca. Você acompanha tudo em um painel simples, no celular ou no computador.</p>
        <div class="ld-cta"><a class="ld-btn" href="#/criar">Começar grátis ${ic('arrowRight', 18)}</a><a class="ld-btn ghost" href="#paginas" data-scroll>Ver exemplos</a></div>
        <ul class="lx-proof"><li><b>10 min</b><span>para deixar pronto</span></li><li><b>24h</b><span>agenda aberta</span></li><li><b>R$ 39,90</b><span>por mês</span></li></ul>
      </div>
      <div class="lx-hero-vis" aria-hidden="true">
        ${phone('/tutorial/t12-agenda.webp', '', 'back')}
        ${phone('/vitrine/p-nails.webp', '', 'front')}
        <span class="lx-tag t1">${ic('bell', 14)} Novo agendamento online</span>
        <span class="lx-tag t2">${ic('checkCircle', 14)} Sinal pago por Pix</span>
      </div>
    </section>

    <section class="lx-logos"><span>Feito para</span>${['Manicures', 'Lash designers', 'Maquiadoras', 'Designers de sobrancelha', 'Cabeleireiras', 'Esteticistas', 'Salões e studios'].map((t) => `<b>${t}</b>`).join('')}</section>

    <section class="ld-sec" id="facil"><p class="ld-kicker">Fácil e prático</p><h2>Você não precisa ficar batendo cabeça</h2>
      <p class="ld-lead">Nada de configuração difícil, manual grande ou instalar programa. Em 3 passos o seu negócio está recebendo agendamentos.</p>
      <ol class="lx-steps">${[
        ['Crie a conta', 'Nome do negócio, e-mail e senha. Um tutorial de 2 minutos mostra o resto.', '1 min'],
        ['Cadastre serviços e horários', 'Preço, duração e os dias em que você atende.', '5 min'],
        ['Divulgue seu link', 'Coloque na bio do Instagram e no WhatsApp. As clientes marcam sozinhas.', '1 min'],
      ].map(([t, d, m], n) => `<li><span class="lx-n">${n + 1}</span><h3>${t}</h3><p>${d}</p><small>${ic('clock', 14)} ${m}</small></li>`).join('')}</ol>
      <div class="lx-easy">${[
        ['play', 'Tutorial guiado', 'Mostra cada tela na primeira vez que você entra.'],
        ['globe', 'Nada para instalar', 'Abre no navegador e vira app na tela inicial.'],
        ['message', 'Ajuda dentro do app', 'Ficou com dúvida? Fala com a gente por ali mesmo.'],
        ['eye', 'Só o que você usa', 'Trabalha sozinha ou não vende produtos? Essas telas somem.'],
      ].map(([i, t, d]) => `<div><span>${ic(i, 20)}</span><b>${t}</b><small>${d}</small></div>`).join('')}</div></section>

    <section class="ld-sec" id="paginas"><p class="ld-kicker">Páginas de agendamento</p><h2>Cada negócio com a sua página</h2>
      <p class="ld-lead">Os exemplos abaixo são ilustrativos. Na sua página, <b>você escolhe tudo</b>: suas fotos, sua logo, sua capa, sua cor, seus serviços e suas regras. E recebe um link só seu.</p>
      <div class="lx-chips">${['Suas fotos', 'Sua logo', 'Foto de capa', 'Cor da página', 'Frase de destaque', 'Serviços e preços', 'Sinal por Pix', 'Domicílio'].map((t) => `<span>${ic('check', 14)} ${t}</span>`).join('')}</div>
      <div class="lx-tabs" role="tablist" data-tabs="biz">${BIZ.map((b, i) => `<button role="tab" data-i="${i}" style="--c:${b.color}">${b.tab}</button>`).join('')}</div>
      <div class="lx-show" data-show="biz"></div></section>

    <section class="ld-sec" id="painel"><p class="ld-kicker">O painel por dentro</p><h2>Tudo o que você precisa, nada que atrapalhe</h2>
      <p class="ld-lead">Estas são as telas reais do app.</p>
      <div class="lx-tabs" role="tablist" data-tabs="panel">${PANEL.map((p, i) => `<button role="tab" data-i="${i}">${p.tab}</button>`).join('')}</div>
      <div class="lx-show" data-show="panel"></div></section>

    <section class="ld-sec" id="planos"><p class="ld-kicker">Planos</p><h2>Preço claro, sem surpresa</h2>
      <p class="ld-lead">Teste tudo por ${days} dias. Depois, pague por Pix todo mês, sem fidelidade.</p>
      <div class="ld-plans">
        ${plan('solo', 'Para quem atende por conta própria', ['Página de agendamento com sua marca', 'Agendamento online 24h', 'Sinal por Pix e domicílio', 'Clientes, vendas e financeiro', 'Avisos no celular'], false)}
        ${plan('team', 'Para salões e studios com equipe', ['Tudo do plano Individual', 'Até 5 profissionais inclusas', 'Agenda de cada profissional', 'Comissões calculadas sozinhas', 'Acessos para recepção e equipe'], true)}
      </div>
      <p class="ld-lead" style="margin-top:18px">Mais de 5 profissionais? Cada uma a mais custa R$ 9,90/mês.</p>
      <details class="ld-compare"><summary>Comparar os planos em detalhe ${ic('chevDown', 18)}</summary>${planTable(plans)}</details></section>

    <section class="ld-sec" id="duvidas"><p class="ld-kicker">Dúvidas</p><h2>Perguntas frequentes</h2>
      <div class="ld-faq">${FAQ.map(([q, a]) => `<details><summary>${q}${ic('chevDown', 18)}</summary><p>${a}</p></details>`).join('')}</div></section>

    <section class="ld-final"><h2>Comece hoje. Em 10 minutos está pronto.</h2><p>Teste grátis por ${days} dias, sem cartão de crédito.</p>
      <a class="ld-btn" href="#/criar">Criar minha conta ${ic('arrowRight', 18)}</a><small>Cancele quando quiser · Seus dados ficam guardados</small></section>

    <footer class="ld-foot"><img src="/brand/vyllorri-v-transparente-256.png" alt=""><span>© ${new Date().getFullYear()} Vyllorri Beauty · Gestão para negócios de beleza</span></footer>
  </div>`;

  const shows = {
    biz: (b) => `<div class="lx-card" style="--c:${b.color}">
        ${phone(`/vitrine/p-${b.k}.webp`, `Página de agendamento de exemplo: ${b.name}`)}
        <div class="lx-info"><span class="lx-dot"></span><h3>${b.name}</h3><p class="lx-who">${b.who}</p>
          <p class="lx-url">${ic('link', 15)} <span>${SITE}<b>${b.slug}</b></span></p>
          <ul>${b.feats.map((f) => `<li>${ic('check', 16)} ${f}</li>`).join('')}</ul>
          <div class="lx-custom"><b>${ic('edit', 15)} Tudo isso é personalizável</b><span>Imagens, capa, logo, cor, frase, serviços, preços e regras: você troca o que quiser, quando quiser.</span></div>
          <small class="lx-note">Imagens (Unsplash) e dados ilustrativos.</small></div></div>`,
    panel: (p) => `<div class="lx-card">
        ${phone(p.img, `Tela do painel: ${p.tab}`)}
        <div class="lx-info"><h3>${p.title}</h3><ul>${p.items.map((f) => `<li>${ic('check', 16)} ${f}</li>`).join('')}</ul>
          <a class="ld-btn" href="#/criar">Testar grátis ${ic('arrowRight', 18)}</a></div></div>`,
  };
  const data = { biz: BIZ, panel: PANEL };
  document.querySelectorAll('[data-tabs]').forEach((bar) => {
    const key = bar.dataset.tabs;
    const box = document.querySelector(`[data-show="${key}"]`);
    const pick = (i) => {
      bar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(Number(b.dataset.i) === i)));
      box.innerHTML = shows[key](data[key][i]);
    };
    bar.querySelectorAll('button').forEach((b) => (b.onclick = () => pick(Number(b.dataset.i))));
    pick(0);
  });
  document.querySelectorAll('[data-scroll]').forEach((a) => (a.onclick = (e) => {
    e.preventDefault();
    document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}
