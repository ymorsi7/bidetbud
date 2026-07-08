#!/usr/bin/env node
/**
 * Append verified non-Singapore bidet locations from data/verified-expansion-bidets.json.
 */
const fs = require('fs');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const path = require('path');

const verifiedPath = path.join(__dirname, '../data/verified-expansion-bidets.json');

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

function toSeedRow(row) {
  const isWarm =
    row.bidetStatus === 'warmed' ||
    /washlet|toto|heated|electronic bidet|smart toilet|neorest/i.test(row.bidetType || '');

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
    ...(row.accessNote ? { accessNote: row.accessNote } : {}),
  };
}

if (!fs.existsSync(verifiedPath)) {
  console.error('Missing', verifiedPath);
  process.exit(1);
}

const existing = readSeed();
const verified = JSON.parse(fs.readFileSync(verifiedPath, 'utf8'));

const seen = new Set(existing.map(dedupeKey));
const seenUrl = new Set(existing.filter((r) => r.sourceUrl).map((r) => r.sourceUrl));

let added = 0;
let skipped = 0;
const merged = [...existing];

for (const item of verified) {
  const row = toSeedRow(item);
  if (seenUrl.has(row.sourceUrl)) {
    skipped++;
    continue;
  }
  const key = dedupeKey(row);
  if (seen.has(key)) {
    skipped++;
    continue;
  }
  if (existing.some((e) => isNearDuplicate(e, row))) {
    skipped++;
    continue;
  }
  seen.add(key);
  seenUrl.add(row.sourceUrl);
  merged.push(row);
  added++;
}

writeSeed(merged);

const byCountry = {};
merged
  .filter((r) => r.country !== 'Singapore')
  .forEach((r) => {
    byCountry[r.country] = (byCountry[r.country] || 0) + 1;
  });

console.log(`Verified expansion: +${added} new (${skipped} skipped, ${verified.length} in source).`);
console.log('Non-Singapore totals:', byCountry);
console.log(`Total seed entries: ${merged.length}`);
