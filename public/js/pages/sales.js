import { state, GET, esc, money, periodPicker, mountPeriod, rangeLabel, bars, empty, fmtDate, fmtShort, ic, avatar, pageHead, trend, can } from '../core.js';
import { openCheckout, openSale, receive } from './checkout.js';
import { refresh } from '../app.js';

const ui = { tab: 'list', period: 'month' };

export default async function sales(root, { query }) {
  if (query.pendentes && !ui.fromLink) (ui.tab = 'pending'), (ui.fromLink = true);
  root.innerHTML = `${pageHead('Vendas', can.products() ? 'Serviços e produtos vendidos, recebimentos e valores a receber' : 'Serviços vendidos, recebimentos e valores a receber', `<button class="btn primary" data-new>${ic('plus', 18)} Registrar venda</button>`)}
    <div class="tabs"><button data-tab="list" class="${ui.tab === 'list' ? 'on' : ''}">Vendas</button><button data-tab="panel" class="${ui.tab === 'panel' ? 'on' : ''}">Resumo</button><button data-tab="pending" class="${ui.tab === 'pending' ? 'on' : ''}">A receber</button></div>
    ${ui.tab !== 'pending' ? `${periodPicker('per', ui.period)}` : ''}
    <div data-body><div class="loading">Carregando…</div></div>`;
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
  const maxDay = Math.max(...r.daily.map((d) => d.total), 1);
  body.innerHTML = `
  <div class="kpis three">
    <div class="kpi hl"><span>Vendido no período</span><b>${money(s.revenue)}</b>${trend(c.revenue)}${can.products() ? `<small>serviços ${money(s.revenue_services)} · produtos ${money(s.revenue_products)}</small>` : ''}</div>
    <div class="kpi"><span>Atendimentos</span><b>${s.services_count}</b><small>${s.clients_served} cliente(s)</small></div>
    <div class="kpi"><span>Ticket médio</span><b>${money(s.ticket_avg)}</b><small>quanto cada cliente gastou, em média</small></div>
  </div>
  <div class="card"><div class="card-head"><h2>Quanto foi vendido por dia</h2><span class="tiny muted">${rangeLabel(range)}</span></div>
    ${r.daily.length ? `<div style="display:flex;align-items:flex-end;gap:4px;height:160px;overflow-x:auto;padding-top:10px" role="img" aria-label="Vendas por dia">${r.daily.map((d) => `<div title="${fmtDate(d.date)}: ${money(d.total)}" style="flex:1;min-width:14px;display:flex;flex-direction:column;justify-content:flex-end;height:100%">
      <div style="background:linear-gradient(180deg,var(--brand-2),var(--brand));height:${(d.total / maxDay) * 100}%;border-radius:6px 6px 0 0"></div>
      <small class="muted" style="font-size:.6rem;text-align:center;margin-top:3px">${fmtShort(d.date).slice(0, 2)}</small></div>`).join('')}</div>` : empty('Nenhuma venda no período.', '', 'chart')}</div>
  <div class="grid g2">
    <div class="card"><h2>Serviços mais vendidos</h2>${bars(r.services.slice(0, 6), { sub: (x) => `${x.qty} atendimento(s)` })}</div>
    ${can.products() ? `<div class="card"><h2>Produtos mais vendidos</h2>${bars(r.products.slice(0, 6), { sub: (x) => `${String(x.qty).replace('.', ',')} unidade(s)` })}</div>` : ''}
  </div>
  <p class="legend">Mais análises (por profissional, forma de pagamento e categoria) em <a href="#/relatorios">Relatórios</a>.</p>`;
}

async function list(body, range) {
  body.innerHTML = '<div class="loading">Carregando…</div>';
  const rows = await GET(`/api/sales?from=${range.from}&to=${range.to}`);
  const total = rows.filter((s) => s.status === 'active').reduce((a, s) => a + s.total_cents, 0);
  body.innerHTML = `<div class="card" style="padding:6px 14px"><div class="card-head" style="padding-top:10px"><h2>${rows.length} venda(s)</h2><b>${money(total)}</b></div>
    ${rows.length ? `<ul class="list">${rows.map((s) => `<li class="click" data-sale="${s.id}">${avatar(s.client_name || '?', null, 'sm')}
    <div class="grow"><div class="title">${esc(s.client_name || 'Venda sem cliente')} ${s.status === 'void' ? '<span class="tag err">estornada</span>' : s.pending_cents ? `<span class="tag warn">pendente ${money(s.pending_cents)}</span>` : ''}</div>
    <div class="meta">${fmtDate(s.created_at)} ${s.created_at.slice(11, 16)} · ${esc(s.items_text || '')}${s.methods ? ' · ' + esc(s.methods) : ''}</div></div>
    <b style="${s.status === 'void' ? 'text-decoration:line-through;color:var(--muted)' : ''}">${money(s.total_cents)}</b></li>`).join('')}</ul>` : empty('Nenhuma venda neste período. As vendas aparecem aqui quando você fecha a conta de um atendimento ou registra uma venda de produto.', `<button class="btn primary sm" data-new-empty>${ic('plus', 16)} Registrar venda</button>`, 'cart')}</div>`;
  body.querySelector('[data-new-empty]')?.addEventListener('click', () => openCheckout({ onDone: refresh }));
  body.querySelectorAll('[data-sale]').forEach((li) => (li.onclick = () => openSale(Number(li.dataset.sale), refresh)));
}

async function pending(body) {
  const rows = await GET('/api/sales?pending=1');
  const total = rows.reduce((s, r) => s + r.pending_cents, 0);
  body.innerHTML = `<div class="kpis"><div class="kpi hl"><span class="k-ic">${ic('coin', 20)}</span><span>Total a receber</span><b>${money(total)}</b><small>${rows.length} venda(s)</small></div></div>
    <div class="card" style="padding:6px 14px">${rows.length ? `<ul class="list">${rows.map((s) => `<li>${avatar(s.client_name || '?', null, 'sm')}<div class="grow click" data-sale="${s.id}"><div class="title">${esc(s.client_name || '—')}</div>
      <div class="meta">${fmtDate(s.created_at)} · ${esc(s.items_text || '')} · total ${money(s.total_cents)}, pago ${money(s.paid_cents)}</div></div>
      <b class="warn-t">${money(s.pending_cents)}</b><button class="btn xs ok" data-rec="${s.id}">${ic('check', 14)} Receber</button></li>`).join('')}</ul>` : empty('Nenhum valor pendente.', '', 'checkCircle')}</div>`;
  body.querySelectorAll('[data-sale]').forEach((li) => (li.onclick = () => openSale(Number(li.dataset.sale), refresh)));
  body.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = () => receive(rows.find((r) => r.id === Number(b.dataset.rec)), refresh)));
}
