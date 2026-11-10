const { wrap, api, secret, seedMeta } = require('./_lib/run.cjs');

exports.handler = wrap(async (event) => api.handleSession({
  secret: secret(),
  ver: seedMeta().ver,
  headers: event.headers || {},
}));
