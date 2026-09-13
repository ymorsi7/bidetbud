#!/usr/bin/env node
/**
 * Merge data/global-crawler-bidets.json into seed (no Reddit geocode pass).
 *
 *   node scripts/import-crawler-json.cjs
 */
const fs = require('fs');
const path = require('path');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { normalizeCountry, isFriendlyCountry } = require('./lib/non-friendly-countries.cjs');
const { inferType } = require('./lib/infer-type.cjs');

const crawlerPath = path.join(__dirname, '../data/global-crawler-bidets.json');

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

function toSeedRow(item) {
  const type = item.type || inferType(item);
  const isWarm =
    item.bidetStatus === 'warmed' ||
    /washlet|toto|heated|electronic bidet|smart toilet|neorest/i.test(item.bidetType || '');

  return {
    name: item.name,
    address: item.address || '',
    latitude: String(item.latitude),
    longitude: String(item.longitude),
    city: item.city,
    country: item.country,
    type,
    bidetStatus: item.bidetStatus || (isWarm ? 'warmed' : 'internet'),
    bidetType: item.bidetType || (isWarm ? 'TOTO / washlet bidet' : 'Bidet'),
    sourceUrl: item.sourceUrl,
    sourceQuote: item.sourceQuote,
    verifiedMethod: item.verifiedMethod || 'web-source',
    access: item.access || (type === 'hotel' ? 'limited' : 'public'),
    ...(item.accessNote ? { accessNote: item.accessNote } : {}),
  };
}

if (!fs.existsSync(crawlerPath)) {
  console.error('Missing', crawlerPath);
  process.exit(1);
}

const batch = JSON.parse(fs.readFileSync(crawlerPath, 'utf8'));
const existing = readSeed();
const seen = new Set(existing.map(dedupeKey));
const seenUrl = new Set(existing.filter((r) => r.sourceUrl).map((r) => r.sourceUrl));
let added = 0;
let skipped = 0;
const merged = [...existing];

for (const item of batch) {
  const country = normalizeCountry(item.country);
  if (!country || isFriendlyCountry(country)) {
    skipped++;
    continue;
  }
  if (!item.sourceUrl || !item.sourceQuote || !item.latitude) {
    skipped++;
    continue;
  }
  const row = toSeedRow({ ...item, country });
  if (seenUrl.has(row.sourceUrl) && existing.some((e) => isNearDuplicate(e, row))) {
    skipped++;
    continue;
  }
  const key = dedupeKey(row);
  if (seen.has(key) || existing.some((e) => isNearDuplicate(e, row))) {
    skipped++;
    continue;
  }
  seen.add(key);
  seenUrl.add(row.sourceUrl);
  merged.push(row);
  added++;
}

writeSeed(merged);
console.log(`Crawler JSON import: +${added} new (${skipped} skipped). Total: ${merged.length}`);
