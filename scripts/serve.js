const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.resolve(__dirname, '../dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript; charset=UTF-8',
  '.mjs': 'text/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('500 Server Error: ' + err.message);
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  // Normalize URL
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Default to index.html if path ends with /
  if (pathname.endsWith('/')) {
    pathname += 'index.html';
  }

  let filePath = path.join(DIST_DIR, pathname);

  // Cek apakah file fisik ada
  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      return serveFile(res, filePath);
    }

    // Jika direktori tanpa trailing slash, redirect tambahkan /
    if (!err && stats.isDirectory()) {
      res.writeHead(302, { Location: parsedUrl.pathname + '/' });
      return res.end();
    }

    // SPA Routing Fallback sesuai aturan Cloudflare _redirects
    if (pathname.startsWith('/stockflow/')) {
      const stockflowIndex = path.join(DIST_DIR, 'stockflow/index.html');
      if (fs.existsSync(stockflowIndex)) {
        return serveFile(res, stockflowIndex);
      }
    }

    if (pathname.startsWith('/packing/')) {
      const packingIndex = path.join(DIST_DIR, 'packing/index.html');
      if (fs.existsSync(packingIndex)) {
        return serveFile(res, packingIndex);
      }
    }

    // Fallback ke Portal root
    const portalIndex = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(portalIndex)) {
      return serveFile(res, portalIndex);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('404 Not Found');
  });
});

server.listen(PORT, () => {
  console.log(`
======================================================
  🚀 WMS Super App Monorepo Local Server Ready!
======================================================
  • Portal & SSO Login : http://localhost:${PORT}/
  • StockFlow WMS      : http://localhost:${PORT}/stockflow/
  • Dokumentasi Packing: http://localhost:${PORT}/packing/
======================================================
  Tekan Ctrl+C untuk menghentikan server.
`);
});
