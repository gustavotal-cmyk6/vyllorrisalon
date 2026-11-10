import { route, HttpError, ADMIN, STAFF, ALL } from '../http.js';
import { V } from '../validate.js';
import { all, get, run, tx } from '../db.js';
import { nowStr, today } from '../util.js';
import { servicePriceFor, serviceCommissionRule } from './catalog.js';
import { createClient } from './clients.js';
import { audit } from '../security.js';

function commissionFor(rule, net, qty = 1) {
  if (!rule || !rule.value) return { cents: 0, note: rule ? `sem comissão (${rule.note})` : 'sem profissional' };
  if (rule.type === 'fixed') return { cents: Math.round(rule.value * qty), note: `R$ ${(rule.value / 100).toFixed(2).replace('.', ',')} fixo (${rule.note})` };
  return { cents: Math.round((net * rule.value) / 100), note: `${String(rule.value).replace('.', ',')}% de R$ ${(net / 100).toFixed(2).replace('.', ',')} (${rule.note})` };
}

async function activeMethods(sid) {
  return (await all('SELECT name FROM payment_methods WHERE salon_id=? AND active=1', sid)).map((m) => m.name);
}
async function parsePayments(list, sid, label = 'Pagamento') {
  const methods = await activeMethods(sid);
  return (Array.isArray(list) ? list : []).filter((p) => Number(p.amount_cents) > 0).map((p, i) => ({
    method: V.oneOf(p.method, methods, `${label} ${i + 1} – forma`, { req: true }),
    amount: V.cents(p.amount_cents, `${label} ${i + 1} – valor`, { req: true, min: 1 }),
  }));
}

export async function saleDetail(sid, id) {
  const s = await get(`SELECT s.*, c.name AS client_name, p.name AS pro_name,
                   (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE sale_id=s.id) AS paid_cents
                   FROM sales s LEFT JOIN clients c ON c.id=s.client_id LEFT JOIN professionals p ON p.id=s.professional_id
                  WHERE s.id=? AND s.salon_id=?`, id, sid);
  if (!s) throw new HttpError(404, 'Venda não encontrada.');
  s.pending_cents = s.status === 'active' ? s.total_cents - s.paid_cents : 0;
  s.items = await all(`SELECT si.*, p.name AS pro_name FROM sale_items si LEFT JOIN professionals p ON p.id=si.professional_id WHERE si.sale_id=? ORDER BY si.kind DESC, si.id`, s.id);
  s.payments = await all('SELECT id, method, amount_cents, created_at FROM payments WHERE sale_id=? ORDER BY id', s.id);
  return s;
}

/**
 * Registro de venda (checkout). Serve para: concluir uma visita da agenda, venda avulsa de serviços e/ou produtos.
 * Valores são recalculados no servidor; o desconto é rateado proporcionalmente entre os itens (net_cents),
 * o que mantém separadas as receitas de serviços e de produtos e evita comissões sobre valor não cobrado.
 */
