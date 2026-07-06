#!/usr/bin/env node
/**
 * Long-running Africa bidet crawler — African venues only.
 *
 * Discovers hotels / guest houses / restaurants / masaajid across non-bidet-friendly
 * African countries whose web pages EXPLICITLY mention a bidet, shattaf / Arabic
 * shower, handheld sprayer, douchette, or washlet. Filters out e-commerce/product
 * pages that merely sell sprayers.
 *
 * Sources: DuckDuckGo HTML discovery across country + city + query permutations,
 * plus a curated seed list. Geocodes with photon (komoot), restricted to the
 * target African country codes. Resumable via a state file.
 *
 * Usage:
 *   node scripts/crawl-africa-web.cjs --minutes=90
 *   node scripts/crawl-africa-web.cjs --minutes=90 --import
 *   node scripts/crawl-africa-web.cjs --reset          # clear queue/state
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
  COUNTRY_BY_CODE,
} = require('./lib/africa-web.cjs');

const OUT = path.join(__dirname, '../data/africa-web-crawl-bidets.json');
const STATE = path.join(__dirname, '../data/africa-crawl-state.json');
const CACHE = path.join(__dirname, '../data/africa-geocode-cache.json');

const args = process.argv.slice(2);
const minArg = args.find((a) => a.startsWith('--minutes='));
const MINUTES = minArg ? Number(minArg.split('=')[1]) : 90;
const DO_IMPORT = args.includes('--import');
const RESET = args.includes('--reset');

/** Target countries: code, display name, and cities to search. */
const COUNTRIES = [
  { code: 'KE', name: 'Kenya', cities: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret'] },
  { code: 'UG', name: 'Uganda', cities: ['Kampala', 'Entebbe', 'Jinja'] },
  { code: 'NG', name: 'Nigeria', cities: ['Lagos', 'Abuja', 'Port Harcourt', 'Kano', 'Ibadan', 'Kaduna'] },
  { code: 'TD', name: 'Chad', cities: ["N'Djamena"] },
  { code: 'NE', name: 'Niger', cities: ['Niamey'] },
  { code: 'ET', name: 'Ethiopia', cities: ['Addis Ababa', 'Bahir Dar', 'Adama'] },
  { code: 'SO', name: 'Somalia', cities: ['Mogadishu', 'Hargeisa'] },
  { code: 'ZA', name: 'South Africa', cities: ['Cape Town', 'Johannesburg', 'Durban', 'Pretoria', 'Sandton'] },
  { code: 'TZ', name: 'Tanzania', cities: ['Dar es Salaam', 'Zanzibar', 'Arusha', 'Dodoma'] },
  { code: 'GH', name: 'Ghana', cities: ['Accra', 'Kumasi', 'Takoradi'] },
  { code: 'RW', name: 'Rwanda', cities: ['Kigali'] },
  { code: 'SN', name: 'Senegal', cities: ['Dakar'] },
  { code: 'CI', name: "Cote d'Ivoire", cities: ['Abidjan'] },
  { code: 'CM', name: 'Cameroon', cities: ['Douala', 'Yaounde'] },
  { code: 'ZM', name: 'Zambia', cities: ['Lusaka'] },
  { code: 'ZW', name: 'Zimbabwe', cities: ['Harare', 'Bulawayo'] },
  { code: 'BW', name: 'Botswana', cities: ['Gaborone'] },
  { code: 'NA', name: 'Namibia', cities: ['Windhoek'] },
  { code: 'MZ', name: 'Mozambique', cities: ['Maputo'] },
  { code: 'ML', name: 'Mali', cities: ['Bamako'] },
  { code: 'BF', name: 'Burkina Faso', cities: ['Ouagadougou'] },
];

/** Francophone countries get French phrasing too. */
const FRANCOPHONE = new Set(['TD', 'NE', 'SN', 'CI', 'CM', 'ML', 'BF']);

function queriesFor(country, city) {
  const c = `${city}`;
  const base = [
    `bidet hotel ${c} ${country.name}`,
    `"bidet" room ${c} bathroom`,
    `bidet suite ${c} ${country.name}`,
    `bidet guest house ${c}`,
    `bidet lodge ${c} ${country.name}`,
    `shattaf OR "arabic shower" hotel ${c}`,
    `"private bathroom with a bidet" ${c}`,
    `bidet ${c} site:booking.com`,
    `bidet ${c} hotel site:tripadvisor.com`,
    `bidet ${c} restaurant`,
  ];
  if (FRANCOPHONE.has(country.code)) {
    base.push(
      `douchette hôtel ${c} ${country.name}`,
      `bidet chambre ${c} salle de bain`,
      `hôtel ${c} bidet douchette`
    );
  }
  // country-TLD discovery
  const tld = {
    KE: '.co.ke', UG: '.co.ug', NG: '.com.ng', ZA: '.co.za', TZ: '.co.tz',
    GH: '.com.gh', ET: '.et', RW: '.rw', SN: '.sn', NE: '.ne', TD: '.td',
  }[country.code];
  if (tld) base.push(`bidet hotel ${c} site:${tld}`);
  return base;
}

/**
 * Curated seed URLs (country-pinned so geocoding stays in the right country).
 * These are discovery starting points / directory hubs, not just re-scrapes.
 */
const SEED_URLS = [
  { url: 'https://visitkampala.kcca.go.ug/business_details/-332', country: 'UG', city: 'Kampala' },
  { url: 'https://visitkampala.kcca.go.ug/business_details/capitol-palace-hotel', country: 'UG', city: 'Kampala' },
  { url: 'https://hotels.ng/hotel/1391417-the-duchess-hotel-and-spa', country: 'NG', city: 'Abuja' },
  { url: 'https://www.chapmanspeakhotel.co.za/penthouse-e.htm', country: 'ZA', city: 'Cape Town' },
  { url: 'https://www.africashometours.co.tz/Hotels/Park-Hyatt-Zanzibar.php', country: 'TZ', city: 'Zanzibar' },
  { url: 'https://www.easytravel.co.tz/be/accommodation/royal-cliff-zanzibar/', country: 'TZ', city: 'Zanzibar' },
];

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadState() {
  const s = loadJson(STATE, null);
  if (s) return s;
  return {
    urlQueue: [],
    processedUrls: {},
    countryIndex: 0,
    cityIndex: 0,
    queryIndex: 0,
    seedsDone: false,
    stats: { pages: 0, hits: 0, added: 0, geoFail: 0, searches: 0 },
  };
}

function saveState(s) {
  s.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2) + '\n');
}

