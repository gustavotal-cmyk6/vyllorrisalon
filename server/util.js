// Datas são tratadas como horário local do salão, em texto: 'YYYY-MM-DD' e 'YYYY-MM-DD HH:MM'.
const pad = (n) => String(n).padStart(2, '0');

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const nowStr = () => {
  const d = new Date();
  return `${today()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const toUtc = (s) => new Date(s.length === 10 ? s + 'T00:00:00Z' : s.replace(' ', 'T').slice(0, 16) + ':00Z');
const fmtDate = (d) => d.toISOString().slice(0, 10);

export const addDays = (date, n) => {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDate(d);
};
export const addMin = (dt, min) => {
  const d = toUtc(dt);
  d.setUTCMinutes(d.getUTCMinutes() + min);
  return d.toISOString().slice(0, 16).replace('T', ' ');
};
export const diffMin = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 60000);
export const diffDays = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
export const dow = (date) => toUtc(date).getUTCDay();
export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export const monthRange = (date) => {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
};
export const prevMonthRange = (date) => {
  const first = monthRange(date).from;
  return monthRange(addDays(first, -1));
};
/** Período imediatamente anterior, com a mesma duração. */
export const prevPeriod = (from, to) => {
  const days = diffDays(from, to) + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
};
export const pctChange = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : cur ? null : 0);
