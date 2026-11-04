import { route, HttpError, OWNER, ALL } from '../http.js';
import { V } from '../validate.js';
import { all, get, run, tx } from '../db.js';

// Comissão: 'pct' guarda percentual (ex.: 40); 'fixed' guarda centavos por atendimento.
function commission(type, value, label, { req = false } = {}) {
  type = V.oneOf(type, ['pct', 'fixed'], `${label} (tipo)`, { req });
  if (!type) return { type: null, value: null };
  value = type === 'pct' ? V.num(value, label, { req: true, min: 0, max: 100 }) : V.cents(value, label, { req: true });
  return { type, value };
}

// ---- Profissionais ----
const proSelect = `SELECT id,name,specialty,phone,color,work_days,start_time,end_time,break_start,break_end,
  commission_type,commission_value,product_commission_pct,active FROM professionals`;

route('GET', '/api/professionals', ALL, async ({ sid, user }) => {
  if (user.role === 'pro') return await all(`${proSelect} WHERE salon_id=? AND id=?`, sid, user.professional_id);
  return await all(`${proSelect} WHERE salon_id=? ORDER BY active DESC, name`, sid);
});

function proFields(b) {
  const days = [...new Set(String(b.work_days ?? '').split(',').filter((x) => x !== '').map((x) => V.int(x, 'Dia da semana', { min: 0, max: 6 })))].sort();
  const start = V.time(b.start_time, 'Início do expediente', { req: true });
  const end = V.time(b.end_time, 'Fim do expediente', { req: true });
  if (end <= start) throw new HttpError(400, 'O fim do expediente deve ser depois do início.');
  const bs = V.time(b.break_start, 'Início do intervalo');
  const be = V.time(b.break_end, 'Fim do intervalo');
  if ((bs && !be) || (!bs && be) || (bs && be <= bs)) throw new HttpError(400, 'Intervalo inválido.');
  const c = commission(b.commission_type || 'pct', b.commission_value ?? 0, 'Comissão', { req: true });
  return {
    name: V.str(b.name, 'Nome', { req: true, max: 60 }),
    specialty: V.str(b.specialty, 'Especialidade', { max: 60 }),
    phone: V.phone(b.phone, 'Telefone'),
    color: /^#[0-9a-fA-F]{6}$/.test(b.color || '') ? b.color : '#b4548c',
    work_days: days.join(','), start, end, bs, be, c,
    pp: V.num(b.product_commission_pct ?? 0, 'Comissão de produtos', { min: 0, max: 100 }),
  };
}
route('POST', '/api/professionals', OWNER, async ({ body, sid }) => {
  const f = proFields(body);
  return {
    id: (await run(`INSERT INTO professionals(salon_id,name,specialty,phone,color,work_days,start_time,end_time,break_start,break_end,commission_type,commission_value,product_commission_pct)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, sid, f.name, f.specialty, f.phone, f.color, f.work_days, f.start, f.end, f.bs, f.be, f.c.type, f.c.value, f.pp)).id,
  };
});
route('PUT', '/api/professionals/:id', OWNER, async ({ params, body, sid }) => {
  if (!await get('SELECT 1 x FROM professionals WHERE id=? AND salon_id=?', params.id, sid)) throw new HttpError(404, 'Profissional não encontrada.');
  const f = proFields(body);
  await run(`UPDATE professionals SET name=?,specialty=?,phone=?,color=?,work_days=?,start_time=?,end_time=?,break_start=?,break_end=?,
       commission_type=?,commission_value=?,product_commission_pct=?,active=? WHERE id=?`,
    f.name, f.specialty, f.phone, f.color, f.work_days, f.start, f.end, f.bs, f.be, f.c.type, f.c.value, f.pp, V.bool(body.active ?? 1), params.id);
  return { ok: true };
});

// ---- Categorias ----
route('GET', '/api/categories', ALL, async ({ sid }) => await all('SELECT id,name FROM categories WHERE salon_id=? ORDER BY name', sid));
route('POST', '/api/categories', OWNER, async ({ body, sid }) => {
  const name = V.str(body.name, 'Nome', { req: true, max: 40 });
  if (await get('SELECT 1 x FROM categories WHERE salon_id=? AND name=?', sid, name)) throw new HttpError(409, 'Essa categoria já existe.');
  return { id: (await run('INSERT INTO categories(salon_id,name) VALUES(?,?)', sid, name)).id };
});
route('PUT', '/api/categories/:id', OWNER, async ({ params, body, sid }) => {
  const name = V.str(body.name, 'Nome', { req: true, max: 40 });
  if (await get('SELECT 1 x FROM categories WHERE salon_id=? AND name=? AND id<>?', sid, name, params.id)) throw new HttpError(409, 'Essa categoria já existe.');
  const r = await run('UPDATE categories SET name=? WHERE id=? AND salon_id=?', name, params.id, sid);
  if (!r.changes) throw new HttpError(404, 'Categoria não encontrada.');
  return { ok: true };
});
route('DELETE', '/api/categories/:id', OWNER, async ({ params, sid }) => {
  if (await get('SELECT 1 x FROM services WHERE category_id=? AND salon_id=?', params.id, sid))
    throw new HttpError(409, 'Há serviços nesta categoria. Mova-os antes de excluir.');
  await run('DELETE FROM categories WHERE id=? AND salon_id=?', params.id, sid);
  return { ok: true };
});

// ---- Serviços ----
async function loadServices(sid, where = '', ...p) {
  const list = await all(
    `SELECT s.*, c.name AS category_name FROM services s LEFT JOIN categories c ON c.id=s.category_id
      WHERE s.salon_id=? ${where} ORDER BY s.active DESC, c.name, s.name`, sid, ...p);
  const links = await all(
    `SELECT sp.service_id, sp.professional_id, sp.price_cents, sp.commission_type, sp.commission_value
       FROM service_pros sp JOIN services s ON s.id=sp.service_id WHERE s.salon_id=?`, sid);
  for (const s of list) s.pros = links.filter((l) => l.service_id === s.id);
  return list;
}
route('GET', '/api/services', ALL, async ({ sid, query }) => loadServices(sid, query.all ? '' : 'AND s.active=1'));

async function serviceFields(b, sid) {
  const c = commission(b.commission_type, b.commission_value, 'Comissão do serviço');
  let category_id = V.int(b.category_id, 'Categoria');
  if (category_id && !await get('SELECT 1 x FROM categories WHERE id=? AND salon_id=?', category_id, sid)) throw new HttpError(400, 'Categoria inválida.');
  const pros = [];
  for (const p of Array.isArray(b.pros) ? b.pros : []) {
    const pid = V.int(p.professional_id, 'Profissional', { req: true });
    if (!await get('SELECT 1 x FROM professionals WHERE id=? AND salon_id=?', pid, sid)) throw new HttpError(400, 'Profissional inválida.');
    const pc = commission(p.commission_type, p.commission_value, 'Comissão da profissional');
    pros.push({ pid, price: V.cents(p.price_cents, 'Preço da profissional'), ct: pc.type, cv: pc.value });
  }
  if (!pros.length) throw new HttpError(400, 'Selecione ao menos uma profissional habilitada para este serviço.');
  return {
    name: V.str(b.name, 'Nome', { req: true, max: 80 }), category_id, description: V.str(b.description, 'Descrição', { max: 300 }),
    price: V.cents(b.price_cents, 'Preço', { req: true }), duration: V.int(b.duration_min, 'Duração (min)', { req: true, min: 5, max: 720 }),
    c, online: V.bool(b.online), pros,
  };
}
async function saveLinks(serviceId, pros) {
  await run('DELETE FROM service_pros WHERE service_id=?', serviceId);
  for (const p of pros) await run('INSERT INTO service_pros(service_id,professional_id,price_cents,commission_type,commission_value) VALUES(?,?,?,?,?)', serviceId, p.pid, p.price, p.ct, p.cv);
}
route('POST', '/api/services', OWNER, async ({ body, sid }) => {
  const f = await serviceFields(body, sid);
  return await tx(async () => {
    const id = (await run(`INSERT INTO services(salon_id,category_id,name,description,price_cents,duration_min,commission_type,commission_value,online)
                    VALUES(?,?,?,?,?,?,?,?,?)`, sid, f.category_id, f.name, f.description, f.price, f.duration, f.c.type, f.c.value, f.online)).id;
    await saveLinks(id, f.pros);
    return { id };
  });
});
route('PUT', '/api/services/:id', OWNER, async ({ params, body, sid }) => {
  if (!await get('SELECT 1 x FROM services WHERE id=? AND salon_id=?', params.id, sid)) throw new HttpError(404, 'Serviço não encontrado.');
  const f = await serviceFields(body, sid);
  await tx(async () => {
    await run(`UPDATE services SET category_id=?,name=?,description=?,price_cents=?,duration_min=?,commission_type=?,commission_value=?,online=?,active=? WHERE id=?`,
      f.category_id, f.name, f.description, f.price, f.duration, f.c.type, f.c.value, f.online, V.bool(body.active ?? 1), params.id);
    await saveLinks(Number(params.id), f.pros);
  });
  return { ok: true };
});

/** Preço e comissão efetivos de um serviço para uma profissional (regras: profissional+serviço > serviço > padrão da profissional). */
export async function servicePriceFor(serviceId, proId) {
  const s = await get('SELECT price_cents FROM services WHERE id=?', serviceId);
  const l = await get('SELECT price_cents FROM service_pros WHERE service_id=? AND professional_id=?', serviceId, proId);
  return l?.price_cents ?? s.price_cents;
}
export async function serviceCommissionRule(serviceId, proId) {
  const l = await get('SELECT commission_type t, commission_value v FROM service_pros WHERE service_id=? AND professional_id=?', serviceId, proId);
  if (l?.t) return { type: l.t, value: l.v, note: 'regra da profissional neste serviço' };
  const s = await get('SELECT commission_type t, commission_value v FROM services WHERE id=?', serviceId);
  if (s?.t) return { type: s.t, value: s.v, note: 'regra do serviço' };
  const p = await get('SELECT commission_type t, commission_value v FROM professionals WHERE id=?', proId);
  return { type: p.t, value: p.v, note: 'padrão da profissional' };
}
