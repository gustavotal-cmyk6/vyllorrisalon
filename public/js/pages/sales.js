import { GET, esc, money, pct, periodPicker, mountPeriod, rangeLabel, bars, empty, fmtDate, fmtShort } from '../core.js';
import { openCheckout, openSale, receive } from './checkout.js';
import { refresh } from '../app.js';

const ui = { tab: 'panel', period: 'month' };

export default async function sales(root, { query }) {
  if (query.pendentes && !ui.fromLink) (ui.tab = 'pending'), (ui.fromLink = true);
  root.innerHTML = `<div class="page-head"><div><h1>Vendas</h1><div class="sub">Serviços e produtos vendidos, recebimentos e pendências</div></div>
    <button class="btn primary" data-new>＋ Registrar venda</button></div>
    <div class="tabs"><button data-tab="panel" class="${ui.tab === 'panel' ? 'on' : ''}">Painel</button><button data-tab="list" class="${ui.tab === 'list' ? 'on' : ''}">Lançamentos</button><button data-tab="pending" class="${ui.tab === 'pending' ? 'on' : ''}">A receber</button></div>
    ${ui.tab !== 'pending' ? periodPicker('per', ui.period) : ''}<div data-body><div class="loading">Carregando…</div></div>`;
  root.querySelector('[data-new]').onclick = () => openCheckout({ onDone: refresh });
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ((ui.tab = b.dataset.tab), refresh())));
  root.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => (ui.period = b.dataset.p)));
  const body = root.querySelector('[data-body]');
  if (ui.tab === 'pending') return pending(body);
  mountPeriod(root, 'per', (r) => (ui.tab === 'panel' ? panel(body, r) : list(body, r)), ui.period === 'custom' ? 'month' : ui.period);
}

async function panel(body, range) {
  body.innerHTML = '<div class="loading">Carregando…</div>';
  const r = await GET(`/api/reports/sales?from=${range.from}&to=${range.to}`);
  const s = r.summary, c = r.compare;
  const delta = (k) => (c[k] == null ? '' : `<small class="${c[k] > 0 ? 'up' : c[k] < 0 ? 'down' : ''}">${pct(c[k])} vs. período anterior</small>`);
  const maxDay = Math.max(...r.daily.map((d) => d.total), 1);
  body.innerHTML = `
  <div class="kpis">
    <div class="kpi hl"><span>Faturamento total</span><b>${money(s.revenue)}</b>${delta('revenue')}</div>
    <div class="kpi"><span>Serviços</span><b>${money(s.revenue_services)}</b>${delta('revenue_services')}</div>
    <div class="kpi"><span>Produtos</span><b>${money(s.revenue_products)}</b>${delta('revenue_products')}</div>
    <div class="kpi"><span>Atendimentos vendidos</span><b>${s.services_count}</b>${delta('services_count')}</div>
    <div class="kpi"><span>Ticket médio por cliente</span><b>${money(s.ticket_avg)}</b>${delta('ticket_avg')}</div>
    <div class="kpi"><span>Descontos concedidos</span><b>${money(s.discounts)}</b><small>${s.revenue ? ((s.discounts / (s.revenue + s.discounts)) * 100).toFixed(1).replace('.', ',') + '% do bruto' : ''}</small></div>
    <div class="kpi"><span>Recebido das vendas do período</span><b>${money(s.received_of_period)}</b><small>entrou no caixa no período: ${money(r.received_in_period)}</small></div>
    <div class="kpi"><span>Pendente das vendas do período</span><b class="${s.pending_of_period ? 'warn-t' : ''}">${money(s.pending_of_period)}</b><small>${s.sales_count} venda(s) · ${s.clients_served} cliente(s)</small></div>
  </div>
  <div class="card"><h2>Vendas por dia <small class="muted">${rangeLabel(range)}</small></h2>
    ${r.daily.length ? `<div style="display:flex;align-items:flex-end;gap:3px;height:140px;overflow-x:auto;padding-top:10px">${r.daily.map((d) => `<div title="${fmtDate(d.date)}: ${money(d.total)} (serviços ${money(d.services)} · produtos ${money(d.products)})" style="flex:1;min-width:14px;display:flex;flex-direction:column;justify-content:flex-end;height:100%">
      <div style="background:var(--accent);height:${(d.products / maxDay) * 100}%;border-radius:4px 4px 0 0"></div><div style="background:var(--brand);height:${(d.services / maxDay) * 100}%;${d.products ? '' : 'border-radius:4px 4px 0 0'}"></div>
      <small class="muted" style="font-size:.6rem;text-align:center">${fmtShort(d.date).slice(0, 2)}</small></div>`).join('')}</div>
      <p class="legend"><span class="dot" style="background:var(--brand)"></span>Serviços <span class="dot" style="background:var(--accent);margin-left:8px"></span>Produtos</p>` : empty('Nenhuma venda no período.')}</div>
  <div class="grid g2">
    <div class="card"><h2>Serviços mais vendidos</h2>${bars(r.services.slice(0, 10), { sub: (x) => `${x.qty} atendimento(s)` })}</div>
    <div class="card"><h2>Produtos mais vendidos</h2>${bars(r.products.slice(0, 10), { sub: (x) => `${String(x.qty).replace('.', ',')} unidade(s)` })}</div>
    <div class="card"><h2>Vendas por profissional</h2>${bars(r.professionals, { sub: (x) => `serviços ${money(x.services)} · produtos ${money(x.products)} · ${x.services_count} atend.` })}</div>
    <div class="card"><h2>Formas de pagamento <small class="muted">recebido no período</small></h2>${bars(r.methods, { label: (x) => x.method, sub: (x) => `${x.n} pagamento(s)` })}</div>
    <div class="card"><h2>Por categoria de serviço</h2>${bars(r.categories, { sub: (x) => `${x.qty} atendimento(s)` })}</div>
  </div>
  <p class="legend">Faturamento considera apenas atendimentos concluídos e vendas não estornadas, já descontados os descontos. Período anterior comparado: ${rangeLabel(r.previous)}.</p>`;
}

