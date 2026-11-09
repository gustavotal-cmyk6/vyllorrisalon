import { createClient } from '@libsql/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './http.js';

// Produção (Vercel): banco Turso/libSQL em nuvem via TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
// Desenvolvimento: arquivo SQLite local em DATA_DIR.
let url = process.env.TURSO_DATABASE_URL;
const SERVERLESS = !!process.env.VERCEL;
// na Vercel o disco é temporário: sem banco em nuvem os dados se perderiam
if (!url && SERVERLESS) throw new Error('Configure TURSO_DATABASE_URL e TURSO_AUTH_TOKEN nas variáveis de ambiente da Vercel.');
if (!url) {
  const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  url = 'file:' + path.join(dir, 'vyllorri.db').replace(/\\/g, '/');
}
const local = url.startsWith('file:');
// Em serverless, "libsql://" abriria um WebSocket persistente que fica velho quando a instância congela.
// Usamos HTTP (cada consulta é uma requisição sem estado; o fetch do Node reaproveita e fecha sozinho os sockets ociosos).
if (SERVERLESS && url.startsWith('libsql://') && process.env.DB_TRANSPORT !== 'ws') url = 'https://' + url.slice('libsql://'.length);

// ---------- Conexão reutilizada + limite de concorrência + encerramento por ociosidade ----------
// O libSQL/Turso não tem pool TCP como Postgres/MySQL: o equivalente seguro é UM cliente por instância,
// reaproveitado entre requisições, com um semáforo limitando quantas consultas/transações rodam ao mesmo tempo.
const envInt = (name, def) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
};
export const DB_LIMITS = {
  max: envInt('DB_MAX_CONCURRENCY', SERVERLESS ? 8 : local ? 4 : 10), // consultas/transações simultâneas por instância
  queue: envInt('DB_MAX_QUEUE', 200), // pedidos esperando vaga; acima disso responde "ocupado" na hora
  waitMs: envInt('DB_QUEUE_TIMEOUT_MS', 8000), // tempo máximo esperando vaga
  txMs: envInt('DB_TX_TIMEOUT_MS', 15000), // transação mais longa que isso é desfeita (não segura o banco)
  idleMs: envInt('DB_IDLE_MS', SERVERLESS ? 10000 : 60000), // sem uso por esse tempo: a conexão é fechada
};

let _client = null;
let idleTimer = null;
let active = 0;
const waiting = [];

function conn() {
  if (!_client) _client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return _client;
}
/** Fecha a conexão (ociosidade, fim do processo ou testes). A próxima consulta abre outra. */
export function closeDb() {
  clearTimeout(idleTimer);
  idleTimer = null;
  if (_client) {
    _client.close();
    _client = null;
  }
}
function scheduleIdleClose() {
  clearTimeout(idleTimer);
  if (active || waiting.length || !_client) return;
  idleTimer = setTimeout(() => {
    if (!active && !waiting.length) closeDb();
  }, DB_LIMITS.idleMs);
  idleTimer.unref?.(); // não impede o processo de terminar
}
const busy = () => new HttpError(503, 'O sistema está com muitos acessos agora. Tente de novo em alguns segundos.');
async function acquire() {
  clearTimeout(idleTimer);
  if (active < DB_LIMITS.max) {
    active++;
    return;
  }
  if (waiting.length >= DB_LIMITS.queue) throw busy();
  await new Promise((resolve, reject) => {
    const w = { resolve, timer: setTimeout(() => {
      const i = waiting.indexOf(w);
      if (i >= 0) waiting.splice(i, 1);
      reject(busy());
    }, DB_LIMITS.waitMs) };
    waiting.push(w);
  });
}
function release() {
  const next = waiting.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve(); // a vaga passa direto para quem esperava
  } else {
    active--;
    scheduleIdleClose();
  }
}
/** Executa fn com uma vaga reservada e a conexão compartilhada. */
async function withSlot(fn) {
  await acquire();
  try {
    return await fn(conn());
  } finally {
    release();
  }
}
/** Situação atual (útil para monitorar). */
export const dbStats = () => ({ active, waiting: waiting.length, open: !!_client, ...DB_LIMITS });

