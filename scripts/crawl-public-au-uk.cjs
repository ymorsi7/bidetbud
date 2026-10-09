#!/usr/bin/env node
/**
 * Public-only AU / UK / NZ crawl: restaurants, cafes, mosques, malls, libraries.
 * Skips hotels. Every row needs an explicit bidet / washlet / shattaf quote.
 *
 *   node scripts/crawl-public-au-uk.cjs --minutes=45
 *   node scripts/crawl-public-au-uk.cjs --minutes=45 --import
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

const MINUTES = Number((process.argv.find((a) => a.startsWith('--minutes=')) || '--minutes=40').split('=')[1]);
const DO_IMPORT = process.argv.includes('--import');
const RESET = process.argv.includes('--reset');

const OUT = path.join(__dirname, '../data/public-au-uk-crawl-bidets.json');
const STATE = path.join(__dirname, '../data/public-au-uk-crawl-state.json');
const CACHE = path.join(__dirname, '../data/public-au-uk-geocode-cache.json');

const HOTEL_RE =
  /\b(hotel|motel|inn|resort|hostel|suites|lodge|marriott|hilton|hyatt|sheraton|westin|radisson|sofitel|novotel|ibis|mercure|airbnb|serviced apartment)\b/i;

const PUBLIC_CTX =
  /\b(mosque|masjid|islamic|restaurant|cafe|caf[eé]|toilet|bathroom|restroom|washroom|mall|shopping\s+centre|airport|library|museum|leisure|changing\s+places|showroom|sushi|ramen|izakaya)\b/i;

const REGIONS = [
  {
    country: 'UK',
    codes: 'gb',
    host: /\.uk\b|co\.uk|gov\.uk|tripadvisor\.co\.uk|timeout\.com/i,
    cities: [
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
      'Leicester',
      'Brighton',
      'Oxford',
      'Cambridge',
      'Southampton',
      'York',
      'Bath',
      'Reading',
      'Coventry',
      'Bradford',
      'Luton',
      'Slough',
      'Leicester',
      'Birmingham Sparkbrook',
      'East London',
      'West London',
    ],
  },
  {
    country: 'Australia',
    codes: 'au',
    host: /\.au\b|tripadvisor\.com\.au|broadsheet\.com\.au|timeout\.com|concreteplayground\.com/i,
    cities: [
      'Sydney',
      'Melbourne',
      'Brisbane',
      'Perth',
      'Adelaide',
      'Canberra',
      'Gold Coast',
      'Hobart',
      'Darwin',
      'Newcastle NSW',
      'Wollongong',
      'Geelong',
      'Cairns',
      'Parramatta',
      'Auburn NSW',
      'Lakemba',
      'Broadmeadows',
      'Dandenong',
    ],
  },
  {
    country: 'New Zealand',
    codes: 'nz',
    host: /\.nz\b|tripadvisor\.co\.nz/i,
    cities: ['Auckland', 'Wellington', 'Christchurch', 'Hamilton NZ', 'Dunedin'],
  },
];

function queries(city, country) {
  const where = country === 'UK' ? `${city} UK` : city;
  return [
    `"bidet" (mosque OR masjid OR "islamic centre" OR "islamic center") ${where}`,
    `"shattaf" mosque ${where}`,
    `"bidet spray" (mosque OR masjid) ${where}`,
    `"washlet" (restaurant OR cafe OR sushi) ${where}`,
    `"japanese toilet" restaurant ${where}`,
    `"toto washlet" restaurant ${where}`,
    `"bidet" (mall OR "shopping centre" OR "food court") toilet ${where}`,
    `"bidet" "public toilet" ${where}`,
    `"bidet" (library OR museum) toilet ${where}`,
    country === 'UK' ? `"closomat" "wash and dry" ${city}` : `"washlet" showroom ${city} Australia`,
    `"handheld bidet" restaurant ${where}`,
  ].filter(Boolean);
}

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
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
    () => fetchText('https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(q), { lang: 'en' }),
    () => fetchText('https://www.mojeek.com/search?q=' + encodeURIComponent(q), { lang: 'en' }),
    () => fetchText('https://search.marginalia.nu/search?query=' + encodeURIComponent(q), { lang: 'en' }),
  ];
  for (const fn of engines) {
    try {
      const html = await fn();
      const urls = extractUrlsFromSearch(html).filter((u) => hostRe.test(u) && !/duckduckgo|google\./i.test(u));
      if (urls.length) return urls;
    } catch {
      /* next */
    }
    await sleep(400);
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
              address: [p.name, p.street, p.housenumber, p.city, p.state, p.country].filter(Boolean).join(', '),
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

