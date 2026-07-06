/**
 * Shared parsing/fetching helpers for the Africa bidet crawler.
 *
 * Africa is NOT treated as bidet-friendly by default, so every row must carry an
 * explicit per-venue bidet mention. We look for bidet / shattaf / "Arabic shower"
 * / douchette / washlet signals AND venue context (hotel/room/bathroom/mosque),
 * while filtering out e-commerce/product pages that merely *sell* sprayers.
 */
const https = require('https');
const http = require('http');

/** Explicit bidet / hand-sprayer signals (EN + FR + transliterated AR). */
const BIDET_KW =
  /\bbidet(?:s)?\b|\bwashlet\b|\bneorest\b|\bshattaf\b|\bshataff?\b|\bshatafa\b|arabic\s+shower|muslim\s+shower|health\s+faucet|bum\s+gun|hand[\s-]?held\s+(?:bidet|sprayer)|bidet\s+sprayer|douchette(?:\s+(?:wc|hygi[eé]nique|des\s+toilettes))?|douche[\s-]?bidet|jet\s+d['’]eau\s+wc/i;

/**
 * Standard bathroom / non-bidet noise that shouldn't count on its own
 * (e.g. "shower / WC", "bath & WC").
 */
const FALSE_POSITIVE =
  /\bshower\s*(?:\/|and|&|,)\s*(?:wc|toilet)\b|\bbath\s*(?:\/|and|&|,)\s*wc\b|\bdouche\s*(?:\/|et|&|,)\s*wc\b/i;

/**
 * E-commerce / product-page markers. If a page looks like a shop selling
 * sprayers rather than a venue that has one, drop it.
 */
const ECOMMERCE_RE =
  /add\s+to\s+cart|add\s+to\s+basket|buy\s+now|order\s+on\s+whatsapp|in\s+stock|out\s+of\s+stock|sku\b|product\s+code|free\s+shipping|delivery\s+fee|price\s*:|unit\s+price|\bksh\b|\bkes\b|\bngn\b|\bzar\b|\bugx\b|\btzs\b|\bghs\b|per\s+piece|wholesale|checkout|shopping\s+cart|write\s+a\s+review|item\s*#/i;

/** Venue context — the mention should be about a place, not a product. */
const VENUE_CTX_RE =
  /\b(hotel|hostel|guest\s?house|guesthouse|lodge|resort|apartment|apart[\s-]?hotel|suite|room|bathroom|en[\s-]?suite|bed\s*&?\s*breakfast|b&b|villa|chalet|restaurant|cafe|caf[eé]|mosque|masjid|masaajid|riad|inn|residence|spa)\b/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

function pickUA() {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

/**
 * Fetch a URL (GET or POST form). Returns the response body text.
 * opts: { lang, method, body (object → form-encoded), extraHeaders, depth }
 */
function fetchText(url, opts = {}) {
  const lang = typeof opts === 'string' ? opts : opts.lang || 'en';
  const method = (opts.method || 'GET').toUpperCase();
  const bodyObj = opts.body;
  const depth = opts.depth || 0;
  const bodyStr = bodyObj
    ? Object.entries(bodyObj)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    : null;
  return new Promise((resolve, reject) => {
    let lib;
    try {
      lib = url.startsWith('https') ? https : http;
    } catch (e) {
      return reject(e);
    }
    const headers = {
      'User-Agent': pickUA(),
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': `${lang},en;q=0.9,fr;q=0.7`,
      ...(opts.extraHeaders || {}),
    };
    if (bodyStr) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = lib.request(url, { method, headers, timeout: 25000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        fetchText(next, { ...opts, lang, depth: depth + 1, method: 'GET', body: null })
          .then(resolve)
          .catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > 4_000_000) {
          req.destroy(new Error('too large'));
          return;
        }
        data += c;
      });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject).on('timeout', function () {
      this.destroy(new Error('timeout'));
    });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function decodeHtml(s) {
  return String(s)
    .replace(/&#x27;|&#039;|&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCharCode(Number(n));
      } catch {
        return ' ';
      }
    });
}

function stripScripts(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

function plainText(html) {
  return decodeHtml(
    stripScripts(html)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  ).trim();
}

function looksLikeShop(html) {
  const text = plainText(html);
  // Count e-commerce hits; a single incidental one is fine, several = shop.
  const hits = (text.match(ECOMMERCE_RE) || []).length;
  return hits >= 2;
}

/** Sentences of context around a bidet keyword. */
function extractBidetSentences(text) {
  const out = [];
  const re =
    /[^.!?\n]{0,140}(?:bidet(?:s)?|washlet|neorest|shattaf|shataff?|shatafa|arabic\s+shower|muslim\s+shower|health\s+faucet|douchette|hand[\s-]?held\s+(?:bidet|sprayer))[^.!?\n]{0,180}/gi;
  for (const m of text.matchAll(re)) {
    const s = m[0].trim().replace(/\s+/g, ' ');
    if (s.length < 15) continue;
    if (/cookie|javascript|function\s*\(|webpack|©|\{|\}/i.test(s)) continue;
    out.push(s.slice(0, 300));
  }
  return [...new Set(out)];
}

function hasBidetSignal(html) {
  const text = plainText(html);
  if (!BIDET_KW.test(text)) return false;
  if (!VENUE_CTX_RE.test(text)) return false;
  if (looksLikeShop(html)) return false;
  const ev = extractBidetSentences(text).filter(
    (s) => VENUE_CTX_RE.test(s) || /\bin\s+(?:all|every|the)\b|\brooms?\b|\bsuite/i.test(s)
  );
  return ev.length > 0;
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)/i);
  if (!m) return '';
  return decodeHtml(m[1])
    .replace(/\s*[-|–—»].*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function extractH1(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return '';
  return decodeHtml(m[1].replace(/<[^>]+>/g, ' ').trim())
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function extractSchemaName(html) {
  const m =
    html.match(/"@type"\s*:\s*"(?:Hotel|LodgingBusiness|Restaurant|Place|LocalBusiness)"[\s\S]{0,200}?"name"\s*:\s*"([^"]+)"/i) ||
    html.match(/"name"\s*:\s*"([^"]{4,90})"[\s\S]{0,200}?"@type"\s*:\s*"(?:Hotel|LodgingBusiness|Restaurant)"/i) ||
    html.match(/property="og:site_name"\s+content="([^"]+)"/i) ||
    html.match(/property="og:title"\s+content="([^"]+)"/i);
  return m ? decodeHtml(m[1]).replace(/\s*\|.*$/, '').replace(/\s+/g, ' ').trim().slice(0, 100) : '';
}