route('POST', '/api/sales', ALL, async ({ body, sid, user }) => {
  return await tx(async () => {
    let date = V.date(body.date, 'Data da venda');
    if (date && user.role === 'pro') date = null;
    if (date && date > today()) throw new HttpError(400, 'A data da venda não pode ser no futuro.');
    const createdAt = date && date !== today() ? `${date} 12:00:00` : nowStr();

    let clientId = V.int(body.client_id, 'Cliente');
    if (!clientId && body.new_client) clientId = await createClient(sid, body.new_client);
    if (clientId && !await get('SELECT 1 x FROM clients WHERE id=? AND salon_id=?', clientId, sid)) throw new HttpError(400, 'Cliente inválida.');

    const saleProId = V.int(body.professional_id, 'Profissional responsável');
    if (saleProId && !await get('SELECT 1 x FROM professionals WHERE id=? AND salon_id=?', saleProId, sid)) throw new HttpError(400, 'Profissional inválida.');

    let visit = null;
    const visitId = V.int(body.visit_id, 'Agendamento');
    if (visitId) {
      visit = await get('SELECT * FROM visits WHERE id=? AND salon_id=?', visitId, sid);
      if (!visit) throw new HttpError(400, 'Agendamento inválido.');
      if (['completed', 'cancelled', 'no_show'].includes(visit.status)) throw new HttpError(409, 'Este agendamento não pode ser concluído (já concluído, cancelado ou falta).');
      if (await get(`SELECT 1 x FROM sales WHERE visit_id=? AND status='active'`, visitId)) throw new HttpError(409, 'Este atendimento já tem uma venda registrada.');
      clientId = visit.client_id;
    }

    const raw = Array.isArray(body.items) ? body.items : [];
    if (!raw.length) throw new HttpError(400, 'Inclua ao menos um serviço ou produto.');
    const items = [];
    const usedVisitItems = new Set();
    for (const [i, it] of raw.entries()) {
      const label = `Item ${i + 1}`;
      if (it.kind === 'service') {
        let serviceId, proId, viId = null, name;
        if (it.visit_item_id) {
          const vi = await get('SELECT vi.*, s.name FROM visit_items vi JOIN services s ON s.id=vi.service_id WHERE vi.id=? AND vi.visit_id=?', it.visit_item_id, visitId || -1);
          if (!vi) throw new HttpError(400, `${label}: serviço não pertence a este agendamento.`);
          if (usedVisitItems.has(vi.id)) throw new HttpError(400, `${label}: serviço repetido.`);
          usedVisitItems.add(vi.id);
          ({ service_id: serviceId, professional_id: proId, name } = vi);
          viId = vi.id;
          it.price_cents ??= vi.price_cents;
        } else {
          const s = await get('SELECT * FROM services WHERE id=? AND salon_id=?', V.int(it.service_id, `${label} – serviço`, { req: true }), sid);
          if (!s) throw new HttpError(400, `${label}: serviço inválido.`);
          proId = V.int(it.professional_id, `${label} – profissional`, { req: true });
          if (!await get('SELECT 1 x FROM professionals WHERE id=? AND salon_id=?', proId, sid)) throw new HttpError(400, `${label}: profissional inválida.`);
          serviceId = s.id;
          name = s.name;
        }
        if (user.role === 'pro' && proId !== user.professional_id && !viId) throw new HttpError(403, 'Você só pode lançar serviços seus.');
        const unit = V.cents(it.price_cents, `${label} – preço`) ?? (await servicePriceFor(serviceId, proId));
        items.push({ kind: 'service', serviceId, proId, viId, name, qty: 1, unit, gross: unit, cost: 0, rule: await serviceCommissionRule(serviceId, proId) });
      } else if (it.kind === 'product') {
        const p = await get('SELECT * FROM products WHERE id=? AND salon_id=? AND active=1', V.int(it.product_id, `${label} – produto`, { req: true }), sid);
        if (!p) throw new HttpError(400, `${label}: produto inválido.`);
        if (p.kind !== 'retail') throw new HttpError(400, `${p.name} é material de uso interno e não pode ser vendido.`);
        const qty = V.num(it.qty ?? 1, `${label} – quantidade`, { req: true, min: 0.01, max: 1000 });
        if (p.stock < qty) throw new HttpError(409, `Estoque insuficiente de ${p.name} (disponível: ${p.stock}).`);
        const unit = V.cents(it.price_cents, `${label} – preço`) ?? p.price_cents;
        const proId = V.int(it.professional_id, `${label} – profissional`) ?? saleProId;
        let rule = null;
        if (proId) {
          const pro = await get('SELECT product_commission_pct FROM professionals WHERE id=? AND salon_id=?', proId, sid);
          if (!pro) throw new HttpError(400, `${label}: profissional inválida.`);
          rule = p.commission_pct != null ? { type: 'pct', value: p.commission_pct, note: 'regra do produto' } : { type: 'pct', value: pro.product_commission_pct, note: 'comissão de produtos da profissional' };
        }
        items.push({ kind: 'product', productId: p.id, proId, name: p.name, qty, unit, gross: Math.round(unit * qty), cost: Math.round(p.cost_cents * qty), rule });
      } else throw new HttpError(400, `${label}: tipo inválido.`);
    }
    if (visitId) {
      const missing = (await all('SELECT vi.id, s.name FROM visit_items vi JOIN services s ON s.id=vi.service_id WHERE vi.visit_id=?', visitId)).filter((x) => !usedVisitItems.has(x.id));
      if (missing.length) throw new HttpError(400, `Inclua todos os serviços do agendamento (faltando: ${missing.map((m) => m.name).join(', ')}). Se algum não foi feito, remova-o do agendamento antes.`);
      // atendimento a domicílio: a taxa de deslocamento combinada entra sempre na conta (sem comissão)
      if (visit.travel_fee_cents > 0)
        items.push({ kind: 'fee', name: 'Taxa de deslocamento', qty: 1, unit: visit.travel_fee_cents, gross: visit.travel_fee_cents, cost: 0, rule: null });
    }
    // sinal já confirmado pelo salão: é abatido como pagamento desta conta
    const charge = visitId ? await get(`SELECT * FROM charges WHERE visit_id=? AND status='approved' AND applied_sale_id IS NULL ORDER BY id DESC LIMIT 1`, visitId) : null;

    const subtotal = items.reduce((s, i) => s + i.gross, 0);
    const discount = V.cents(body.discount_cents ?? 0, 'Desconto') || 0;
    if (discount > subtotal) throw new HttpError(400, 'O desconto não pode ser maior que o total.');
    const total = subtotal - discount;
    let left = discount;
    items.forEach((it, idx) => {
      const share = idx === items.length - 1 ? left : subtotal ? Math.round((discount * it.gross) / subtotal) : 0;
      left -= share;
      it.net = it.gross - share;
      const c = commissionFor(it.rule, it.net, it.kind === 'service' ? 1 : it.qty);
      it.commission = c.cents;
      it.note = c.note;
    });

    const payments = await parsePayments(body.payments, sid);
    if (charge) {
      if (charge.amount_cents > total) throw new HttpError(400, `O sinal já pago (R$ ${(charge.amount_cents / 100).toFixed(2)}) é maior que o total da conta. Revise o desconto.`);
      payments.unshift({ method: 'Pix (sinal)', amount: charge.amount_cents, at: charge.paid_at, charge: charge.id });
    }
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    if (paid > total) throw new HttpError(400, `Os pagamentos (R$ ${(paid / 100).toFixed(2)}) passam do total (R$ ${(total / 100).toFixed(2)}). Informe o troco fora do sistema.`);
    if (paid < total && !clientId) throw new HttpError(400, 'Para deixar valor pendente, identifique a cliente.');

    const saleId = (await run(`INSERT INTO sales(salon_id,client_id,visit_id,professional_id,subtotal_cents,discount_cents,total_cents,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
      sid, clientId, visitId, saleProId, subtotal, discount, total, user.id, createdAt)).id;
    for (const it of items) {
      await run(`INSERT INTO sale_items(sale_id,salon_id,kind,service_id,product_id,visit_item_id,name,professional_id,qty,unit_cents,gross_cents,net_cents,cost_cents,commission_cents,commission_note)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        saleId, sid, it.kind, it.serviceId, it.productId, it.viId, it.name, it.proId, it.qty, it.unit, it.gross, it.net, it.cost, it.commission, it.note);
      if (it.kind === 'product') {
        await run('UPDATE products SET stock=stock-? WHERE id=?', it.qty, it.productId);
        await run('INSERT INTO stock_moves(salon_id,product_id,type,qty,note,sale_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)', sid, it.productId, 'sale', -it.qty, 'Venda', saleId, user.id, createdAt);
      }
    }
    for (const p of payments) await run('INSERT INTO payments(salon_id,sale_id,method,amount_cents,created_by,created_at) VALUES(?,?,?,?,?,?)', sid, saleId, p.method, p.amount, user.id, p.at || createdAt);
    if (charge) await run('UPDATE charges SET applied_sale_id=?, updated_at=? WHERE id=?', saleId, nowStr(), charge.id);
    if (visitId) await run(`UPDATE visits SET status='completed' WHERE id=?`, visitId);
    return await saleDetail(sid, saleId);
  });
});

