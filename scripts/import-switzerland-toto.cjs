#!/usr/bin/env node
/**
 * Import Switzerland TOTO "Try WASHLET" showrooms/dealers into BIDETBUD_SEED.
 * Source: https://eu.toto.com/en/service/try-washlettm (WASHLET-Finder)
 *
 * Rows live in data/switzerland-toto-finder.json. Each cites an explicit
 * WASHLET/NEOREST product, so they qualify as manufacturer-reference evidence.
 * Geocoded via Photon (Komoot) with a Nominatim fallback; cached to
 * data/switzerland-toto-geocode-cache.json.
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../index.html');
const dataPath = path.join(__dirname, '../data/switzerland-toto-finder.json');
const cachePath = path.join(__dirname, '../data/switzerland-toto-geocode-cache.json');

const SOURCE_URL = 'https://eu.toto.com/en/service/try-washlettm';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

async function geocodePhoton(query) {
  const url = 'https://photon.komoot.io/api/?limit=1&q=' + encodeURIComponent(query);
  const res = await fetch(url);
  const j = await res.json();
  const f = j.features?.[0];
  if (!f) return null;
  const [lon, lat] = f.geometry.coordinates;
  return { lat: String(lat), lon: String(lon) };
}

async function geocodeNominatim(query) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ch&q=' +
    encodeURIComponent(query);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BidetBud/1.0 (github.com/bidetbud)' },
  });
  const j = await res.json();
  const hit = j[0];
  return hit ? { lat: hit.lat, lon: hit.lon } : null;
}

async function geocode(query, cache) {
  if (cache[query]) return cache[query];
  let result = await geocodePhoton(query);
  if (result) {
    await sleep(300);
  } else {
    result = await geocodeNominatim(query);
    await sleep(1100);
  }
  cache[query] = result;
  saveCache(cache);
  return result;
}

function bidetType(product) {
  if (/NEOREST/i.test(product) && /WASHLET/i.test(product)) return 'TOTO WASHLET / NEOREST';
  if (/NEOREST/i.test(product)) return 'TOTO NEOREST';
  return 'TOTO WASHLET';
}

function dedupeKey(row) {
  return [
    row.name.toLowerCase(),
    Number(row.latitude).toFixed(4),
    Number(row.longitude).toFixed(4),
  ].join('|');
}

async function main() {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/window\.BIDETBUD_SEED\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    console.error('BIDETBUD_SEED not found');
    process.exit(1);
  }

  const existing = JSON.parse(match[1]);
  const finder = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const cache = loadCache();

  const seen = new Set(existing.map(dedupeKey));
  const merged = [...existing];
  let added = 0;
  let skipped = 0;

  for (const item of finder) {
    const geo = await geocode(item.address, cache);
    if (!geo || !geo.lat) {
      console.warn('No geocode:', item.name, '—', item.address);
      continue;
    }

    const quote = [item.product, item.productNote].filter(Boolean).join(' ');
    const row = {
      name: item.name,
      address: item.address,
      latitude: String(geo.lat),
      longitude: String(geo.lon),
      city: item.city,
      country: 'Switzerland',
      type: item.type || 'public',
      bidetStatus: 'warmed',
      bidetType: bidetType(item.product),
      sourceUrl: SOURCE_URL,
      sourceQuote: `TOTO Try WASHLET finder: ${quote}`,
      verifiedMethod: 'manufacturer-reference',
      access: item.access || 'public',
      ...(item.accessNote ? { accessNote: item.accessNote } : {}),
    };

    const key = dedupeKey(row);
    if (seen.has(key)) {
      skipped++;
      console.log('Skip (exists):', row.name);
      continue;
    }
    seen.add(key);
    merged.push(row);
    added++;
    console.log('Add:', row.name, `(${row.latitude}, ${row.longitude})`);
  }

  const newHtml = html.replace(
    /window\.BIDETBUD_SEED\s*=\s*\[[\s\S]*?\];/,
    `window.BIDETBUD_SEED = ${JSON.stringify(merged)};`
  );
  fs.writeFileSync(htmlPath, newHtml);

  const chCount = merged.filter((r) => r.country === 'Switzerland').length;
  console.log(`\nAdded ${added}, skipped ${skipped}. Switzerland rows now: ${chCount}.`);
  console.log(`Total seed entries: ${merged.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
