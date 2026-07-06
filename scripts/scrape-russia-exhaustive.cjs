#!/usr/bin/env node
/**
 * Exhaustive Russian-source bidet scraper (run up to 90+ minutes).
 *
 * Crawls hundreds of Russian booking/review/hotel URLs, searches raw HTML for
 * explicit bidet evidence (биде, washlet, neorest, гигиенический душ, etc.).
 *
 * Usage:
 *   node scripts/scrape-russia-exhaustive.cjs
 *   node scripts/scrape-russia-exhaustive.cjs --minutes 90
 *   node scripts/scrape-russia-exhaustive.cjs --minutes 90 --delay 900
 *
 * Outputs (incremental, safe to interrupt):
 *   data/russia-scrape-raw.json       all hits + metadata
 *   data/russia-scrape-candidates.json deduped candidates for review
 *   data/russia-scrape-progress.json  resume state
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const OUT_RAW = path.join(ROOT, 'data/russia-scrape-raw.json');
const OUT_CANDIDATES = path.join(ROOT, 'data/russia-scrape-candidates.json');
const OUT_PROGRESS = path.join(ROOT, 'data/russia-scrape-progress.json');
const URL_SEED = path.join(ROOT, 'data/russia-scrape-urls.json');

const args = process.argv.slice(2);
const minutesIdx = args.indexOf('--minutes');
const delayIdx = args.indexOf('--delay');
const RUN_MS =
  (minutesIdx >= 0 ? Number(args[minutesIdx + 1]) : 90) * 60 * 1000;
const DELAY_MS = delayIdx >= 0 ? Number(args[delayIdx + 1]) : 900;

/** Match explicit bidet evidence — NOT generic nav "Для биде" product links */
const BIDET_PATTERNS = [
  /биде/gi,
  /бидэ/gi,
  /washlet/gi,
  /neorest/gi,
  /вошлет/gi,
  /крышк[аи][\s-]*биде/gi,
  /гигиеническ(?:ий|ого)\s+душ/gi,
  /умн(?:ый|ого)\s+унитаз/gi,
  /унитаз(?:ом)?\s+с\s+биде/gi,
  /санузел[^.]{0,80}биде/gi,
  /ванн(?:ая|ой)[^.]{0,80}биде/gi,
  /номер[^.]{0,120}биде/gi,
];

/** Skip product-catalog noise from newtoto footer */
function isNoiseSnippet(snippet, url) {
  const s = snippet.toLowerCase();
  if (/для биде\s+для писсуара|клавиши смыва|коллекции neorest sg jewelhex/i.test(s))
    return true;
  if (url.includes('newtoto.ru') && /для унитаза\s+для биде/i.test(s)) return true;
  return false;
}

function loadJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

function decodeEntities(html) {
  return html
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, ' ');
}

function stripHtml(html) {
  return decodeEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBestSnippet(text) {
  for (const re of BIDET_PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) {
      const idx = m.index;
      const start = Math.max(0, idx - 90);
      const end = Math.min(text.length, idx + 130);
      return { snippet: text.slice(start, end).trim(), match: m[0] };
    }
  }
  return null;
}

function guessName(url, html) {
  const title = html.match(/<title[^>]*>([^<]+)/i);
  if (title) {
    return title[1]
      .replace(/\s*[-|–|—].*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
  }
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; BidetBud-Research/2.0; +https://bidetbud.com)',
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
          Accept: 'text/html,application/xhtml+xml',
        },
        timeout: 25000,
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const next = new URL(res.headers.location, url).href;
          return fetchUrl(next).then(resolve).catch(reject);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          let body = buf.toString('utf8');
          if (!/биде|бидэ|washlet/i.test(body) && /charset=windows-1251/i.test(body)) {
            try {
              const iconv = require('iconv-lite');
              body = iconv.decode(buf, 'win1251');
            } catch {
              /* utf-8 fallback */
            }
          }
          resolve({ url, status: res.statusCode, body });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

/** 101hotels Russia city slugs — crawl hotel listing pages for /rooms links */
const HOTELS_101_CITIES = [
  'moskva', 'sankt-peterburg', 'sochi', 'anapa', 'gelendzhik', 'tuapse',
  'krasnodar', 'kazan', 'yekaterinburg', 'novosibirsk', 'vladivostok',
  'kaliningrad', 'pyatigorsk', 'kislovodsk', 'essentuki', 'zheleznovodsk',
  'nalchik', 'belokuriha', 'adler', 'sirius', 'yalta', 'feodosia',
  'evpatoria', 'sukko', 'lazarevskoye', 'vladimir', 'yaroslavl',
  'sergiev-posad', 'nn', 'samara', 'rostov-na-donu', 'voronezh',
  'perm', 'ufa', 'irkutsk', 'khabarovsk', 'murmansk', 'arkhangelsk',
  'astrakhan', 'novokuznetsk', 'tomsk', 'omsk', 'chelyabinsk',
];

function urls101hotels() {
  return HOTELS_101_CITIES.map(
    (c) => `https://101hotels.com/main/cities/${c}/`
  );
}

function urlsBroniDiscover() {
  return [
    'https://broni.travel/',
    'https://broni.travel/hotels/moskva/',
    'https://broni.travel/hotels/sankt-peterburg/',
    'https://broni.travel/hotels/sochi/',
    'https://broni.travel/hotels/krasnodarskiy-kray/',
    'https://broni.travel/hotels/krym/',
  ];
}

function extractLinks(html, baseUrl, filter) {
  const links = new Set();
  const re = /href=["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const abs = new URL(m[1], baseUrl).href.split('#')[0];
      if (filter(abs)) links.add(abs);
    } catch {
      /* skip */
    }
  }
  return [...links];
}

