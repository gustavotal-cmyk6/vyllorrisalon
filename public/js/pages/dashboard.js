import { state, GET, POST, esc, money, can, fmtDayLong, empty, badge, ic, avatar, trend, pageHead, toast, fail, nextStep, modal } from '../core.js';
import { newVisit, openVisit, visitSwipe } from './visits.js';
import { swipeCards } from '../gestures.js';
import { openCheckout } from './checkout.js';
import { quickClient } from './clients.js';
import { refresh, notifications } from '../app.js';
import { pushBanner } from '../push.js';
import { openTutorial } from '../tutorial.js';
const TUT_KEY = 'vb-tut-hidden';
const LINK_KEY = 'vb-link-hidden';
const linkHidden = () => { try { return localStorage.getItem(LINK_KEY) === '1'; } catch { return false; } };
const tutHidden = () => { try { return localStorage.getItem(TUT_KEY) === '1'; } catch { return false; } };

export const ALERT_IC = { online: 'globe', late: 'clock', checkout: 'receipt', receivable: 'coin', confirm: 'message', stock: 'box', bills: 'wallet', birthday: 'heart' };
// próxima ação de cada status, direto na lista (sem abrir o agendamento)

/** Início: como está o dia, quem vem a seguir e o que precisa de atenção. O resto fica nas outras áreas. */
export default async function dashboard(root) {
  const d = await GET('/api/dashboard');
  const h = new Date().getHours();
  const hello = `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}, ${esc(state.user.name.split(' ')[0])}!`;
  const a = d.agenda;
  const setup = can.admin() && (!state.pros.length || !state.services.length);
  const upcoming = [...a.in_progress_list, ...a.waiting_list, ...a.late, ...a.next].filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i);
  const alerts = d.attention || [];

  const nx = upcoming[0];
  const rest = upcoming.slice(1);
  // o próximo atendimento (ou o que está em andamento) ganha destaque, com a ação à mão
  const nextCard = nx ? (() => {
    const n = nextStep(nx);
    return `<section class="nextcard" data-sw data-swid="${nx.id}" data-status="${nx.status}">
      <div class="nc-time"><small>${nx.status === 'in_progress' ? 'Agora' : 'Próximo'}</small><b>${nx.start_at.slice(11)}</b></div>
      <div class="grow click" data-visit="${nx.id}"><div class="nc-name">${esc(nx.client_name)}</div><div class="nc-svc">${esc(nx.services)}${can.solo() ? '' : ` · ${esc(nx.pros)}`}</div></div>
      ${n ? `<button class="btn ${n[0] === 'checkout' ? 'ok' : 'primary'}" data-step="${n[0]}" data-id="${nx.id}">${ic(n[2], 16)} ${n[1]}</button>` : badge(nx.status)}</section>`;
  })() : '';

  root.innerHTML = `
  <section class="hero2"><div class="hero2-txt"><h1>${hello}</h1><p>${fmtDayLong(d.date)}</p>
    <button class="btn" data-act="visit">${ic('plus', 18)} Novo agendamento</button></div>
    <span class="hero2-bub" aria-hidden="true">Vamos agendar?</span>
    <div class="hero2-vyllo" aria-hidden="true"><img src="/vendas/vyllo.webp" alt="" width="110" height="228"></div></section>
  ${setup ? setupCard() : ''}
  ${nextCard}
  ${d.role === 'pro' ? proKpis(d) : ownerKpis(d)}
  ${linkCard(d.booking)}
  <div class="grid g-main">
    ${!nx || rest.length ? `<section class="card">
      <div class="card-head"><h2>${nx ? 'Também hoje' : 'Próximos atendimentos'}</h2><a class="btn sm ghost" href="#/agenda">Ver agenda ${ic('arrowRight', 16)}</a></div>
      ${rest.length ? `<ul class="list">${rest.map((v) => {
        const n = nextStep(v);
        return `<li data-sw data-swid="${v.id}" data-status="${v.status}"><div class="tl-time" style="padding:0;width:50px">${v.start_at.slice(11)}</div>
          <div class="grow click" data-visit="${v.id}"><div class="title">${esc(v.client_name)}</div><div class="meta">${esc(v.services)}${can.solo() ? '' : ` · ${esc(v.pros)}`}</div></div>
          ${n ? `<button class="btn xs ${n[0] === 'checkout' ? 'ok' : 'soft'}" data-step="${n[0]}" data-id="${v.id}">${ic(n[2], 14)} ${n[1]}</button>` : badge(v.status)}</li>`;
      }).join('')}</ul>`
        : empty(a.total ? 'Todos os atendimentos de hoje já foram concluídos.' : 'Nenhum atendimento marcado para hoje.', `<button class="btn sm primary" data-act="visit">${ic('plus', 16)} Agendar</button>`, 'calendar')}
    </section>` : ''}
    <div class="stack">
      <section class="card">
        <div class="card-head"><h2>Precisa de atenção</h2>${alerts.length > 3 ? `<button class="btn xs ghost" data-act="alerts">Ver todas (${alerts.length})</button>` : ''}</div>
        ${alerts.length ? alerts.slice(0, 3).map((x) => { const inner = `<span class="a-ic">${ic(ALERT_IC[x.type] || 'info', 18)}</span><span>${esc(x.text)}</span>${x.amount ? `<b>${money(x.amount)}</b>` : ''}`; return x.type === 'checkout' ? `<button type="button" class="alert ${x.level}" data-act="closeday">${inner}</button>` : `<a class="alert ${x.level}" href="${x.link}">${inner}</a>`; }).join('')
          : `<p class="small muted" style="display:flex;gap:8px;align-items:center">${ic('checkCircle', 18, 'ok-t')} Tudo em dia. Nada pendente agora.</p>`}
      </section>
    </div>
  </div>
  <div data-pushbanner></div>
  ${can.admin() && !tutHidden() ? `<div class="tut-row"><button class="tut-card" data-tut><span class="tc-ic">${ic('play', 22)}</span><span class="grow"><b>Primeiros passos em 2 minutos</b><small>Veja como deixar seu negócio pronto para receber agendamentos</small></span>${ic('chevRight', 20)}</button><button class="tut-hide" data-tut-hide aria-label="Esconder">${ic('x', 16)}</button></div>` : ''}`;

  swipeCards(root, { selector: '[data-sw]', actions: (el) => visitSwipe(el, refresh) });
  pushBanner(root.querySelector('[data-pushbanner]'));
  root.querySelector('[data-link-copy]')?.addEventListener('click', async (e) => {
    const url = e.currentTarget.dataset.linkCopy;
    try { await navigator.clipboard.writeText(url); toast('Link copiado! Cole na bio do Instagram ou mande no WhatsApp.'); } catch { toast(url); }
  });
  root.querySelector('[data-link-hide]')?.addEventListener('click', (e) => {
    try { localStorage.setItem(LINK_KEY, '1'); } catch {}
    e.currentTarget.closest('.linkcard').remove();
    toast('Você encontra o link em Mais → Configurações → Agendamento online');
  });
  root.querySelector('[data-tut]')?.addEventListener('click', openTutorial);
  root.querySelector('[data-tut-hide]')?.addEventListener('click', (e) => {
    try { localStorage.setItem(TUT_KEY, '1'); } catch {}
    e.currentTarget.closest('.tut-row').remove();
    toast('Você encontra o tutorial em Ajuda e sugestões');
  });
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act],[data-step],[data-visit]');
    if (!t) return;
    try {
      if (t.dataset.visit) return openVisit(Number(t.dataset.visit), refresh);
      if (t.dataset.step) {
        if (t.dataset.step === 'checkout') return openCheckout({ visit: await GET(`/api/visits/${t.dataset.id}`), onDone: refresh });
        t.disabled = true;
        await POST(`/api/visits/${t.dataset.id}/status`, { status: t.dataset.step });
        toast('Pronto, atualizado');
        return refresh();
      }
      const act = t.dataset.act;
      if (act === 'visit') newVisit({ onSaved: refresh });
      if (act === 'fit') newVisit({ fitIn: true, onSaved: refresh });
      if (act === 'sale') openCheckout({ onDone: refresh });
      if (act === 'client') quickClient({ onSaved: (id) => (location.hash = `#/clientes/${id}`) });
      if (act === 'alerts') notifications();
      if (act === 'closeday') receiveDay(d);
    } catch (err) {
      t.disabled = false;
      fail(err);
    }
  });
}

