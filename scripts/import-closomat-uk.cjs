#!/usr/bin/env node
/**
 * Merge Closomat wash-and-dry (Changing Places) venues into BIDETBUD_SEED.
 *
 *   node scripts/scrape-closomat-uk.cjs
 *   node scripts/import-closomat-uk.cjs
 */
const fs = require('fs');
const path = require('path');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { mergeIntoSeed } = require('./lib/seed-merge.cjs');

const SOURCE = path.join(__dirname, '../data/closomat-uk-bidets.json');

if (!fs.existsSync(SOURCE)) {
  console.error(`Missing ${SOURCE} — run scripts/scrape-closomat-uk.cjs first.`);
  process.exit(1);
}

const candidates = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
const existing = readSeed();
const { merged, added, skipped } = mergeIntoSeed(existing, candidates, {
  accept: (row) => row.country === 'UK' && !!row.sourceQuote,
});

writeSeed(merged);

console.log(`Closomat UK import: +${added} new (${skipped} skipped).`);
console.log(`UK rows in seed: ${merged.filter((r) => r.country === 'UK').length}`);
console.log(`Total seed entries: ${merged.length}`);
