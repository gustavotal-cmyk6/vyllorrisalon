import { route, HttpError, STAFF, ALL } from '../http.js';
import { V } from '../validate.js';
import { all, get, run, tx } from '../db.js';
import { addMin, addDays, dow, toMin, fromMin, today, nowTime, nowStr, diffMin } from '../util.js';
import { servicePriceFor } from './catalog.js';
import { createClient } from './clients.js';

const OPEN = `('scheduled','confirmed','waiting','in_progress','completed')`; // ocupam horário

/** Motivos que impedem o horário (outro atendimento, bloqueio, fora do expediente). */
export async function findConflicts(sid, proId, start, end, excludeVisitId = 0) {
  const out = [];
  const pro = await get('SELECT * FROM professionals WHERE id=? AND salon_id=?', proId, sid);
  const date = start.slice(0, 10);
  if (end.slice(0, 10) !== date) out.push('o atendimento passaria da meia-noite');
  if (!pro.work_days.split(',').includes(String(dow(date)))) out.push(`${pro.name} não trabalha neste dia`);
  const s = start.slice(11), e = end.slice(11);
  if (s < pro.start_time || e > pro.end_time) out.push(`fora do expediente de ${pro.name} (${pro.start_time}–${pro.end_time})`);
  if (pro.break_start && s < pro.break_end && e > pro.break_start) out.push(`intervalo de ${pro.name} (${pro.break_start}–${pro.break_end})`);
  for (const c of await all(
    `SELECT vi.start_at, vi.end_at, c.name FROM visit_items vi JOIN visits v ON v.id=vi.visit_id JOIN clients c ON c.id=v.client_id
      WHERE vi.salon_id=? AND vi.professional_id=? AND v.status IN ${OPEN} AND v.id<>? AND vi.start_at<? AND vi.end_at>?`,
    sid, proId, excludeVisitId, end, start))
    out.push(`${pro.name} já atende ${c.name} das ${c.start_at.slice(11)} às ${c.end_at.slice(11)}`);
  for (const b of await all(
    `SELECT start_at,end_at,reason FROM blocks WHERE salon_id=? AND (professional_id IS NULL OR professional_id=?) AND start_at<? AND end_at>?`,
    sid, proId, end, start))
    out.push(`horário bloqueado${b.reason ? ` (${b.reason})` : ''} das ${b.start_at.slice(11)} às ${b.end_at.slice(11)}`);
  return out;
}

/** Horários livres de uma profissional num dia, para uma duração. */
export async function freeSlots(sid, proId, date, duration, { step = 15, excludeVisitId = 0, fromNow = true } = {}) {
  const pro = await get('SELECT * FROM professionals WHERE id=? AND salon_id=? AND active=1', proId, sid);
  if (!pro || !pro.work_days.split(',').includes(String(dow(date)))) return [];
  const busy = [];
  if (pro.break_start) busy.push([toMin(pro.break_start), toMin(pro.break_end)]);
  const dayStart = `${date} 00:00`, dayEnd = `${addDays(date, 1)} 00:00`;
  for (const r of (await all(`SELECT vi.start_at, vi.end_at FROM visit_items vi JOIN visits v ON v.id=vi.visit_id
                        WHERE vi.salon_id=? AND vi.professional_id=? AND v.status IN ${OPEN} AND v.id<>? AND vi.start_at<? AND vi.end_at>?`,
    sid, proId, excludeVisitId, dayEnd, dayStart)).concat(await all(
    `SELECT start_at,end_at FROM blocks WHERE salon_id=? AND (professional_id IS NULL OR professional_id=?) AND start_at<? AND end_at>?`,
    sid, proId, dayEnd, dayStart)))
    busy.push([Math.max(0, diffMin(dayStart, r.start_at)), Math.min(1440, diffMin(dayStart, r.end_at))]);
  let t = toMin(pro.start_time);
  const end = toMin(pro.end_time);
  if (fromNow && date === today()) {
    const n = toMin(nowTime());
    t = Math.max(t, Math.ceil(n / step) * step);
  } else if (fromNow && date < today()) return [];
  const slots = [];
  for (; t + duration <= end; t += step) if (!busy.some(([a, b]) => t < b && t + duration > a)) slots.push(fromMin(t));
  return slots;
}

