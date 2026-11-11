// Plano Pro: WhatsApp automático (painel da proprietária, webhook da Evolution e agendador).
import crypto from 'node:crypto';
import { route, OWNER, HttpError } from '../http.js';
import { get, run } from '../db.js';
import { today } from '../util.js';
import { connect, connectedNumber, connectionState, disconnect, instanceFor, parseWebhook, whatsappConfigured } from '../whatsapp.js';
import { MONTHLY_LIMIT, bookingLink, isQuiet, limitNotice, linkOf, outgoing, reply, salonPro, sendDue, sendFromSalon, setStatus, usageHit } from '../wa.js';

const NOT_PRO = 'O WhatsApp automático é do plano Pro. Ative o Pro em Assinatura.';
const NOT_READY = 'O WhatsApp automático ainda não foi ativado no servidor. Fale com o suporte do Vyllorri.';
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

async function needPro(sid) {
  const { pro } = await salonPro(sid);
  if (!pro) throw new HttpError(402, NOT_PRO);
  if (!whatsappConfigured()) throw new HttpError(503, NOT_READY);
}

route('GET', '/api/wa', OWNER, async ({ sid }) => {
  const { pro } = await salonPro(sid);
  const w = await linkOf(sid);
  let ignore = [];
  try { ignore = JSON.parse(w.ignore_numbers || '[]'); } catch {}
  const m = today().slice(0, 7);
  return {
    pro, configured: whatsappConfigured(), limit: MONTHLY_LIMIT, status: w.status, phone: w.phone,
    ai_enabled: !!w.ai_enabled, confirmations: !!w.confirmations, reminders: !!w.reminders,
    usage_count: w.usage_month === m ? w.usage_count : 0, extra_credits: w.extra_credits, ignore,
  };
});

route('POST', '/api/wa/connect', OWNER, async ({ sid, body }) => {
  await needPro(sid);
  let number;
  if (body.number) {
    const d = String(body.number).replace(/\D/g, '');
    number = d.length === 10 || d.length === 11 ? `55${d}` : d;
    if (!/^\d{12,13}$/.test(number)) throw new HttpError(400, 'Informe o número do WhatsApp com DDD. Ex.: (86) 99999-8888');
  }
  await linkOf(sid);
  try {
    const r = await connect(instanceFor(sid), number);
    if (number && !r.code) throw new Error('sem código');
    await setStatus(sid, 'connecting');
    return r;
  } catch (e) {
    console.error('[wa] conectar:', e.message);
    throw new HttpError(502, number ? 'Não foi possível gerar o código agora. Tente de novo ou use o QR code.' : 'Não foi possível gerar o QR code agora. Tente de novo em instantes.');
  }
});

route('GET', '/api/wa/status', OWNER, async ({ sid }) => {
  const { pro } = await salonPro(sid);
  if (!pro || !whatsappConfigured()) return { state: 'close', phone: null };
  const inst = instanceFor(sid);
  const state = await connectionState(inst).catch(() => 'close');
  const phone = state === 'open' ? await connectedNumber(inst) : null;
  await setStatus(sid, state, phone);
  return { state, phone };
});

route('POST', '/api/wa/disconnect', OWNER, async ({ sid }) => {
  if (!whatsappConfigured()) throw new HttpError(503, NOT_READY);
  await disconnect(instanceFor(sid)).catch((e) => { console.error('[wa] desconectar:', e.message); throw new HttpError(502, 'Não foi possível desconectar agora.'); });
  await setStatus(sid, 'close');
  return { ok: true };
});

route('POST', '/api/wa/prefs', OWNER, async ({ sid, body }) => {
  await linkOf(sid);
  await run('UPDATE wa_links SET ai_enabled=?, confirmations=?, reminders=? WHERE salon_id=?', body.ai ? 1 : 0, body.confirmations ? 1 : 0, body.reminders ? 1 : 0, sid);
  return { ok: true };
});

route('POST', '/api/wa/ignore', OWNER, async ({ sid, body }) => {
  const list = [...new Set(String(body.numbers || '').split(/[\n,;]+/).map((s) => s.replace(/\D/g, '')).filter((d) => d.length >= 10 && d.length <= 13))].slice(0, 50);
  await linkOf(sid);
  await run('UPDATE wa_links SET ignore_numbers=? WHERE salon_id=?', JSON.stringify(list), sid);
  return { ok: true, ignore: list };
});

// Teste do atendente no painel (usa a agenda de verdade, mas não marca nem cancela)
route('POST', '/api/wa/test', OWNER, async ({ sid, body }) => {
  const { pro } = await salonPro(sid);
  if (!pro) throw new HttpError(402, NOT_PRO);
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, 'A IA ainda não foi configurada no servidor (ANTHROPIC_API_KEY).');
  const text = String(body.text || '').trim().slice(0, 1000);
  if (!text) throw new HttpError(400, 'Escreva uma mensagem.');
  let history = Array.isArray(body.history) && body.history.length <= 40 && JSON.stringify(body.history).length < 200000 ? body.history : [];
  if ((await usageHit(sid)) < 0) throw new HttpError(429, 'Limite de respostas do mês atingido.');
  const r = await reply({ sid, phone: '0000000000', text, name: 'Teste do painel', test: true, history });
  return { reply: r.text, history: r.history };
});

// Webhook da Evolution (só com o token secreto na URL)
route('POST', '/api/wa/webhook', null, async ({ query, body }) => {
  if (!process.env.WHATSAPP_WEBHOOK_TOKEN || !safeEq(query.token || '', process.env.WHATSAPP_WEBHOOK_TOKEN)) throw new HttpError(401, 'unauthorized');
  const ev = parseWebhook(body);
  if (!ev) return { ok: true };
  const w = await get('SELECT salon_id FROM wa_links WHERE instance=?', ev.instance);
  if (!w) return { ok: true };
  const sid = w.salon_id;
  if (ev.kind === 'connection') { await setStatus(sid, ev.state); return { ok: true }; }
  if (ev.kind === 'outgoing') { await outgoing(sid, ev.phone, ev.hash); return { ok: true }; }

  const { salon, pro } = await salonPro(sid);
  const link = await linkOf(sid);
  if (!pro || !link.ai_enabled) return { ok: true };
  if (await isQuiet(sid, ev.phone)) return { ok: true }; // o salão está conversando com ela, ou número ignorado
  try {
    if ((await usageHit(sid)) < 0) {
      if (await limitNotice(sid, ev.phone))
        await sendFromSalon(sid, ev.phone, `Olá! Obrigada pela mensagem 😊 Para ver os horários livres e agendar no *${salon.name}*, é só usar o link: ${bookingLink(salon.slug)}\nSe precisar, a equipe responde por aqui assim que puder.`);
      return { ok: true };
    }
    const text = ev.text || `[A cliente mandou uma mensagem do tipo "${ev.type}", que não é texto. Peça com educação para escrever.]`;
    const r = await reply({ sid, phone: ev.phone, name: ev.name, text });
    await sendFromSalon(sid, ev.phone, r.text);
  } catch (e) {
    console.error('[wa] falha ao responder:', e.message);
  }
  return { ok: true };
});

// Agendador: confirmação e lembrete (chamado a cada 5 min pelo agendador do Vyllorri)
route('POST', '/api/cron/wa', null, async ({ req }) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEq(req.headers.authorization || '', `Bearer ${secret}`)) throw new HttpError(401, 'unauthorized');
  return { ok: true, sent: await sendDue() };
});
