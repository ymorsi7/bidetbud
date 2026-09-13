# HalalBud

Halal restaurant map (same stack as BidetBud). **Live:** [bidetbud.com/halal/](https://bidetbud.com/halal/)

| Path | Purpose |
|------|---------|
| `index.html` | App shell + inline map logic |
| `seed.json` / `seed.js` | Client seed (JSON fetched first, JS fallback) |
| `data/halal-restaurants.json` | Merged source of truth after imports |
| `data/*.json` | Crawler outputs (Zabihah, OSM, MUIS, etc.) |
| `scripts/` | Crawlers and `import-halal-all.cjs` |

After editing halal data:

```bash
node halal/scripts/import-halal-all.cjs
```

Full crawl pipeline:

```bash
node halal/scripts/crawl-halal-all.cjs --minutes=120
```
