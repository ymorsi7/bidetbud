/**
 * Auth edge cases for /api/bootstrap (especially CapacitorHttp with no Origin).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const api = require('./lib/map-api-core.cjs');

const SECRET = 'test-map-seed-key-for-unit-tests';
const rows = [
  {
    id: 'seed_test1',
    name: 'Test Masjid',
    latitude: '37.0',
    longitude: '-122.0',
    bidetStatus: 'verified',
    type: 'mosque',
    access: 'public',
    country: 'USA',
  },
];

describe('map-api-core bootstrap auth', () => {
  it('allows same-origin browser first paint without a session', () => {
    const res = api.handleBootstrap({
      secret: SECRET,
      ver: 't1',
      rows,
      headers: {
        'sec-fetch-site': 'same-origin',
        origin: 'https://bidetbud.com',
        host: 'bidetbud.com',
      },
      ip: '1.1.1.1',
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.spots.length, 1);
  });

  it('rejects bare curl (no origin, no session)', () => {
    assert.throws(
      () =>
        api.handleBootstrap({
          secret: SECRET,
          ver: 't1',
          rows,
          headers: { host: 'bidetbud.com' },
          ip: '1.1.1.2',
        }),
      (err) => err && err.status === 403
    );
  });

  it('allows Capacitor Origin without a prior cookie', () => {
    const res = api.handleBootstrap({
      secret: SECRET,
      ver: 't1',
      rows,
      headers: {
        origin: 'capacitor://localhost',
        host: 'bidetbud.com',
        'sec-fetch-site': 'cross-site',
      },
      ip: '1.1.1.3',
    });
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers['set-cookie'] || ''), /SameSite=None/);
  });

  it('allows no-Origin CapHttp when Bearer session token is present', () => {
    const sess = api.handleSession({
      secret: SECRET,
      ver: 't1',
      headers: { origin: 'capacitor://localhost', host: 'bidetbud.com' },
    });
    const token = JSON.parse(sess.body).token;
    assert.ok(token);

    const res = api.handleBootstrap({
      secret: SECRET,
      ver: 't1',
      rows,
      headers: {
        host: 'bidetbud.com',
        'sec-fetch-site': 'cross-site',
        authorization: 'Bearer ' + token,
      },
      ip: '1.1.1.4',
    });
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).spots.length, 1);
  });

  it('allows no-Origin CapHttp when X-BB-S session token is present', () => {
    const sess = api.handleSession({
      secret: SECRET,
      ver: 't1',
      headers: { origin: 'capacitor://localhost', host: 'bidetbud.com' },
    });
    const token = JSON.parse(sess.body).token;
    const res = api.handleBootstrap({
      secret: SECRET,
      ver: 't1',
      rows,
      headers: {
        host: 'bidetbud.com',
        'sec-fetch-site': 'cross-site',
        'x-bb-s': token,
      },
      ip: '1.1.1.5',
    });
    assert.equal(res.statusCode, 200);
  });

  it('session JSON includes a usable token', () => {
    const sess = api.handleSession({
      secret: SECRET,
      ver: '20261124a',
      headers: { origin: 'https://bidetbud.com', host: 'bidetbud.com' },
    });
    const body = JSON.parse(sess.body);
    assert.equal(body.ok, true);
    assert.equal(body.ver, '20261124a');
    assert.equal(typeof body.token, 'string');
    assert.ok(body.token.startsWith('v1.'));
  });
});