function publicVenuePage(html) {
  if (looksLikeShop(html)) return false;
  if (hasVenueSchema(html)) return true;
  if (/"streetAddress"\s*:\s*"[^"]{4,}"/i.test(html)) return true;
  if (/\b(mosque|masjid|islamic centre|islamic center)\b/i.test(html) && /\d+\s+\w+/i.test(html)) return true;
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

  while (Date.now() < end) {
    if (!state.queue.length) {
      const job = jobs[state.qi];
      if (!job) break;
      console.log(`Search: ${job.q}`);
      const urls = await searchWeb(job.q, job.region.host);
      state.qi++;
      for (const u of urls.slice(0, 12)) {
        if (!state.seen[u]) {
          state.queue.push({ url: u, city: job.city, country: job.region.country, codes: job.region.codes });
          state.seen[u] = 1;
        }
      }
      saveJson(STATE, state);
      await sleep(1100);
      continue;
    }

    const job = state.queue.shift();
    if (!job || seenUrl.has(job.url)) continue;
    try {
      const html = await fetchText(job.url, { lang: 'en' });
      if (!hasBidetSignal(html) && !extractBidetSentences(html).some((s) => PUBLIC_CTX.test(s))) continue;
      if (!publicVenuePage(html)) continue;
      const parsed = parseVenuePage(html, job.url, { cities: [job.city], countryName: job.country });
      if (!parsed?.name) continue;
      if (HOTEL_RE.test(parsed.name)) continue;
      const type = inferType({ name: parsed.name }) || 'public';
      if (type === 'hotel' || HOTEL_RE.test(type)) continue;
      const geo = await photon(`${parsed.name}, ${parsed.address || job.city}, ${job.country}`, job.codes, cache);
      await sleep(180);
      if (!geo) continue;
      const quote =
        parsed.sourceQuote ||
        extractBidetSentences(html).find((s) => PUBLIC_CTX.test(s)) ||
        parsed.quote;
      if (!quote) continue;
      const row = {
        name: parsed.name,
        ...geo,
        address: parsed.address || geo.address,
        country: job.country,
        type: type === 'unknown' ? 'public' : type,
        sourceUrl: job.url,
        sourceQuote: String(quote).slice(0, 240),
        bidetType: /washlet|toto|neorest|closomat|aquaclean/i.test(html)
          ? 'TOTO / washlet bidet'
          : /shattaf|handheld|spray/i.test(html)
            ? 'Handheld sprayer'
            : 'Bidet',
        access: 'public',
        verifiedMethod: 'web-source',
      };
      rows.push(row);
      seenUrl.add(job.url);
      saveJson(OUT, rows);
      saveJson(CACHE, cache);
      console.log(`+ ${row.name} [${row.country}] (${rows.length})`);
    } catch {
      /* skip */
    }
    await sleep(700);
  }

  saveJson(STATE, state);
  saveJson(OUT, rows);
  console.log(`Public AU/UK crawl done: ${rows.length} rows`);
  if (DO_IMPORT) {
    require('child_process').execSync('node scripts/import-public-au-uk.cjs', { stdio: 'inherit' });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
