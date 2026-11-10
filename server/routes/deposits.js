// Sinal por Pix (QR Code estático + comprovante + confirmação manual), atendimento a domicílio e notificações do app.
import { route, HttpError, OWNER, ADMIN, STAFF, ALL } from '../http.js';
import { V } from '../validate.js';
import { all, get, run, tx } from '../db.js';
import { nowStr, addMin } from '../util.js';
import { buildBrCode, normalizePixKey, qrSvg } from '../pix.js';
import { pushPublicKey } from '../push.js';
import { audit } from '../security.js';

// ---------- Regras de valores (sempre calculadas no servidor) ----------

/** Configuração do sinal e do domicílio do salão. */
export async function salonPayCfg(sid) {
  const s = await get(`SELECT deposit_enabled, deposit_pct, deposit_scope, deposit_include_travel, deposit_expire_min, deposit_refund, cancel_hours,
      pix_key_type, pix_key, pix_name, pix_city, home_enabled, home_fee_mode, home_fee_cents, home_areas, home_buffer_min, home_start, home_end
      FROM salons WHERE id=?`, sid);
  let areas = [];
  try {
    areas = JSON.parse(s.home_areas || '[]');
  } catch {}
  return { ...s, home_areas: areas, pix_ready: !!(s.pix_key && s.pix_name && s.pix_city) };
}

/** Taxa de deslocamento: fixa, ou conforme o bairro/região escolhido. */
export function travelFee(cfg, area) {
  if (cfg.home_fee_mode === 'by_area') {
    const a = cfg.home_areas.find((x) => x.name === area);
    if (!a) throw new HttpError(400, 'Escolha um bairro ou região atendida.');
    return a.fee_cents;
  }
  if (cfg.home_areas.length && !cfg.home_areas.some((x) => x.name === area)) throw new HttpError(400, 'Infelizmente este bairro não é atendido. Escolha um da lista.');
  return cfg.home_fee_cents;
}

/** Valor do sinal: % sobre o serviço (e sobre o deslocamento, se o salão quiser). 0 = sem sinal. */
export function depositFor(cfg, service, servicePrice, fee) {
  if (!cfg.deposit_enabled || !cfg.pix_ready) return 0;
  if (cfg.deposit_scope === 'selected' && !service.requires_deposit) return 0;
  const base = servicePrice + (cfg.deposit_include_travel ? fee : 0);
  return Math.round((base * cfg.deposit_pct) / 100);
}

/** Cria a cobrança Pix (código com valor exato) para um agendamento. */
export async function createCharge(sid, visitId, amount, cfg) {
  const now = nowStr();
  const id = (await run(`INSERT INTO charges(salon_id,visit_id,amount_cents,txid,brcode,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`,
    sid, visitId, amount, 'tmp', 'tmp', addMin(now.slice(0, 16), cfg.deposit_expire_min) + ':00', now, now)).id;
  const txid = `VB${sid}A${id}`;
  const brcode = buildBrCode({ key: cfg.pix_key, name: cfg.pix_name, city: cfg.pix_city, amountCents: amount, txid });
  await run('UPDATE charges SET txid=?, brcode=? WHERE id=?', txid, brcode, id);
  return id;
}

/**
 * Pix não pago (sem comprovante) dentro do prazo: a cobrança expira e o horário é liberado.
 * Com comprovante enviado, nada expira: o salão decide.
 */
export async function sweepCharges(sid) {
  const now = nowStr();
  const stale = await all(`SELECT c.id, c.visit_id FROM charges c JOIN visits v ON v.id=c.visit_id
                            WHERE c.salon_id=? AND c.status='pending' AND c.expires_at < ?`, sid, now);
  for (const c of stale)
    await tx(async () => {
      await run(`UPDATE charges SET status='expired', updated_at=? WHERE id=? AND status='pending'`, now, c.id);
      await run(`UPDATE visits SET status='cancelled', notes=COALESCE(notes,'') || ' · Cancelado: sinal não pago no prazo' WHERE id=? AND status='scheduled'`, c.visit_id);
    });
}

