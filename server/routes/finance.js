import { route, HttpError, OWNER, ALL } from '../http.js';
import { V } from '../validate.js';
import { all, get, run, tx } from '../db.js';
import { nowStr, today, addDays, monthRange } from '../util.js';

/** Gera (uma única vez) as despesas recorrentes de cada mês do período. */
export function ensureRecurring(sid, from, to) {
  const months = new Set();
  for (let d = from.slice(0, 7) + '-01'; d <= to; d = addDays(monthRange(d).to, 1)) months.add(d.slice(0, 7));
  const recs = all('SELECT * FROM recurring_expenses WHERE salon_id=? AND active=1', sid);
  for (const m of months)
    for (const r of recs) {
      const last = Number(monthRange(m + '-01').to.slice(8));
      const due = `${m}-${String(Math.min(r.day_of_month, last)).padStart(2, '0')}`;
      run(`INSERT OR IGNORE INTO expenses(salon_id,description,category,amount_cents,due_date,recurring_id,ref_month,created_at) VALUES(?,?,?,?,?,?,?,?)`,
        sid, r.description, r.category, r.amount_cents, due, r.id, m, nowStr());
    }
}

// ---- Despesas / contas a pagar ----
route('GET', '/api/expenses', OWNER, ({ query, sid }) => {
  const { from, to } = V.range(query);
  ensureRecurring(sid, from, to);
  const where = ['salon_id=?', 'due_date BETWEEN ? AND ?'];
  if (query.status === 'open') where.push('paid_at IS NULL');
  if (query.status === 'paid') where.push('paid_at IS NOT NULL');
  return all(`SELECT * FROM expenses WHERE ${where.join(' AND ')} ORDER BY due_date, id`, sid, from, to);
});
function expFields(b) {
  return {
    description: V.str(b.description, 'Descrição', { req: true, max: 120 }), category: V.str(b.category, 'Categoria', { max: 40 }),
    amount: V.cents(b.amount_cents, 'Valor', { req: true, min: 1 }), due: V.date(b.due_date, 'Vencimento', { req: true }),
  };
}
route('POST', '/api/expenses', OWNER, ({ body, sid }) => {
  const f = expFields(body);
  const paid = body.paid ? V.date(body.paid_at, 'Pago em') || today() : null;
  return {
    id: run('INSERT INTO expenses(salon_id,description,category,amount_cents,due_date,paid_at,method,created_at) VALUES(?,?,?,?,?,?,?,?)',
      sid, f.description, f.category, f.amount, f.due, paid, paid ? V.str(body.method, 'Forma', { max: 30 }) : null, nowStr()).id,
  };
});
route('PUT', '/api/expenses/:id', OWNER, ({ params, body, sid }) => {
  const f = expFields(body);
  const r = run('UPDATE expenses SET description=?,category=?,amount_cents=?,due_date=? WHERE id=? AND salon_id=?', f.description, f.category, f.amount, f.due, params.id, sid);
  if (!r.changes) throw new HttpError(404, 'Despesa não encontrada.');
  return { ok: true };
});
route('POST', '/api/expenses/:id/pay', OWNER, ({ params, body, sid }) => {
  const paid = body.undo ? null : V.date(body.paid_at, 'Pago em') || today();
  const r = run('UPDATE expenses SET paid_at=?, method=? WHERE id=? AND salon_id=?', paid, paid ? V.str(body.method, 'Forma', { max: 30 }) : null, params.id, sid);
  if (!r.changes) throw new HttpError(404, 'Despesa não encontrada.');
  return { ok: true };
});
route('DELETE', '/api/expenses/:id', OWNER, ({ params, sid }) => {
  const e = get('SELECT * FROM expenses WHERE id=? AND salon_id=?', params.id, sid);
  if (!e) throw new HttpError(404, 'Despesa não encontrada.');
  // excluir uma ocorrência recorrente faria ela ser gerada de novo; por isso exigimos desativar a recorrência
  if (e.recurring_id) throw new HttpError(409, 'Esta despesa é recorrente. Desative a recorrência ou edite o valor deste mês.');
  run('DELETE FROM expenses WHERE id=?', e.id);
  return { ok: true };
});