route('GET', '/api/sales/:id', ALL, async ({ params, sid, user }) => {
  const s = await saleDetail(sid, params.id);
  if (user.role === 'pro' && !s.items.some((i) => i.professional_id === user.professional_id)) throw new HttpError(404, 'Venda não encontrada.');
  return s;
});

route('GET', '/api/sales', STAFF, async ({ query, sid }) => {
  const where = ['s.salon_id=?'];
  const p = [sid];
  if (query.pending) where.push(`s.status='active'`);
  else {
    const { from, to } = V.range(query);
    where.push('substr(s.created_at,1,10) BETWEEN ? AND ?');
    p.push(from, to);
  }
  if (query.client_id) (where.push('s.client_id=?'), p.push(V.int(query.client_id, 'Cliente')));
  if (query.professional_id) (where.push('s.id IN (SELECT sale_id FROM sale_items WHERE professional_id=?)'), p.push(V.int(query.professional_id, 'Profissional')));
  let rows = await all(`SELECT s.id, s.created_at, s.total_cents, s.discount_cents, s.status, s.visit_id, c.name AS client_name,
      (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE sale_id=s.id) AS paid_cents,
      (SELECT GROUP_CONCAT(name, ', ') FROM sale_items WHERE sale_id=s.id) AS items_text,
      (SELECT GROUP_CONCAT(DISTINCT method) FROM payments WHERE sale_id=s.id) AS methods
      FROM sales s LEFT JOIN clients c ON c.id=s.client_id WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC LIMIT 1000`, ...p);
  rows.forEach((r) => (r.pending_cents = r.status === 'active' ? r.total_cents - r.paid_cents : 0));
  if (query.pending) rows = rows.filter((r) => r.pending_cents > 0);
  return rows;
});

