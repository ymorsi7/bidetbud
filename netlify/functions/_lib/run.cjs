const api = require('../../../scripts/lib/map-api-core.cjs');
const { loadSeed, seedMeta } = require('./load-seed.cjs');

function secret() {
  const s = process.env.MAP_SEED_KEY;
  if (!s) {
    const err = new Error('MAP_SEED_KEY not configured');
    err.status = 503;
    throw err;
  }
  return s;
}

function withCors(event, result) {
  const headers = event.headers || {};
  const cors = api.corsHeaders(headers);
  if (!Object.keys(cors).length) return result;
  return {
    ...result,
    headers: { ...(result.headers || {}), ...cors },
  };
}

function wrap(fn) {
  return async (event) => {
    try {
      if (event.httpMethod === 'OPTIONS') {
        const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
        const allow = origin && api.allowedOrigin(origin, (event.headers && (event.headers.host || event.headers.Host)) || '');
        return {
          statusCode: 204,
          headers: {
            ...(allow ? {
              'access-control-allow-origin': origin,
              'access-control-allow-credentials': 'true',
              'vary': 'Origin',
            } : {}),
            'access-control-allow-headers': 'content-type',
            'access-control-allow-methods': 'GET,OPTIONS',
          },
          body: '',
        };
      }
      return withCors(event, await fn(event));
    } catch (e) {
      return withCors(event, api.json(e.status || 500, { error: e.message || 'error' }));
    }
  };
}

function withAuth(event, route) {
  const sec = secret();
  const { ip } = api.requireAuthed(event, sec);
  const limits = { spots: 90, search: 40, spot: 60, meta: 30 };
  api.rateLimit(`${route}:${ip}`, { limit: limits[route] || 40, windowMs: 10 * 60 * 1000 });
  return { secret: sec, rows: loadSeed(), meta: seedMeta(), ip };
}

module.exports = { wrap, withAuth, api, secret, loadSeed, seedMeta };
