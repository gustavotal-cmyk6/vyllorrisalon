import { state, GET, POST, esc, money, can, fmtDayLong, fmtDate, bars, empty, badge, ic, avatar, trend, pageHead, toast, fail } from '../core.js';
import { newVisit, openVisit } from './visits.js';
import { openCheckout, openSale } from './checkout.js';
import { quickClient } from './clients.js';
import { refresh } from '../app.js';

const ALERT_IC = { online: 'globe', late: 'clock', checkout: 'receipt', receivable: 'coin', confirm: 'message', stock: 'box', bills: 'wallet', birthday: 'heart' };
// próxima ação de cada status, direto na lista (sem abrir o agendamento)
const NEXT = { scheduled: ['confirmed', 'Confirmar', 'check'], confirmed: ['waiting', 'Chegou', 'user'], waiting: ['in_progress', 'Iniciar', 'play'], in_progress: ['checkout', 'Fechar conta', 'receipt'] };

export default async function dashboard(root) {
  const d = await GET('/api/dashboard');
  const h = new Date().getHours();
  const hello = `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}, ${esc(state.user.name.split(' ')[0])}!`;
  const a = d.agenda;
  const setup = can.admin() && (!state.pros.length || !state.services.length);
  const now = [...a.in_progress_list, ...a.waiting_list, ...a.late, ...a.next].filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i);
  const next = a.next[0] || a.late[0];

  root.innerHTML = `
  ${pageHead(hello, `${fmtDayLong(d.date)} · ${a.total} agendamento(s) hoje`, `<button class="btn primary" data-act="visit">${ic('plus', 18)} Novo agendamento</button>`)}
  ${setup ? `<div class="card" style="border:2px dashed var(--lav-300)"><div class="card-head"><h2>Vamos configurar seu salão</h2>${ic('sparkle', 22, 'brand-t')}</div>
    <div class="list">${[
      can.solo() ? [false, '#/config', 'Confira seus horários', 'dias e horários em que você atende'] : [state.pros.length, '#/equipe?nova=1', 'Cadastre sua equipe', 'cabeleireiras, manicures… com horários e comissão'],
      [state.services.length, '#/servicos?novo=1', 'Cadastre os serviços', 'com preço, duração e quem faz'],
      [false, '#/config', 'Personalize a página de agendamento', 'logo, fotos, endereço e link para as clientes'],
    ].map(([done, href, t, s]) => `<a href="${href}" style="display:flex;gap:12px;align-items:center;padding:10px 0;color:inherit">
      <span class="avatar sm" style="background:${done ? 'var(--ok)' : 'var(--lav-200)'};color:${done ? '#fff' : 'var(--brand)'}">${ic(done ? 'check' : 'arrowRight', 16)}</span>
      <span class="grow"><b>${t}</b><br><span class="small muted">${s}</span></span>${ic('chevRight', 18, 'chev')}</a>`).join('')}</div></div>` : ''}
  ${d.role === 'pro' ? proKpis(d) : ownerKpis(d)}
  <div class="grid g-main">
    <div class="stack">
      <div class="card">
        <div class="card-head"><h2>Agenda de hoje</h2><a class="btn sm soft" href="#/agenda">Ver agenda ${ic('arrowRight', 16)}</a></div>
        ${next ? `<div class="next-card" style="margin-bottom:12px">${avatar(next.client_name, null, 'lg')}<div class="grow"><span class="tiny muted" style="font-weight:700;text-transform:uppercase;letter-spacing:.06em">Próximo atendimento</span>
          <div style="font-weight:800;font-size:1.05rem">${esc(next.client_name)}</div><div class="small muted">${esc(next.services)} · ${esc(next.pros)}</div></div>
          <div class="right"><div class="serif" style="font-size:1.5rem;font-weight:700;color:var(--brand)">${next.start_at.slice(11)}</div>${badge(next.status)}</div></div>` : ''}
        <div class="stat-row" style="margin-bottom:10px">
          <div><span>Concluídos</span><b>${a.completed}</b></div><div><span>Em atendimento</span><b>${a.in_progress}</b></div>
          <div><span>Aguardando</span><b>${a.waiting + a.scheduled + a.confirmed}</b></div><div><span>Cancel. / faltas</span><b>${a.cancelled + a.no_show}</b></div></div>
        ${now.length ? `<ul class="list">${now.map((v) => {
          const n = NEXT[v.status];
          return `<li><div class="tl-time" style="padding:0;width:48px">${v.start_at.slice(11)}</div>
            <div class="grow click" data-visit="${v.id}"><div class="title">${esc(v.client_name)}</div><div class="meta">${esc(v.services)} · ${esc(v.pros)}</div></div>
            ${badge(v.status)}${n && (n[0] !== 'checkout' || can.staff() || can.pro()) ? `<button class="btn xs ${n[0] === 'checkout' ? 'ok' : 'soft'}" data-step="${n[0]}" data-id="${v.id}">${ic(n[2], 14)} ${n[1]}</button>` : ''}</li>`;
        }).join('')}</ul>` : empty('Nenhum atendimento pendente para hoje.', `<button class="btn sm primary" data-act="visit">${ic('plus', 16)} Agendar</button>`, 'calendar')}
      </div>
      ${d.chart ? `<div class="card"><div class="card-head"><h2>Faturamento do mês</h2>${trend(d.month.change_revenue, ' vs. mês passado')}</div>${chart(d.chart)}
        <div class="legend"><span><i style="background:var(--brand)"></i>Este mês (acumulado)</span><span><i style="background:var(--lav-400)"></i>Mês passado</span></div></div>` : ''}
    </div>
    <div class="stack">
      <div class="card"><h2>Ações rápidas</h2>
        <div class="quick">
          <button data-act="visit"><span class="q-ic">${ic('calendar', 20)}</span>Agendar</button>
          <button data-act="client"><span class="q-ic">${ic('userPlus', 20)}</span>Cliente</button>
          ${can.pro() ? '' : `<button data-act="sale"><span class="q-ic">${ic('cart', 20)}</span>Venda</button>`}
          ${can.admin() ? `<button data-act="service"><span class="q-ic">${ic('scissors', 20)}</span>Serviço</button>${can.solo() ? `<button data-act="fit"><span class="q-ic">${ic('zap', 20)}</span>Encaixe</button>` : `<button data-act="pro"><span class="q-ic">${ic('sparkle', 20)}</span>Profissional</button>`}`
            : `<button data-act="fit"><span class="q-ic">${ic('zap', 20)}</span>Encaixe</button>`}
        </div></div>
      ${d.attention ? `<div class="card"><div class="card-head"><h2>Alertas importantes</h2>${d.attention.length ? `<span class="tag pink">${d.attention.length}</span>` : ''}</div>
        ${d.attention.length ? d.attention.map((x) => `<a class="alert ${x.level}" href="${x.link}"><span class="a-ic">${ic(ALERT_IC[x.type] || 'info', 18)}</span><span>${esc(x.text)}</span>${x.amount ? `<b>${money(x.amount)}</b>` : ''}</a>`).join('')
          : `<div class="empty" style="padding:14px"><div class="e-ic">${ic('checkCircle', 24)}</div><p class="small">Tudo em dia. Nenhum alerta agora.</p></div>`}</div>` : ''}
      <div class="card"><div class="card-head"><h2>Horários livres hoje</h2>${ic('clock', 20, 'brand-t')}</div>
        ${d.free.length ? `<ul class="list">${d.free.map((p) => `<li>${avatar(p.name, state.pros.find((x) => x.id === p.id)?.photo_url, 'sm')}<div class="grow"><div class="title">${esc(p.name)}</div>
          <div class="meta">${p.slots ? `${p.slots} horário(s) livres · próximo às ${p.next}` : 'Agenda cheia ou fora do expediente'}</div></div>
          ${p.next ? `<button class="btn xs soft" data-book="${p.id}" data-time="${p.next}">${p.next}</button>` : ''}</li>`).join('')}</ul>` : empty('Nenhuma profissional ativa.', '', 'users')}</div>
    </div>
  </div>
  ${d.role !== 'pro' ? `<div class="grid g3" style="margin-top:16px">
    <div class="card" ${can.solo() ? 'hidden' : ''}><div class="card-head"><h2>Desempenho da equipe</h2><span class="tiny muted">no mês</span></div>
      ${d.top_pros.length ? `<div class="rank">${d.top_pros.map((p, i) => `<div class="rank-row">${avatar(p.name, p.photo_url, 'sm')}<div style="flex:1;min-width:0">
        <div class="bar-top"><b class="small">${esc(p.name)}</b><b class="small">${money(p.total)}</b></div>
        <div class="bar"><i style="width:${Math.max(4, (p.total / d.top_pros[0].total) * 100)}%"></i></div><span class="tiny muted">${p.services_count} atendimento(s)</span></div></div>`).join('')}</div>` : empty('Sem vendas no mês ainda.', '', 'chart')}</div>
    <div class="card"><div class="card-head"><h2>Serviços mais procurados</h2><span class="tiny muted">no mês</span></div>${bars(d.top_services, { sub: (r) => `${r.qty} atendimento(s)` })}</div>
    <div class="card"><div class="card-head"><h2>Movimentações recentes</h2>${can.admin() ? `<a class="btn xs soft" href="#/financeiro">Ver todas</a>` : ''}</div>
      ${d.recent.length ? `<ul class="list">${d.recent.map((m) => `<li ${m.sale_id ? `class="click" data-sale="${m.sale_id}"` : ''}>
        <span class="avatar sm" style="background:${m.dir === 'in' ? 'var(--ok-soft)' : 'var(--err-soft)'};color:${m.dir === 'in' ? 'var(--ok)' : 'var(--err)'}">${ic(m.dir === 'in' ? 'trendUp' : 'trendDown', 16)}</span>
        <div class="grow"><div class="title small">${esc(m.label)}</div><div class="meta">${esc(m.detail || m.method || '')} · ${fmtDate(m.at)}</div></div>
        <b class="small ${m.dir === 'in' ? 'ok-t' : 'err-t'}">${m.dir === 'in' ? '+' : '−'} ${money(m.amount)}</b></li>`).join('')}</ul>` : empty('Nenhuma movimentação ainda.', '', 'wallet')}</div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="card-head"><h2>Pagamentos pendentes</h2><b class="warn-t">${money(d.receivable)}</b></div>
      ${d.pending_sales.length ? `<ul class="list">${d.pending_sales.map((s) => `<li class="click" data-sale="${s.id}">${avatar(s.client_name || '?', null, 'sm')}<div class="grow"><div class="title">${esc(s.client_name || 'Sem cliente')}</div>
        <div class="meta">venda de ${fmtDate(s.created_at)}</div></div><b class="warn-t">${money(s.pending_cents)}</b></li>`).join('')}</ul>
        <a class="btn sm soft block" href="#/vendas?pendentes=1" style="margin-top:8px">Ver todos a receber</a>` : empty('Nenhum valor pendente.', '', 'checkCircle')}</div>
    <div class="card"><div class="card-head"><h2>Estoque baixo</h2><a class="btn xs soft" href="#/estoque">Estoque</a></div>
      ${d.low_stock.length ? `<ul class="list">${d.low_stock.map((p) => `<li><span class="avatar sm" style="background:var(--warn-soft);color:var(--warn)">${ic('box', 16)}</span>
        <div class="grow"><div class="title">${esc(p.name)}</div><div class="meta">mínimo ${p.min_stock} ${esc(p.unit)}</div></div><span class="tag err">${p.stock} ${esc(p.unit)}</span></li>`).join('')}</ul>` : empty('Nenhum produto abaixo do mínimo.', '', 'box')}</div>
  </div>` : ''}`;

  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act],[data-step],[data-visit],[data-book],[data-sale]');
    if (!t) return;
    try {
      if (t.dataset.visit) return openVisit(Number(t.dataset.visit), refresh);
      if (t.dataset.sale) return openSale(Number(t.dataset.sale), refresh);
      if (t.dataset.book) return newVisit({ proId: Number(t.dataset.book), time: t.dataset.time, onSaved: refresh });
      if (t.dataset.step) {
        if (t.dataset.step === 'checkout') return openCheckout({ visit: await GET(`/api/visits/${t.dataset.id}`), onDone: refresh });
        t.disabled = true;
        await POST(`/api/visits/${t.dataset.id}/status`, { status: t.dataset.step });
        toast('Status atualizado');
        return refresh();
      }
      const act = t.dataset.act;
      if (act === 'visit') newVisit({ onSaved: refresh });
      if (act === 'fit') newVisit({ fitIn: true, onSaved: refresh });
      if (act === 'sale') openCheckout({ onDone: refresh });
      if (act === 'client') quickClient({ onSaved: (id) => (location.hash = `#/clientes/${id}`) });
      if (act === 'service') location.hash = '#/servicos?novo=1';
      if (act === 'pro') location.hash = '#/equipe?nova=1';
    } catch (err) {
      t.disabled = false;
      fail(err);
    }
  });
}

