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
 * NOTE: the fully comprehensive "500+ hotels" list lives only in Geberit's
 * interactive Hotel Locator (a Google-Maps widget backed by a server-side API);
 * it is not statically fetchable without a headless browser. These reference
 * pages are the officially-published, citable subset.
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
