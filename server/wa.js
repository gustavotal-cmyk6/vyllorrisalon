// Plano Pro do Vyllorri Beauty: atendente com IA no WhatsApp do salão, confirmação e lembrete
// automáticos, pausa quando o salão responde e números ignorados.
//
// O atendente usa a agenda real de cada salão pelas MESMAS regras da página de agendamento
// (freeSlots / findConflicts): expediente, intervalo, bloqueios e horários ocupados. A IA só
// conversa; quem decide se pode marcar é o código. O telefone da cliente vem do WhatsApp,
// nunca do modelo: ninguém mexe no horário de outra pessoa.
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { all, get, run, tx } from './db.js';
import { today, nowStr, addDays, addMin } from './util.js';
import { freeSlots, findConflicts } from './routes/agenda.js';
import { salonPayCfg, depositFor } from './routes/deposits.js';
import { notifyStaff } from './push.js';
import { billingInfo, salonRow } from './billing.js';
import { appUrl, instanceFor, sendText, textHash, whatsappConfigured } from './whatsapp.js';

const MODEL = process.env.WA_AI_MODEL || 'claude-haiku-5-5';
export const MONTHLY_LIMIT = Number(process.env.WA_MONTHLY_LIMIT || 500);
const MAX_ROUNDS = 8;
const NEW_CONVERSATION_HOURS = 12;
const MAX_HISTORY = 60;
const FALLBACK = 'Desculpe, tive um probleminha aqui. Pode repetir? Se preferir, agende direto pelo link.';
const DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = /^([01]\d|2[0-3]):[0-5]\d$/;
const brl = (c) => ((c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const weekday = (date) => DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
export const bookingLink = (slug) => `${appUrl()}/agendar/${slug}`;

// ---------- telefone ----------
/** Formas do mesmo número: com/sem 55 e com/sem o 9 do celular (o WhatsApp às vezes manda sem). */
export function phoneVariants(p) {
  const d = String(p || '').replace(/\D/g, '');
  const local = d.length >= 12 && d.startsWith('55') ? d.slice(2) : d;
  const alt = local.length === 11 && local[2] === '9' ? local.slice(0, 2) + local.slice(3) : local.length === 10 ? local.slice(0, 2) + '9' + local.slice(2) : null;
  return [...new Set([local, '55' + local, ...(alt ? [alt, '55' + alt] : [])])];
}
const localPhone = (p) => phoneVariants(p)[0];
const inList = (list) => list.map(() => '?').join(',');

// ---------- plano e conexão ----------
export async function salonPro(sid) {
  const s = await salonRow(sid);
  return s ? { salon: s, pro: billingInfo(s).pro_active } : { salon: null, pro: false };
}
export async function linkOf(sid) {
  let w = await get('SELECT * FROM wa_links WHERE salon_id=?', sid);
  if (!w) {
    await run('INSERT OR IGNORE INTO wa_links(salon_id, instance, updated_at) VALUES(?,?,?)', sid, instanceFor(sid), nowStr());
    w = await get('SELECT * FROM wa_links WHERE salon_id=?', sid);
  }
  return w;
}
export async function setStatus(sid, status, phone = null) {
  const w = await linkOf(sid);
  const d = String(phone || '').replace(/\D/g, '');
  await run('UPDATE wa_links SET status=?, phone=COALESCE(?, phone), connected_at=CASE WHEN ?=\'open\' AND status<>\'open\' THEN ? ELSE connected_at END, updated_at=? WHERE salon_id=?',
    status, d || null, status, nowStr(), nowStr(), w.salon_id);
}

/** Conta uma resposta: primeiro o limite do mês, depois os créditos extras. Devolve quantas restam, ou -1. */
export async function usageHit(sid) {
  const w = await linkOf(sid);
  const m = today().slice(0, 7);
  const used = w.usage_month === m ? w.usage_count : 0;
  if (used < MONTHLY_LIMIT) {
    await run('UPDATE wa_links SET usage_count=?, usage_month=? WHERE salon_id=?', used + 1, m, sid);
    return MONTHLY_LIMIT - used - 1 + w.extra_credits;
  }
  if (w.extra_credits > 0) {
    const r = await run('UPDATE wa_links SET usage_count=?, usage_month=?, extra_credits=extra_credits-1 WHERE salon_id=? AND extra_credits>0', used + 1, m, sid);
    if (r.changes) return w.extra_credits - 1;
  }
  return -1;
}

// ---------- pausa e números ignorados ----------
export async function botMark(sid, phone, text) {
  await run('INSERT OR REPLACE INTO wa_bot_texts(salon_id, phone, hash, created_at) VALUES(?,?,?,?)', sid, String(phone).replace(/\D/g, ''), textHash(text), Date.now());
  await run('DELETE FROM wa_bot_texts WHERE created_at < ?', Date.now() - 864e5);
}
/** Mensagem enviada pelo número do salão: do sistema → 'bot'; de uma pessoa → pausa o atendente 12 h com essa cliente. */
export async function outgoing(sid, phone, hash) {
  const ph = String(phone).replace(/\D/g, '');
  // compara pelo texto (o WhatsApp às vezes devolve o número sem o 9)
  const r = await run('DELETE FROM wa_bot_texts WHERE salon_id=? AND hash=? AND created_at > ?', sid, hash, Date.now() - 10 * 60e3);
  if (r.changes) return 'bot';
  const until = addMin(nowStr().slice(0, 16), 12 * 60);
  await run(`INSERT INTO wa_conversations(salon_id, phone, human_until) VALUES(?,?,?)
             ON CONFLICT(salon_id, phone) DO UPDATE SET human_until=excluded.human_until`, sid, ph, until);
  return 'paused';
}
export async function isQuiet(sid, phone) {
  const ph = String(phone).replace(/\D/g, '');
  const c = await get('SELECT human_until FROM wa_conversations WHERE salon_id=? AND phone=?', sid, ph);
  if (c?.human_until && c.human_until > nowStr().slice(0, 16)) return true;
  const w = await linkOf(sid);
  let list = [];
  try { list = JSON.parse(w.ignore_numbers || '[]'); } catch {}
  const mine = new Set(phoneVariants(ph));
  return list.some((n) => phoneVariants(n).some((v) => mine.has(v)));
}
/** Limite acabou: manda a resposta pronta no máximo 1 vez a cada 12 h por cliente. */
export async function limitNotice(sid, phone) {
  const ph = String(phone).replace(/\D/g, '');
  const c = await get('SELECT limit_notice_at FROM wa_conversations WHERE salon_id=? AND phone=?', sid, ph);
  if (c?.limit_notice_at && c.limit_notice_at > addMin(nowStr().slice(0, 16), -12 * 60)) return false;
  await run(`INSERT INTO wa_conversations(salon_id, phone, limit_notice_at) VALUES(?,?,?)
             ON CONFLICT(salon_id, phone) DO UPDATE SET limit_notice_at=excluded.limit_notice_at`, sid, ph, nowStr().slice(0, 16));
  return true;
}

/** Envia pelo WhatsApp do salão marcando antes que é do sistema (para não pausar o próprio atendente). */
export async function sendFromSalon(sid, phone, text) {
  await botMark(sid, phone, text);
  await sendText(instanceFor(sid), phone, text);
}

// ---------- ferramentas do atendente ----------
async function onlineServices(sid) {
  const services = await all(`SELECT s.id, s.name, s.description, s.price_cents, s.duration_min, s.requires_deposit FROM services s
                               WHERE s.salon_id=? AND s.active=1 AND s.online=1 ORDER BY s.name`, sid);
  const links = await all(`SELECT sp.service_id, p.id, p.name, COALESCE(sp.price_cents, s.price_cents) AS price_cents FROM service_pros sp
                            JOIN professionals p ON p.id=sp.professional_id JOIN services s ON s.id=sp.service_id
                           WHERE s.salon_id=? AND s.online=1 AND p.active=1 ORDER BY p.name`, sid);
  return services.map((s) => ({ ...s, pros: links.filter((l) => l.service_id === s.id) })).filter((s) => s.pros.length);
}
async function serviceOf(sid, id) {
  const s = (await onlineServices(sid)).find((x) => x.id === Number(id));
  if (!s) throw new Error('Serviço indisponível. Use os ids de ver_servicos.');
  return s;
}
async function slotsOf(sid, service, proId, date) {
  const pros = proId ? service.pros.filter((p) => p.id === Number(proId)) : service.pros;
  const out = new Map();
  for (const p of pros) for (const t of await freeSlots(sid, p.id, date, service.duration_min, { step: 30 })) if (!out.has(t)) out.set(t, p);
  return new Map([...out.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export const TOOLS = [
  { name: 'ver_servicos', strict: true, description: 'Serviços disponíveis (id, nome, duração, preço), profissionais de cada um, horário e endereço do salão. Use antes de falar de preço ou de marcar.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false } },
  { name: 'ver_horarios_livres', strict: true, description: 'Horários livres de um dia para um serviço. Consulte sempre antes de oferecer ou confirmar um horário.',
    input_schema: { type: 'object', additionalProperties: false, required: ['servico_id', 'profissional_id', 'data'],
      properties: { servico_id: { type: 'integer' }, profissional_id: { type: ['integer', 'null'], description: 'null = qualquer profissional' }, data: { type: 'string', description: 'AAAA-MM-DD' } } } },
  { name: 'marcar_horario', strict: true, description: 'Marca o horário na agenda (o salão confirma em seguida). Só chame depois que a cliente confirmar serviço, dia, horário e o nome dela.',
    input_schema: { type: 'object', additionalProperties: false, required: ['servico_id', 'profissional_id', 'data', 'hora', 'nome_cliente'],
      properties: { servico_id: { type: 'integer' }, profissional_id: { type: ['integer', 'null'] }, data: { type: 'string' }, hora: { type: 'string', description: 'HH:mm, como veio de ver_horarios_livres' }, nome_cliente: { type: 'string' } } } },
  { name: 'meus_horarios', strict: true, description: 'Próximos horários da cliente que está conversando.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false } },
  { name: 'cancelar_horario', strict: true, description: 'Cancela um horário da cliente que está conversando. Pegue o id em meus_horarios e confirme com ela antes.',
    input_schema: { type: 'object', additionalProperties: false, required: ['agendamento_id'], properties: { agendamento_id: { type: 'integer' } } } },
];

const tools = {
  async ver_servicos(_, ctx) {
    const s = await get('SELECT name, address, phone, instagram, opening_hours, cancel_hours FROM salons WHERE id=?', ctx.sid);
    const svc = await onlineServices(ctx.sid);
    return {
      servicos: svc.map((v) => ({ id: v.id, nome: v.name, descricao: v.description, duracao_min: v.duration_min, preco: brl(v.price_cents),
        profissionais: v.pros.map((p) => ({ id: p.id, nome: p.name, preco: brl(p.price_cents) })), exige_sinal_pix: !!v.requires_deposit })),
      horario_de_funcionamento: s.opening_hours, endereco: s.address, instagram: s.instagram, cancelamento_ate_horas_antes: s.cancel_hours,
    };
  },
  async ver_horarios_livres({ servico_id, profissional_id, data }, ctx) {
    if (!DATE.test(data)) throw new Error('Data no formato AAAA-MM-DD.');
    if (data < today() || data > addDays(today(), 60)) return { data, horarios: [], aviso: 'Só dá para agendar de hoje até 60 dias.' };
    const slots = await slotsOf(ctx.sid, await serviceOf(ctx.sid, servico_id), profissional_id, data);
    return { data, dia_da_semana: weekday(data), horarios: [...slots.keys()], sem_horario: slots.size === 0 };
  },
  async marcar_horario({ servico_id, profissional_id, data, hora, nome_cliente }, ctx) {
    if (!DATE.test(data) || !HOUR.test(hora)) throw new Error('Data AAAA-MM-DD e hora HH:mm.');
    const service = await serviceOf(ctx.sid, servico_id);
    const cfg = await salonPayCfg(ctx.sid);
    if (depositFor(cfg, service, service.price_cents, 0) > 0)
      throw new Error(`Este serviço exige sinal por Pix: mande o link para a cliente agendar e pagar o sinal: ${bookingLink(ctx.slug)}`);
    const slot = (await slotsOf(ctx.sid, service, profissional_id, data)).get(hora);
    if (!slot) throw new Error('Esse horário não está mais livre. Consulte ver_horarios_livres de novo.');
    const name = String(nome_cliente || '').trim().slice(0, 80);
    if (name.length < 2) throw new Error('Informe o nome da cliente.');
    if (ctx.test) return { ok: true, modo_teste: true, aviso: 'Teste do painel: nada foi marcado de verdade.', data, hora, profissional: slot.name };
    const start = `${data} ${hora}`, end = addMin(start, service.duration_min);
    const phones = phoneVariants(ctx.phone);
    const out = await tx(async () => {
      if ((await findConflicts(ctx.sid, slot.id, start, end)).length) throw new Error('Esse horário acabou de ser ocupado. Ofereça outro.');
      const client = await get(`SELECT id FROM clients WHERE salon_id=? AND active=1 AND phone IN (${inList(phones)}) ORDER BY id LIMIT 1`, ctx.sid, ...phones);
      const clientId = client?.id ?? (await run('INSERT INTO clients(salon_id,name,phone,created_at) VALUES(?,?,?,?)', ctx.sid, name, localPhone(ctx.phone), nowStr())).id;
      const dup = await get(`SELECT 1 x FROM visits WHERE salon_id=? AND client_id=? AND date=? AND status IN ('scheduled','confirmed')`, ctx.sid, clientId, data);
      if (dup) throw new Error('A cliente já tem horário neste dia. Para mudar, use meus_horarios e cancelar_horario, ou fale com o salão.');
      const token = crypto.randomBytes(16).toString('hex');
      const visitId = (await run(`INSERT INTO visits(salon_id,client_id,date,status,notes,source,public_token,created_at) VALUES(?,?,?,?,?,?,?,?)`,
        ctx.sid, clientId, data, 'scheduled', 'Agendado pelo WhatsApp', 'online', token, nowStr())).id;
      await run('INSERT INTO visit_items(salon_id,visit_id,service_id,professional_id,start_at,end_at,duration_min,price_cents) VALUES(?,?,?,?,?,?,?,?)',
        ctx.sid, visitId, service.id, slot.id, start, end, service.duration_min, slot.price_cents);
      return { visitId };
    });
    notifyStaff(ctx.sid, { title: 'Novo agendamento pelo WhatsApp', body: `${name} · ${service.name} · ${data.split('-').reverse().slice(0, 2).join('/')} às ${hora}`, url: '/#/agenda' }, { proId: slot.id }).catch(() => {});
    return { ok: true, agendamento_id: out.visitId, servico: service.name, profissional: slot.name, data, dia_da_semana: weekday(data), hora, situacao: 'aguardando o salão confirmar' };
  },
  async meus_horarios(_, ctx) {
    if (ctx.test) return { horarios: [], aviso: 'Teste do painel: sem horários da cliente.' };
    const phones = phoneVariants(ctx.phone);
    const rows = await all(`SELECT v.id, v.status, MIN(vi.start_at) AS start_at, GROUP_CONCAT(s.name, ' + ') AS servico, GROUP_CONCAT(DISTINCT p.name) AS profissional
                              FROM visits v JOIN clients c ON c.id=v.client_id JOIN visit_items vi ON vi.visit_id=v.id
                              JOIN services s ON s.id=vi.service_id JOIN professionals p ON p.id=vi.professional_id
                             WHERE v.salon_id=? AND c.phone IN (${inList(phones)}) AND v.status IN ('scheduled','confirmed') AND v.date>=?
                             GROUP BY v.id ORDER BY start_at LIMIT 5`, ctx.sid, ...phones, today());
    return { horarios: rows.filter((r) => r.start_at > nowStr().slice(0, 16)).map((r) => ({ agendamento_id: r.id, servico: r.servico, profissional: r.profissional,
      data: r.start_at.slice(0, 10), dia_da_semana: weekday(r.start_at.slice(0, 10)), hora: r.start_at.slice(11, 16), situacao: r.status === 'confirmed' ? 'confirmado' : 'aguardando confirmação' })) };
  },
  async cancelar_horario({ agendamento_id }, ctx) {
    if (ctx.test) return { ok: true, modo_teste: true };
    const phones = phoneVariants(ctx.phone);
    const v = await get(`SELECT v.id, MIN(vi.start_at) AS start_at, s.cancel_hours FROM visits v JOIN clients c ON c.id=v.client_id JOIN visit_items vi ON vi.visit_id=v.id
                          JOIN salons s ON s.id=v.salon_id WHERE v.id=? AND v.salon_id=? AND c.phone IN (${inList(phones)}) AND v.status IN ('scheduled','confirmed') GROUP BY v.id`,
      Number(agendamento_id), ctx.sid, ...phones);
    if (!v) throw new Error('Não encontrei esse horário para esta cliente.');
    if (v.start_at <= addMin(nowStr().slice(0, 16), (v.cancel_hours || 0) * 60))
      throw new Error(`O salão só aceita cancelar com ${v.cancel_hours} h de antecedência. Peça para a cliente falar com a equipe.`);
    await run("UPDATE visits SET status='cancelled' WHERE id=? AND salon_id=?", v.id, ctx.sid);
    notifyStaff(ctx.sid, { title: 'Cancelamento pelo WhatsApp', body: `Horário de ${v.start_at.slice(8, 10)}/${v.start_at.slice(5, 7)} às ${v.start_at.slice(11, 16)} cancelado pela cliente.`, url: '/#/agenda' }).catch(() => {});
    return { ok: true };
  },
};

function systemPrompt(s) {
  return `Você é a atendente virtual do salão "${s.name}" no WhatsApp.
${s.description ? `Sobre o salão: ${s.description}\n` : ''}${s.address ? `Endereço: ${s.address}\n` : ''}Link para a cliente agendar sozinha: ${bookingLink(s.slug)}

Seu trabalho: tirar dúvidas, mostrar horários livres, marcar, mostrar e cancelar horários da cliente.
Regras:
- Serviços, preços, profissionais e horários vêm das ferramentas. Nunca invente.
- Para marcar: descubra o serviço (e a profissional, se a cliente quiser), consulte os horários livres, ofereça de 3 a 5 opções, confirme serviço, dia, horário e o nome, e só então marque. O salão confirma em seguida.
- Serviço com sinal por Pix: mande o link para ela agendar e pagar o sinal por lá.
- Se nada servir, ou a cliente preferir, mande o link.
- Na primeira resposta de uma conversa nova, cumprimente e diga que pode agendar por aqui ou pelo link.
- Mensagens curtas, jeito de WhatsApp, sem markdown (no máximo *negrito*). Copie o link exatamente como está.
- Assuntos fora da agenda (reclamação, pedido especial): diga que vai avisar a equipe.
- Responda no idioma da cliente.`;
}

/** Responde uma mensagem da cliente. test = teste do painel (não marca nem cancela e não grava histórico). */
export async function reply({ sid, phone, text, name = null, test = false, history = [] }) {
  const salon = await get('SELECT id, name, slug, description, address FROM salons WHERE id=?', sid);
  const ctx = { sid, slug: salon.slug, phone, test };
  const ph = String(phone).replace(/\D/g, '');
  let hist = Array.isArray(history) ? history : [];
  if (!test) {
    const c = await get('SELECT messages, updated_at FROM wa_conversations WHERE salon_id=? AND phone=?', sid, ph);
    let msgs = [];
    try { msgs = JSON.parse(c?.messages || '[]'); } catch {}
    const fresh = c?.updated_at && c.updated_at > addMin(nowStr().slice(0, 16), -NEW_CONVERSATION_HOURS * 60) && msgs.length < MAX_HISTORY;
    hist = fresh ? msgs : [];
  }
  const now = nowStr();
  const note = `[Agora: ${weekday(now.slice(0, 10))}, ${now.slice(0, 10)}, ${now.slice(11, 16)}${name ? ` · nome no WhatsApp: ${name}` : ''}${hist.length ? '' : ' · primeira mensagem da conversa'}]`;
  const messages = [...hist, { role: 'user', content: [{ type: 'text', text: `${note}\n\n${text}` }] }];
  const client = new Anthropic();

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let res;
    try {
      res = await client.messages.create({ model: MODEL, max_tokens: 4000, output_config: { effort: 'low' }, system: systemPrompt(salon), tools: TOOLS, messages });
    } catch (e) {
      console.error('[wa-agent] API do Claude:', e?.status, e?.message);
      return { text: FALLBACK, history: hist };
    }
    messages.push({ role: 'assistant', content: res.content }); // resposta inteira: o histórico precisa dela assim
    if (res.stop_reason === 'refusal') return { text: 'Desculpe, não consigo ajudar com isso por aqui. Quer marcar um horário?', history: hist };
    if (res.stop_reason === 'pause_turn') continue;
    const calls = res.content.filter((b) => b.type === 'tool_use');
    if (res.stop_reason === 'tool_use' && calls.length) {
      const results = await Promise.all(calls.map(async (c) => {
        try {
          const fn = tools[c.name];
          if (!fn) throw new Error(`Ferramenta desconhecida: ${c.name}`);
          return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(await fn(c.input || {}, ctx)) };
        } catch (e) {
          return { type: 'tool_result', tool_use_id: c.id, content: e.message, is_error: true };
        }
      }));
      messages.push({ role: 'user', content: results }); // todos os resultados juntos
      continue;
    }
    const out = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n').trim() || FALLBACK;
    if (!test) {
      const json = JSON.stringify(messages);
      if (json.length < 400000)
        await run(`INSERT INTO wa_conversations(salon_id, phone, messages, updated_at) VALUES(?,?,?,?)
                   ON CONFLICT(salon_id, phone) DO UPDATE SET messages=excluded.messages, updated_at=excluded.updated_at`, sid, ph, json, nowStr().slice(0, 16));
    }
    return { text: out, history: messages };
  }
  return { text: FALLBACK, history: hist };
}

// ---------- mensagens automáticas (confirmação e lembrete) ----------
const first = (n) => String(n || '').trim().split(/\s+/)[0] || '';
function when(start) {
  const d = start.slice(0, 10);
  const label = d === today() ? 'hoje' : d === addDays(today(), 1) ? 'amanhã' : `${weekday(d)}, ${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return `${label} às ${start.slice(11, 16)}`;
}
export function messageFor(kind, m) {
  if (kind === 'confirm')
    return `Olá, ${first(m.client)}! ✅ Seu horário no *${m.salon}* está confirmado:\n\n${m.service} com ${m.pro}\n${when(m.start_at)}\n\nPrecisa remarcar ou cancelar? É só responder aqui.`;
  return `Oi, ${first(m.client)}! Passando pra lembrar do seu horário no *${m.salon}*: ${m.service} com ${m.pro}, ${when(m.start_at)}. Te esperamos!\n\nSe não puder vir, responda aqui ou veja pelo link: ${bookingLink(m.slug)}`;
}

/** Envia o que estiver devido. Chamado a cada 5 minutos e logo depois de confirmar um horário. */
export async function sendDue() {
  if (!whatsappConfigured()) return 0;
  const now = nowStr().slice(0, 16);
  const links = await all("SELECT * FROM wa_links WHERE status='open'");
  let sent = 0;
  for (const w of links) {
    if (!(await salonPro(w.salon_id)).pro) continue;
    const rows = await all(`SELECT v.id, v.status, v.created_at, v.wa_confirm_at, v.wa_remind_at, c.name AS client, c.phone, s.name AS salon, s.slug,
                                   MIN(vi.start_at) AS start_at, GROUP_CONCAT(sv.name, ' + ') AS service, GROUP_CONCAT(DISTINCT p.name) AS pro
                              FROM visits v JOIN clients c ON c.id=v.client_id JOIN salons s ON s.id=v.salon_id
                              JOIN visit_items vi ON vi.visit_id=v.id JOIN services sv ON sv.id=vi.service_id JOIN professionals p ON p.id=vi.professional_id
                             WHERE v.salon_id=? AND v.status IN ('scheduled','confirmed') AND v.date>=? AND v.date<=? AND c.phone IS NOT NULL
                             GROUP BY v.id`, w.salon_id, today(), addDays(today(), 2));
    for (const v of rows) {
      if (v.start_at <= now) continue;
      const connected = w.connected_at || now;
      const canConfirm = w.confirmations && v.status === 'confirmed' && !v.wa_confirm_at && v.created_at >= connected && v.created_at >= addMin(now, -2 * 1440);
      let kind = null;
      if (canConfirm) kind = 'confirm';
      else if (w.reminders && !v.wa_remind_at && v.start_at > addMin(now, 45) && v.start_at <= addMin(now, 24 * 60)
        && v.created_at.slice(0, 16) < addMin(v.start_at, -180) && (!v.wa_confirm_at || v.wa_confirm_at < addMin(now, -360))
        && !(w.confirmations && v.status === 'confirmed' && !v.wa_confirm_at && v.created_at >= connected)) kind = 'remind';
      if (!kind) continue;
      const col = kind === 'confirm' ? 'wa_confirm_at' : 'wa_remind_at';
      const mark = await run(`UPDATE visits SET ${col}=? WHERE id=? AND ${col} IS NULL`, now, v.id); // uma vez só
      if (!mark.changes) continue;
      try { await sendFromSalon(w.salon_id, '55' + localPhone(v.phone), messageFor(kind, v)); sent++; }
      catch (e) { console.error(`[wa] ${kind} não enviado:`, e.message); }
    }
  }
  return sent;
}
