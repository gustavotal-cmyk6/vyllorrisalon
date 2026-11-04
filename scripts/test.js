// Teste de integração da API: sobe o servidor com um banco temporário e percorre os fluxos principais.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vyllorri-test-'));
const PORT = 3999;
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dir }, stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((r) => srv.stdout.once('data', r));

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(`http://localhost:${PORT}${url}`, {
      method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const data = await res.json();
    return { status: res.status, data };
  };
}
const ok = (r) => {
  if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
};

const pad = (n) => String(n).padStart(2, '0');
const d = new Date();


const D = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const T = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
let passed = 0;
const step = async (name, fn) => {
  await fn();
  passed++;
  console.log('✓', name);
};

try {
  const owner = client();
  await step('cadastro do salão e login', async () => {
    ok(await owner('POST', '/api/auth/signup', { salon_name: 'Salão Teste', name: 'Ana', email: 'ana@teste.com', password: 'senha1234' }));
    const me = ok(await owner('GET', '/api/me'));
    assert.equal(me.user.role, 'owner');
    assert.equal(ok(await owner('GET', '/api/payment-methods')).length, 4);
  });

  let bia, carla, escova, manicure, mascara, luva;
  await step('cadastro de profissionais, serviços e produtos', async () => {
    bia = ok(await owner('POST', '/api/professionals', { name: 'Bia', specialty: 'Cabeleireira', work_days: '0,1,2,3,4,5,6', start_time: '08:00', end_time: '20:00', commission_type: 'pct', commission_value: 40, product_commission_pct: 10 })).id;
    carla = ok(await owner('POST', '/api/professionals', { name: 'Carla', specialty: 'Manicure', work_days: '0,1,2,3,4,5,6', start_time: '08:00', end_time: '20:00', commission_type: 'pct', commission_value: 50 })).id;
    const cats = ok(await owner('GET', '/api/categories'));
    escova = ok(await owner('POST', '/api/services', { name: 'Escova', category_id: cats[0].id, price_cents: 8000, duration_min: 60, pros: [{ professional_id: bia }] })).id;
    manicure = ok(await owner('POST', '/api/services', { name: 'Manicure', price_cents: 4000, duration_min: 45, commission_type: 'fixed', commission_value: 1500, pros: [{ professional_id: carla, price_cents: 4500 }] })).id;
    mascara = ok(await owner('POST', '/api/products', { name: 'Máscara capilar', kind: 'retail', price_cents: 6000, cost_cents: 2500, stock: 3, min_stock: 2 })).id;
    luva = ok(await owner('POST', '/api/products', { name: 'Luvas', kind: 'internal', stock: 100 })).id;
  });

  let visit, cliente;
  await step('agendamento com vários serviços e profissionais', async () => {
    const r = ok(await owner('POST', '/api/visits', {
      new_client: { name: 'Maria Souza', phone: '(11) 99999-0000' },
      items: [{ service_id: escova, professional_id: bia, start_at: `${D} 10:00` }, { service_id: manicure, professional_id: carla, start_at: `${D} 10:00` }],
    }));
    visit = ok(await owner('GET', `/api/visits/${r.id}`));
    cliente = visit.client_id;
    assert.equal(visit.items.length, 2);
    assert.equal(visit.items.find((i) => i.service_id === manicure).price_cents, 4500, 'preço específico da profissional');
  });

  await step('prevenção de conflito e encaixe', async () => {
    const r = await owner('POST', '/api/visits', { client_id: cliente, items: [{ service_id: escova, professional_id: bia, start_at: `${D} 10:30` }] });
    assert.equal(r.status, 409);
    assert.equal(r.data.code, 'conflict');
    const r2 = await owner('POST', '/api/visits', { new_client: { name: 'Joana' }, items: [{ service_id: escova, professional_id: bia, start_at: `${D} 10:30` }], force: true });
    assert.equal(r2.status, 200);
    ok(await owner('POST', `/api/visits/${r2.data.id}/status`, { status: 'no_show' }));
    const dup = await owner('POST', '/api/clients', { name: 'Outra', phone: '11999990000' });
    assert.equal(dup.status, 409, 'telefone duplicado');
  });

  await step('bloqueio de horário e disponibilidade', async () => {
    ok(await owner('POST', '/api/blocks', { professional_id: carla, start_at: `${D} 14:00`, end_at: `${D} 15:00`, reason: 'Médico' }));
    const r = await owner('POST', '/api/visits', { client_id: cliente, items: [{ service_id: manicure, professional_id: carla, start_at: `${D} 14:15` }] });
    assert.equal(r.status, 409);
    const av = ok(await owner('GET', `/api/availability?professional_id=${carla}&date=${D}&duration=45`));
    assert.ok(!av.slots.includes('14:00') && !av.slots.includes('10:00'));
  });

  let sale;
  await step('checkout: serviços + produto, desconto e pagamento dividido com pendência', async () => {
    ok(await owner('POST', `/api/visits/${visit.id}/status`, { status: 'in_progress' }));
    const items = visit.items.map((i) => ({ kind: 'service', visit_item_id: i.id }));
    items.push({ kind: 'product', product_id: mascara, qty: 1, professional_id: bia });
    // total bruto 8000+4500+6000 = 18500; desconto 1850 (10%) => 16650
    sale = ok(await owner('POST', '/api/sales', { visit_id: visit.id, items, discount_cents: 1850, payments: [{ method: 'Pix', amount_cents: 10000 }, { method: 'Dinheiro', amount_cents: 5000 }] }));
    assert.equal(sale.total_cents, 16650);
    assert.equal(sale.pending_cents, 1650);
    const svc = sale.items.filter((i) => i.kind === 'service').reduce((s, i) => s + i.net_cents, 0);
    const prd = sale.items.filter((i) => i.kind === 'product').reduce((s, i) => s + i.net_cents, 0);
    assert.equal(svc + prd, 16650);
    assert.equal(prd, 5400);
    const esc = sale.items.find((i) => i.name === 'Escova');
    assert.equal(esc.commission_cents, Math.round(7200 * 0.4));
    assert.equal(sale.items.find((i) => i.name === 'Manicure').commission_cents, 1500, 'comissão fixa');
    assert.equal(sale.items.find((i) => i.kind === 'product').commission_cents, 540);
    const v = ok(await owner('GET', `/api/visits/${visit.id}`));
    assert.equal(v.status, 'completed');
    const again = await owner('POST', '/api/sales', { visit_id: visit.id, items });
    assert.equal(again.status, 409, 'não vende a mesma visita duas vezes');
    const p = ok(await owner('GET', '/api/products')).find((x) => x.id === mascara);
    assert.equal(p.stock, 2);
    const bad = await owner('POST', '/api/sales', { items: [{ kind: 'product', product_id: luva, qty: 1 }] });
    assert.equal(bad.status, 400, 'material interno não é vendido');
  });

  await step('recebimento posterior e faturamento ≠ recebido', async () => {
    const over = await owner('POST', `/api/sales/${sale.id}/payments`, { payments: [{ method: 'Pix', amount_cents: 99999 }] });
    assert.equal(over.status, 400);
    ok(await owner('POST', `/api/sales/${sale.id}/payments`, { payments: [{ method: 'Cartão de crédito', amount_cents: 1650 }] }));
    const r = ok(await owner('GET', `/api/reports/sales?from=${D}&to=${D}`));
    assert.equal(r.summary.revenue, 16650);
    assert.equal(r.summary.revenue_services + r.summary.revenue_products, 16650);
    assert.equal(r.summary.discounts, 1850);
    const dash = ok(await owner('GET', '/api/dashboard'));
    assert.ok(dash.today && dash.month);
  });

  await step('comissões: pagamento sem duplicidade e estorno bloqueado', async () => {
    const list = ok(await owner('GET', `/api/commissions?from=${D}&to=${D}`));
    const b = list.find((x) => x.id === bia);
    assert.equal(b.pending, 2880 + 540);
    ok(await owner('POST', '/api/commissions/pay', { professional_id: bia, until: D }));
    const again = await owner('POST', '/api/commissions/pay', { professional_id: bia, until: D });
    assert.equal(again.status, 400);
    const v = await owner('POST', `/api/sales/${sale.id}/void`, { reason: 'teste' });
    assert.equal(v.status, 409);
  });

  await step('estorno retira dos indicadores e devolve estoque', async () => {
    const s2 = ok(await owner('POST', '/api/sales', { client_id: cliente, items: [{ kind: 'product', product_id: mascara, qty: 1 }], payments: [{ method: 'Pix', amount_cents: 6000 }] }));
    ok(await owner('POST', `/api/sales/${s2.id}/void`, { reason: 'Lançado errado' }));
    assert.equal(ok(await owner('GET', '/api/products')).find((x) => x.id === mascara).stock, 2);
    const r = ok(await owner('GET', `/api/reports/sales?from=${T}&to=${T}`));
    assert.ok(!r.products.some((p) => p.total === 6000));
  });

  await step('financeiro: despesas, recorrência, lucro estimado', async () => {
    ok(await owner('POST', '/api/recurring-expenses', { description: 'Aluguel', amount_cents: 200000, day_of_month: 10 }));
    ok(await owner('POST', '/api/expenses', { description: 'Luz', amount_cents: 30000, due_date: D, paid: true, method: 'Pix' }));
    const m = D.slice(0, 7);
    const exps = ok(await owner('GET', `/api/expenses?from=${m}-01&to=${m}-28`));
    assert.equal(exps.filter((e) => e.description === 'Aluguel').length, 1);
    ok(await owner('GET', `/api/expenses?from=${m}-01&to=${m}-28`));
    assert.equal(ok(await owner('GET', `/api/expenses?from=${m}-01&to=${m}-28`)).filter((e) => e.description === 'Aluguel').length, 1, 'recorrente não duplica');
    const f = ok(await owner('GET', `/api/finance/summary?from=${D}&to=${D}`));
    assert.equal(f.revenue, 16650);
    assert.equal(f.profit, 16650 - 2500 - (2880 + 1500 + 540) - f.expenses);
    const cf = ok(await owner('GET', `/api/finance/cashflow?from=${D}&to=${D}`));
    assert.ok(cf.total_out >= 30000);
    const mg = ok(await owner('GET', `/api/reports/management?from=${m}-01&to=${D}`));
    assert.equal(mg.top_pro.name, 'Bia');
  });

  await step('permissões: profissional vê só a própria agenda e não acessa financeiro', async () => {
    ok(await owner('POST', '/api/users', { name: 'Carla', email: 'carla@teste.com', password: 'senha1234', role: 'pro', professional_id: carla }));
    const pro = client();
    ok(await pro('POST', '/api/auth/login', { email: 'carla@teste.com', password: 'senha1234' }));
    assert.equal((await pro('GET', `/api/finance/summary?from=${D}&to=${D}`)).status, 403);
    assert.equal((await pro('GET', `/api/reports/sales?from=${D}&to=${D}`)).status, 403);
    const ag = ok(await pro('GET', `/api/agenda?from=${D}&to=${D}`));
    assert.ok(ag.visits.every((v) => v.items.some((i) => i.professional_id === carla)));
    const cl = ok(await pro('GET', '/api/clients'));
    assert.ok(cl.every((c) => c.spent_cents === undefined), 'profissional não vê gasto das clientes');
    const com = ok(await pro('GET', `/api/commissions?from=${D}&to=${D}`));
    assert.equal(com.length, 1);
    assert.equal((await pro('POST', '/api/visits', { client_id: cliente, items: [{ service_id: escova, professional_id: bia, start_at: `${D} 16:00` }] })).status, 403 /* agenda de outra profissional */);
  });

  await step('isolamento entre salões', async () => {
    const other = client();
    ok(await other('POST', '/api/auth/signup', { salon_name: 'Outro', name: 'Eva', email: 'eva@outro.com', password: 'senha1234' }));
    assert.equal(ok(await other('GET', '/api/clients')).length, 0);
    assert.equal((await other('GET', `/api/visits/${visit.id}`)).status, 404);
    assert.equal((await other('GET', `/api/sales/${sale.id}`)).status, 404);
    assert.equal((await other('GET', `/api/clients/${cliente}`)).status, 404);
    assert.equal((await other('POST', '/api/sales', { items: [{ kind: 'product', product_id: mascara }] })).status, 400);
  });

  await step('histórico da cliente e busca global', async () => {
    const h = ok(await owner('GET', `/api/clients/${cliente}`));
    assert.ok(h.last_by_service.some((s) => s.name === 'Escova'));
    assert.equal(h.client.spent_cents, 16650);
    const s = ok(await owner('GET', '/api/search?q=mar'));
    assert.ok(s.clients.some((c) => c.name === 'Maria Souza'));
  });

  await step('agendamento online público', async () => {
    const anon = client();
    const settings = ok(await owner('GET', '/api/salon'));
    assert.equal(settings.slug, 'salao-teste');
    assert.equal((await anon('GET', '/api/public/salao-teste')).status, 404, 'desligado por padrão');
    ok(await owner('PUT', '/api/salon/booking', { slug: 'salao-teste', enabled: true }));
    const svc = ok(await owner('GET', '/api/services')).find((s) => s.id === escova);
    ok(await owner('PUT', `/api/services/${escova}`, { ...svc, online: true, pros: svc.pros }));
    const pub = ok(await anon('GET', '/api/public/salao-teste'));
    assert.deepEqual(pub.services.map((s) => s.name), ['Escova']);
    assert.ok(!JSON.stringify(pub).includes('Maria'), 'não expõe clientes');
    const day = (() => {
      const t = new Date(Date.now() + 2 * 864e5);
      return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
    })();
    const slots = ok(await anon('GET', `/api/public/salao-teste/slots?service_id=${escova}&date=${day}`)).slots;
    assert.ok(slots.includes('10:00'));
    const b = ok(await anon('POST', '/api/public/salao-teste/book', { service_id: escova, start_at: `${day} 10:00`, name: 'Cliente Online', phone: '11 98888-7777' }));
    assert.equal(b.professional, 'Bia');
    const again = await anon('POST', '/api/public/salao-teste/book', { service_id: escova, start_at: `${day} 10:00`, name: 'Outra', phone: '11977776666' });
    assert.equal(again.status, 409, 'horário já ocupado');
    assert.ok(!ok(await anon('GET', `/api/public/salao-teste/slots?service_id=${escova}&date=${day}`)).slots.includes('10:00'));
    const ag = ok(await owner('GET', `/api/agenda?from=${day}&to=${day}`));
    const v = ag.visits.find((x) => x.client_name === 'Cliente Online');
    assert.equal(v.source, 'online');
    assert.equal(v.status, 'scheduled');
    const bad = await anon('POST', '/api/public/salao-teste/book', { service_id: manicure, start_at: `${day} 11:00`, name: 'X', phone: '11966665555' });
    assert.equal(bad.status, 400, 'serviço não liberado online');
    // consulta e cancelamento pelo link da reserva
    const look = ok(await anon('GET', `/api/public/salao-teste/booking/${b.token}`));
    assert.equal(look.status, 'scheduled');
    assert.equal(look.can_cancel, true);
    const canc = ok(await anon('POST', `/api/public/salao-teste/booking/${b.token}/cancel`));
    assert.equal(canc.status, 'cancelled');
    assert.equal((await anon('GET', '/api/public/salao-teste/booking/' + 'f'.repeat(32))).status, 404);
  });

  await step('fotos, perfil público do salão e fechamento de caixa', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const img = ok(await owner('POST', '/api/images', { data: png }));
    const pros = ok(await owner('GET', '/api/professionals'));
    const bp = pros.find((p) => p.id === bia);
    ok(await owner('PUT', `/api/professionals/${bia}`, { ...bp, photo: img.url }));
    assert.equal(ok(await owner('GET', '/api/professionals')).find((p) => p.id === bia).photo_url, img.url);
    const res = await fetch(`http://localhost:${PORT}${img.url}`);
    assert.equal(res.headers.get('content-type'), 'image/png');
    ok(await owner('PUT', '/api/salon/profile', { name: 'Salão Teste', address: 'Rua das Flores, 10', phone: '11 98888-0000', logo: img.id, gallery: [img.id], cancel_hours: 6 }));
    const pub = ok(await client()('GET', '/api/public/salao-teste'));
    assert.equal(pub.address, 'Rua das Flores, 10');
    assert.equal(pub.gallery_urls.length, 1);
    assert.ok(pub.professionals.some((p) => p.photo_url === img.url));
    // imagem de outro salão não pode ser usada
    const other = client();
    ok(await other('POST', '/api/auth/signup', { salon_name: 'Terceiro', name: 'Lia', email: 'lia@x.com', password: 'senha1234' }));
    assert.equal((await other('PUT', '/api/salon/profile', { name: 'Terceiro', logo: img.id })).status, 400);
    const cash = ok(await owner('GET', `/api/finance/cash?date=${D}`));
    assert.ok(cash.total_in > 0);
    const closed = ok(await owner('POST', '/api/finance/cash', { date: D, counted_cash_cents: cash.expected_cash }));
    assert.equal(closed.closing.counted_cash_cents, cash.expected_cash);
  });

  await step('perfil gerente: gestão sim, configurações não', async () => {
    ok(await owner('POST', '/api/users', { name: 'Gê', email: 'gerente@teste.com', password: 'senha1234', role: 'manager' }));
    const mgr = client();
    ok(await mgr('POST', '/api/auth/login', { email: 'gerente@teste.com', password: 'senha1234' }));
    ok(await mgr('GET', `/api/finance/summary?from=${D}&to=${D}`));
    ok(await mgr('GET', `/api/commissions?from=${D}&to=${D}`));
    ok(await mgr('GET', `/api/reports/management?from=${D}&to=${D}`));
    assert.equal((await mgr('GET', '/api/users')).status, 403);
    assert.equal((await mgr('PUT', '/api/salon/booking', { slug: 'x-y-z', enabled: true })).status, 403);
  });

  console.log(`\n${passed} cenários passaram.`);
} catch (e) {
  console.error('\n✗ FALHOU:', e.message);
  process.exitCode = 1;
} finally {
  srv.kill();
  setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 300);
}
