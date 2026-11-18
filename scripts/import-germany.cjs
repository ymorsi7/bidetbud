#!/usr/bin/env node
/**
 * Import Germany bidet locations — VERIFIED SOURCES ONLY.
 *
 * Allowed sources:
 * - TOTO Europe / Geberit manufacturer references
 * - Official German hotel sites with explicit Dusch-WC/Washlet mentions
 * - Curated rows in data/germany-verified-bidets.json (each must cite evidence)
 *
 * Re-import replaces all existing Germany rows so addresses/coords stay in sync.
 */
const fs = require('fs');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const path = require('path');

const verifiedPath = path.join(
  __dirname,
  '../data/germany-verified-bidets.json'
);

function toSeedRow(row) {
  const isWarm =
    row.bidetStatus === 'warmed' ||
    /washlet|toto|heated|electronic bidet|dusch-wc|aquaclean|neorest/i.test(
      row.bidetType || ''
    );

  return {
    name: row.name,
    address: row.address,
    latitude: String(row.latitude),
    longitude: String(row.longitude),
    city: row.city,
    country: 'Germany',
    type: row.type || 'hotel',
    bidetStatus: row.bidetStatus || (isWarm ? 'warmed' : 'internet'),
    bidetType: row.bidetType,
    sourceUrl: row.sourceUrl,
    sourceQuote: row.sourceQuote,
    verifiedMethod: row.verifiedMethod || 'web-source',
    access: row.access || 'public',
    ...(row.accessNote ? { accessNote: row.accessNote } : {}),
    ...(row.searchAliases ? { searchAliases: row.searchAliases } : {}),
  };
}

function dedupeKey(row) {
  return [
    row.name.toLowerCase(),
    Number(row.latitude).toFixed(5),
    Number(row.longitude).toFixed(5),
  ].join('|');
}

if (!fs.existsSync(verifiedPath)) {
  console.error('Missing', verifiedPath);
  process.exit(1);
}

const existing = readSeed();
const verified = JSON.parse(fs.readFileSync(verifiedPath, 'utf8'));

// Net-new only — never strip other Germany rows (TOTO try / Geberit / Booking).
const { mergeIntoSeed } = require('./lib/seed-merge.cjs');
const batch = [];
for (const item of verified) {
  if (!item.sourceUrl || !item.sourceQuote) {
    console.warn('Skipping (no source evidence):', item.name);
    continue;
  }
  batch.push(toSeedRow(item));
}
const { merged, added, skipped } = mergeIntoSeed(existing, batch);
writeSeed(merged);

console.log(
  `Germany verified: +${added} new (${skipped} skipped, ${verified.length} in source).`
);
console.log(`Total seed entries: ${merged.length}`);
