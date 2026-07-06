#!/usr/bin/env node
/**
 * Geocode data/geberit-hotels.json (from scrape-geberit-hotels.cjs).
 * Photon first, Nominatim fallback, constrained to each row's country code.
 * Results are cached in data/geberit-geocode-cache.json so re-runs are cheap.
 *
 * Usage: node scripts/geocode-geberit-hotels.cjs
 */
const fs = require('fs');
const path = require('path');
const { geocode } = require('./lib/geberit-web.cjs');

const DATA = path.join(__dirname, '../data/geberit-hotels.json');
const CACHE = path.join(__dirname, '../data/geberit-geocode-cache.json');

/**
 * Manual coordinate overrides for venues the geocoders miss or misplace
 * (verified against OpenStreetMap / the hotel's published address). Keyed by
 * the exact scraped hotel name; applied before the automatic geocoder.
 */
const MANUAL = {
  'Stadspaleis Hotel OldRuitenborgh': { lat: '52.6796029', lon: '5.9505909' },
  'Grand Boutique Hotel "Huis Vermeer"': { lat: '52.2511786', lon: '6.1550420' },
  'Restaurant & boutique hotel de Nederlanden': { lat: '52.2295042', lon: '5.0324517' },
  '"Bohemian Loft" im Radisson Blu, Köln': { lat: '50.9439400', lon: '6.9847553' },
  'RiKu Budget-Design Hotel, Pfullendorf': { lat: '47.9234777', lon: '9.2520080' },
  'The Darling': { lat: '55.6793000', lon: '12.5793000' },
};

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  } catch {
    return {};
  }
}
const saveCache = (c) => fs.writeFileSync(CACHE, JSON.stringify(c, null, 2));

async function main() {
  const rows = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const cache = loadCache();

  let done = 0;
  let ok = 0;
  let fail = 0;

  for (const row of rows) {
    done++;
    if (MANUAL[row.name]) {
      row.latitude = MANUAL[row.name].lat;
      row.longitude = MANUAL[row.name].lon;
      ok++;
      continue;
    }
    if (row.latitude && row.longitude) {
      ok++;
      continue;
    }
    // Query most-specific first; fall back to name + country only.
    const queries = [
      [row.name, row.region, row.country].filter(Boolean).join(', '),
      [row.name, row.country].filter(Boolean).join(', '),
    ];
    let g = null;
    for (const q of queries) {
      g = await geocode(q, row.cc, cache, saveCache);
      if (g) break;
    }
    if (g) {
      row.latitude = String(g.lat);
      row.longitude = String(g.lon);
      ok++;
    } else {
      fail++;
      console.warn('  unresolved:', row.name, `(${row.country})`);
    }
    if (done % 10 === 0) {
      fs.writeFileSync(DATA, JSON.stringify(rows, null, 2) + '\n');
      console.log(`  ${done}/${rows.length} (ok ${ok}, fail ${fail})`);
    }
  }

  fs.writeFileSync(DATA, JSON.stringify(rows, null, 2) + '\n');
  console.log(`\nDone. Geocoded ${ok}/${rows.length}, ${fail} unresolved.`);
}

main();
