#!/usr/bin/env node
/**
 * Merge data/uk-web-crawl-bidets.json into BIDETBUD_SEED.
 */
const fs = require('fs');
const path = require('path');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { mergeIntoSeed } = require('./lib/seed-merge.cjs');
const { inferType } = require('./lib/infer-type.cjs');

const SOURCE = path.join(__dirname, '../data/uk-web-crawl-bidets.json');
const BIDET_RE =
  /\bbidet(s|\s+toilet|\s+attachment|\s+hand\s+shower)?\b|\bwashlet\b|\bclosomat\b|\baquaclean\b|\bshattaf\b|\bhandheld sprayer\b/i;

if (!fs.existsSync(SOURCE)) {
  console.log(`No ${SOURCE} — nothing to import.`);
  process.exit(0);
}

function toSeedRow(row) {
  const type = row.type || inferType(row);
  const isWarm =
    row.bidetStatus === 'warmed' ||
    /washlet|toto|heated|closomat|aquaclean/i.test(row.bidetType || row.sourceQuote || '');

  return {
    name: row.name,
    address: row.address || '',
    latitude: String(row.latitude),
    longitude: String(row.longitude),
    city: row.city,
    country: 'UK',
    type,
    bidetStatus: row.bidetStatus || (isWarm ? 'warmed' : 'internet'),
    bidetType: row.bidetType,
    sourceUrl: row.sourceUrl,
    sourceQuote: row.sourceQuote,
    verifiedMethod: row.verifiedMethod || 'web-source',
    access: row.access || (type === 'hotel' ? 'limited' : 'public'),
    ...(row.accessNote ? { accessNote: row.accessNote } : {}),
  };
}

const batch = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
const candidates = batch
  .map((item) => toSeedRow(item))
  .filter((row) => row.sourceUrl && row.sourceQuote && row.latitude && BIDET_RE.test(row.sourceQuote));

const existing = readSeed();
const { merged, added, skipped } = mergeIntoSeed(existing, candidates);
writeSeed(merged);
console.log(`UK web import: +${added} new (${skipped} skipped). Total: ${merged.length}`);