function extractAddress(html) {
  const texts = [
    ...html.matchAll(/"streetAddress"\s*:\s*"([^"]+)"/gi),
    ...html.matchAll(/"address"\s*:\s*"([^"]{8,140})"/gi),
    ...html.matchAll(/(?:Address|Adresse|Location)[:\s]+([^<]{8,140})/gi),
  ].map((m) => decodeHtml((m[1] || '').trim()));
  const hit = texts.find((t) => t && t.length >= 8 && /[a-z]/i.test(t));
  return hit ? hit.slice(0, 160) : '';
}

function inferType(name, evidence) {
  const t = `${name} ${evidence}`.toLowerCase();
  if (/mosque|masjid|masaajid|islamic\s+cent/i.test(t)) return 'mosque';
  if (/restaurant|cafe|caf[eé]|bistro|eatery|grill/i.test(t)) return 'restaurant';
  if (/hotel|lodge|resort|guest\s?house|guesthouse|apartment|suite|villa|inn|b&b|bed\s*&?\s*breakfast|residence|hostel/i.test(t))
    return 'hotel';
  return 'hotel';
}

function inferBidetType(text) {
  if (/neorest/i.test(text)) return 'TOTO NEOREST';
  if (/washlet/i.test(text)) return 'TOTO WASHLET';
  if (/shattaf|shataff|shatafa|arabic\s+shower|muslim\s+shower|hand[\s-]?held|health\s+faucet|douchette/i.test(text))
    return 'Handheld sprayer';
  return 'Bidet';
}

/** Suppliers / directories / press / query-echoes whose title is NOT a venue name. */
const NAME_BLOCKLIST =
  /\bbidet\b|shattaf|washlet|douchette|arabic\s+shower|bathroom|plumber|plumbing|hardware|sanitary|sprayer|toilet\s+seat|tourism\s+portal|for\s+sale|\bprice\b|review|\bblog\b|news|wikipedia|tripadvisor|booking\.com|expedia|hotels?\.ng|directory|classifieds|jumia|catalogue|\bstore\b|\bshop\b|best\s+\d+|top\s+\d+|things\s+to\s+do|travel\s+guide/i;

/**
 * A real venue page usually exposes structured data (schema.org lodging/restaurant)
 * or a street address. Requiring this cuts out listicles / blog posts / search pages
 * that merely mention "bidet" and "hotel".
 */
function hasVenueSchema(html) {
  if (/"@type"\s*:\s*"(?:Hotel|LodgingBusiness|Resort|BedAndBreakfast|Motel|Hostel|GuestHouse|Restaurant|FoodEstablishment|LocalBusiness|Place)"/i.test(html))
    return true;
  if (/"streetAddress"\s*:\s*"[^"]{4,}"/i.test(html)) return true;
  if (/property="og:type"\s+content="(?:hotel|business\.business|place)"/i.test(html)) return true;
  return false;
}

