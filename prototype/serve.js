#!/usr/bin/env node
/* NovaSchool OS — redesign prototype preview server.
   Serves the prototype pages and forwards /api/* to the app you already run
   locally (default http://localhost:3000). It adds nothing to the app, stores
   nothing and needs no packages.

     node prototype/serve.js                      # sample data only, port 4000
     APP_URL=http://localhost:3001 node prototype/serve.js

   Never point APP_URL at the live site: the prototype is for local review. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PROTO_PORT || 4000);
const APP_URL = new URL(process.env.APP_URL || 'http://localhost:3000');
const ROOT = __dirname;

if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(APP_URL.hostname) && process.env.PROTO_ALLOW_REMOTE !== 'yes') {
  console.error(`Refusing APP_URL ${APP_URL.origin}: the prototype only talks to a local app. ` +
    'Set PROTO_ALLOW_REMOTE=yes only for a rehearsal copy you own, never production.');
  process.exit(1);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/plain; charset=utf-8' };
// Same kind of policy we recommend for the main app (risk R1): no inline
// script, scripts only from this origin, API calls only to this origin.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function send(res, code, body, type, extra) {
  res.writeHead(code, Object.assign({ 'Content-Type': type || 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': CSP }, extra || {}));
  res.end(body);
}

function proxy(req, res) {
  const target = new URL(req.url, APP_URL);
  const headers = Object.assign({}, req.headers, { host: APP_URL.host });
  delete headers.cookie; // the prototype uses bearer tokens only
  const up = http.request(target, { method: req.method, headers }, (r) => {
    const h = Object.assign({}, r.headers); delete h['set-cookie'];
    res.writeHead(r.statusCode, h);
    r.pipe(res);
  });
  up.on('error', () => send(res, 502, JSON.stringify({ error: `The NovaSchool app is not running at ${APP_URL.origin}. Start it, or use sample data.` }), 'application/json'));
  req.pipe(up);
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) return proxy(req, res);
  if (u.pathname === '/proto-config.js') {
    return send(res, 200, `window.NovaProtoConfig=${JSON.stringify({ appUrl: APP_URL.origin + '/' })};`, TYPES['.js'], { 'Cache-Control': 'no-store' });
  }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep) || p.includes('serve.js')) return send(res, 404, 'Not found');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, buf, TYPES[path.extname(file)] || 'application/octet-stream', { 'Cache-Control': 'no-cache' });
  });
}).listen(PORT, () => {
  console.log(`NovaSchool OS prototype: http://localhost:${PORT}/`);
  console.log(`API requests go to: ${APP_URL.origin} (sample data is used until you sign in)`);
});