async function list(body, range) {
  body.innerHTML = '<div class="loading">Carregando…</div>';
  const rows = await GET(`/api/sales?from=${range.from}&to=${range.to}`);
  body.innerHTML = `<div class="card">${rows.length ? `<ul class="list">${rows.map((s) => `<li class="click" data-sale="${s.id}">
    <div class="grow"><div class="title">${esc(s.client_name || 'Venda sem cliente')} ${s.status === 'void' ? '<span class="tag err">estornada</span>' : s.pending_cents ? `<span class="tag warn">pendente ${money(s.pending_cents)}</span>` : ''}</div>
    <div class="meta">${fmtDate(s.created_at)} ${s.created_at.slice(11, 16)} · ${esc(s.items_text || '')}${s.methods ? ' · ' + esc(s.methods) : ''}</div></div>
    <b style="${s.status === 'void' ? 'text-decoration:line-through;color:var(--muted)' : ''}">${money(s.total_cents)}</b></li>`).join('')}</ul>` : empty('Nenhuma venda no período.')}</div>`;
  body.querySelectorAll('[data-sale]').forEach((li) => (li.onclick = () => openSale(Number(li.dataset.sale), refresh)));
}

async function pending(body) {
  const rows = await GET('/api/sales?pending=1');
  const total = rows.reduce((s, r) => s + r.pending_cents, 0);
  body.innerHTML = `<div class="kpis"><div class="kpi hl"><span>Total a receber</span><b>${money(total)}</b><small>${rows.length} venda(s)</small></div></div>
    <div class="card">${rows.length ? `<ul class="list">${rows.map((s) => `<li><div class="grow click" data-sale="${s.id}"><div class="title">${esc(s.client_name || '—')}</div>
      <div class="meta">${fmtDate(s.created_at)} · ${esc(s.items_text || '')} · total ${money(s.total_cents)}, pago ${money(s.paid_cents)}</div></div>
      <b class="warn-t">${money(s.pending_cents)}</b><button class="btn sm ok" data-rec="${s.id}">Receber</button></li>`).join('')}</ul>` : empty('Nenhum valor pendente. 🎉')}</div>`;
  body.querySelectorAll('[data-sale]').forEach((li) => (li.onclick = () => openSale(Number(li.dataset.sale), refresh)));
  body.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = () => {
    const s = rows.find((r) => r.id === Number(b.dataset.rec));
    receive(s, refresh);
  }));
}
