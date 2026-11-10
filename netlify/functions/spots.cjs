const { wrap, withAuth, api } = require('./_lib/run.cjs');

exports.handler = wrap(async (event) => {
  const { rows } = withAuth(event, 'spots');
  return api.handleSpots(rows, event);
});
