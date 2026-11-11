// WhatsApp do plano Pro pela Evolution API (v2): cada salão conecta o próprio número por
// QR code ou por código de 8 letras, numa instância "vy-<id do salão>". Mesmo servidor do
// Vyllorri Barber. Para trocar de provedor, reescreva só este arquivo.
// Variáveis: EVOLUTION_URL, EVOLUTION_API_KEY, WHATSAPP_WEBHOOK_TOKEN, APP_URL.
import crypto from 'node:crypto';

const base = () => String(process.env.EVOLUTION_URL || '').replace(/\/$/, '');
export const whatsappConfigured = () => !!(base() && process.env.EVOLUTION_API_KEY && process.env.WHATSAPP_WEBHOOK_TOKEN);
export const appUrl = () => String(process.env.APP_URL || 'https://meusalao.vyllorri.com.br').replace(/\/$/, '');
export const instanceFor = (salonId) => `vy-${Number(salonId)}`;

class EvoError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

async function evo(p, init = {}) {
  if (!whatsappConfigured()) throw new EvoError('whatsapp_not_configured', 503);
  const r = await fetch(base() + p, {
    ...init, signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', apikey: process.env.EVOLUTION_API_KEY, ...(init.headers || {}) },
  });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { text }; }
  if (!r.ok) throw new EvoError(`evolution_${r.status}: ${JSON.stringify(body).slice(0, 200)}`, r.status);
  return body;
}
const enc = encodeURIComponent;
const webhookUrl = () => `${appUrl()}/api/wa/webhook?token=${enc(process.env.WHATSAPP_WEBHOOK_TOKEN || '')}`;

/** Cria a instância (se não existir), aponta o webhook e devolve o QR. Com o número, devolve também o código de 8 letras. */
export async function connect(instance, number) {
  try {
    await evo('/instance/create', { method: 'POST', body: JSON.stringify({ instanceName: instance, integration: 'WHATSAPP-BAILEYS', qrcode: true }) });
  } catch (e) {
    if (!(e instanceof EvoError) || ![400, 403, 409].includes(e.status)) throw e; // já existe
  }
  await evo(`/webhook/set/${enc(instance)}`, {
    method: 'POST',
    body: JSON.stringify({ webhook: { enabled: true, url: webhookUrl(), webhookByEvents: false, webhookBase64: false, events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'] } }),
  });
  const qs = number && /^\d{12,13}$/.test(number) ? `?number=${number}` : '';
  const qr = await evo(`/instance/connect/${enc(instance)}${qs}`);
  const img = qr.base64 ? (qr.base64.startsWith('data:') ? qr.base64 : `data:image/png;base64,${qr.base64}`) : null;
  return { qr: img, code: qr.pairingCode || null };
}

export async function connectionState(instance) {
  try {
    const r = await evo(`/instance/connectionState/${enc(instance)}`);
    const s = r.instance?.state ?? r.state;
    return s === 'open' || s === 'connecting' ? s : 'close';
  } catch (e) {
    if (e instanceof EvoError && e.status === 404) return 'close';
    throw e;
  }
}

export async function connectedNumber(instance) {
  try {
    const list = await evo(`/instance/fetchInstances?instanceName=${enc(instance)}`);
    const it = Array.isArray(list) ? list[0] : null;
    const d = String(it?.ownerJid ?? it?.owner ?? it?.instance?.owner ?? '').split('@')[0].replace(/\D/g, '');
    return d.length >= 10 ? d : null;
  } catch { return null; }
}

export async function disconnect(instance) {
  try { await evo(`/instance/logout/${enc(instance)}`, { method: 'DELETE' }); }
  catch (e) { if (!(e instanceof EvoError) || ![400, 404].includes(e.status)) throw e; }
}

export async function sendText(instance, phone, text) {
  await evo(`/message/sendText/${enc(instance)}`, { method: 'POST', body: JSON.stringify({ number: phone, text }) });
}

/** Resumo do texto: guardado antes de enviar para reconhecer a própria mensagem no webhook. */
export const textHash = (t) => crypto.createHash('sha256').update(String(t).replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 40);

/** Lê o webhook. null = evento que não interessa (grupo, status...). */
export function parseWebhook(b) {
  if (!b || typeof b.instance !== 'string') return null;
  const event = String(b.event ?? '').toLowerCase().replace('_', '.');
  if (event === 'connection.update') {
    const s = b.data?.state;
    return { kind: 'connection', instance: b.instance, state: s === 'open' || s === 'connecting' ? s : 'close' };
  }
  if (event && event !== 'messages.upsert') return null;
  const d = Array.isArray(b.data) ? b.data[0] : b.data;
  const key = d?.key;
  if (!key) return null;
  const jid = String(key.remoteJid ?? '');
  if (!jid.endsWith('@s.whatsapp.net')) return null;
  const m = d.message ?? {};
  const text = String(m.conversation ?? m.extendedTextMessage?.text ?? m.imageMessage?.caption ?? m.videoMessage?.caption
    ?? m.buttonsResponseMessage?.selectedDisplayText ?? m.listResponseMessage?.title ?? '').trim().slice(0, 1500);
  const phone = jid.split('@')[0].replace(/\D/g, '');
  if (key.fromMe) return { kind: 'outgoing', instance: b.instance, phone, hash: textHash(text) };
  return { kind: 'message', instance: b.instance, phone, name: typeof d.pushName === 'string' ? d.pushName.slice(0, 60) : null, text, type: String(d.messageType ?? Object.keys(m)[0] ?? 'desconhecido') };
}
