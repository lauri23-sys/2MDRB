const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 8000;

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

// Security headers sent on every response. These belong on the HTTP layer (a
// <meta> tag cannot enforce framing or MIME-sniffing protection). Mirror these
// on whatever hosts the app in production.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com",
  "worker-src 'self' blob: https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://cdnjs.cloudflare.com https://timeapi.io https://worldtimeapi.org",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',       // no MIME sniffing
  'X-Frame-Options': 'DENY',                 // clickjacking (legacy backstop for frame-ancestors)
  'Referrer-Policy': 'no-referrer',          // don't leak the URL to third parties
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
};

function send(res, status, body, extra = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...extra });
  res.end(body);
}

http.createServer((req, res) => {
  // Only GET/HEAD are served; this is a read-only static host.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { 'Allow': 'GET, HEAD' });
  }

  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
  catch { return send(res, 400, 'Bad Request'); }
  if (urlPath === '/') urlPath = '/index.html';

  // Resolve and confine to ROOT: reject any path that escapes the directory
  // (path traversal), using path.relative rather than a prefix string match.
  const filePath = path.resolve(ROOT, '.' + path.posix.normalize(urlPath));
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return send(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (statErr, st) => {
    if (statErr || !st.isFile()) return send(res, 404, 'Not found');
    fs.readFile(filePath, (err, data) => {
      if (err) return send(res, 404, 'Not found');
      const type = TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      send(res, 200, req.method === 'HEAD' ? '' : data, { 'Content-Type': type });
    });
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Serving ${ROOT}\n  → http://localhost:${PORT}`);
});
