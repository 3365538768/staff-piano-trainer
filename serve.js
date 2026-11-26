// Optional stable localhost origin, using only Node built-ins. Double-clicking index.html also works.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.otf': 'font/otf', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch (_) { res.writeHead(400).end(); return; }
  if (pathname === '/') pathname = '/index.html';
  const target = path.resolve(root, '.' + pathname);
  const publicFiles = ['index.html', 'styles.css', 'music.js', 'learning.js', 'app.js'];
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || (!publicFiles.includes(relative) && !relative.startsWith('assets' + path.sep))) { res.writeHead(404).end('Not found'); return; }
  fs.readFile(target, (error, data) => { if (error) { res.writeHead(404).end('Not found'); return; } res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); });
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '端口已占用，请打开 http://127.0.0.1:49321，或使用 PORT 环境变量更换端口。' : error.message); process.exitCode = 1; });
server.listen(Number(process.env.PORT) || 49321, '127.0.0.1', () => console.log('谱间练习室：http://127.0.0.1:' + server.address().port));
