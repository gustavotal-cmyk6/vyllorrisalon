import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(dir, { recursive: true });
export const db = new DatabaseSync(process.env.DB_FILE || path.join(dir, 'vyllorri.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');

// Todos os valores monetários em centavos (INTEGER). Toda tabela de negócio tem salon_id (isolamento por salão).
db.exec(`
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
  role TEXT NOT NULL CHECK(role IN ('owner','reception','pro')),
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
  kind TEXT NOT NULL CHECK(kind IN ('service','product')),
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
`);

const stmts = new Map();
const prep = (sql) => {
  let s = stmts.get(sql);
  if (!s) stmts.set(sql, (s = db.prepare(sql)));
  return s;
};
const clean = (a) => a.map((x) => (x === undefined ? null : typeof x === 'boolean' ? (x ? 1 : 0) : x));

export const all = (sql, ...p) => prep(sql).all(...clean(p));
export const get = (sql, ...p) => prep(sql).get(...clean(p));
export const run = (sql, ...p) => {
  const r = prep(sql).run(...clean(p));
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
};
export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
