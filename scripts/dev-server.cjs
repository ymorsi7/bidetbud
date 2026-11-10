#!/usr/bin/env node
/**
 * Static file server + map API for local/e2e.
 * Uses sealed seed when MAP_SEED_KEY is set; otherwise plaintext local seed.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { ROOT, loadDotEnv, open, requireSeedKey } = require('./lib/map-seed-crypto.cjs');
const { buildPublicSeed, ENC_REL } = require('./lib/public-map-seed.cjs');
const { readSeed } = require('./lib/bidet-seed.cjs');
const api = require('./lib/map-api-core.cjs');

loadDotEnv();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function loadRows() {
  const encPath = path.join(ROOT, ENC_REL);
  try {
    const key = requireSeedKey();
    if (fs.existsSync(encPath)) return open(fs.readFileSync(encPath), key);
  } catch (_) { /* fall through */ }
  return buildPublicSeed(readSeed());
}

let ROWS = null;
function rows() {
  if (!ROWS) ROWS = loadRows();
  return ROWS;
}

function metaVer() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'netlify/functions/_data/map-meta.json'), 'utf8')).ver;
  } catch {
    return 'dev';
  }
}

function toEvent(req, url) {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = v;
  const queryStringParameters = {};
  url.searchParams.forEach((v, k) => { queryStringParameters[k] = v; });
  return { httpMethod: req.method, headers, queryStringParameters };
}

function send(res, result) {
  res.writeHead(result.statusCode || 200, result.headers || {});
  res.end(result.body || '');
}

function blockDump(pathname) {
  return pathname === '/bidet-seed.json'
    || pathname === '/bidet-seed.js'
    || pathname.startsWith('/data/');
}

async function handleApi(req, res, url) {
  const event = toEvent(req, url);
  const secret = process.env.MAP_SEED_KEY || 'local-dev-only-key-min-16';
  try {
    if (url.pathname === '/api/session') {
      return send(res, api.handleSession({ secret, ver: metaVer(), headers: event.headers }));
    }
    if (url.pathname === '/api/bootstrap') {
      return send(res, api.handleBootstrap({
        secret,
        ver: metaVer(),
        rows: rows(),
        headers: event.headers,
        ip: api.clientIp(event.headers),
      }));
    }
    const { ip } = api.requireAuthed(event, secret);
    if (url.pathname === '/api/meta') {
      api.rateLimit(`meta:${ip}`, { limit: 30, windowMs: 600000 });
      return send(res, api.handleMeta(rows(), metaVer()));
    }
    if (url.pathname === '/api/spots') {
      api.rateLimit(`spots:${ip}`, { limit: 90, windowMs: 600000 });
      return send(res, api.handleSpots(rows(), event));
    }
    if (url.pathname === '/api/search') {
      api.rateLimit(`search:${ip}`, { limit: 40, windowMs: 600000 });
      return send(res, api.handleSearch(rows(), event));
    }
    if (url.pathname === '/api/spot') {
      api.rateLimit(`spot:${ip}`, { limit: 60, windowMs: 600000 });
      return send(res, api.handleSpot(rows(), event));
    }
    return send(res, api.json(404, { error: 'not found' }));
  } catch (e) {
    return send(res, api.json(e.status || 500, { error: e.message || 'error' }));
  }
}

function serveStatic(req, res, pathname) {
  if (blockDump(pathname)) {
    res.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  const resolved = path.resolve(file);
  if (!resolved.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(resolved, (err, body) => {
    if (err) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(resolved)] || 'application/octet-stream' });
    res.end(body);
  });
}

function start(port = 8080) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
    return serveStatic(req, res, url.pathname);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${port}/`, port });
    });
  });
}

if (require.main === module) {
  const port = parseInt(process.env.PORT || '8080', 10);
  start(port).then(({ url }) => {
    console.log('BidetBud dev server', url, `(${rows().length} public spots)`);
  });
}

module.exports = { start };
