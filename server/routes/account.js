import { route, HttpError, OWNER, ALL } from '../http.js';
import { V } from '../validate.js';
import { all, get, run } from '../db.js';
import {
  createSalon, createSession, destroySession, sessionToken, cookieHeader, verifyPassword, hashPassword,
  throttleLogin, clearThrottle, publicUser, loadUser,
} from '../auth.js';
import { nowStr } from '../util.js';

const strongPw = (pw) => {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');
  return pw;
};

route('POST', '/api/auth/signup', null, ({ body, req }) => {
  if (process.env.ALLOW_SIGNUP === '0') throw new HttpError(403, 'Cadastro de novos salões desativado.');
  const { salonId, userId } = createSalon({
    salonName: V.str(body.salon_name, 'Nome do salão', { req: true, max: 80 }),
    name: V.str(body.name, 'Seu nome', { req: true, max: 80 }),
    email: V.email(body.email, 'E-mail'),
    password: strongPw(body.password),
    demo: !!body.demo,
  });
  const token = createSession(userId);
  return { __cookie: cookieHeader(token, req), data: { ok: true, salon_id: salonId } };
});

route('POST', '/api/auth/login', null, ({ body, req }) => {
  const email = V.email(body.email, 'E-mail');
  const key = `${req.socket.remoteAddress}|${email}`;
  throttleLogin(key);
  const u = get('SELECT * FROM users WHERE email=? AND active=1', email);
  if (!u || typeof body.password !== 'string' || !verifyPassword(body.password, u.pass_hash))
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  clearThrottle(key);
  return { __cookie: cookieHeader(createSession(u.id), req), data: { ok: true } };
});

route('POST', '/api/auth/logout', null, ({ req }) => {
  destroySession(sessionToken(req));
  return { __cookie: cookieHeader('', req, 0), data: { ok: true } };
});

route('GET', '/api/me', null, ({ req }) => {
  const u = loadUser(req);
  return { user: u ? publicUser(u) : null };
});

route('POST', '/api/me/password', ALL, ({ body, user }) => {
  const u = get('SELECT pass_hash FROM users WHERE id=?', user.id);
  if (!verifyPassword(String(body.current || ''), u.pass_hash)) throw new HttpError(400, 'Senha atual incorreta.');
  run('UPDATE users SET pass_hash=? WHERE id=?', hashPassword(strongPw(body.password)), user.id);
  return { ok: true };
});

// ---- Configurações do salão ----
route('PUT', '/api/salon', OWNER, ({ body, sid }) => {
  run('UPDATE salons SET name=? WHERE id=?', V.str(body.name, 'Nome do salão', { req: true, max: 80 }), sid);
  return { ok: true };
});

route('GET', '/api/payment-methods', ALL, ({ sid }) =>
  all('SELECT id,name,active FROM payment_methods WHERE salon_id=? ORDER BY id', sid));
route('POST', '/api/payment-methods', OWNER, ({ body, sid }) => {
  const name = V.str(body.name, 'Nome', { req: true, max: 30 });
  if (get('SELECT 1 x FROM payment_methods WHERE salon_id=? AND name=?', sid, name)) throw new HttpError(409, 'Essa forma de pagamento já existe.');
  return { id: run('INSERT INTO payment_methods(salon_id,name) VALUES(?,?)', sid, name).id };
});
route('PUT', '/api/payment-methods/:id', OWNER, ({ params, body, sid }) => {
  const m = get('SELECT * FROM payment_methods WHERE id=? AND salon_id=?', params.id, sid);
  if (!m) throw new HttpError(404, 'Forma de pagamento não encontrada.');
  run('UPDATE payment_methods SET active=? WHERE id=?', V.bool(body.active), m.id); // nunca apaga: vendas antigas guardam o nome
  return { ok: true };
});

// ---- Usuárias e permissões ----
route('GET', '/api/users', OWNER, ({ sid }) =>
  all(`SELECT u.id,u.name,u.email,u.role,u.professional_id,u.active,p.name AS professional_name
         FROM users u LEFT JOIN professionals p ON p.id=u.professional_id WHERE u.salon_id=? ORDER BY u.id`, sid));

function userFields(body, sid) {
  const role = V.oneOf(body.role, ['owner', 'reception', 'pro'], 'Perfil', { req: true });
  let professional_id = null;
  if (role === 'pro') {
    professional_id = V.int(body.professional_id, 'Profissional', { req: true });
    if (!get('SELECT 1 x FROM professionals WHERE id=? AND salon_id=?', professional_id, sid)) throw new HttpError(400, 'Profissional inválida.');
  }
  return { role, professional_id, name: V.str(body.name, 'Nome', { req: true, max: 80 }) };
}
route('POST', '/api/users', OWNER, ({ body, sid }) => {
  const f = userFields(body, sid);
  const email = V.email(body.email, 'E-mail');
  if (get('SELECT 1 x FROM users WHERE email=?', email)) throw new HttpError(409, 'Este e-mail já está em uso.');
  return {
    id: run('INSERT INTO users(salon_id,name,email,pass_hash,role,professional_id,created_at) VALUES(?,?,?,?,?,?,?)',
      sid, f.name, email, hashPassword(strongPw(body.password)), f.role, f.professional_id, nowStr()).id,
  };
});
route('PUT', '/api/users/:id', OWNER, ({ params, body, sid, user }) => {
  const u = get('SELECT * FROM users WHERE id=? AND salon_id=?', params.id, sid);
  if (!u) throw new HttpError(404, 'Usuária não encontrada.');
  const f = userFields(body, sid);
  const active = V.bool(body.active ?? 1);
  if (u.id === user.id && (f.role !== 'owner' || !active)) throw new HttpError(400, 'Você não pode remover seu próprio acesso de proprietária.');
  run('UPDATE users SET name=?, role=?, professional_id=?, active=? WHERE id=?', f.name, f.role, f.professional_id, active, u.id);
  if (body.password) run('UPDATE users SET pass_hash=? WHERE id=?', hashPassword(strongPw(body.password)), u.id);
  if (!active) run('DELETE FROM sessions WHERE user_id=?', u.id);
  return { ok: true };
});
