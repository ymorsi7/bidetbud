#!/usr/bin/env node
/**
 * Add leftover PUBLIC USA / UK pins with per-venue bidet evidence.
 *
 * 1. Atly sitemap leftovers (Kura city branches, % Arabica Nolita) - city-suffixed
 *    so same-name-in-country does not collapse chain locations.
 * 2. Live Atly fetch of Kura Revolving Sushi Bar location pages + hot US list pages.
 * 3. Optional OSM bidet-tagged toilets in GB / US (amenity=toilets only).
 *
 *   node scripts/import-public-uk-usa.cjs
 *   node scripts/import-public-uk-usa.cjs --skip-fetch
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const {
  fetchText,
  parseLocationPage,
  bidetVenueUrlsFromListHtml,
} = require('./lib/atly-web.cjs');

const ROOT = path.join(__dirname, '..');
const SITEMAP = path.join(ROOT, 'data/atly-sitemap-bidets.json');
const HOT = path.join(ROOT, 'data/atly-hot-urls.json');

const COUNTRIES = new Set(['USA', 'UK']);
const SKIP_FETCH = process.argv.includes('--skip-fetch');

const HOT_LISTS = fs.existsSync(HOT)
  ? JSON.parse(fs.readFileSync(HOT, 'utf8'))
      .map((x) => x.u)
      .filter((u) => /united-states|united-kingdom|\.uk\//i.test(u))
  : [];

const KURA_URLS = [
  'https://www.atly.com/location/KuraRevolvingSushiBar',
  ...Array.from({ length: 70 }, (_, i) => `https://www.atly.com/location/KuraRevolvingSushiBar${i + 1}`),
];

const EXTRA_URLS = [
  'https://www.atly.com/location/Arabica-New-York-Nolita',
  'https://www.atly.com/united-kingdom/london/best-bathroom',
  'https://www.atly.com/united-kingdom/england/london/best-bathroom',
  'https://www.atly.com/united-kingdom/england/london/best-bathroom-japanese-food',
];

const NEGATIVE_RE =
  /\b(lack|lacks|without|no|not a|isn't a|is not a)\b[^.]{0,40}\bbidet|\bbidet\b[^.]{0,40}\b(lack|missing|none)\b/i;

function alnum(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function withCity(row) {
  const city = String(row.city || '')
    .split(',')[0]
    .trim();
  if (!city) return row;
  if (alnum(row.name).includes(alnum(city))) return row;
  return { ...row, name: `${row.name} (${city})` };
}

function addrKey(row) {
  return `${row.country}|${alnum(row.address).slice(0, 18)}`;
}

function tooClose(a, b, tol = 0.004) {
  return (
    a.country === b.country &&
    Math.abs(Number(a.latitude) - Number(b.latitude)) < tol &&
    Math.abs(Number(a.longitude) - Number(b.longitude)) < tol
  );
}

function isUsablePublic(row) {
  if (!row || !COUNTRIES.has(row.country)) return false;
  if (row.access !== 'public') return false;
  if (row.type === 'hotel') return false;
  if (!row.latitude || !row.longitude || !row.sourceUrl || !row.sourceQuote) return false;
  if (NEGATIVE_RE.test(row.sourceQuote)) return false;
  return true;
}

async function mapPool(items, limit, fn) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function fetchAtlyRows() {
  const listUrls = [...new Set([...HOT_LISTS, ...EXTRA_URLS.filter((u) => !u.includes('/location/'))])];
  const locUrls = new Set([
    ...KURA_URLS,
    ...EXTRA_URLS.filter((u) => u.includes('/location/')),
  ]);

  for (const url of listUrls) {
    try {
      const html = await fetchText(url, { timeoutMs: 20000 });
      for (const u of bidetVenueUrlsFromListHtml(html)) locUrls.add(u);
      process.stderr.write(`list ${url} -> ${[...bidetVenueUrlsFromListHtml(html)].length} venue urls\n`);
    } catch (e) {
      process.stderr.write(`list skip ${url}: ${e.message}\n`);
    }
  }

  const urls = [...locUrls];
  process.stderr.write(`Fetching ${urls.length} Atly location pages…\n`);
  const rows = [];
  await mapPool(urls, 4, async (url) => {
    try {
      const html = await fetchText(url, { timeoutMs: 20000 });
      const row = parseLocationPage(html, url);
      if (row && isUsablePublic(row)) rows.push(withCity(row));
    } catch {
      /* 404 / timeout - expected for unused Kura ids */
    }
  });
  return rows;
}

