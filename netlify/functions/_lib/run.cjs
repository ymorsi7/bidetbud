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

function wrap(fn) {
  return async (event) => {
    try {
      if (event.httpMethod === 'OPTIONS') {
        return {
          statusCode: 204,
          headers: {
            'access-control-allow-credentials': 'true',
            'access-control-allow-headers': 'content-type',
            'access-control-allow-methods': 'GET,OPTIONS',
          },
          body: '',
        };
      }
      return await fn(event);
    } catch (e) {
      return api.json(e.status || 500, { error: e.message || 'error' });
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
