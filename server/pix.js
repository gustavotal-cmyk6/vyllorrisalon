// Pix "Copia e Cola" estático (BR Code / EMV-QRCPS, padrão do Banco Central) e QR Code em SVG.
// Estático = não há confirmação automática: o salão confere o recebimento no próprio banco.
import QRCode from 'qrcode';
import { HttpError } from './http.js';

const KEY_TYPES = ['cpf', 'cnpj', 'email', 'phone', 'random'];

const field = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;
// nome e cidade: só letras/números/espaço, sem acentos, maiúsculas (aceito por todos os bancos)
const plain = (t, max) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, max);

function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const cpfOk = (d) => {
  if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    return ((s * 10) % 11) % 10;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
};
const cnpjOk = (d) => {
  if (!/^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => {
    const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((acc, x, i) => acc + x * Number(d[i]), 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
};

/** Valida e normaliza a chave conforme o tipo (como o Banco Central espera). */
export function normalizePixKey(type, key) {
  if (!KEY_TYPES.includes(type)) throw new HttpError(400, 'Escolha o tipo da chave Pix.');
  const k = String(key || '').trim();
  if (!k) throw new HttpError(400, 'Informe a chave Pix.');
  const digits = k.replace(/\D/g, '');
  if (type === 'cpf') {
    if (!cpfOk(digits)) throw new HttpError(400, 'CPF inválido. Confira os números da chave Pix.');
    return digits;
  }
  if (type === 'cnpj') {
    if (!cnpjOk(digits)) throw new HttpError(400, 'CNPJ inválido. Confira os números da chave Pix.');
    return digits;
  }
  if (type === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k) || k.length > 77) throw new HttpError(400, 'E-mail da chave Pix inválido.');
    return k.toLowerCase();
  }
  if (type === 'phone') {
    const n = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
    if (n.length < 10 || n.length > 11) throw new HttpError(400, 'Celular da chave Pix inválido. Use DDD + número.');
    return `+55${n}`;
  }
  const evp = k.toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(evp)) throw new HttpError(400, 'Chave aleatória inválida. Copie exatamente como aparece no seu banco.');
  return evp;
}

/** Monta o código Pix Copia e Cola com valor exato e identificador da cobrança. */
export function buildBrCode({ key, name, city, amountCents, txid, description = '' }) {
  if (!(amountCents > 0)) throw new HttpError(400, 'Valor do Pix inválido.');
  const merchant = field('00', 'br.gov.bcb.pix') + field('01', key) + (description ? field('02', plain(description, 40)) : '');
  const ref = (String(txid || '').replace(/[^A-Za-z0-9]/g, '') || '***').slice(0, 25);
  const payload =
    field('00', '01') +
    field('26', merchant) +
    field('52', '0000') +
    field('53', '986') +
    field('54', (amountCents / 100).toFixed(2)) +
    field('58', 'BR') +
    field('59', plain(name, 25) || 'RECEBEDOR') +
    field('60', plain(city, 15) || 'BRASIL') +
    field('62', field('05', ref)) +
    '6304';
  return payload + crc16(payload);
}

export const qrSvg = (text) => QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#1d0535', light: '#ffffff' } });
export { crc16 };
