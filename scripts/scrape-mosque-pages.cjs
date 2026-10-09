#!/usr/bin/env node
/**
 * Fetch official mosque pages and keep only those that name a bidet / shattaf
 * in the building (not a product shop). Public access.
 *
 *   node scripts/scrape-mosque-pages.cjs
 */
const fs = require('fs');
const https = require('https');
const path = require('path');
const { fetchText, sleep, extractBidetSentences, looksLikeShop, BIDET_KW } = require('./lib/africa-web.cjs');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { mergeIntoSeed } = require('./lib/seed-merge.cjs');

const SOURCE = path.join(__dirname, '../data/uk-au-mosque-pages.json');
const OUT = path.join(__dirname, '../data/uk-au-mosque-bidets.json');

function photon(q, codes) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en&countrycodes=${codes}`;
  return new Promise((resolve) => {
    https
      .get(url, { headers: { 'User-Agent': 'BidetBud/1.0 (https://bidetbud.com)' } }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            const f = JSON.parse(d).features?.[0];
            if (!f) return resolve(null);
            const p = f.properties || {};
            resolve({
              latitude: String(f.geometry.coordinates[1]),
              longitude: String(f.geometry.coordinates[0]),
              address: [p.name, p.street, p.housenumber, p.city, p.state, p.postcode, p.country]
                .filter(Boolean)
                .join(', '),
            });
          } catch {
            resolve(null);
          }
        });
      })
      .on('error', () => resolve(null));
  });
}

async function main() {
  const pages = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  const rows = [];
  for (const page of pages) {
    try {
      const html = await fetchText(page.url, { lang: 'en' });
      if (looksLikeShop(html)) continue;
      if (!BIDET_KW.test(html)) {
        console.log(`no bidet: ${page.name}`);
        continue;
      }
      const quote = extractBidetSentences(html).find((s) =>
        /toilet|bathroom|wudu|wu[dḍ]u|restroom|washroom|masjid|mosque/i.test(s)
      );
      if (!quote) {
        console.log(`no venue quote: ${page.name}`);
        continue;
      }
      const codes = page.country === 'Australia' ? 'au' : 'gb';
      const geo = await photon(`${page.name}, ${page.city}, ${page.country}`, codes);
      if (!geo) {
        console.log(`no coords: ${page.name}`);
        continue;
      }
      rows.push({
        name: page.name,
        address: geo.address,
        latitude: geo.latitude,
        longitude: geo.longitude,
        city: page.city,
        country: page.country,
        type: 'mosque',
        bidetStatus: 'internet',
        bidetType: /shattaf|spray|handheld/i.test(quote) ? 'Handheld sprayer' : 'Bidet',
        sourceUrl: page.url,
        sourceQuote: quote.slice(0, 240),
        verifiedMethod: 'web-source',
        access: 'public',
      });
      console.log(`+ ${page.name}`);
    } catch (e) {
      console.log(`fail ${page.name}: ${e.message}`);
    }
    await sleep(400);
  }
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
  const existing = readSeed();
  const { merged, added, skipped } = mergeIntoSeed(existing, rows);
  writeSeed(merged);
  console.log(`Mosque pages: ${rows.length} evidenced, +${added} new (${skipped} skipped). Total ${merged.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
