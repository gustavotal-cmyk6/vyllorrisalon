import { state, GET, esc, money, pct, periodPicker, mountPeriod, rangeLabel, fmtDate, fmtPhone, waLink, empty, bars, ic, avatar, pageHead, trend, can } from '../core.js';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ui = { pro: '' };

/** Respostas diretas às perguntas do dia a dia da gestão. */
export default async function reports(root) {
  root.innerHTML = `${pageHead('Relatórios', 'As respostas que a dona do salão precisa, sem planilha')}
    ${periodPicker('per')}
    <div class="chips scroll" style="margin:-4px 0 14px" ${can.solo() ? 'hidden' : ''}><button class="chip ${ui.pro ? '' : 'on'}" data-pro="">Salão inteiro</button>${state.pros.filter((p) => p.active).map((p) => `<button class="chip ${String(p.id) === ui.pro ? 'on' : ''}" data-pro="${p.id}">${esc(p.name.split(' ')[0])}</button>`).join('')}</div>
    <div data-body><div class="loading">Carregando…</div></div>`;
  let range;
  const load = async () => {
    const body = root.querySelector('[data-body]');
    body.innerHTML = '<div class="loading">Carregando…</div>';
    if (ui.pro) return proReport(body, range);
    const r = await GET(`/api/reports/management?from=${range.from}&to=${range.to}`);
    const s = r.sales, f = r.finance;
    const Q = (icon, q, a, sub = '') => `<div class="q"><span>${ic(icon, 16, 'brand-t')} ${q}</span><b>${a}</b>${sub}</div>`;
    const maxEv = Math.max(1, ...r.evolution.map((e) => Math.max(e.revenue, e.expenses)));
    body.innerHTML = `<div class="qa">
      ${Q('receipt', 'Faturamento', money(s.revenue), trend(r.change.revenue))}
      ${Q('sparkle', 'Lucro estimado', `<span class="${f.profit < 0 ? 'err-t' : 'ok-t'}">${money(f.profit)}</span>`, trend(r.change.profit))}
      ${Q('wallet', 'Despesas', money(f.expenses), `<small>pagas ${money(f.expenses_paid)} · em aberto ${money(f.expenses_open)}</small>`)}
      ${Q('percent', 'Comissões', money(f.commissions), `<small>pagas no período ${money(f.commissions_paid)}</small>`)}
      ${Q('heart', 'Ticket médio', money(s.ticket_avg), trend(r.change.ticket))}
      ${Q('scissors', 'Serviço mais vendido', r.top_service ? esc(r.top_service.name) : '—', r.top_service ? `<small>${r.top_service.qty} atendimento(s) · ${money(r.top_service.total)}</small>` : '')}
      ${Q('userPlus', 'Clientes novas', r.new_clients, '<small>cadastradas no período</small>')}
      ${Q('refresh', 'Clientes recorrentes', r.recurring_clients, '<small>voltaram 2 vezes ou mais no período</small>')}
      ${Q('alert', 'Clientes que não voltaram', r.lost_clients, `<small>sem visita há mais de ${r.inactive_days} dias</small>`)}
      ${Q('ban', 'Cancelamentos e faltas', `${r.visits.cancelled} · ${r.visits.no_show}`, `<small>de ${r.visits.total} agendamento(s)</small>`)}
    </div>
    <div class="card"><div class="card-head"><h2>Evolução do negócio</h2><span class="tiny muted">últimos 6 meses</span></div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;align-items:end;height:200px" role="img" aria-label="Faturamento e despesas dos últimos 6 meses">${r.evolution.map((e) => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end">
        <div style="display:flex;gap:4px;align-items:flex-end;height:100%;width:100%;justify-content:center" title="${money(e.revenue)} faturado · ${money(e.expenses)} em despesas">
          <div style="width:40%;max-width:26px;height:${(e.revenue / maxEv) * 100}%;min-height:2px;border-radius:8px 8px 0 0;background:linear-gradient(180deg,var(--brand-2),var(--brand))"></div>
          <div style="width:40%;max-width:26px;height:${(e.expenses / maxEv) * 100}%;min-height:2px;border-radius:8px 8px 0 0;background:var(--pink-2)"></div></div>
        <small class="muted" style="font-weight:700">${MONTHS[Number(e.month.slice(5)) - 1]}</small></div>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--brand)"></i>Faturamento</span><span><i style="background:var(--pink-2)"></i>Despesas</span></div></div>
    <div class="grid g2">
      <div class="card"><h2>Desempenho das profissionais</h2>${r.professionals.length ? `<div class="rank">${r.professionals.map((p, i) => `<div class="rank-row"><span class="pos">${i + 1}</span>${avatar(p.name, p.photo_url, 'sm')}<div style="flex:1;min-width:0">
        <div class="bar-top"><b class="small">${esc(p.name)}</b><b class="small">${money(p.total)}</b></div><div class="bar"><i style="width:${Math.max(4, (p.total / r.professionals[0].total) * 100)}%"></i></div>
        <span class="tiny muted">${p.services_count} atendimento(s) · comissão ${money(p.commission)}</span></div></div>`).join('')}</div>` : empty('Sem vendas no período.', '', 'users')}</div>
      <div class="card"><h2>Serviços mais vendidos</h2>${bars(r.services, { sub: (x) => `${x.qty} atendimento(s)` })}</div>
      <div class="card"><h2>Produtos vendidos</h2>${bars(r.products, { sub: (x) => `${String(x.qty).replace('.', ',')} unidade(s)` })}</div>
      <div class="card"><h2>Como o lucro é calculado</h2><table class="t"><tbody>
        <tr><td>Faturamento</td><td class="num">${money(f.revenue)}</td></tr><tr><td>− Custo dos produtos</td><td class="num err-t">${money(f.product_cost)}</td></tr>
        <tr><td>− Comissões geradas</td><td class="num err-t">${money(f.commissions)}</td></tr><tr><td>− Despesas</td><td class="num err-t">${money(f.expenses)}</td></tr>
        <tr><td><b>= Lucro estimado</b></td><td class="num"><b>${money(f.profit)}</b></td></tr></tbody></table>
        <p class="legend">Comparação com ${rangeLabel(r.previous)}.</p></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h2>Clientes para reconquistar</h2><span class="tiny muted">sem visita há +${r.inactive_days} dias, por valor gasto</span></div>
      ${r.lost_list.length ? `<ul class="list">${r.lost_list.map((c) => `<li>${avatar(c.name, null, 'sm')}<a class="grow" href="#/clientes/${c.id}" style="color:inherit"><div class="title">${esc(c.name)}</div>
        <div class="meta">última visita ${fmtDate(c.last_visit)} · ${c.visits} visita(s) · ${money(c.spent)}</div></a>
        ${waLink(c.phone) ? `<a class="btn xs soft" target="_blank" rel="noopener" href="${waLink(c.phone, `Olá, ${c.name.split(' ')[0]}! Sentimos sua falta por aqui. Que tal agendar um horário?`)}">${ic('whatsapp', 14)} Chamar</a>` : `<span class="muted small">${fmtPhone(c.phone)}</span>`}</li>`).join('')}</ul>` : empty('Nenhuma cliente sumida.', '', 'heart')}</div>`;
  };
  root.querySelectorAll('[data-pro]').forEach((b) => (b.onclick = () => {
    ui.pro = b.dataset.pro;
    root.querySelectorAll('[data-pro]').forEach((x) => x.classList.toggle('on', x === b));
    load();
  }));
  mountPeriod(root, 'per', (r) => ((range = r), load()));
}

