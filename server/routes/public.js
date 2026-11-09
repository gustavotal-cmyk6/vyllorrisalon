// Agendamento online: rotas públicas (sem login). Nunca devolvem dados de outras clientes.
import crypto from 'node:crypto';
import { route, HttpError } from '../http.js';
import { V } from '../validate.js';
import { all, get, run, tx } from '../db.js';
import { addMin, addDays, today, nowStr, diffMin, fmtBRL } from '../util.js';
import { freeSlots, findConflicts } from './agenda.js';
import { salonProfile } from './account.js';
import { imageUrl } from './images.js';
import { salonPayCfg, travelFee, depositFor, createCharge, sweepCharges, retainCharge } from './deposits.js';
import { qrSvg } from '../pix.js';
import { notifyStaff } from '../push.js';
import { billingInfo } from '../billing.js';


const MAX_DAYS = 60;
const hits = new Map();
function throttle(req, limit, bucket = '') {
  const key = `${bucket}|${req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress}`;
  const now = Date.now();
  const rec = (hits.get(key) || []).filter((t) => now - t < 3600_000);
  if (rec.length >= limit * (Number(process.env.RATE_LIMIT_MULT) || 1)) throw new HttpError(429, 'Muitas tentativas. Tente novamente mais tarde ou fale com o salão.');
  rec.push(now);
  hits.set(key, rec);
}

async function salonBySlug(slug) {
  const s = await get('SELECT id, name, booking_enabled, cancel_hours, address, phone, is_demo, team_mode, sub_status, trial_ends_at, paid_until FROM salons WHERE slug=?', String(slug).toLowerCase());
  if (!s || !s.booking_enabled) throw new HttpError(404, 'Agendamento online indisponível para este salão.');
  if (billingInfo(s).blocked) throw new HttpError(404, 'O agendamento online deste salão está pausado no momento. Fale direto com o salão.');
  return s;
}

/** Serviço disponível online e quem o faz (no domicílio: só quem atende em casa). */
async function onlineService(sid, serviceId, home = false) {
  const s = await get('SELECT * FROM services WHERE id=? AND salon_id=? AND active=1 AND online=1', serviceId, sid);
  if (!s) throw new HttpError(400, 'Serviço indisponível para agendamento online.');
  if (home && !s.home_allowed) throw new HttpError(400, 'Este serviço não é feito a domicílio.');
  s.pros = await all(`SELECT p.id, p.name, COALESCE(sp.price_cents, ?) AS price_cents FROM service_pros sp JOIN professionals p ON p.id=sp.professional_id
                       WHERE sp.service_id=? AND p.active=1 ${home ? 'AND p.home_service=1' : ''} ORDER BY p.name`, s.price_cents, s.id);
  if (home && !s.pros.length) throw new HttpError(400, 'No momento nenhuma profissional faz este serviço a domicílio.');
  return s;
}
const homeOn = (cfg) => !!cfg.home_enabled;

