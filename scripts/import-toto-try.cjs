#!/usr/bin/env node
/**
 * Import TOTO "Try WASHLET" finder locations into BIDETBUD_SEED.
 * Source: data/toto-try-washlet.json (scrape-toto-try.cjs + geocode-toto-try.cjs)
 *
 * These are TOTO showrooms / dealers with a WASHLET installed in the guest
 * toilet you can try in person: bidetStatus "warmed", type "public",
 * manufacturer-reference. Replaces prior rows from this same source on re-run.
 */
const fs = require('fs');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const path = require('path');

const dataPath = path.join(__dirname, '../data/toto-try-washlet.json');
const SOURCE_URL = 'https://eu.toto.com/en/service/try-washlettm';

function dedupeKey(row) {
  return [
    row.name.toLowerCase(),
    Number(row.latitude).toFixed(5),
    Number(row.longitude).toFixed(5),
  ].join('|');
}

function toSeedRow(row) {
  return {
    name: row.name,
    address: row.address || '',
    latitude: String(row.latitude),
    longitude: String(row.longitude),
    city: row.city,
    country: row.country,
    type: 'public',
    bidetStatus: 'warmed',
    bidetType: row.bidetType || 'TOTO WASHLET',
    sourceUrl: SOURCE_URL,
    sourceQuote: row.sourceQuote,
    verifiedMethod: 'manufacturer-reference',
    access: 'public',
    accessNote: 'TOTO showroom / dealer — WASHLET on display to try during opening hours',
  };
}

if (!fs.existsSync(dataPath)) {
  console.error('Run: node scripts/scrape-toto-try.cjs && node scripts/geocode-toto-try.cjs first');
  process.exit(1);
}

const existing = readSeed();
const source = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Drop prior rows from this exact source URL to avoid stale duplicates.
const without = existing.filter((r) => String(r.sourceUrl || '') !== SOURCE_URL);

const seen = new Set(without.map(dedupeKey));

let added = 0;
let skippedNoCoords = 0;
const merged = [...without];

for (const item of source) {
  if (!item.latitude || !item.longitude) {
    skippedNoCoords++;
    continue;
  }
  const row = toSeedRow(item);
  const key = dedupeKey(row);
  if (seen.has(key)) continue;
  seen.add(key);
  merged.push(row);
  added++;
}

writeSeed(merged);

const byCountry = merged
  .filter((r) => String(r.sourceUrl || '') === SOURCE_URL)
  .reduce((a, r) => {
    a[r.country] = (a[r.country] || 0) + 1;
    return a;
  }, {});

console.log(`Added ${added} TOTO "Try WASHLET" locations (${source.length} in source file, ${skippedNoCoords} skipped for missing coords).`);
console.log('By country:', byCountry);
console.log(`Total seed entries: ${merged.length}`);
