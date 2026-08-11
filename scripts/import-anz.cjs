#!/usr/bin/env node
/**
 * Merge Australia / New Zealand bidet rows into BIDETBUD_SEED.
 * Sources: data/anz-airbnb-bidets.json, data/anz-verified-bidets.json, data/anz-web-crawl-bidets.json
 */
const fs = require('fs');
const path = require('path');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { inferType } = require('./lib/infer-type.cjs');

const ANZ = new Set(['Australia', 'New Zealand']);
const SOURCES = [
  path.join(__dirname, '../data/anz-verified-bidets.json'),
  path.join(__dirname, '../data/anz-airbnb-bidets.json'),
  path.join(__dirname, '../data/anz-web-crawl-bidets.json'),
  path.join(__dirname, '../data/anz-reddit-bidets.json'),
];

function normName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function dedupeKey(row) {
  return [normName(row.name), Number(row.latitude).toFixed(5), Number(row.longitude).toFixed(5)].join('|');
}

function isNearDuplicate(existing, candidate) {
  if (existing.country !== candidate.country) return false;
  const a = normName(existing.name);
  const b = normName(candidate.name);
  if (a === b) return true;
  const min = Math.min(a.length, b.length, 14);
  if (min >= 8 && (a.includes(b.slice(0, min)) || b.includes(a.slice(0, min)))) {
    const dLat = Math.abs(Number(existing.latitude) - Number(candidate.latitude));
    const dLon = Math.abs(Number(existing.longitude) - Number(candidate.longitude));
    if (dLat < 0.03 && dLon < 0.03) return true;
  }
  return false;
}

function toSeedRow(row) {
  const isWarm =
    row.bidetStatus === 'warmed' ||
    /washlet|toto|heated|neorest|smart toilet/i.test(row.bidetType || row.sourceQuote || '');

  return {
    name: row.name,
    address: row.address || '',
    latitude: String(row.latitude),
    longitude: String(row.longitude),
    city: row.city,
    country: row.country,
    type: row.type || inferType(row),
    bidetStatus: row.bidetStatus || (isWarm ? 'warmed' : 'internet'),
    bidetType: row.bidetType || (isWarm ? 'TOTO / washlet bidet' : 'Bidet'),
    sourceUrl: row.sourceUrl,
    sourceQuote: row.sourceQuote,
    verifiedMethod: row.verifiedMethod || 'web-source',
    access: row.access || (row.type === 'hotel' ? 'limited' : 'public'),
    ...(row.accessNote ? { accessNote: row.accessNote } : {}),
  };
}

const existing = readSeed();
const withoutAnz = existing.filter((r) => !ANZ.has(r.country));
const keptAnz = existing.filter((r) => ANZ.has(r.country));

const seen = new Set(withoutAnz.concat(keptAnz).map(dedupeKey));
const seenUrl = new Set(
  withoutAnz.concat(keptAnz).filter((r) => r.sourceUrl).map((r) => r.sourceUrl)
);

let added = 0;
let skipped = 0;
const merged = [...withoutAnz, ...keptAnz];

for (const file of SOURCES) {
  if (!fs.existsSync(file)) continue;
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const row of rows) {
    if (!ANZ.has(row.country)) continue;
    if (!row.latitude || !row.longitude || !row.name) continue;
    const seed = toSeedRow(row);
    const key = dedupeKey(seed);
    if (seen.has(key) || (seed.sourceUrl && seenUrl.has(seed.sourceUrl))) {
      skipped++;
      continue;
    }
    if (merged.some((e) => isNearDuplicate(e, seed))) {
      skipped++;
      continue;
    }
    seen.add(key);
    if (seed.sourceUrl) seenUrl.add(seed.sourceUrl);
    merged.push(seed);
    added++;
  }
}

writeSeed(merged);
const au = merged.filter((r) => r.country === 'Australia' && ['verified', 'warmed', 'internet'].includes(r.bidetStatus));
const nz = merged.filter((r) => r.country === 'New Zealand' && ['verified', 'warmed', 'internet'].includes(r.bidetStatus));
console.log(`ANZ import: +${added} new, ${skipped} skipped dupes. Australia=${au.length} New Zealand=${nz.length} total=${au.length + nz.length}`);
