// Cria um salão de DEMONSTRAÇÃO (marcado como demo na interface) usando a própria API.
// Uso: com o servidor rodando, `npm run demo` (ou BASE_URL=http://... npm run demo)
const BASE = process.env.BASE_URL || 'http://localhost:3000';
let cookie = '';
async function call(method, url, body) {
  const res = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${url}: ${data.error}`);
  return data;
}
const pad = (n) => String(n).padStart(2, '0');
const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const pick = (a, i) => a[i % a.length];

const email = process.env.DEMO_EMAIL || 'demo@vyllorri.app';
const password = process.env.DEMO_PASSWORD || 'demo12345';
await call('POST', '/api/auth/signup', { salon_name: 'Salão Demonstração', name: 'Dona Demo', email, password, demo: true });
const cats = Object.fromEntries((await call('GET', '/api/categories')).map((c) => [c.name, c.id]));
const all = '0,1,2,3,4,5,6';
const pro = async (name, specialty, color, c) => (await call('POST', '/api/professionals', { name, specialty, color, work_days: all, start_time: '08:00', end_time: '20:00', break_start: '12:00', break_end: '13:00', commission_type: 'pct', commission_value: c, product_commission_pct: 10 })).id;
const P = { bia: await pro('Bia (demo)', 'Cabeleireira', '#b4548c', 40), carla: await pro('Carla (demo)', 'Manicure e pedicure', '#2f8fb3', 50), duda: await pro('Duda (demo)', 'Designer de sobrancelhas', '#2f9e74', 45) };
const svc = async (name, cat, price, dur, pros, extra = {}) => (await call('POST', '/api/services', { name, category_id: cats[cat], price_cents: price, duration_min: dur, pros: pros.map((p) => ({ professional_id: p })), ...extra })).id;
const S = {
  escova: await svc('Escova', 'Cabelo', 6000, 45, [P.bia]), corte: await svc('Corte feminino', 'Cabelo', 9000, 60, [P.bia]),
  color: await svc('Coloração', 'Cabelo', 18000, 120, [P.bia]), hidrat: await svc('Hidratação', 'Cabelo', 7000, 45, [P.bia]),
  mani: await svc('Manicure', 'Unhas', 3500, 45, [P.carla], { commission_type: 'fixed', commission_value: 1500 }), pedi: await svc('Pedicure', 'Unhas', 4000, 50, [P.carla]),
  sobr: await svc('Design de sobrancelha', 'Sobrancelhas', 4500, 30, [P.duda]),
};
const prod = async (name, price, cost, stock, kind = 'retail') => (await call('POST', '/api/products', { name, kind, price_cents: price, cost_cents: cost, stock, min_stock: 3 })).id;
const PR = [await prod('Máscara capilar (demo)', 8900, 4000, 12), await prod('Shampoo (demo)', 5900, 2500, 10), await prod('Finalizador (demo)', 4900, 2000, 2)];
await prod('Luvas descartáveis (demo)', 0, 50, 200, 'internal');
const names = ['Ana Demo', 'Beatriz Demo', 'Camila Demo', 'Daniela Demo', 'Elaine Demo', 'Fernanda Demo', 'Gabriela Demo', 'Helena Demo', 'Isabela Demo', 'Juliana Demo'];
const clients = [];
for (const [i, n] of names.entries()) clients.push((await call('POST', '/api/clients', { name: n, phone: `1199000${pad(i)}00`, notes: i === 2 ? 'Alergia a amônia (demo)' : null })).id);
const methods = ['Pix', 'Cartão de crédito', 'Dinheiro', 'Cartão de débito'];
const price = { [S.escova]: 6000, [S.corte]: 9000, [S.color]: 18000, [S.hidrat]: 7000, [S.mani]: 3500, [S.pedi]: 4000, [S.sobr]: 4500 };
const pprice = [8900, 5900, 4900];
const combos = [[S.escova, P.bia], [S.mani, P.carla], [S.color, P.bia], [S.sobr, P.duda], [S.corte, P.bia], [S.pedi, P.carla], [S.hidrat, P.bia]];
for (let d = 40, k = 0; d >= 1; d--) {
  for (let j = 0; j < 3; j++, k++) {
    const [s, p] = pick(combos, k + d);
    const items = [{ kind: 'service', service_id: s, professional_id: p }];
    let total = price[s];
    if (k % 4 === 0 && s !== S.mani) (items.push({ kind: 'service', service_id: S.mani, professional_id: P.carla }), (total += price[S.mani]));
    if (k % 5 === 0) (items.push({ kind: 'product', product_id: pick(PR, k), qty: 1, professional_id: p }), (total += pick(pprice, k)));
    const discount = k % 7 === 0 ? 1000 : 0;
    total -= discount;
    const payments = k % 13 === 0 ? [{ method: 'Pix', amount_cents: Math.round(total / 2) }]
      : k % 6 === 0 ? [{ method: 'Pix', amount_cents: 2000 }, { method: 'Dinheiro', amount_cents: total - 2000 }] : [{ method: pick(methods, k), amount_cents: total }];
    await call('POST', '/api/sales', { client_id: pick(clients, k), date: day(-d), items, discount_cents: discount, payments }).catch((e) => console.warn(e.message));
  }
}
// agenda de hoje e amanhã
const t = day(0), tm = day(1);
const v = async (c, items, status) => call('POST', '/api/visits', { client_id: c, status, force: true, items: items.map(([s, p, h]) => ({ service_id: s, professional_id: p, start_at: `${h.length > 5 ? h : t + ' ' + h}` })) });
await v(clients[0], [[S.escova, P.bia, '09:00'], [S.mani, P.carla, '09:00'], [S.sobr, P.duda, '09:50']], 'confirmed');
await v(clients[1], [[S.color, P.bia, '14:00']], 'scheduled');
await v(clients[3], [[S.pedi, P.carla, '15:00']], 'confirmed');
await v(clients[4], [[S.corte, P.bia, tm + ' 10:00']], 'scheduled');
await v(clients[5], [[S.mani, P.carla, tm + ' 11:00']], 'scheduled');
await call('POST', '/api/recurring-expenses', { description: 'Aluguel (demo)', category: 'Aluguel', amount_cents: 250000, day_of_month: 10 });
await call('POST', '/api/expenses', { description: 'Energia (demo)', category: 'Energia', amount_cents: 42000, due_date: day(-5), paid: true, method: 'Pix' });
await call('POST', '/api/expenses', { description: 'Internet (demo)', category: 'Internet / telefone', amount_cents: 12000, due_date: day(2) });
console.log('Demonstração criada.');
console.log(`Login: ${email}  Senha: ${password}`);
