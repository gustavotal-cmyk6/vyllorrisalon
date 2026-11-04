import { state, GET, esc, money, periodPicker, mountPeriod, rangeLabel, bars, empty, fmtDate, fmtShort, ic, avatar, pageHead, trend } from '../core.js';
import { openCheckout, openSale, receive } from './checkout.js';
import { refresh } from '../app.js';

const ui = { tab: 'panel', period: 'month', pro: '' };

export default async function sales(root, { query }) {
  if (query.pendentes && !ui.fromLink) (ui.tab = 'pending'), (ui.fromLink = true);
  root.innerHTML = `${pageHead('Vendas', 'Serviços e produtos vendidos, recebimentos e valores a receber', `<button class="btn primary" data-new>${ic('plus', 18)} Registrar venda</button>`)}
    <div class="tabs"><button data-tab="panel" class="${ui.tab === 'panel' ? 'on' : ''}">Painel</button><button data-tab="list" class="${ui.tab === 'list' ? 'on' : ''}">Histórico de vendas</button><button data-tab="pending" class="${ui.tab === 'pending' ? 'on' : ''}">A receber</button></div>
    ${ui.tab !== 'pending' ? `${periodPicker('per', ui.period)}
      ${ui.tab === 'panel' ? `<div class="chips scroll" style="margin:-4px 0 14px"><button class="chip ${ui.pro ? '' : 'on'}" data-pro="">Salão inteiro</button>${state.pros.filter((p) => p.active).map((p) => `<button class="chip ${String(p.id) === ui.pro ? 'on' : ''}" data-pro="${p.id}">${esc(p.name.split(' ')[0])}</button>`).join('')}</div>` : ''}` : ''}
    <div data-body><div class="loading">Carregando…</div></div>`;
  root.querySelector('[data-new]').onclick = () => openCheckout({ onDone: refresh });
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ((ui.tab = b.dataset.tab), refresh())));
  root.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => (ui.period = b.dataset.p)));
  root.querySelectorAll('[data-pro]').forEach((b) => (b.onclick = () => ((ui.pro = b.dataset.pro), refresh())));
  const body = root.querySelector('[data-body]');
  if (ui.tab === 'pending') return pending(body);
  mountPeriod(root, 'per', (r) => (ui.tab === 'panel' ? panel(body, r) : list(body, r)), ui.period === 'custom' ? 'month' : ui.period);
}