/** Trailing noise to strip from an extracted venue title. */
function cleanVenueName(raw, cities, countryName) {
  if (!raw) return '';
  let n = decodeHtml(raw)
    .replace(/^#+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Cut at common separators (keep the first, usually the venue).
  n = n.split(/\s+[|\u2013\u2014\u00bb]\s+/)[0].trim();
  n = n.split(/\s+-\s+/)[0].trim();
  // Strip trailing ", City" / ", Country" fragments.
  const tails = [countryName, ...(cities || [])].filter(Boolean);
  for (const t of tails) {
    const re = new RegExp(`\\s*,\\s*${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
    n = n.replace(re, '').trim();
  }
  // Strip pricing / marketing tails.
  n = n
    .replace(/\.\s*(?:Rates?|Prices?|Deals?|Reviews?)\b.*$/i, '')
    .replace(/\s*[:\-]\s*(?:from|ab|à partir).*$/i, '')
    .replace(/\s*\(.*?\)\s*$/, '')
    .replace(/[,.;:]\s*$/, '')
    .trim();
  return n.slice(0, 90);
}

function guessNameFromUrl(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop() || '';
    if (seg && seg.length > 2 && !/^\d+$/.test(seg)) {
      return decodeURIComponent(seg)
        .replace(/\.[a-z]+$/i, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .slice(0, 90);
    }
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function parseVenuePage(html, url, ctx = {}) {
  if (looksLikeShop(html)) return null;
  const text = plainText(html);
  const evidence = extractBidetSentences(text).filter(
    (s) => !FALSE_POSITIVE.test(s) || BIDET_KW.test(s.replace(FALSE_POSITIVE, ''))
  );
  if (!evidence.length) return null;

  // Prefer schema Hotel/Restaurant name, then og:title/h1/title.
  const candidates = [
    extractSchemaName(html),
    extractH1(html),
    extractTitle(html),
  ].filter(Boolean);
  let name = '';
  for (const c of candidates) {
    const cleaned = cleanVenueName(c, ctx.cities, ctx.countryName);
    if (cleaned.length >= 4 && !NAME_BLOCKLIST.test(cleaned)) {
      name = cleaned;
      break;
    }
  }
  if (!name) {
    // fall back to first non-blocklisted candidate even if it hit blocklist earlier
    const first = cleanVenueName(candidates[0] || guessNameFromUrl(url), ctx.cities, ctx.countryName);
    if (first.length >= 4 && !NAME_BLOCKLIST.test(first)) name = first;
  }
  if (!name || name.length < 4 || /^\d+$/.test(name)) return null;

  const quote = evidence.find((s) => VENUE_CTX_RE.test(s)) || evidence[0];
  return {
    name,
    address: extractAddress(html),
    sourceUrl: url,
    sourceQuote: quote.slice(0, 240),
    hasBidet: true,
    type: inferType(name, evidence.join(' ')),
    bidetType: inferBidetType(evidence.join(' ')),
  };
}

function extractUrlsFromSearch(html) {
  const out = [];
  for (const m of html.matchAll(/uddg=([^&"']+)/g)) {
    try {
      out.push(decodeURIComponent(m[1]));
    } catch {
      /* skip */
    }
  }
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    const u = m[1];
    if (!/duckduckgo|google\.|bing\.|microsoft\.com|yahoo\./i.test(u)) out.push(u);
  }
  return [...new Set(out)];
}

/** Country codes we accept (non-bidet-friendly African nations). */
const COUNTRY_BY_CODE = {
  KE: 'Kenya',
  UG: 'Uganda',
  NG: 'Nigeria',
  TD: 'Chad',
  NE: 'Niger',
  ET: 'Ethiopia',
  SO: 'Somalia',
  ZA: 'South Africa',
  TZ: 'Tanzania',
  GH: 'Ghana',
  RW: 'Rwanda',
  SN: 'Senegal',
  CI: "Cote d'Ivoire",
  CM: 'Cameroon',
  ZM: 'Zambia',
  ZW: 'Zimbabwe',
  BW: 'Botswana',
  NA: 'Namibia',
  MZ: 'Mozambique',
  AO: 'Angola',
  BF: 'Burkina Faso',
  ML: 'Mali',
  MW: 'Malawi',
  BJ: 'Benin',
  GA: 'Gabon',
  CD: 'DR Congo',
  CG: 'Congo',
};

module.exports = {
  BIDET_KW,
  FALSE_POSITIVE,
  ECOMMERCE_RE,
  VENUE_CTX_RE,
  COUNTRY_BY_CODE,
  sleep,
  fetchText,
  decodeHtml,
  stripScripts,
  plainText,
  looksLikeShop,
  hasBidetSignal,
  extractBidetSentences,
  extractTitle,
  extractH1,
  extractSchemaName,
  extractAddress,
  inferType,
  inferBidetType,
  guessNameFromUrl,
  cleanVenueName,
  NAME_BLOCKLIST,
  hasVenueSchema,
  parseVenuePage,
  extractUrlsFromSearch,
};
