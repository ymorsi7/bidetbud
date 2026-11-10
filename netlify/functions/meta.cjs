const { wrap, withAuth, api } = require('./_lib/run.cjs');

exports.handler = wrap(async (event) => {
  const { rows, meta } = withAuth(event, 'meta');
  return api.handleMeta(rows, meta.ver);
});
