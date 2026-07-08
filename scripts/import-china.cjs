#!/usr/bin/env node
/**
 * Import China bidet locations — VERIFIED SOURCES ONLY.
 *
 * Allowed sources:
 * - TOTO global/China manufacturer references (toto.com/project, toto.com.cn)
 * - Official hotel sites with explicit bidet/washlet/smart-toilet mentions
 * - Guest reviews that explicitly describe bidet/washlet in the room
 *
 * Re-import replaces all existing China rows so addresses/coords stay in sync.
 */
const fs = require('fs');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const path = require('path');

const verifiedPath = path.join(
  __dirname,
  '../data/china-verified-bidets.json'
);

function toSeedRow(row) {
  const isWarm =
    row.bidetStatus === 'warmed' ||
    /washlet|toto|heated|electronic bidet|smart toilet|neorest/i.test(
      row.bidetType || ''
    );

  return {
    name: row.name,
    address: row.address,
    latitude: String(row.latitude),
    longitude: String(row.longitude),
    city: row.city,
    country: 'China',
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

const withoutChina = existing.filter((row) => row.country !== 'China');
const seen = new Set(withoutChina.map(dedupeKey));
let added = 0;

for (const item of verified) {
  if (!item.sourceUrl || !item.sourceQuote) {
    console.warn('Skipping (no source evidence):', item.name);
    continue;
  }
  const row = toSeedRow(item);
  const key = dedupeKey(row);
  if (seen.has(key)) continue;
  seen.add(key);
  withoutChina.push(row);
  added++;
}

writeSeed(withoutChina);

console.log(
  `China import: ${added} locations (${verified.length} in source). Removed ${existing.filter((r) => r.country === 'China').length} prior China row(s).`
);
console.log(`Total seed entries: ${withoutChina.length}`);
