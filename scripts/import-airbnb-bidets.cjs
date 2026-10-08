#!/usr/bin/env node
/**
 * Merge data/airbnb-bidets.json (and the older ANZ file) into BIDETBUD_SEED.
 *
 *   node scripts/import-airbnb-bidets.cjs
 */
const fs = require('fs');
const path = require('path');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { mergeIntoSeed } = require('./lib/seed-merge.cjs');
const { isFriendlyCountry } = require('./lib/non-friendly-countries.cjs');

const FILES = [
  path.join(__dirname, '../data/airbnb-bidets.json'),
  path.join(__dirname, '../data/anz-airbnb-bidets.json'),
];

function importAirbnbBidets() {
  const batch = [];
  for (const f of FILES) {
    if (!fs.existsSync(f)) continue;
    const rows = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (Array.isArray(rows)) batch.push(...rows);
  }
  const existing = readSeed();
  const { merged, added, skipped } = mergeIntoSeed(existing, batch, {
    accept: (row) =>
      row &&
      row.sourceUrl &&
      row.latitude &&
      row.longitude &&
      row.country !== 'Israel' &&
      !isFriendlyCountry(row.country),
  });
  writeSeed(merged);
  console.log(`Airbnb bidets: +${added} new (${skipped} skipped, ${batch.length} in files).`);
  console.log(`Total seed entries: ${merged.length}`);
  return { added, skipped, total: merged.length };
}

if (require.main === module) {
  importAirbnbBidets();
}

module.exports = { importAirbnbBidets };