/** Link de agendamento: aparece para quem administra até receber 3 pedidos online ou até a pessoa esconder. */
function linkCard(b) {
  if (!b || !can.admin() || linkHidden() || b.online_total >= 3) return '';
  if (!b.enabled || !b.slug) {
    return `<section class="linkcard"><span class="lc-ic">${ic('link', 18)}</span><div class="grow"><b>Ligue o agendamento online</b><small>As clientes marcam sozinhas pelo seu link.</small></div>
      <a class="btn sm primary" href="#/config?aba=booking">Ligar</a><button class="lc-x" data-link-hide aria-label="Esconder este aviso">${ic('x', 16)}</button></section>`;
  }
  const url = `${location.origin}/agendar/${b.slug}`;
  return `<section class="linkcard"><span class="lc-ic">${ic('link', 18)}</span><div class="grow"><b>Seu link</b><small>${esc(url.replace(/^https?:\/\//, ''))}</small></div>
    <button class="btn sm primary" data-link-copy="${esc(url)}">${ic('copy', 14)} Copiar</button>
    <a class="btn sm" target="_blank" rel="noopener" aria-label="Enviar o link no WhatsApp" href="https://wa.me/?text=${encodeURIComponent('Agende seu horário online: ' + url)}">${ic('whatsapp', 16)}</a>
    <button class="lc-x" data-link-hide aria-label="Esconder este aviso">${ic('x', 16)}</button></section>`;
}