/** Sinal retido (falta, cancelamento sem devolução): entra como receita, sem comissão. */
export async function retainCharge(sid, charge, userId, reason) {
  const visit = await get('SELECT client_id FROM visits WHERE id=?', charge.visit_id);
  const at = charge.paid_at || nowStr();
  const saleId = (await run(`INSERT INTO sales(salon_id,client_id,visit_id,subtotal_cents,discount_cents,total_cents,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)`,
    sid, visit.client_id, null, charge.amount_cents, 0, charge.amount_cents, userId, at)).id;
  await run(`INSERT INTO sale_items(sale_id,salon_id,kind,name,qty,unit_cents,gross_cents,net_cents,commission_note) VALUES(?,?,?,?,?,?,?,?,?)`,
    saleId, sid, 'fee', `Sinal retido (${reason})`, 1, charge.amount_cents, charge.amount_cents, charge.amount_cents, 'sem comissão');
  await run(`INSERT INTO payments(salon_id,sale_id,method,amount_cents,created_by,created_at) VALUES(?,?,?,?,?,?)`, sid, saleId, 'Pix (sinal)', charge.amount_cents, userId, at);
  await run(`UPDATE charges SET status='retained', applied_sale_id=?, updated_at=? WHERE id=?`, saleId, nowStr(), charge.id);
}

// ---------- Painel: conferência do sinal ----------
const chargeOf = async (sid, id) => {
  const c = await get('SELECT * FROM charges WHERE id=? AND salon_id=?', id, sid);
  if (!c) throw new HttpError(404, 'Pagamento não encontrado.');
  return c;
};

route('GET', '/api/charges', STAFF, async ({ sid, query }) => {
  await sweepCharges(sid);
  const where = query.status === 'review' ? "c.status IN ('pending','submitted','refund_due')" : '1=1';
  return all(`SELECT c.id, c.visit_id, c.amount_cents, c.status, c.receipt_image IS NOT NULL AS has_receipt, c.receipt_at, c.expires_at, c.paid_at, c.reject_reason,
      cl.name AS client_name, v.date, (SELECT MIN(start_at) FROM visit_items WHERE visit_id=v.id) AS start_at
      FROM charges c JOIN visits v ON v.id=c.visit_id JOIN clients cl ON cl.id=v.client_id
     WHERE c.salon_id=? AND ${where} ORDER BY c.created_at DESC LIMIT 200`, sid);
});

/** Comprovante: só a equipe do salão vê (não é público como as fotos). */
route('GET', '/api/charges/:id/receipt', ALL, async ({ params, sid, user }) => {
  const c = await chargeOf(sid, params.id);
  if (user.role === 'pro' && !(await get('SELECT 1 x FROM visit_items WHERE visit_id=? AND professional_id=?', c.visit_id, user.professional_id))) throw new HttpError(403, 'Sem permissão.');
  const img = c.receipt_image && (await get('SELECT mime, data FROM images WHERE id=? AND salon_id=?', c.receipt_image, sid));
  if (!img) throw new HttpError(404, 'A cliente ainda não enviou o comprovante.');
  return { __raw: { type: img.mime, body: Buffer.from(img.data, 'base64'), cache: 'private, no-store' } };
});

route('POST', '/api/charges/:id/approve', STAFF, async ({ params, sid, user }) =>
  tx(async () => {
    const c = await chargeOf(sid, params.id);
    if (!['pending', 'submitted', 'rejected', 'expired'].includes(c.status)) throw new HttpError(409, 'Este pagamento já foi resolvido.');
    const v = await get('SELECT status FROM visits WHERE id=?', c.visit_id);
    if (c.status === 'expired' && v.status === 'cancelled') {
      // pagamento chegou depois do prazo: reabre o horário somente se ainda estiver livre
      const items = await all('SELECT professional_id, start_at, end_at FROM visit_items WHERE visit_id=?', c.visit_id);
      const { findConflicts } = await import('./agenda.js');
      for (const it of items) if ((await findConflicts(sid, it.professional_id, it.start_at, it.end_at, c.visit_id)).length)
        throw new HttpError(409, 'O horário deste agendamento já foi ocupado. Confirme o pagamento e combine outro horário com a cliente, ou devolva o valor.');
    }
    await run(`UPDATE charges SET status='approved', paid_at=?, reviewed_by=?, reviewed_at=?, reject_reason=NULL, updated_at=? WHERE id=?`, nowStr(), user.id, nowStr(), nowStr(), c.id);
    await run(`UPDATE visits SET status='confirmed' WHERE id=? AND status IN ('scheduled','cancelled')`, c.visit_id);
    return { ok: true };
  }));

route('POST', '/api/charges/:id/reject', STAFF, async ({ params, body, sid, user }) => {
  const c = await chargeOf(sid, params.id);
  if (!['pending', 'submitted'].includes(c.status)) throw new HttpError(409, 'Só é possível recusar um pagamento ainda não confirmado.');
  const reason = V.str(body.reason, 'Motivo', { req: true, max: 200 });
  await run(`UPDATE charges SET status='rejected', reject_reason=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?`, reason, user.id, nowStr(), nowStr(), c.id);
  return { ok: true };
});

