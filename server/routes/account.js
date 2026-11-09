import { route, HttpError, OWNER, ALL } from '../http.js';
import { V } from '../validate.js';
import { all, get, run } from '../db.js';
import {
  createSalon, createSession, destroySession, sessionToken, cookieHeader, verifyPassword, hashPassword,
  throttleLogin, clearThrottle, publicUser, loadUser, slugify, ensureSoloPro,
} from '../auth.js';
import { nowStr } from '../util.js';
import { imageRef, imageUrl } from './images.js';

const strongPw = (pw) => {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');
  return pw;
};

route('POST', '/api/auth/signup', null, async ({ body, req }) => {
  if (process.env.ALLOW_SIGNUP === '0') throw new HttpError(403, 'Cadastro de novos salões desativado.');
  const { salonId, userId } = await createSalon({
    salonName: V.str(body.salon_name, 'Nome do salão', { req: true, max: 80 }),
    name: V.str(body.name, 'Seu nome', { req: true, max: 80 }),
    email: V.email(body.email, 'E-mail'),
    password: strongPw(body.password),
    demo: !!body.demo,
    teamMode: V.oneOf(body.team_mode, ['solo', 'team'], 'Modo de trabalho') || 'team',
  });
  const token = await createSession(userId);
  return { __cookie: cookieHeader(token, req), data: { ok: true, salon_id: salonId } };
});

route('POST', '/api/auth/login', null, async ({ body, req }) => {
  const email = V.email(body.email, 'E-mail');
  const key = `${req.socket.remoteAddress}|${email}`;
  throttleLogin(key);
  const u = await get('SELECT * FROM users WHERE email=? AND active=1', email);
  if (!u || typeof body.password !== 'string' || !verifyPassword(body.password, u.pass_hash))
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  clearThrottle(key);
  return { __cookie: cookieHeader(await createSession(u.id), req), data: { ok: true } };
});

route('POST', '/api/auth/logout', null, async ({ req }) => {
  await destroySession(sessionToken(req));
  return { __cookie: cookieHeader('', req, 0), data: { ok: true } };
});

route('GET', '/api/me', null, async ({ req }) => {
  const u = await loadUser(req);
  return { user: u ? publicUser(u) : null };
});

route('POST', '/api/me/password', ALL, async ({ body, user }) => {
  const u = await get('SELECT pass_hash FROM users WHERE id=?', user.id);
  if (!verifyPassword(String(body.current || ''), u.pass_hash)) throw new HttpError(400, 'Senha atual incorreta.');
  await run('UPDATE users SET pass_hash=? WHERE id=?', hashPassword(strongPw(body.password)), user.id);
  return { ok: true };
});

// ---- Configurações do salão ----
/** Cor da página pública: só #rrggbb; qualquer outra coisa volta ao rosa padrão. */
const pageColor = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '').trim()) ? String(c).trim().toLowerCase() : null);
export async function salonProfile(sid) {
  const s = await get(`SELECT id,name,slug,booking_enabled,team_mode,sells_products,headline,page_color,description,address,phone,instagram,opening_hours,logo,cover_photo,gallery,cancel_hours
                         FROM salons WHERE id=?`, sid);
  let gallery = [];
  try {
    gallery = JSON.parse(s.gallery || '[]');
  } catch {}
  return { ...s, logo_url: imageUrl(s.logo), cover_url: imageUrl(s.cover_photo), gallery, gallery_urls: gallery.map(imageUrl) };
}
route('GET', '/api/salon', OWNER, async ({ sid }) => salonProfile(sid));
route('PUT', '/api/salon', OWNER, async ({ body, sid }) => {
  await run('UPDATE salons SET name=? WHERE id=?', V.str(body.name, 'Nome do salão', { req: true, max: 80 }), sid);
  return { ok: true };
});
/** Perfil público: apresentação, contato, fotos e regra de cancelamento. */
route('PUT', '/api/salon/profile', OWNER, async ({ body, sid }) => {
  const gallery = [];
  for (const g of (Array.isArray(body.gallery) ? body.gallery : []).slice(0, 8)) gallery.push(await imageRef(g, sid));
  await run(`UPDATE salons SET name=?, headline=?, page_color=?, description=?, address=?, phone=?, instagram=?, opening_hours=?, logo=?, cover_photo=?, gallery=?, cancel_hours=? WHERE id=?`,
    V.str(body.name, 'Nome do salão', { req: true, max: 80 }), V.str(body.headline, 'Frase de destaque', { max: 90 }), pageColor(body.page_color), V.str(body.description, 'Apresentação', { max: 600 }),
    V.str(body.address, 'Endereço', { max: 200 }), V.phone(body.phone, 'WhatsApp do salão'),
    V.str(body.instagram, 'Instagram', { max: 60 })?.replace(/^@/, '') || null, V.str(body.opening_hours, 'Horário de funcionamento', { max: 200 }),
    await imageRef(body.logo, sid), await imageRef(body.cover_photo, sid), JSON.stringify(gallery.filter(Boolean)),
    V.int(body.cancel_hours ?? 12, 'Antecedência para cancelar', { min: 0, max: 168 }), sid);
  return salonProfile(sid);
});
/** Vende produtos? Se não, o painel esconde estoque e venda de produtos (nada é apagado). */
route('PUT', '/api/salon/products', OWNER, async ({ body, sid }) => {
  const on = body.on === true || body.on === 1 || body.on === '1';
  await run('UPDATE salons SET sells_products=? WHERE id=?', on ? 1 : 0, sid);
  return { sells_products: on };
});
/** Modo de trabalho: sozinha (sem telas de equipe) ou com equipe. Nada é apagado ao trocar. */
route('PUT', '/api/salon/mode', OWNER, async ({ body, sid, user }) => {
  const mode = V.oneOf(body.mode, ['solo', 'team'], 'Modo de trabalho', { req: true });
  if (mode === 'solo') await ensureSoloPro(sid, user.id, user.name);
  await run('UPDATE salons SET team_mode=? WHERE id=?', mode, sid);
  return { team_mode: mode };
});

