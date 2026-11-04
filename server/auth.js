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

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await run('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)', sha(token), userId, Date.now() + SESSION_DAYS * 864e5);
  return token;
}
export const destroySession = async (token) => token && run('DELETE FROM sessions WHERE token_hash=?', sha(token));

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export const sessionToken = (req) => parseCookies(req).vb_session;

export async function loadUser(req) {
  const token = sessionToken(req);
  if (!token) return null;
  const u = await get(
    `SELECT u.id, u.salon_id, u.name, u.email, u.role, u.professional_id, s.name AS salon_name, s.is_demo, s.logo, s.team_mode, se.expires_at
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

/** Endereço público do salão (ex.: /agendar/studio-bela). */
export const slugify = (t) =>
  String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'salao';
export async function uniqueSlug(name, exceptId = 0) {
  const base = slugify(name);
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await get('SELECT 1 x FROM salons WHERE slug=? AND id<>?', slug, exceptId))) return slug;
  }
}

export async function createSalon({ salonName, name, email, password, demo = false, teamMode = 'team' }) {
  if (await get('SELECT 1 x FROM users WHERE email=?', email)) throw new HttpError(409, 'Este e-mail já está cadastrado.');
  return await tx(async () => {
    const salonId = (await run('INSERT INTO salons(name,is_demo,created_at,slug,team_mode) VALUES(?,?,?,?,?)', salonName, demo ? 1 : 0, nowStr(), await uniqueSlug(salonName), teamMode)).id;
    const userId = (await run('INSERT INTO users(salon_id,name,email,pass_hash,role,created_at) VALUES(?,?,?,?,?,?)', salonId, name, email, hashPassword(password), 'owner', nowStr())).id;
    for (const m of DEFAULT_METHODS) await run('INSERT INTO payment_methods(salon_id,name) VALUES(?,?)', salonId, m);
    for (const c of DEFAULT_CATEGORIES) await run('INSERT INTO categories(salon_id,name) VALUES(?,?)', salonId, c);
    if (teamMode === 'solo') await ensureSoloPro(salonId, userId, name);
    return { salonId, userId };
  });
}

/**
 * Modo "trabalho sozinha": a dona é a única profissional da agenda.
 * Garante que exista essa profissional e que o acesso da dona esteja ligado a ela.
 */
export async function ensureSoloPro(salonId, userId, name) {
  const actives = await all('SELECT id FROM professionals WHERE salon_id=? AND active=1', salonId);
  if (actives.length > 1) throw new HttpError(409, 'Há mais de uma profissional ativa. Desative as outras na Equipe antes de mudar para "Trabalho sozinha".');
  const user = await get('SELECT professional_id FROM users WHERE id=?', userId);
  if (user?.professional_id && actives.some((a) => a.id === user.professional_id)) return user.professional_id;
  const proId = actives[0]?.id ?? (await run(`INSERT INTO professionals(salon_id,name,specialty,work_days,start_time,end_time,commission_type,commission_value) VALUES(?,?,?,?,?,?,?,?)`,
    salonId, name, 'Proprietária', '1,2,3,4,5,6', '09:00', '19:00', 'pct', 0)).id;
  await run('UPDATE users SET professional_id=? WHERE id=?', proId, userId);
  // serviços que ainda não têm ninguém habilitado passam a ser feitos por ela
  await run(`INSERT OR IGNORE INTO service_pros(service_id, professional_id)
             SELECT s.id, ? FROM services s WHERE s.salon_id=? AND NOT EXISTS (SELECT 1 FROM service_pros sp JOIN professionals p ON p.id=sp.professional_id WHERE sp.service_id=s.id AND p.active=1)`, proId, salonId);
  return proId;
}

export const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, professional_id: u.professional_id,
  salon_id: u.salon_id, salon_name: u.salon_name, is_demo: !!u.is_demo, team_mode: u.team_mode || 'team', logo_url: u.logo ? `/api/images/${u.logo}` : null,
});
export { all };
