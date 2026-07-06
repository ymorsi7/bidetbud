#!/usr/bin/env node
/**
 * Scrape Geberit's published "hotels with a Geberit AquaClean shower toilet"
 * reference pages (Netherlands, Germany, Denmark, Austria, Switzerland) into
 * data/geberit-hotels.json.
 *
 * Each hotel Geberit lists has confirmed AquaClean shower toilets installed, so
 * rows become bidetStatus: "warmed", verifiedMethod: "manufacturer-reference"
 * at import time. Coordinates are filled in later by geocode-geberit-hotels.cjs.
 *
 * Usage: node scripts/scrape-geberit-hotels.cjs
 *
 * See scripts/lib/geberit-web.cjs for the (shared) page parser and the note on
 * why the fully-comprehensive interactive Hotel Locator isn't statically
 * scrapeable.
 */
const fs = require('fs');
const path = require('path');
const { SOURCES, parseHotels, fetchHtml, sleep } = require('./lib/geberit-web.cjs');

const OUT = path.join(__dirname, '../data/geberit-hotels.json');

function shortQuote(text, name) {
  if (!text) return `Listed by Geberit as a hotel with an AquaClean shower toilet (${name}).`;
  const t = text.length > 240 ? text.slice(0, 237).replace(/\s+\S*$/, '') + '…' : text;
  return t;
}

async function main() {
  const all = [];
  for (const src of SOURCES) {
    process.stdout.write(`Fetching ${src.country} … `);
    let html;
    try {
      html = await fetchHtml(src.url);
    } catch (e) {
      console.log(`FAILED (${e.message})`);
      continue;
    }
    const hotels = parseHotels(html);
    console.log(`${hotels.length} hotels`);
    for (const h of hotels) {
      all.push({
        name: h.name,
        website: h.website,
        city: h.region || src.country,
        region: h.region || '',
        country: src.country,
        cc: src.cc,
        type: 'hotel',
        bidetStatus: 'warmed',
        bidetType: 'Geberit AquaClean shower toilet',
        sourceUrl: src.url,
        sourceQuote: shortQuote(h.description, h.name),
        verifiedMethod: 'manufacturer-reference',
        access: 'limited',
        accessNote: 'Hotel guests — available in select room categories',
        latitude: '',
        longitude: '',
      });
    }
    await sleep(500);
  }

  fs.writeFileSync(OUT, JSON.stringify(all, null, 2) + '\n');
  const byCountry = all.reduce((a, r) => ((a[r.country] = (a[r.country] || 0) + 1), a), {});
  console.log(`\nWrote ${all.length} Geberit hotel rows to ${OUT}`);
  console.log('By country:', byCountry);
}

main();
