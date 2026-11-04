// Notificações do app (Web Push). Chaves VAPID vêm do ambiente; em desenvolvimento são criadas e guardadas em DATA_DIR.
import webpush from 'web-push';
import fs from 'node:fs';
import path from 'node:path';
import { all, run } from './db.js';

let keys = null;
function vapid() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  else if (!process.env.VERCEL) {
    const file = path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'vapid.json');
    try {
      keys = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      keys = webpush.generateVAPIDKeys();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(keys));
    }
  }
  if (keys) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:contato@vyllorri.app', keys.publicKey, keys.privateKey);
  return keys;
}
export const pushPublicKey = () => vapid()?.publicKey || null;

/**
 * Envia para a equipe do salão: proprietária, gerente e recepção, e, se informado, a profissional do atendimento.
 * Falhas nunca interrompem a operação que gerou o aviso.
 */
export async function notifyStaff(salonId, { title, body, url = '/' }, { proId = null, userId = null } = {}) {
  try {
    if (!vapid()) return;
    const subs = await all(`SELECT ps.* FROM push_subscriptions ps JOIN users u ON u.id=ps.user_id
                             WHERE ps.salon_id=? AND u.active=1 AND (
                               ${userId ? 'u.id=?' : "u.role IN ('owner','manager','reception') OR (u.role='pro' AND u.professional_id=?)"})`, salonId, userId ?? proId ?? -1);
    const payload = JSON.stringify({ title, body, url });
    await Promise.all(subs.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, timeout: 5000 }).catch(async (e) => {
        // aparelho desinstalou ou revogou a permissão
        if (e.statusCode === 404 || e.statusCode === 410) await run('DELETE FROM push_subscriptions WHERE id=?', s.id);
      })));
  } catch (e) {
    console.error('push', e.message);
  }
}
