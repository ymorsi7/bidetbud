#!/usr/bin/env node
/**
 * Scrape Atly "best bathroom" lists — pre-filter list HTML for bidet evidence, then geocode.
 * Output: data/atly-na-bidets.json
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '../data/atly-na-bidets.json');

const LIST_URLS = [
  'https://www.atly.com/united-states/best-bathroom-fine-dining',
  'https://www.atly.com/united-states/best-bathroom-gluten-free',
  'https://www.atly.com/united-states/best-bathroom-coffee',
  'https://www.atly.com/united-states/best-bathroom-vegan-friendly',
  'https://www.atly.com/united-states/best-bathroom-turkish-coffee',
  'https://www.atly.com/united-states/california/best-bathroom-hotel',
  'https://www.atly.com/united-states/california/best-bathroom-restaurant',
  'https://www.atly.com/united-states/new-york/best-bathroom-restaurant',
  'https://www.atly.com/united-states/texas/best-bathroom-restaurant',
  'https://www.atly.com/united-states/florida/best-bathroom-hotel',
  'https://www.atly.com/united-states/florida/best-bathroom-coffee',
  'https://www.atly.com/united-states/illinois/best-bathroom-hotel',
  'https://www.atly.com/united-states/illinois/best-bathroom-coffee',
  'https://www.atly.com/united-states/washington/best-bathroom-hotel',
  'https://www.atly.com/united-states/washington/best-bathroom-coffee',
  'https://www.atly.com/united-states/hawaii/best-bathroom-coffee',
  'https://www.atly.com/united-states/colorado/best-bathroom-hotel',
  'https://www.atly.com/united-states/colorado/best-bathroom-coffee',
  'https://www.atly.com/united-states/georgia/best-bathroom-hotel',
  'https://www.atly.com/united-states/georgia/best-bathroom-coffee',
  'https://www.atly.com/united-states/arizona/best-bathroom-restaurant',
  'https://www.atly.com/united-states/arizona/best-bathroom-hotel',
  'https://www.atly.com/united-states/arizona/best-bathroom-coffee',
  'https://www.atly.com/united-states/massachusetts/best-bathroom-hotel',
  'https://www.atly.com/united-states/massachusetts/best-bathroom-coffee',
  'https://www.atly.com/united-states/pennsylvania/best-bathroom-hotel',
  'https://www.atly.com/united-states/pennsylvania/best-bathroom-coffee',
  'https://www.atly.com/united-states/oregon/best-bathroom-hotel',
  'https://www.atly.com/united-states/oregon/best-bathroom-coffee',
  'https://www.atly.com/united-states/nevada/best-bathroom-hotel',
  'https://www.atly.com/united-states/nevada/best-bathroom-coffee',
  'https://www.atly.com/united-states/michigan/best-bathroom-hotel',
  'https://www.atly.com/united-states/michigan/best-bathroom-coffee',
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
  /\bbidet(s|\s+toilet|\s+attachment|\s+hand\s+shower|\s+functions?|-style|\s+and\s+wudu)?\b|\bwashlet\b|\btoto[\s®™]*\s*(toilet|bidet|washlet|smart)\b|\b(toilet|bathroom)[^.\n]{0,40}\btoto\b|\bshattaf\b|\bhandheld sprayer\b|\bsmart japanese toilet\b|\belectric bidet\b|\bheated toilet[^.\n]{0,40}bidet|\bbidet[^.\n]{0,40}heated toilet|\btoilet with a bidet/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'BidetBeacon/1.0 (atly-import)' } }, (res) => {
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

function extractBidetCandidates(html, listUrl) {
  const candidates = new Map();
  const slugRe = /\/location\/([A-Za-z0-9_-]+)/g;
  let m;
  while ((m = slugRe.exec(html))) {
    const slug = m[1];
    const url = `https://www.atly.com/location/${slug}`;
    if (candidates.has(url)) continue;
    const start = Math.max(0, m.index - 4000);
    const end = Math.min(html.length, m.index + 12000);
    const window = html.slice(start, end);
    if (!BIDET_RE.test(window)) continue;

    let quote = '';
    const bathPara = window.match(
      /editorial-section-label-v2">Bathroom<\/div><p>([\s\S]*?)<\/p>/i
    );
    if (bathPara && BIDET_RE.test(bathPara[1])) {
      quote = cleanQuote(bathPara[1]);
    }
    if (!quote) {
      const stmt = window.match(/statement-content"><p>&quot;([\s\S]*?)&quot;<\/p>/i);
      if (stmt && BIDET_RE.test(stmt[1])) quote = cleanQuote(stmt[1]);
    }
    if (!quote) {
      const blurb = window.match(/"blurb":"([^"]{20,300})"/);
      if (blurb && BIDET_RE.test(blurb[1])) quote = cleanQuote(blurb[1]);
    }
    if (!quote) {
      const idx = window.search(BIDET_RE);
      quote = cleanQuote(window.slice(Math.max(0, idx - 60), idx + 180));
    }
    if (!quote || !BIDET_RE.test(quote)) continue;
    candidates.set(url, { url, quote, listUrl });
  }
  return [...candidates.values()];
}

function parseLocationPage(html) {
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
    bidetType: /toto|washlet|smart japanese/i.test(j.name) ? 'TOTO / washlet bidet' : 'Bidet',
    sourceUrl: j.url || j.mainEntityOfPage?.url,
    verifiedMethod: 'web-source',
    access: type === 'hotel' ? 'limited' : 'public',
    ...(type === 'hotel' ? { accessNote: 'Hotel guests' } : {}),
  };
}

async function main() {
  const allCandidates = new Map();

  for (const listUrl of LIST_URLS) {
    process.stderr.write(`List: ${listUrl}\n`);
    try {
      const html = await fetchText(listUrl);
      const code = html.includes('404') && html.length < 5000 ? null : html;
      if (!code || html.includes('Page not found')) {
        console.warn('Skip (404):', listUrl);
        continue;
      }
      for (const c of extractBidetCandidates(html, listUrl)) {
        if (!allCandidates.has(c.url)) allCandidates.set(c.url, c);
      }
      await sleep(350);
    } catch (e) {
      console.warn('List fetch failed:', listUrl, e.message);
    }
  }

  console.log('Bidet candidates from list pages:', allCandidates.size);
  const rows = [];
  let i = 0;
  for (const cand of allCandidates.values()) {
    i++;
    process.stderr.write(`[${i}/${allCandidates.size}] ${cand.url}\n`);
    try {
      const html = await fetchText(cand.url);
      const loc = parseLocationPage(html);
      await sleep(220);
      if (!loc) continue;
      loc.bidetType =
        /toto|washlet/i.test(cand.quote) || /toto|washlet/i.test(loc.name)
          ? 'TOTO / washlet bidet'
          : loc.bidetType;
      loc.sourceQuote = `Atly bathroom guide: ${cand.quote}`;
      rows.push(loc);
    } catch (e) {
      console.warn('Location fetch failed:', cand.url, e.message);
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
  const byCountry = rows.reduce((a, r) => {
    a[r.country] = (a[r.country] || 0) + 1;
    return a;
  }, {});
  console.log(`Wrote ${rows.length} entries to ${OUT}`, byCountry);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
