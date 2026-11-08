// A stand-in for the GitHub contents API, for tests only. Serves files from
// tests/fixtures/curriculum and checks the token, like GitHub would.
//   node tests/fixtures/mock-github.js <port> <token>
const http = require('http');
const fs = require('fs');
const path = require('path');

function start(port, token) {
  const root = path.join(__dirname, 'curriculum');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const m = url.pathname.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); return res.end('{"message":"Bad credentials"}'); }
    if (!m) { res.writeHead(404); return res.end(); }
    const rel = decodeURIComponent(m[1]);
    const abs = path.join(root, rel);
    if (!abs.startsWith(root + path.sep) || !fs.existsSync(abs)) { res.writeHead(404); return res.end('{"message":"Not Found"}'); }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(fs.readFileSync(abs));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (require.main === module) start(Number(process.argv[2]), process.argv[3]).then(() => console.log('mock github ready'));
module.exports = { start };
