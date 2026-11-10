// Segurança da conta: 2 etapas, aparelhos conectados, registro de atividades e backup.
import { route, HttpError, OWNER, ALL } from '../http.js';
import { all, get, run } from '../db.js';
import { verifyPassword, sessionToken, sha } from '../auth.js';
import { qrSvg } from '../pix.js';
import { newTotpSecret, otpauthUrl, checkTotp, newRecoveryCodes, verifySecondFactor, audit, AUDIT_LABEL, fullBackup } from '../security.js';
import { isPlatformAdmin } from './feedback.js';

route('GET', '/api/me/security', ALL, async ({ user }) => {
  const u = await get('SELECT totp_enabled, recovery_codes FROM users WHERE id=?', user.id);
  return { totp_enabled: !!u.totp_enabled, recovery_left: JSON.parse(u.recovery_codes || '[]').length };
});

// 1) gera o segredo e o QR Code para ler no aplicativo autenticador
route('POST', '/api/me/2fa/setup', ALL, async ({ user }) => {
  const u = await get('SELECT totp_enabled FROM users WHERE id=?', user.id);
  if (u.totp_enabled) throw new HttpError(400, 'A verificação em 2 etapas já está ativa.');
  const secret = newTotpSecret();
  await run('UPDATE users SET totp_secret=?, totp_last=0 WHERE id=?', secret, user.id);
  const url = otpauthUrl(secret, user.email);
  return { secret, otpauth: url, qr_svg: await qrSvg(url) };
});
// 2) confirma com o primeiro código e devolve os códigos de recuperação (mostrados uma única vez)
route('POST', '/api/me/2fa/enable', ALL, async ({ user, body, req }) => {
  const u = await get('SELECT totp_secret, totp_enabled FROM users WHERE id=?', user.id);
  if (u.totp_enabled) throw new HttpError(400, 'A verificação em 2 etapas já está ativa.');
  if (!u.totp_secret) throw new HttpError(400, 'Comece pelo passo 1: leia o QR Code.');
  const step = checkTotp(u.totp_secret, body.code);
  if (!step) throw new HttpError(400, 'Código inválido. Confira se o horário do celular está automático e use o código atual.');
  const rc = newRecoveryCodes();
  await run('UPDATE users SET totp_enabled=1, totp_last=?, recovery_codes=? WHERE id=?', step, JSON.stringify(rc.hashed), user.id);
  await audit(req, user, '2fa_on');
  return { recovery_codes: rc.plain };
});
route('POST', '/api/me/2fa/disable', ALL, async ({ user, body, req }) => {
  const u = await get('SELECT * FROM users WHERE id=?', user.id);
  if (!u.totp_enabled) return { ok: true };
  if (!verifyPassword(String(body.password || ''), u.pass_hash)) throw new HttpError(400, 'Senha incorreta.');
  await verifySecondFactor(u, body.code);
  await run('UPDATE users SET totp_enabled=0, totp_secret=NULL, totp_last=0, recovery_codes=NULL WHERE id=?', user.id);
  await audit(req, user, '2fa_off');
  return { ok: true };
});

// aparelhos conectados
route('GET', '/api/me/sessions', ALL, async ({ user, req }) => {
  const current = sha(sessionToken(req) || '');
  return (await all('SELECT token_hash, created_at, ua FROM sessions WHERE user_id=? AND expires_at>? ORDER BY created_at DESC', user.id, Date.now()))
    .map((s) => ({ created_at: s.created_at, device: s.ua || 'Aparelho', current: s.token_hash === current }));
});
route('POST', '/api/me/sessions/logout-others', ALL, async ({ user, req }) => {
  const r = await run('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', user.id, sha(sessionToken(req) || ''));
  await audit(req, user, 'logout_all', `${r.changes} aparelho(s)`);
  return { removed: r.changes };
});

// registro de atividades do salão (só a proprietária)
route('GET', '/api/audit', OWNER, async ({ sid }) =>
  (await all(`SELECT a.action, a.detail, a.ip, a.created_at, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
              WHERE a.salon_id=? ORDER BY a.id DESC LIMIT 200`, sid)).map((a) => ({ ...a, label: AUDIT_LABEL[a.action] || a.action })));

// backup completo: só a equipe Vyllorri e só com a verificação em 2 etapas ativa
route('GET', '/api/admin/backup', ALL, async ({ user, req }) => {
  if (!isPlatformAdmin(user.email)) throw new HttpError(403, 'Área restrita à equipe Vyllorri.');
  const u = await get('SELECT totp_enabled FROM users WHERE id=?', user.id);
  if (!u.totp_enabled) throw new HttpError(403, 'Para baixar o backup, ative antes a verificação em 2 etapas.');
  const data = await fullBackup();
  await audit(req, user, 'backup');
  return { __raw: { type: 'application/json; charset=utf-8', body: Buffer.from(JSON.stringify(data)), cache: 'no-store', filename: `vyllorri-backup-${data.created_at.slice(0, 10)}.json` } };
});
