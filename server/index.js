process.env.TZ ||= 'America/Sao_Paulo';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dispatch, HttpError } from './http.js';
import { loadUser } from './auth.js';
import { ready } from './db.js';
import './routes/account.js';
import './routes/catalog.js';
import './routes/clients.js';
import './routes/agenda.js';
import './routes/sales.js';
import './routes/stock.js';
import './routes/finance.js';
import './routes/reports.js';
import './routes/public.js';
import './routes/images.js';
import './routes/deposits.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://viacep.com.br; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; frame-ancestors 'none'",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...HEADERS, ...headers });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
  if (pathname.startsWith('/agendar/')) file = path.join(PUBLIC, 'agendar.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html'); // SPA
  send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
}

/** Handler HTTP único: usado pelo servidor local e pela função da Vercel (api/index.js). */
export async function handler(req, res) {
  try {
    await ready;
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const result = await dispatch(req, url, loadUser);
      // respostas binárias (imagens)
      if (result?.__raw) return send(res, 200, result.__raw.body, { 'Content-Type': result.__raw.type, 'Cache-Control': result.__raw.cache || 'no-store' });
      // handlers podem devolver { __cookie, data } para definir cookie de sessão
      const cookie = result?.__cookie;
      const out = cookie !== undefined ? result.data : result;
      return send(res, 200, JSON.stringify(out ?? { ok: true }), {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...(cookie ? { 'Set-Cookie': cookie } : {}),
      });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    serveStatic(req, res, decodeURIComponent(url.pathname));
  } catch (e) {
    if (e instanceof HttpError) {
      return send(res, e.status, JSON.stringify({ error: e.message, ...(e.extra || {}) }), { 'Content-Type': 'application/json; charset=utf-8' });
    }
    console.error(e);
    send(res, 500, JSON.stringify({ error: 'Erro interno. Tente novamente.' }), { 'Content-Type': 'application/json; charset=utf-8' });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.PORT) || 3000;
  http.createServer(handler).listen(port, () => console.log(`Vyllorri Beauty rodando em http://localhost:${port}`));
}
