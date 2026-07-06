'use strict';
/**
 * Shared helpers for scraping Geberit AquaClean "hotels with a shower toilet"
 * reference pages and geocoding the venues they list.
 *
 * Geberit publishes per-country lists of hotels that have installed AquaClean
 * shower toilets (each entry = manufacturer-confirmed bidet install). The pages
 * are server-rendered with Geberit's shared "gdds" design-system markup, so a
 * single parser works across languages:
 *
 *   <section class="text-image_wrapper..." id="section-...">
 *     <h4 class="gdds-headline ... headline_headlineH2__..."><span>NAME</span></h4>
 *     <p>...description...</p>
 *     <a href="https://hotel-website" data-testid="link-input">...</a>
 *   </section>
 *
 * A hotel entry is recognised as: a headline immediately followed (before the
 * next headline) by an external website link (data-testid="link-input" whose
 * host is not geberit.*). Region headings (accordion titles) are attached when
 * present so geocoding can disambiguate.
 *
 * NOTE: the fully comprehensive "500+ hotels" list that powers Geberit's
 * interactive Hotel Locator (the Google-Maps widget) IS statically fetchable —
 * the widget loads a single JSON feed (see LOCATOR_URLS / fetchLocator below)
 * containing ~495 venues across ~17 countries, each with coordinates and the
 * installed AquaClean models. That feed is the primary source; these per-country
 * reference pages remain as a secondary, human-readable cross-check.
 */

/**
 * Country reference pages. `country` is the value written to the seed;
 * `cc` is the ISO-3166 alpha-2 code used to constrain geocoding.
 */
const SOURCES = [
  {
    country: 'Netherlands',
    cc: 'nl',
    url: 'https://www.geberit.nl/badkamerproducten/wc-s-urinoirs/geberit-aquaclean-douchewc/testen/hotel-referenties/',
  },
  {
    country: 'Germany',
    cc: 'de',
    url: 'https://www.geberit.de/badezimmerprodukte/wcs-urinale/dusch-wcs-geberit-aquaclean/testen/hotels-mit-dusch-wc/',
  },
  {
    country: 'Denmark',
    cc: 'dk',
    url: 'https://www.geberit.dk/badevaerelsesprodukter/toiletter-urinaler/douchetoilet-geberit-aquaclean/test-og-koeb/hotel-douchetoiletter/',
  },
  {
    country: 'Austria',
    cc: 'at',
    url: 'https://www.geberit.at/badezimmerprodukte/wcs-urinale/dusch-wcs-geberit-aquaclean/testen/dusch-wc-hotel/',
  },
  {
    country: 'Switzerland',
    cc: 'ch',
    url: 'https://www.geberit.ch/badezimmerprodukte/wcs-urinale/dusch-wcs-geberit-aquaclean/testen/dusch-wc-hotel/',
  },
  // NOTE: France is intentionally omitted — geberit.fr routes hotels through the
  // JS-only locator and its static "hotels-equipes" page merely mirrors German
  // example venues. Curated French hotels live in scrape-geberit-france-hotels.cjs.
];

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * Geberit's interactive AquaClean "Hotel Locator" (the Google-Maps widget that
 * claims 500+ hotels) is fed by a single static JSON file — the COMPLETE
 * European dataset (~495 venues across ~17 countries), each row already carrying
 * name, address, coordinates, phone, website and the installed AquaClean models.
 * Every locale site serves an identical copy; we try a handful for resilience.
 */
const LOCATOR_URLS = [
  'https://www.geberit.de/_assets/local-media/locators/2026-q2-hotellocator-de.json',
  'https://www.geberit.nl/_assets/local-media/locators/2026-q2-hotellocator-nl.json',
  'https://www.geberit.it/_assets/local-media/locators/2026-q2-hotellocator-it.json',
  'https://www.geberit.fr/_assets/local-media/locators/2026-q2-hotellocator-fr.json',
  'https://www.geberit.dk/_assets/local-media/locators/2026-q2-hotellocator-dk.json',
];

/** The human-facing Geberit page that embeds the Hotel Locator (evidence URL). */
const LOCATOR_PAGE_URL =
  'https://www.geberit.de/badezimmerprodukte/wcs-urinale/dusch-wcs-geberit-aquaclean/testen/hotels-mit-dusch-wc/';

/** ISO-3166 alpha-2 (as used in the locator feed) -> seed country name. */
const CC_TO_COUNTRY = {
  DE: 'Germany',
  AT: 'Austria',
  CH: 'Switzerland',
  BE: 'Belgium',
  LI: 'Liechtenstein',
  CZ: 'Czech Republic',
  DK: 'Denmark',
  FI: 'Finland',
  FR: 'France',
  IT: 'Italy',
  NL: 'Netherlands',
  NO: 'Norway',
  PL: 'Poland',
  RU: 'Russia',
  SK: 'Slovakia',
  SE: 'Sweden',
  UK: 'UK',
  GB: 'UK',
  LU: 'Luxembourg',
  IE: 'Ireland',
  LV: 'Latvia',
};

