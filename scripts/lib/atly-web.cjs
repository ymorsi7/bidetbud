/**
 * Shared parsing for atly.com location pages.
 *
 * Atly renders its editorial copy as rich-text arrays inside the Next.js payload
 * ({"text_type":"text","text":"..."} runs), so the bidet sentence is not visible
 * in the rendered HTML tags. These helpers rebuild those paragraphs, keep only the
 * ones that explicitly name a bidet, and read coordinates from the ld+json block.
 */
const { normalizeCountry } = require('./non-friendly-countries.cjs');

const BIDET_RE =
  /\bbidet(s|\s+toilet|\s+attachment|\s+hand\s+shower|\s+functions?|-style|\s+and\s+wudu)?\b|\bwashlet\b|\btoto[\s®™]*\s*(toilet|bidet|washlet|smart)\b|\b(toilet|bathroom)[^.\n]{0,40}\btoto\b|\bshattaf\b|\bhandheld sprayer\b|\bsmart japanese toilet\b|\belectric bidet\b|\bheated toilet[^.\n]{0,40}bidet|\bbidet[^.\n]{0,40}heated toilet|\btoilet with a bidet/i;

/** Sprayer-shop / product copy that mentions bidets without being a venue restroom. */
const PRODUCT_NOISE_RE =
  /\b(buy|shop|order|purchase|price|sale|discount|install(ation)?\s+service|plumbing supply|showroom sells)\b/i;

const EXTRA_COUNTRY_ALIASES = {
  'United States of America': 'USA',
  'The Netherlands': 'Netherlands',
  'Czechia': 'Czech Republic',
  'Republic of Ireland': 'Ireland',
  'Great Britain': 'UK',
  'England': 'UK',
  'Scotland': 'UK',
  'Wales': 'UK',
  'Northern Ireland': 'UK',
};

function resolveCountry(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  return EXTRA_COUNTRY_ALIASES[trimmed] || normalizeCountry(trimmed) || trimmed;
}

/** AbortSignal.timeout caps the whole response, not just socket idle time. */
async function fetchText(url, { timeoutMs = 30000 } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BidetBud/1.0 (+https://bidetbud.com)' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function cleanQuote(raw, max = 260) {
  let q = String(raw)
    .replace(/\\u0026/g, '&')
    .replace(/\\n/g, ' ')
    .replace(/\\/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (q.length > max) q = q.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  return q;
}

/** Rebuild each editorial paragraph from its rich-text runs. */
function editorialParagraphs(html) {
  const un = html.replace(/\\"/g, '"');
  const re = /\{"text_type":"[a-z_]+","text":"((?:[^"\\]|\\.)*)"\}/g;
  const paragraphs = [];
  let match;
  let current = null;
  let prevEnd = -1;
  while ((match = re.exec(un))) {
    if (current && match.index - prevEnd <= 2) {
      current.parts.push(match[1]);
    } else {
      current = { parts: [match[1]] };
      paragraphs.push(current);
    }
    prevEnd = re.lastIndex;
  }
  return paragraphs.map((p) => p.parts.join(''));
}

/** Shortest paragraph (or blurb) that explicitly names a bidet. */
function bidetQuote(html) {
  const candidates = editorialParagraphs(html).filter(
    (p) => BIDET_RE.test(p) && !PRODUCT_NOISE_RE.test(p)
  );
  if (!candidates.length) {
    const blurb = html.match(/"blurb":"((?:[^"\\]|\\.){20,400})"/);
    if (blurb && BIDET_RE.test(blurb[1])) return cleanQuote(blurb[1]);
    return '';
  }
  candidates.sort((a, b) => a.length - b.length);
  const best = candidates.find((p) => p.length >= 40) || candidates[0];
  return cleanQuote(best);
}

function ldJsonBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => {
      try {
        return JSON.parse(m[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const HOTEL_SCHEMA_RE = /hotel|lodging|resort|motel|inn|bedandbreakfast|hostel/i;

/**
 * Turn a location page into a seed-shaped row. Returns null when the page has no
 * coordinates or no bidet evidence.
 */
function parseLocationPage(html, url) {
  const place = ldJsonBlocks(html).find((j) => j && j.name && j.geo);
  if (!place) return null;
  const lat = place.geo.latitude;
  const lon = place.geo.longitude;
  if (lat == null || lon == null) return null;

  const quote = bidetQuote(html);
  if (!quote) return null;

  const addr = place.address || {};
  const country = resolveCountry(addr.addressCountry);
  if (!country) return null;

  const schemaType = String(place['@type'] || '');
  const isHotel = HOTEL_SCHEMA_RE.test(`${schemaType} ${place.name}`);
  const warmed = /washlet|toto|neorest|heated seat|smart toilet/i.test(quote);

  return {
    name: place.name,
    address: [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode]
      .filter(Boolean)
      .join(', '),
    latitude: String(lat),
    longitude: String(lon),
    city: [addr.addressLocality, addr.addressRegion].filter(Boolean).join(', '),
    country,
    type: isHotel ? 'hotel' : 'restaurant',
    bidetStatus: warmed ? 'warmed' : 'internet',
    bidetType: warmed ? 'TOTO / washlet bidet' : 'Bidet',
    sourceUrl: place.url || url,
    sourceQuote: `Atly bathroom guide: ${quote}`,
    verifiedMethod: 'web-source',
    access: isHotel ? 'limited' : 'public',
    ...(isHotel ? { accessNote: 'Hotel guests' } : {}),
  };
}

module.exports = {
  BIDET_RE,
  fetchText,
  cleanQuote,
  editorialParagraphs,
  bidetQuote,
  ldJsonBlocks,
  parseLocationPage,
  resolveCountry,
};
