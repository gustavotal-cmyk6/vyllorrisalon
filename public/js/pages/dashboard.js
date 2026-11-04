import { state, GET, esc, money, pct, can, fmtDayLong, bars, empty, badge } from '../core.js';
import { newVisit, openVisit } from './visits.js';
import { openCheckout } from './checkout.js';
import { quickClient } from './clients.js';
import { refresh } from '../app.js';

export default async function dashboard(root) {
  const d = await GET('/api/dashboard');
  const reload = refresh;
  const hello = `${new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite'}, ${esc(state.user.name.split(' ')[0])}`;
  const a = d.agenda;
  const setup = can.owner() && (!state.pros.length || !state.services.length);
  const visitRow = (v, extra = '') => `<li class="click" data-visit="${v.id}"><div class="avatar">${v.start_at.slice(11)}</div>
    <div class="grow"><div class="title">${esc(v.client_name)}</div><div class="meta">${esc(v.services)} · ${esc(v.pros)}</div></div>${extra || badge(v.status)}</li>`;

  root.innerHTML = `
  <div class="page-head"><div><h1>${hello}</h1><div class="sub">${fmtDayLong(d.date)}</div></div></div>
  ${setup ? `<div class="card" style="border:2px dashed var(--accent)"><h2>Vamos configurar seu salão</h2>
    <ol class="small" style="margin:0 0 10px;padding-left:18px;line-height:1.9">
      <li>${state.pros.length ? '✓' : ''} <a href="#/equipe">Cadastre sua equipe</a> (cabeleireiras, manicures…), com horários e comissão</li>
      <li>${state.services.length ? '✓' : ''} <a href="#/servicos">Cadastre os serviços</a> com preço e duração</li>
      <li><a href="#/estoque">Cadastre produtos</a> (opcional) e comece a agendar!</li></ol></div>` : ''}
  <div class="quick">
    <button data-act="visit"><span class="ico">📅</span>Agendar</button>
    <button data-act="fit"><span class="ico">⚡</span>Encaixe</button>
    <button data-act="sale"><span class="ico">🧾</span>Venda</button>
    <button data-act="client"><span class="ico">👩</span>Cliente</button>
  </div>
  ${d.role === 'pro' ? proKpis(d) : ownerKpis(d)}
  ${d.attention?.length ? `<div class="card"><h2>Precisa de atenção</h2>${d.attention.map((x) => `<a class="alert ${x.level}" href="${x.link}">${esc(x.text)}${x.amount ? `<b>${money(x.amount)}</b>` : ''}</a>`).join('')}</div>` : ''}
  <div class="grid g2">
    <div class="card"><h2>Agora no salão <a class="btn sm ghost" href="#/agenda">Agenda →</a></h2>
      <div class="stat-row" style="margin-bottom:10px">
        <div><span>Confirmados</span><b>${a.confirmed}</b></div><div><span>A confirmar</span><b>${a.scheduled}</b></div>
        <div><span>Aguardando</span><b>${a.waiting}</b></div><div><span>Concluídos</span><b>${a.completed}</b></div></div>
      ${a.in_progress_list.length ? `<h3>Em atendimento</h3><ul class="list">${a.in_progress_list.map((v) => visitRow(v, `<button class="btn sm ok" data-act="checkout" data-id="${v.id}">Fechar conta</button>`)).join('')}</ul>` : ''}
      ${a.waiting_list.length ? `<h3 style="margin-top:8px">Aguardando atendimento</h3><ul class="list">${a.waiting_list.map((v) => visitRow(v)).join('')}</ul>` : ''}
      ${a.late.length ? `<h3 style="margin-top:8px" class="warn-t">Atrasadas / sem chegada</h3><ul class="list">${a.late.map((v) => visitRow(v)).join('')}</ul>` : ''}
      <h3 style="margin-top:8px">Próximas</h3>
      ${a.next.length ? `<ul class="list">${a.next.map((v) => visitRow(v)).join('')}</ul>` : empty('Nenhum outro agendamento hoje.')}
      ${a.cancelled || a.no_show ? `<p class="small muted">Hoje: ${a.cancelled} cancelamento(s) · ${a.no_show} falta(s)</p>` : ''}
    </div>
    <div class="card"><h2>Horários livres hoje</h2>
      ${d.free.length ? `<ul class="list">${d.free.map((p) => `<li><span class="dot" style="background:${esc(p.color)}"></span><div class="grow"><div class="title">${esc(p.name)}</div>
        <div class="meta">${p.slots ? `${p.slots} horário(s) de 30 min · próximo às ${p.next}` : 'Agenda cheia ou fora do expediente'}</div></div>
        ${p.next ? `<button class="btn sm" data-act="book" data-pro="${p.id}" data-time="${p.next}">Agendar ${p.next}</button>` : ''}</li>`).join('')}</ul>` : empty('Nenhuma profissional ativa.')}
    </div>
  </div>
  ${d.role !== 'pro' ? `<div class="grid g2">
    <div class="card"><h2>Serviços mais vendidos <small class="muted">no mês</small></h2>${bars(d.top_services, { sub: (r) => `${r.qty} atendimento(s)` })}</div>
    <div class="card"><h2>Profissionais que mais faturaram <small class="muted">no mês</small></h2>${bars(d.top_pros, { sub: (r) => `${r.services_count} atendimento(s)` })}</div>
  </div>` : ''}`;

  root.querySelectorAll('[data-visit]').forEach((li) => li.addEventListener('click', (e) => !e.target.closest('button') && openVisit(Number(li.dataset.visit), reload)));
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'visit') newVisit({ onSaved: reload });
    if (act === 'fit') newVisit({ fitIn: true, onSaved: reload });
    if (act === 'sale') openCheckout({ onDone: reload });
    if (act === 'client') quickClient({ onSaved: (id) => (location.hash = `#/clientes/${id}`) });
    if (act === 'book') newVisit({ proId: Number(b.dataset.pro), time: b.dataset.time, onSaved: reload });
    if (act === 'checkout') {
      const v = await GET(`/api/visits/${b.dataset.id}`);
      openCheckout({ visit: v, onDone: reload });
    }
  });
}

