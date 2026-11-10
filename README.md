# BidetBud

A free map of places with bidets: masajid, restaurants, hotels, and public restrooms.

**Live:** [bidetbud.com](https://bidetbud.com/)

Every pin needs real evidence that a bidet, washlet, or handheld sprayer is there. No guessing.

## What’s open source

The map UI, Netlify functions, and import scripts. **Location research data is not in this repo.**

- Browser never downloads a full seed dump
- Pins load through session-gated, rate-limited `/api/spots` (viewport) and `/api/search`
- Evidence fields (`sourceUrl`, `sourceQuote`, …) are stripped from the API payload
- Plaintext seed + `data/` stay on the maintainer machine (gitignored)

## Run locally (maintainer)

```bash
cp .env.example .env   # or rely on npm run seal to create MAP_SEED_KEY
npm run seal           # encrypts public pins → netlify/functions/_data/map-seed.enc
npm run dev            # http://127.0.0.1:8080  (static + API)
```

Set the same `MAP_SEED_KEY` in Netlify → Environment variables before deploy.

## Run locally (contributors without private data)

`bidet-seed.sample.json` is a tiny demo set. Without `MAP_SEED_KEY` + sealed payload, the API won’t serve production pins.

## Layout

```
index.html                 Map shell
js/app.js                  UI
js/map-api.js              Session + viewport/search client
netlify/functions/         /api/session|spots|search|spot|meta
scripts/seal-map-seed.cjs  Build encrypted API payload
bidet-seed.sample.json     Tiny public sample
data/                      Private (gitignored)
```

## License

MIT — see [LICENSE](LICENSE). Research datasets remain private.