route('GET', '/api/recurring-expenses', OWNER, ({ sid }) => all('SELECT * FROM recurring_expenses WHERE salon_id=? ORDER BY active DESC, description', sid));
function recFields(b) {
  return {
    description: V.str(b.description, 'Descrição', { req: true, max: 120 }), category: V.str(b.category, 'Categoria', { max: 40 }),
    amount: V.cents(b.amount_cents, 'Valor', { req: true, min: 1 }), day: V.int(b.day_of_month, 'Dia do vencimento', { req: true, min: 1, max: 31 }),
  };
}
route('POST', '/api/recurring-expenses', OWNER, ({ body, sid }) => {
  const f = recFields(body);
  return { id: run('INSERT INTO recurring_expenses(salon_id,description,category,amount_cents,day_of_month) VALUES(?,?,?,?,?)', sid, f.description, f.category, f.amount, f.day).id };
});
route('PUT', '/api/recurring-expenses/:id', OWNER, ({ params, body, sid }) => {
  const f = recFields(body);
  const r = run('UPDATE recurring_expenses SET description=?,category=?,amount_cents=?,day_of_month=?,active=? WHERE id=? AND salon_id=?',
    f.description, f.category, f.amount, f.day, V.bool(body.active ?? 1), params.id, sid);
  if (!r.changes) throw new HttpError(404, 'Recorrência não encontrada.');
  return { ok: true };
});

// ---- Resumo financeiro: faturamento ≠ recebimento ≠ lucro ----
export function financeSummary(sid, from, to) {
  ensureRecurring(sid, from, to);
  const S = `s.salon_id=? AND s.status='active' AND substr(s.created_at,1,10) BETWEEN ? AND ?`;
  const rev = get(`SELECT COALESCE(SUM(si.net_cents),0) total,
      COALESCE(SUM(CASE WHEN si.kind='service' THEN si.net_cents END),0) services,
      COALESCE(SUM(CASE WHEN si.kind='product' THEN si.net_cents END),0) products,
      COALESCE(SUM(si.cost_cents),0) product_cost, COALESCE(SUM(si.commission_cents),0) commissions
      FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE ${S}`, sid, from, to);
  const received = get(`SELECT COALESCE(SUM(p.amount_cents),0) v FROM payments p JOIN sales s ON s.id=p.sale_id
                         WHERE p.salon_id=? AND s.status='active' AND substr(p.created_at,1,10) BETWEEN ? AND ?`, sid, from, to).v;
  const exp = get(`SELECT COALESCE(SUM(amount_cents),0) total, COALESCE(SUM(CASE WHEN paid_at IS NOT NULL THEN amount_cents END),0) paid
                     FROM expenses WHERE salon_id=? AND due_date BETWEEN ? AND ?`, sid, from, to);
  const commPaid = get(`SELECT COALESCE(SUM(amount_cents),0) v FROM commission_payments WHERE salon_id=? AND substr(created_at,1,10) BETWEEN ? AND ?`, sid, from, to).v;
  const receivable = get(`SELECT COALESCE(SUM(s.total_cents - (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE sale_id=s.id)),0) v
                            FROM sales s WHERE s.salon_id=? AND s.status='active'`, sid).v;
  const payableOverdue = get(`SELECT COALESCE(SUM(amount_cents),0) v, COUNT(*) n FROM expenses WHERE salon_id=? AND paid_at IS NULL AND due_date<?`, sid, today());
  const byCategory = all(`SELECT COALESCE(category,'Sem categoria') category, SUM(amount_cents) total FROM expenses WHERE salon_id=? AND due_date BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC`, sid, from, to);
  return {
    revenue: rev.total, revenue_services: rev.services, revenue_products: rev.products,
    received, product_cost: rev.product_cost, commissions: rev.commissions, commissions_paid: commPaid,
    expenses: exp.total, expenses_paid: exp.paid, expenses_open: exp.total - exp.paid,
    // lucro estimado por competência: faturamento − custo dos produtos vendidos − comissões geradas − despesas do período
    profit: rev.total - rev.product_cost - rev.commissions - exp.total,
    receivable_total: receivable, payable_overdue: payableOverdue.v, payable_overdue_count: payableOverdue.n,
    expenses_by_category: byCategory,
  };
}
route('GET', '/api/finance/summary', OWNER, ({ query, sid }) => {
  const { from, to } = V.range(query);
  return financeSummary(sid, from, to);
});

