#!/usr/bin/env node
/**
 * Crawl curated German-language sources for explicit bidet/Dusch-WC evidence.
 * Outputs candidates to data/germany-scrape-candidates.json for review.
 *
 * German-focused sources:
 * - geberit.de hotel references + AquaClean hotel list
 * - eu.toto.com/en Germany reference case studies
 * - German trade press (SHK Profi, Baulinks)
 * - Official German luxury hotel sites
 *
 * Does NOT auto-import — review before adding to germany-verified-bidets.json.
 */
const fs = require('fs');
const path = require('path');
const {
  sleep,
  fetchText,
  parseGenericGermanPage,
  parseGeberitReference,
  parseTotoDeReference,
  isValidRowName,
  hasBidetSignal,
} = require('./lib/germany-web.cjs');

const OUT = path.join(__dirname, '../data/germany-scrape-candidates.json');
const DELAY_MS = 1200;

const SEED_URLS = [
  'https://www.geberit.de/know-how/referenzen/the-fontenay-hamburg/',
  'https://www.geberit.de/know-how/referenzen/riku-hotel-pfullendorf/',
  'https://www.geberit.de/know-how/referenzen/hotel-rosenhof/',
  'https://www.geberit.de/badezimmerprodukte/wcs-urinale/dusch-wcs-geberit-aquaclean/testen/hotels-mit-dusch-wc/',
  'https://eu.toto.com/en/company-information/references/sofitel-bayernpost-munich',
  'https://eu.toto.com/en/company-information/references/vier-jahreszeiten-kempinski-munich',
  'https://eu.toto.com/en/company-information/references/mandarin-oriental-munich',
  'https://eu.toto.com/en/company-information/references/hotel-schloss-elmau',
  'https://eu.toto.com/en/company-information/references/schwarzwaldhotel-treschers-titisee-neustadt',
  'https://www.shk-profi.de/artikel/shk_Dusch-WC_im_Luxus-Hotel-3052137.html',
  'https://www.thefontenay.de/zimmer/',
  'https://www.sofitel-munich.com/de/zimmer/',
  'https://www.kempinski.com/de/munich/hotel-vier-jahreszeiten/',
  'https://www.mandarinoriental.com/de/munich/alter-hof',
  'https://www.schloss-elmau.de/de/zimmer-suiten',
  'https://www.bachmair-weissach.de/zimmer-suiten',
  'https://www.riku-hotel.de/',
  'https://www.hotel-rosenhof.de/',
  'https://www.radissonhotels.com/de-de/hotels/radisson-blu-koeln',
  'https://www.marriott.com/de/hotels/mucwi-munich-marriott-hotel-city-west/rooms/',
  'https://www.marriott.com/de/hotels/frajw-jw-marriott-hotel-frankfurt/rooms/',
];

async function main() {
  const candidates = [];
  const seen = new Set();

  for (const url of SEED_URLS) {
    await sleep(DELAY_MS);
    try {
      const html = await fetchText(url);
      let parsed = null;
      if (/geberit\.de\/know-how\/referenzen/i.test(url)) {
        parsed = parseGeberitReference(html, url);
      } else if (/eu\.toto\.com\/.*\/references\//i.test(url)) {
        parsed = parseTotoDeReference(html, url.split('/').pop(), url);
      } else if (hasBidetSignal(html)) {
        parsed = parseGenericGermanPage(html, url);
      }
      if (!parsed?.hasBidet || !isValidRowName(parsed.name)) {
        console.log('no bidet:', url);
        continue;
      }
      const key = url.split('?')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        name: parsed.name,
        sourceUrl: url,
        sourceQuote: parsed.sourceQuote,
        bidetType: parsed.bidetType,
        scrapedAt: new Date().toISOString(),
      });
      console.log('HIT:', parsed.name);
    } catch (e) {
      console.warn('ERR', url, e.message);
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(candidates, null, 2) + '\n');
  console.log(`\nWrote ${candidates.length} candidate(s) to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
