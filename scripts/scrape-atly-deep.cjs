#!/usr/bin/env node
/**
 * Deep Atly scrape: fetch every slug on list pages, check location page for bidet evidence.
 * Appends to data/atly-na-bidets.json (merge, no overwrite).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '../data/atly-na-bidets.json');

const LIST_URLS = [
  'https://www.atly.com/united-states/best-bathroom-gluten-free',
  'https://www.atly.com/united-states/best-bathroom-halal',
  'https://www.atly.com/united-states/best-bathroom-fine-dining',
  'https://www.atly.com/united-states/new-york/best-bathroom-gluten-free',
  'https://www.atly.com/united-states/new-york/best-bathroom-halal',
  'https://www.atly.com/united-states/texas/best-bathroom-halal',
  'https://www.atly.com/united-states/california/best-bathroom-halal',
  'https://www.atly.com/united-states/illinois/best-bathroom-halal',
  'https://www.atly.com/united-states/michigan/best-bathroom-halal',
  'https://www.atly.com/best/gluten-free/hotel-canada',
  'https://www.atly.com/best/gluten-free/dinner-canada-british-columbia-vancouver-fairview',
];

const COUNTRY_MAP = {
  'United States': 'USA',
  US: 'USA',
  USA: 'USA',
  Canada: 'Canada',
  CA: 'Canada',
  Mexico: 'Mexico',
  MX: 'Mexico',
};

const BIDET_RE =
  /\bbidet(s|\s+toilet|\s+attachment|\s+hand\s+shower|\s+functions?|-style|\s+and\s+wudu)?\b|\bwashlet\b|\btoto[\s®™]*\s*(toilet|bidet|washlet|smart)\b|\bshattaf\b|\bhandheld sprayer\b|\bhand shower\b|\bjapanese toilet\b|\bheated toilet[^.\n]{0,40}bidet/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'BidetBud/1.0 (atly-deep)' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          fetchText(next).then(resolve).catch(reject);
          return;
        }
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

function stripHtml(s) {
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\u0026/g, '&')
    .replace(/\\"/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanQuote(raw) {
  let q = stripHtml(raw);
  q = q.replace(/^\W+|\W+$/g, '');
  if (q.length > 280) q = q.slice(0, 277) + '…';
  return q;
}

function extractSlugs(html) {
  return [...new Set([...html.matchAll(/\/location\/([A-Za-z0-9_-]+)/g)].map((m) => m[1]))];
}

function quoteFromLocationHtml(html) {
  const bathPara = html.match(
    /editorial-section-label-v2">Bathroom<\/div><p>([\s\S]*?)<\/p>/i
  );
  if (bathPara && BIDET_RE.test(bathPara[1])) return cleanQuote(bathPara[1]);

  const stmt = html.match(/statement-content"><p>&quot;([\s\S]*?)&quot;<\/p>/gi) || [];
  for (const block of stmt) {
    const inner = block.match(/&quot;([\s\S]*?)&quot;/);
    if (inner && BIDET_RE.test(inner[1])) return cleanQuote(inner[1]);
  }

  const idx = html.search(BIDET_RE);
  if (idx >= 0) return cleanQuote(html.slice(Math.max(0, idx - 80), idx + 200));
  return '';
}

function parseLocationPage(html, locUrl, listUrl, quote) {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  let j;
  try {
    j = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const addr = j.address || {};
  const country = COUNTRY_MAP[addr.addressCountry] || addr.addressCountry;
  if (!['USA', 'Canada', 'Mexico'].includes(country)) return null;
  const lat = j.geo?.latitude;
  const lon = j.geo?.longitude;
  if (lat == null || lon == null) return null;

  const street = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode]
    .filter(Boolean)
    .join(', ');
  const city = [addr.addressLocality, addr.addressRegion].filter(Boolean).join(', ');
  const schemaType = String(j['@type'] || '').toLowerCase();
  let type = 'restaurant';
  if (/hotel|lodging|resort|motel|inn/.test(schemaType + ' ' + j.name)) type = 'hotel';

  return {
    name: j.name,
    address: street,
    latitude: String(lat),
    longitude: String(lon),
    city,
    country,
    type,
    bidetStatus: 'internet',
    bidetType: /toto|washlet|smart japanese|japanese toilet/i.test(quote + j.name)
      ? 'TOTO / washlet bidet'
      : 'Bidet',
    sourceUrl: j.url || locUrl,
    sourceQuote: `Atly bathroom guide: ${quote}`,
    verifiedMethod: 'web-source',
    access: type === 'hotel' ? 'limited' : 'public',
    ...(type === 'hotel' ? { accessNote: 'Hotel guests' } : {}),
  };
}

async function main() {
  const prior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
  const known = new Set(
    prior.map((r) => `${r.name}|${Number(r.latitude).toFixed(5)}|${Number(r.longitude).toFixed(5)}`)
  );
  const knownUrls = new Set(prior.filter((r) => r.sourceUrl).map((r) => r.sourceUrl.replace(/\/$/, '')));

  const slugSet = new Map();
  for (const listUrl of LIST_URLS) {
    process.stderr.write(`List: ${listUrl}\n`);
    try {
      const html = await fetchText(listUrl);
      if (html.length < 5000 || html.includes('Page not found')) continue;
      for (const slug of extractSlugs(html)) {
        const url = `https://www.atly.com/location/${slug}`;
        if (!slugSet.has(url)) slugSet.set(url, listUrl);
      }
      await sleep(300);
    } catch (e) {
      console.warn('List failed:', listUrl, e.message);
    }
  }

  console.log('Unique location slugs:', slugSet.size);
  const rows = [];
  let i = 0;
  for (const [locUrl, listUrl] of slugSet.entries()) {
    i++;
    if (knownUrls.has(locUrl.replace(/\/$/, ''))) continue;
    process.stderr.write(`[${i}/${slugSet.size}] ${locUrl}\n`);
    try {
      const html = await fetchText(locUrl);
      if (!BIDET_RE.test(html)) continue;
      const quote = quoteFromLocationHtml(html);
      if (!quote) continue;
      const row = parseLocationPage(html, locUrl, listUrl, quote);
      await sleep(180);
      if (!row) continue;
      const key = `${row.name}|${Number(row.latitude).toFixed(5)}|${Number(row.longitude).toFixed(5)}`;
      if (known.has(key)) continue;
      known.add(key);
      rows.push(row);
    } catch (e) {
      console.warn('Loc failed:', locUrl, e.message);
    }
  }

  const merged = [...prior];
  for (const row of rows) merged.push(row);
  fs.writeFileSync(OUT, JSON.stringify(merged, null, 2) + '\n');
  console.log(`Deep scrape: +${rows.length} new (total file ${merged.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