route('GET', '/api/availability', ALL, async ({ query, sid }) => {
  const date = V.date(query.date, 'Data', { req: true });
  const duration = V.int(query.duration, 'Duração', { req: true, min: 5, max: 720 });
  const pro = V.int(query.professional_id, 'Profissional', { req: true });
  return { slots: await freeSlots(sid, pro, date, duration, { excludeVisitId: V.int(query.exclude_visit, 'Visita') || 0 }) };
});

// ---- Leitura da agenda ----
export async function loadVisits(sid, where, ...p) {
  const visits = await all(`SELECT v.*, c.name AS client_name, c.phone AS client_phone, c.notes AS client_notes,
      (SELECT s.id FROM sales s WHERE s.visit_id=v.id AND s.status='active') AS sale_id
      FROM visits v JOIN clients c ON c.id=v.client_id WHERE v.salon_id=? AND ${where} ORDER BY v.date`, sid, ...p);
  if (!visits.length) return [];
  const ids = visits.map((v) => v.id);
  const items = await all(`SELECT vi.*, s.name AS service_name, p.name AS pro_name, p.color AS pro_color
                       FROM visit_items vi JOIN services s ON s.id=vi.service_id JOIN professionals p ON p.id=vi.professional_id
                      WHERE vi.visit_id IN (${ids.map(() => '?').join(',')}) ORDER BY vi.start_at`, ...ids);
  for (const v of visits) {
    v.items = items.filter((i) => i.visit_id === v.id);
    v.start_at = v.items[0]?.start_at;
    v.end_at = v.items.reduce((m, i) => (i.end_at > m ? i.end_at : m), '');
    v.total_cents = v.items.reduce((s, i) => s + i.price_cents, 0);
  }
  return visits.sort((a, b) => (a.start_at < b.start_at ? -1 : 1));
}

route('GET', '/api/agenda', ALL, async ({ query, sid, user }) => {
  const from = V.date(query.from, 'De', { req: true });
  const to = V.date(query.to || query.from, 'Até', { req: true });
  let pro = V.int(query.professional_id, 'Profissional');
  if (user.role === 'pro') pro = user.professional_id;
  let visits = await loadVisits(sid, 'v.date BETWEEN ? AND ?', from, to);
  if (pro) visits = visits.filter((v) => v.items.some((i) => i.professional_id === pro));
  if (query.hide_cancelled) visits = visits.filter((v) => !['cancelled', 'no_show'].includes(v.status));
  const blocks = await all(`SELECT b.*, p.name AS pro_name FROM blocks b LEFT JOIN professionals p ON p.id=b.professional_id
                       WHERE b.salon_id=? AND b.start_at<? AND b.end_at>? ${pro ? 'AND (b.professional_id IS NULL OR b.professional_id=?)' : ''} ORDER BY b.start_at`,
    sid, `${addDays(to, 1)} 00:00`, `${from} 00:00`, ...(pro ? [pro] : []));
  return { visits, blocks };
});

route('GET', '/api/visits/:id', ALL, async ({ params, sid, user }) => {
  const v = (await loadVisits(sid, 'v.id=?', params.id))[0];
  if (!v || (user.role === 'pro' && !v.items.some((i) => i.professional_id === user.professional_id))) throw new HttpError(404, 'Agendamento não encontrado.');
  return v;
});

// ---- Criação / edição ----
async function parseItems(body, sid) {
  if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, 'Inclua ao menos um serviço.');
  if (body.items.length > 12) throw new HttpError(400, 'Serviços demais em uma única visita.');
  const items = [];
  for (const [i, it] of body.items.entries()) {
    const label = `Serviço ${i + 1}`;
    const service = await get('SELECT * FROM services WHERE id=? AND salon_id=? AND active=1', V.int(it.service_id, label, { req: true }), sid);
    if (!service) throw new HttpError(400, `${label}: serviço inválido.`);
    const proId = V.int(it.professional_id, `${label} – profissional`, { req: true });
    if (!await get('SELECT 1 x FROM professionals WHERE id=? AND salon_id=? AND active=1', proId, sid)) throw new HttpError(400, `${label}: profissional inválida.`);
    if (!await get('SELECT 1 x FROM service_pros WHERE service_id=? AND professional_id=?', service.id, proId))
      throw new HttpError(400, `${label}: esta profissional não está habilitada para ${service.name}.`);
    const start = V.datetime(it.start_at, `${label} – horário`, { req: true });
    const duration = V.int(it.duration_min, `${label} – duração`, { min: 5, max: 720 }) || service.duration_min;
    items.push({
      service, proId, start, duration, end: addMin(start, duration),
      price: V.cents(it.price_cents, `${label} – preço`) ?? (await servicePriceFor(service.id, proId)),
    });
  }
  const date = items[0].start.slice(0, 10);
  if (items.some((i) => i.start.slice(0, 10) !== date)) throw new HttpError(400, 'Todos os serviços da visita devem ser no mesmo dia.');
  return { items, date };
}

