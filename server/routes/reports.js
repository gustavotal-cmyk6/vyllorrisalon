import { route, STAFF, OWNER, ALL } from '../http.js';
import { V } from '../validate.js';
import { all, get } from '../db.js';
import { today, monthRange, prevMonthRange, prevPeriod, pctChange, addDays, diffDays, nowTime } from '../util.js';
import { loadVisits, freeSlots } from './agenda.js';
import { financeSummary } from './finance.js';

const ACTIVE = `s.salon_id=? AND s.status='active' AND substr(s.created_at,1,10) BETWEEN ? AND ?`;

/** Indicadores comerciais de um período (só vendas concluídas e não estornadas). */
export function salesSummary(sid, from, to) {
  const t = get(`SELECT COUNT(*) sales, COALESCE(SUM(total_cents),0) revenue, COALESCE(SUM(discount_cents),0) discounts,
      COUNT(DISTINCT COALESCE(client_id, -id)) clients FROM sales s WHERE ${ACTIVE}`, sid, from, to);
  const k = get(`SELECT COALESCE(SUM(CASE WHEN si.kind='service' THEN si.net_cents END),0) services,
      COALESCE(SUM(CASE WHEN si.kind='product' THEN si.net_cents END),0) products,
      COUNT(CASE WHEN si.kind='service' THEN 1 END) services_count,
      COALESCE(SUM(CASE WHEN si.kind='product' THEN si.qty END),0) products_qty
      FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE ${ACTIVE}`, sid, from, to);
  const paidOfPeriod = get(`SELECT COALESCE(SUM(p.amount_cents),0) v FROM payments p JOIN sales s ON s.id=p.sale_id WHERE ${ACTIVE}`, sid, from, to).v;
  return {
    revenue: t.revenue, revenue_services: k.services, revenue_products: k.products, discounts: t.discounts,
    sales_count: t.sales, services_count: k.services_count, products_qty: k.products_qty, clients_served: t.clients,
    ticket_avg: t.clients ? Math.round(t.revenue / t.clients) : 0,
    received_of_period: paidOfPeriod, pending_of_period: t.revenue - paidOfPeriod,
  };
}

const topServices = (sid, from, to, n = 10) => all(`SELECT si.name, COUNT(*) qty, SUM(si.net_cents) total FROM sale_items si JOIN sales s ON s.id=si.sale_id
  WHERE ${ACTIVE} AND si.kind='service' GROUP BY si.name ORDER BY qty DESC, total DESC LIMIT ${n}`, sid, from, to);
const topProducts = (sid, from, to, n = 10) => all(`SELECT si.name, SUM(si.qty) qty, SUM(si.net_cents) total FROM sale_items si JOIN sales s ON s.id=si.sale_id
  WHERE ${ACTIVE} AND si.kind='product' GROUP BY si.product_id ORDER BY qty DESC, total DESC LIMIT ${n}`, sid, from, to);
const byPro = (sid, from, to) => all(`SELECT p.id, p.name, p.color, SUM(si.net_cents) total,
    SUM(CASE WHEN si.kind='service' THEN si.net_cents ELSE 0 END) services, SUM(CASE WHEN si.kind='product' THEN si.net_cents ELSE 0 END) products,
    COUNT(CASE WHEN si.kind='service' THEN 1 END) services_count, SUM(si.commission_cents) commission
    FROM sale_items si JOIN sales s ON s.id=si.sale_id JOIN professionals p ON p.id=si.professional_id
    WHERE ${ACTIVE} GROUP BY p.id ORDER BY total DESC`, sid, from, to);

