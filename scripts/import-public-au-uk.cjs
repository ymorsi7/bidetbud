#!/usr/bin/env node
/**
 * Merge data/public-au-uk-crawl-bidets.json — public venues only.
 */
const fs = require('fs');
const path = require('path');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { mergeIntoSeed } = require('./lib/seed-merge.cjs');
const { inferType } = require('./lib/infer-type.cjs');

const SOURCE = path.join(__dirname, '../data/public-au-uk-crawl-bidets.json');
const BIDET_RE =
  /\bbidet(s|\s+toilet|\s+attachment|\s+hand\s+shower)?\b|\bwashlet\b|\bclosomat\b|\baquaclean\b|\bshattaf\b|\bhandheld sprayer\b|\bjapanese toilet\b/i;
const HOTEL_RE =
  /\b(hotel|motel|inn|resort|hostel|suites|lodge|marriott|hilton|hyatt|airbnb)\b/i;

if (!fs.existsSync(SOURCE)) {
  console.log(`No ${SOURCE} — nothing to import.`);
  process.exit(0);
}

function toSeedRow(row) {
  const type = row.type || inferType(row);
  const isWarm = /washlet|toto|heated|closomat|aquaclean|neorest/i.test(row.bidetType || row.sourceQuote || '');
  return {
    name: row.name,
    address: row.address || '',
    latitude: String(row.latitude),
    longitude: String(row.longitude),
    city: row.city,
    country: row.country,
    type,
    bidetStatus: row.bidetStatus || (isWarm ? 'warmed' : 'internet'),
    bidetType: row.bidetType,
    sourceUrl: row.sourceUrl,
    sourceQuote: row.sourceQuote,
    verifiedMethod: row.verifiedMethod || 'web-source',
    access: 'public',
    ...(row.accessNote ? { accessNote: row.accessNote } : {}),
  };
}

const batch = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
const candidates = batch
  .map((item) => toSeedRow(item))
  .filter(
    (row) =>
      row.sourceUrl &&
      row.sourceQuote &&
      row.latitude &&
      BIDET_RE.test(row.sourceQuote) &&
      row.access === 'public' &&
      row.type !== 'hotel' &&
      !HOTEL_RE.test(row.name)
  );

const existing = readSeed();
const { merged, added, skipped } = mergeIntoSeed(existing, candidates);
writeSeed(merged);
console.log(`Public AU/UK crawl import: +${added} new (${skipped} skipped). Total: ${merged.length}`);