async function panel(body, range) {
  body.innerHTML = '<div class="loading">Carregando…</div>';
  const r = await GET(`/api/reports/sales?from=${range.from}&to=${range.to}${ui.pro ? '&professional_id=' + ui.pro : ''}`);
  const s = r.summary, c = r.compare;
  const maxDay = Math.max(...r.daily.map((d) => d.total), 1);
  const pro = ui.pro && state.pros.find((p) => String(p.id) === ui.pro);
  body.innerHTML = `
  ${pro ? `<div class="next-card" style="margin-bottom:14px">${avatar(pro.name, pro.photo_url)}<div class="grow"><b>Vendas de ${esc(pro.name)}</b><div class="small muted">só os serviços e produtos lançados para ela</div></div></div>` : ''}
  <div class="kpis">
    <div class="kpi hl"><span class="k-ic">${ic('dollar', 20)}</span><span>Faturamento</span><b>${money(s.revenue)}</b>${trend(c.revenue)}</div>
    <div class="kpi"><span class="k-ic">${ic('scissors', 20)}</span><span>Serviços</span><b>${money(s.revenue_services)}</b>${trend(c.revenue_services)}</div>
    <div class="kpi"><span class="k-ic">${ic('box', 20)}</span><span>Produtos</span><b>${money(s.revenue_products)}</b>${trend(c.revenue_products)}</div>
    <div class="kpi"><span class="k-ic">${ic('heart', 20)}</span><span>Ticket médio por cliente</span><b>${money(s.ticket_avg)}</b>${trend(c.ticket_avg)}</div>
  </div>
  <div class="sum-strip" style="margin-bottom:16px">
    <div><span>Atendimentos vendidos</span><b>${s.services_count}</b><small>${s.clients_served} cliente(s)</small></div>
    <div><span>Produtos vendidos</span><b>${String(s.products_qty).replace('.', ',')}</b><small>unidades</small></div>
    ${pro ? '' : `<div><span>Descontos concedidos</span><b>${money(s.discounts)}</b><small>${s.revenue ? ((s.discounts / (s.revenue + s.discounts)) * 100).toFixed(1).replace('.', ',') + '% do valor cheio' : ''}</small></div>
    <div><span>Recebido destas vendas</span><b class="ok-t">${money(s.received_of_period)}</b><small>entrou no caixa no período: ${money(r.received_in_period)}</small></div>
    <div><span>Pendente destas vendas</span><b class="${s.pending_of_period ? 'warn-t' : ''}">${money(s.pending_of_period)}</b><small>a receber das clientes</small></div>`}
  </div>
  <div class="card"><div class="card-head"><h2>Vendas por dia</h2><span class="tiny muted">${rangeLabel(range)}</span></div>
    ${r.daily.length ? `<div style="display:flex;align-items:flex-end;gap:4px;height:170px;overflow-x:auto;padding-top:10px" role="img" aria-label="Vendas por dia">${r.daily.map((d) => `<div title="${fmtDate(d.date)}: ${money(d.total)} (serviços ${money(d.services)} · produtos ${money(d.products)})" style="flex:1;min-width:16px;display:flex;flex-direction:column;justify-content:flex-end;height:100%">
      <div style="background:var(--pink-2);height:${(d.products / maxDay) * 100}%;border-radius:6px 6px 0 0"></div><div style="background:linear-gradient(180deg,var(--brand-2),var(--brand));height:${(d.services / maxDay) * 100}%;${d.products ? '' : 'border-radius:6px 6px 0 0'}"></div>
      <small class="muted" style="font-size:.6rem;text-align:center;margin-top:3px">${fmtShort(d.date).slice(0, 2)}</small></div>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--brand)"></i>Serviços</span><span><i style="background:var(--pink-2)"></i>Produtos</span></div>` : empty('Nenhuma venda no período.', '', 'chart')}</div>
  <div class="grid g2">
    <div class="card"><h2>Serviços mais vendidos</h2>${bars(r.services.slice(0, 8), { sub: (x) => `${x.qty} atendimento(s)` })}</div>
    <div class="card"><h2>Produtos mais vendidos</h2>${bars(r.products.slice(0, 8), { sub: (x) => `${String(x.qty).replace('.', ',')} unidade(s)` })}</div>
    ${pro ? '' : `<div class="card"><h2>Vendas por profissional</h2>${bars(r.professionals, { sub: (x) => `serviços ${money(x.services)} · produtos ${money(x.products)} · ${x.services_count} atend.` })}</div>
    <div class="card"><h2>Formas de pagamento</h2>${bars(r.methods, { label: (x) => x.method, sub: (x) => `${x.n} pagamento(s)` })}</div>`}
    <div class="card"><h2>Por categoria de serviço</h2>${bars(r.categories, { sub: (x) => `${x.qty} atendimento(s)` })}</div>
  </div>
  <p class="legend">${ic('info', 14)} Faturamento considera só atendimentos concluídos e vendas não estornadas, já com desconto. Comparação com ${rangeLabel(r.previous)}.</p>`;
}

async function list(body, range) {
  body.innerHTML = '<div class="loading">Carregando…</div>';
  const rows = await GET(`/api/sales?from=${range.from}&to=${range.to}`);
  const total = rows.filter((s) => s.status === 'active').reduce((a, s) => a + s.total_cents, 0);
  body.innerHTML = `<div class="card" style="padding:6px 14px"><div class="card-head" style="padding-top:10px"><h2>${rows.length} venda(s)</h2><b>${money(total)}</b></div>
    ${rows.length ? `<ul class="list">${rows.map((s) => `<li class="click" data-sale="${s.id}">${avatar(s.client_name || '?', null, 'sm')}
    <div class="grow"><div class="title">${esc(s.client_name || 'Venda sem cliente')} ${s.status === 'void' ? '<span class="tag err">estornada</span>' : s.pending_cents ? `<span class="tag warn">pendente ${money(s.pending_cents)}</span>` : ''}</div>
    <div class="meta">${fmtDate(s.created_at)} ${s.created_at.slice(11, 16)} · ${esc(s.items_text || '')}${s.methods ? ' · ' + esc(s.methods) : ''}</div></div>
    <b style="${s.status === 'void' ? 'text-decoration:line-through;color:var(--muted)' : ''}">${money(s.total_cents)}</b></li>`).join('')}</ul>` : empty('Nenhuma venda no período.', '', 'cart')}</div>`;
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
