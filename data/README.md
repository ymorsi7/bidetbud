# Private data directory

This folder is **gitignored**. It holds research dumps, crawl state, and the full
seed (`bidet-restaurants.json`). Do not commit it.

The public site never serves these files. Map pins are published only as an
encrypted payload (`netlify/functions/_data/map-seed.enc`) via `npm run seal`,
and exposed through rate-limited `/api/*` endpoints.
