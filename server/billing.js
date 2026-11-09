// Assinatura do Vyllorri: teste grátis, planos e mensalidade por Pix (QR Code) no Mercado Pago.
// Pix não tem débito automático: o sistema gera o QR da mensalidade, avisa antes de vencer
// e confirma o pagamento sozinho (aviso do Mercado Pago ou consulta direta), liberando mais um mês.
import crypto from 'node:crypto';
import { get, run } from './db.js';
import { today, addDays, nowStr } from './util.js';
import { HttpError } from './http.js';

export const TRIAL_DAYS = 7;
/** Preço por modo de trabalho (centavos). */
export const PLANS = {
  solo: { name: 'Sozinha', price_cents: 3990, included_pros: 1, extra_pro_cents: 0 },
  team: { name: 'Com equipe', price_cents: 6990, included_pros: 5, extra_pro_cents: 990 },
};
const PROS_SQL = '(SELECT COUNT(*) FROM professionals p WHERE p.salon_id=s.id AND p.active=1)';
export { PROS_SQL };

/** Plano do salão com o valor do mês: no plano com equipe, cada profissional ativa acima de 5 soma R$ 9,90. */
export function planFor(mode, pros = 0) {
  const key = mode === 'solo' ? 'solo' : 'team';
  const p = PLANS[key];
  const extra = key === 'team' ? Math.max(0, (pros || 0) - p.included_pros) : 0;
  return { key, name: p.name, base_cents: p.price_cents, included_pros: p.included_pros, extra_pro_cents: p.extra_pro_cents, pros: pros || 0, extra_pros: extra, price_cents: p.price_cents + extra * p.extra_pro_cents };
}
const GRACE_DAYS = 3; // tolerância depois do vencimento
const REMIND_DAYS = 5; // a partir de quando aparece "sua mensalidade vence em X dias"
const PIX_HOURS = 24; // validade do QR Code gerado

export const addMonth = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

/**
 * Situação da assinatura de um salão.
 * status: comp (cortesia/demonstração) · active (pago) · trial (teste) · blocked (teste acabou ou mensalidade atrasada)
 */
export function billingInfo(s) {
  const plan = planFor(s.team_mode, s.pros);
  const base = { plan, paid_until: s.paid_until || null, trial_ends_at: s.trial_ends_at || null };
  if (s.is_demo || s.sub_status === 'comp') return { ...base, status: 'comp', blocked: false };
  const d = today();
  if (s.paid_until && d <= addDays(s.paid_until, GRACE_DAYS)) {
    const left = daysBetween(d, s.paid_until);
    return { ...base, status: 'active', blocked: false, days_left: Math.max(0, left), due_soon: left <= REMIND_DAYS, overdue: left < 0 };
  }
  if (s.trial_ends_at && d <= s.trial_ends_at) return { ...base, status: 'trial', blocked: false, days_left: daysBetween(d, s.trial_ends_at) + 1 };
  return { ...base, status: 'blocked', blocked: true, reason: s.paid_until ? 'overdue' : 'trial_ended' };
}

export const trialEnd = () => addDays(today(), TRIAL_DAYS - 1);

const salonRow = (sid) => get(`SELECT s.id, s.name, s.is_demo, s.team_mode, s.sub_status, s.trial_ends_at, s.paid_until, ${PROS_SQL} AS pros FROM salons s WHERE s.id=?`, sid);

// ---------- Mercado Pago ----------
const mpBase = () => process.env.MP_BASE_URL || 'https://api.mercadopago.com';
export const mpReady = () => !!process.env.MP_ACCESS_TOKEN;

