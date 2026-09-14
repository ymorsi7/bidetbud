#!/usr/bin/env node
/**
 * Merge Atly regional + LATAM scrape JSON into seed (public restaurants default).
 */
const fs = require('fs');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { mergeIntoSeed } = require('./lib/seed-merge.cjs');
const path = require('path');
const { inferType } = require('./lib/infer-type.cjs');
const { BIDET_RE } = require('./lib/atly-web.cjs');

const SOURCES = [
  path.join(__dirname, '../data/atly-regional-bidets.json'),
  path.join(__dirname, '../data/atly-latam-bidets.json'),
  path.join(__dirname, '../data/canada-atly-bidets.json'),
  path.join(__dirname, '../data/atly-uk-bidets.json'),
  path.join(__dirname, '../data/atly-australia-bidets.json'),
  path.join(__dirname, '../data/atly-canada-bidets.json'),
  path.join(__dirname, '../data/atly-mexico-bidets.json'),
  path.join(__dirname, '../data/atly-colombia-bidets.json'),
  path.join(__dirname, '../data/anz-web-crawl-bidets.json'),
  path.join(__dirname, '../data/uk-web-crawl-bidets.json'),
];

const ALLOW = new Set([
  'Canada',
  'Mexico',
  'Colombia',
  'Venezuela',
  'Paraguay',
  'UK',
  'Australia',
  'New Zealand',
  'China',
]);

function normName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function dedupeKey(row) {
  return [normName(row.name), Number(row.latitude).toFixed(5), Number(row.longitude).toFixed(5)].join('|');
}

function evidenceKey(row) {
  return [row.sourceUrl || '', normName(row.name)].join('|');
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
  const type = row.type || inferType(row);
  const isWarm =
    row.bidetStatus === 'warmed' ||
    /washlet|toto|heated|electronic bidet|smart toilet|neorest/i.test(row.bidetType || '');

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
    access: row.access || (type === 'hotel' ? 'limited' : 'public'),
    ...(row.accessNote ? { accessNote: row.accessNote } : {}),
  };
}

let existing = readSeed();
let totalAdded = 0;
let totalSkipped = 0;

for (const dataPath of SOURCES) {
  if (!fs.existsSync(dataPath)) continue;
  const batch = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const candidates = batch
    .filter((item) => ALLOW.has(item.country))
    .map((item) => toSeedRow(item))
    .filter((row) => row.sourceUrl && row.sourceQuote && row.latitude && BIDET_RE.test(row.sourceQuote));

  const { merged, added, skipped } = mergeIntoSeed(existing, candidates);
  existing = merged;
  totalAdded += added;
  totalSkipped += skipped;
  if (added) console.log(path.basename(dataPath), '+', added);
}

writeSeed(existing);
const byCountry = {};
for (const r of existing) {
  if (!ALLOW.has(r.country)) continue;
  if (r.sourceQuote?.includes('Atly bathroom guide')) {
    byCountry[r.country] = (byCountry[r.country] || 0) + 1;
  }
}
console.log(`Regional Atly import: +${totalAdded} (${totalSkipped} skipped). Atly rows by country:`, byCountry);
console.log('Total seed:', existing.length);