route('GET', '/api/dashboard', ALL, ({ sid, user }) => {
  const d = today();
  const month = monthRange(d), prev = prevMonthRange(d);
  const isPro = user.role === 'pro';
  let visits = loadVisits(sid, 'v.date=?', d);
  if (isPro) visits = visits.filter((v) => v.items.some((i) => i.professional_id === user.professional_id));
  const count = (st) => visits.filter((v) => st.includes(v.status)).length;
  const now = `${d} ${nowTime()}`;
  const agenda = {
    total: count(['scheduled', 'confirmed', 'waiting', 'in_progress', 'completed']),
    scheduled: count(['scheduled']), confirmed: count(['confirmed']), waiting: count(['waiting']),
    in_progress: count(['in_progress']), completed: count(['completed']), cancelled: count(['cancelled']), no_show: count(['no_show']),
    late: visits.filter((v) => ['scheduled', 'confirmed'].includes(v.status) && v.start_at < now).map(slim),
    waiting_list: visits.filter((v) => v.status === 'waiting').map(slim),
    in_progress_list: visits.filter((v) => v.status === 'in_progress').map(slim),
    next: visits.filter((v) => ['scheduled', 'confirmed'].includes(v.status) && v.start_at >= now).slice(0, 6).map(slim),
    to_checkout: visits.filter((v) => v.status === 'in_progress').length,
  };
  const pros = all(`SELECT id,name,color FROM professionals WHERE salon_id=? AND active=1 ${isPro ? 'AND id=?' : ''} ORDER BY name`, sid, ...(isPro ? [user.professional_id] : []));
  const free = pros.map((p) => {
    const slots = freeSlots(sid, p.id, d, 30, { step: 30 });
    return { id: p.id, name: p.name, color: p.color, slots: slots.length, next: slots[0] || null };
  }).filter((p) => p.slots > 0 || !isPro);

  if (isPro) {
    const mine = get(`SELECT COALESCE(SUM(si.net_cents),0) produced, COALESCE(SUM(si.commission_cents),0) commission
                        FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE ${ACTIVE} AND si.professional_id=?`, sid, month.from, month.to, user.professional_id);
    return { role: 'pro', date: d, agenda, free, month: mine };
  }

  const day = salesSummary(sid, d, d);
  const dayReceived = get(`SELECT COALESCE(SUM(p.amount_cents),0) v FROM payments p JOIN sales s ON s.id=p.sale_id WHERE p.salon_id=? AND s.status='active' AND substr(p.created_at,1,10)=?`, sid, d).v;
  const cur = salesSummary(sid, month.from, d);
  // compara com o mesmo intervalo de dias do mês anterior (ex.: 1º–15 vs 1º–15)
  const prevTo = addDays(prev.from, Math.min(diffDays(month.from, d), diffDays(prev.from, prev.to)));
  const last = salesSummary(sid, prev.from, prevTo);
  const monthVisits = get(`SELECT COUNT(CASE WHEN status='cancelled' THEN 1 END) cancelled, COUNT(CASE WHEN status='no_show' THEN 1 END) no_show, COUNT(*) total
                             FROM visits WHERE salon_id=? AND date BETWEEN ? AND ?`, sid, month.from, d);
  const receivable = get(`SELECT COUNT(*) n, COALESCE(SUM(s.total_cents - (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE sale_id=s.id)),0) v
                            FROM sales s WHERE s.salon_id=? AND s.status='active' AND s.total_cents > (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE sale_id=s.id)`, sid);

  // Pontos de atenção
  const attention = [];
  if (agenda.late.length) attention.push({ type: 'late', level: 'warn', text: `${agenda.late.length} cliente(s) atrasada(s) ou ainda sem chegada registrada`, link: '#/agenda' });
  if (agenda.in_progress) attention.push({ type: 'checkout', level: 'info', text: `${agenda.in_progress} atendimento(s) em andamento para fechar a conta`, link: '#/agenda' });
  if (receivable.n) attention.push({ type: 'receivable', level: 'warn', text: `${receivable.n} venda(s) com valor pendente a receber`, amount: receivable.v, link: '#/vendas?pendentes=1' });
  const tomorrow = addDays(d, 1);
  const unconfirmed = get(`SELECT COUNT(*) n FROM visits WHERE salon_id=? AND date=? AND status='scheduled'`, sid, tomorrow).n;
  if (unconfirmed) attention.push({ type: 'confirm', level: 'info', text: `${unconfirmed} agendamento(s) de amanhã ainda não confirmados`, link: `#/agenda?data=${tomorrow}` });
  const low = all(`SELECT name, stock, min_stock, unit FROM products WHERE salon_id=? AND active=1 AND stock<=min_stock AND min_stock>0 ORDER BY name LIMIT 5`, sid);
  if (low.length) attention.push({ type: 'stock', level: 'warn', text: `Estoque baixo: ${low.map((l) => l.name).join(', ')}`, link: '#/estoque' });
  if (user.role === 'owner') {
    const bills = get(`SELECT COUNT(*) n, COALESCE(SUM(amount_cents),0) v FROM expenses WHERE salon_id=? AND paid_at IS NULL AND due_date<=?`, sid, addDays(d, 3));
    if (bills.n) attention.push({ type: 'bills', level: 'warn', text: `${bills.n} conta(s) vencidas ou vencendo em até 3 dias`, amount: bills.v, link: '#/financeiro' });
  }
  const md = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(d, i).slice(5));
  const birthdays = all(`SELECT id, name, birthday FROM clients WHERE salon_id=? AND active=1 AND birthday IS NOT NULL`, sid)
    .filter((c) => md.includes(c.birthday.slice(-5)));
  if (birthdays.length) attention.push({ type: 'birthday', level: 'ok', text: `Aniversariantes da semana: ${birthdays.map((b) => b.name.split(' ')[0]).join(', ')}`, link: '#/clientes?filtro=aniversario' });

  return {
    role: user.role, date: d, agenda, free, attention,
    today: { revenue: day.revenue, received: dayReceived, services_count: day.services_count, ticket_avg: day.ticket_avg },
    month: { ...cur, change_revenue: pctChange(cur.revenue, last.revenue), prev_revenue: last.revenue, cancelled: monthVisits.cancelled, no_show: monthVisits.no_show },
    top_services: topServices(sid, month.from, d, 5),
    top_pros: byPro(sid, month.from, d).slice(0, 5),
    receivable: receivable.v,
  };
});