/** Fluxo de caixa (regime de caixa): entradas = pagamentos recebidos; saídas = despesas pagas + comissões pagas. */
route('GET', '/api/finance/cashflow', OWNER, ({ query, sid }) => {
  const { from, to } = V.range(query);
  const moves = [
    ...all(`SELECT substr(p.created_at,1,10) date, 'in' dir, p.amount_cents amount, p.method, 'Recebimento' || COALESCE(' – ' || c.name,'') description, p.sale_id ref
              FROM payments p JOIN sales s ON s.id=p.sale_id LEFT JOIN clients c ON c.id=s.client_id
             WHERE p.salon_id=? AND s.status='active' AND substr(p.created_at,1,10) BETWEEN ? AND ?`, sid, from, to),
    ...all(`SELECT paid_at date, 'out' dir, amount_cents amount, method, description, NULL ref FROM expenses WHERE salon_id=? AND paid_at BETWEEN ? AND ?`, sid, from, to),
    ...all(`SELECT substr(cp.created_at,1,10) date, 'out' dir, cp.amount_cents amount, NULL method, 'Comissão – ' || p.name description, NULL ref
              FROM commission_payments cp JOIN professionals p ON p.id=cp.professional_id WHERE cp.salon_id=? AND substr(cp.created_at,1,10) BETWEEN ? AND ?`, sid, from, to),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const days = {};
  for (const m of moves) {
    const d = (days[m.date] ||= { date: m.date, in: 0, out: 0 });
    d[m.dir] += m.amount;
  }
  let bal = 0;
  const daily = Object.values(days).map((d) => ({ ...d, balance: (bal += d.in - d.out) }));
  const byMethod = all(`SELECT p.method, SUM(p.amount_cents) total FROM payments p JOIN sales s ON s.id=p.sale_id
                         WHERE p.salon_id=? AND s.status='active' AND substr(p.created_at,1,10) BETWEEN ? AND ? GROUP BY 1 ORDER BY 2 DESC`, sid, from, to);
  return { moves: moves.reverse(), daily, by_method: byMethod, total_in: daily.reduce((s, d) => s + d.in, 0), total_out: daily.reduce((s, d) => s + d.out, 0) };
});

// ---- Comissões ----
const proGuard = (user, proId) => {
  if (user.role === 'pro' && proId !== user.professional_id) throw new HttpError(403, 'Sem permissão.');
  if (user.role === 'reception') throw new HttpError(403, 'Apenas a proprietária vê comissões.');
};

route('GET', '/api/commissions', ALL, ({ query, sid, user }) => {
  if (user.role === 'reception') throw new HttpError(403, 'Apenas a proprietária vê comissões.');
  const { from, to } = V.range(query);
  const pros = all(`SELECT id,name,color,active FROM professionals WHERE salon_id=? ${user.role === 'pro' ? 'AND id=?' : ''} ORDER BY name`, sid, ...(user.role === 'pro' ? [user.professional_id] : []));
  return pros.map((p) => {
    const period = get(`SELECT COALESCE(SUM(si.net_cents),0) produced, COALESCE(SUM(CASE WHEN si.kind='service' THEN si.net_cents END),0) produced_services,
        COALESCE(SUM(si.commission_cents),0) commission, COUNT(CASE WHEN si.kind='service' THEN 1 END) services_count
        FROM sale_items si JOIN sales s ON s.id=si.sale_id
       WHERE si.professional_id=? AND s.status='active' AND substr(s.created_at,1,10) BETWEEN ? AND ?`, p.id, from, to);
    const pending = get(`SELECT COALESCE(SUM(si.commission_cents),0) v FROM sale_items si JOIN sales s ON s.id=si.sale_id
                          WHERE si.professional_id=? AND s.status='active' AND si.commission_payment_id IS NULL AND si.commission_cents>0`, p.id).v;
    const paid = get(`SELECT COALESCE(SUM(amount_cents),0) v FROM commission_payments WHERE professional_id=? AND substr(created_at,1,10) BETWEEN ? AND ?`, p.id, from, to).v;
    return { ...p, ...period, pending, paid_in_period: paid };
  });
});

route('GET', '/api/commissions/:pro/items', ALL, ({ params, query, sid, user }) => {
  const proId = V.int(params.pro, 'Profissional', { req: true });
  proGuard(user, proId);
  const where = ['si.salon_id=?', 'si.professional_id=?', `s.status='active'`];
  const p = [sid, proId];
  if (query.status === 'pending') where.push('si.commission_payment_id IS NULL', 'si.commission_cents>0');
  else {
    const { from, to } = V.range(query);
    where.push('substr(s.created_at,1,10) BETWEEN ? AND ?');
    p.push(from, to);
  }
  return all(`SELECT si.id, si.name, si.kind, si.net_cents, si.commission_cents, si.commission_note, si.commission_payment_id, s.created_at, c.name AS client_name
                FROM sale_items si JOIN sales s ON s.id=si.sale_id LEFT JOIN clients c ON c.id=s.client_id
               WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC LIMIT 1000`, ...p);
});

/** Paga todas as comissões pendentes até a data informada; cada item só pode ser pago uma vez. */
route('POST', '/api/commissions/pay', OWNER, ({ body, sid, user }) =>
  tx(() => {
    const proId = V.int(body.professional_id, 'Profissional', { req: true });
    if (!get('SELECT 1 x FROM professionals WHERE id=? AND salon_id=?', proId, sid)) throw new HttpError(404, 'Profissional não encontrada.');
    const until = V.date(body.until, 'Até') || today();
    const items = all(`SELECT si.id, si.commission_cents FROM sale_items si JOIN sales s ON s.id=si.sale_id
                        WHERE si.salon_id=? AND si.professional_id=? AND s.status='active' AND si.commission_payment_id IS NULL AND si.commission_cents>0
                          AND substr(s.created_at,1,10)<=?`, sid, proId, until);
    if (!items.length) throw new HttpError(400, 'Não há comissões pendentes até esta data.');
    const amount = items.reduce((s, i) => s + i.commission_cents, 0);
    const payId = run('INSERT INTO commission_payments(salon_id,professional_id,amount_cents,note,created_by,created_at) VALUES(?,?,?,?,?,?)',
      sid, proId, amount, V.str(body.note, 'Observação', { max: 200 }) || `Comissões até ${until.split('-').reverse().join('/')}`, user.id, nowStr()).id;
    for (const i of items) run('UPDATE sale_items SET commission_payment_id=? WHERE id=?', payId, i.id);
    return { id: payId, amount_cents: amount, items: items.length };
  }));

route('GET', '/api/commissions/payments', ALL, ({ query, sid, user }) => {
  const proId = user.role === 'pro' ? user.professional_id : V.int(query.professional_id, 'Profissional');
  if (user.role === 'reception') throw new HttpError(403, 'Sem permissão.');
  return all(`SELECT cp.*, p.name AS pro_name, (SELECT COUNT(*) FROM sale_items WHERE commission_payment_id=cp.id) items
                FROM commission_payments cp JOIN professionals p ON p.id=cp.professional_id
               WHERE cp.salon_id=? ${proId ? 'AND cp.professional_id=?' : ''} ORDER BY cp.id DESC LIMIT 200`, sid, ...(proId ? [proId] : []));
});