// Todos os valores monetários em centavos (INTEGER). Toda tabela de negócio tem salon_id (isolamento por salão).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS salons(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS professionals(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id),
  name TEXT NOT NULL, specialty TEXT, phone TEXT, color TEXT NOT NULL DEFAULT '#b4548c',
  work_days TEXT NOT NULL DEFAULT '1,2,3,4,5,6', start_time TEXT NOT NULL DEFAULT '09:00', end_time TEXT NOT NULL DEFAULT '19:00',
  break_start TEXT, break_end TEXT,
  commission_type TEXT NOT NULL DEFAULT 'pct', commission_value REAL NOT NULL DEFAULT 0,
  product_commission_pct REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id),
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, pass_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','manager','reception','pro')),
  professional_id INTEGER REFERENCES professionals(id), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS categories(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), name TEXT NOT NULL, UNIQUE(salon_id, name));
CREATE TABLE IF NOT EXISTS services(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), category_id INTEGER REFERENCES categories(id),
  name TEXT NOT NULL, description TEXT, price_cents INTEGER NOT NULL, duration_min INTEGER NOT NULL,
  commission_type TEXT, commission_value REAL, online INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
-- profissionais habilitadas; preço/comissão próprios são opcionais (NULL = usa o padrão do serviço)
CREATE TABLE IF NOT EXISTS service_pros(
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  professional_id INTEGER NOT NULL REFERENCES professionals(id),
  price_cents INTEGER, commission_type TEXT, commission_value REAL,
  PRIMARY KEY(service_id, professional_id));
CREATE TABLE IF NOT EXISTS clients(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id),
  name TEXT NOT NULL, phone TEXT, birthday TEXT, preferred_pro_id INTEGER REFERENCES professionals(id),
  notes TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_clients_salon ON clients(salon_id, name);
CREATE TABLE IF NOT EXISTS visits(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), client_id INTEGER NOT NULL REFERENCES clients(id),
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','confirmed','waiting','in_progress','completed','cancelled','no_show')),
  notes TEXT, late_min INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_visits_date ON visits(salon_id, date);
CREATE TABLE IF NOT EXISTS visit_items(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL, visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id), professional_id INTEGER NOT NULL REFERENCES professionals(id),
  start_at TEXT NOT NULL, end_at TEXT NOT NULL, duration_min INTEGER NOT NULL, price_cents INTEGER NOT NULL,
  overbook INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_vitems_pro ON visit_items(salon_id, professional_id, start_at);
CREATE TABLE IF NOT EXISTS blocks(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), professional_id INTEGER REFERENCES professionals(id),
  start_at TEXT NOT NULL, end_at TEXT NOT NULL, reason TEXT);
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('retail','internal')), unit TEXT NOT NULL DEFAULT 'un',
  price_cents INTEGER NOT NULL DEFAULT 0, cost_cents INTEGER NOT NULL DEFAULT 0,
  stock REAL NOT NULL DEFAULT 0, min_stock REAL NOT NULL DEFAULT 0, commission_pct REAL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS sales(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), client_id INTEGER REFERENCES clients(id),
  visit_id INTEGER REFERENCES visits(id), professional_id INTEGER REFERENCES professionals(id),
  subtotal_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL DEFAULT 0, total_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','void')), void_reason TEXT, voided_at TEXT,
  created_by INTEGER, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_sales_date ON sales(salon_id, created_at);
CREATE TABLE IF NOT EXISTS commission_payments(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), professional_id INTEGER NOT NULL REFERENCES professionals(id),
  amount_cents INTEGER NOT NULL, note TEXT, created_by INTEGER, created_at TEXT NOT NULL);
-- net_cents = valor da linha já com o desconto rateado; é a base de receita e de comissão
CREATE TABLE IF NOT EXISTS sale_items(
  id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE, salon_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('service','product','fee')),
  service_id INTEGER REFERENCES services(id), product_id INTEGER REFERENCES products(id), visit_item_id INTEGER REFERENCES visit_items(id),
  name TEXT NOT NULL, professional_id INTEGER REFERENCES professionals(id), qty REAL NOT NULL DEFAULT 1,
  unit_cents INTEGER NOT NULL, gross_cents INTEGER NOT NULL, net_cents INTEGER NOT NULL, cost_cents INTEGER NOT NULL DEFAULT 0,
  commission_cents INTEGER NOT NULL DEFAULT 0, commission_note TEXT,
  commission_payment_id INTEGER REFERENCES commission_payments(id));
CREATE INDEX IF NOT EXISTS ix_sitems_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS ix_sitems_pro ON sale_items(salon_id, professional_id);
CREATE TABLE IF NOT EXISTS payment_methods(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(salon_id, name));
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), sale_id INTEGER NOT NULL REFERENCES sales(id),
  method TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), created_by INTEGER, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_payments_sale ON payments(sale_id);