/** Receber do dia: lista dos atendimentos que já passaram do horário e ainda não foram recebidos; um toque abre o recebimento de cada um. */
function receiveDay(d) {
  const a = d.agenda;
  const list = [...a.in_progress_list, ...a.late].filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i);
  modal({
    title: 'Receber do dia',
    body: list.length
      ? `<p class="small muted" style="margin-bottom:10px">Atendimentos de hoje que já passaram do horário. Toque em Receber quando puder.</p>
        <ul class="list">${list.map((v) => `<li><div class="tl-time" style="padding:0;width:50px">${v.start_at.slice(11)}</div><div class="grow"><div class="title">${esc(v.client_name)}</div><div class="meta">${esc(v.services)}</div></div>
          <button class="btn sm ok" data-pay="${v.id}">${ic('receipt', 16)} Receber</button></li>`).join('')}</ul>`
      : `<div class="empty" style="padding:10px 0"><div class="e-ic">${ic('checkCircle', 26)}</div><p>Tudo recebido por hoje.</p></div>`,
    onMount(el, close) {
      el.querySelectorAll('[data-pay]').forEach((b) => (b.onclick = async () => {
        close();
        try { openCheckout({ visit: await GET(`/api/visits/${b.dataset.pay}`), onDone: refresh }); } catch (err) { fail(err); }
      }));
    },
  });
}

function setupCard() {
  const steps = [
    can.solo() ? [false, '#/config', 'Confira seus horários de atendimento'] : [state.pros.length, '#/equipe?nova=1', 'Cadastre sua equipe'],
    [state.services.length, '#/servicos?novo=1', 'Cadastre seus serviços'],
    [false, '#/config', 'Personalize sua página de agendamento'],
  ];
  return `<section class="card" style="border:2px dashed var(--lav-300)"><h2>Primeiros passos</h2>
    <div class="list">${steps.map(([done, href, t]) => `<a href="${href}" style="display:flex;gap:12px;align-items:center;padding:10px 0;color:inherit">
      <span class="avatar sm" style="background:${done ? 'var(--ok)' : 'var(--lav-200)'};color:${done ? '#fff' : 'var(--brand)'}">${ic(done ? 'check' : 'arrowRight', 16)}</span>
      <b class="grow" style="${done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${t}</b>${ic('chevRight', 18, 'chev')}</a>`).join('')}</div></section>`;
}

function ownerKpis(d) {
  const a = d.agenda;
  return `<div class="kpis three">
    <div class="kpi hl"><span>Atendimentos hoje</span><b>${a.total}</b><small>${a.completed} concluído(s)${a.cancelled + a.no_show ? ` · ${a.cancelled + a.no_show} cancelado(s) ou falta(s)` : ''}</small></div>
    <div class="kpi"><span>Recebido hoje</span><b>${money(d.today.received)}</b><small>dinheiro que já entrou</small></div>
    <div class="kpi"><span>Vendido no mês</span><b>${money(d.month.revenue)}</b>${trend(d.month.change_revenue, ' vs. mês passado')}</div>
  </div>`;
}
function proKpis(d) {
  return `<div class="kpis three">
    <div class="kpi hl"><span>Meus atendimentos hoje</span><b>${d.agenda.total}</b><small>${d.agenda.completed} concluído(s)</small></div>
    <div class="kpi"><span>Produzi no mês</span><b>${money(d.month.produced)}</b></div>
    <div class="kpi"><span>Minha comissão no mês</span><b>${money(d.month.commission)}</b></div></div>`;
}
