// Ajuda e sugestões: quem usa o app manda feedback; a equipe Vyllorri lê e responde.
import crypto from 'node:crypto';
import { route, HttpError, ALL } from '../http.js';
import { V } from '../validate.js';
import { all, get, run } from '../db.js';
import { nowStr } from '../util.js';
import { throttleAuth } from '../auth.js';
import { parseImage, imageUrl } from './images.js';

const KINDS = ['suggestion', 'problem', 'question', 'praise'];
/** Equipe Vyllorri: e-mails em ADMIN_EMAILS (separados por vírgula) leem e respondem todos os envios. */
export const isPlatformAdmin = (email) =>
  String(process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).includes(String(email || '').toLowerCase());
const admin = (user) => {
  if (!isPlatformAdmin(user.email)) throw new HttpError(403, 'Área restrita à equipe Vyllorri.');
};
const view = (f) => ({ ...f, image_url: f.image ? imageUrl(f.image) : null });

route('POST', '/api/feedback', ALL, async ({ body, user, sid }) => {
  await throttleAuth([[`feedback:${user.id}`, 15]], 3600_000);
  const kind = V.oneOf(body.kind, KINDS, 'Tipo', { req: true });
  const message = V.str(body.message, 'Mensagem', { req: true, max: 2000 });
  if (message.length < 5) throw new HttpError(400, 'Conte um pouco mais na mensagem.');
  const rating = body.rating ? V.int(body.rating, 'Nota', { min: 1, max: 5 }) : null;
  let image = null;
  if (body.image) {
    const img = parseImage(body.image);
    image = crypto.randomBytes(16).toString('hex');
    await run('INSERT INTO images(id,salon_id,mime,data,created_at,private) VALUES(?,?,?,?,?,0)', image, sid, img.mime, img.b64, nowStr());
  }
  const page = V.str(body.page, 'Tela', { max: 80 });
  const id = (await run(`INSERT INTO feedback(salon_id,user_id,kind,rating,message,page,image,status,created_at) VALUES(?,?,?,?,?,?,?,'new',?)`,
    sid, user.id, kind, rating, message, page, image, nowStr())).id;
  return { id, ok: true };
});

route('GET', '/api/feedback/mine', ALL, async ({ user }) =>
  (await all('SELECT id, kind, rating, message, page, image, status, reply, replied_at, created_at FROM feedback WHERE user_id=? ORDER BY id DESC LIMIT 50', user.id)).map(view));

// ---- equipe Vyllorri ----
route('GET', '/api/admin/feedback', ALL, async ({ user, query }) => {
  admin(user);
  const status = ['new', 'answered', 'done'].includes(query.status) ? query.status : null;
  const rows = await all(`SELECT f.*, s.name AS salon_name, u.name AS user_name, u.email AS user_email
      FROM feedback f JOIN salons s ON s.id=f.salon_id JOIN users u ON u.id=f.user_id
      ${status ? 'WHERE f.status=?' : ''} ORDER BY f.id DESC LIMIT 200`, ...(status ? [status] : []));
  const counts = Object.fromEntries((await all('SELECT status, COUNT(*) n FROM feedback GROUP BY status')).map((r) => [r.status, r.n]));
  return { items: rows.map(view), counts };
});
route('PUT', '/api/admin/feedback/:id', ALL, async ({ user, params, body }) => {
  admin(user);
  const f = await get('SELECT id FROM feedback WHERE id=?', V.int(params.id, 'Envio'));
  if (!f) throw new HttpError(404, 'Envio não encontrado.');
  const reply = V.str(body.reply, 'Resposta', { max: 2000 });
  const status = V.oneOf(body.status, ['new', 'answered', 'done'], 'Situação') || (reply ? 'answered' : 'done');
  await run('UPDATE feedback SET reply=COALESCE(?, reply), replied_at=CASE WHEN ? IS NULL THEN replied_at ELSE ? END, status=? WHERE id=?', reply, reply, nowStr(), status, f.id);
  return { ok: true };
});