CREATE INDEX IF NOT EXISTS ix_payments_date ON payments(salon_id, created_at);
CREATE TABLE IF NOT EXISTS stock_moves(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), product_id INTEGER NOT NULL REFERENCES products(id),
  type TEXT NOT NULL CHECK(type IN ('in','out','use','adjust','sale','void')), qty REAL NOT NULL, note TEXT,
  sale_id INTEGER REFERENCES sales(id), created_by INTEGER, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS recurring_expenses(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), description TEXT NOT NULL, category TEXT,
  amount_cents INTEGER NOT NULL, day_of_month INTEGER NOT NULL DEFAULT 5, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS expenses(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), description TEXT NOT NULL, category TEXT,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), due_date TEXT NOT NULL, paid_at TEXT, method TEXT,
  recurring_id INTEGER REFERENCES recurring_expenses(id), ref_month TEXT, created_at TEXT NOT NULL,
  UNIQUE(recurring_id, ref_month));
CREATE INDEX IF NOT EXISTS ix_expenses_due ON expenses(salon_id, due_date);
-- imagens (fotos de profissionais, serviços, salão), servidas por um identificador aleatório
CREATE TABLE IF NOT EXISTS images(
  id TEXT PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), mime TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
-- sinal pago por Pix (QR Code estático): a cliente envia o comprovante e o salão confirma
CREATE TABLE IF NOT EXISTS charges(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), visit_id INTEGER NOT NULL REFERENCES visits(id),
  kind TEXT NOT NULL DEFAULT 'deposit', amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','submitted','approved','rejected','expired','cancelled','refund_due','refunded','retained')),
  txid TEXT NOT NULL, brcode TEXT NOT NULL, receipt_image TEXT, receipt_at TEXT, reject_reason TEXT,
  reviewed_by INTEGER, reviewed_at TEXT, applied_sale_id INTEGER REFERENCES sales(id),
  expires_at TEXT NOT NULL, paid_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_charges_visit ON charges(visit_id);
CREATE INDEX IF NOT EXISTS ix_charges_status ON charges(salon_id, status);
-- notificações do app (Web Push) por aparelho
-- mensalidades do Vyllorri pagas por Pix (Mercado Pago)
CREATE TABLE IF NOT EXISTS billing_payments(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), mp_id TEXT NOT NULL UNIQUE, amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL, qr_code TEXT, qr_base64 TEXT, expires_at TEXT, paid_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_subscriptions(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), user_id INTEGER NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL);
-- fechamento de caixa diário
CREATE TABLE IF NOT EXISTS cash_closings(
  id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id), date TEXT NOT NULL,
  expected_cash_cents INTEGER NOT NULL, counted_cash_cents INTEGER NOT NULL, total_in_cents INTEGER NOT NULL,
  notes TEXT, created_by INTEGER, created_at TEXT NOT NULL, UNIQUE(salon_id, date));
