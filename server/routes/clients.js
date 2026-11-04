import { route, HttpError, STAFF, ALL } from '../http.js';
import { V } from '../validate.js';
import { all, get, run } from '../db.js';
import { nowStr, today, diffDays } from '../util.js';

const seeMoney = (user) => user.role !== 'pro';

async function fields(b, sid) {
  let birthday = V.str(b.birthday, 'Aniversário', { max: 10 });
  if (birthday && !/^(\d{4}-)?\d{2}-\d{2}$/.test(birthday)) throw new HttpError(400, 'Aniversário: data inválida');
  const preferred = V.int(b.preferred_pro_id, 'Profissional preferida');
  if (preferred && !await get('SELECT 1 x FROM professionals WHERE id=? AND salon_id=?', preferred, sid)) throw new HttpError(400, 'Profissional inválida.');
  return {
    name: V.str(b.name, 'Nome', { req: true, max: 80 }), phone: V.phone(b.phone, 'Telefone'),
    birthday, preferred, notes: V.str(b.notes, 'Observações', { max: 2000 }),
  };
}

export async function createClient(sid, b) {
  const f = await fields(b, sid);
  if (f.phone) {
    const dup = await get('SELECT id,name FROM clients WHERE salon_id=? AND phone=? AND active=1', sid, f.phone);
    if (dup && !b.allow_duplicate) throw new HttpError(409, `Já existe uma cliente com esse telefone: ${dup.name}.`, { code: 'duplicate', client_id: dup.id });
  }
  return (await run('INSERT INTO clients(salon_id,name,phone,birthday,preferred_pro_id,notes,created_at) VALUES(?,?,?,?,?,?,?)',
    sid, f.name, f.phone, f.birthday, f.preferred, f.notes, nowStr())).id;
}

const STATS = `
  (SELECT MAX(substr(s.created_at,1,10)) FROM sales s WHERE s.client_id=c.id AND s.status='active') AS last_visit,
  (SELECT COUNT(*) FROM sales s WHERE s.client_id=c.id AND s.status='active') AS visits_count,
  (SELECT COALESCE(SUM(s.total_cents),0) FROM sales s WHERE s.client_id=c.id AND s.status='active') AS spent_cents`;

route('GET', '/api/clients', ALL, async ({ sid, query, user }) => {
  const q = (query.q || '').trim();
  const where = ['c.salon_id=?', 'c.active=1'];
  const p = [sid];
  if (q) {
    where.push('(c.name LIKE ? OR c.phone LIKE ?)');
    p.push(`%${q}%`, `%${q.replace(/\D/g, '') || '@@'}%`);
  }
  let rows = await all(`SELECT c.id,c.name,c.phone,c.birthday,c.preferred_pro_id,c.created_at, ${STATS},
      (SELECT name FROM professionals WHERE id=c.preferred_pro_id) AS preferred_pro_name
      FROM clients c WHERE ${where.join(' AND ')} ORDER BY c.name LIMIT 500`, ...p);
  const t = today();
  if (query.filter === 'inactive') rows = rows.filter((r) => r.last_visit && diffDays(r.last_visit, t) > 60);
  if (query.filter === 'new') rows = rows.filter((r) => !r.visits_count);
  if (query.filter === 'birthday') {
    const m = t.slice(5, 7);
    rows = rows.filter((r) => r.birthday && r.birthday.slice(-5, -3) === m);
  }
  if (!seeMoney(user)) rows.forEach((r) => delete r.spent_cents);
  return rows;
});

route('POST', '/api/clients', ALL, async ({ body, sid }) => ({ id: await createClient(sid, body) }));

route('PUT', '/api/clients/:id', ALL, async ({ params, body, sid }) => {
  if (!await get('SELECT 1 x FROM clients WHERE id=? AND salon_id=?', params.id, sid)) throw new HttpError(404, 'Cliente não encontrada.');
  const f = await fields(body, sid);
  await run('UPDATE clients SET name=?,phone=?,birthday=?,preferred_pro_id=?,notes=? WHERE id=?', f.name, f.phone, f.birthday, f.preferred, f.notes, params.id);
  return { ok: true };
});

