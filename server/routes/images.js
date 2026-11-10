// Fotos (profissionais, serviços, logo, capa e galeria do salão).
// Ficam no banco e são servidas por um identificador aleatório, que pode aparecer na página pública.
import crypto from 'node:crypto';
import { route, HttpError, ADMIN } from '../http.js';
import { get, run } from '../db.js';
import { nowStr } from '../util.js';

const MAX_BYTES = 700_000;

/**
 * Valida uma imagem enviada como data URL: tipo permitido, tamanho e assinatura real do arquivo
 * (os primeiros bytes precisam ser de JPG, PNG ou WEBP — um arquivo disfarçado é recusado).
 */
export function parseImage(data, badMsg = 'Envie uma imagem JPG, PNG ou WEBP.', bigMsg = 'Imagem muito grande. Use uma foto de até 700 KB.') {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
  if (!m) throw new HttpError(400, badMsg);
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_BYTES) throw new HttpError(413, bigMsg);
  const real =
    buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff ? 'image/jpeg'
    : buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'image/png'
    : buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp'
    : null;
  if (!real) throw new HttpError(400, badMsg);
  return { mime: real, b64: m[2] };
}

route('POST', '/api/images', ADMIN, async ({ body, sid }) => {
  const img = parseImage(body.data);
  const id = crypto.randomBytes(16).toString('hex');
  await run('INSERT INTO images(id,salon_id,mime,data,created_at) VALUES(?,?,?,?,?)', id, sid, img.mime, img.b64, nowStr());
  return { id, url: imageUrl(id) };
});

route('GET', '/api/images/:id', null, async ({ params }) => {
  if (!/^[0-9a-f]{32}$/.test(params.id)) throw new HttpError(404, 'Imagem não encontrada');
  const img = await get('SELECT mime, data FROM images WHERE id=? AND private=0', params.id);
  if (!img) throw new HttpError(404, 'Imagem não encontrada');
  return { __raw: { type: img.mime, body: Buffer.from(img.data, 'base64'), cache: 'public, max-age=31536000, immutable' } };
});

export const imageUrl = (id) => (id ? `/api/images/${id}` : null);

/** Valida que a imagem pertence ao salão (ou null para remover). */
export async function imageRef(v, sid) {
  if (v === undefined || v === null || v === '') return null;
  const id = String(v).replace(/^\/api\/images\//, '');
  if (!/^[0-9a-f]{32}$/.test(id) || !(await get('SELECT 1 x FROM images WHERE id=? AND salon_id=?', id, sid)))
    throw new HttpError(400, 'Imagem inválida. Envie a foto novamente.');
  return id;
}
