#!/usr/bin/env node
/**
 * Merge data/atly-deep-public-bidets.json into BIDETBUD_SEED.
 * Hotels are dropped; every row needs sourceQuote with explicit bidet evidence.
 *
 *   node scripts/import-atly-deep-public.cjs
 */
const fs = require('fs');
const path = require('path');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { mergeIntoSeed } = require('./lib/seed-merge.cjs');
const { isFriendlyCountry } = require('./lib/non-friendly-countries.cjs');
const { BIDET_RE } = require('./lib/atly-web.cjs');

const SOURCE = path.join(__dirname, '../data/atly-deep-public-bidets.json');
const HOTEL_RE =
  /\b(hotel|motel|inn|resort|hostel|suites|lodge|marriott|hilton|hyatt|sheraton|westin|radisson)\b/i;

if (!fs.existsSync(SOURCE)) {
  console.error(`Missing ${SOURCE} - run scripts/scrape-atly-deep-public.cjs first.`);
  process.exit(1);
}

const candidates = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
const existing = readSeed();
const { merged, added, skipped } = mergeIntoSeed(existing, candidates, {
  accept: (row) =>
    !isFriendlyCountry(row.country) &&
    !!row.sourceQuote &&
    BIDET_RE.test(row.sourceQuote) &&
    row.type !== 'hotel' &&
    !HOTEL_RE.test(row.name || ''),
});

writeSeed(merged);

const byType = candidates.reduce((a, r) => {
  a[r.type] = (a[r.type] || 0) + 1;
  return a;
}, {});
console.log(`Atly deep-public import: +${added} new (${skipped} skipped).`);
console.log('Crawl file by type:', byType);
console.log(`Total seed entries: ${merged.length}`);