/** Recebimento posterior de valor pendente (aceita várias formas). */
route('POST', '/api/sales/:id/payments', STAFF, async ({ params, body, sid, user }) => {
  return await tx(async () => {
    const s = await saleDetail(sid, params.id);
    if (s.status !== 'active') throw new HttpError(409, 'Venda estornada.');
    const payments = await parsePayments(body.payments, sid);
    if (!payments.length) throw new HttpError(400, 'Informe o valor recebido.');
    const sum = payments.reduce((a, p) => a + p.amount, 0);
    if (sum > s.pending_cents) throw new HttpError(400, `O valor passa do pendente (R$ ${(s.pending_cents / 100).toFixed(2)}).`);
    for (const p of payments) await run('INSERT INTO payments(salon_id,sale_id,method,amount_cents,created_by,created_at) VALUES(?,?,?,?,?,?)', sid, s.id, p.method, p.amount, user.id, nowStr());
    return await saleDetail(sid, s.id);
  });
});

/** Estorno: retira a venda de todos os indicadores, devolve estoque e reabre o atendimento. */
route('POST', '/api/sales/:id/void', ADMIN, async ({ params, body, sid, user, req }) => {
  await audit(req, user, 'sale_void', `venda #${params.id}`);
  return await tx(async () => {
    const s = await saleDetail(sid, params.id);
    if (s.status !== 'active') throw new HttpError(409, 'Venda já estornada.');
    if (s.items.some((i) => i.commission_payment_id)) throw new HttpError(409, 'A comissão desta venda já foi paga à profissional. Não é possível estornar.');
    const reason = V.str(body.reason, 'Motivo', { req: true, max: 200 });
    await run(`UPDATE sales SET status='void', void_reason=?, voided_at=? WHERE id=?`, reason, nowStr(), s.id);
    // o sinal volta a ficar disponível para a próxima conta deste atendimento
    await run(`UPDATE charges SET applied_sale_id=NULL, updated_at=? WHERE applied_sale_id=? AND status='approved'`, nowStr(), s.id);
    for (const it of s.items.filter((i) => i.kind === 'product')) {
      await run('UPDATE products SET stock=stock+? WHERE id=?', it.qty, it.product_id);
      await run('INSERT INTO stock_moves(salon_id,product_id,type,qty,note,sale_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)', sid, it.product_id, 'void', it.qty, 'Estorno de venda', s.id, user.id, nowStr());
    }
    if (s.visit_id) await run(`UPDATE visits SET status='in_progress' WHERE id=?`, s.visit_id);
    return await saleDetail(sid, s.id);
  });
});
