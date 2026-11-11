// Teste do plano Pro (WhatsApp automático) com banco temporário, Mercado Pago e Evolution de mentira.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vyllorri-pro-'));
const PORT = 3989, MP = 3988, EVO = 3987;
const mp = { status: 'pending', n: 0 };
const sent = [];
const listen = (port, fn) => http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { res.setHeader('content-type', 'application/json'); fn(req, res, b); }); }).listen(port);
const mpSrv = listen(MP, (req, res, b) => {
  if (req.method === 'POST') { mp.n++; mp.body = JSON.parse(b); return res.end(JSON.stringify({ id: 7000 + mp.n, status: 'pending', point_of_interaction: { transaction_data: { qr_code: 'PIX', qr_code_base64: 'iVBO' } } })); }
  res.end(JSON.stringify({ id: req.url.split('/').pop(), status: mp.status, date_approved: '2026-01-01T10:00:00.000-03:00' }));
});
const evoSrv = listen(EVO, (req, res, b) => {
  if (req.headers.apikey !== 'evo-teste') return res.writeHead(401).end('{}');
  if (req.url.startsWith('/message/sendText/')) { sent.push(JSON.parse(b)); return res.end('{}'); }
  if (req.url.startsWith('/instance/connect/')) return res.end(JSON.stringify(req.url.includes('number=') ? { pairingCode: 'ABCD1234' } : { base64: 'iVBOR' }));
  res.end('{}');
});
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, RATE_LIMIT_MULT: '50', MP_ACCESS_TOKEN: 'mp', MP_BASE_URL: `http://localhost:${MP}`,
    EVOLUTION_URL: `http://localhost:${EVO}`, EVOLUTION_API_KEY: 'evo-teste', WHATSAPP_WEBHOOK_TOKEN: 'tok', CRON_SECRET: 'cron', ANTHROPIC_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((r) => srv.stdout.once('data', r));