route('POST', '/api/charges/:id/refund', ADMIN, async ({ params, sid }) => {
  const c = await chargeOf(sid, params.id);
  if (!['approved', 'refund_due'].includes(c.status) || c.applied_sale_id) throw new HttpError(409, 'Este sinal não pode ser marcado como devolvido.');
  await run(`UPDATE charges SET status='refunded', updated_at=? WHERE id=?`, nowStr(), c.id);
  return { ok: true };
});

route('POST', '/api/charges/:id/retain', ADMIN, async ({ params, sid, user }) =>
  tx(async () => {
    const c = await chargeOf(sid, params.id);
    if (!['approved', 'refund_due'].includes(c.status) || c.applied_sale_id) throw new HttpError(409, 'Este sinal não pode ser retido.');
    const v = await get('SELECT status FROM visits WHERE id=?', c.visit_id);
    if (!['cancelled', 'no_show'].includes(v.status)) throw new HttpError(409, 'O sinal só é retido em cancelamentos ou faltas. Em atendimentos realizados ele é abatido no fechamento da conta.');
    await retainCharge(sid, c, user.id, v.status === 'no_show' ? 'falta' : 'cancelamento');
    return { ok: true };
  }));

// ---------- Configurações: sinal e Pix ----------
route('GET', '/api/salon/deposit', OWNER, async ({ sid }) => {
  const cfg = await salonPayCfg(sid);
  const services = await all('SELECT id, name, price_cents, requires_deposit FROM services WHERE salon_id=? AND active=1 ORDER BY name', sid);
  return { ...cfg, services };
});
route('PUT', '/api/salon/deposit', OWNER, async ({ body, sid, user, req }) => {
  await audit(req, user, 'deposit');
  const enabled = V.bool(body.enabled);
  let pix = { type: null, key: null, name: null, city: null };
  if (body.pix_key || enabled) {
    pix = {
      type: body.pix_key_type, key: normalizePixKey(body.pix_key_type, body.pix_key),
      name: V.str(body.pix_name, 'Nome do beneficiário', { req: true, max: 60 }), city: V.str(body.pix_city, 'Cidade do beneficiário', { req: true, max: 40 }),
    };
  }
  const scope = V.oneOf(body.scope, ['all', 'selected'], 'Serviços com sinal') || 'all';
  const ids = (Array.isArray(body.service_ids) ? body.service_ids : []).map((x) => V.int(x, 'Serviço'));
  if (enabled && scope === 'selected' && !ids.length) throw new HttpError(400, 'Escolha ao menos um serviço que exige sinal, ou marque "todos os serviços".');
  await tx(async () => {
    await run(`UPDATE salons SET deposit_enabled=?, deposit_pct=?, deposit_scope=?, deposit_include_travel=?, deposit_expire_min=?, deposit_refund=?,
               pix_key_type=?, pix_key=?, pix_name=?, pix_city=? WHERE id=?`,
      enabled, V.num(body.pct ?? 50, 'Porcentagem do sinal', { min: 1, max: 100 }), scope, V.bool(body.include_travel ?? 1),
      V.int(body.expire_min ?? 30, 'Prazo para pagar', { min: 10, max: 1440 }), V.oneOf(body.refund, ['refund', 'keep'], 'Regra de cancelamento') || 'refund',
      pix.type, pix.key, pix.name, pix.city, sid);
    await run('UPDATE services SET requires_deposit=0 WHERE salon_id=?', sid);
    for (const id of ids) await run('UPDATE services SET requires_deposit=1 WHERE id=? AND salon_id=?', id, sid);
  });
  return { ok: true };
});
/** Teste da chave: gera um Pix de exemplo para o salão conferir no próprio app do banco (sem pagar). */
route('POST', '/api/salon/deposit/preview', OWNER, async ({ body }) => {
  const key = normalizePixKey(body.pix_key_type, body.pix_key);
  const brcode = buildBrCode({ key, name: V.str(body.pix_name, 'Nome do beneficiário', { req: true }), city: V.str(body.pix_city, 'Cidade', { req: true }), amountCents: 100, txid: 'TESTE' });
  return { brcode, svg: await qrSvg(brcode) };
});

