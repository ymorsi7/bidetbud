#!/usr/bin/env node
/**
 * Long-running France bidet crawler — French websites and FR-market sources.
 *
 * Usage:
 *   node scripts/crawl-france-web.cjs --minutes=90
 *   node scripts/crawl-france-web.cjs --minutes=90 --import
 */
const fs = require('fs');
const path = require('path');
const {
  sleep,
  fetchText,
  parseGenericFrenchPage,
  parseGeberitFrReference,
  parseTotoFrReference,
  extractTotoFrSlugs,
  extractUrlsFromSearch,
  isFrenchDomain,
  isFranceRelevant,
  isValidRowName,
  FRANCE_SLUG_RE,
  FRANCE_TOTO_SLUGS,
  hasBidetSignal,
} = require('./lib/france-web.cjs');

const TOTO_REF = path.join(__dirname, '../data/toto-europe-references.json');
const OUT = path.join(__dirname, '../data/france-web-crawl-bidets.json');
const STATE = path.join(__dirname, '../data/france-crawl-state.json');
const CACHE = path.join(__dirname, '../data/france-geocode-cache.json');

const args = process.argv.slice(2);
const minArg = args.find((a) => a.startsWith('--minutes='));
const MINUTES = minArg ? Number(minArg.split('=')[1]) : 90;
const DO_IMPORT = args.includes('--import');

const TOTO_BASE = 'https://eu.toto.com';

const CITIES = [
  { city: 'Paris', fr: 'Paris' },
  { city: 'Lyon', fr: 'Lyon' },
  { city: 'Marseille', fr: 'Marseille' },
  { city: 'Nice', fr: 'Nice' },
  { city: 'Bordeaux', fr: 'Bordeaux' },
  { city: 'Strasbourg', fr: 'Strasbourg' },
  { city: 'Toulouse', fr: 'Toulouse' },
  { city: 'Nantes', fr: 'Nantes' },
  { city: 'Lille', fr: 'Lille' },
  { city: 'Montpellier', fr: 'Montpellier' },
  { city: 'Nîmes', fr: 'Nîmes' },
  { city: 'Courchevel', fr: 'Courchevel' },
  { city: 'Lourdes', fr: 'Lourdes' },
  { city: 'Narbonne', fr: 'Narbonne' },
  { city: 'Arras', fr: 'Arras' },
  { city: 'Levernois', fr: 'Levernois' },
  { city: 'Saint-Gervais-les-Bains', fr: 'Saint-Gervais-les-Bains' },
  { city: 'Mougins', fr: 'Mougins' },
  { city: 'Cannes', fr: 'Cannes' },
  { city: 'Rennes', fr: 'Rennes' },
];

const SEARCH_QUERIES = (cityFr) => [
  `site:geberit.fr WC lavant hôtel ${cityFr}`,
  `site:eu.toto.com/fr Washlet ${cityFr}`,
  `site:booking.com/fr toilette japonaise ${cityFr}`,
  `site:tripadvisor.fr washlet ${cityFr}`,
  `site:geberit-alba.fr AquaClean ${cityFr}`,
  `WC lavant hôtel ${cityFr} site:.fr`,
  `toilette japonaise hôtel ${cityFr} site:.fr`,
  `Washlet ${cityFr} hôtel site:.fr`,
  `AquaClean ${cityFr} site:.fr`,
  `TOTO Washlet ${cityFr} site:.fr`,
  `site:les-toilettes-japonaises.fr ${cityFr}`,
  `site:paperblog.fr AquaClean ${cityFr}`,
  `site:tophotel.news AquaClean ${cityFr} France`,
  `douchette WC hôtel ${cityFr}`,
];

