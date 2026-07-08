#!/usr/bin/env node
/**
 * Import hotels named in the r/FATTravel "Hotels with Japanese toilets/washlets"
 * thread into BIDETBUD_SEED.
 *
 * Source: data/reddit-fattravel-bidets.json — each row cites the thread
 * (sourceUrl + sourceQuote) as evidence of a bidet/washlet.
 *
 * Only adds net-new rows. Dedupes on name + coordinates (NOT on sourceUrl,
 * since every row shares the same Reddit thread URL). Never replaces rows.
 */
const fs = require('fs');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const path = require('path');

const srcPath = path.join(__dirname, '../data/reddit-fattravel-bidets.json');

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
    country: row.country,
    type: row.type || 'hotel',
    bidetStatus: row.bidetStatus || (isWarm ? 'warmed' : 'internet'),
    bidetType: row.bidetType,
    sourceUrl: row.sourceUrl,
    sourceQuote: row.sourceQuote,
    verifiedMethod: row.verifiedMethod || 'web-source',
    access: row.access || 'limited',
    accessNote:
      row.accessNote || 'Hotel guest rooms only — not open to the public',
    ...(row.searchAliases ? { searchAliases: row.searchAliases } : {}),
  };
}

function normName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function dedupeKey(row) {
  return [
    normName(row.name),
    Number(row.latitude).toFixed(5),
    Number(row.longitude).toFixed(5),
  ].join('|');
}

function isNearDuplicate(existing, candidate) {
  if (existing.country !== candidate.country) return false;
  const a = normName(existing.name);
  const b = normName(candidate.name);
  if (a === b) return true;
  if (a.length >= 8 && b.length >= 8 && (a.includes(b) || b.includes(a))) {
    const dLat = Math.abs(Number(existing.latitude) - Number(candidate.latitude));
    const dLon = Math.abs(Number(existing.longitude) - Number(candidate.longitude));
    if (dLat < 0.02 && dLon < 0.02) return true;
  }
  return false;
}

if (!fs.existsSync(srcPath)) {
  console.error('Missing', srcPath);
  process.exit(1);
}

const existing = readSeed();
const verified = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
const seen = new Set(existing.map(dedupeKey));

let added = 0;
let skipped = 0;
const merged = [...existing];

for (const item of verified) {
  if (!item.sourceUrl || !item.sourceQuote) {
    console.warn('Skipping (no source evidence):', item.name);
    continue;
  }
  const lat = Number(item.latitude);
  const lon = Number(item.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    console.warn('Skipping (bad coords):', item.name);
    continue;
  }

  const row = toSeedRow(item);
  const key = dedupeKey(row);

  if (seen.has(key)) {
    console.log('Skip (coords+name):', row.name);
    skipped++;
    continue;
  }
  if (merged.some((e) => isNearDuplicate(e, row))) {
    console.log('Skip (near duplicate):', row.name);
    skipped++;
    continue;
  }

  seen.add(key);
  merged.push(row);
  added++;
}

writeSeed(merged);

console.log(
  `Reddit FATTravel import: +${added} new (${skipped} skipped, ${verified.length} in source).`
);
console.log(`Total seed entries: ${merged.length}`);
