import { state, GET, POST, esc, money, can, fmtDayLong, empty, badge, ic, avatar, trend, pageHead, toast, fail } from '../core.js';
import { newVisit, openVisit } from './visits.js';
import { openCheckout } from './checkout.js';
import { quickClient } from './clients.js';
import { refresh, notifications } from '../app.js';
import { pushBanner } from '../push.js';

export const ALERT_IC = { online: 'globe', late: 'clock', checkout: 'receipt', receivable: 'coin', confirm: 'message', stock: 'box', bills: 'wallet', birthday: 'heart' };
// próxima ação de cada status, direto na lista (sem abrir o agendamento)
const NEXT = { scheduled: ['confirmed', 'Confirmar', 'check'], confirmed: ['waiting', 'Chegou', 'user'], waiting: ['in_progress', 'Iniciar', 'play'], in_progress: ['checkout', 'Fechar conta', 'receipt'] };

/** Início: como está o dia, quem vem a seguir e o que precisa de atenção. O resto fica nas outras áreas. */
export default async function dashboard(root) {
  const d = await GET('/api/dashboard');
  const h = new Date().getHours();
  const hello = `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}, ${esc(state.user.name.split(' ')[0])}!`;
  const a = d.agenda;
  const setup = can.admin() && (!state.pros.length || !state.services.length);
  const upcoming = [...a.in_progress_list, ...a.waiting_list, ...a.late, ...a.next].filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i);
  const alerts = d.attention || [];

  root.innerHTML = `
  ${pageHead(hello, fmtDayLong(d.date), `<button class="btn primary" data-act="visit">${ic('plus', 18)} Novo agendamento</button>`)}
  <div data-pushbanner></div>
  ${setup ? setupCard() : ''}
  ${d.role === 'pro' ? proKpis(d) : ownerKpis(d)}
  <div class="grid g-main">
    <section class="card">
      <div class="card-head"><h2>Próximos atendimentos</h2><a class="btn sm ghost" href="#/agenda">Ver agenda ${ic('arrowRight', 16)}</a></div>
      ${upcoming.length ? `<ul class="list">${upcoming.map((v) => {
        const n = NEXT[v.status];
        return `<li><div class="tl-time" style="padding:0;width:50px">${v.start_at.slice(11)}</div>
          <div class="grow click" data-visit="${v.id}"><div class="title">${esc(v.client_name)}</div><div class="meta">${esc(v.services)}${can.solo() ? '' : ` · ${esc(v.pros)}`}</div></div>
          ${n ? `<button class="btn xs ${n[0] === 'checkout' ? 'ok' : 'soft'}" data-step="${n[0]}" data-id="${v.id}">${ic(n[2], 14)} ${n[1]}</button>` : badge(v.status)}</li>`;
      }).join('')}</ul>`
        : empty(a.total ? 'Todos os atendimentos de hoje já foram concluídos.' : 'Nenhum atendimento marcado para hoje.', `<button class="btn sm primary" data-act="visit">${ic('plus', 16)} Agendar</button>`, 'calendar')}
    </section>
    <div class="stack">
      <section class="card">
        <div class="card-head"><h2>Precisa de atenção</h2>${alerts.length > 4 ? `<button class="btn xs ghost" data-act="alerts">Ver todas (${alerts.length})</button>` : ''}</div>
        ${alerts.length ? alerts.slice(0, 4).map((x) => `<a class="alert ${x.level}" href="${x.link}"><span class="a-ic">${ic(ALERT_IC[x.type] || 'info', 18)}</span><span>${esc(x.text)}</span>${x.amount ? `<b>${money(x.amount)}</b>` : ''}</a>`).join('')
          : `<p class="small muted" style="display:flex;gap:8px;align-items:center">${ic('checkCircle', 18, 'ok-t')} Tudo em dia. Nada pendente agora.</p>`}
      </section>
      <section class="card">
        <h2>Atalhos</h2>
        <div class="quick" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          <button data-act="fit"><span class="q-ic">${ic('zap', 20)}</span>Encaixe</button>
          ${can.pro() ? '' : `<button data-act="sale"><span class="q-ic">${ic('cart', 20)}</span>Venda</button>`}
          <button data-act="client"><span class="q-ic">${ic('userPlus', 20)}</span>Cliente</button>
        </div>
      </section>
    </div>
  </div>`;

  pushBanner(root.querySelector('[data-pushbanner]'));
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
    } catch (err) {
      t.disabled = false;
      fail(err);
    }
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