function buildSeedUrls() {
  const fromFile = loadJson(URL_SEED, []);
  const staticUrls = Array.isArray(fromFile) ? fromFile : fromFile.urls || [];
  return [
    ...staticUrls,
    ...urls101hotels(),
    ...urlsBroniDiscover(),
  ];
}

async function discoverMoreUrls(queue, seen, budget) {
  const discovered = [];
  const seeds = urls101hotels().slice(0, budget);
  for (const cityUrl of seeds) {
    await sleep(DELAY_MS);
    try {
      const { status, body } = await fetchUrl(cityUrl);
      if (status !== 200) continue;
      const hotelLinks = extractLinks(
        body,
        cityUrl,
        (u) =>
          u.includes('101hotels.com/main/cities/') &&
          /\.html$/.test(u) &&
          !seen.has(u)
      );
      for (const h of hotelLinks.slice(0, 40)) {
        discovered.push(h);
        seen.add(h);
      }
    } catch {
      /* continue */
    }
  }
  return discovered;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function dedupeCandidates(hits) {
  const byUrl = new Map();
  for (const h of hits) {
    const key = h.sourceUrl.split('?')[0];
    if (!byUrl.has(key)) byUrl.set(key, h);
  }
  return [...byUrl.values()].map((h) => ({
    name: h.name,
    sourceUrl: h.sourceUrl,
    sourceQuote: h.sourceQuote,
    match: h.match,
    scrapedAt: h.scrapedAt,
  }));
}

async function main() {
  const started = Date.now();
  const deadline = started + RUN_MS;

  const progress = loadJson(OUT_PROGRESS, { done: [], queue: [] });
  const raw = loadJson(OUT_RAW, { hits: [], errors: [], startedAt: null });
  if (!raw.startedAt) raw.startedAt = new Date().toISOString();

  const doneSet = new Set(progress.done || []);
  let queue = [...new Set([...(progress.queue || []), ...buildSeedUrls()])].filter(
    (u) => !doneSet.has(u)
  );

  console.log(
    `Russia exhaustive scrape: ${RUN_MS / 60000} min, delay ${DELAY_MS}ms, queue ${queue.length}`
  );

  // Phase 1: discover hotel URLs from city pages (first 15 min max)
  const discoverUntil = Math.min(deadline, started + 15 * 60 * 1000);
  if (queue.length < 300 && Date.now() < discoverUntil) {
    console.log('Discovering 101hotels property URLs…');
    const seen = new Set([...queue, ...doneSet]);
    const more = await discoverMoreUrls(queue, seen, 25);
    queue.push(...more);
    console.log(`Discovered ${more.length} hotel URLs (queue now ${queue.length})`);
  }

  let processed = 0;
  let hitCount = raw.hits.length;

  while (queue.length > 0 && Date.now() < deadline) {
    const url = queue.shift();
    if (doneSet.has(url)) continue;

    await sleep(DELAY_MS);
    processed++;

    try {
      const { status, body } = await fetchUrl(url);
      doneSet.add(url);

      if (status !== 200) {
        raw.errors.push({ url, status, at: new Date().toISOString() });
      } else {
        const plain = stripHtml(body);
        const rawHtml = decodeEntities(body);
        const searchText = plain.length > 200 ? plain : rawHtml;
        const found = extractBestSnippet(searchText);

        if (found && !isNoiseSnippet(found.snippet, url)) {
          const hit = {
            name: guessName(url, body),
            sourceUrl: url,
            sourceQuote: found.snippet,
            match: found.match,
            scrapedAt: new Date().toISOString(),
          };
          raw.hits.push(hit);
          hitCount++;
          console.log(`HIT [${hitCount}]:`, hit.name.slice(0, 60));
        } else if (processed % 25 === 0) {
          console.log(`… ${processed} fetched, ${hitCount} hits, ${queue.length} left`);
        }

        // Discover room subpages from broni / 101hotels hotel pages
        if (
          (url.includes('broni.travel/hotel') ||
            url.includes('101hotels.com/main/cities/')) &&
          !url.includes('/rooms')
        ) {
          const roomLinks = extractLinks(
            body,
            url,
            (u) =>
              (u.includes('/rooms') || u.includes('opisanie_nomera')) &&
              !doneSet.has(u) &&
              !queue.includes(u)
          );
          queue.push(...roomLinks.slice(0, 12));
        }
      }
    } catch (e) {
      doneSet.add(url);
      raw.errors.push({ url, error: e.message, at: new Date().toISOString() });
    }

    if (processed % 10 === 0) {
      progress.done = [...doneSet];
      progress.queue = queue;
      progress.updatedAt = new Date().toISOString();
      saveJson(OUT_PROGRESS, progress);
      saveJson(OUT_RAW, raw);
      saveJson(OUT_CANDIDATES, dedupeCandidates(raw.hits));
    }
  }

  progress.done = [...doneSet];
  progress.queue = queue;
  progress.completedAt = new Date().toISOString();
  saveJson(OUT_PROGRESS, progress);
  saveJson(OUT_RAW, raw);
  const candidates = dedupeCandidates(raw.hits);
  saveJson(OUT_CANDIDATES, candidates);

  const elapsed = ((Date.now() - started) / 60000).toFixed(1);
  console.log(
    `\nDone in ${elapsed} min. Processed ${processed}, hits ${candidates.length}, errors ${raw.errors.length}`
  );
  console.log(`Wrote ${OUT_CANDIDATES}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