route('DELETE', '/api/clients/:id', STAFF, async ({ params, sid }) => {
  // Arquiva (preserva histórico financeiro), nunca apaga
  const r = await run('UPDATE clients SET active=0 WHERE id=? AND salon_id=?', params.id, sid);
  if (!r.changes) throw new HttpError(404, 'Cliente não encontrada.');
  return { ok: true };
});

route('GET', '/api/clients/:id', ALL, async ({ params, sid, user }) => {
  const c = await get(`SELECT c.*, ${STATS}, (SELECT name FROM professionals WHERE id=c.preferred_pro_id) AS preferred_pro_name
                   FROM clients c WHERE c.id=? AND c.salon_id=?`, params.id, sid);
  if (!c) throw new HttpError(404, 'Cliente não encontrada.');
  const money = seeMoney(user);
  const sales = await all(`SELECT id, substr(created_at,1,10) AS date, total_cents, discount_cents,
      (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE sale_id=sales.id) AS paid_cents,
      (SELECT GROUP_CONCAT(DISTINCT method) FROM payments WHERE sale_id=sales.id) AS methods
      FROM sales WHERE client_id=? AND status='active' ORDER BY created_at DESC LIMIT 100`, c.id);
  const items = await all(`SELECT si.sale_id, si.kind, si.name, si.service_id, si.qty, si.net_cents, p.name AS pro_name, si.professional_id
                       FROM sale_items si LEFT JOIN professionals p ON p.id=si.professional_id
                      WHERE si.sale_id IN (SELECT id FROM sales WHERE client_id=? AND status='active')`, c.id);
  const history = sales.map((s) => ({
    ...s, total_cents: money ? s.total_cents : undefined, paid_cents: money ? s.paid_cents : undefined, discount_cents: money ? s.discount_cents : undefined, methods: money ? s.methods : undefined,
    items: items.filter((i) => i.sale_id === s.id).map((i) => ({ ...i, net_cents: money ? i.net_cents : undefined })),
  }));
  // última vez de cada serviço, serviços favoritos e profissional habitual
  const lastByService = await all(`SELECT si.name, MAX(substr(s.created_at,1,10)) AS last_date, COUNT(*) AS times
                               FROM sale_items si JOIN sales s ON s.id=si.sale_id
                              WHERE s.client_id=? AND s.status='active' AND si.kind='service' GROUP BY si.name ORDER BY times DESC, last_date DESC`, c.id);
  const usualPro = await get(`SELECT p.name, COUNT(*) AS n FROM sale_items si JOIN sales s ON s.id=si.sale_id JOIN professionals p ON p.id=si.professional_id
                         WHERE s.client_id=? AND s.status='active' AND si.kind='service' GROUP BY p.id ORDER BY n DESC LIMIT 1`, c.id);
  const dates = sales.map((s) => s.date).reverse();
  const avgInterval = dates.length > 1 ? Math.round(diffDays(dates[0], dates[dates.length - 1]) / (dates.length - 1)) : null;
  const upcoming = await all(`SELECT v.id, v.date, v.status, MIN(vi.start_at) AS start_at, GROUP_CONCAT(sv.name, ', ') AS services
                          FROM visits v JOIN visit_items vi ON vi.visit_id=v.id JOIN services sv ON sv.id=vi.service_id
                         WHERE v.client_id=? AND v.date>=? AND v.status IN ('scheduled','confirmed','waiting','in_progress') GROUP BY v.id ORDER BY v.date`, c.id, today());
  const missed = (await get(`SELECT COUNT(*) n FROM visits WHERE client_id=? AND status='no_show'`, c.id)).n;
  if (!money) delete c.spent_cents;
  return { client: c, history, last_by_service: lastByService, usual_pro: usualPro?.name || null, avg_interval_days: avgInterval, upcoming, no_shows: missed };
});