function saveOut(rows) {
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
}

function saveCache(c) {
  fs.writeFileSync(CACHE, JSON.stringify(c, null, 2));
}

function normName(n) {
  return String(n).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rowKey(r) {
  return `${normName(r.name)}|${Number(r.latitude || 0).toFixed(4)}|${Number(r.longitude || 0).toFixed(4)}`;
}

async function geocode(query, code, cache) {
  const ck = `${code}|${query}`;
  if (cache[ck] !== undefined) return cache[ck];
  try {
    const url = 'https://photon.komoot.io/api/?limit=1&q=' + encodeURIComponent(query);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BidetBud-Research/1.0 (+https://bidetbud.com)' },
    });
    const j = await res.json();
    const f = j.features?.[0];
    if (!f) {
      cache[ck] = null;
      saveCache(cache);
      return null;
    }
    const p = f.properties;
    if (p.countrycode !== code) {
      cache[ck] = null;
      saveCache(cache);
      await sleep(200);
      return null;
    }
    const [lon, lat] = f.geometry.coordinates;
    const result = {
      lat: String(lat),
      lon: String(lon),
      city: p.city || p.county || p.state || '',
      display: [p.name, p.street, p.city, p.state, p.country].filter(Boolean).join(', '),
    };
    cache[ck] = result;
    saveCache(cache);
    await sleep(250);
    return result;
  } catch (e) {
    return null;
  }
}

async function geocodeRow(parsed, country, city, cache) {
  const queries = [
    parsed.address ? `${parsed.address}` : null,
    `${parsed.name}, ${city}, ${country.name}`,
    `${parsed.name}, ${country.name}`,
    `${city}, ${country.name}`,
  ].filter(Boolean);
  for (const q of queries) {
    const g = await geocode(q, country.code, cache);
    if (g) return g;
  }
  return null;
}

function enqueueSeeds(state) {
  if (state.seedsDone) return;
  for (const s of SEED_URLS) {
    if (!state.processedUrls[s.url]) {
      state.urlQueue.push({ url: s.url, city: s.city || '', country: s.country, via: 'seed' });
    }
  }
  state.seedsDone = true;
  console.log(`Seeds: queued ${SEED_URLS.length} curated URLs`);
}

