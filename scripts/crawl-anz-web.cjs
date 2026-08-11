#!/usr/bin/env node
/**
 * Fast AU/NZ bidet web crawler (explicit bidet/washlet/sprayer mentions only).
 * Usage: node scripts/crawl-anz-web.cjs --minutes=15 [--import]
 */
const fs = require('fs');
const path = require('path');
const {
  sleep, fetchText, hasBidetSignal, hasVenueSchema, parseVenuePage, extractUrlsFromSearch,
} = require('./lib/africa-web.cjs');

const OUT = path.join(__dirname, '../data/anz-web-crawl-bidets.json');
const STATE = path.join(__dirname, '../data/anz-crawl-state.json');
const CACHE = path.join(__dirname, '../data/anz-geocode-cache.json');

const minArg = process.argv.find((a) => a.startsWith('--minutes='));
const MINUTES = minArg ? Number(minArg.split('=')[1]) : 15;
const DO_IMPORT = process.argv.includes('--import');
const RESET = process.argv.includes('--reset');

const COUNTRIES = [
  { code: 'AU', name: 'Australia', cities: [
    'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra', 'Gold Coast', 'Hobart', 'Darwin',
    'Newcastle', 'Wollongong', 'Geelong', 'Cairns', 'Townsville', 'Toowoomba', 'Ballarat', 'Bendigo', 'Launceston',
    'Sunshine Coast', 'Central Coast', 'Blue Mountains', 'Byron Bay', 'Parramatta', 'Fremantle', 'Mandurah',
  ]},
  { code: 'NZ', name: 'New Zealand', cities: [
    'Auckland', 'Wellington', 'Christchurch', 'Queenstown', 'Rotorua', 'Hamilton', 'Dunedin', 'Tauranga', 'Napier', 'Nelson',
  ]},
];

const QUERIES = (city, country) => [
  `bidet hotel ${city} ${country}`,
  `"bidet" bathroom ${city} hotel`,
  `washlet ${city} ${country}`,
  `TOTO washlet hotel ${city}`,
  `handheld bidet sprayer ${city} hotel`,
  `bidet ${city} site:com.au`,
  `bidet ${city} site:co.nz`,
];

function loadJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } }
function saveJson(p, o) { fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n'); }

async function searchWeb(q, state) {
  const engines = [
    () => fetchText('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), { lang: 'en' }),
    () => fetchText('https://www.mojeek.com/search?q=' + encodeURIComponent(q), { lang: 'en' }),
  ];
  for (const fn of engines) {
    try {
      const html = await fn();
      const urls = extractUrlsFromSearch(html);
      if (urls.length) return urls;
    } catch { /* next */ }
  }
  return [];
}

async function geocode(q, cc, cache) {
  const key = `${cc}|${q}`;
  if (cache[key]) return cache[key];
  const https = require('https');
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en&countrycodes=${cc.toLowerCase()}`;
  const hit = await new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'BidetBud/1.0' } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          const f = JSON.parse(d).features?.[0];
          if (!f) return resolve(null);
          const p = f.properties || {};
          resolve({
            latitude: String(f.geometry.coordinates[1]),
            longitude: String(f.geometry.coordinates[0]),
            address: [p.name, p.street, p.city, p.state, p.country].filter(Boolean).join(', '),
            city: [p.city, p.state].filter(Boolean).join(', ') || p.country,
          });
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
  if (hit) cache[key] = hit;
  await sleep(200);
  return hit;
}

async function main() {
  if (RESET) {
    for (const p of [OUT, STATE, CACHE]) try { fs.unlinkSync(p); } catch {}
  }
  const end = Date.now() + MINUTES * 60 * 1000;
  let rows = loadJson(OUT, []);
  const state = loadJson(STATE, { ci: 0, cj: 0, qi: 0, queue: [], seen: {} });
  const cache = loadJson(CACHE, {});
  const seenUrl = new Set(rows.map((r) => r.sourceUrl));

  while (Date.now() < end) {
    if (!state.queue.length) {
      const c = COUNTRIES[state.ci];
      if (!c) break;
      const city = c.cities[state.cj];
      if (!city) { state.ci++; state.cj = 0; state.qi = 0; continue; }
      const q = QUERIES(city, c.name)[state.qi];
      if (!q) { state.cj++; state.qi = 0; continue; }
      console.log(`Search: ${q}`);
      const urls = await searchWeb(q, state);
      state.qi++;
      for (const u of urls.slice(0, 12)) {
        if (!state.seen[u]) { state.queue.push({ url: u, country: c.name, code: c.code, city }); state.seen[u] = 1; }
      }
      saveJson(STATE, state);
      await sleep(1200);
      continue;
    }

    const job = state.queue.shift();
    if (!job || seenUrl.has(job.url)) continue;
    try {
      const html = await fetchText(job.url, { lang: 'en' });
      if (!hasBidetSignal(html) || !hasVenueSchema(html)) continue;
      const parsed = parseVenuePage(html, job.url);
      if (!parsed?.name) continue;
      const geo = await geocode(`${parsed.name}, ${job.city}, ${job.country}`, job.code, cache);
      if (!geo) continue;
      const row = {
        name: parsed.name,
        ...geo,
        country: job.country,
        type: parsed.type || 'hotel',
        sourceUrl: job.url,
        sourceQuote: parsed.quote || parsed.evidence || 'Page explicitly mentions a bidet or washlet.',
        bidetType: /washlet|toto|neorest/i.test(html) ? 'TOTO / washlet bidet' : 'Bidet',
      };
      rows.push(row);
      seenUrl.add(job.url);
      saveJson(OUT, rows);
      saveJson(CACHE, cache);
      console.log(`+ ${row.name} (${rows.length})`);
    } catch { /* skip */ }
    await sleep(800);
  }

  saveJson(STATE, state);
  console.log(`Crawl done: ${rows.length} rows`);
  if (DO_IMPORT) require('child_process').execSync('node scripts/import-anz.cjs', { stdio: 'inherit' });
}

main().catch((e) => { console.error(e); process.exit(1); });