async function mp(method, p, body) {
  if (!mpReady()) throw new HttpError(503, 'O pagamento por Pix ainda não foi configurado. Fale com o suporte do Vyllorri.');
  const r = await fetch(mpBase() + p, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'x-idempotency-key': crypto.randomUUID() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(r.status >= 500 ? 502 : 400, data?.message ? `Mercado Pago: ${data.message}` : 'Não foi possível gerar o Pix agora. Tente de novo em instantes.');
  return data;
}

const pixView = (p) => p && { id: p.id, status: p.status, amount_cents: p.amount_cents, qr_code: p.qr_code, qr_base64: p.qr_base64, expires_at: p.expires_at, paid_at: p.paid_at };

/** Pagamento aprovado: libera mais um mês a partir do que for maior entre hoje, o fim do teste e o vencimento atual. */
async function applyPaid(row, paidAt) {
  if (row.status === 'approved') return;
  const s = await salonRow(row.salon_id);
  const d = today();
  const startFrom = [d, s.paid_until, s.trial_ends_at && s.trial_ends_at >= d ? s.trial_ends_at : null].filter(Boolean).sort().pop();
  await run("UPDATE billing_payments SET status='approved', paid_at=? WHERE id=?", paidAt || nowStr(), row.id);
  await run("UPDATE salons SET paid_until=?, sub_status='active' WHERE id=?", addMonth(startFrom), row.salon_id);
}

/** Consulta no Mercado Pago o Pix em aberto (funciona mesmo sem o aviso automático configurado). */
export async function refreshPending(sid) {
  const row = await get("SELECT * FROM billing_payments WHERE salon_id=? AND status='pending' ORDER BY id DESC LIMIT 1", sid);
  if (!row || !mpReady()) return row;
  const p = await mp('GET', `/v1/payments/${row.mp_id}`).catch(() => null);
  if (!p) return row;
  if (p.status === 'approved') await applyPaid(row, p.date_approved?.replace('T', ' ').slice(0, 19));
  else if (['cancelled', 'rejected', 'refunded', 'charged_back'].includes(p.status) || row.expires_at < nowStr())
    await run("UPDATE billing_payments SET status=? WHERE id=?", p.status === 'pending' ? 'expired' : p.status, row.id);
  return get('SELECT * FROM billing_payments WHERE id=?', row.id);
}

export async function salonBilling(sid) {
  const pending = await refreshPending(sid).catch(() => null);
  const s = await salonRow(sid);
  const last = await get("SELECT * FROM billing_payments WHERE salon_id=? AND status='approved' ORDER BY id DESC LIMIT 1", sid);
  return { ...billingInfo(s), pix: pending?.status === 'pending' ? pixView(pending) : null, last_paid: last ? { amount_cents: last.amount_cents, paid_at: last.paid_at } : null, online: mpReady() };
}

/** Gera (ou reaproveita) o Pix da mensalidade. */
export async function createPix(sid, user, req) {
  const s = await salonRow(sid);
  const info = billingInfo(s);
  if (info.status === 'comp') throw new HttpError(400, 'Este salão já tem acesso liberado.');
  const open = await refreshPending(sid);
  if (open?.status === 'pending' && open.amount_cents === info.plan.price_cents) return pixView(open);
  if (open?.status === 'pending') await run("UPDATE billing_payments SET status='replaced' WHERE id=?", open.id);
  const host = process.env.APP_URL || (req?.headers?.host ? `https://${req.headers.host}` : '');
  const expires = new Date(Date.now() + PIX_HOURS * 3600e3);
  const ref = `salon:${sid}:${Date.now()}`;
  const p = await mp('POST', '/v1/payments', {
    transaction_amount: info.plan.price_cents / 100,
    description: `Vyllorri Beauty · mensalidade plano ${info.plan.name}`,
    payment_method_id: 'pix',
    payer: { email: user.email, first_name: String(user.name || '').split(' ')[0] || 'Cliente' },
    external_reference: ref,
    date_of_expiration: expires.toISOString().replace('Z', '-00:00'),
    ...(host.startsWith('https://') && !host.includes('localhost') ? { notification_url: `${host}/api/billing/webhook` } : {}),
  });
  const tx = p.point_of_interaction?.transaction_data || {};
  const exp = new Date(expires.getTime() - expires.getTimezoneOffset() * 60e3).toISOString().slice(0, 19).replace('T', ' ');
  const id = (await run(`INSERT INTO billing_payments(salon_id, mp_id, amount_cents, status, qr_code, qr_base64, expires_at, created_at) VALUES(?,?,?,?,?,?,?,?)`,
    sid, String(p.id), info.plan.price_cents, 'pending', tx.qr_code || '', tx.qr_code_base64 || '', exp, nowStr())).id;
  return pixView(await get('SELECT * FROM billing_payments WHERE id=?', id));
}

/** Aviso do Mercado Pago: só traz o id; confirmamos consultando o pagamento direto na API (não dá para falsificar). */
export async function handleWebhook(query, body) {
  const id = String(body?.data?.id || query['data.id'] || query.id || '');
  const type = body?.type || body?.topic || query.type || query.topic;
  if (!id || (type && type !== 'payment')) return { ok: true };
  const row = await get('SELECT * FROM billing_payments WHERE mp_id=?', id);
  if (!row || !mpReady()) return { ok: true };
  const p = await mp('GET', `/v1/payments/${id}`);
  if (p.status === 'approved') await applyPaid(row, p.date_approved?.replace('T', ' ').slice(0, 19));
  return { ok: true };
}
