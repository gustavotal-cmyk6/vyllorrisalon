import { state, GET, esc, money, periodPicker, mountPeriod, rangeLabel, fmtDate, fmtPhone, waLink, empty, bars, ic, avatar, pageHead, trend, can } from '../core.js';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ui = { tab: 'summary', pro: '' };

/** Relatórios separados por assunto; cada aba responde a uma pergunta da dona do salão. */
export default async function reports(root) {
  const TABS = [['summary', 'Resumo'], ['sales', 'Vendas'], ...(can.solo() ? [] : [['team', 'Equipe']]), ['clients', 'Clientes'], ['costs', 'Despesas']];
  if (!TABS.some(([k]) => k === ui.tab)) ui.tab = 'summary';
  root.innerHTML = `${pageHead('Relatórios', 'Como o seu negócio está indo')}
    <div class="tabs">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${ui.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${periodPicker('per')}<div data-body><div class="loading">Carregando…</div></div>`;
  let range;
  const body = root.querySelector('[data-body]');
  const load = async () => {
    body.innerHTML = '<div class="loading">Carregando…</div>';
    try {
      await { summary, sales, team, clients, costs }[ui.tab](body, range);
    } catch (e) {
      body.innerHTML = `<div class="card">${empty(e.message, '', 'alert')}</div>`;
    }
  };
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => {
    ui.tab = b.dataset.tab;
    root.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
    load();
  }));
  mountPeriod(root, 'per', (r) => ((range = r), load()));
}

const mgmt = (r) => GET(`/api/reports/management?from=${r.from}&to=${r.to}`);

async function summary(body, range) {
  const r = await mgmt(range);
  const s = r.sales, f = r.finance;
  const Q = (q, a, sub = '') => `<div class="q"><span>${q}</span><b>${a}</b>${sub}</div>`;
  const maxEv = Math.max(1, ...r.evolution.map((e) => Math.max(e.revenue, e.expenses)));
  body.innerHTML = `<div class="qa">
      ${Q('Quanto vendi?', money(s.revenue), trend(r.change.revenue, ' vs. período anterior'))}
      ${Q('Quanto lucrei (estimado)?', `<span class="${f.profit < 0 ? 'err-t' : 'ok-t'}">${money(f.profit)}</span>`, `${trend(r.change.profit)}<br><small>vendas − custo dos produtos − comissões − despesas</small>`)}
      ${Q('Quanto gastei?', money(f.expenses), `<small>contas pagas ou a pagar no período</small>`)}
      ${Q('Quanto cada cliente gastou, em média?', money(s.ticket_avg), trend(r.change.ticket))}
    </div>
    <div class="card"><div class="card-head"><h2>Vendas e despesas nos últimos 6 meses</h2></div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;align-items:end;height:190px" role="img" aria-label="Vendas e despesas dos últimos 6 meses">${r.evolution.map((e) => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end">
        <div style="display:flex;gap:4px;align-items:flex-end;height:100%;width:100%;justify-content:center" title="${money(e.revenue)} vendidos · ${money(e.expenses)} em despesas">
          <div style="width:40%;max-width:24px;height:${(e.revenue / maxEv) * 100}%;min-height:2px;border-radius:8px 8px 0 0;background:linear-gradient(180deg,var(--brand-2),var(--brand))"></div>
          <div style="width:40%;max-width:24px;height:${(e.expenses / maxEv) * 100}%;min-height:2px;border-radius:8px 8px 0 0;background:var(--pink-2)"></div></div>
        <small class="muted" style="font-weight:700">${MONTHS[Number(e.month.slice(5)) - 1]}</small></div>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--brand)"></i>Vendas</span><span><i style="background:var(--pink-2)"></i>Despesas</span></div></div>
    <p class="legend">Comparação com ${rangeLabel(r.previous)}.</p>`;
}

async function sales(body, range) {
  const r = await GET(`/api/reports/sales?from=${range.from}&to=${range.to}`);
  body.innerHTML = `<div class="kpis three">
      <div class="kpi hl"><span>Vendido</span><b>${money(r.summary.revenue)}</b>${trend(r.compare.revenue)}</div>
      <div class="kpi"><span>Em serviços</span><b>${money(r.summary.revenue_services)}</b></div>
      <div class="kpi"><span>Em produtos</span><b>${money(r.summary.revenue_products)}</b></div></div>
    <div class="grid g2">
      <div class="card"><h2>Serviços que mais venderam</h2>${bars(r.services.slice(0, 8), { sub: (x) => `${x.qty} atendimento(s)` })}</div>
      <div class="card"><h2>Produtos que mais venderam</h2>${bars(r.products.slice(0, 8), { sub: (x) => `${String(x.qty).replace('.', ',')} unidade(s)` })}</div>
      <div class="card"><h2>Como as clientes pagaram</h2>${bars(r.methods, { label: (x) => x.method, sub: (x) => `${x.n} pagamento(s)` })}</div>
      <div class="card"><h2>Vendas por tipo de serviço</h2>${bars(r.categories, { sub: (x) => `${x.qty} atendimento(s)` })}</div>
    </div>
    ${r.summary.discounts ? `<p class="legend">Descontos dados no período: ${money(r.summary.discounts)}.</p>` : ''}`;
}

