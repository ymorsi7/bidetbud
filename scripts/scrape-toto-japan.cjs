#!/usr/bin/env node
/**
 * Scrape TOTO Japan hotel case studies (info.jp.toto.com, lodging category).
 * Output: data/toto-japan-references.json
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '../data/toto-japan-references.json');
const CACHE = path.join(__dirname, '../data/toto-japan-geocode-cache.json');
const SEARCH_PAGES = [
  'https://info.jp.toto.com/com-et/jirei/search/index.htm?A=08',
  'https://info.jp.toto.com/com-et/jirei/search/index.htm?A=08&C=99&p=2',
];

/** Photon misses Japanese names — hand-verified coordinates */
const MANUAL_GEO = {
  '2644': {
    lat: '43.0618',
    lon: '141.3544',
    display: 'Sapporo Grand Hotel, Sapporo, Japan',
  },
  '2602': {
    lat: '34.7189',
    lon: '137.8506',
    display: 'GREENITY IWATA, Iwata, Shizuoka, Japan',
  },
  '2548': {
    lat: '34.4817',
    lon: '136.8422',
    display: 'Toba International Hotel, Toba, Mie, Japan',
  },
  '2502': {
    lat: '35.6667',
    lon: '139.7594',
    display: 'Mesm Tokyo, Chuo-ku, Tokyo, Japan',
  },
  '2485': {
    lat: '33.0211',
    lon: '130.1767',
    display: 'Taradake Onsen Kanigoten, Tara, Saga, Japan',
  },
  '2466': {
    lat: '31.2522',
    lon: '130.6356',
    display: 'Ibusuki Hakusuikan, Ibusuki, Kagoshima, Japan',
  },
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'BidetBeacon/1.0' } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'BidetBeacon/1.0' } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

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

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function geocode(query, cache) {
  if (cache[query]) return cache[query];
  const url = 'https://photon.komoot.io/api/?limit=1&q=' + encodeURIComponent(query);
  let result = null;
  try {
    const j = await fetchJson(url);
    const f = j.features?.[0];
    if (f) {
      const [lon, lat] = f.geometry.coordinates;
      const p = f.properties;
      const display = [p.housenumber, p.street, p.city, p.state, p.country].filter(Boolean).join(', ');
      result = { lat: String(lat), lon: String(lon), display: display || query };
    }
  } catch (e) {
    console.warn('Geocode fail:', query, e.message);
  }
  await sleep(300);
  cache[query] = result;
  saveCache(cache);
  return result;
}

function parseListing(html) {
  const links = new Map();
  for (const m of html.matchAll(
    /href="(\/com-et\/jirei\/(\d+)\/)"[\s\S]*?<p class="thumb_title">([^<]+)<\/p>/gi
  )) {
    const id = m[2];
    const name = decodeHtml(m[3]);
    if (name) links.set(id, name);
  }
  return [...links.entries()].map(([id, name]) => ({
    id,
    name,
    url: `https://info.jp.toto.com/com-et/jirei/${id}/`,
  }));
}

function parseDetail(html, fallbackName) {
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const name = decodeHtml(titleMatch ? titleMatch[1] : fallbackName);

  const washletLine =
    html
      .replace(/<[^>]+>/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => /ウォシュレット|ネオレスト|WASHLET|NEOREST|温水洗浄便座/i.test(l) && l.length > 15) || '';

  const productMatch = html.match(
    /ウォシュレット一体形便器[^<\n]{0,60}|ネオレスト[^<\n]{0,40}|WASHLET[^<\n]{0,40}/i
  );
  const bidetType = productMatch ? decodeHtml(productMatch[0]).slice(0, 60) : 'TOTO WASHLET / NEOREST';

  const sourceQuote = washletLine
    ? `TOTO Japan case study: ${washletLine.slice(0, 240)}`
    : `TOTO Japan lodging case study documents WASHLET integrated toilets at ${name}`;

  return { name, bidetType, sourceQuote };
}

async function main() {
  const cache = loadCache();
  const allLinks = new Map();

  for (const pageUrl of SEARCH_PAGES) {
    const html = await fetchText(pageUrl);
    for (const item of parseListing(html)) {
      allLinks.set(item.id, item);
    }
    await sleep(400);
  }

  console.log('Japan hotel case studies found:', allLinks.size);
  const rows = [];

  for (const [i, item] of [...allLinks.values()].entries()) {
    process.stderr.write(`[${i + 1}/${allLinks.size}] ${item.name}\n`);
    let detail;
    try {
      detail = parseDetail(await fetchText(item.url), item.name);
      await sleep(350);
    } catch (e) {
      console.warn('Detail fetch failed:', item.name, e.message);
      continue;
    }

    const geoQuery = `${detail.name}, Japan`;
    let geo = MANUAL_GEO[item.id] || (await geocode(geoQuery, cache));
    if (!geo) {
      console.warn('No geocode:', geoQuery);
      continue;
    }

    rows.push({
      name: detail.name,
      address: geo.display,
      latitude: geo.lat,
      longitude: geo.lon,
      city: geo.display.split(',')[0]?.trim() || 'Japan',
      country: 'Japan',
      type: 'hotel',
      bidetStatus: 'warmed',
      bidetType: detail.bidetType,
      sourceUrl: item.url,
      sourceQuote: detail.sourceQuote,
      verifiedMethod: 'manufacturer-reference',
      access: 'limited',
      accessNote: 'Hotel guests',
    });
  }

  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
  console.log(`Wrote ${rows.length} entries to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
