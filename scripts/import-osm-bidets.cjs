#!/usr/bin/env node
/**
 * Import OpenStreetMap toilets that mappers explicitly tagged with a bidet.
 *
 * OSM records this under the toilets:* namespace — toilets:wash=bidet_spray
 * (handheld bidet shower), toilets:wash=washlet (electronic bidet seat), and the
 * older toilets:bidet=yes. Those tags are per-object bidet evidence, so they pass
 * the verification policy; everything else in amenity=toilets is ignored.
 *
 *   node scripts/import-osm-bidets.cjs            # fetch + merge
 *   node scripts/import-osm-bidets.cjs --fetch    # refresh data/osm-bidet-toilets.json only
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { mergeIntoSeed } = require('./lib/seed-merge.cjs');
const { isFriendlyCountry, normalizeCountry } = require('./lib/non-friendly-countries.cjs');

const RAW = path.join(__dirname, '../data/osm-bidet-toilets.json');
const GEOCODE_CACHE = path.join(__dirname, '../data/osm-geocode-cache.json');

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// amenity=toilets is indexed, so scoping to it keeps the query inside Overpass's
// timeout; an unscoped search on toilets:wash alone times out.
const QUERY = `[out:json][timeout:200];
(
  nwr["amenity"="toilets"]["toilets:wash"~"bidet|washlet"];
  nwr["amenity"="toilets"]["toilets:bidet"="yes"];
);
out center tags;`;

const BIDET_TYPE = {
  bidet_spray: 'Bidet shower (handheld sprayer)',
  bidet_shower: 'Bidet shower (handheld sprayer)',
  bidet: 'Bidet',
  washlet: 'Washlet (electronic bidet seat)',
};

function postOverpass(endpoint, query) {
  const body = `data=${encodeURIComponent(query)}`;
  return new Promise((resolve, reject) => {
    const req = https.request(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'BidetBud/1.0 (+https://bidetbud.com)',
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} from ${endpoint}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.setTimeout(260000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

async function fetchElements(attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    for (const endpoint of ENDPOINTS) {
      try {
        const json = await postOverpass(endpoint, QUERY);
        return json.elements || [];
      } catch (e) {
        lastError = e;
        process.stderr.write(`${endpoint}: ${e.message}\n`);
      }
    }
    // Overpass returns 504 when its slots are busy; back off and try again.
    await new Promise((r) => setTimeout(r, 20000 * (attempt + 1)));
  }
  throw lastError;
}

const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });

/** ISO-3166 alpha-2 to the seed's country label. */
function countryFromIso(iso) {
  if (!iso || iso.length !== 2) return null;
  try {
    return normalizeCountry(REGION_NAMES.of(iso));
  } catch {
    return null;
  }
}

/**
 * Most bidet-tagged toilets carry no addr:country, so resolve the country from the
 * point itself. Results are cached — Nominatim asks for one request per second.
 */
async function reverseCountries(points) {
  const cache = fs.existsSync(GEOCODE_CACHE)
    ? JSON.parse(fs.readFileSync(GEOCODE_CACHE, 'utf8'))
    : {};
  let fetched = 0;
  for (const { key, lat, lon } of points) {
    if (cache[key]) continue;
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'BidetBud/1.0 (+https://bidetbud.com)' },
      });
      const json = await res.json();
      cache[key] = {
        iso: String(json.address?.country_code || '').toUpperCase(),
        city: json.address?.city || json.address?.town || json.address?.village || '',
      };
      fetched++;
    } catch {
      cache[key] = { iso: '', city: '' };
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  if (fetched) fs.writeFileSync(GEOCODE_CACHE, JSON.stringify(cache, null, 2) + '\n');
  return cache;
}

function toRow(el, geo) {
  const tags = el.tags || {};
  const lat = el.lat != null ? el.lat : el.center && el.center.lat;
  const lon = el.lon != null ? el.lon : el.center && el.center.lon;
  if (lat == null || lon == null) return null;

  const iso = String(tags['addr:country'] || geo.iso || '').toUpperCase();
  const country = countryFromIso(iso) || normalizeCountry(tags['addr:country']);
  if (!country) return null;

  const wash = tags['toilets:wash'];
  const bidetType = BIDET_TYPE[wash] || (tags['toilets:bidet'] === 'yes' ? 'Bidet' : null);
  if (!bidetType) return null;

  const tag = wash ? `toilets:wash=${wash}` : 'toilets:bidet=yes';
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const city = tags['addr:city'] || tags['addr:suburb'] || geo.city || '';

  return {
    name: tags.name || tags.operator || `Public toilets${city ? ` — ${city}` : ''}`,
    address: [street, tags['addr:postcode'], city].filter(Boolean).join(', '),
    latitude: String(lat),
    longitude: String(lon),
    city,
    country,
    type: 'public',
    bidetStatus: 'internet',
    bidetType,
    sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    sourceQuote: `OpenStreetMap tag ${tag} — ${bidetType.toLowerCase()} available in this toilet`,
    verifiedMethod: 'community-sighting',
    access: tags.access === 'private' || tags.access === 'customers' ? 'limited' : 'public',
    ...(tags.access === 'customers' ? { accessNote: 'Customers only' } : {}),
  };
}

async function main() {
  const elements = await fetchElements();
  fs.writeFileSync(RAW, JSON.stringify(elements, null, 2) + '\n');
  console.log(`Fetched ${elements.length} bidet-tagged OSM toilets -> ${RAW}`);
  if (process.argv.includes('--fetch')) return;

  const points = elements
    .map((el) => ({
      key: `${el.type}/${el.id}`,
      lat: el.lat != null ? el.lat : el.center && el.center.lat,
      lon: el.lon != null ? el.lon : el.center && el.center.lon,
    }))
    .filter((p) => p.lat != null);
  const geocoded = await reverseCountries(points);

  const candidates = elements
    .map((el) => toRow(el, geocoded[`${el.type}/${el.id}`] || {}))
    .filter(Boolean);
  const existing = readSeed();
  const { merged, added, skipped } = mergeIntoSeed(existing, candidates, {
    accept: (row) => !isFriendlyCountry(row.country),
  });

  writeSeed(merged);
  console.log(`OSM import: +${added} new (${skipped} skipped, ${candidates.length} mappable).`);
  console.log(`Total seed entries: ${merged.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