function slim(v) {
  return { id: v.id, client_name: v.client_name, start_at: v.start_at, status: v.status, services: v.items.map((i) => i.service_name).join(', '),
    pros: [...new Set(v.items.map((i) => i.pro_name))].join(', ') };
}

/** Painel de vendas: serviços × produtos, profissionais, formas de pagamento, comparação com o período anterior. */
route('GET', '/api/reports/sales', STAFF, ({ query, sid }) => {
  const { from, to } = V.range(query);
  const prev = prevPeriod(from, to);
  const cur = salesSummary(sid, from, to);
  const last = salesSummary(sid, prev.from, prev.to);
  const compare = Object.fromEntries(Object.keys(cur).map((k) => [k, pctChange(cur[k], last[k])]));
  const received = get(`SELECT COALESCE(SUM(p.amount_cents),0) v FROM payments p JOIN sales s ON s.id=p.sale_id WHERE p.salon_id=? AND s.status='active' AND substr(p.created_at,1,10) BETWEEN ? AND ?`, sid, from, to).v;
  return {
    from, to, previous: prev, summary: cur, previous_summary: last, compare, received_in_period: received,
    services: topServices(sid, from, to, 50), products: topProducts(sid, from, to, 50), professionals: byPro(sid, from, to),
    methods: all(`SELECT p.method, COUNT(*) n, SUM(p.amount_cents) total FROM payments p JOIN sales s ON s.id=p.sale_id
                   WHERE p.salon_id=? AND s.status='active' AND substr(p.created_at,1,10) BETWEEN ? AND ? GROUP BY 1 ORDER BY 3 DESC`, sid, from, to),
    daily: all(`SELECT substr(s.created_at,1,10) date, SUM(si.net_cents) total, SUM(CASE WHEN si.kind='service' THEN si.net_cents ELSE 0 END) services,
                  SUM(CASE WHEN si.kind='product' THEN si.net_cents ELSE 0 END) products
                  FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE ${ACTIVE} GROUP BY 1 ORDER BY 1`, sid, from, to),
    categories: all(`SELECT COALESCE(c.name,'Sem categoria') name, COUNT(*) qty, SUM(si.net_cents) total FROM sale_items si JOIN sales s ON s.id=si.sale_id
                      LEFT JOIN services sv ON sv.id=si.service_id LEFT JOIN categories c ON c.id=sv.category_id
                     WHERE ${ACTIVE} AND si.kind='service' GROUP BY 1 ORDER BY 3 DESC`, sid, from, to),
  };
});