async function team(body, range) {
  const pros = state.pros.filter((p) => p.active);
  body.innerHTML = `<div class="chips scroll" style="margin-bottom:14px"><button class="chip ${ui.pro ? '' : 'on'}" data-pro="">Todas</button>${pros.map((p) => `<button class="chip ${String(p.id) === ui.pro ? 'on' : ''}" data-pro="${p.id}">${esc(p.name.split(' ')[0])}</button>`).join('')}</div><div data-in></div>`;
  body.querySelectorAll('[data-pro]').forEach((b) => (b.onclick = () => ((ui.pro = b.dataset.pro), team(body, range))));
  const box = body.querySelector('[data-in]');
  if (!ui.pro) {
    const r = await mgmt(range);
    box.innerHTML = `<div class="card"><h2>Quem mais vendeu</h2>${r.professionals.length ? `<div class="rank">${r.professionals.map((p, i) => `<div class="rank-row"><span class="pos">${i + 1}</span>${avatar(p.name, p.photo_url, 'sm')}<div style="flex:1;min-width:0">
      <div class="bar-top"><b class="small">${esc(p.name)}</b><b class="small">${money(p.total)}</b></div><div class="bar"><i style="width:${Math.max(4, (p.total / r.professionals[0].total) * 100)}%"></i></div>
      <span class="tiny muted">${p.services_count} atendimento(s) · comissão ${money(p.commission)}</span></div></div>`).join('')}</div>` : empty('Nenhuma venda no período.', '', 'users')}</div>`;
    return;
  }
  const p = state.pros.find((x) => String(x.id) === ui.pro);
  const [r, com] = await Promise.all([GET(`/api/reports/sales?from=${range.from}&to=${range.to}&professional_id=${ui.pro}`), GET(`/api/commissions?from=${range.from}&to=${range.to}`)]);
  const c = com.find((x) => String(x.id) === ui.pro) || {};
  box.innerHTML = `<div class="kpis three">
      <div class="kpi hl"><span>${esc(p.name.split(' ')[0])} vendeu</span><b>${money(r.summary.revenue)}</b>${trend(r.compare.revenue)}</div>
      <div class="kpi"><span>Atendimentos</span><b>${r.summary.services_count}</b><small>${r.summary.clients_served} cliente(s)</small></div>
      <div class="kpi"><span>Comissão gerada</span><b>${money(c.commission || 0)}</b><small>paga no período ${money(c.paid_in_period || 0)}</small></div></div>
    <div class="card"><h2>Serviços que ${esc(p.name.split(' ')[0])} mais fez</h2>${bars(r.services, { sub: (x) => `${x.qty} atendimento(s)` })}</div>`;
}

async function clients(body, range) {
  const r = await mgmt(range);
  body.innerHTML = `<div class="kpis three">
      <div class="kpi"><span>Clientes novas</span><b>${r.new_clients}</b><small>cadastradas no período</small></div>
      <div class="kpi"><span>Voltaram mais de uma vez</span><b>${r.recurring_clients}</b><small>no período</small></div>
      <div class="kpi"><span>Não voltaram</span><b>${r.lost_clients}</b><small>há mais de ${r.inactive_days} dias sem vir</small></div></div>
    <div class="card"><div class="card-head"><h2>Clientes para chamar de volta</h2><span class="tiny muted">quem mais gastou primeiro</span></div>
      ${r.lost_list.length ? `<ul class="list">${r.lost_list.map((c) => `<li>${avatar(c.name, null, 'sm')}<a class="grow" href="#/clientes/${c.id}" style="color:inherit"><div class="title">${esc(c.name)}</div>
        <div class="meta">última visita ${fmtDate(c.last_visit)} · ${money(c.spent)} no total</div></a>
        ${waLink(c.phone) ? `<a class="btn xs soft" target="_blank" rel="noopener" href="${waLink(c.phone, `Olá, ${c.name.split(' ')[0]}! Sentimos sua falta por aqui. Que tal agendar um horário?`)}">${ic('whatsapp', 14)} Chamar</a>` : `<span class="muted small">${fmtPhone(c.phone)}</span>`}</li>`).join('')}</ul>`
        : empty('Nenhuma cliente sumida. Ótimo sinal!', '', 'heart')}</div>
    <p class="legend">Cancelamentos e faltas no período: ${r.visits.cancelled} · ${r.visits.no_show} (de ${r.visits.total} agendamentos).</p>`;
}

async function costs(body, range) {
  const r = await mgmt(range);
  const f = r.finance;
  body.innerHTML = `<div class="kpis three">
      <div class="kpi"><span>Despesas</span><b>${money(f.expenses)}</b><small>pagas ${money(f.expenses_paid)} · a pagar ${money(f.expenses_open)}</small></div>
      <div class="kpi"><span>Comissões geradas</span><b>${money(f.commissions)}</b><small>pagas ${money(f.commissions_paid)}</small></div>
      <div class="kpi"><span>Custo dos produtos vendidos</span><b>${money(f.product_cost)}</b></div></div>
    <div class="card"><h2>Para onde foi o dinheiro</h2>${bars(f.expenses_by_category, { label: (x) => x.category })}</div>`;
}
