export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const routes = [];

/**
 * roles: null = público; 'any' = qualquer usuária logada; ou lista de papéis.
 */
export function route(method, pattern, roles, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-z_]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, roles, handler });
}

export async function readBody(req) {
  // na Vercel o corpo pode já vir lido pelo runtime
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    try {
      const b = JSON.parse(String(req.body) || '{}');
      return b && typeof b === 'object' ? b : {};
    } catch {
      throw new HttpError(400, 'JSON inválido');
    }
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw new HttpError(413, 'Requisição muito grande');
    chunks.push(c);
  }
  if (!size) return {};
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('application/json')) throw new HttpError(415, 'Use application/json');
  try {
    const b = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return b && typeof b === 'object' ? b : {};
  } catch {
    throw new HttpError(400, 'JSON inválido');
  }
}

export async function dispatch(req, url, loadUser) {
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.re.exec(url.pathname);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    const user = r.roles ? await loadUser(req) : null;
    if (r.roles) {
      if (!user) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
      if (r.roles !== 'any' && !r.roles.includes(user.role)) throw new HttpError(403, 'Você não tem permissão para isso.');
    }
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
    const query = Object.fromEntries(url.searchParams);
    return r.handler({ req, params, query, body, user, sid: user?.salon_id });
  }
  throw new HttpError(404, 'Rota não encontrada');
}

export const OWNER = ['owner'];
export const STAFF = ['owner', 'reception'];
export const ALL = 'any';
