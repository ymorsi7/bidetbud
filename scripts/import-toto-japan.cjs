#!/usr/bin/env node
/**
 * Import TOTO Japan hotel case studies into BIDETBEACON_SEED (additive).
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../index.html');
const dataPath = path.join(__dirname, '../data/toto-japan-references.json');

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
  const min = Math.min(a.length, b.length, 12);
  if (min >= 8 && (a.includes(b.slice(0, min)) || b.includes(a.slice(0, min)))) {
    const dLat = Math.abs(Number(existing.latitude) - Number(candidate.latitude));
    const dLon = Math.abs(Number(existing.longitude) - Number(candidate.longitude));
    if (dLat < 0.05 && dLon < 0.05) return true;
  }
  return false;
}

function toSeedRow(row) {
  return {
    name: row.name,
    address: row.address || '',
    latitude: String(row.latitude),
    longitude: String(row.longitude),
    city: row.city,
    country: row.country,
    type: row.type || 'hotel',
    bidetStatus: 'warmed',
    bidetType: row.bidetType || 'TOTO WASHLET',
    sourceUrl: row.sourceUrl,
    sourceQuote: row.sourceQuote,
    verifiedMethod: 'manufacturer-reference',
    access: row.access || 'limited',
    ...(row.accessNote ? { accessNote: row.accessNote } : {}),
  };
}

if (!fs.existsSync(dataPath)) {
  console.error('Run: node scripts/scrape-toto-japan.cjs first');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/window\.BIDETBEACON_SEED\s*=\s*(\[[\s\S]*?\]);/);
if (!match) {
  console.error('BIDETBEACON_SEED not found');
  process.exit(1);
}

const existing = JSON.parse(match[1]);
const japan = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const seen = new Set(existing.map(dedupeKey));
const seenUrl = new Set(existing.filter((r) => r.sourceUrl).map((r) => r.sourceUrl));

let added = 0;
let skipped = 0;
const merged = [...existing];

for (const item of japan) {
  if (!item.sourceUrl || !item.sourceQuote || !item.latitude) {
    skipped++;
    continue;
  }
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

const newHtml = html.replace(
  /window\.BIDETBEACON_SEED\s*=\s*\[[\s\S]*?\];/,
  `window.BIDETBEACON_SEED = ${JSON.stringify(merged)};`
);
fs.writeFileSync(htmlPath, newHtml);

const byCountry = {};
merged
  .filter((r) => r.country !== 'Singapore')
  .forEach((r) => {
    byCountry[r.country] = (byCountry[r.country] || 0) + 1;
  });

console.log(`TOTO Japan import: +${added} new (${skipped} skipped, ${japan.length} in source).`);
console.log('Non-Singapore totals:', byCountry);
console.log(`Total seed entries: ${merged.length}`);
