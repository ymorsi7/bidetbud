# BidetBud

Community map of masajid and restaurants with bidets, washlets, and handheld sprayers — focused on the US, Canada, and the UK.

**Live site:** [bidetbud.com](https://bidetbud.com/)

## What it is

BidetBud is a static single-page app (no build step). Location data lives in `index.html` as `window.BIDETBUD_SEED`. Users can suggest new spots via the embedded Airtable form.

## Run locally

```bash
# from repo root
python3 -m http.server 8080
# open http://localhost:8080
```

Or use any static file server — do not open `index.html` as a `file://` URL (fetch/geojson may fail).

## Project layout

```
index.html              Main app + seed data
css/github-star.css     Footer link styles
images/                 Logo and favicons
scripts/
  apply-address-fixes.cjs   Re-geocode seed entries (>150m drift); manual overrides inside
  address-fix-report.json   Last script run output (optional)
```

## Adding or fixing locations

1. **Quick add:** append an object to the `BIDETBUD_SEED` array in `index.html`:

   ```js
   {
     "name": "Example Masjid",
     "address": "123 Main St, City, ST 12345",
     "latitude": "37.0000000",
     "longitude": "-122.0000000",
     "city": "City, ST",
     "country": "USA",
     "type": "mosque",
     "bidetStatus": "verified",
     "access": "public",
     "bidetType": "Bidet, Wudhu"
   }
   ```

   `bidetStatus` must be `verified`, `warmed`, or `internet` to appear on the map.

2. **Coordinate cleanup:** `node scripts/apply-address-fixes.cjs` (requires Node 18+ with `fetch`).

3. **User submissions:** collected via an Airtable form embedded directly in the "Suggest a verified spot" popup (an `<iframe>`, no new tab). Configure it in `index.html` via the `AIRTABLE_EMBED_URL` (iframe `src`) and `AIRTABLE_FORM_URL` constants. Submissions are reviewed before being added to `BIDETBUD_SEED`.

## Contributing

Pull requests welcome for new verified locations, coordinate fixes, and UI improvements. Please only add spots you have personally verified or that cite a clear public source (`bidetStatus: "internet"` + `sourceUrl`).

## License

MIT — see [LICENSE](LICENSE).