let cookie = '';
const api = async (method, url, body, headers = {}) => {
  const r = await fetch(`http://localhost:${PORT}${url}`, { method, headers: { 'Content-Type': 'application/json', cookie, ...headers }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: r.status, data: await r.json().catch(() => null) };
};
const ok = (r) => { if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data)}`); return r.data; };
let passed = 0;
const step = async (name, fn) => { await fn(); passed++; console.log('✓', name); };
const msg = (phone, text, id = Math.random()) => ({ event: 'messages.upsert', instance: 'vy-1', data: { key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false, id: String(id) }, pushName: 'Cliente', message: { conversation: text } } });
const mine = (phone, text) => ({ event: 'messages.upsert', instance: 'vy-1', data: { key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: true, id: 'x' }, message: { conversation: text } } });
const hook = (b, token = 'tok') => api('POST', `/api/wa/webhook?token=${token}`, b);

try {
  await step('cadastro (teste grátis não tem Pro)', async () => {
    ok(await api('POST', '/api/auth/signup', { salon_name: 'Salão Pro', name: 'Ana', email: 'ana@pro.com', password: 'senha1234' }));
    const b = ok(await api('GET', '/api/billing'));
    assert.equal(b.status, 'trial'); assert.equal(b.pro_active, false); assert.equal(b.pro_cents, 2000);
    const w = ok(await api('GET', '/api/wa'));
    assert.equal(w.pro, false);
    assert.equal((await api('POST', '/api/wa/connect', {})).status, 402);
  });
  await step('escolher o Pro soma R$ 20 e o Pix sai com o Pro', async () => {
    const b = ok(await api('POST', '/api/billing/pro', { want: true }));
    assert.equal(b.plan.price_cents, 4990 + 2000); assert.equal(b.pro_active, false, 'escolher não libera');
    const pix = ok(await api('POST', '/api/billing/pix'));
    assert.equal(pix.amount_cents, 6990); assert.match(mp.body.description, /Pro/);
  });
  await step('Pix pago libera o Pro na hora (mesmo no teste grátis)', async () => {
    mp.status = 'approved';
    const b = ok(await api('GET', '/api/billing'));
    assert.equal(b.pro_active, true); assert.ok(b.pro_until);
  });
  await step('conectar por QR e por código', async () => {
    assert.ok(ok(await api('POST', '/api/wa/connect', {})).qr);
    assert.equal(ok(await api('POST', '/api/wa/connect', { number: '(86) 99999-8888' })).code, 'ABCD1234');
    assert.equal((await api('POST', '/api/wa/connect', { number: '123' })).status, 400);
    assert.equal((await hook({ event: 'connection.update', instance: 'vy-1', data: { state: 'open' } })).status, 200);
    assert.equal(ok(await api('GET', '/api/wa')).status, 'open');
  });
  await step('webhook sem token é recusado', async () => {
    assert.equal((await hook(msg('5586911112222', 'oi'), 'errado')).status, 401);
  });
  await step('mensagem de cliente recebe resposta (sem IA configurada: resposta padrão) e conta no limite', async () => {
    const before = sent.length;
    ok(await hook(msg('5586911112222', 'oi')));
    assert.equal(sent.length, before + 1); assert.equal(sent.at(-1).number, '5586911112222');
    assert.equal(ok(await api('GET', '/api/wa')).usage_count, 1);
  });
  await step('a cópia da resposta do sistema não pausa; o salão respondendo pausa só aquela cliente', async () => {
    ok(await hook(mine('558611112222', sent.at(-1).text))); // volta sem o 9: continua sendo do sistema
    let before = sent.length;
    ok(await hook(msg('5586911112222', 'tem horário?')));
    assert.equal(sent.length, before + 1, 'não pausou');
    ok(await hook(mine('5586911112222', 'Oi, aqui é a Ana!')));
    before = sent.length;
    ok(await hook(msg('5586911112222', 'beleza')));
    assert.equal(sent.length, before, 'pausado');
    ok(await hook(msg('5586933334444', 'oi')));
    assert.equal(sent.length, before + 1, 'outras clientes seguem');
  });
  await step('números ignorados', async () => {
    ok(await api('POST', '/api/wa/ignore', { numbers: '(86) 95555-6666' }));
    const before = sent.length;
    ok(await hook(msg('5586955556666', 'oi mãe')));
    assert.equal(sent.length, before);
  });
  await step('confirmação automática pelo agendador (uma vez só)', async () => {
    const pro = ok(await api('POST', '/api/professionals', { name: 'Bia', work_days: '0,1,2,3,4,5,6', start_time: '00:00', end_time: '23:59', commission_type: 'pct', commission_value: 0 })).id;
    const svc = ok(await api('POST', '/api/services', { name: 'Escova', price_cents: 8000, duration_min: 30, pros: [{ professional_id: pro }] })).id;
    const d = new Date(Date.now() + 2 * 864e5), pad = (n) => String(n).padStart(2, '0');
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const cli = ok(await api('POST', '/api/clients', { name: 'Carla Souza', phone: '86 97777-1111' })).id;
    const v = ok(await api('POST', '/api/visits', { client_id: cli, date: day, items: [{ service_id: svc, professional_id: pro, start_at: `${day} 10:00` }] }));
    const vid = v.id ?? v.visit_id;
    ok(await api('POST', `/api/visits/${vid}/status`, { status: 'confirmed' }));
    assert.equal((await api('POST', '/api/cron/wa', {}, { authorization: 'Bearer errado' })).status, 401);
    const before = sent.length;
    assert.equal(ok(await api('POST', '/api/cron/wa', {}, { authorization: 'Bearer cron' })).sent, 1);
    assert.match(sent.at(-1).text, /confirmado/); assert.equal(sent.at(-1).number, '5586977771111');
    assert.equal(ok(await api('POST', '/api/cron/wa', {}, { authorization: 'Bearer cron' })).sent, 0, 'não repete');
    assert.equal(sent.length, before + 1);
  });
  console.log(`\n${passed} cenários do Pro passaram.`);
} catch (e) {
  console.error('✗', e.message);
  process.exitCode = 1;
} finally {
  srv.kill(); mpSrv.close(); evoSrv.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
