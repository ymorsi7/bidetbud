/**
 * Shared handlers for the local dev API and Netlify functions.
 */
const crypto = require('crypto');
const {
  countryCounts,
  spotsInBBox,
  nearestSpots,
} = require('./public-map-seed.cjs');

function json(status, body, headers = {}) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function makeSessionToken(secret, ttlSec = 60 * 60 * 12) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const nonce = crypto.randomBytes(8).toString('base64url');
  const payload = `v1.${exp}.${nonce}`;
  return `${payload}.${sign(payload, secret)}`;
}

function verifySessionToken(token, secret) {
  if (!token || !secret) return false;
  const parts = String(token).split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const payload = parts.slice(0, 3).join('.');
  const sig = parts[3];
  const expect = sign(payload, secret);
  if (!timingSafeEqualStr(sig, expect)) return false;
  const exp = parseInt(parts[1], 10);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  return true;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function clientIp(headers) {
  const xf = headers['x-forwarded-for'] || headers['X-Forwarded-For'] || '';
  if (xf) return String(xf).split(',')[0].trim();
  return headers['client-ip'] || headers['x-nf-client-connection-ip'] || '0.0.0.0';
}

function allowedOrigin(origin, host) {
  if (!origin || origin === 'null') return false;
  try {
    const u = new URL(origin);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    if (u.hostname === 'bidetbud.com' || u.hostname.endsWith('.bidetbud.com')) return true;
    // Capacitor iOS (capacitor://localhost) / Android (https://localhost).
    if (u.protocol === 'capacitor:' && u.hostname === 'localhost') return true;
    if (host && u.host === host) return true;
    return false;
  } catch {
    return false;
  }
}

function assertBrowserRequest(headers, { sessionOk }) {
  const origin = headers.origin || headers.Origin || '';
  const host = headers.host || headers.Host || '';
  const site = headers['sec-fetch-site'] || headers['Sec-Fetch-Site'] || '';
  if (sessionOk && (site === 'same-origin' || site === 'same-site' || site === 'none')) return;
  if (origin && allowedOrigin(origin, host)) return;
  // Capacitor / file WebViews often omit Origin; require a valid session cookie.
  if (sessionOk && !origin) return;
  const err = new Error('Forbidden');
  err.status = 403;
  throw err;
}

/** In-memory rate limit (best-effort per isolate). */
const buckets = new Map();

function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start > windowMs) {
    b = { start: now, n: 0 };
    buckets.set(key, b);
  }
  b.n += 1;
  if (b.n > limit) {
    const err = new Error('Rate limit');
    err.status = 429;
    throw err;
  }
}

