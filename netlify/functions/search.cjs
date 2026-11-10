const { wrap, withAuth, api } = require('./_lib/run.cjs');

exports.handler = wrap(async (event) => {
  const { rows } = withAuth(event, 'search');
  return api.handleSearch(rows, event);
});