/** Página do salão: apresentação, fotos, contato, serviços online, equipe e opções de atendimento e pagamento. */
route('GET', '/api/public/:slug', null, async ({ params }) => {
  const salon = await salonBySlug(params.slug);
  const p = await salonProfile(salon.id);
  const cfg = await salonPayCfg(salon.id);
  const services = await all(`SELECT s.id, s.name, s.description, s.price_cents, s.duration_min, s.photo, s.home_allowed, s.requires_deposit, c.name AS category
                                FROM services s LEFT JOIN categories c ON c.id=s.category_id
                               WHERE s.salon_id=? AND s.active=1 AND s.online=1 ORDER BY c.name, s.name`, salon.id);
  const links = await all(`SELECT sp.service_id, p.id, p.home_service, sp.price_cents FROM service_pros sp JOIN professionals p ON p.id=sp.professional_id
                            JOIN services s ON s.id=sp.service_id WHERE s.salon_id=? AND s.online=1 AND p.active=1 ORDER BY p.name`, salon.id);
  const pros = await all(`SELECT DISTINCT p.id, p.name, p.specialty, p.photo FROM professionals p JOIN service_pros sp ON sp.professional_id=p.id
                           JOIN services s ON s.id=sp.service_id WHERE p.salon_id=? AND p.active=1 AND s.online=1 AND s.active=1 ORDER BY p.name`, salon.id);
  for (const s of services) {
    s.photo_url = imageUrl(s.photo);
    delete s.photo;
    const mine = links.filter((l) => l.service_id === s.id);
    s.pros = mine.map((l) => ({ id: l.id, price_cents: l.price_cents ?? s.price_cents, home: !!l.home_service }));
    s.home = homeOn(cfg) && !!s.home_allowed && s.pros.some((x) => x.home);
    s.deposit = !!(cfg.deposit_enabled && cfg.pix_ready && (cfg.deposit_scope === 'all' || s.requires_deposit));
    delete s.home_allowed;
    delete s.requires_deposit;
  }
  return {
    name: p.name, headline: p.headline, page_color: p.page_color, description: p.description, address: p.address, phone: p.phone, instagram: p.instagram, opening_hours: p.opening_hours,
    logo_url: p.logo_url, cover_url: p.cover_url, gallery_urls: p.gallery_urls, cancel_hours: p.cancel_hours, max_days: MAX_DAYS,
    services: services.filter((s) => s.pros.length),
    professionals: pros.map((x) => ({ id: x.id, name: x.name, specialty: x.specialty, photo_url: imageUrl(x.photo) })),
    home: homeOn(cfg) ? { fee_mode: cfg.home_fee_mode, fee_cents: cfg.home_fee_cents, areas: cfg.home_areas, start: cfg.home_start, end: cfg.home_end } : null,
    deposit: cfg.deposit_enabled && cfg.pix_ready ? { pct: cfg.deposit_pct, include_travel: !!cfg.deposit_include_travel, expire_min: cfg.deposit_expire_min, refund: cfg.deposit_refund } : null,
  };
});

/** Horários livres; sem profissional definida, junta os horários de todas as habilitadas. */
route('GET', '/api/public/:slug/slots', null, async ({ params, query, req }) => {
  throttle(req, 600, 'slots');
  const salon = await salonBySlug(params.slug);
  await sweepCharges(salon.id);
  const home = query.location === 'home';
  const cfg = await salonPayCfg(salon.id);
  if (home && !homeOn(cfg)) throw new HttpError(400, 'Atendimento a domicílio indisponível.');
  const service = await onlineService(salon.id, V.int(query.service_id, 'Serviço', { req: true }), home);
  const date = V.date(query.date, 'Data', { req: true });
  if (date < today() || date > addDays(today(), MAX_DAYS)) return { slots: [] };
  const proId = V.int(query.professional_id, 'Profissional');
  const pros = proId ? service.pros.filter((p) => p.id === proId) : service.pros;
  const opts = home ? { step: 30, buffer: cfg.home_buffer_min, window: [cfg.home_start, cfg.home_end] } : { step: 30 };
  const set = new Set();
  for (const p of pros) for (const t of await freeSlots(salon.id, p.id, date, service.duration_min, opts)) set.add(t);
  return { slots: [...set].sort() };
});

const PHONE_NOTE = (n) => `Agendado online${n}`;