/** Gráfico de área: faturamento acumulado no mês vs. mês anterior. */
function chart({ current, previous, days_in_month: days }) {
  const W = 640, H = 210, P = 28;
  const max = Math.max(1, ...current, ...previous);
  const x = (i) => P + (i / Math.max(1, days - 1)) * (W - P * 2);
  const y = (v) => H - P - (v / max) * (H - P * 2);
  const line = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const cur = line(current);
  const area = current.length ? `${cur} L${x(current.length - 1).toFixed(1)},${H - P} L${x(0)},${H - P} Z` : '';
  const last = current.length - 1;
  return `<div class="chart-box"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Faturamento acumulado do mês: ${money(current[last] || 0)}">
    <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a2fd0" stop-opacity=".35"/><stop offset="1" stop-color="#7a2fd0" stop-opacity="0"/></linearGradient></defs>
    ${[0.25, 0.5, 0.75, 1].map((f) => `<line x1="${P}" x2="${W - P}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="#ece3f7" stroke-dasharray="3 5"/>`).join('')}
    <path d="${line(previous)}" fill="none" stroke="#c6a4f1" stroke-width="2" stroke-dasharray="5 5"/>
    ${area ? `<path d="${area}" fill="url(#ga)"/><path d="${cur}" fill="none" stroke="#5b17a6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${x(last)}" cy="${y(current[last])}" r="6" fill="#fff" stroke="#d63d92" stroke-width="3"/>` : ''}
    <text x="${P}" y="${H - 6}" font-size="11" fill="#6b5f7e">dia 1</text><text x="${W - P}" y="${H - 6}" font-size="11" fill="#6b5f7e" text-anchor="end">dia ${days}</text>
    <text x="${P}" y="${y(max) - 6}" font-size="11" fill="#6b5f7e">${money(max)}</text>
  </svg></div>`;
}

function ownerKpis(d) {
  const a = d.agenda;
  const pend = a.scheduled + a.confirmed + a.waiting + a.in_progress;
  return `<div class="kpis">
    <div class="kpi hl"><span class="k-ic">${ic('dollar', 20)}</span><span>Receita do dia</span><b>${money(d.today.revenue)}</b><small>recebido ${money(d.today.received)}</small></div>
    <div class="kpi"><span class="k-ic">${ic('calendar', 20)}</span><span>Agendamentos hoje</span><b>${a.total}</b>
      <div class="mini-progress" aria-hidden="true"><i style="width:${a.total ? (a.completed / a.total) * 100 : 0}%;background:var(--ok)"></i><i style="width:${a.total ? (pend / a.total) * 100 : 0}%;background:var(--lav-400)"></i></div>
      <small>${a.completed} concluído(s) · ${pend} pendente(s)</small></div>
    <div class="kpi"><span class="k-ic">${ic('trendUp', 20)}</span><span>Faturamento do mês</span><b>${money(d.month.revenue)}</b>${trend(d.month.change_revenue)}</div>
    <div class="kpi"><span class="k-ic">${ic('coin', 20)}</span><span>A receber</span><b>${money(d.receivable)}</b><small>de clientes com pagamento pendente</small></div>
  </div>`;
}
function proKpis(d) {
  return `<div class="kpis">
    <div class="kpi hl"><span class="k-ic">${ic('sparkle', 20)}</span><span>Minha produção no mês</span><b>${money(d.month.produced)}</b></div>
    <div class="kpi"><span class="k-ic">${ic('percent', 20)}</span><span>Minha comissão no mês</span><b>${money(d.month.commission)}</b></div>
    <div class="kpi"><span class="k-ic">${ic('calendar', 20)}</span><span>Meus atendimentos hoje</span><b>${d.agenda.total}</b></div>
    <div class="kpi"><span class="k-ic">${ic('checkCircle', 20)}</span><span>Concluídos hoje</span><b>${d.agenda.completed}</b></div></div>`;
}