`;

// Versão do esquema = hash deste arquivo. Se nada mudou desde a última inicialização, o cold start
// faz 1 consulta em vez de ~70 (schema + migrações), evitando rajadas no banco quando várias instâncias sobem.
const SCHEMA_VERSION = crypto.createHash('sha1').update(fs.readFileSync(new URL(import.meta.url))).digest('hex');

export const ready = withSlot(async (client) => {
  if (local) await client.executeMultiple('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  await client.execute('CREATE TABLE IF NOT EXISTS _meta(key TEXT PRIMARY KEY, value TEXT)');
  const current = (await client.execute("SELECT value FROM _meta WHERE key='schema'")).rows[0]?.[0];
  if (current === SCHEMA_VERSION) return;
  await client.executeMultiple(SCHEMA);
  // migrações aditivas (ignoradas se a coluna já existe)
  for (const sql of [
    'ALTER TABLE salons ADD COLUMN slug TEXT',
    'ALTER TABLE salons ADD COLUMN booking_enabled INTEGER NOT NULL DEFAULT 0',
    "ALTER TABLE visits ADD COLUMN source TEXT NOT NULL DEFAULT 'internal'",
    'ALTER TABLE visits ADD COLUMN public_token TEXT',
    'ALTER TABLE professionals ADD COLUMN photo TEXT',
    'ALTER TABLE services ADD COLUMN photo TEXT',
    'ALTER TABLE products ADD COLUMN category TEXT',
    // perfil público do salão
    'ALTER TABLE salons ADD COLUMN description TEXT',
    'ALTER TABLE salons ADD COLUMN address TEXT',
    'ALTER TABLE salons ADD COLUMN phone TEXT',
    'ALTER TABLE salons ADD COLUMN instagram TEXT',
    'ALTER TABLE salons ADD COLUMN opening_hours TEXT',
    'ALTER TABLE salons ADD COLUMN logo TEXT',
    'ALTER TABLE salons ADD COLUMN cover_photo TEXT',
    "ALTER TABLE salons ADD COLUMN gallery TEXT NOT NULL DEFAULT '[]'",
    'ALTER TABLE salons ADD COLUMN cancel_hours INTEGER NOT NULL DEFAULT 12',
    // 'solo' = profissional que trabalha sozinha; 'team' = salão com equipe
    "ALTER TABLE salons ADD COLUMN team_mode TEXT NOT NULL DEFAULT 'team'",
    // frase de destaque da página pública (palavra entre *asteriscos* fica em destaque)
    'ALTER TABLE salons ADD COLUMN headline TEXT',
    // cor principal da página pública (#rrggbb); vazio = rosa padrão
    'ALTER TABLE salons ADD COLUMN page_color TEXT',
    // 0 = só faz serviços (painel sem produtos e estoque)
    'ALTER TABLE salons ADD COLUMN sells_products INTEGER NOT NULL DEFAULT 1',
    // assinatura do Vyllorri: teste grátis e cobrança automática (Asaas)
    'ALTER TABLE salons ADD COLUMN trial_ends_at TEXT',
    "ALTER TABLE salons ADD COLUMN sub_status TEXT NOT NULL DEFAULT 'none'",
    'ALTER TABLE salons ADD COLUMN paid_until TEXT',
    // pagamento antecipado (sinal)
    'ALTER TABLE salons ADD COLUMN deposit_enabled INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE salons ADD COLUMN deposit_pct REAL NOT NULL DEFAULT 50',
    "ALTER TABLE salons ADD COLUMN deposit_scope TEXT NOT NULL DEFAULT 'all'",
    'ALTER TABLE salons ADD COLUMN deposit_include_travel INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE salons ADD COLUMN deposit_expire_min INTEGER NOT NULL DEFAULT 30',
    // 'refund' = sinal devolvido se a cliente cancelar dentro do prazo; 'keep' = sinal não é devolvido
    "ALTER TABLE salons ADD COLUMN deposit_refund TEXT NOT NULL DEFAULT 'refund'",
    // chave Pix do próprio salão (QR Code estático, confirmação manual)
    'ALTER TABLE salons ADD COLUMN pix_key_type TEXT',
    'ALTER TABLE salons ADD COLUMN pix_key TEXT',
    'ALTER TABLE salons ADD COLUMN pix_name TEXT',
    'ALTER TABLE salons ADD COLUMN pix_city TEXT',
    'ALTER TABLE images ADD COLUMN private INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE services ADD COLUMN requires_deposit INTEGER NOT NULL DEFAULT 0',
    // atendimento a domicílio
    'ALTER TABLE salons ADD COLUMN home_enabled INTEGER NOT NULL DEFAULT 0',
    "ALTER TABLE salons ADD COLUMN home_fee_mode TEXT NOT NULL DEFAULT 'fixed'",
    'ALTER TABLE salons ADD COLUMN home_fee_cents INTEGER NOT NULL DEFAULT 0',
    "ALTER TABLE salons ADD COLUMN home_areas TEXT NOT NULL DEFAULT '[]'",
    'ALTER TABLE salons ADD COLUMN home_buffer_min INTEGER NOT NULL DEFAULT 30',
    "ALTER TABLE salons ADD COLUMN home_start TEXT NOT NULL DEFAULT '08:00'",
    "ALTER TABLE salons ADD COLUMN home_end TEXT NOT NULL DEFAULT '20:00'",
    'ALTER TABLE professionals ADD COLUMN home_service INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE services ADD COLUMN home_allowed INTEGER NOT NULL DEFAULT 0',
    "ALTER TABLE visits ADD COLUMN location TEXT NOT NULL DEFAULT 'salon'",
    'ALTER TABLE visits ADD COLUMN home_address TEXT',
    'ALTER TABLE visits ADD COLUMN home_area TEXT',
    'ALTER TABLE visits ADD COLUMN home_lat REAL',
    'ALTER TABLE visits ADD COLUMN home_lng REAL',
    'ALTER TABLE visits ADD COLUMN travel_fee_cents INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE visits ADD COLUMN travel_buffer_min INTEGER NOT NULL DEFAULT 0',
  ])
    await client.execute(sql).catch(() => {});
  // salões criados antes da assinatura existir ficam com acesso de cortesia (os novos sempre têm data de fim do teste)
  await client.execute("UPDATE salons SET sub_status='comp' WHERE trial_ends_at IS NULL AND sub_status='none'");
  await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS ux_salons_slug ON salons(slug)');
  await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS ux_visits_token ON visits(public_token)');
  const si = (await client.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='sale_items'")).rows[0];
  if (si && !String(si[0]).includes("'fee'")) {
    const def = String(si[0]).replace("CHECK(kind IN ('service','product'))", "CHECK(kind IN ('service','product','fee'))").replace(/CREATE TABLE \"?sale_items\"?/, 'CREATE TABLE sale_items_new');
    await client.executeMultiple(`PRAGMA foreign_keys=OFF;
      BEGIN;
      ${def};
      INSERT INTO sale_items_new SELECT * FROM sale_items;
      DROP TABLE sale_items;
      ALTER TABLE sale_items_new RENAME TO sale_items;
      CREATE INDEX IF NOT EXISTS ix_sitems_sale ON sale_items(sale_id);
      CREATE INDEX IF NOT EXISTS ix_sitems_pro ON sale_items(salon_id, professional_id);
      COMMIT;
      PRAGMA foreign_keys=ON;`);
  }
  // perfil "gerente": bancos antigos têm a restrição de papéis sem ele; recria a tabela preservando os dados
  const users = (await client.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")).rows[0];
  if (users && !String(users[0]).includes("'manager'")) {
    await client.executeMultiple(`PRAGMA foreign_keys=OFF;
      BEGIN;
      CREATE TABLE users_new(
        id INTEGER PRIMARY KEY, salon_id INTEGER NOT NULL REFERENCES salons(id),
        name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, pass_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner','manager','reception','pro')),
        professional_id INTEGER REFERENCES professionals(id), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
      INSERT INTO users_new(id,salon_id,name,email,pass_hash,role,professional_id,active,created_at)
        SELECT id,salon_id,name,email,pass_hash,role,professional_id,active,created_at FROM users;
      CREATE TABLE sessions_keep AS SELECT * FROM sessions;
      DELETE FROM sessions;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      INSERT INTO sessions SELECT * FROM sessions_keep;
      DROP TABLE sessions_keep;
      COMMIT;
      PRAGMA foreign_keys=ON;`);
  }
  await client.execute({ sql: "INSERT INTO _meta(key,value) VALUES('schema',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", args: [SCHEMA_VERSION] });
});

const clean = (a) => a.map((x) => (x === undefined ? null : typeof x === 'boolean' ? (x ? 1 : 0) : x));
const txStore = new AsyncLocalStorage();
/** Dentro de uma transação usa a vaga dela; fora, reserva uma vaga só durante a consulta. */
async function exec(sql, p) {
  const t = txStore.getStore();
  if (t) return t.execute({ sql, args: clean(p) });
  return withSlot((c) => c.execute({ sql, args: clean(p) }));
}
const toObjects = (rs) => rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]])));

export const all = async (sql, ...p) => toObjects(await exec(sql, p));
export const get = async (sql, ...p) => toObjects(await exec(sql, p))[0];
export const run = async (sql, ...p) => {
  const r = await exec(sql, p);
  return { changes: Number(r.rowsAffected), id: Number(r.lastInsertRowid ?? 0) };
};
/**
 * Transação: todas as chamadas a all/get/run dentro de fn usam a mesma transação.
 * Ocupa UMA vaga do limite do começo ao fim, e é desfeita se passar de DB_TX_TIMEOUT_MS
 * (assim uma operação travada nunca segura o banco para os outros salões).
 */
export async function tx(fn) {
  if (txStore.getStore()) return fn();
  return withSlot(async (client) => {
    const t = await client.transaction('write');
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new HttpError(503, 'A operação demorou demais e foi cancelada. Tente de novo.')), DB_LIMITS.txMs);
    });
    try {
      const r = await Promise.race([txStore.run(t, fn), timeout]);
      await t.commit();
      return r;
    } catch (e) {
      await t.rollback().catch(() => {});
      throw e;
    } finally {
      clearTimeout(timer);
      t.close();
    }
  });
}