function normalizeQ(q) {
  return String(q || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchRows(rows, q, { country = '', limit = 40 } = {}) {
  const nq = normalizeQ(q);
  if (nq.length < 2 && !country) return [];
  const tokens = nq ? nq.split(' ').filter(Boolean) : [];
  const out = [];
  for (const r of rows) {
    if (country && r.country !== country) continue;
    if (tokens.length) {
      const hay = normalizeQ([r.name, r.city, r.country, r.address, r.searchAliases].filter(Boolean).join(' '));
      if (!tokens.every((t) => hay.includes(t))) continue;
    }
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

function isCapacitorOrigin(headers) {
  const origin = headers.origin || headers.Origin || '';
  try {
    const u = new URL(origin);
    return u.protocol === 'capacitor:' ||
      ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') &&
        u.protocol === 'https:');
  } catch {
    return false;
  }
}

function sessionCookie(secret, headers) {
  const token = makeSessionToken(secret);
  const isLocal = /localhost|127\.0\.0\.1/i.test(headers.host || '');
  const crossNative = isCapacitorOrigin(headers);
  return [
    `bb_s=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    // Native WebView is cross-site to bidetbud.com; Lax would drop the cookie.
    crossNative ? 'SameSite=None' : 'SameSite=Lax',
    `Max-Age=${60 * 60 * 12}`,
    (!isLocal || crossNative) ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function corsHeaders(headers) {
  const origin = headers.origin || headers.Origin || '';
  if (!origin || !allowedOrigin(origin, headers.host || headers.Host || '')) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'vary': 'Origin',
  };
}

function handleSession({ secret, ver, headers }) {
  return json(200, { ok: true, ver }, {
    'set-cookie': sessionCookie(secret, headers),
    ...corsHeaders(headers),
  });
}

/** One-shot boot: session cookie + full public pin set (no evidence fields). */
function handleBootstrap({ secret, ver, rows, headers, ip }) {
  rateLimit(`bootstrap:${ip || clientIp(headers)}`, { limit: 30, windowMs: 60 * 60 * 1000 });
  const site = String(headers['sec-fetch-site'] || headers['Sec-Fetch-Site'] || '').toLowerCase();
  // First paint from the site itself (no cookie yet). Block bare curl dumps.
  if (site === 'same-origin' || site === 'same-site') {
    /* ok */
  } else {
    assertBrowserRequest(headers, { sessionOk: false });
  }
  return json(200, {
    ok: true,
    ver,
    total: rows.length,
    countries: countryCounts(rows),
    spots: rows,
  }, {
    'set-cookie': sessionCookie(secret, headers),
    ...corsHeaders(headers),
  });
}

function requireAuthed(event, secret) {
  const headers = event.headers || {};
  const cookies = parseCookies(headers.cookie || headers.Cookie || '');
  const sessionOk = verifySessionToken(cookies.bb_s, secret);
  assertBrowserRequest(headers, { sessionOk });
  if (!sessionOk) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  const ip = clientIp(headers);
  return { headers, ip, cookies };
}

function handleMeta(rows, ver) {
  return json(200, {
    ver,
    total: rows.length,
    countries: countryCounts(rows),
  });
}

function handleSpots(rows, event) {
  const q = event.queryStringParameters || {};
  const west = parseFloat(q.west);
  const south = parseFloat(q.south);
  const east = parseFloat(q.east);
  const north = parseFloat(q.north);
  const z = parseInt(q.z || '10', 10) || 10;
  if (![west, south, east, north].every(Number.isFinite)) {
    return json(400, { error: 'bbox required' });
  }
  // Hard caps: low zoom cannot dump the world.
  let limit = 350;
  if (z <= 4) limit = 80;
  else if (z <= 6) limit = 150;
  else if (z <= 8) limit = 250;
  let spots = spotsInBBox(rows, { west, south, east, north, limit });
  let fallback = false;
  if (!spots.length) {
    // Empty ocean / sparse view: nearest pins to the map center (still capped).
    spots = nearestSpots(rows, (south + north) / 2, (west + east) / 2, Math.min(limit, 80));
    fallback = true;
  }
  return json(200, { spots, capped: !fallback && spots.length >= limit, fallback, z });
}

function handleSearch(rows, event) {
  const q = event.queryStringParameters || {};
  const query = q.q || '';
  const country = q.country || '';
  const limit = Math.min(60, Math.max(1, parseInt(q.limit || '40', 10) || 40));
  if (normalizeQ(query).length < 2 && !country) {
    return json(400, { error: 'q required' });
  }
  return json(200, { spots: searchRows(rows, query, { country, limit }) });
}

function handleSpot(rows, event) {
  const id = (event.queryStringParameters || {}).id || '';
  if (!id) return json(400, { error: 'id required' });
  const spot = rows.find((r) => r.id === id);
  if (!spot) return json(404, { error: 'not found' });
  return json(200, { spot });
}

module.exports = {
  json,
  makeSessionToken,
  verifySessionToken,
  parseCookies,
  clientIp,
  rateLimit,
  allowedOrigin,
  corsHeaders,
  handleSession,
  handleBootstrap,
  requireAuthed,
  handleMeta,
  handleSpots,
  handleSearch,
  handleSpot,
  searchRows,
  assertBrowserRequest,
};