async function checkConflicts(sid, items, excludeVisitId, force) {
  const problems = [];
  for (const [i, it] of items.entries()) {
    const c = await findConflicts(sid, it.proId, it.start, it.end, excludeVisitId);
    items.slice(0, i).forEach((o) => {
      if (o.proId === it.proId && o.start < it.end && o.end > it.start) c.push(`${it.service.name} e ${o.service.name} se sobrepõem para a mesma profissional`);
    });
    it.overbook = c.length ? 1 : 0;
    problems.push(...c.map((m) => `${it.service.name} às ${it.start.slice(11)}: ${m}`));
  }
  if (problems.length && !force) throw new HttpError(409, 'Conflito de horário', { code: 'conflict', conflicts: problems });
}

async function insertItems(sid, visitId, items) {
  await run('DELETE FROM visit_items WHERE visit_id=?', visitId);
  for (const it of items)
    await run(`INSERT INTO visit_items(salon_id,visit_id,service_id,professional_id,start_at,end_at,duration_min,price_cents,overbook) VALUES(?,?,?,?,?,?,?,?,?)`,
      sid, visitId, it.service.id, it.proId, it.start, it.end, it.duration, it.price, it.overbook);
}

function assertProOwn(user, items) {
  if (user.role === 'pro' && items.some((i) => i.proId !== user.professional_id))
    throw new HttpError(403, 'Você só pode agendar na sua própria agenda.');
}

route('POST', '/api/visits', ALL, async ({ body, sid, user }) => {
  const { items, date } = await parseItems(body, sid);
  assertProOwn(user, items);
  await checkConflicts(sid, items, 0, !!body.force);
  return await tx(async () => {
    let clientId = V.int(body.client_id, 'Cliente');
    if (!clientId && body.new_client) clientId = await createClient(sid, body.new_client);
    if (!clientId || !await get('SELECT 1 x FROM clients WHERE id=? AND salon_id=?', clientId, sid)) throw new HttpError(400, 'Selecione a cliente.');
    const status = V.oneOf(body.status, ['scheduled', 'confirmed', 'waiting'], 'Status') || 'scheduled';
    const id = (await run('INSERT INTO visits(salon_id,client_id,date,status,notes,created_by,created_at) VALUES(?,?,?,?,?,?,?)',
      sid, clientId, date, status, V.str(body.notes, 'Observações', { max: 500 }), user.id, nowStr())).id;
    await insertItems(sid, id, items);
    return { id };
  });
});

async function editableVisit(sid, id, user) {
  const v = (await loadVisits(sid, 'v.id=?', id))[0];
  if (!v) throw new HttpError(404, 'Agendamento não encontrado.');
  if (user.role === 'pro' && !v.items.every((i) => i.professional_id === user.professional_id))
    throw new HttpError(403, 'Este agendamento envolve outras profissionais; peça à recepção.');
  if (v.status === 'completed' || v.sale_id) throw new HttpError(409, 'Este atendimento já foi concluído e não pode ser alterado.');
  return v;
}

route('PUT', '/api/visits/:id', ALL, async ({ params, body, sid, user }) => {
  const v = await editableVisit(sid, params.id, user);
  const { items, date } = await parseItems(body, sid);
  assertProOwn(user, items);
  await checkConflicts(sid, items, v.id, !!body.force);
  await tx(async () => {
    const reopen = ['cancelled', 'no_show'].includes(v.status) ? 'scheduled' : v.status;
    await run('UPDATE visits SET date=?, notes=?, status=? WHERE id=?', date, V.str(body.notes, 'Observações', { max: 500 }), reopen, v.id);
    await insertItems(sid, v.id, items);
  });
  return { ok: true };
});