/** Strip a leading postal code from a "ZIP City" string and return the city. */
function cityFromZipLocation(zip) {
  if (!zip) return '';
  const original = decodeEntities(String(zip)).trim();
  // Drop a leading postcode only. Order matters, and each alternative must be a
  // whole token (followed by whitespace/end) so we don't slice the city's first
  // letters — e.g. "6003 Luzern" must not match the NL "1931 XL" shape as
  // "6003 Lu". Alternatives: UK (SL5 7SE), NL (1931 XL), numeric (3-6 digits).
  const s = original
    .replace(
      /^\s*(?:[A-Z]{1,2}\d[\dA-Z]?\s*\d[A-Z]{2}|\d{4}\s?[A-Z]{2}(?=\s|$)|\d{3,6})[,]?\s+/,
      ''
    )
    // Keep the primary locality (before a "/" district split).
    .split('/')[0]
    .trim();
  return s || original;
}

/** Clean a coordinate string from the feed (strips stray commas/spaces). */
function cleanCoord(v) {
  if (v == null) return '';
  const s = String(v).replace(/[^0-9.\-]/g, '');
  return Number.isFinite(Number(s)) && s !== '' ? s : '';
}

/** Normalise one locator feed record into a seed-ready row. */
function locatorRowToSeed(r) {
  const models = (r.models || [])
    .map((m) => m && m.product)
    .filter(Boolean);
  const uniqModels = [...new Set(models)];
  const bidetType = uniqModels[0] || 'Geberit AquaClean shower toilet';
  const country = CC_TO_COUNTRY[r.country] || r.country;
  let city = cityFromZipLocation(r.zip_location);
  // Fallback: some rows put only a postcode in zip_location (e.g. Czech "412 01")
  // and the town in the address — derive city from the address minus house number.
  if (!city || /^\d/.test(city) || city.length < 3) {
    const addr = decodeEntities(r.address || '')
      .replace(/\s+\d+[a-z]?$/i, '')
      .trim();
    if (addr && !/^\d/.test(addr)) city = addr;
  }
  const modelText = uniqModels.length
    ? uniqModels.join(', ')
    : 'Geberit AquaClean shower toilet';
  return {
    name: decodeEntities(r.name || '').trim(),
    address: [decodeEntities(r.address || '').trim(), decodeEntities(r.zip_location || '').trim()]
      .filter(Boolean)
      .join(', '),
    latitude: cleanCoord(r.lat),
    longitude: cleanCoord(r.lng),
    city,
    country,
    cc: (r.country || '').toLowerCase(),
    type: 'hotel',
    bidetStatus: 'warmed',
    bidetType,
    sourceUrl: LOCATOR_PAGE_URL,
    sourceQuote: `Listed in Geberit's official AquaClean Hotel Locator (${modelText} installed).`,
    verifiedMethod: 'manufacturer-reference',
    access: 'limited',
    accessNote: 'Hotel guests — AquaClean shower toilet in select room categories',
    website: r.website || '',
  };
}

async function fetchLocator() {
  let lastErr;
  for (const url of LOCATOR_URLS) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const j = await res.json();
      const entries = Array.isArray(j) ? j : j.entries || [];
      if (entries.length) return { url, entries };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error('Could not fetch Geberit hotel locator: ' + (lastErr && lastErr.message));
}

/** [minLat, maxLat, minLon, maxLon] per country code — reject geocoder drift. */
const COUNTRY_BBOX = {
  nl: [50.6, 53.7, 3.2, 7.4],
  de: [47.1, 55.2, 5.7, 15.2],
  dk: [54.4, 57.9, 7.9, 15.3],
  at: [46.2, 49.2, 9.4, 17.3],
  ch: [45.7, 48.0, 5.8, 10.6],
};

