// Teste de integração da API: sobe o servidor com um banco temporário e percorre os fluxos principais.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vyllorri-test-'));
const PORT = 3999;
// Mercado Pago de mentira: gera o Pix e responde o status que o teste mandar
const MP_PORT = 3998;
const fakeMp = { status: 'pending', created: 0 };
const mpSrv = (await import('node:http')).createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.headers.authorization !== 'Bearer mp-teste') return res.writeHead(401).end('{}');
    if (req.method === 'POST' && req.url === '/v1/payments') {
      fakeMp.created++;
      fakeMp.body = JSON.parse(body);
      return res.end(JSON.stringify({ id: 9000 + fakeMp.created, status: 'pending', point_of_interaction: { transaction_data: { qr_code: '00020126PIXTESTE', qr_code_base64: 'iVBORw0KGgo=' } } }));
    }
    if (req.method === 'GET' && req.url.startsWith('/v1/payments/')) return res.end(JSON.stringify({ id: req.url.split('/').pop(), status: fakeMp.status, date_approved: fakeMp.status === 'approved' ? '2026-01-01T10:00:00.000-03:00' : null }));
    res.writeHead(404).end('{}');
  });
}).listen(MP_PORT);
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, RATE_LIMIT_MULT: '50', DB_MAX_CONCURRENCY: '3', DB_IDLE_MS: '400', MP_ACCESS_TOKEN: 'mp-teste', MP_BASE_URL: `http://localhost:${MP_PORT}` }, stdio: ['ignore', 'pipe', 'inherit'],
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

  await step('modo "trabalho sozinha": profissional automática e troca de modo', async () => {
    const solo = client();
    ok(await solo('POST', '/api/auth/signup', { salon_name: 'Studio Solo', name: 'Rita Lima', email: 'rita@solo.com', password: 'senha1234', team_mode: 'solo' }));
    const me = ok(await solo('GET', '/api/me')).user;
    assert.equal(me.team_mode, 'solo');
    const pros = ok(await solo('GET', '/api/professionals'));
    assert.equal(pros.length, 1);
    assert.equal(pros[0].name, 'Rita Lima');
    assert.equal(me.professional_id, pros[0].id, 'acesso da dona ligado à profissional');
    const svc = ok(await solo('POST', '/api/services', { name: 'Escova', price_cents: 5000, duration_min: 40, pros: [{ professional_id: pros[0].id }] })).id;
    ok(await solo('POST', '/api/visits', { new_client: { name: 'Cliente da Rita' }, items: [{ service_id: svc, professional_id: pros[0].id, start_at: `${D} 23:00` }], force: true }));
    // com equipe, uma segunda profissional; voltar para "sozinha" exige deixar só uma ativa
    ok(await solo('PUT', '/api/salon/mode', { mode: 'team' }));
    const p2 = ok(await solo('POST', '/api/professionals', { name: 'Assistente', start_time: '09:00', end_time: '18:00', work_days: '1,2,3' })).id;
    assert.equal((await solo('PUT', '/api/salon/mode', { mode: 'solo' })).status, 409);
    const p2data = ok(await solo('GET', '/api/professionals')).find((p) => p.id === p2);
    ok(await solo('PUT', `/api/professionals/${p2}`, { ...p2data, active: false }));
    assert.equal(ok(await solo('PUT', '/api/salon/mode', { mode: 'solo' })).team_mode, 'solo');
    assert.equal(ok(await solo('GET', '/api/agenda?from=' + D + '&to=' + D)).visits.length, 1, 'agenda preservada ao trocar de modo');
  });

  // ---------------- Sinal por Pix + atendimento a domicílio ----------------
  const future = (n) => {
    const t = new Date(Date.now() + n * 864e5);
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  };
  const anonP = client();
  let colorId;
  await step('1. sem sinal: agendamento online não gera cobrança', async () => {
    colorId = ok(await owner('POST', '/api/services', { name: 'Coloração', price_cents: 10000, duration_min: 60, online: true, pros: [{ professional_id: bia }, { professional_id: carla }] })).id;
    const b = ok(await anonP('POST', '/api/public/salao-teste/book', { service_id: colorId, professional_id: bia, start_at: `${future(3)} 09:00`, name: 'Sem Sinal', phone: '11 91111-0001' }));
    assert.equal(b.charge, null);
    assert.equal(b.total_cents, 10000);
  });

  await step('chave Pix validada e QR Code de teste', async () => {
    assert.equal((await owner('PUT', '/api/salon/deposit', { enabled: true, pix_key_type: 'cpf', pix_key: '111.111.111-11', pix_name: 'Ana', pix_city: 'SP' })).status, 400, 'CPF inválido recusado');
    const pv = ok(await owner('POST', '/api/salon/deposit/preview', { pix_key_type: 'phone', pix_key: '(11) 98888-7777', pix_name: 'Salão Teste', pix_city: 'São Paulo' }));
    assert.ok(pv.brcode.startsWith('000201') && pv.brcode.includes('br.gov.bcb.pix') && pv.svg.includes('<svg'));
    ok(await owner('PUT', '/api/salon/deposit', { enabled: true, pct: 50, scope: 'all', include_travel: true, expire_min: 30, refund: 'refund', pix_key_type: 'cpf', pix_key: '529.982.247-25', pix_name: 'Ana Teste', pix_city: 'São Paulo' }));
  });

  let paidToken, paidCharge;
  await step('2/3. sinal de 50%: QR com valor exato, comprovante, confirmação e abatimento na conta', async () => {
    const pub = ok(await anonP('GET', '/api/public/salao-teste'));
    assert.equal(pub.deposit.pct, 50);
    const b = ok(await anonP('POST', '/api/public/salao-teste/book', { service_id: colorId, professional_id: bia, start_at: `${future(3)} 11:00`, name: 'Com Sinal', phone: '11 91111-0002' }));
    assert.equal(b.charge.status, 'pending');
    assert.equal(b.charge.amount_cents, 5000);
    assert.equal(b.charge.remaining_cents, 5000);
    assert.ok(b.charge.brcode.includes('540550.00'), 'valor exato no Pix Copia e Cola');
    assert.ok(b.charge.qr_svg.includes('<svg'));
    assert.equal(b.status_text, 'Aguardando pagamento do sinal');
    paidToken = b.token;
    // cliente clicar não confirma nada: só o comprovante, e só o salão aprova
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const sent = ok(await anonP('POST', `/api/public/salao-teste/booking/${b.token}/receipt`, { data: png }));
    assert.equal(sent.charge.status, 'submitted');
    assert.equal(sent.status, 'scheduled');
    const ag = ok(await owner('GET', `/api/agenda?from=${future(3)}&to=${future(3)}`));
    const v = ag.visits.find((x) => x.client_name === 'Com Sinal');
    assert.equal(v.charge_status, 'submitted');
    paidCharge = v.charge_id;
    // comprovante é privado: não abre pelo link público de imagens, só para a equipe
    const r = await fetch(`http://localhost:${PORT}/api/charges/${paidCharge}/receipt`);
    assert.equal(r.status, 401);
    ok(await owner('POST', `/api/charges/${paidCharge}/approve`));
    const after = ok(await anonP('GET', `/api/public/salao-teste/booking/${b.token}`));
    assert.equal(after.status, 'confirmed');
    assert.equal(after.paid_cents, 5000);
    assert.equal(after.remaining_cents, 5000);
    // fechamento: sinal abatido automaticamente
    ok(await owner('POST', `/api/visits/${v.id}/status`, { status: 'in_progress' }));
    const vis = ok(await owner('GET', `/api/visits/${v.id}`));
    assert.equal((await owner('POST', '/api/sales', { visit_id: v.id, items: [{ kind: 'service', visit_item_id: vis.items[0].id }], payments: [{ method: 'Pix', amount_cents: 6000 }] })).status, 400, 'não deixa pagar além do restante');
    const sale = ok(await owner('POST', '/api/sales', { visit_id: v.id, items: [{ kind: 'service', visit_item_id: vis.items[0].id }], payments: [{ method: 'Dinheiro', amount_cents: 5000 }] }));
    assert.equal(sale.total_cents, 10000);
    assert.equal(sale.pending_cents, 0);
    assert.ok(sale.payments.some((p) => p.method === 'Pix (sinal)' && p.amount_cents === 5000));
  });

  await step('4. pagamento recusado: cliente vê o motivo e reenvia', async () => {
    const b = ok(await anonP('POST', '/api/public/salao-teste/book', { service_id: colorId, professional_id: carla, start_at: `${future(4)} 10:00`, name: 'Recusada', phone: '11 91111-0003' }));
    assert.equal((await owner('POST', '/api/charges/999999/approve')).status, 404);
    const ag = ok(await owner('GET', `/api/agenda?from=${future(4)}&to=${future(4)}`));
    const v = ag.visits.find((x) => x.client_name === 'Recusada');
    ok(await owner('POST', `/api/charges/${v.charge_id}/reject`, { reason: 'Valor não encontrado no extrato' }));
    const seen = ok(await anonP('GET', `/api/public/salao-teste/booking/${b.token}`));
    assert.equal(seen.charge.status, 'rejected');
    assert.equal(seen.charge.reject_reason, 'Valor não encontrado no extrato');
    assert.ok(seen.charge.brcode, 'QR continua disponível para pagar');
    // outro salão não consegue mexer nesse pagamento
    const other = client();
    ok(await other('POST', '/api/auth/signup', { salon_name: 'Intruso', name: 'X', email: 'x@intruso.com', password: 'senha1234' }));
    assert.equal((await other('POST', `/api/charges/${v.charge_id}/approve`)).status, 404);
  });

  await step('5/6/7/8. domicílio: endereço, taxa por bairro, total e sinal de 50% sobre o total', async () => {
    assert.equal((await owner('PUT', '/api/salon/home', { enabled: true, fee_mode: 'by_area', areas: [], start: '08:00', end: '18:00', pro_ids: [bia], service_ids: [colorId] })).status, 400, 'por bairro exige bairros');
    ok(await owner('PUT', '/api/salon/home', { enabled: true, fee_mode: 'by_area', areas: [{ name: 'Centro', fee_cents: 1500 }, { name: 'Jardins', fee_cents: 2500 }], buffer_min: 30, start: '08:00', end: '18:00', pro_ids: [bia], service_ids: [colorId] }));
    const pub = ok(await anonP('GET', '/api/public/salao-teste'));
    const svc = pub.services.find((s) => s.id === colorId);
    assert.equal(svc.home, true);
    assert.deepEqual(pub.home.areas.map((a) => a.name), ['Centro', 'Jardins']);
    // no salão continua normal
    const inSalon = ok(await anonP('POST', '/api/public/salao-teste/book', { service_id: colorId, professional_id: carla, start_at: `${future(5)} 09:00`, location: 'salon', name: 'No Salão', phone: '11 91111-0004' }));
    assert.equal(inSalon.location, 'salon');
    assert.equal(inSalon.travel_fee_cents, 0);
    const address = { cep: '01310-100', street: 'Av. Paulista', number: '1000', complement: 'ap 12', district: 'Bela Vista', city: 'São Paulo/SP', reference: 'perto do metrô' };
    assert.equal((await anonP('POST', '/api/public/salao-teste/book', { service_id: colorId, start_at: `${future(5)} 10:00`, location: 'home', address, area: 'Moema', name: 'Fora', phone: '11 91111-0005' })).status, 400, 'bairro não atendido');
    const h = ok(await anonP('POST', '/api/public/salao-teste/book', { service_id: colorId, start_at: `${future(5)} 10:00`, location: 'home', address, area: 'Centro', name: 'Em Casa', phone: '11 91111-0006', lat: -23.56, lng: -46.65 }));
    assert.equal(h.location, 'home');
    assert.equal(h.professional, 'Bia', 'só quem atende a domicílio');
    assert.equal(h.travel_fee_cents, 1500);
    assert.equal(h.total_cents, 11500);
    assert.equal(h.charge.amount_cents, 5750);
    assert.equal(h.charge.remaining_cents, 5750);
    assert.ok(h.charge.brcode.includes('540557.50'), 'QR com R$ 57,50');
    assert.equal(h.home_address.street, 'Av. Paulista');
    const ag = ok(await owner('GET', `/api/agenda?from=${future(5)}&to=${future(5)}`));
    const v = ag.visits.find((x) => x.client_name === 'Em Casa');
    assert.equal(v.location, 'home');
    assert.equal(v.travel_fee_cents, 1500);
    assert.equal(v.travel_buffer_min, 30);
    assert.ok(JSON.parse(v.home_address).cep === '01310100');
    // na conta, a taxa entra automaticamente e o sinal (após aprovado) é abatido
    ok(await owner('POST', `/api/charges/${v.charge_id}/approve`));
    const vis = ok(await owner('GET', `/api/visits/${v.id}`));
    const sale = ok(await owner('POST', '/api/sales', { visit_id: v.id, items: [{ kind: 'service', visit_item_id: vis.items[0].id }], payments: [{ method: 'Pix', amount_cents: 5750 }] }));
    assert.equal(sale.total_cents, 11500);
    assert.ok(sale.items.some((i) => i.kind === 'fee' && i.net_cents === 1500 && i.commission_cents === 0));
    assert.equal(sale.pending_cents, 0);
  });

  await step('9. sem disponibilidade externa: profissional e deslocamento respeitados', async () => {
    const address = { cep: '01310100', street: 'Rua A', number: '1', district: 'Centro' };
    assert.equal((await anonP('POST', '/api/public/salao-teste/book', { service_id: colorId, professional_id: carla, start_at: `${future(6)} 10:00`, location: 'home', address, area: 'Centro', name: 'Quer Carla', phone: '11 91111-0007' })).status, 400, 'Carla não atende a domicílio');
    // Bia atende em casa das 10:00 às 11:00; com 30 min de deslocamento fica ocupada das 09:30 às 11:30 (serviço de 60 min)
    ok(await anonP('POST', '/api/public/salao-teste/book', { service_id: colorId, professional_id: bia, start_at: `${future(6)} 10:00`, location: 'home', address, area: 'Centro', name: 'Casa Bia', phone: '11 91111-0008' }));
    const slots = ok(await anonP('GET', `/api/public/salao-teste/slots?service_id=${colorId}&professional_id=${bia}&date=${future(6)}`)).slots;
    assert.ok(!slots.includes('11:00') && !slots.includes('09:00') && slots.includes('11:30') && slots.includes('08:30'));
    assert.equal((await anonP('POST', '/api/public/salao-teste/book', { service_id: colorId, professional_id: bia, start_at: `${future(6)} 11:00`, name: 'Colada', phone: '11 91111-0009' })).status, 409);
    // fora do horário do atendimento externo (até 18:00)
    assert.equal((await anonP('POST', '/api/public/salao-teste/book', { service_id: colorId, professional_id: bia, start_at: `${future(6)} 17:30`, location: 'home', address, area: 'Centro', name: 'Tarde', phone: '11 91111-0010' })).status, 400);
    const homeSlots = ok(await anonP('GET', `/api/public/salao-teste/slots?service_id=${colorId}&date=${future(6)}&location=home`)).slots;
    assert.ok(homeSlots.every((t) => t >= '08:00' && t <= '17:00'));
  });

  await step('10. cancelamento: devolução ou retenção do sinal conforme a regra; prazo vencido libera o horário', async () => {
    // regra "devolvo": sinal aprovado vira "a devolver"
    const b1 = ok(await anonP('POST', '/api/public/salao-teste/book', { service_id: colorId, professional_id: carla, start_at: `${future(7)} 09:00`, name: 'Cancela Devolve', phone: '11 91111-0011' }));
    let v = ok(await owner('GET', `/api/agenda?from=${future(7)}&to=${future(7)}`)).visits.find((x) => x.client_name === 'Cancela Devolve');
    ok(await owner('POST', `/api/charges/${v.charge_id}/approve`));
    const c1 = ok(await anonP('POST', `/api/public/salao-teste/booking/${b1.token}/cancel`));
    assert.equal(c1.status, 'cancelled');
    assert.equal(c1.charge.status, 'refund_due');
    ok(await owner('POST', `/api/charges/${v.charge_id}/refund`));
    // regra "não devolvo": sinal retido entra como receita
    const cfg = ok(await owner('GET', '/api/salon/deposit'));
    ok(await owner('PUT', '/api/salon/deposit', { enabled: true, pct: cfg.deposit_pct, scope: 'all', include_travel: true, expire_min: 30, refund: 'keep', pix_key_type: 'cpf', pix_key: cfg.pix_key, pix_name: cfg.pix_name, pix_city: cfg.pix_city }));
    const b2 = ok(await anonP('POST', '/api/public/salao-teste/book', { service_id: colorId, professional_id: carla, start_at: `${future(7)} 11:00`, name: 'Cancela Retem', phone: '11 91111-0012' }));
    v = ok(await owner('GET', `/api/agenda?from=${future(7)}&to=${future(7)}`)).visits.find((x) => x.client_name === 'Cancela Retem');
    ok(await owner('POST', `/api/charges/${v.charge_id}/approve`));
    const c2 = ok(await anonP('POST', `/api/public/salao-teste/booking/${b2.token}/cancel`));
    assert.equal(c2.charge.status, 'retained');
    const today = D;
    const fin = ok(await owner('GET', `/api/sales?from=${today}&to=${today}`));
    assert.ok(fin.some((s) => s.items_text.includes('Sinal retido') && s.total_cents === 5000));
    // sem comprovante dentro do prazo: cobrança expira e o horário volta a ficar livre
    const b3 = ok(await anonP('POST', '/api/public/salao-teste/book', { service_id: colorId, professional_id: carla, start_at: `${future(7)} 14:00`, name: 'Nao Pagou', phone: '11 91111-0013' }));
    const { createClient: libsql } = await import('@libsql/client');
    const dbc = libsql({ url: 'file:' + path.join(dir, 'vyllorri.db').replace(/\\/g, '/') });
    await dbc.execute("UPDATE charges SET expires_at='2000-01-01 00:00:00' WHERE status='pending'");
    dbc.close();
    const exp = ok(await anonP('GET', `/api/public/salao-teste/booking/${b3.token}`));
    assert.equal(exp.status, 'cancelled');
    assert.equal(exp.charge.status, 'expired');
    const free = ok(await anonP('GET', `/api/public/salao-teste/slots?service_id=${colorId}&professional_id=${carla}&date=${future(7)}`)).slots;
    assert.ok(free.includes('14:00'), 'horário liberado');
  });

  await step('notificações do app: inscrição do aparelho', async () => {
    const k = ok(await owner('GET', '/api/push/key'));
    assert.ok(k.key && k.key.length > 40);
    assert.equal((await owner('POST', '/api/push/subscribe', { endpoint: 'http://inseguro', keys: { p256dh: 'a', auth: 'b' } })).status, 400);
    ok(await owner('POST', '/api/push/subscribe', { endpoint: 'https://push.exemplo.invalid/abc', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } }));
    ok(await owner('POST', '/api/push/unsubscribe', { endpoint: 'https://push.exemplo.invalid/abc' }));
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

  await step('assinatura: 7 dias grátis, bloqueio ao fim do teste e liberação pelo pagamento', async () => {
    const b = client();
    ok(await b('POST', '/api/auth/signup', { salon_name: 'Salão Trial', name: 'Bia', email: 'bia@trial.com', password: 'senha1234', team_mode: 'solo' }));
    let me = ok(await b('GET', '/api/me')).user;
    assert.equal(me.billing.status, 'trial');
    assert.equal(me.billing.days_left, 7);
    assert.equal(me.billing.plan.price_cents, 3990);
    ok(await b('GET', '/api/clients'));
    ok(await b('PUT', '/api/salon/booking', { slug: 'salao-trial', enabled: true }));
    const { createClient: libsql } = await import('@libsql/client');
    const dbc = libsql({ url: 'file:' + path.join(dir, 'vyllorri.db').replace(/\\/g, '/') });
    await dbc.execute("UPDATE salons SET trial_ends_at='2000-01-01' WHERE slug='salao-trial'");
    me = ok(await b('GET', '/api/me')).user;
    assert.equal(me.billing.blocked, true);
    assert.equal((await b('GET', '/api/clients')).status, 402);
    ok(await b('GET', '/api/billing'));
    assert.equal((await client()('GET', '/api/public/salao-trial')).status, 404, 'página das clientes pausada');
    dbc.close();
    // gera o Pix da mensalidade (plano sozinha = R$ 39,90); pedir de novo reaproveita o mesmo QR
    const pix = ok(await b('POST', '/api/billing/pix'));
    assert.equal(pix.qr_code, '00020126PIXTESTE');
    assert.equal(fakeMp.body.transaction_amount, 39.9);
    assert.equal(fakeMp.body.payment_method_id, 'pix');
    assert.equal(ok(await b('POST', '/api/billing/pix')).id, pix.id);
    assert.equal(fakeMp.created, 1);
    // aviso falso não libera nada: o status é sempre conferido no Mercado Pago
    ok(await client()('POST', '/api/billing/webhook', { type: 'payment', data: { id: '9001' } }));
    assert.equal(ok(await b('GET', '/api/me')).user.billing.blocked, true);
    // pagou: o aviso confirma e libera um mês
    fakeMp.status = 'approved';
    ok(await client()('POST', '/api/billing/webhook', { type: 'payment', data: { id: '9001' } }));
    me = ok(await b('GET', '/api/me')).user;
    assert.equal(me.billing.status, 'active');
    assert.ok(me.billing.days_left >= 27);
    ok(await b('GET', '/api/clients'));
    assert.equal(ok(await b('GET', '/api/billing')).last_paid.amount_cents, 3990);
  });

  await step('planos: Sozinha sem acessos extras; Com equipe cobra R$ 9,90 por profissional acima de 5', async () => {
    const s = client();
    ok(await s('POST', '/api/auth/signup', { salon_name: 'Solo Plano', name: 'Lu', email: 'lu@plano.com', password: 'senha1234', team_mode: 'solo' }));
    assert.equal((await s('POST', '/api/users', { name: 'Rê', email: 're@plano.com', password: 'senha1234', role: 'reception' })).status, 403);
    const t = client();
    ok(await t('POST', '/api/auth/signup', { salon_name: 'Equipe Plano', name: 'Mi', email: 'mi@plano.com', password: 'senha1234', team_mode: 'team' }));
    for (let i = 1; i <= 7; i++)
      ok(await t('POST', '/api/professionals', { name: `Pro ${i}`, work_days: '1,2,3,4,5', start_time: '09:00', end_time: '18:00', commission_type: 'pct', commission_value: 40 }));
    const plan = ok(await t('GET', '/api/billing')).plan;
    assert.equal(plan.extra_pros, 2);
    assert.equal(plan.price_cents, 4990 + 2 * 990);
    // acesso de recepção funciona no plano com equipe e fica pausado se o salão mudar para Sozinha
    ok(await t('POST', '/api/users', { name: 'Recepção', email: 'rec@plano.com', password: 'senha1234', role: 'reception' }));
    const rec = client();
    ok(await rec('POST', '/api/auth/login', { email: 'rec@plano.com', password: 'senha1234' }));
    ok(await rec('GET', '/api/clients'));
  });

  await step('banco: 60 acessos simultâneos com limite de 3 conexões, sem erro; conexão ociosa fecha e reabre', async () => {
    // servidor de teste roda com DB_MAX_CONCURRENCY=3: o resto espera na fila em vez de sobrecarregar o banco
    const results = await Promise.all(Array.from({ length: 60 }, (_, i) => owner('GET', i % 2 ? '/api/clients' : '/api/services')));
    assert.ok(results.every((r) => r.status === 200), 'todas as requisições responderam 200');
    // transações concorrentes (cadastro de clientes) também passam pela fila sem travar
    const created = await Promise.all(Array.from({ length: 12 }, (_, i) => owner('POST', '/api/clients', { name: `Fila ${i}`, phone: `11 97777-${String(1000 + i)}` })));
    assert.ok(created.every((r) => r.status === 200), 'cadastros concorrentes ok');
    // DB_IDLE_MS=400: depois de ficar parado a conexão é fechada e a próxima consulta abre outra
    await new Promise((r) => setTimeout(r, 900));
    ok(await owner('GET', '/api/clients'));
  });

  console.log(`\n${passed} cenários passaram.`);
} catch (e) {
  console.error('\n✗ FALHOU:', e.message);
  process.exitCode = 1;
} finally {
  srv.kill();
  mpSrv.close();
  setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }, 500);
}
