#!/usr/bin/env node
/**
 * High-confidence restaurant / cafe / public crawl across non-friendly countries.
 * Skips hotels. Requires explicit bidet/washlet/shattaf quote + venue signals.
 *
 *   node scripts/crawl-public-restaurants.cjs --minutes=50 --import
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
  extractBidetSentences,
  looksLikeShop,
} = require('./lib/africa-web.cjs');
const { inferType } = require('./lib/infer-type.cjs');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { mergeIntoSeed } = require('./lib/seed-merge.cjs');

const MINUTES = Number((process.argv.find((a) => a.startsWith('--minutes=')) || '--minutes=50').split('=')[1]);
const DO_IMPORT = process.argv.includes('--import');
const RESET = process.argv.includes('--reset');

const OUT = path.join(__dirname, '../data/public-restaurants-crawl-bidets.json');
const STATE = path.join(__dirname, '../data/public-restaurants-crawl-state.json');
const CACHE = path.join(__dirname, '../data/public-restaurants-geocode-cache.json');

const HOTEL_RE =
  /\b(hotel|motel|inn|resort|hostel|suites|lodge|marriott|hilton|hyatt|sheraton|westin|radisson|sofitel|novotel|ibis|mercure|airbnb)\b/i;

const REGIONS = [
  {
    country: 'USA',
    codes: 'us',
    host: /\.com\b|tripadvisor\.com|yelp\.com|timeout\.com|eater\.com|infatuation\.com/i,
    cities: [
      'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio',
      'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville', 'San Francisco', 'Seattle',
      'Denver', 'Boston', 'Nashville', 'Detroit', 'Portland', 'Las Vegas', 'Atlanta', 'Miami',
      'Minneapolis', 'Tampa', 'Orlando', 'Dearborn', 'Paterson', 'Queens', 'Brooklyn', 'Irvine',
    ],
  },
  {
    country: 'UK',
    codes: 'gb',
    host: /\.uk\b|co\.uk|tripadvisor\.co\.uk|timeout\.com/i,
    cities: [
      'London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow', 'Edinburgh', 'Bristol',
      'Liverpool', 'Bradford', 'Leicester', 'Luton', 'Slough', 'Birmingham Sparkbrook',
    ],
  },
  {
    country: 'Canada',
    codes: 'ca',
    host: /\.ca\b|tripadvisor\.ca|blogto\.com/i,
    cities: ['Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa', 'Mississauga', 'Edmonton'],
  },
  {
    country: 'Australia',
    codes: 'au',
    host: /\.au\b|tripadvisor\.com\.au|broadsheet\.com\.au|timeout\.com/i,
    cities: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Lakemba', 'Auburn NSW', 'Parramatta'],
  },
  {
    country: 'Germany',
    codes: 'de',
    host: /\.de\b|tripadvisor\.de/i,
    cities: ['Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Cologne', 'Düsseldorf'],
  },
  {
    country: 'France',
    codes: 'fr',
    host: /\.fr\b|tripadvisor\.fr/i,
    cities: ['Paris', 'Lyon', 'Marseille', 'Nice', 'Bordeaux'],
  },
];

function queries(city, country) {
  const where = `${city} ${country}`;
  return [
    `"washlet" (restaurant OR cafe OR sushi OR ramen) ${where}`,
    `"japanese toilet" (restaurant OR cafe) ${where}`,
    `"bidet" (restaurant OR cafe OR coffee) bathroom ${where}`,
    `"bidet attachment" (restaurant OR cafe) ${where}`,
    `"shattaf" (restaurant OR cafe OR coffee) ${where}`,
    `"handheld bidet" (restaurant OR cafe) ${where}`,
    `"toto washlet" (restaurant OR showroom) ${where}`,
    `"bidet" (mall OR "food court") toilet ${where}`,
  ];
}

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

async function searchWeb(q, hostRe) {
  const engines = [
    () =>
      fetchText('https://lite.duckduckgo.com/lite/', {
        lang: 'en',
        method: 'POST',
        body: { q },
        extraHeaders: { Referer: 'https://lite.duckduckgo.com/' },
      }),
    () => fetchText('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), { lang: 'en' }),
    () => fetchText('https://www.mojeek.com/search?q=' + encodeURIComponent(q), { lang: 'en' }),
  ];
  for (const fn of engines) {
    try {
      const html = await fn();
      const urls = extractUrlsFromSearch(html).filter(
        (u) => hostRe.test(u) && !/duckduckgo|google\.|bing\.|facebook|instagram|amazon|ebay/i.test(u)
      );
      if (urls.length) return urls;
    } catch {
      /* next */
    }
    await sleep(350);
  }
  return [];
}

