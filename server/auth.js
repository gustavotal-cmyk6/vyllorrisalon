import crypto from 'node:crypto';
import { all, get, run, tx } from './db.js';
import { HttpError } from './http.js';
import { nowStr } from './util.js';

const SESSION_DAYS = 14;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${h.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [salt, h] = stored.split(':');
  const calc = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  return crypto.timingSafeEqual(calc, Buffer.from(h, 'hex'));
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)', sha(token), userId, Date.now() + SESSION_DAYS * 864e5);
  return token;
}
export const destroySession = (token) => token && run('DELETE FROM sessions WHERE token_hash=?', sha(token));

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export const sessionToken = (req) => parseCookies(req).vb_session;

export function loadUser(req) {
  const token = sessionToken(req);
  if (!token) return null;
  const u = get(
    `SELECT u.id, u.salon_id, u.name, u.email, u.role, u.professional_id, s.name AS salon_name, s.is_demo, se.expires_at
       FROM sessions se JOIN users u ON u.id=se.user_id JOIN salons s ON s.id=u.salon_id
      WHERE se.token_hash=? AND u.active=1`,
    sha(token)
  );
  if (!u || u.expires_at < Date.now()) return null;
  return u;
}

export function cookieHeader(token, req, maxAgeSec = SESSION_DAYS * 86400) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.SECURE_COOKIES === '1' ? '; Secure' : '';
  return `vb_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure}`;
}

// Limitador simples de tentativas de login (em memória)
const attempts = new Map();
export function throttleLogin(key) {
  const now = Date.now();
  const rec = (attempts.get(key) || []).filter((t) => now - t < 15 * 60_000);
  if (rec.length >= 8) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  rec.push(now);
  attempts.set(key, rec);
}
export const clearThrottle = (key) => attempts.delete(key);

export const DEFAULT_METHODS = ['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito'];
export const DEFAULT_CATEGORIES = ['Cabelo', 'Unhas', 'Sobrancelhas', 'Maquiagem', 'Estética'];

export function createSalon({ salonName, name, email, password, demo = false }) {
  if (get('SELECT 1 x FROM users WHERE email=?', email)) throw new HttpError(409, 'Este e-mail já está cadastrado.');
  return tx(() => {
    const salonId = run('INSERT INTO salons(name,is_demo,created_at) VALUES(?,?,?)', salonName, demo ? 1 : 0, nowStr()).id;
    const userId = run('INSERT INTO users(salon_id,name,email,pass_hash,role,created_at) VALUES(?,?,?,?,?,?)', salonId, name, email, hashPassword(password), 'owner', nowStr()).id;
    for (const m of DEFAULT_METHODS) run('INSERT INTO payment_methods(salon_id,name) VALUES(?,?)', salonId, m);
    for (const c of DEFAULT_CATEGORIES) run('INSERT INTO categories(salon_id,name) VALUES(?,?)', salonId, c);
    return { salonId, userId };
  });
}

export const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, professional_id: u.professional_id,
  salon_id: u.salon_id, salon_name: u.salon_name, is_demo: !!u.is_demo,
});
export { all };
