'use strict';
/**
 * Fetch the COMPLETE Geberit AquaClean "Hotel Locator" dataset (the ~495 venues
 * behind the interactive Google-Maps widget) and write seed-ready rows to
 * data/geberit-locator-hotels.json.
 *
 * The widget loads a single static JSON feed (identical across locale sites), so
 * no headless browser or geocoding is needed — every row already carries
 * coordinates, address, website and the installed AquaClean models.
 *
 *   node scripts/scrape-geberit-locator.cjs
 *
 * Then import into the seed with: node scripts/import-geberit-hotels.cjs
 */
const fs = require('fs');
const path = require('path');
const { fetchLocator, locatorRowToSeed } = require('./lib/geberit-web.cjs');

const OUT = path.join(__dirname, '..', 'data', 'geberit-locator-hotels.json');

async function main() {
  console.log('Fetching Geberit AquaClean Hotel Locator feed…');
  const { url, entries } = await fetchLocator();
  console.log(`  source: ${url}`);
  console.log(`  raw records: ${entries.length}`);

  const rows = [];
  const seen = new Set();
  let skippedNoCoords = 0;
  let skippedDup = 0;

  for (const raw of entries) {
    const row = locatorRowToSeed(raw);
    if (!row.name || !row.latitude || !row.longitude) {
      skippedNoCoords++;
      continue;
    }
    const key =
      row.name.toLowerCase().replace(/\s+/g, ' ').trim() +
      '|' +
      Number(row.latitude).toFixed(4) +
      ',' +
      Number(row.longitude).toFixed(4);
    if (seen.has(key)) {
      skippedDup++;
      continue;
    }
    seen.add(key);
    rows.push(row);
  }

  const byCountry = rows.reduce((a, r) => ((a[r.country] = (a[r.country] || 0) + 1), a), {});
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');

  console.log(`\nWrote ${rows.length} hotels -> ${path.relative(process.cwd(), OUT)}`);
  console.log(`  skipped (no coords/name): ${skippedNoCoords}`);
  console.log(`  skipped (in-feed dupes):  ${skippedDup}`);
  console.log('  by country:');
  for (const [c, n] of Object.entries(byCountry).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(4)}  ${c}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