const JUNK_HOST_RE =
  /facebook|instagram|youtube|twitter|linkedin|wikipedia|pinterest|tiktok|amazon|aliexpress|alibaba|ubuy\.|jumia|kilimall|reddit|quora|yelp|google\.|bing\.|duckduckgo|maps\./i;

/** URL paths that indicate listing / directory / blog pages, not a single venue. */
const JUNK_PATH_RE =
  /\/(?:business-directory|directory|tag|tags|category|categories|search|find|listings?|blog|news|articles?|guide|guides|best-|top-|things-to-do|travel-guide|deals?|offers?)(?:\/|-|$|\?)/i;

function cleanSearchUrls(html, state) {
  return extractUrlsFromSearch(html).filter((u) => {
    if (state.processedUrls[u]) return false;
    if (JUNK_HOST_RE.test(u)) return false;
    if (JUNK_PATH_RE.test(u)) return false;
    if (/\.(?:jpg|jpeg|png|gif|pdf|zip|mp4|webp|css|js)(?:$|\?)/i.test(u)) return false;
    return true;
  });
}

/** Try several search front-ends; return discovered URLs (or [] if all blocked). */
async function searchWeb(q, lang, state) {
  const providers = [
    async () =>
      fetchText('https://lite.duckduckgo.com/lite/', {
        lang,
        method: 'POST',
        body: { q },
        extraHeaders: { Referer: 'https://lite.duckduckgo.com/' },
      }),
    async () =>
      fetchText('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), { lang }),
    async () =>
      fetchText('https://www.mojeek.com/search?q=' + encodeURIComponent(q), { lang }),
    async () =>
      fetchText('https://search.marginalia.nu/search?query=' + encodeURIComponent(q), { lang }),
  ];
  for (let i = 0; i < providers.length; i++) {
    try {
      const html = await providers[i]();
      const urls = cleanSearchUrls(html, state);
      if (urls.length) {
        state.searchBackoff = 0;
        return urls;
      }
    } catch (e) {
      // 202/403/429 → provider is rate-limiting; try the next one.
    }
    await sleep(600);
  }
  // Everything blocked: exponential backoff so we don't hammer.
  state.searchBackoff = Math.min((state.searchBackoff || 0) + 1, 6);
  const wait = 3000 * 2 ** (state.searchBackoff - 1);
  console.warn(`All search providers blocked; backing off ${Math.round(wait / 1000)}s`);
  await sleep(wait);
  return [];
}

async function searchDiscovery(state) {
  const country = COUNTRIES[state.countryIndex % COUNTRIES.length];
  const city = country.cities[state.cityIndex % country.cities.length];
  const queries = queriesFor(country, city);
  const q = queries[state.queryIndex % queries.length];

  const urls = await searchWeb(q, FRANCOPHONE.has(country.code) ? 'fr' : 'en', state);
  let added = 0;
  for (const u of urls.slice(0, 12)) {
    state.urlQueue.push({ url: u.split('#')[0], city, country: country.code, via: `q:${q.slice(0, 28)}` });
    added++;
  }
  state.stats.searches++;
  console.log(`Search [${country.name}/${city}] "${q.slice(0, 42)}…" → +${added}`);
  await sleep(1200);

  // advance query → city → country
  state.queryIndex++;
  if (state.queryIndex % queries.length === 0) {
    state.cityIndex++;
    if (state.cityIndex % country.cities.length === 0) {
      state.countryIndex++;
    }
  }
}

function countryFromCode(code) {
  return COUNTRIES.find((c) => c.code === code) || { code, name: COUNTRY_BY_CODE[code] || '' };
}

async function processUrlBatch(state, rows, rowMap, cache, batch = 10) {
  const items = state.urlQueue.splice(0, batch);
  for (const item of items) {
    const url = item.url.split('#')[0];
    if (state.processedUrls[url]) continue;
    state.processedUrls[url] = Date.now();

    try {
      const html = await fetchText(url, 'en');
      state.stats.pages++;
      if (!hasBidetSignal(html)) continue;
      // Require structured venue data — filters out listicles / blogs / search pages.
      if (!hasVenueSchema(html)) continue;

      // Determine country strictly from the search/seed context (no cross-country guessing).
      let country = item.country ? countryFromCode(item.country) : null;
      if (!country) {
        const guesses = guessCountriesFromUrl(url);
        country = guesses.length === 1 ? countryFromCode(guesses[0]) : null;
      }
      if (!country) {
        // Unknown country → skip (avoids mis-geocoding into the wrong nation).
        continue;
      }

      const parsed = parseVenuePage(html, url, {
        cities: country.cities || (item.city ? [item.city] : []),
        countryName: country.name,
      });
      if (!parsed?.hasBidet) continue;
      state.stats.hits++;

      const geo = await geocodeRow(parsed, country, item.city || '', cache);
      if (!geo) {
        state.stats.geoFail++;
        console.warn('No geocode:', parsed.name.slice(0, 50));
        continue;
      }

      const row = {
        name: parsed.name,
        address: parsed.address || geo.display.split(',').slice(0, 5).join(', '),
        latitude: geo.lat,
        longitude: geo.lon,
        city: item.city || geo.city || '',
        country: country.name,
        type: parsed.type || 'hotel',
        bidetStatus: 'internet',
        bidetType: parsed.bidetType || 'Bidet',
        sourceUrl: parsed.sourceUrl,
        sourceQuote: parsed.sourceQuote,
        verifiedMethod: 'web-source',
        access: 'limited',
        accessNote: 'Verify before visiting',
      };
      const key = rowKey(row);
      if (rowMap.has(key)) continue;
      rowMap.set(key, row);
      rows.push(row);
      state.stats.added++;
      console.log(`+ [${country.name}] ${row.name} (${row.city})`);
      saveOut(rows);
      await sleep(300);
    } catch (e) {
      console.warn('URL fail:', url.slice(0, 60), '-', e.message);
    }
  }
}

function guessCountriesFromUrl(url) {
  const tldMap = {
    '.co.ke': 'KE', '.co.ug': 'UG', '.com.ng': 'NG', '.co.za': 'ZA',
    '.co.tz': 'TZ', '.com.gh': 'GH', '.rw': 'RW', '.et': 'ET',
  };
  for (const [tld, code] of Object.entries(tldMap)) {
    if (url.includes(tld)) return [code];
  }
  return ['ZA', 'KE', 'NG', 'ET', 'TZ', 'UG', 'GH'];
}

function runImport() {
  const { execFileSync } = require('child_process');
  try {
    execFileSync('node', [path.join(__dirname, 'import-africa.cjs')], { stdio: 'inherit' });
  } catch (e) {
    console.warn('Import failed:', e.message);
  }
}

async function main() {
  if (RESET) {
    for (const p of [STATE]) if (fs.existsSync(p)) fs.unlinkSync(p);
    console.log('State reset.');
  }
  const end = Date.now() + MINUTES * 60 * 1000;
  const state = loadState();
  const rows = loadJson(OUT, []);
  const cache = loadJson(CACHE, {});
  const rowMap = new Map(rows.map((r) => [rowKey(r), r]));
  let cycle = 0;

  console.log(`Africa web crawler — ${MINUTES} min across ${COUNTRIES.length} countries`);
  console.log(`Output: ${OUT} | existing rows: ${rows.length} | queue: ${state.urlQueue.length}`);

  enqueueSeeds(state);

  while (Date.now() < end) {
    cycle++;
    // Keep the queue fed: search when it's getting low.
    if (state.urlQueue.length < 20) {
      await searchDiscovery(state);
      await searchDiscovery(state);
    }
    await processUrlBatch(state, rows, rowMap, cache, 10);

    saveState(state);
    if (cycle % 5 === 0) {
      const s = state.stats;
      console.log(
        `\n[cycle ${cycle}] pages=${s.pages} hits=${s.hits} added=${s.added} ` +
          `geoFail=${s.geoFail} searches=${s.searches} rows=${rows.length} queue=${state.urlQueue.length}\n`
      );
    }
    if (DO_IMPORT && cycle % 25 === 0) runImport();
    await sleep(300);
  }

  saveState(state);
  saveOut(rows);
  console.log(`\nDone: ${cycle} cycles, ${rows.length} rows in ${OUT}`);
  console.log('Stats:', state.stats);
  if (DO_IMPORT) runImport();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