const SEED_URLS = [
  'https://eu.toto.com/fr/lentreprise/references',
  'https://eu.toto.com/fr/service/tester-le-washlettm',
  'https://www.geberit.fr/produits-de-salle-de-bains/espace-wc/wc-lavants-geberit-aquaclean/essai/',
  'https://www.geberit-alba.fr/',
  'https://www.les-toilettes-japonaises.fr/exposition-wc-japonais/',
  'https://www.manolitaparis.com/chambres',
  'https://www.lebatimentperformant.fr/',
  'https://www.cattoire.com/architecture-btp/a-hostellerie-de-levernois-geberit-participe-aux-nouveaux-codes-de-lhospitalite-haut-de-gamme/',
  'https://tophotel.news/legendary-luxury-mandarin-oriental-lutetia-hotel-paris-enhanced-by-geberit-aquaclean-mera/',
  'https://www.paperblog.fr/9871867/decouverte-de-l-hotel-le-mosaique-a-narbonne-avec-geberit/',
  'https://www.hotel-spa-fairway.com/hotel-arras/suites-chambres-hotel-moderne.php',
  'https://hotellemosaique.com/',
  'https://www.france.toyoko-inn.com/marseille/',
  'https://www.arukikata.co.jp/tokuhain/236314/',
  ...FRANCE_TOTO_SLUGS.map(
    (s) => `https://eu.toto.com/fr/lentreprise/references/${s}`
  ),
];

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return {
      urlQueue: [],
      totoQueue: [],
      processedUrls: {},
      processedToto: {},
      cityIndex: 0,
      queryIndex: 0,
      seedsDone: false,
      stats: { toto: 0, generic: 0, added: 0 },
    };
  }
}

function saveState(s) {
  s.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2) + '\n');
}

