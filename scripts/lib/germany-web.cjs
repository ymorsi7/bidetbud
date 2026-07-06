/**
 * Shared parsing for German bidet discovery (Dusch-WC, Washlet, AquaClean, etc.).
 */
const https = require('https');
const http = require('http');

/** Explicit bidet / shower-toilet signals */
const BIDET_KW =
  /Dusch[\s-]?WC|Washlet|WASHLET|NEOREST|Neorest|AquaClean|Hygienedusche|Bidet(?:sitz)?|SensoWash|ViClean|Sensia|Japanisch(?:es|er)?\s+WC|Smart[\s-]?WC|intelligente[nr]?\s+Toilette|Toilette\s+mit\s+(?:Dusch|Wasch)funktion|Reinigung\s+mit\s+(?:warmem\s+)?Wasser|Intim(?:reinigung|dusche)/i;

/** Standard bathroom — NOT a bidet */
const FALSE_POSITIVE =
  /\b(?:mit\s+)?Dusche\s*(?:\/|und|&|,)\s*WC\b|\bDU\s*\/\s*WC\b|\bShower\s*\/\s*WC\b|\bBath\s*\/\s*WC\b|\bDoppelzimmer\s+mit\s+Dusche\s+und\s+WC\b|\bAppartement[^.]{0,40}Dusche,\s*WC\b/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchText(url, lang = 'de-DE') {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; BidetBud-Research/1.0; +https://bidetbud.com)',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': `${lang},de;q=0.9,en;q=0.8`,
          },
          timeout: 25000,
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const next = res.headers.location.startsWith('http')
              ? res.headers.location
              : new URL(res.headers.location, url).href;
            fetchText(next, lang).then(resolve).catch(reject);
            return;
          }
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve(data));
        }
      )
      .on('error', reject)
      .on('timeout', function () {
        this.destroy(new Error('timeout'));
      });
  });
}

