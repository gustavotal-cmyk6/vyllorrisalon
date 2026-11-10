// Segurança da conta: verificação em 2 etapas (TOTP), sessões, registro de atividades e backup.
import crypto from 'node:crypto';
import { all, get, run } from './db.js';
import { HttpError } from './http.js';
import { nowStr } from './util.js';

// ---------- TOTP (RFC 6238), compatível com Google Authenticator, Microsoft Authenticator, Authy ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(buf) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function unbase32(s) {
  let bits = 0, value = 0;
  const out = [];
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
export const newTotpSecret = () => base32(crypto.randomBytes(20));
export function totpCode(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', unbase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
const stepNow = () => Math.floor(Date.now() / 30000);
/** Confere o código aceitando 30 s de diferença de relógio; devolve o passo usado (para impedir reuso) ou null. */
export function checkTotp(secret, code, lastStep = 0) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6) return null;
  const now = stepNow();
  for (const s of [now - 1, now, now + 1]) {
    if (s <= (lastStep || 0)) continue;
    if (crypto.timingSafeEqual(Buffer.from(totpCode(secret, s)), Buffer.from(c))) return s;
  }
  return null;
}
export const otpauthUrl = (secret, email) =>
  `otpauth://totp/${encodeURIComponent('Vyllorri Beauty')}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent('Vyllorri Beauty')}&digits=6&period=30`;

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
/** 8 códigos de recuperação de uso único (guardados só como hash). */
export function newRecoveryCodes() {
  const plain = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})/, '$1-'));
  return { plain, hashed: plain.map((c) => sha(c.replace(/-/g, ''))) };
}

/**
 * Segunda etapa do login: aceita o código do aplicativo autenticador ou um código de recuperação.
 * Lança 401 { code: '2fa' } quando falta o código, para a tela pedir.
 */
export async function verifySecondFactor(u, code) {
  if (!u.totp_enabled) return;
  if (!code) throw new HttpError(401, 'Digite o código de 6 números do seu aplicativo autenticador.', { code: '2fa' });
  const step = checkTotp(u.totp_secret, code, u.totp_last);
  if (step) return run('UPDATE users SET totp_last=? WHERE id=?', step, u.id);
  const rc = String(code).replace(/[^0-9a-z]/gi, '').toUpperCase();
  const codes = JSON.parse(u.recovery_codes || '[]');
  const i = codes.indexOf(sha(rc));
  if (rc.length === 10 && i >= 0) {
    codes.splice(i, 1);
    return run('UPDATE users SET recovery_codes=? WHERE id=?', JSON.stringify(codes), u.id);
  }
  throw new HttpError(401, 'Código inválido ou já usado. Confira o horário do celular e tente o código novo.', { code: '2fa' });
}

// ---------- Registro de atividades ----------
/** Guarda quem fez o quê (nunca guarda senhas, códigos ou dados de pagamento). */
export async function audit(req, user, action, detail = '', salonId = null) {
  try {
    const ip = process.env.VERCEL ? String(req?.headers?.['x-real-ip'] || req?.headers?.['x-forwarded-for']?.split(',')[0] || '') : req?.socket?.remoteAddress || '';
    await run('INSERT INTO audit_log(salon_id,user_id,action,detail,ip,created_at) VALUES(?,?,?,?,?,?)',
      salonId ?? user?.salon_id ?? null, user?.id ?? null, action, String(detail || '').slice(0, 300), ip.slice(0, 64), nowStr());
  } catch (e) {
    console.error('audit', e.message); // o registro nunca derruba a operação principal
  }
}
export const AUDIT_LABEL = {
  login: 'Entrou no app', login_failed: 'Tentativa de login com senha ou código errado', logout_all: 'Saiu de todos os outros aparelhos',
  password: 'Trocou a senha', '2fa_on': 'Ativou a verificação em 2 etapas', '2fa_off': 'Desativou a verificação em 2 etapas',
  user_create: 'Criou um acesso', user_update: 'Alterou um acesso', sale_void: 'Estornou uma venda', client_archive: 'Arquivou uma cliente',
  expense_delete: 'Excluiu uma despesa', salon_profile: 'Alterou o perfil do salão', booking: 'Alterou o agendamento online',
  deposit: 'Alterou a configuração do sinal (Pix)', commission_pay: 'Registrou pagamento de comissão', backup: 'Baixou o backup completo',
};

// ---------- Backup ----------
const SKIP = new Set(['sessions', 'auth_attempts', 'sqlite_sequence', '_meta']);
/** Cópia completa do banco em JSON (sem sessões nem tentativas de login). */
export async function fullBackup() {
  const tables = (await all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).map((t) => t.name).filter((t) => !SKIP.has(t));
  const out = { app: 'Vyllorri Beauty', created_at: new Date().toISOString(), tables: {} };
  for (const t of tables) out.tables[t] = await all(`SELECT * FROM "${t.replace(/"/g, '')}"`);
  return out;
}