// ---------- Configurações: atendimento a domicílio ----------
route('GET', '/api/salon/home', OWNER, async ({ sid }) => {
  const cfg = await salonPayCfg(sid);
  return {
    enabled: cfg.home_enabled, fee_mode: cfg.home_fee_mode, fee_cents: cfg.home_fee_cents, areas: cfg.home_areas, buffer_min: cfg.home_buffer_min, start: cfg.home_start, end: cfg.home_end,
    pros: await all('SELECT id, name, home_service FROM professionals WHERE salon_id=? AND active=1 ORDER BY name', sid),
    services: await all('SELECT id, name, home_allowed FROM services WHERE salon_id=? AND active=1 ORDER BY name', sid),
  };
});
route('PUT', '/api/salon/home', OWNER, async ({ body, sid }) => {
  const enabled = V.bool(body.enabled);
  const mode = V.oneOf(body.fee_mode, ['fixed', 'by_area'], 'Taxa de deslocamento') || 'fixed';
  const areas = (Array.isArray(body.areas) ? body.areas : []).slice(0, 60).map((a, i) => ({
    name: V.str(a.name, `Região ${i + 1}`, { req: true, max: 60 }), fee_cents: V.cents(a.fee_cents ?? 0, `Taxa da região ${i + 1}`) || 0,
  }));
  if (new Set(areas.map((a) => a.name.toLowerCase())).size !== areas.length) throw new HttpError(400, 'Há bairros repetidos na lista.');
  if (mode === 'by_area' && enabled && !areas.length) throw new HttpError(400, 'Para cobrar por região, cadastre ao menos um bairro ou região.');
  const start = V.time(body.start, 'Início do atendimento externo', { req: true }), end = V.time(body.end, 'Fim do atendimento externo', { req: true });
  if (end <= start) throw new HttpError(400, 'O horário final do atendimento externo deve ser depois do inicial.');
  const proIds = (Array.isArray(body.pro_ids) ? body.pro_ids : []).map((x) => V.int(x, 'Profissional'));
  const svcIds = (Array.isArray(body.service_ids) ? body.service_ids : []).map((x) => V.int(x, 'Serviço'));
  if (enabled && (!proIds.length || !svcIds.length)) throw new HttpError(400, 'Escolha quais profissionais atendem a domicílio e quais serviços podem ser feitos em casa.');
  await tx(async () => {
    await run(`UPDATE salons SET home_enabled=?, home_fee_mode=?, home_fee_cents=?, home_areas=?, home_buffer_min=?, home_start=?, home_end=? WHERE id=?`,
      enabled, mode, V.cents(body.fee_cents ?? 0, 'Taxa de deslocamento') || 0, JSON.stringify(areas), V.int(body.buffer_min ?? 30, 'Tempo de deslocamento', { min: 0, max: 240 }), start, end, sid);
    await run('UPDATE professionals SET home_service=0 WHERE salon_id=?', sid);
    for (const id of proIds) await run('UPDATE professionals SET home_service=1 WHERE id=? AND salon_id=?', id, sid);
    await run('UPDATE services SET home_allowed=0 WHERE salon_id=?', sid);
    for (const id of svcIds) await run('UPDATE services SET home_allowed=1 WHERE id=? AND salon_id=?', id, sid);
  });
  return { ok: true };
});

// ---------- Notificações do app ----------
route('GET', '/api/push/key', ALL, async () => ({ key: pushPublicKey() }));
route('POST', '/api/push/subscribe', ALL, async ({ body, sid, user }) => {
  const endpoint = V.str(body.endpoint, 'Assinatura', { req: true, max: 1000 });
  if (!/^https:\/\//.test(endpoint)) throw new HttpError(400, 'Assinatura de notificação inválida.');
  const p256dh = V.str(body.keys?.p256dh, 'Chave', { req: true, max: 200 }), auth = V.str(body.keys?.auth, 'Chave', { req: true, max: 100 });
  await run(`INSERT INTO push_subscriptions(salon_id,user_id,endpoint,p256dh,auth,created_at) VALUES(?,?,?,?,?,?)
             ON CONFLICT(endpoint) DO UPDATE SET salon_id=excluded.salon_id, user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`,
    sid, user.id, endpoint, p256dh, auth, nowStr());
  return { ok: true };
});
route('POST', '/api/push/unsubscribe', ALL, async ({ body, user }) => {
  await run('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?', String(body.endpoint || ''), user.id);
  return { ok: true };
});
route('POST', '/api/push/test', ALL, async ({ sid, user }) => {
  const { notifyStaff } = await import('../push.js');
  const subs = await all('SELECT id FROM push_subscriptions WHERE user_id=?', user.id);
  if (!subs.length) throw new HttpError(400, 'Ative as notificações neste aparelho primeiro.');
  await notifyStaff(sid, { title: 'Vyllorri Beauty', body: 'Notificações ativadas! Você vai receber os avisos do salão aqui.', url: '/' }, { userId: user.id });
  return { ok: true };
});