function inCountry(cc, lat, lon) {
  const bb = COUNTRY_BBOX[cc];
  if (!bb) return true;
  const la = Number(lat);
  const lo = Number(lon);
  return la >= bb[0] && la <= bb[1] && lo >= bb[2] && lo <= bb[3];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#xE9;/g, 'é')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function stripTags(html) {
  return decodeEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Names that are partnership / association blocks, never an individual venue.
 * (Most section headings are already excluded because they link internally,
 * not to an external hotel website.)
 */
const SKIP_NAME = /^(partnerschaft(en)?|partnerships?|partenariats?)$/i;

/** Region accordions that group Dutch-run guesthouses located abroad. */
const SKIP_REGION = /bekijk de hotels|buitenland|im ausland|à l'étranger|abroad/i;

/**
 * Parse a Geberit reference page's HTML into hotel rows.
 * Returns [{ name, website, region, description }].
 */
function parseHotels(html) {
  // Locate every gdds headline (these delimit content blocks).
  const headlineRe =
    /<h[234][^>]*class="[^"]*gdds-headline[^"]*"[^>]*>([\s\S]*?)<\/h[234]>/gi;
  const headlines = [];
  let m;
  while ((m = headlineRe.exec(html))) {
    const name = stripTags(m[1]);
    if (name) headlines.push({ name, start: m.index, end: headlineRe.lastIndex });
  }

  // Region accordion titles (province / area headings).
  const regionRe =
    /data-testid="accordion-title-elements"[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  const regions = [];
  while ((m = regionRe.exec(html))) {
    regions.push({ name: stripTags(m[1]), at: m.index });
  }
  const regionBefore = (pos) => {
    let r = null;
    for (const reg of regions) {
      if (reg.at < pos) r = reg.name;
      else break;
    }
    return r;
  };

  const linkRe =
    /<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*data-testid="link-input"/gi;
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;

  const rows = [];
  const seen = new Set();
  for (let i = 0; i < headlines.length; i++) {
    const h = headlines[i];
    const blockEnd = i + 1 < headlines.length ? headlines[i + 1].start : html.length;
    const block = html.slice(h.end, blockEnd);

    // First external (non-Geberit) website link inside this block.
    let website = null;
    linkRe.lastIndex = 0;
    let lm;
    while ((lm = linkRe.exec(block))) {
      const host = hostOf(lm[1]);
      if (host && !host.includes('geberit')) {
        website = lm[1].replace(/\/$/, '');
        break;
      }
    }
    if (!website) continue;
    if (SKIP_NAME.test(h.name)) continue;

    const region = regionBefore(h.start);
    if (region && SKIP_REGION.test(region)) continue;

    // First readable paragraph as evidence quote.
    let description = '';
    pRe.lastIndex = 0;
    let pm;
    while ((pm = pRe.exec(block))) {
      const txt = stripTags(pm[1]);
      if (txt && txt.length > 30) {
        description = txt;
        break;
      }
    }

    const key = hostOf(website) + '|' + h.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      name: h.name,
      website,
      region,
      description,
    });
  }
  return rows;
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function geocodePhoton(query, cc) {
  const params = new URLSearchParams({ limit: '1', q: query });
  const res = await fetch('https://photon.komoot.io/api/?' + params.toString(), {
    headers: { 'User-Agent': UA },
  });
  const j = await res.json();
  let f = j.features?.[0];
  // Constrain to the expected country when possible.
  if (cc && Array.isArray(j.features)) {
    const inCc = j.features.find(
      (x) => (x.properties?.countrycode || '').toLowerCase() === cc
    );
    if (inCc) f = inCc;
  }
  if (!f) return null;
  const [lon, lat] = f.geometry.coordinates;
  return { lat: String(lat), lon: String(lon) };
}

async function geocodeNominatim(query, cc) {
  const params = new URLSearchParams({ format: 'json', limit: '1', q: query });
  if (cc) params.set('countrycodes', cc);
  const res = await fetch('https://nominatim.openstreetmap.org/search?' + params.toString(), {
    headers: { 'User-Agent': 'BidetBud/1.0 (github.com/bidetbud)' },
  });
  const j = await res.json();
  const hit = j[0];
  if (!hit) return null;
  return { lat: hit.lat, lon: hit.lon };
}

async function geocode(query, cc, cache, save) {
  if (query in cache) return cache[query];
  let result = null;
  try {
    result = await geocodePhoton(query, cc);
  } catch {}
  if (result && !inCountry(cc, result.lat, result.lon)) result = null;
  if (!result) {
    await sleep(1100);
    try {
      result = await geocodeNominatim(query, cc);
    } catch {}
    if (result && !inCountry(cc, result.lat, result.lon)) result = null;
  } else {
    await sleep(300);
  }
  cache[query] = result;
  if (save) save(cache);
  return result;
}

module.exports = {
  SOURCES,
  LOCATOR_URLS,
  LOCATOR_PAGE_URL,
  CC_TO_COUNTRY,
  cityFromZipLocation,
  cleanCoord,
  locatorRowToSeed,
  fetchLocator,
  COUNTRY_BBOX,
  inCountry,
  sleep,
  decodeEntities,
  stripTags,
  hostOf,
  parseHotels,
  fetchHtml,
  geocode,
  geocodePhoton,
  geocodeNominatim,
};
