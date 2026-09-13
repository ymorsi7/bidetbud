#!/usr/bin/env node
/**
 * Merge the Atly sitemap sweep (data/atly-sitemap-bidets.json) into BIDETBUD_SEED.
 *
 *   node scripts/crawl-atly-sitemap.cjs --minutes=90
 *   node scripts/import-atly-sitemap.cjs
 */
const fs = require('fs');
const path = require('path');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { mergeIntoSeed } = require('./lib/seed-merge.cjs');
const { isFriendlyCountry } = require('./lib/non-friendly-countries.cjs');
const { inferType } = require('./lib/infer-type.cjs');
const { BIDET_RE } = require('./lib/atly-web.cjs');

const SOURCE = path.join(__dirname, '../data/atly-sitemap-bidets.json');

if (!fs.existsSync(SOURCE)) {
  console.error(`Missing ${SOURCE} — run scripts/crawl-atly-sitemap.cjs first.`);
  process.exit(1);
}

const candidates = JSON.parse(fs.readFileSync(SOURCE, 'utf8')).map((row) => ({
  ...row,
  type: row.type || inferType(row),
}));

const existing = readSeed();
const { merged, added, skipped } = mergeIntoSeed(existing, candidates, {
  accept: (row) =>
    !isFriendlyCountry(row.country) && !!row.sourceQuote && BIDET_RE.test(row.sourceQuote),
});

writeSeed(merged);

const byCountry = candidates.reduce((a, r) => {
  a[r.country] = (a[r.country] || 0) + 1;
  return a;
}, {});
console.log(`Atly sitemap import: +${added} new (${skipped} skipped).`);
console.log('Crawl rows by country:', byCountry);
console.log(`Total seed entries: ${merged.length}`);
