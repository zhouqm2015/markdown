'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(root, normalized);
  if (!full.startsWith(root)) return null;
  return full;
}

const server = http.createServer((req, res) => {
  const [pathname, query = ''] = (req.url || '/').split('?');
  const qs = query ? `?${query}` : '';

  // 官网落地页
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(302, { Location: `/index/${qs}` });
    res.end();
    return;
  }

  // 目录无尾斜杠时重定向，避免 ./app.js 解析到站点根路径
  if (pathname !== '/' && !pathname.endsWith('/') && !path.extname(pathname)) {
    const dirPath = safeJoin(ROOT, pathname);
    if (dirPath && fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      res.writeHead(301, { Location: `${pathname}/${qs}` });
      res.end();
      return;
    }
  }

  let urlPath = pathname;
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const filePath = safeJoin(ROOT, urlPath);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.readFile(filePath, (readErr, data) => {
    if (readErr) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Markdown 工具集已启动`);
  console.log(`  官网:       http://localhost:${PORT}/index/`);
  console.log(`  编辑器:     http://localhost:${PORT}/mdEditor/`);
  console.log(`  公众号排版: http://localhost:${PORT}/WeChatFormatter/`);
});
