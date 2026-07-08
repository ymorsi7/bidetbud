#!/usr/bin/env node
/**
 * Import Netherlands "Try WASHLET" locations into BIDETBUD_SEED.
 * Source: https://eu.toto.com/en/service/try-washlettm
 *
 * Rows live in data/netherlands-toto-finder.json (street/postcode/city/product).
 * Coordinates are geocoded via Nominatim and cached in
 * data/netherlands-geocode-cache.json. Manual overrides win when present.
 *
 * All rows get bidetStatus "warmed" + verifiedMethod "manufacturer-reference".
 * Re-running replaces prior try-washlettm rows to avoid stale duplicates.
 */
const fs = require('fs');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const path = require('path');
const https = require('https');

const dataPath = path.join(__dirname, '../data/netherlands-toto-finder.json');
const cachePath = path.join(__dirname, '../data/netherlands-geocode-cache.json');

const SOURCE_URL = 'https://eu.toto.com/en/service/try-washlettm';

// Hand-verified coordinate fallbacks (keyed by name) for stubborn geocodes.
const MANUAL = {
  'Sofitel Amsterdam': { latitude: '52.3728', longitude: '4.8977' },
};

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        { headers: { 'User-Agent': 'BidetBud/1.0 (bidet map data import)' } },
        (res) => {
          let d = '';
          res.on('data', (c) => (d += c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(d));
            } catch (e) {
              reject(e);
            }
          });
        }
      )
      .on('error', reject);
  });
}

async function geocode(row, cache) {
  const key = `${row.street}, ${row.postcode} ${row.city}, Netherlands`;
  if (MANUAL[row.name]) return MANUAL[row.name];
  if (cache[key]) return cache[key];

  // Try full address, then postcode + city, then city.
  const queries = [
    `${row.street}, ${row.postcode} ${row.city}, Netherlands`,
    `${row.postcode} ${row.city}, Netherlands`,
    `${row.city}, Netherlands`,
  ];
  for (const q of queries) {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=nl&q=' +
      encodeURIComponent(q);
    try {
      const res = await fetchJson(url);
      await sleep(1100); // Nominatim rate limit: max 1 req/sec
      if (Array.isArray(res) && res[0]) {
        const coord = {
          latitude: String(Number(res[0].lat).toFixed(7)),
          longitude: String(Number(res[0].lon).toFixed(7)),
        };
        cache[key] = coord;
        saveCache(cache);
        return coord;
      }
    } catch (e) {
      console.warn('  geocode error for', q, '-', e.message);
    }
  }
  return null;
}

function toSeedRow(row, coord) {
  return {
    name: row.name,
    address: `${row.street}, ${row.postcode} ${row.city}, Netherlands`,
    latitude: coord.latitude,
    longitude: coord.longitude,
    city: row.city,
    country: 'Netherlands',
    type: row.type || 'public',
    bidetStatus: 'warmed',
    bidetType: (row.product.match(/(WASHLET|NEOREST)[^,]*/i) || [
      'TOTO WASHLET',
    ])[0].trim(),
    sourceUrl: SOURCE_URL,
    sourceQuote: `TOTO Try WASHLET location: ${row.product}`,
    verifiedMethod: 'manufacturer-reference',
    access: 'limited',
    accessNote:
      row.type === 'hotel'
        ? 'Hotel guests and patrons'
        : 'Showroom — try a WASHLET on display (verify access)',
  };
}

async function main() {
      if (!match) {
    console.error('BIDETBUD_SEED not found');
    process.exit(1);
  }

  const existing = readSeed();
  const rows = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const cache = loadCache();

  // Drop prior try-washlettm rows so re-runs stay idempotent.
  const withoutFinder = existing.filter((r) => r.sourceUrl !== SOURCE_URL);

  const seen = new Set(
    withoutFinder.map((r) =>
      `${(r.name || '').toLowerCase()}|${Number(r.latitude).toFixed(4)}|${Number(
        r.longitude
      ).toFixed(4)}`
    )
  );

  let added = 0;
  const merged = [...withoutFinder];
  for (const row of rows) {
    const coord = await geocode(row, cache);
    if (!coord) {
      console.warn('SKIP (no coords):', row.name);
      continue;
    }
    const seedRow = toSeedRow(row, coord);
    const key = `${seedRow.name.toLowerCase()}|${Number(
      seedRow.latitude
    ).toFixed(4)}|${Number(seedRow.longitude).toFixed(4)}`;
    if (seen.has(key)) {
      console.log('DUP (skipped):', seedRow.name);
      continue;
    }
    seen.add(key);
    merged.push(seedRow);
    added++;
    console.log('+', seedRow.name, '→', coord.latitude, coord.longitude);
  }

  writeSeed(merged);

  console.log(`\nAdded ${added} Netherlands TOTO Try WASHLET locations.`);
  console.log(`Total seed entries: ${merged.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
