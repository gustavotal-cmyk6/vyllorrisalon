import { HttpError } from './http.js';

const bad = (label, msg) => {
  throw new HttpError(400, `${label}: ${msg}`);
};
const empty = (v) => v === undefined || v === null || v === '';

export const V = {
  str(v, label, { req = false, max = 200, min = 0 } = {}) {
    if (empty(v)) {
      if (req) bad(label, 'campo obrigatório');
      return null;
    }
    if (typeof v !== 'string') bad(label, 'texto inválido');
    const s = v.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
    if (req && !s) bad(label, 'campo obrigatório');
    if (s.length > max) bad(label, `máximo de ${max} caracteres`);
    if (s.length < min) bad(label, `mínimo de ${min} caracteres`);
    return s || null;
  },
  int(v, label, { req = false, min = -2147483648, max = 2147483647 } = {}) {
    if (empty(v)) {
      if (req) bad(label, 'campo obrigatório');
      return null;
    }
    const n = Number(v);
    if (!Number.isInteger(n)) bad(label, 'número inteiro inválido');
    if (n < min || n > max) bad(label, `deve estar entre ${min} e ${max}`);
    return n;
  },
  num(v, label, { req = false, min = -1e12, max = 1e12 } = {}) {
    if (empty(v)) {
      if (req) bad(label, 'campo obrigatório');
      return null;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) bad(label, 'número inválido');
    if (n < min || n > max) bad(label, `deve estar entre ${min} e ${max}`);
    return n;
  },
  /** Valores monetários trafegam sempre em centavos (inteiros). */
  cents(v, label, { req = false, min = 0, max = 100_000_000 } = {}) {
    return V.int(v, label, { req, min, max });
  },
  date(v, label, { req = false } = {}) {
    if (empty(v)) {
      if (req) bad(label, 'campo obrigatório');
      return null;
    }
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v + 'T00:00:00Z'))) bad(label, 'data inválida');
    return v;
  },
  datetime(v, label, { req = false } = {}) {
    if (empty(v)) {
      if (req) bad(label, 'campo obrigatório');
      return null;
    }
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v) || isNaN(Date.parse(v.replace(' ', 'T') + ':00Z')))
      bad(label, 'data/hora inválida');
    return v;
  },
  time(v, label, { req = false } = {}) {
    if (empty(v)) {
      if (req) bad(label, 'campo obrigatório');
      return null;
    }
    if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) bad(label, 'horário inválido');
    return v;
  },
  oneOf(v, list, label, { req = false } = {}) {
    if (empty(v)) {
      if (req) bad(label, 'campo obrigatório');
      return null;
    }
    if (!list.includes(v)) bad(label, 'valor inválido');
    return v;
  },
  bool(v) {
    return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
  },
  email(v, label) {
    const s = V.str(v, label, { req: true, max: 120 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) bad(label, 'e-mail inválido');
    return s;
  },
  phone(v, label) {
    const s = V.str(v, label, { max: 30 });
    if (!s) return null;
    const digits = s.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) bad(label, 'telefone inválido');
    return digits;
  },
  range(q) {
    const from = V.date(q.from, 'Data inicial', { req: true });
    const to = V.date(q.to, 'Data final', { req: true });
    if (to < from) bad('Período', 'a data final é anterior à inicial');
    return { from, to };
  },
};
