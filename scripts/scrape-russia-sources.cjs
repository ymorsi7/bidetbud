#!/usr/bin/env node
/**
 * Crawl Russian-language sources for explicit bidet/washlet evidence.
 * Outputs candidate rows to data/russia-scrape-candidates.json for review.
 *
 * Sources (Russian-focused):
 * - newtoto.ru dealer projects (manufacturer-reference)
 * - broni.travel room amenity pages
 * - 101hotels.com Russia hotel listings
 * - tutu.ru hotel pages
 * - level.travel Russia hotel descriptions
 * - Official .ru hotel room pages (curated URL list)
 *
 * Does NOT auto-import — human must verify each row before adding to
 * data/russia-verified-bidets.json (AGENTS.md policy).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const OUT = path.join(__dirname, '../data/russia-scrape-candidates.json');
const DELAY_MS = 1200;

const BIDET_RE =
  /\b(биде|бидэ|washlet|neorest|гигиеническ(?:ий|ого)\s+душ|умн(?:ый|ого)\s+унитаз|крышк[аи]-биде)\b/i;

/** Curated Russian-source URLs — expand as new hotels are found */
const SEED_URLS = [
  // newtoto.ru Russia projects
  'https://newtoto.ru/category/projects/restoran-marukame/',
  'https://newtoto.ru/category/projects/the-official-state-hermitage-hotel/',
  'https://newtoto.ru/category/projects/intercontinental-moscow-tverskaya/',
  'https://newtoto.ru/category/projects/lotte-hotel-moscow/',
  'https://newtoto.ru/category/projects/park-hyatt-ararat-moscow/',
  // broni.travel (Russian booking)
  'https://broni.travel/hotel-apart-otel-bristol-lazarevskoe/rooms/apartamenty-standart/',
  'https://broni.travel/hotel-spa-otel-rodina-otel-i-spa-essentuki/rooms/',
  'https://broni.travel/hotel-otel-barviha-otel-i-spa-odintsovo/rooms/studio-terass/',
  'https://broni.travel/hotel-gostinitsa-prezident-otel-moskva/rooms/delyuks-double/',
  'https://broni.travel/hotel-otel-standart-otel-moskva-moskva/rooms/',
  // 101hotels Russia
  'https://101hotels.com/main/cities/sukko/gostevoy_dom_diona.html',
  'https://101hotels.com/main/cities/nalchik/gostinitsa_rossiya.html',
  'https://101hotels.com/main/cities/belokuriha/biznes-otel_rossiya.html',
  'https://101hotels.com/main/cities/zheleznodorozhnyi/sanatoriy_sanatoriy_revital_park.html',
  // tutu.ru
  'https://hotel.tutu.ru/h_akyan_stpetersburg/',
  // level.travel Russia
  'https://level.travel/hotels/9019352-Sanatorij_Sochi',
  'https://level.travel/hotels/9160146-Villa_Grand_Otel_Polyana',
  'https://level.travel/hotels/9090875-Otel_Volga',
  // Official Russian hotel sites
  'https://www.roccofortehotels.ru/rooms/polulyuks-ambassador/',
  'https://www.hotel-moscow.ru/rooms/komfort-biznes/',
  'https://baltschughotel.ru/en/rooms/uluchshennyy/',
  'https://www.president-hotel.ru/rooms/delyuks-modus-double/',
  'https://petroffpalacehotel.ru/en/rooms/standartnyy-nomer-s-1-dvuspalnoy-krovatyu/',
  'https://carltonmoscow.com/en/rooms/grand-delyuks/',
  'https://marriottimperialplaza.moscow/en/rooms/lyuks-s-vannoy/',
  // Regional Russian portals
  'https://gorod-kurort-anapa.ru/opisanie_nomera.php?id_hotel=1018&id_room=4839',
  'https://lidfeod.broni.travel/',
  'https://www.jettravel.ru/sea/hotel/96285803/',
];

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent':
            'BidetBud-Research/1.0 (+https://bidetbud.com; data maintenance)',
          'Accept-Language': 'ru-RU,ru;q=0.9',
        },
        timeout: 20000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchUrl(new URL(res.headers.location, url).href)
            .then(resolve)
            .catch(reject);
        }
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ url, status: res.statusCode, body }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSnippet(text, matchIndex) {
  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(text.length, matchIndex + 120);
  return text.slice(start, end).trim();
}

function guessName(url, text) {
  const title = text.match(/<title[^>]*>([^<]+)/i);
  if (title) {
    return title[1]
      .replace(/\s*[-|–].*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
  }
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host;
  } catch {
    return url;
  }
}

async function main() {
  const candidates = [];
  const seen = new Set();

  for (const url of SEED_URLS) {
    await new Promise((r) => setTimeout(r, DELAY_MS));
    try {
      const { status, body } = await fetchUrl(url);
      if (status !== 200) {
        console.warn('SKIP', status, url);
        continue;
      }
      const plain = stripHtml(body);
      const m = plain.match(BIDET_RE);
      if (!m) {
        console.log('no bidet:', url);
        continue;
      }
      const idx = plain.search(BIDET_RE);
      const snippet = extractSnippet(plain, idx);
      const key = url.split('?')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        name: guessName(url, body),
        sourceUrl: url,
        sourceQuote: snippet,
        scrapedAt: new Date().toISOString(),
      });
      console.log('HIT:', guessName(url, body));
    } catch (e) {
      console.warn('ERR', url, e.message);
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(candidates, null, 2));
  console.log(`\nWrote ${candidates.length} candidate(s) to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
