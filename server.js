'use strict';
/**
 * Espeto & Breja — servidor web (Render)
 * - Serve as páginas estáticas de /public
 * - Rotas amigáveis: /login, /cadastro, /painel, /cardapio/:slug ...
 * - Entrega /config.js com a URL do Supabase e a chave PÚBLICA (anon/publishable)
 * - Recusa iniciar se receber uma chave secreta (service_role / sb_secret_)
 * Sem dependências externas: apenas módulos nativos do Node.js.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- Validação das variáveis de ambiente ----------
function fail(msg) {
  console.error(`\n[ERRO DE CONFIGURAÇÃO] ${msg}\n`);
  process.exit(1);
}
if (!SUPABASE_URL || !/^https:\/\/[a-z0-9.-]+$/i.test(SUPABASE_URL)) {
  fail('Defina SUPABASE_URL (ex.: https://xxxx.supabase.co).');
}
if (!SUPABASE_ANON_KEY) fail('Defina SUPABASE_ANON_KEY (chave anon / publishable).');
if (SUPABASE_ANON_KEY.startsWith('sb_secret_')) {
  fail('SUPABASE_ANON_KEY contém uma chave SECRETA. Use a chave publishable/anon.');
}
if (SUPABASE_ANON_KEY.split('.').length === 3) {
  try {
    const payload = JSON.parse(Buffer.from(SUPABASE_ANON_KEY.split('.')[1], 'base64url').toString());
    if (payload.role && payload.role !== 'anon') {
      fail(`SUPABASE_ANON_KEY tem role "${payload.role}". Nunca use a service_role no front-end.`);
    }
  } catch { /* chave em outro formato: segue */ }
}

const supabaseOrigin = new URL(SUPABASE_URL).origin;
const supabaseWs = supabaseOrigin.replace(/^https/, 'wss');

const CONFIG_JS =
  `window.APP_CONFIG = Object.freeze(${JSON.stringify({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY })});\n`;

// ---------- Cabeçalhos de segurança ----------
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`,
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const BASE_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Frame-Options': 'SAMEORIGIN',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Rotas amigáveis -> arquivos HTML
const PAGES = {
  '/': 'index.html',
  '/login': 'login.html',
  '/cadastro': 'cadastro.html',
  '/recuperar-senha': 'recuperar-senha.html',
  '/nova-senha': 'nova-senha.html',
  '/painel': 'painel.html',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...BASE_HEADERS, ...headers });
  res.end(body);
}

function sendFile(res, filePath, status = 200) {
  fs.readFile(filePath, (err, data) => {
    if (err) return notFound(res);
    const ext = path.extname(filePath).toLowerCase();
    const isHtml = ext === '.html';
    send(res, status, data, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=3600',
    });
  });
}

function notFound(res) {
  sendFile(res, path.join(PUBLIC_DIR, '404.html'), 404);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Método não permitido', { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Requisição inválida', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');

  if (pathname === '/health') {
    return send(res, 200, JSON.stringify({ ok: true }), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  }
  if (pathname === '/config.js') {
    return send(res, 200, CONFIG_JS, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' });
  }
  if (PAGES[pathname]) return sendFile(res, path.join(PUBLIC_DIR, PAGES[pathname]));

  // /cardapio/<slug>
  if (/^\/cardapio\/[a-z0-9]+(-[a-z0-9]+)*$/.test(pathname)) {
    return sendFile(res, path.join(PUBLIC_DIR, 'cardapio.html'));
  }

  // Arquivos estáticos (bloqueia travessia de diretórios e acesso direto a .html)
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) || filePath.endsWith('.html')) return notFound(res);
  fs.stat(filePath, (err, st) => (err || !st.isFile() ? notFound(res) : sendFile(res, filePath)));
});

server.listen(PORT, () => {
  console.log(`Espeto & Breja rodando na porta ${PORT}`);
});
