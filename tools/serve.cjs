// Lokální náhled: node za-kaplickou/tools/serve.cjs 8799
// Statické soubory + /api/* (stejné funkce jako na Vercelu) se souborovým úložištěm .data/store.json.
// Heslo do lokální administrace: proměnná ADMIN_PASSWORD, jinak LOCAL_ADMIN_PASSWORD ze souboru .env.local (není v gitu, jen pro localhost).
const http = require('http'), fs = require('fs'), path = require('path'), url = require('url');
const root = path.resolve(__dirname, '..'), port = +(process.argv[2] || 8799);
process.chdir(root);
// .env.local: řádky KLÍČ=hodnota, nepřepisují už nastavené proměnné
try { for (const l of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; } } catch {}
const LOCAL_ADMIN_PASSWORD = process.env.LOCAL_ADMIN_PASSWORD || '';
if (!process.env.ADMIN_PASSWORD && LOCAL_ADMIN_PASSWORD) process.env.ADMIN_PASSWORD = LOCAL_ADMIN_PASSWORD;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'local-dev-secret-' + LOCAL_ADMIN_PASSWORD;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.json': 'application/json', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };

async function api(req, res, p) {
  const file = path.join(root, p.replace(/\/$/, '') + '.js');
  if (!file.startsWith(path.join(root, 'api')) || path.basename(file).startsWith('_') || !fs.existsSync(file)) { res.writeHead(404); return res.end('{"error":"not found"}'); }
  let raw = '';
  for await (const c of req) raw += c;
  try { req.body = raw && (req.headers['content-type'] || '').includes('application/json') ? JSON.parse(raw) : raw; } catch { req.body = raw; }
  req.query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  try {
    const mod = await import(url.pathToFileURL(file).href + '?t=' + fs.statSync(file).mtimeMs);
    await mod.default(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message || e) })); }
  }
}

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p.startsWith('/api/')) return api(req, res, p);
  let f = path.join(root, p);
  if (!f.startsWith(root) || p.startsWith('/.data') || p.startsWith('/api')) { res.writeHead(403); return res.end(); }
  if (p.endsWith('/')) f = path.join(f, 'index.html');
  else if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log('Za Kapličkou: http://localhost:' + port + '  (administrace /admin)'));
