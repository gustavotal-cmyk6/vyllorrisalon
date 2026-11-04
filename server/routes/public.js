// Agendamento online: rotas públicas (sem login). Nunca devolvem dados de outras clientes.
import { route, HttpError } from '../http.js';
import { V } from '../validate.js';
import { all, get, run, tx } from '../db.js';
import { addMin, addDays, today, nowStr } from '../util.js';
import { freeSlots, findConflicts } from './agenda.js';

const MAX_DAYS = 60;
const hits = new Map();
function throttle(req, limit) {
  const key = `${req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress}`;
  const now = Date.now();
  const rec = (hits.get(key) || []).filter((t) => now - t < 3600_000);
  if (rec.length >= limit) throw new HttpError(429, 'Muitas tentativas. Tente novamente mais tarde ou fale com o salão.');
  rec.push(now);
  hits.set(key, rec);
}

async function salonBySlug(slug) {
  const s = await get('SELECT id, name, booking_enabled FROM salons WHERE slug=?', String(slug).toLowerCase());
  if (!s || !s.booking_enabled) throw new HttpError(404, 'Agendamento online indisponível para este salão.');
  return s;
}

async function onlineService(sid, serviceId) {
  const s = await get('SELECT * FROM services WHERE id=? AND salon_id=? AND active=1 AND online=1', serviceId, sid);
  if (!s) throw new HttpError(400, 'Serviço indisponível para agendamento online.');
  s.pros = await all(`SELECT p.id, p.name, COALESCE(sp.price_cents, ?) AS price_cents FROM service_pros sp JOIN professionals p ON p.id=sp.professional_id
                       WHERE sp.service_id=? AND p.active=1 ORDER BY p.name`, s.price_cents, s.id);
  return s;
}

route('GET', '/api/public/:slug', null, async ({ params }) => {
  const salon = await salonBySlug(params.slug);
  const services = await all(`SELECT s.id, s.name, s.description, s.price_cents, s.duration_min, c.name AS category
                                FROM services s LEFT JOIN categories c ON c.id=s.category_id
                               WHERE s.salon_id=? AND s.active=1 AND s.online=1 ORDER BY c.name, s.name`, salon.id);
  const links = await all(`SELECT sp.service_id, p.id, p.name, p.specialty, sp.price_cents FROM service_pros sp JOIN professionals p ON p.id=sp.professional_id
                            JOIN services s ON s.id=sp.service_id WHERE s.salon_id=? AND s.online=1 AND p.active=1 ORDER BY p.name`, salon.id);
  for (const s of services) s.pros = links.filter((l) => l.service_id === s.id).map((l) => ({ id: l.id, name: l.name, specialty: l.specialty, price_cents: l.price_cents ?? s.price_cents }));
  return { name: salon.name, max_days: MAX_DAYS, services: services.filter((s) => s.pros.length) };
});

/** Horários livres; sem profissional definida, junta os horários de todas as habilitadas. */
route('GET', '/api/public/:slug/slots', null, async ({ params, query, req }) => {
  throttle(req, 600);
  const salon = await salonBySlug(params.slug);
  const service = await onlineService(salon.id, V.int(query.service_id, 'Serviço', { req: true }));
  const date = V.date(query.date, 'Data', { req: true });
  if (date < today() || date > addDays(today(), MAX_DAYS)) return { slots: [] };
  const proId = V.int(query.professional_id, 'Profissional');
  const pros = proId ? service.pros.filter((p) => p.id === proId) : service.pros;
  const set = new Set();
  for (const p of pros) for (const t of await freeSlots(salon.id, p.id, date, service.duration_min, { step: 30 })) set.add(t);
  return { slots: [...set].sort() };
});

route('POST', '/api/public/:slug/book', null, async ({ params, body, req }) => {
  throttle(req, 15);
  const salon = await salonBySlug(params.slug);
  const service = await onlineService(salon.id, V.int(body.service_id, 'Serviço', { req: true }));
  const start = V.datetime(body.start_at, 'Horário', { req: true });
  const date = start.slice(0, 10);
  if (`${date}` < today() || date > addDays(today(), MAX_DAYS) || start <= nowStr().slice(0, 16)) throw new HttpError(400, 'Escolha um horário futuro.');
  const name = V.str(body.name, 'Seu nome', { req: true, max: 80 });
  const phone = V.phone(body.phone, 'WhatsApp');
  if (!phone) throw new HttpError(400, 'WhatsApp: campo obrigatório');
  const notes = V.str(body.notes, 'Observação', { max: 300 });
  const end = addMin(start, service.duration_min);
  // profissional escolhida, ou a primeira livre nesse horário
  const wanted = V.int(body.professional_id, 'Profissional');
  const candidates = wanted ? service.pros.filter((p) => p.id === wanted) : service.pros;
  if (!candidates.length) throw new HttpError(400, 'Profissional indisponível para este serviço.');

  return tx(async () => {
    let pro = null;
    for (const p of candidates) if (!(await findConflicts(salon.id, p.id, start, end)).length) { pro = p; break; }
    if (!pro) throw new HttpError(409, 'Este horário acabou de ser ocupado. Escolha outro, por favor.');
    let client = await get('SELECT id FROM clients WHERE salon_id=? AND phone=? AND active=1 ORDER BY id LIMIT 1', salon.id, phone);
    const clientId = client?.id ?? (await run('INSERT INTO clients(salon_id,name,phone,created_at) VALUES(?,?,?,?)', salon.id, name, phone, nowStr())).id;
    const dup = await get(`SELECT 1 x FROM visits WHERE salon_id=? AND client_id=? AND date=? AND status IN ('scheduled','confirmed') AND source='online'`, salon.id, clientId, date);
    if (dup) throw new HttpError(409, 'Você já tem um agendamento online neste dia. Para mudar, fale com o salão.');
    const visitId = (await run(`INSERT INTO visits(salon_id,client_id,date,status,notes,source,created_at) VALUES(?,?,?,?,?,?,?)`,
      salon.id, clientId, date, 'scheduled', `Agendado online${client ? '' : ` por ${name}`}${notes ? ' — ' + notes : ''}`, 'online', nowStr())).id;
    await run(`INSERT INTO visit_items(salon_id,visit_id,service_id,professional_id,start_at,end_at,duration_min,price_cents) VALUES(?,?,?,?,?,?,?,?)`,
      salon.id, visitId, service.id, pro.id, start, end, service.duration_min, pro.price_cents);
    return { ok: true, salon: salon.name, service: service.name, professional: pro.name, start_at: start, price_cents: pro.price_cents };
  });
});
