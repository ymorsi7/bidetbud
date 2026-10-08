#!/usr/bin/env node
/**
 * Merge data/booking-bidet-hotels.json into BIDETBUD_SEED.
 *
 *   node scripts/import-booking-bidets.cjs
 */
const fs = require('fs');
const path = require('path');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { mergeIntoSeed } = require('./lib/seed-merge.cjs');
const { isFriendlyCountry } = require('./lib/non-friendly-countries.cjs');

const DATA = path.join(__dirname, '../data/booking-bidet-hotels.json');

function importBookingBidets() {
  if (!fs.existsSync(DATA)) {
    console.error('Missing', DATA);
    process.exit(1);
  }
  const batch = JSON.parse(fs.readFileSync(DATA, 'utf8'));
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
  console.log(`Booking bidet hotels: +${added} new (${skipped} skipped, ${batch.length} in file).`);
  console.log(`Total seed entries: ${merged.length}`);
  return { added, skipped, total: merged.length };
}

if (require.main === module) {
  importBookingBidets();
}

module.exports = { importBookingBidets };
