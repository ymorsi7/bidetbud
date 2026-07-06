#!/usr/bin/env node
/**
 * Geocode data/toto-try-washlet.json (from scrape-toto-try.cjs).
 * Photon first, Nominatim fallback, results cached so re-runs are cheap.
 *
 * Usage: node scripts/geocode-toto-try.cjs
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '../data/toto-try-washlet.json');
const CACHE = path.join(__dirname, '../data/toto-try-geocode-cache.json');

const COUNTRY_CODE = {
  Germany: 'de',
  France: 'fr',
  UK: 'gb',
  Switzerland: 'ch',
  Austria: 'at',
  Netherlands: 'nl',
  Luxembourg: 'lu',
  'Czech Republic': 'cz',
  Denmark: 'dk',
  Ireland: 'ie',
  Latvia: 'lv',
  Lithuania: 'lt',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  } catch {
    return {};
  }
}
function saveCache(c) {
  fs.writeFileSync(CACHE, JSON.stringify(c, null, 2));
}

async function geocodePhoton(query, cc) {
  const params = new URLSearchParams({ limit: '1', q: query });
  if (cc) params.set('osm_tag', ''); // no-op keeps URL stable if extended later
  const url = 'https://photon.komoot.io/api/?' + params.toString();
  const res = await fetch(url);
  const j = await res.json();
  const f = j.features?.[0];
  if (!f) return null;
  const [lon, lat] = f.geometry.coordinates;
  return { lat: String(lat), lon: String(lon) };
}

async function geocodeNominatim(query, cc) {
  const params = new URLSearchParams({ format: 'json', limit: '1', q: query });
  if (cc) params.set('countrycodes', cc);
  const url = 'https://nominatim.openstreetmap.org/search?' + params.toString();
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BidetBud/1.0 (github.com/bidetbud)' },
  });
  const j = await res.json();
  const hit = j[0];
  if (!hit) return null;
  return { lat: hit.lat, lon: hit.lon };
}

async function geocode(query, cc, cache) {
  if (query in cache) return cache[query];
  let result = null;
  try {
    result = await geocodePhoton(query, cc);
  } catch {}
  if (!result) {
    await sleep(1100);
    try {
      result = await geocodeNominatim(query, cc);
    } catch {}
  } else {
    await sleep(250);
  }
  cache[query] = result;
  saveCache(cache);
  return result;
}

async function main() {
  const rows = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const cache = loadCache();

  let done = 0;
  let ok = 0;
  let fail = 0;

  for (const row of rows) {
    done++;
    if (row.latitude && row.longitude) {
      ok++;
      continue;
    }
    const cc = COUNTRY_CODE[row.country];
    const query = [row.address, row.city, row.country].filter(Boolean).join(', ');
    const g = await geocode(query, cc, cache);
    if (g) {
      row.latitude = String(g.lat);
      row.longitude = String(g.lon);
      ok++;
    } else {
      fail++;
    }
    if (done % 25 === 0) {
      fs.writeFileSync(DATA, JSON.stringify(rows, null, 2) + '\n');
      console.log(`  ${done}/${rows.length} (ok ${ok}, fail ${fail})`);
    }
  }

  fs.writeFileSync(DATA, JSON.stringify(rows, null, 2) + '\n');
  console.log(`\nDone. Geocoded ${ok}/${rows.length}, ${fail} unresolved.`);
}

main();