function ownerKpis(d) {
  const ch = d.month.change_revenue;
  return `<div class="kpis">
    <div class="kpi hl"><span>Faturamento hoje</span><b>${money(d.today.revenue)}</b><small>recebido ${money(d.today.received)}</small></div>
    <div class="kpi"><span>Atendimentos hoje</span><b>${d.today.services_count}</b><small>${d.agenda.total} agendamento(s) no dia</small></div>
    <div class="kpi"><span>Faturamento no mês</span><b>${money(d.month.revenue)}</b>
      <small class="${ch > 0 ? 'up' : ch < 0 ? 'down' : ''}">${ch == null ? 'sem base no mês anterior' : `${pct(ch)} vs. mesmo período do mês passado`}</small></div>
    <div class="kpi"><span>A receber</span><b>${money(d.receivable)}</b><small>vendas com pagamento pendente</small></div>
    <div class="kpi"><span>Ticket médio (mês)</span><b>${money(d.month.ticket_avg)}</b><small>${d.month.clients_served} cliente(s) atendida(s)</small></div>
    <div class="kpi"><span>Serviços × produtos (mês)</span><b>${money(d.month.revenue_services)}</b><small>+ ${money(d.month.revenue_products)} em produtos</small></div>
    <div class="kpi"><span>Cancelamentos (mês)</span><b>${d.month.cancelled}</b><small>agendamentos cancelados</small></div>
    <div class="kpi"><span>Faltas (mês)</span><b>${d.month.no_show}</b><small>clientes que não vieram</small></div>
  </div>`;
}
function proKpis(d) {
  return `<div class="kpis">
    <div class="kpi hl"><span>Minha produção no mês</span><b>${money(d.month.produced)}</b></div>
    <div class="kpi"><span>Minha comissão no mês</span><b>${money(d.month.commission)}</b></div>
    <div class="kpi"><span>Meus atendimentos hoje</span><b>${d.agenda.total}</b></div>
    <div class="kpi"><span>Concluídos hoje</span><b>${d.agenda.completed}</b></div></div>`;
}
