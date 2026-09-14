#!/usr/bin/env node
/**
 * UK bidet web crawler — explicit bidet/washlet/sprayer mentions only.
 *
 *   node scripts/crawl-uk-web.cjs --minutes=45
 *   node scripts/crawl-uk-web.cjs --minutes=45 --import
 */
const fs = require('fs');
const path = require('path');
const {
  sleep,
  fetchText,
  hasBidetSignal,
  hasVenueSchema,
  parseVenuePage,
  extractUrlsFromSearch,
} = require('./lib/africa-web.cjs');

const OUT = path.join(__dirname, '../data/uk-web-crawl-bidets.json');
const STATE = path.join(__dirname, '../data/uk-crawl-state.json');
const CACHE = path.join(__dirname, '../data/uk-geocode-cache.json');

const minArg = process.argv.find((a) => a.startsWith('--minutes='));
const MINUTES = minArg ? Number(minArg.split('=')[1]) : 45;
const DO_IMPORT = process.argv.includes('--import');
const RESET = process.argv.includes('--reset');

const CITIES = [
  'London',
  'Manchester',
  'Birmingham',
  'Leeds',
  'Glasgow',
  'Edinburgh',
  'Bristol',
  'Liverpool',
  'Cardiff',
  'Belfast',
  'Newcastle',
  'Sheffield',
  'Nottingham',
  'Oxford',
  'Cambridge',
  'Brighton',
  'Bath',
  'York',
  'Reading',
  'Leicester',
];

const QUERIES = (city) => [
  `bidet hotel ${city} UK`,
  `"bidet" bathroom ${city} hotel site:co.uk`,
  `washlet ${city} United Kingdom hotel`,
  `TOTO washlet ${city} site:co.uk`,
  `Closomat ${city} site:co.uk`,
  `Geberit AquaClean hotel ${city} UK`,
  `handheld bidet sprayer restaurant ${city} UK`,
  `bidet ${city} site:tripadvisor.co.uk`,
];

function loadJson(p, fb) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fb;
  }
}
function saveJson(p, o) {
  fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
}

async function searchWeb(q) {
  const engines = [
    () => fetchText('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), { lang: 'en' }),
    () => fetchText('https://www.mojeek.com/search?q=' + encodeURIComponent(q), { lang: 'en' }),
  ];
  for (const fn of engines) {
    try {
      const html = await fn();
      const urls = extractUrlsFromSearch(html).filter((u) => /\.uk\b|co\.uk|gov\.uk|tripadvisor\.co\.uk/i.test(u));
      if (urls.length) return urls;
    } catch {
      /* next */
    }
  }
  return [];
}

async function geocode(q, cache) {
  const key = `GB|${q}`;
  if (cache[key]) return cache[key];
  const https = require('https');
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en&countrycodes=gb`;
  const hit = await new Promise((resolve) => {
    https
      .get(url, { headers: { 'User-Agent': 'BidetBud/1.0' } }, (res) => {
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
          } catch {
            resolve(null);
          }
        });
      })
      .on('error', () => resolve(null));
  });
  if (hit) cache[key] = hit;
  await sleep(200);
  return hit;
}

async function main() {
  if (RESET) {
    for (const p of [OUT, STATE, CACHE]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ok */
      }
    }
  }
  const end = Date.now() + MINUTES * 60 * 1000;
  let rows = loadJson(OUT, []);
  const state = loadJson(STATE, { ci: 0, qi: 0, queue: [], seen: {} });
  const cache = loadJson(CACHE, {});
  const seenUrl = new Set(rows.map((r) => r.sourceUrl));

  while (Date.now() < end) {
    if (!state.queue.length) {
      const city = CITIES[state.ci];
      if (!city) break;
      const q = QUERIES(city)[state.qi];
      if (!q) {
        state.ci++;
        state.qi = 0;
        continue;
      }
      console.log(`Search: ${q}`);
      const urls = await searchWeb(q);
      state.qi++;
      for (const u of urls.slice(0, 14)) {
        if (!state.seen[u]) {
          state.queue.push({ url: u, city });
          state.seen[u] = 1;
        }
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
      const geo = await geocode(`${parsed.name}, ${job.city}, UK`, cache);
      if (!geo) continue;
      const type = parsed.type || (/hotel|inn|resort/i.test(html) ? 'hotel' : 'restaurant');
      const row = {
        name: parsed.name,
        ...geo,
        country: 'UK',
        type,
        sourceUrl: job.url,
        sourceQuote: parsed.quote || parsed.evidence || 'Page explicitly mentions a bidet or washlet.',
        bidetType: /washlet|toto|neorest|closomat/i.test(html) ? 'TOTO / washlet bidet' : 'Bidet',
        access: type === 'hotel' ? 'limited' : 'public',
        ...(type === 'hotel' ? { accessNote: 'Hotel guests' } : {}),
      };
      rows.push(row);
      seenUrl.add(job.url);
      saveJson(OUT, rows);
      saveJson(CACHE, cache);
      console.log(`+ ${row.name} (${rows.length})`);
    } catch {
      /* skip */
    }
    await sleep(800);
  }

  saveJson(STATE, state);
  saveJson(OUT, rows);
  console.log(`UK crawl done: ${rows.length} rows`);
  if (DO_IMPORT && rows.length) {
    require('child_process').execSync('node scripts/import-uk-web.cjs', { stdio: 'inherit' });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
