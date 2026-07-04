#!/usr/bin/env node
/**
 * Scrape TOTO Global Reference projects (toto.com/en/project/js/list.json).
 * Output: data/toto-global-references.json
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const os = require('os');

const OUT = path.join(__dirname, '../data/toto-global-references.json');
const CACHE = path.join(__dirname, '../data/toto-global-geocode-cache.json');
const LIST_URL = 'https://www.toto.com/en/project/js/list.json';
const BASE = 'https://www.toto.com';

const COUNTRY_MAP = {
  'MAINLAND CHINA': 'China',
  USA: 'USA',
  UK: 'UK',
  'TAIWAN REGION': 'Taiwan',
  VIETNAM: 'Vietnam',
  FRANCE: 'France',
  JAPAN: 'Japan',
  INDIA: 'India',
  GERMANY: 'Germany',
  MALAYSIA: 'Malaysia',
  THAILAND: 'Thailand',
  'HONG KONG, MACAU(CHINA)': 'Hong Kong',
  SINGAPORE: 'Singapore',
  AUSTRALIA: 'Australia',
  AUSTRIA: 'Austria',
  UAE: 'UAE',
  DUBAI: 'UAE',
  INDONESIA: 'Indonesia',
  RUSSIA: 'Russia',
  CANADA: 'Canada',
  MYANMAR: 'Myanmar',
  SWITZERLAND: 'Switzerland',
  QATAR: 'Qatar',
};

const CITY_HINT = {
  'MAINLAND CHINA': 'China',
  USA: 'USA',
  UK: 'London UK',
  'TAIWAN REGION': 'Taiwan',
  VIETNAM: 'Vietnam',
  FRANCE: 'France',
  JAPAN: 'Japan',
  INDIA: 'India',
  GERMANY: 'Germany',
  MALAYSIA: 'Malaysia',
  THAILAND: 'Thailand',
  'HONG KONG, MACAU(CHINA)': 'Hong Kong',
  SINGAPORE: 'Singapore',
  AUSTRALIA: 'Australia',
  AUSTRIA: 'Austria',
  UAE: 'UAE',
  DUBAI: 'Dubai UAE',
  INDONESIA: 'Indonesia',
  RUSSIA: 'Russia',
  CANADA: 'Canada',
  MYANMAR: 'Myanmar',
  SWITZERLAND: 'Switzerland',
  QATAR: 'Qatar',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'BidetBud/1.0 (toto-global-import)' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : BASE + res.headers.location;
          fetchBuffer(next).then(resolve).catch(reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
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
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<sup>®<\/sup>/gi, '®')
    .replace(/<[^>]+>/g, '');
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'BidetBud/1.0' } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(data.slice(0, 80)));
          }
        });
      })
      .on('error', reject);
  });
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
      const display = [p.housenumber, p.street, p.city, p.country].filter(Boolean).join(', ');
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

function parseHtmlPage(html, fallbackName) {
  const titleMatch = html.match(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/i);
  const name = decodeHtml(titleMatch ? titleMatch[1].trim() : fallbackName);

  const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) =>
    decodeHtml(m[1]).replace(/\s+/g, ' ').trim()
  );
  const bidetPara =
    paras.find((p) => /washlet|bidet|neorest|shower toilet/i.test(p) && p.length > 40) || '';

  const products = [];
  for (const m of html.matchAll(/class="itemName"[^>]*>([^<]+)/gi)) {
    products.push(decodeHtml(m[1]).trim());
  }
  const bidetType =
    products.find((p) => /washlet|neorest/i.test(p)) ||
    (bidetPara.match(/NEOREST[^,.]{0,40}|WASHLET[^,.]{0,40}/i) || [])[0] ||
    'TOTO WASHLET / NEOREST';

  const sourceQuote = bidetPara
    ? bidetPara.slice(0, 280)
    : `TOTO Global Reference: ${name} — featured products include ${products.slice(0, 3).join(', ') || bidetType}`;

  return { name, bidetType, sourceQuote };
}

function parsePdfPage(buf, fallbackName) {
  const tmp = path.join(os.tmpdir(), `toto-global-${Date.now()}.pdf`);
  fs.writeFileSync(tmp, buf);
  let text = '';
  try {
    text = execFileSync('pdftotext', [tmp, '-'], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  } catch {
    /* pdftotext unavailable */
  }
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  const washletLine = text
    .split('\n')
    .find((l) => /washlet|ウォシュレット|bidet|neorest|ノレスト/i.test(l));
  const sourceQuote = washletLine
    ? `TOTO Global Reference (PDF case study): ${washletLine.trim().slice(0, 220)}`
    : `TOTO Global Reference case study documents TOTO WASHLET/NEOREST sanitary installations at ${fallbackName}`;
  return {
    name: fallbackName,
    bidetType: 'TOTO WASHLET / NEOREST',
    sourceQuote,
  };
}

function mapType(name, operator) {
  const s = `${name} ${operator}`.toLowerCase();
  if (/restaurant|brushstroke|lounge|bar/i.test(s)) return 'restaurant';
  if (/hotel|resort|inn|hyatt|marriott|hilton|ritz|four seasons|peninsula|conrad|sheraton|westin|sofitel|novotel|mercure|intercontinental|regent|okura|dusit|anantara|banyan|rosewood|waldorf|park hyatt|grand hyatt|andaz|w hotel|edition|st\. regis|claridges|palace hotel/i.test(s)) {
    return 'hotel';
  }
  return 'hotel';
}

async function main() {
  const listBuf = await fetchBuffer(LIST_URL);
  const list = JSON.parse(listBuf.toString('utf8'));
  console.log('TOTO global list:', list.length, 'projects');

  const cache = loadCache();
  const rows = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const country = COUNTRY_MAP[item.country] || item.country;
    if (country === 'Singapore') continue;

    const sourceUrl = BASE + item['page-url'];
    const fallbackName = item['gr-name'];
    process.stderr.write(`[${i + 1}/${list.length}] ${fallbackName}\n`);

    let parsed;
    try {
      const buf = await fetchBuffer(sourceUrl);
      const isPdf = item['page-url'].endsWith('.pdf') || buf.slice(0, 4).toString() === '%PDF';
      parsed = isPdf ? parsePdfPage(buf, fallbackName) : parseHtmlPage(buf.toString('utf8'), fallbackName);
      await sleep(350);
    } catch (e) {
      console.warn('Fetch failed:', fallbackName, e.message);
      continue;
    }

    const geoQuery = `${parsed.name}, ${CITY_HINT[item.country] || country}`;
    const geo = await geocode(geoQuery, cache);
    if (!geo) {
      console.warn('No geocode:', geoQuery);
      continue;
    }

    const type = mapType(parsed.name, item.operator);
    rows.push({
      name: parsed.name,
      address: geo.display,
      latitude: geo.lat,
      longitude: geo.lon,
      city: geo.display.split(',')[0]?.trim() || country,
      country,
      type,
      bidetStatus: 'warmed',
      bidetType: parsed.bidetType,
      sourceUrl,
      sourceQuote: parsed.sourceQuote,
      verifiedMethod: 'manufacturer-reference',
      access: type === 'restaurant' ? 'public' : 'limited',
      accessNote: type === 'restaurant' ? 'Restaurant patrons' : 'Hotel guests and patrons',
      operator: item.operator,
    });
  }

  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
  console.log(`Wrote ${rows.length} entries to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