function sitemapLeftovers() {
  if (!fs.existsSync(SITEMAP)) return [];
  return JSON.parse(fs.readFileSync(SITEMAP, 'utf8'))
    .filter(isUsablePublic)
    .map(withCity);
}

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
    req.setTimeout(180000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

const OSM_QUERY = `[out:json][timeout:160];
area["ISO3166-1"="GB"][admin_level=2]->.gb;
area["ISO3166-1"="US"][admin_level=2]->.us;
(
  nwr["amenity"="toilets"]["toilets:wash"~"bidet|washlet"](area.gb);
  nwr["amenity"="toilets"]["toilets:bidet"="yes"](area.gb);
  nwr["amenity"="toilets"]["toilets:wash"~"bidet|washlet"](area.us);
  nwr["amenity"="toilets"]["toilets:bidet"="yes"](area.us);
);
out center tags;`;

const BIDET_TYPE = {
  bidet_spray: 'Bidet shower (handheld sprayer)',
  bidet_shower: 'Bidet shower (handheld sprayer)',
  bidet: 'Bidet',
  washlet: 'Washlet (electronic bidet seat)',
};

function osmToRow(el) {
  const tags = el.tags || {};
  const lat = el.lat != null ? el.lat : el.center && el.center.lat;
  const lon = el.lon != null ? el.lon : el.center && el.center.lon;
  if (lat == null || lon == null) return null;
  const iso = String(tags['addr:country'] || '').toUpperCase();
  const country = iso === 'GB' || iso === 'UK' ? 'UK' : iso === 'US' ? 'USA' : null;
  // Country comes from the Overpass area filter when addr:country is missing.
  const inferred =
    country ||
    (Number(lat) > 49.5 && Number(lat) < 61 && Number(lon) > -8.5 && Number(lon) < 2
      ? 'UK'
      : Number(lat) > 24 && Number(lat) < 50 && Number(lon) > -125 && Number(lon) < -66
        ? 'USA'
        : null);
  if (!COUNTRIES.has(inferred)) return null;
  const wash = tags['toilets:wash'];
  const bidetType = BIDET_TYPE[wash] || (tags['toilets:bidet'] === 'yes' ? 'Bidet' : null);
  if (!bidetType) return null;
  if (tags.access === 'private') return null;
  const tag = wash ? `toilets:wash=${wash}` : 'toilets:bidet=yes';
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const city = tags['addr:city'] || tags['addr:suburb'] || tags['addr:town'] || '';
  const customers = tags.access === 'customers';
  return {
    name: tags.name || tags.operator || `Public toilets${city ? ` - ${city}` : ''}`,
    address: [street, tags['addr:postcode'], city].filter(Boolean).join(', '),
    latitude: String(lat),
    longitude: String(lon),
    city,
    country: inferred,
    type: 'public',
    bidetStatus: 'internet',
    bidetType,
    sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    sourceQuote: `OpenStreetMap tag ${tag} - ${bidetType.toLowerCase()} available in this toilet`,
    verifiedMethod: 'community-sighting',
    access: customers ? 'limited' : 'public',
    ...(customers ? { accessNote: 'Customers only' } : {}),
  };
}

async function fetchOsmRows() {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  let last;
  for (const ep of endpoints) {
    try {
      const json = await postOverpass(ep, OSM_QUERY);
      const els = json.elements || [];
      process.stderr.write(`OSM ${ep} -> ${els.length} objects\n`);
      return els.map(osmToRow).filter(isUsablePublic);
    } catch (e) {
      last = e;
      process.stderr.write(`OSM ${ep}: ${e.message}\n`);
    }
  }
  process.stderr.write(`OSM skipped: ${last && last.message}\n`);
  return [];
}

function mergePublic(existing, candidates) {
  const merged = [...existing];
  const urls = new Set(existing.map((r) => r.sourceUrl).filter(Boolean));
  const addrs = new Set(existing.map(addrKey).filter((k) => k.endsWith('|') === false && k.split('|')[1]));
  let added = 0;
  let skipped = 0;
  const addedRows = [];
  for (const row of candidates) {
    if (!isUsablePublic(row)) {
      skipped++;
      continue;
    }
    const key = addrKey(row);
    if (urls.has(row.sourceUrl) || (key.split('|')[1] && addrs.has(key))) {
      skipped++;
      continue;
    }
    if (merged.some((e) => tooClose(e, row))) {
      skipped++;
      continue;
    }
    urls.add(row.sourceUrl);
    if (key.split('|')[1]) addrs.add(key);
    merged.push(row);
    addedRows.push(row);
    added++;
  }
  return { merged, added, skipped, addedRows };
}

async function main() {
  const existing = readSeed();
  const fromSitemap = sitemapLeftovers();
  const fromAtly = SKIP_FETCH ? [] : await fetchAtlyRows();
  const fromOsm = SKIP_FETCH ? [] : await fetchOsmRows();
  const candidates = [...fromSitemap, ...fromAtly, ...fromOsm];
  const { merged, added, skipped, addedRows } = mergePublic(existing, candidates);
  writeSeed(merged);
  console.log(
    `Public UK/USA import: +${added} new (${skipped} skipped, ${candidates.length} candidates; sitemap ${fromSitemap.length}, atly ${fromAtly.length}, osm ${fromOsm.length}).`
  );
  for (const r of addedRows) {
    console.log(`  + ${r.country} ${r.name} (${r.city || ''}) ${r.sourceUrl}`);
  }
  console.log(`Total seed entries: ${merged.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