route('POST', '/api/public/:slug/book', null, async ({ params, body, req }) => {
  throttle(req, 15, 'book');
  const salon = await salonBySlug(params.slug);
  await sweepCharges(salon.id);
  const cfg = await salonPayCfg(salon.id);
  const home = body.location === 'home';
  if (home && !homeOn(cfg)) throw new HttpError(400, 'Atendimento a domicílio indisponível.');
  const service = await onlineService(salon.id, V.int(body.service_id, 'Serviço', { req: true }), home);
  const start = V.datetime(body.start_at, 'Horário', { req: true });
  const date = start.slice(0, 10);
  if (date < today() || date > addDays(today(), MAX_DAYS) || start <= nowStr().slice(0, 16)) throw new HttpError(400, 'Escolha um horário futuro.');
  const name = V.str(body.name, 'Seu nome', { req: true, max: 80 });
  const phone = V.phone(body.phone, 'WhatsApp');
  if (!phone) throw new HttpError(400, 'WhatsApp: campo obrigatório');
  const notes = V.str(body.notes, 'Observação', { max: 300 });

  // endereço do domicílio e taxa de deslocamento
  let address = null, area = null, fee = 0, lat = null, lng = null, buffer = 0;
  if (home) {
    const a = body.address || {};
    const cep = String(a.cep || '').replace(/\D/g, '');
    if (cep.length !== 8) throw new HttpError(400, 'CEP inválido. Use os 8 números.');
    address = {
      cep, street: V.str(a.street, 'Rua', { req: true, max: 120 }), number: V.str(a.number, 'Número', { req: true, max: 15 }),
      complement: V.str(a.complement, 'Complemento', { max: 60 }), district: V.str(a.district, 'Bairro', { req: true, max: 60 }),
      city: V.str(a.city, 'Cidade', { max: 60 }), reference: V.str(a.reference, 'Ponto de referência', { max: 120 }),
    };
    area = cfg.home_areas.length ? V.str(body.area, 'Bairro ou região atendida', { req: true, max: 60 }) : address.district;
    fee = travelFee(cfg, area);
    lat = V.num(body.lat, 'Localização', { min: -90, max: 90 });
    lng = V.num(body.lng, 'Localização', { min: -180, max: 180 });
    buffer = cfg.home_buffer_min;
    const s = start.slice(11);
    if (s < cfg.home_start || addMin(start, service.duration_min).slice(11) > cfg.home_end)
      throw new HttpError(400, `Atendimentos a domicílio acontecem das ${cfg.home_start} às ${cfg.home_end}.`);
  }

  const end = addMin(start, service.duration_min);
  const wanted = V.int(body.professional_id, 'Profissional');
  const candidates = wanted ? service.pros.filter((p) => p.id === wanted) : service.pros;
  if (!candidates.length) throw new HttpError(400, home ? 'Esta profissional não atende a domicílio.' : 'Profissional indisponível para este serviço.');

  const result = await tx(async () => {
    let pro = null;
    for (const p of candidates) if (!(await findConflicts(salon.id, p.id, start, end, 0, buffer)).length) { pro = p; break; }
    if (!pro) throw new HttpError(409, 'Este horário acabou de ser ocupado. Escolha outro, por favor.');
    const client = await get('SELECT id FROM clients WHERE salon_id=? AND phone=? AND active=1 ORDER BY id LIMIT 1', salon.id, phone);
    const clientId = client?.id ?? (await run('INSERT INTO clients(salon_id,name,phone,created_at) VALUES(?,?,?,?)', salon.id, name, phone, nowStr())).id;
    const dup = await get(`SELECT 1 x FROM visits WHERE salon_id=? AND client_id=? AND date=? AND status IN ('scheduled','confirmed') AND source='online'`, salon.id, clientId, date);
    if (dup) throw new HttpError(409, 'Você já tem um agendamento online neste dia. Para mudar, use o link da sua reserva ou fale com o salão.');
    const token = crypto.randomBytes(16).toString('hex');
    const visitId = (await run(`INSERT INTO visits(salon_id,client_id,date,status,notes,source,public_token,created_at,location,home_address,home_area,home_lat,home_lng,travel_fee_cents,travel_buffer_min)
                                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      salon.id, clientId, date, 'scheduled', `${PHONE_NOTE(client ? '' : ` por ${name}`)}${notes ? ' — ' + notes : ''}`, 'online', token, nowStr(),
      home ? 'home' : 'salon', address ? JSON.stringify(address) : null, area, lat, lng, fee, buffer)).id;
    await run(`INSERT INTO visit_items(salon_id,visit_id,service_id,professional_id,start_at,end_at,duration_min,price_cents) VALUES(?,?,?,?,?,?,?,?)`,
      salon.id, visitId, service.id, pro.id, start, end, service.duration_min, pro.price_cents);
    const deposit = depositFor(cfg, service, pro.price_cents, fee);
    if (deposit > 0) await createCharge(salon.id, visitId, deposit, cfg);
    return { token, pro, deposit };
  });
  notifyStaff(salon.id, {
    title: 'Novo agendamento online',
    body: `${name} · ${service.name} · ${date.split('-').reverse().slice(0, 2).join('/')} às ${start.slice(11)}${home ? ' · a domicílio' : ''}${result.deposit ? ` · sinal ${fmtBRL(result.deposit)} aguardando` : ''}`,
    url: '/#/agenda',
  }, { proId: result.pro.id });
  return bookingView(salon, result.token);
});

const STATUS_TEXT = {
  scheduled: 'Aguardando confirmação do salão', confirmed: 'Confirmado', waiting: 'Você já chegou', in_progress: 'Em atendimento',
  completed: 'Atendimento concluído', cancelled: 'Cancelado', no_show: 'Não compareceu',
};
const CHARGE_TEXT = {
  pending: 'Aguardando pagamento do sinal', submitted: 'Comprovante enviado — o salão vai conferir', approved: 'Sinal confirmado pelo salão',
  rejected: 'O salão não localizou o pagamento', expired: 'Prazo para pagar o sinal terminou', cancelled: 'Cobrança cancelada',
  refund_due: 'Sinal será devolvido pelo salão', refunded: 'Sinal devolvido', retained: 'Sinal retido conforme as regras do salão',
};

async function bookingView(salon, token) {
  const v = await get(`SELECT v.id, v.status, v.location, v.home_address, v.travel_fee_cents, MIN(vi.start_at) AS start_at, MAX(vi.end_at) AS end_at,
                         GROUP_CONCAT(s.name, ' + ') AS service, GROUP_CONCAT(DISTINCT p.name) AS professional, SUM(vi.price_cents) AS price_cents
                         FROM visits v JOIN visit_items vi ON vi.visit_id=v.id JOIN services s ON s.id=vi.service_id JOIN professionals p ON p.id=vi.professional_id
                        WHERE v.salon_id=? AND v.public_token=? GROUP BY v.id`, salon.id, token);
  if (!v) throw new HttpError(404, 'Reserva não encontrada.');
  const c = await get('SELECT * FROM charges WHERE visit_id=? ORDER BY id DESC LIMIT 1', v.id);
  const total = v.price_cents + v.travel_fee_cents;
  const paid = c && ['approved', 'retained'].includes(c.status) ? c.amount_cents : 0;
  const minutesLeft = diffMin(nowStr().slice(0, 16), v.start_at);
  const canCancel = ['scheduled', 'confirmed'].includes(v.status) && minutesLeft >= salon.cancel_hours * 60;
  let address = null;
  try {
    address = v.home_address ? JSON.parse(v.home_address) : null;
  } catch {}
  return {
    token, status: v.status, status_text: c && ['pending', 'submitted', 'rejected'].includes(c.status) && v.status === 'scheduled' ? 'Aguardando pagamento do sinal' : STATUS_TEXT[v.status],
    service: v.service, professional: v.professional, start_at: v.start_at, end_at: v.end_at,
    price_cents: v.price_cents, travel_fee_cents: v.travel_fee_cents, total_cents: total, location: v.location, home_address: address,
    salon: salon.name, address: salon.address, phone: salon.phone, cancel_hours: salon.cancel_hours, can_cancel: canCancel,
    charge: c ? {
      status: c.status, status_text: CHARGE_TEXT[c.status], amount_cents: c.amount_cents, remaining_cents: total - c.amount_cents,
      brcode: ['pending', 'rejected'].includes(c.status) ? c.brcode : null, qr_svg: ['pending', 'rejected'].includes(c.status) ? await qrSvg(c.brcode) : null,
      expires_at: c.status === 'pending' ? c.expires_at : null, reject_reason: c.reject_reason, receipt_sent: !!c.receipt_image,
    } : null,
    paid_cents: paid, remaining_cents: total - paid,
  };
}

const tokenOk = (t) => {
  if (!/^[0-9a-f]{32}$/.test(t)) throw new HttpError(404, 'Reserva não encontrada.');
};

route('GET', '/api/public/:slug/booking/:token', null, async ({ params, req }) => {
  throttle(req, 300, 'view');
  tokenOk(params.token);
  const salon = await salonBySlug(params.slug);
  await sweepCharges(salon.id);
  return bookingView(salon, params.token);
});

/** Comprovante do Pix: só a equipe do salão consegue ver depois. */
route('POST', '/api/public/:slug/booking/:token/receipt', null, async ({ params, body, req }) => {
  throttle(req, 20, 'receipt');
  tokenOk(params.token);
  const salon = await salonBySlug(params.slug);
  await sweepCharges(salon.id);
  const v = await get('SELECT id, status FROM visits WHERE salon_id=? AND public_token=?', salon.id, params.token);
  if (!v) throw new HttpError(404, 'Reserva não encontrada.');
  const c = await get('SELECT * FROM charges WHERE visit_id=? ORDER BY id DESC LIMIT 1', v.id);
  if (!c || !['pending', 'rejected', 'submitted'].includes(c.status)) throw new HttpError(409, c?.status === 'expired' ? 'O prazo para pagar terminou. Fale com o salão pelo WhatsApp.' : 'Não há pagamento aguardando comprovante nesta reserva.');
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.data || ''));
  if (!m) throw new HttpError(400, 'Envie o comprovante como foto ou print (JPG, PNG ou WEBP).');
  if (Buffer.byteLength(m[2], 'base64') > 700_000) throw new HttpError(413, 'Imagem muito grande. Envie um print da tela do comprovante.');
  const id = crypto.randomBytes(16).toString('hex');
  await tx(async () => {
    await run('INSERT INTO images(id,salon_id,mime,data,created_at,private) VALUES(?,?,?,?,?,1)', id, salon.id, m[1], m[2], nowStr());
    await run(`UPDATE charges SET status='submitted', receipt_image=?, receipt_at=?, reject_reason=NULL, updated_at=? WHERE id=?`, id, nowStr(), nowStr(), c.id);
  });
  const pro = await get('SELECT professional_id FROM visit_items WHERE visit_id=? LIMIT 1', v.id);
  notifyStaff(salon.id, { title: 'Comprovante de sinal recebido', body: `Confira o Pix de ${fmtBRL(c.amount_cents)} e confirme o agendamento.`, url: '/#/agenda' }, { proId: pro?.professional_id });
  return bookingView(salon, params.token);
});

route('POST', '/api/public/:slug/booking/:token/cancel', null, async ({ params, req }) => {
  throttle(req, 30, 'cancel');
  tokenOk(params.token);
  const salon = await salonBySlug(params.slug);
  const b = await bookingView(salon, params.token);
  if (!b.can_cancel)
    throw new HttpError(409, ['scheduled', 'confirmed'].includes(b.status)
      ? `Cancelamentos online só até ${salon.cancel_hours}h antes. Fale com o salão pelo WhatsApp.` : 'Esta reserva não pode mais ser cancelada.');
  const cfg = await salonPayCfg(salon.id);
  await tx(async () => {
    const v = await get('SELECT id FROM visits WHERE salon_id=? AND public_token=?', salon.id, params.token);
    await run(`UPDATE visits SET status='cancelled', notes=COALESCE(notes,'') || ' · Cancelado pela cliente (online)' WHERE id=?`, v.id);
    const c = await get('SELECT * FROM charges WHERE visit_id=? ORDER BY id DESC LIMIT 1', v.id);
    if (!c) return;
    if (['pending', 'submitted', 'rejected'].includes(c.status)) await run(`UPDATE charges SET status='cancelled', updated_at=? WHERE id=?`, nowStr(), c.id);
    // sinal já confirmado: devolver (dentro do prazo) ou reter, conforme a regra do salão
    else if (c.status === 'approved') {
      if (cfg.deposit_refund === 'refund') await run(`UPDATE charges SET status='refund_due', updated_at=? WHERE id=?`, nowStr(), c.id);
      else await retainCharge(salon.id, c, null, 'cancelamento');
    }
  });
  notifyStaff(salon.id, { title: 'Agendamento cancelado pela cliente', body: `${b.service} · ${b.start_at.slice(8, 10)}/${b.start_at.slice(5, 7)} às ${b.start_at.slice(11)}`, url: '/#/agenda' });
  return bookingView(salon, params.token);
});