/** Agendamento online: liga/desliga e define o endereço público. */
route('PUT', '/api/salon/booking', OWNER, async ({ body, sid }) => {
  const slug = slugify(V.str(body.slug, 'Endereço', { req: true, max: 40 }));
  if (slug.length < 3) throw new HttpError(400, 'Endereço muito curto (mínimo 3 letras).');
  if (await get('SELECT 1 x FROM salons WHERE slug=? AND id<>?', slug, sid)) throw new HttpError(409, 'Este endereço já está em uso por outro salão.');
  await run('UPDATE salons SET slug=?, booking_enabled=? WHERE id=?', slug, V.bool(body.enabled), sid);
  return { slug, booking_enabled: V.bool(body.enabled) };
});

route('GET', '/api/payment-methods', ALL, async ({ sid }) =>
  await all('SELECT id,name,active FROM payment_methods WHERE salon_id=? ORDER BY id', sid));
route('POST', '/api/payment-methods', OWNER, async ({ body, sid }) => {
  const name = V.str(body.name, 'Nome', { req: true, max: 30 });
  if (await get('SELECT 1 x FROM payment_methods WHERE salon_id=? AND name=?', sid, name)) throw new HttpError(409, 'Essa forma de pagamento já existe.');
  return { id: (await run('INSERT INTO payment_methods(salon_id,name) VALUES(?,?)', sid, name)).id };
});
route('PUT', '/api/payment-methods/:id', OWNER, async ({ params, body, sid }) => {
  const m = await get('SELECT * FROM payment_methods WHERE id=? AND salon_id=?', params.id, sid);
  if (!m) throw new HttpError(404, 'Forma de pagamento não encontrada.');
  await run('UPDATE payment_methods SET active=? WHERE id=?', V.bool(body.active), m.id); // nunca apaga: vendas antigas guardam o nome
  return { ok: true };
});

// ---- Usuárias e permissões ----
route('GET', '/api/users', OWNER, async ({ sid }) =>
  await all(`SELECT u.id,u.name,u.email,u.role,u.professional_id,u.active,p.name AS professional_name
         FROM users u LEFT JOIN professionals p ON p.id=u.professional_id WHERE u.salon_id=? ORDER BY u.id`, sid));

async function userFields(body, sid) {
  const role = V.oneOf(body.role, ['owner', 'manager', 'reception', 'pro'], 'Perfil', { req: true });
  let professional_id = null;
  if (role === 'pro') {
    professional_id = V.int(body.professional_id, 'Profissional', { req: true });
    if (!await get('SELECT 1 x FROM professionals WHERE id=? AND salon_id=?', professional_id, sid)) throw new HttpError(400, 'Profissional inválida.');
  }
  return { role, professional_id, name: V.str(body.name, 'Nome', { req: true, max: 80 }) };
}
route('POST', '/api/users', OWNER, async ({ body, sid, user }) => {
  if (user.team_mode === 'solo')
    throw new HttpError(403, 'No plano Sozinha só você acessa o painel. Para dar acesso à recepção ou a outras profissionais, mude para "Tenho equipe" em Configurações → Salão.');
  const f = await userFields(body, sid);
  const email = V.email(body.email, 'E-mail');
  if (await get('SELECT 1 x FROM users WHERE email=?', email)) throw new HttpError(409, 'Este e-mail já está em uso.');
  return {
    id: (await run('INSERT INTO users(salon_id,name,email,pass_hash,role,professional_id,created_at) VALUES(?,?,?,?,?,?,?)',
      sid, f.name, email, hashPassword(strongPw(body.password)), f.role, f.professional_id, nowStr())).id,
  };
});
route('PUT', '/api/users/:id', OWNER, async ({ params, body, sid, user }) => {
  const u = await get('SELECT * FROM users WHERE id=? AND salon_id=?', params.id, sid);
  if (!u) throw new HttpError(404, 'Usuária não encontrada.');
  const f = await userFields(body, sid);
  const active = V.bool(body.active ?? 1);
  if (u.id === user.id && (f.role !== 'owner' || !active)) throw new HttpError(400, 'Você não pode remover seu próprio acesso de proprietária.');
  await run('UPDATE users SET name=?, role=?, professional_id=?, active=? WHERE id=?', f.name, f.role, f.professional_id, active, u.id);
  if (body.password) await run('UPDATE users SET pass_hash=? WHERE id=?', hashPassword(strongPw(body.password)), u.id);
  if (!active) await run('DELETE FROM sessions WHERE user_id=?', u.id);
  return { ok: true };
});
