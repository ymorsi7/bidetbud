exports.handler = async () => ({
  statusCode: 404,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify({ error: 'Not found' }),
});
