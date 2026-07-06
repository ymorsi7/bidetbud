/**
 * Shared parsing for French bidet discovery (WC lavant, Washlet, douchette, etc.).
 */
const https = require('https');
const http = require('http');

const BIDET_KW =
  /WC\s+lavant|toilette\s+japonaise|douchette|Washlet|WASHLET|NEOREST|Neorest|AquaClean|bidet|spray\s+hygiénique|nettoyage\s+à\s+l'eau|nettoyage\s+intime|toilettes?\s+japonaises?/i;

const FALSE_POSITIVE =
  /\b(?:avec\s+)?douche\s*(?:\/|et|&|,)\s*(?:WC|toilettes?)\b|\bchambre[^.]{0,40}douche[^.]{0,20}WC\b/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchText(url, lang = 'fr-FR') {
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
            'Accept-Language': `${lang},fr;q=0.9,en;q=0.8`,
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
    .replace(/&#039;/g, "'")
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
  if (
    FALSE_POSITIVE.test(text) &&
    !/WC\s+lavant|Washlet|AquaClean|toilette\s+japonaise|douchette|bidet|NEOREST/i.test(text)
  ) {
    return true;
  }
  return false;
}

function extractFrenchSentences(text, extraKw) {
  const out = [];
  const kws = extraKw
    ? [extraKw]
    : [
        'WC lavant',
        'toilette japonaise',
        'toilettes japonaises',
        'Washlet',
        'AquaClean',
        'douchette',
        'bidet',
        'NEOREST',
      ];
  for (const kw of kws) {
    const re = new RegExp(
      `[^.!?\\n]{0,120}${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.!?\\n]{0,160}`,
      'gi'
    );
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
  if (
    !/chambre|salle de bain|WC|toilette|suite|hôtel|hotel|restaurant|salle d'exposition|showroom/i.test(
      text
    )
  ) {
    return false;
  }
  return extractEvidence(html).length > 0;
}

function extractEvidence(html) {
  const text = plainText(html);
  const sentences = extractFrenchSentences(text);
  const roomHits = [
    ...new Set(
      [
        ...stripScripts(html).matchAll(
          /(?:chambre|suite|salle de bain)[^<]{0,80}(?:WC\s+lavant|Washlet|AquaClean|toilette\s+japonaise)/gi
        ),
      ].map((m) => decodeHtml(m[0].trim()))
    ),
  ];
  const evidence = [];
  if (roomHits.length) evidence.push(...roomHits.slice(0, 3));
  evidence.push(...sentences.slice(0, 5));
  return [...new Set(evidence)].filter(
    (e) => e.length >= 12 && e.length <= 320 && !isFalsePositive(e)
  );
}

function inferBidetType(text) {
  if (/NEOREST/i.test(text)) return 'TOTO NEOREST';
  if (/WASHLET|Washlet/i.test(text)) return 'TOTO WASHLET';
  if (/AquaClean/i.test(text)) return 'Geberit AquaClean';
  if (/toilette\s+japonaise/i.test(text)) return 'Toilettes japonaises';
  if (/douchette/i.test(text)) return 'Douchette hygiénique';
  if (/bidet/i.test(text)) return 'Bidet';
  return 'WC lavant / Washlet';
}

function extractAddress(html) {
  const texts = [
    ...html.matchAll(/(?:Adresse|Address)[:\s]+([^<]{8,120})/gi),
    ...html.matchAll(/"streetAddress"\s*:\s*"([^"]+)"/gi),
    ...html.matchAll(/(?:Rue|Avenue|Boulevard|Place)[^<,]{4,80}(?:\d{5}|France)/gi),
  ].map((m) => decodeHtml((m[1] || m[0]).trim()));
  const hit = texts.find((t) => /(?:rue|avenue|boulevard|place|\d{5})/i.test(t));
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

function parseGenericFrenchPage(html, url) {
  const evidence = extractEvidence(html);
  if (!evidence.length) return null;
  const name = extractH1(html) || extractTitle(html) || guessNameFromUrl(url);
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

function parseGeberitFrReference(html, url) {
  const text = plainText(html);
  if (!/WC\s+lavant|AquaClean/i.test(text)) return null;
  let name = extractH1(html) || extractTitle(html);
  name = name.replace(/\s*\|.*$/, '').replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
  if (name.length < 6) return null;
  const evidence = extractFrenchSentences(text, 'AquaClean');
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

function parseTotoFrReference(html, slug, url) {
  const title = extractH1(html) || extractTitle(html);
  if (/404|not found|introuvable/i.test(title)) return null;
  const text = plainText(html);
  if (!/WASHLET|Washlet|NEOREST|toilette\s+japonaise/i.test(text)) return null;

  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const name = decodeHtml(titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, ' '));
  if (name.length < 4 || /404/i.test(name)) return null;

  const block = text.match(
    /(?:Produit\(s\)|Product\(s\))\s+(.+?)\s+(?:Suite|Chambre|Following|Opened|The |Located|Considered|Since|In |After|Details|Category|Depuis)/i
  );
  const products = block
    ? block[1].trim().slice(0, 120)
    : (text.match(/WASHLET[^.]{0,120}/i) || text.match(/NEOREST[^.]{0,120}/i) || [])[0] ||
      'TOTO WASHLET';

  return {
    name,
    address: extractAddress(html),
    sourceUrl: url,
    sourceQuote: `Référence TOTO Europe : ${products.trim().slice(0, 200)}`,
    hasBidet: true,
    bidetType: inferBidetType(products),
    verifiedMethod: 'manufacturer-reference',
    bidetStatus: 'warmed',
  };
}

function isValidRowName(name) {
  if (!name || name.length < 4) return false;
  if (/^\d+$/.test(name)) return false;
  if (/404|not found|toto 404/i.test(name)) return false;
  return true;
}

function extractTotoFrSlugs(html) {
  return [
    ...new Set(
      [
        ...[...html.matchAll(/href="(\/fr\/lentreprise\/references\/[^"#?]+)"/g)].map((m) =>
          m[1].replace('/fr/lentreprise/references/', '')
        ),
        ...[...html.matchAll(/href="(\/en\/company-information\/references\/[^"#?]+)"/g)].map(
          (m) => m[1].replace('/en/company-information/references/', '')
        ),
      ].filter((s) => s.includes('-') && !/^(hotels|restaurants|shops|louvre|viparis)/i.test(s))
    ),
  ];
}

const FRANCE_SLUG_RE =
  /paris|lyon|marseille|nice|bordeaux|strasbourg|nimes|nîmes|courchevel|lourdes|narbonne|arras|levernois|saint-gervais|france|fouquet|meurice|vernet|imperator|pont-neuf|chouchou|fauchon|buddha|agape|neiges|armancette|colette|plaza-athenee|yen|blanc-paris/i;

const FRANCE_TOTO_SLUGS = [
  'hotel-plaza-athenee-paris-france',
  'le-restaurant-blanc-paris-16e',
  'maison-albar-hotels-le-pont-neuf',
  'maison-albar-imperator-hotel',
  'hotel-barriere-le-fouquets',
  'restaurant-yen-paris',
  'hotel-chouchou-paris',
  'hotel-larmancette-saint-gervais-les-bains',
  'fauchon-hotel-paris',
  'hotel-vernet-paris',
  'le-meurice-un-hotel-de-luxe-avec-tradition',
  'buddhar-bar-hotel-paris',
  'restaurant-lagape-paris',
  'hotel-palace-park-hyatt-paris-vendome',
  'boutique-colette-paris',
  'les-neiges-courchevel',
];

function isFranceRelevant(text, city, slug) {
  const t = `${text} ${city || ''} ${slug || ''}`;
  if (FRANCE_SLUG_RE.test(t)) return true;
  if (
    /\b(France|Paris|Lyon|Marseille|Nice|Bordeaux|Strasbourg|Nîmes|Nimes|Courchevel|Lourdes|Narbonne|Arras|Île-de-France|Provence|Occitanie)\b/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

function isFrenchDomain(url) {
  try {
    const h = new URL(url).hostname;
    if (/\.fr$/.test(h)) return true;
    if (/geberit\.|eu\.toto\.com|booking\.com\/fr|tripadvisor\.fr|sncf|pagesjaunes/i.test(h))
      return true;
    return false;
  } catch {
    return false;
  }
}

function classifyFinderVenue(name) {
  if (/restaurant/i.test(name)) return 'restaurant';
  if (/hôtel|hotel|hostellerie/i.test(name)) return 'hotel';
  return 'public';
}

function parseTotoFranceFinderHtml(html) {
  const rows = [];
  for (const part of html.split('data-countrycode="FR"').slice(1)) {
    const name = decodeHtml((part.match(/alt="([^"]+)"/) || [])[1] || '').trim();
    const latitude = (part.match(/data-latitude="([^"]+)"/) || [])[1];
    const longitude = (part.match(/data-longitude="([^"]+)"/) || [])[1];
    let address = decodeHtml(
      (part.match(/class="location-address"[^>]*>([^<]+)/i) ||
        part.match(/location-address[^>]*>([^<]+)/i) ||
        [])[1] || ''
    ).trim();
    if (!name || !latitude || !longitude) continue;
    if (address === name || /^\+?\d/.test(address)) address = '';
    rows.push({
      name,
      address,
      latitude,
      longitude,
      type: classifyFinderVenue(name),
      bidetType: 'TOTO WASHLET (showroom/test)',
      access: /hotel|hôtel/i.test(name) ? 'limited' : 'public',
      accessNote: /hotel|hôtel/i.test(name)
        ? 'Hotel guests and patrons'
        : 'TOTO WASHLET test location — showroom or distributor',
    });
  }
  return rows;
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
  extractFrenchSentences,
  extractTitle,
  extractH1,
  hasBidetSignal,
  extractEvidence,
  parseGenericFrenchPage,
  parseGeberitFrReference,
  parseTotoFrReference,
  isValidRowName,
  extractTotoFrSlugs,
  extractUrlsFromSearch,
  inferBidetType,
  FRANCE_SLUG_RE,
  FRANCE_TOTO_SLUGS,
  isFranceRelevant,
  isFrenchDomain,
  guessNameFromUrl,
  classifyFinderVenue,
  parseTotoFranceFinderHtml,
};