async function proReport(body, range) {
  const p = state.pros.find((x) => String(x.id) === ui.pro);
  const [r, com] = await Promise.all([GET(`/api/reports/sales?from=${range.from}&to=${range.to}&professional_id=${ui.pro}`), GET(`/api/commissions?from=${range.from}&to=${range.to}`)]);
  const c = com.find((x) => String(x.id) === ui.pro) || {};
  const s = r.summary;
  body.innerHTML = `<div class="next-card" style="margin-bottom:14px">${avatar(p.name, p.photo_url, 'lg')}<div class="grow"><b style="font-size:1.1rem">${esc(p.name)}</b><div class="small muted">${esc(p.specialty || '')} · ${rangeLabel(range)}</div></div></div>
    <div class="kpis">
      <div class="kpi hl"><span class="k-ic">${ic('sparkle', 20)}</span><span>Produção</span><b>${money(s.revenue)}</b>${trend(r.compare.revenue)}</div>
      <div class="kpi"><span class="k-ic">${ic('scissors', 20)}</span><span>Atendimentos</span><b>${s.services_count}</b><small>${s.clients_served} cliente(s)</small></div>
      <div class="kpi"><span class="k-ic">${ic('heart', 20)}</span><span>Ticket médio</span><b>${money(s.ticket_avg)}</b></div>
      <div class="kpi"><span class="k-ic">${ic('percent', 20)}</span><span>Comissão gerada</span><b>${money(c.commission || 0)}</b><small>paga no período ${money(c.paid_in_period || 0)}</small></div></div>
    <div class="grid g2"><div class="card"><h2>Serviços realizados</h2>${bars(r.services, { sub: (x) => `${x.qty} atendimento(s)` })}</div>
      <div class="card"><h2>Produtos vendidos</h2>${bars(r.products, { sub: (x) => `${String(x.qty).replace('.', ',')} unidade(s)` })}</div></div>
    <p class="legend">Comparação com ${rangeLabel(r.previous)} · variação ${pct(r.compare.revenue)}.</p>`;
}