/** Reagendamento rápido: move toda a visita mantendo os intervalos entre os serviços. */
route('POST', '/api/visits/:id/reschedule', ALL, async ({ params, body, sid, user }) => {
  const v = await editableVisit(sid, params.id, user);
  const start = V.datetime(body.start_at, 'Novo horário', { req: true });
  const delta = diffMin(v.start_at, start);
  const newPro = V.int(body.professional_id, 'Profissional');
  const items = v.items.map((i) => ({
    service: { id: i.service_id, name: i.service_name },
    proId: newPro && v.items.length === 1 ? newPro : i.professional_id,
    start: addMin(i.start_at, delta), end: addMin(i.end_at, delta), duration: i.duration_min, price: i.price_cents,
  }));
  if (newPro && v.items.length === 1 && !await get('SELECT 1 x FROM service_pros WHERE service_id=? AND professional_id=?', items[0].service.id, newPro))
    throw new HttpError(400, 'Esta profissional não está habilitada para o serviço.');
  if (items.some((i) => i.start.slice(0, 10) !== start.slice(0, 10))) throw new HttpError(400, 'A visita passaria da meia-noite.');
  await checkConflicts(sid, items, v.id, !!body.force);
  await tx(async () => {
    await run(`UPDATE visits SET date=?, status=CASE WHEN status IN ('cancelled','no_show') THEN 'scheduled' ELSE status END WHERE id=?`, start.slice(0, 10), v.id);
    await insertItems(sid, v.id, items);
  });
  return { ok: true };
});

const TRANSITIONS = {
  scheduled: ['confirmed', 'waiting', 'in_progress', 'cancelled', 'no_show'],
  confirmed: ['scheduled', 'waiting', 'in_progress', 'cancelled', 'no_show'],
  waiting: ['confirmed', 'in_progress', 'cancelled', 'no_show'],
  in_progress: ['waiting', 'cancelled'],
  cancelled: ['scheduled'],
  no_show: ['scheduled'],
  completed: [],
};
route('POST', '/api/visits/:id/status', ALL, async ({ params, body, sid, user }) => {
  const v = (await loadVisits(sid, 'v.id=?', params.id))[0];
  if (!v) throw new HttpError(404, 'Agendamento não encontrado.');
  if (user.role === 'pro' && !v.items.some((i) => i.professional_id === user.professional_id)) throw new HttpError(403, 'Sem permissão.');
  const status = V.oneOf(body.status, Object.keys(TRANSITIONS), 'Status', { req: true });
  if (v.sale_id || !TRANSITIONS[v.status].includes(status))
    throw new HttpError(409, v.status === 'completed' ? 'Atendimento já concluído. Para desfazer, estorne a venda.' : 'Mudança de status não permitida.');
  let late = v.late_min;
  if (body.late_min !== undefined) late = V.int(body.late_min, 'Atraso (min)', { min: 0, max: 600 });
  else if (status === 'waiting' && v.start_at.slice(0, 10) === today()) late = Math.max(0, diffMin(v.start_at, `${today()} ${nowTime()}`));
  await run('UPDATE visits SET status=?, late_min=? WHERE id=?', status, late, v.id);
  return { ok: true, late_min: late };
});

// ---- Bloqueios, folgas e intervalos avulsos ----
route('POST', '/api/blocks', STAFF, async ({ body, sid }) => {
  const pro = V.int(body.professional_id, 'Profissional');
  if (pro && !await get('SELECT 1 x FROM professionals WHERE id=? AND salon_id=?', pro, sid)) throw new HttpError(400, 'Profissional inválida.');
  const start = V.datetime(body.start_at, 'Início', { req: true });
  const end = V.datetime(body.end_at, 'Fim', { req: true });
  if (end <= start) throw new HttpError(400, 'O fim deve ser depois do início.');
  return { id: (await run('INSERT INTO blocks(salon_id,professional_id,start_at,end_at,reason) VALUES(?,?,?,?,?)', sid, pro, start, end, V.str(body.reason, 'Motivo', { max: 80 }))).id };
});
route('DELETE', '/api/blocks/:id', STAFF, async ({ params, sid }) => {
  await run('DELETE FROM blocks WHERE id=? AND salon_id=?', params.id, sid);
  return { ok: true };
});