function loadOut() {
  try {
    return JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {
    return [];
  }
}

function saveOut(rows) {
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
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

function normName(n) {
  return String(n).toLowerCase().replace(/[^a-z0-9àâäéèêëïîôùûüç]/g, '');
}

function mergeRow(rows, row) {
  const key = `${normName(row.name)}|${Number(row.latitude || 0).toFixed(4)}|${Number(row.longitude || 0).toFixed(4)}`;
  const map = new Map(
    rows.map((r) => [
      `${normName(r.name)}|${Number(r.latitude || 0).toFixed(4)}|${Number(r.longitude || 0).toFixed(4)}`,
      r,
    ])
  );
  if (!map.has(key)) map.set(key, row);
  return [...map.values()];
}

async function geocode(query, cache) {
  if (cache[query]) return cache[query];
  try {
    const url = 'https://photon.komoot.io/api/?limit=1&q=' + encodeURIComponent(query);
    const res = await fetch(url);
    const j = await res.json();
    const f = j.features?.[0];
    if (!f) return null;
    const [lon, lat] = f.geometry.coordinates;
    const p = f.properties;
    if (p.countrycode !== 'FR') return null;
    const result = {
      lat: String(lat),
      lon: String(lon),
      display: [p.name, p.street, p.city, p.state, p.country].filter(Boolean).join(', '),
      city: p.city || '',
    };
    cache[query] = result;
    saveCache(cache);
    await sleep(200);
    return result;
  } catch {
    return null;
  }
}

async function geocodeRow(name, address, city, cache) {
  const queries = [
    address ? `${address}, France` : null,
    `${name}, ${city}, France`,
    `${name}, France`,
    `${name} hôtel France`,
  ].filter(Boolean);
  for (const q of queries) {
    const g = await geocode(q, cache);
    if (g) return g;
  }
  return null;
}

function toRow(parsed, city, sourceLabel) {
  const isMfr =
    parsed.verifiedMethod === 'manufacturer-reference' ||
    /toto|geberit/i.test(parsed.sourceUrl || '');
  return {
    name: parsed.name,
    address: parsed.address || '',
    city: city.city || city || '',
    type: /restaurant|gastronomie|brasserie/i.test(parsed.name || '')
      ? 'restaurant'
      : /showroom|distributeur|exposition/i.test(parsed.name || '')
        ? 'public'
        : 'hotel',
    bidetStatus: parsed.bidetStatus || (isMfr ? 'warmed' : 'internet'),
    bidetType: parsed.bidetType || 'WC lavant',
    sourceUrl: parsed.sourceUrl,
    sourceQuote: parsed.sourceQuote.startsWith(sourceLabel)
      ? parsed.sourceQuote
      : `${sourceLabel}: ${parsed.sourceQuote}`,
    verifiedMethod: parsed.verifiedMethod || (isMfr ? 'manufacturer-reference' : 'web-source'),
    access: /showroom|distributeur/i.test(parsed.name || '') ? 'public' : 'limited',
    accessNote:
      /showroom|distributeur/i.test(parsed.name || '')
        ? 'Showroom — horaires sur place'
        : 'Clients de l\'établissement — vérifier avant visite',
  };
}

function seedFromTotoJson(rows) {
  try {
    const toto = JSON.parse(fs.readFileSync(TOTO_REF, 'utf8'));
    let added = 0;
    for (const r of toto) {
      if (r.country !== 'France') continue;
      if (/^(Louvre|Viparis)\b/i.test(r.name)) continue;
      if (!isValidRowName(r.name)) continue;
      if (!/washlet|wc lavant|toilette japonaise|neorest/i.test(`${r.sourceQuote} ${r.bidetType}`))
        continue;
      const key = normName(r.name);
      if (rows.some((x) => normName(x.name) === key)) continue;
      rows.push({
        name: r.name,
        address: r.address,
        latitude: r.latitude,
        longitude: r.longitude,
        city: r.city,
        type: r.type || 'hotel',
        bidetStatus: r.bidetStatus || 'warmed',
        bidetType: r.bidetType || 'TOTO WASHLET',
        sourceUrl: r.sourceUrl,
        sourceQuote: r.sourceQuote,
        verifiedMethod: r.verifiedMethod || 'manufacturer-reference',
        access: r.access || 'limited',
        accessNote: r.accessNote || 'Clients de l\'établissement',
      });
      added++;
    }
    if (added) console.log(`TOTO JSON seed: +${added} France rows`);
  } catch (e) {
    console.warn('TOTO JSON seed:', e.message);
  }
}

function enqueueSeeds(state) {
  if (state.seedsDone) return;
  for (const url of SEED_URLS) {
    if (!state.processedUrls[url]) state.urlQueue.push({ url, city: '', via: 'seed' });
  }
  for (const slug of FRANCE_TOTO_SLUGS) {
    if (!state.processedToto[slug]) state.totoQueue.push(slug);
  }
  state.seedsDone = true;
  console.log(`Seeds: ${SEED_URLS.length} URLs, ${FRANCE_TOTO_SLUGS.length} TOTO slugs`);
}

async function discoverTotoFr(state) {
  if (state.totoDiscovered) return;
  try {
    const html = await fetchText(`${TOTO_BASE}/fr/lentreprise/references`);
    const slugs = extractTotoFrSlugs(html).filter((s) => FRANCE_SLUG_RE.test(s));
    for (const slug of slugs) {
      if (state.processedToto[slug]) continue;
      state.totoQueue.push(slug);
    }
    state.totoDiscovered = true;
    console.log(`TOTO FR: queued ${state.totoQueue.length} reference slugs`);
    await sleep(500);
  } catch (e) {
    console.warn('TOTO index:', e.message);
  }
}

async function processTotoBatch(state, rows, cache, batch = 8) {
  const items = state.totoQueue.splice(0, batch);
  for (const slug of items) {
    if (state.processedToto[slug]) continue;
    state.processedToto[slug] = Date.now();
    const url = `${TOTO_BASE}/fr/lentreprise/references/${slug}`;
    try {
      const html = await fetchText(url);
      const parsed = parseTotoFrReference(html, slug, url);
      if (!parsed?.hasBidet || !isValidRowName(parsed.name)) continue;
      if (!isFranceRelevant(html + parsed.name, '', slug)) continue;
      state.stats.toto++;

      const geo = await geocodeRow(parsed.name, parsed.address, '', cache);
      if (!geo) {
        console.warn('No geocode (TOTO):', parsed.name);
        continue;
      }

      const cityEntry =
        CITIES.find((c) => geo.display.toLowerCase().includes(c.fr.toLowerCase())) || {
          city: geo.city || '',
        };
      const row = {
        ...toRow(parsed, cityEntry, 'TOTO Europe FR'),
        latitude: geo.lat,
        longitude: geo.lon,
        address: parsed.address || geo.display.split(',').slice(0, 5).join(', '),
        city: cityEntry.city || geo.city,
      };
      const merged = mergeRow(rows, row);
      rows.length = 0;
      rows.push(...merged);
      state.stats.added++;
      console.log(`+ [TOTO] ${row.name}`);
      saveOut(rows);
      await sleep(400);
    } catch (e) {
      console.warn('TOTO fail:', slug, e.message);
    }
  }
}

function extractBingUrls(html) {
  const out = [];
  for (const m of html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"/gi)) {
    const u = m[1];
    if (/bing\.com|microsoft\.com|duckduckgo/i.test(u)) continue;
    out.push(u);
  }
  return [...new Set(out)];
}

async function searchDiscovery(state) {
  const city = CITIES[state.cityIndex % CITIES.length];
  const queries = SEARCH_QUERIES(city.fr);
  const q = queries[state.queryIndex % queries.length];
  state.queryIndex++;

  try {
    const engines = [
      'https://html.duckduckgo.com/html/?q=',
      'https://lite.duckduckgo.com/lite/?q=',
      'https://www.bing.com/search?q=',
    ];
    const searchUrl = engines[state.queryIndex % engines.length] + encodeURIComponent(q);
    const html = await fetchText(searchUrl, 'fr-FR');
    const urls = [...extractUrlsFromSearch(html), ...extractBingUrls(html)].filter((u) => {
      if (state.processedUrls[u]) return false;
      if (!isFrenchDomain(u) && !/eu\.toto\.com\/fr|booking\.com\/fr/i.test(u)) return false;
      if (/facebook|instagram|youtube|twitter|linkedin|wikipedia/i.test(u)) return false;
      return true;
    });
    let added = 0;
    for (const u of urls.slice(0, 10)) {
      state.urlQueue.push({ url: u, city: city.city, via: `search:${q.slice(0, 30)}` });
      added++;
    }
    console.log(`Search [${city.fr}] "${q.slice(0, 45)}…" → +${added} URLs`);
    await sleep(1400);
  } catch (e) {
    console.warn('Search fail:', e.message);
  }

  if (state.queryIndex % queries.length === 0) state.cityIndex++;
}

async function processUrlBatch(state, rows, cache, batch = 10) {
  const items = state.urlQueue.splice(0, batch);
  for (const item of items) {
    const url = item.url.split('#')[0];
    if (state.processedUrls[url]) continue;
    state.processedUrls[url] = Date.now();

    try {
      if (/eu\.toto\.com\/fr\/lentreprise\/references/i.test(url)) {
        const slug = url.split('/').pop();
        const html = await fetchText(url);
        const parsed = parseTotoFrReference(html, slug, url);
        if (!parsed?.hasBidet || !isValidRowName(parsed.name)) continue;
        state.stats.toto++;
        const geo = await geocodeRow(parsed.name, parsed.address, item.city, cache);
        if (!geo) continue;
        const row = {
          ...toRow(parsed, { city: item.city || geo.city }, 'TOTO Europe FR'),
          latitude: geo.lat,
          longitude: geo.lon,
          address: parsed.address || geo.display.split(',').slice(0, 5).join(', '),
          city: item.city || geo.city,
        };
        const merged = mergeRow(rows, row);
        rows.length = 0;
        rows.push(...merged);
        state.stats.added++;
        console.log(`+ [TOTO URL] ${row.name}`);
        saveOut(rows);
        await sleep(400);
        continue;
      }

      if (/geberit\.fr/i.test(url)) {
        const html = await fetchText(url);
        const parsed = parseGeberitFrReference(html, url);
        if (!parsed?.hasBidet) continue;
        const geo = await geocodeRow(parsed.name, parsed.address, item.city, cache);
        if (!geo) continue;
        const row = {
          ...toRow(parsed, { city: item.city || geo.city }, 'Geberit FR'),
          latitude: geo.lat,
          longitude: geo.lon,
          address: parsed.address || geo.display.split(',').slice(0, 5).join(', '),
          city: item.city || geo.city,
        };
        const merged = mergeRow(rows, row);
        rows.length = 0;
        rows.push(...merged);
        state.stats.added++;
        console.log(`+ [Geberit] ${row.name}`);
        saveOut(rows);
        await sleep(400);
        continue;
      }

      const html = await fetchText(url);
      if (!hasBidetSignal(html)) continue;
      const parsed = parseGenericFrenchPage(html, url);
      if (!parsed?.hasBidet || !isValidRowName(parsed.name)) continue;
      if (!isFranceRelevant(html + parsed.name, item.city, '', url)) continue;
      state.stats.generic++;

      const geo = await geocodeRow(parsed.name, parsed.address, item.city, cache);
      if (!geo) {
        console.warn('No geocode:', parsed.name);
        continue;
      }

      const label = /booking\.com/i.test(url)
        ? 'Booking.com FR'
        : /tripadvisor\.fr/i.test(url)
          ? 'TripAdvisor FR'
          : /geberit-alba/i.test(url)
            ? 'Geberit Alba FR'
            : /paperblog|tophotel/i.test(url)
              ? 'Presse hôtelière FR'
              : 'Source web FR';

      const row = {
        ...toRow(parsed, { city: item.city || geo.city }, label),
        latitude: geo.lat,
        longitude: geo.lon,
        address: parsed.address || geo.display.split(',').slice(0, 5).join(', '),
        city: item.city || geo.city,
      };
      const merged = mergeRow(rows, row);
      rows.length = 0;
      rows.push(...merged);
      state.stats.added++;
      console.log(`+ [${label}] ${row.name}`);
      saveOut(rows);
      await sleep(450);
    } catch (e) {
      console.warn('URL fail:', url.slice(0, 70), e.message);
    }
  }
}

function runImport() {
  const { execFileSync } = require('child_process');
  try {
    execFileSync('node', [path.join(__dirname, 'merge-france-crawl.cjs')], { stdio: 'inherit' });
    execFileSync('node', [path.join(__dirname, 'scrape-france-sources.cjs')], { stdio: 'inherit' });
    execFileSync('node', [path.join(__dirname, 'import-france.cjs')], { stdio: 'inherit' });
  } catch (e) {
    console.warn('Import failed:', e.message);
  }
}

async function main() {
  const end = Date.now() + MINUTES * 60 * 1000;
  const state = loadState();
  let rows = loadOut();
  const cache = loadCache();
  let cycle = 0;

  console.log(`France web crawler — ${MINUTES} min`);
  console.log(`Output: ${OUT} | existing: ${rows.length}`);

  enqueueSeeds(state);
  seedFromTotoJson(rows);
  saveOut(rows);
  await discoverTotoFr(state);

  while (Date.now() < end) {
    cycle++;
    console.log(`\n=== Cycle ${cycle} ===`);

    await processTotoBatch(state, rows, cache, 6);
    await processUrlBatch(state, rows, cache, 12);
    await searchDiscovery(state);

    saveState(state);
    console.log(
      `Stats: toto=${state.stats.toto} generic=${state.stats.generic} ` +
        `added=${state.stats.added} rows=${rows.length} uQ=${state.urlQueue.length} ` +
        `tQ=${state.totoQueue.length}`
    );

    if (DO_IMPORT && cycle % 5 === 0) runImport();
    await sleep(400);
  }

  saveState(state);
  saveOut(rows);
  console.log(`\nDone ${cycle} cycles. Total rows: ${rows.length}`);
  if (DO_IMPORT) runImport();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
