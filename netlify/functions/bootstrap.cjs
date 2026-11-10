const { wrap, api, secret, loadSeed, seedMeta } = require('./_lib/run.cjs');

exports.handler = wrap(async (event) => {
  const headers = event.headers || {};
  const rows = loadSeed();
  const meta = seedMeta();
  return api.handleBootstrap({
    secret: secret(),
    ver: meta.ver,
    rows,
    headers,
    ip: api.clientIp(headers),
  });
});