function photon(q, codes, cache) {
  const key = `${codes}|${q}`;
  if (cache[key]) return Promise.resolve(cache[key]);
  const https = require('https');
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en&countrycodes=${codes}`;
  return new Promise((resolve) => {
    https
      .get(url, { headers: { 'User-Agent': 'BidetBud/1.0 (https://bidetbud.com)' } }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            const f = JSON.parse(d).features?.[0];
            if (!f) return resolve(null);
            const p = f.properties || {};
            const hit = {
              latitude: String(f.geometry.coordinates[1]),
              longitude: String(f.geometry.coordinates[0]),
              address: [p.name, p.street, p.housenumber, p.city, p.state, p.country]
                .filter(Boolean)
                .join(', '),
              city: [p.city || p.name, p.state].filter(Boolean).join(', ') || p.country,
            };
            cache[key] = hit;
            resolve(hit);
          } catch {
            resolve(null);
          }
        });
      })
      .on('error', () => resolve(null));
  });
}

function okVenue(html) {
  if (looksLikeShop(html)) return false;
  if (HOTEL_RE.test(html.slice(0, 2000)) && /lodging|hotel booking|book a room/i.test(html)) return false;
  if (hasVenueSchema(html)) return true;
  if (/"streetAddress"\s*:\s*"[^"]{4,}"/i.test(html)) return true;
  return false;
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
  const state = loadJson(STATE, { ri: 0, ci: 0, qi: 0, queue: [], seen: {} });
  const cache = loadJson(CACHE, {});
  const seenUrl = new Set(rows.map((r) => r.sourceUrl));

  const jobs = [];
  for (const region of REGIONS) {
    for (const city of region.cities) {
      for (const q of queries(city, region.country)) {
        jobs.push({ region, city, q });
      }
    }
  }

  let ji = state.qi || 0;
  process.stderr.write(`Public-restaurant crawl: ${jobs.length} queries, start@${ji}, ${MINUTES} min\n`);

  while (Date.now() < end && ji < jobs.length) {
    const job = jobs[ji++];
    state.qi = ji;
    process.stderr.write(`Search: ${job.q}\n`);
    const urls = await searchWeb(job.q, job.region.host);
    for (const u of urls.slice(0, 8)) {
      if (state.seen[u] || seenUrl.has(u)) continue;
      state.seen[u] = 1;
      state.queue.push({ url: u, country: job.region.country, codes: job.region.codes, city: job.city });
    }
    saveJson(STATE, state);
    await sleep(400);

    while (state.queue.length && Date.now() < end) {
      const item = state.queue.shift();
      try {
        const html = await fetchText(item.url, { lang: 'en' });
        if (!hasBidetSignal(html) || !okVenue(html)) continue;
        const parsed = parseVenuePage(html, item.url);
        if (!parsed || !parsed.name || HOTEL_RE.test(parsed.name)) continue;
        const quotes = extractBidetSentences(html).filter((s) => s.length > 20);
        if (!quotes.length) continue;
        const geo =
          parsed.latitude && parsed.longitude
            ? {
                latitude: String(parsed.latitude),
                longitude: String(parsed.longitude),
                address: parsed.address,
                city: parsed.city || item.city,
              }
            : await photon(`${parsed.name} ${item.city}`, item.codes, cache);
        if (!geo) continue;
        const type = inferType({ name: parsed.name, address: geo.address || '' });
        if (type === 'hotel' || HOTEL_RE.test(parsed.name)) continue;
        const row = {
          name: parsed.name,
          address: geo.address || parsed.address || '',
          latitude: geo.latitude,
          longitude: geo.longitude,
          city: geo.city || item.city,
          country: item.country,
          type: type === 'mosque' ? 'mosque' : type === 'public' ? 'public' : 'restaurant',
          bidetStatus: /washlet|toto|heated|closomat|aquaclean/i.test(quotes[0]) ? 'warmed' : 'internet',
          bidetType: /washlet|toto/i.test(quotes[0])
            ? 'TOTO / washlet bidet'
            : /shattaf|handheld|sprayer/i.test(quotes[0])
              ? 'Handheld sprayer'
              : 'Bidet',
          sourceUrl: item.url,
          sourceQuote: quotes[0].slice(0, 260),
          verifiedMethod: 'web-source',
          access: 'public',
        };
        // Mosque only with explicit bidet/shattaf in quote (already required).
        if (seenUrl.has(row.sourceUrl)) continue;
        seenUrl.add(row.sourceUrl);
        rows.push(row);
        process.stderr.write(`  + [${row.country}] ${row.name} (${row.type})\n`);
        saveJson(OUT, rows);
        saveJson(CACHE, cache);
      } catch {
        /* skip */
      }
      await sleep(200);
    }
  }

  saveJson(OUT, rows);
  saveJson(STATE, state);
  saveJson(CACHE, cache);
  const byType = rows.reduce((a, r) => {
    a[r.type] = (a[r.type] || 0) + 1;
    return a;
  }, {});
  console.log(`Public-restaurant crawl done: ${rows.length} rows`, byType);

  if (DO_IMPORT && rows.length) {
    const BIDET_RE =
      /\bbidet|\bwashlet|\bshattaf|\bclosomat|\baquaclean|\bhandheld sprayer|\bjapanese toilet/i;
    const existing = readSeed();
    const { merged, added, skipped } = mergeIntoSeed(existing, rows, {
      accept: (row) =>
        !!row.sourceQuote &&
        BIDET_RE.test(row.sourceQuote) &&
        row.type !== 'hotel' &&
        !HOTEL_RE.test(row.name || ''),
    });
    writeSeed(merged);
    console.log(`Import: +${added} new (${skipped} skipped). Seed ${merged.length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
