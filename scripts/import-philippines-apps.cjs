#!/usr/bin/env node
/**
 * Import Philippines community listings from Happy Bidet and San Bidet apps.
 *
 * Source: screenshots of the apps (data/philippines-app-listings.json).
 * Each row cites which app it came from in sourceQuote (shown as the review/
 * comments excerpt). Bidet and no-bidet rows are both imported.
 *
 *   node scripts/import-philippines-apps.cjs
 */
const fs = require('fs');
const path = require('path');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { inferType } = require('./lib/infer-type.cjs');

const LIST_PATH = path.join(__dirname, '../data/philippines-app-listings.json');
const CACHE_PATH = path.join(__dirname, '../data/philippines-geocode-cache.json');
const HAPPY_URL = 'https://apps.apple.com/ph/app/happy-bidet/id6745689326';
const SAN_URL = 'https://www.rappler.com/culture-desk/220879-san-bidet-app/';

function normName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '');
}

function round5(n) {
  return Number(n).toFixed(5);
}

function coordKey(lat, lng) {
  return `${round5(lat)}|${round5(lng)}`;
}

function nameKey(name) {
  return normName(name);
}

function isNear(a, b, deg = 0.008) {
  return (
    Math.abs(Number(a.latitude) - Number(b.latitude)) < deg &&
    Math.abs(Number(a.longitude) - Number(b.longitude)) < deg
  );
}

function samePlace(a, b) {
  if (!a || !b) return false;
  const na = nameKey(a.name);
  const nb = nameKey(b.name);
  if (na && na === nb) {
    if (!a.latitude || !b.latitude) return true;
    return isNear(a, b, 0.04);
  }
  if (na.length >= 10 && nb.length >= 10 && (na.includes(nb) || nb.includes(na))) {
    return isNear(a, b, 0.015);
  }
  if (a.latitude && b.latitude && coordKey(a.latitude, a.longitude) === coordKey(b.latitude, b.longitude)) {
    const min = Math.min(na.length, nb.length);
    if (min >= 6 && (na.slice(0, 6) === nb.slice(0, 6))) return true;
  }
  return false;
}

function buildQuote(row) {
  const bits = [row.app + ' app'];
  if (row.bidet === false) bits.push('No bidet');
  else bits.push('Bidet');
  if (row.note) bits.push(row.note);
  if (row.discoveredBy) bits.push('Discovered by ' + row.discoveredBy);
  return bits.join('. ').slice(0, 220);
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function geocodeNominatim(q) {
  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      format: 'jsonv2',
      limit: '1',
      countrycodes: 'ph',
      q,
    });
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BidetBud/1.0 (philippines community import)' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < 4.2 || lat > 21.3 || lon < 116.8 || lon > 127) return null;
  return { lat, lon };
}

async function geocodePhoton(q) {
  const url =
    'https://photon.komoot.io/api/?' +
    new URLSearchParams({ q, limit: '1' });
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BidetBud/1.0 (philippines community import)' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const feat = data && data.features && data.features[0];
  const coords = feat && feat.geometry && feat.geometry.coordinates;
  if (!coords) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < 4.2 || lat > 21.3 || lon < 116.8 || lon > 127) return null;
  return { lat, lon };
}

async function geocode(row, cache) {
  if (row.latitude && row.longitude) {
    return { lat: Number(row.latitude), lon: Number(row.longitude) };
  }
  const queries = [
    [row.name, row.address].filter(Boolean).join(', '),
    [row.name, row.city, 'Philippines'].filter(Boolean).join(', '),
    row.address,
  ].filter((q, i, arr) => q && arr.indexOf(q) === i);

  for (const q of queries) {
    if (cache[q]) return cache[q];
    let hit = await geocodeNominatim(q);
    if (!hit) {
      await sleep(1100);
      hit = await geocodePhoton(q);
    }
    cache[q] = hit;
    saveCache(cache);
    await sleep(1100);
    if (hit) return hit;
  }
  return null;
}

function toSeedRow(row, coords) {
  const type = inferType({ name: row.name, type: row.type });
  const hotelish = type === 'hotel' || /sogo|villa|resort/i.test(row.name);
  const access = row.access || (hotelish ? 'limited' : 'public');
  const quote = buildQuote(row);
  const aliases = [row.app, row.city, row.note, row.discoveredBy].filter(Boolean).join(' ');
  return {
    name: row.name,
    address: row.address || '',
    latitude: String(coords.lat),
    longitude: String(coords.lon),
    city: row.city || 'Philippines',
    country: 'Philippines',
    type,
    bidetStatus: row.bidet === false ? 'none' : 'internet',
    bidetType: row.bidet === false ? '' : 'Handheld sprayer',
    sourceUrl: row.app === 'San Bidet' ? SAN_URL : HAPPY_URL,
    sourceQuote: quote,
    verifiedMethod: 'community-sighting',
    searchAliases: aliases,
    access,
    ...(access === 'limited'
      ? { accessNote: row.accessNote || 'Not a regular public restroom' }
      : {}),
  };
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(LIST_PATH, 'utf8'));
  const listings = Array.isArray(raw.listings) ? raw.listings : [];
  const cache = loadCache();
  const existing = readSeed();
  const incoming = [];
  let failed = 0;

  for (const row of listings) {
    if (/vietnam|ho chi minh/i.test([row.name, row.address, row.city].join(' '))) {
      console.log('skip non-PH', row.name);
      continue;
    }
    const coords = await geocode(row, cache);
    if (!coords) {
      console.warn('NO GEOCODE', row.name, row.address);
      failed++;
      continue;
    }
    incoming.push(toSeedRow(row, coords));
  }

  const uniqueIncoming = [];
  for (const row of incoming) {
    const dup = uniqueIncoming.find((e) => samePlace(e, row));
    if (dup) {
      if (dup.sourceQuote && row.sourceQuote && !dup.sourceQuote.includes(row.app || '')) {
        dup.sourceQuote = (dup.sourceQuote + ' / ' + row.sourceQuote).slice(0, 220);
      }
      continue;
    }
    uniqueIncoming.push(row);
  }

  const merged = [...existing];
  let added = 0;
  let skipped = 0;
  for (const row of uniqueIncoming) {
    if (merged.some((e) => samePlace(e, row))) {
      skipped++;
      continue;
    }
    merged.push(row);
    added++;
  }

  writeSeed(merged);
  console.log(
    JSON.stringify(
      {
        listed: listings.length,
        geocoded: incoming.length,
        unique: uniqueIncoming.length,
        added,
        skippedExisting: skipped,
        failedGeocode: failed,
        seed: merged.length,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