function decodeHtml(s) {
  return String(s)
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripScripts(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
}

function plainText(html) {
  return decodeHtml(stripScripts(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function isFalsePositive(text) {
  if (!BIDET_KW.test(text)) return true;
  if (FALSE_POSITIVE.test(text) && !/Dusch[\s-]?WC|Washlet|AquaClean|Bidet|Hygienedusche|NEOREST/i.test(text)) {
    return true;
  }
  return false;
}

function extractGermanSentences(text, extraKw) {
  const out = [];
  const kws = extraKw
    ? [extraKw]
    : ['Dusch-WC', 'Dusch WC', 'Washlet', 'AquaClean', 'Bidet', 'Hygienedusche', 'Neorest'];
  for (const kw of kws) {
    const re = new RegExp(`[^.!?\\n]{0,120}${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.!?\\n]{0,160}`, 'gi');
    for (const m of text.matchAll(re)) {
      const s = m[0].trim();
      if (s.length < 15 || isFalsePositive(s)) continue;
      if (/cookie|javascript|function\s*\(|webpack/i.test(s)) continue;
      out.push(s.slice(0, 300));
    }
  }
  return [...new Set(out)];
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)/i);
  if (!m) return '';
  return decodeHtml(m[1])
    .replace(/\s*[-|–|]\s*.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function extractH1(html) {
  const m = html.match(/<h1[^>]*>([^<]+)/i);
  return m ? decodeHtml(m[1].trim()).slice(0, 120) : '';
}

function hasBidetSignal(html) {
  const text = plainText(html);
  if (isFalsePositive(text)) return false;
  if (!BIDET_KW.test(text)) return false;
  if (!/Zimmer|Bad|Badezimmer|WC|Toilette|Suite|Hotel|Gäste|room|bathroom|toilet/i.test(text)) {
    return false;
  }
  return extractEvidence(html).length > 0;
}

function extractEvidence(html) {
  const text = plainText(html);
  const sentences = extractGermanSentences(text);
  const roomHits = [
    ...new Set(
      [...stripScripts(html).matchAll(/(?:Zimmer|Suite|Apartment|Loft|Nomer)[^<]{0,80}(?:Dusch[\s-]?WC|Washlet|AquaClean)/gi)].map(
        (m) => decodeHtml(m[0].trim())
      )
    ),
  ];
  const evidence = [];
  if (roomHits.length) evidence.push(...roomHits.slice(0, 3));
  evidence.push(...sentences.slice(0, 5));
  return [...new Set(evidence)].filter((e) => e.length >= 12 && e.length <= 320 && !isFalsePositive(e));
}

function parseGenericGermanPage(html, url) {
  const evidence = extractEvidence(html);
  if (!evidence.length) return null;
  let name = extractH1(html) || extractTitle(html) || guessNameFromUrl(url);
  // Prefer hotel brand over room type on German hotel sites
  if (/zimmer|suite|doppelzimmer|apartment/i.test(name) && /hotel-|\.de\/hotel/i.test(url)) {
    const brand = extractTitle(html).replace(/\s*[-|–].*$/, '').trim();
    if (brand && brand.length > 8) name = brand;
  }
  const address = extractAddress(html);
  return {
    name,
    address,
    sourceUrl: url,
    sourceQuote: evidence[0],
    hasBidet: true,
    bidetType: inferBidetType(evidence.join(' ')),
  };
}

function inferBidetType(text) {
  if (/NEOREST/i.test(text)) return 'TOTO NEOREST';
  if (/WASHLET|Washlet/i.test(text)) return 'TOTO WASHLET';
  if (/AquaClean/i.test(text)) return 'Geberit AquaClean Dusch-WC';
  if (/SensoWash/i.test(text)) return 'Duravit SensoWash';
  if (/Sensia/i.test(text)) return 'Grohe Sensia';
  if (/ViClean/i.test(text)) return 'Villeroy & Boch ViClean';
  if (/Dusch[\s-]?WC/i.test(text)) return 'Dusch-WC';
  if (/Bidet/i.test(text)) return 'Bidet';
  return 'Dusch-WC / Washlet';
}

function extractAddress(html) {
  const texts = [
    ...html.matchAll(/(?:Adresse|Anschrift|Standort)[:\s]+([^<]{8,120})/gi),
    ...html.matchAll(/"streetAddress"\s*:\s*"([^"]+)"/gi),
    ...html.matchAll(/"addressLocality"\s*:\s*"([^"]+)"/gi),
    ...html.matchAll(/(?:Straße|Str\.|Platz|Weg)[^<,]{4,80}(?:Deutschland|Germany)/gi),
  ].map((m) => decodeHtml((m[1] || m[0]).trim()));

  const hit = texts.find((t) => /(?:straße|str\.|platz|weg|\d{5})/i.test(t));
  return hit || '';
}

function guessNameFromUrl(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop() || '';
    if (seg && seg.length > 2) {
      return decodeURIComponent(seg)
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
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
    if (!/duckduckgo|google\.|bing\.|microsoft\.com/i.test(u)) out.push(u);
  }
  return [...new Set(out)];
}

function parseGeberitReference(html, url) {
  const text = plainText(html);
  if (!/Dusch[\s-]?WC|AquaClean/i.test(text)) return null;

  const slug = (url.match(/referenzen\/([^/]+)/) || [])[1] || '';
  const slugNames = {
    'the-fontenay-hamburg': 'The Fontenay, Hamburg',
    'riku-hotel-pfullendorf': 'RiKu Budget-Design Hotel, Pfullendorf',
    'hotel-hoeri': 'Hotel Hoeri, Bodensee',
    'hotel-rosenhof': 'Hotel Rosenhof, Isenbüttel',
  };
  let name = slugNames[slug] || '';
  if (!name) {
    const og = html.match(/property="og:title"\s+content="([^"]+)"/i);
    name = og ? decodeHtml(og[1].replace(/\s*\|.*$/, '').trim()) : '';
  }
  if (!name) name = extractH1(html) || extractTitle(html);
  name = name.replace(/\s*\|.*$/, '').replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
  if (name.length < 6 || /^\d+$/.test(name)) return null;

  const evidence = extractGermanSentences(text, 'AquaClean');
  if (!evidence.length) evidence.push(...extractGermanSentences(text, 'Dusch-WC'));
  if (!evidence.length) return null;
  return {
    name,
    address: extractAddress(html),
    sourceUrl: url,
    sourceQuote: evidence[0],
    hasBidet: true,
    bidetType: inferBidetType(evidence.join(' ')),
    verifiedMethod: 'manufacturer-reference',
    bidetStatus: 'warmed',
  };
}

function parseTotoDeReference(html, slug, url) {
  const title = extractH1(html) || extractTitle(html);
  if (/404|not found|seite nicht|nicht gefunden/i.test(title)) return null;

  const text = plainText(html);
  if (!/WASHLET|Washlet|NEOREST|Dusch[\s-]?WC/i.test(text)) return null;
  if (/Persönliche Hygiene Sauberkeit Design Nachhaltigkeit Komfort Produkte Showroom/i.test(text) && !/Category|Product\(s\)|Opened|Located/i.test(text)) {
    return null;
  }

  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const name = decodeHtml(titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, ' '));
  if (name.length < 4 || /404/i.test(name)) return null;

  const block = text.match(/Product\(s\)\s+(.+?)\s+(?:Following|Opened|The |Located|Considered|Since|In |After|Details|Category)/i);
  const products = block
    ? block[1].trim().slice(0, 120)
    : (text.match(/WASHLET[^.]{0,120}/i) || text.match(/NEOREST[^.]{0,120}/i) || [])[0] || 'TOTO WASHLET';

  return {
    name,
    address: extractAddress(html),
    sourceUrl: url,
    sourceQuote: `TOTO Europe Referenz: ${products.trim().slice(0, 200)}`,
    hasBidet: true,
    bidetType: inferBidetType(products),
    verifiedMethod: 'manufacturer-reference',
    bidetStatus: 'warmed',
  };
}

function isValidRowName(name) {
  if (!name || name.length < 6) return false;
  if (/^\d+$/.test(name)) return false;
  if (/404|not found|toto 404/i.test(name)) return false;
  return true;
}

function extractTotoDeSlugs(html) {
  return [
    ...new Set(
      [
        ...[...html.matchAll(/href="(\/de\/unternehmen\/referenzen\/[^"#?]+)"/g)].map((m) =>
          m[1].replace('/de/unternehmen/referenzen/', '')
        ),
        ...[...html.matchAll(/href="(\/en\/company-information\/references\/[^"#?]+)"/g)].map((m) =>
          m[1].replace('/en/company-information/references/', '')
        ),
      ].filter((s) => s.includes('-') && !/^(hotels|gesundheit|health|restaurants|shops|wohnen|buero|office)/i.test(s))
    ),
  ];
}

function extractGeberitRefUrls(html) {
  const base = 'https://www.geberit.de';
  return [
    ...new Set(
      [...html.matchAll(/href="(\/know-how\/referenzen\/[^"#?]+)"/g)]
        .map((m) => base + m[1])
        .filter((u) => /hotel|fontenay|riku|rosenhof|hoeri/i.test(u))
    ),
  ];
}

const GERMANY_SLUG_RE =
  /munich|munchen|münchen|berlin|frankfurt|hamburg|dusseldorf|duesseldorf|düsseldorf|essen|bielefeld|darmstadt|elmau|tegernsee|titisee|schwarzwald|velen|sauerland|knippschild|heidelberg|krebs|weberhaus|geku|koln|koeln|köln|pfullendorf|rosenhof|fontenay|deutsch|german|badeparadies|bachmair|kreuth|krün|kruen|mönchen|moenchen/i;

function isGermanyRelevant(text, city, slug, url) {
  if (url) {
    try {
      const h = new URL(url).hostname;
      if (/\.de$/.test(h) && /hotel|gasthof|pension|resort|wellness/i.test(h + url)) return true;
    } catch {
      /* skip */
    }
  }
  const t = `${text} ${city || ''} ${slug || ''}`;
  if (GERMANY_SLUG_RE.test(t)) return true;
  if (/\b(Deutschland|Germany|Berlin|München|Munich|Hamburg|Frankfurt|Köln|Cologne|Düsseldorf|Stuttgart|Dresden|Leipzig|Hannover|Nürnberg|Bremen|Heidelberg|Elmau|Tegernsee|Pfullendorf|Isenbüttel|Bielefeld|Darmstadt|Essen|Velen|Sauerland|Baden-Württemberg|Bayern|Nordrhein)\b/i.test(t)) {
    return true;
  }
  return false;
}

function isGermanDomain(url) {
  try {
    const h = new URL(url).hostname;
    if (/\.de$/.test(h)) return true;
    if (/geberit\.|eu\.toto\.com|hrs\.|holidaycheck|tripadvisor\.de|booking\.com\/de|hotel\.de/i.test(h)) return true;
    return false;
  } catch {
    return false;
  }
}

module.exports = {
  BIDET_KW,
  FALSE_POSITIVE,
  sleep,
  fetchText,
  decodeHtml,
  stripScripts,
  plainText,
  isFalsePositive,
  extractGermanSentences,
  extractTitle,
  extractH1,
  hasBidetSignal,
  extractEvidence,
  parseGenericGermanPage,
  parseGeberitReference,
  parseTotoDeReference,
  isValidRowName,
  extractTotoDeSlugs,
  extractGeberitRefUrls,
  extractUrlsFromSearch,
  inferBidetType,
  GERMANY_SLUG_RE,
  isGermanyRelevant,
  isGermanDomain,
  guessNameFromUrl,
};