/** Relatório de gestão: respostas diretas às perguntas da dona do salão. */
route('GET', '/api/reports/management', OWNER, ({ query, sid }) => {
  const { from, to } = V.range(query);
  const prev = prevPeriod(from, to);
  const days = Math.max(30, V.int(query.inactive_days, 'Dias sem retorno', { min: 30, max: 365 }) || 60);
  const cur = salesSummary(sid, from, to), last = salesSummary(sid, prev.from, prev.to);
  const fin = financeSummary(sid, from, to), finPrev = financeSummary(sid, prev.from, prev.to);
  const newClients = get(`SELECT COUNT(*) n FROM clients WHERE salon_id=? AND substr(created_at,1,10) BETWEEN ? AND ?`, sid, from, to).n;
  const cutoff = addDays(to, -days);
  const lost = all(`SELECT c.id, c.name, c.phone, MAX(substr(s.created_at,1,10)) last_visit, COUNT(s.id) visits, SUM(s.total_cents) spent
                      FROM clients c JOIN sales s ON s.client_id=c.id AND s.status='active'
                     WHERE c.salon_id=? AND c.active=1 AND substr(s.created_at,1,10)<=? GROUP BY c.id HAVING last_visit < ? ORDER BY spent DESC`, sid, to, cutoff);
  const visits = get(`SELECT COUNT(*) total, COUNT(CASE WHEN status='cancelled' THEN 1 END) cancelled, COUNT(CASE WHEN status='no_show' THEN 1 END) no_show,
                        COUNT(CASE WHEN status='completed' THEN 1 END) completed FROM visits WHERE salon_id=? AND date BETWEEN ? AND ?`, sid, from, to);
  return {
    from, to, previous: prev, inactive_days: days,
    sales: cur, sales_prev: last, finance: fin, finance_prev: finPrev,
    change: { revenue: pctChange(cur.revenue, last.revenue), profit: pctChange(fin.profit, finPrev.profit), ticket: pctChange(cur.ticket_avg, last.ticket_avg), expenses: pctChange(fin.expenses, finPrev.expenses) },
    top_service: topServices(sid, from, to, 1)[0] || null, top_product: topProducts(sid, from, to, 1)[0] || null,
    top_pro: byPro(sid, from, to)[0] || null, new_clients: newClients, lost_clients: lost.length, lost_list: lost.slice(0, 30), visits,
  };
});

// ---- Busca global ----
route('GET', '/api/search', ALL, ({ query, sid, user }) => {
  const q = (query.q || '').trim();
  if (q.length < 2) return { clients: [], services: [], visits: [], products: [] };
  const like = `%${q}%`;
  const digits = q.replace(/\D/g, '');
  const clients = all(`SELECT id, name, phone FROM clients WHERE salon_id=? AND active=1 AND (name LIKE ? OR (? <> '' AND phone LIKE ?)) ORDER BY name LIMIT 6`, sid, like, digits, `%${digits}%`);
  const services = all(`SELECT id, name, price_cents, duration_min FROM services WHERE salon_id=? AND active=1 AND name LIKE ? ORDER BY name LIMIT 5`, sid, like);
  const products = user.role === 'pro' ? [] : all(`SELECT id, name, stock, unit, kind FROM products WHERE salon_id=? AND active=1 AND name LIKE ? ORDER BY name LIMIT 5`, sid, like);
  let visits = loadVisits(sid, `v.date>=? AND v.status IN ('scheduled','confirmed','waiting','in_progress') AND c.name LIKE ?`, addDays(today(), -1), like).slice(0, 6);
  if (user.role === 'pro') visits = visits.filter((v) => v.items.some((i) => i.professional_id === user.professional_id));
  return { clients, services, products, visits: visits.map(slim) };
});

