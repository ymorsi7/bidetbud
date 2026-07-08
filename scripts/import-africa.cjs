#!/usr/bin/env node
/**
 * Append verified African bidet locations into BIDETBUD_SEED.
 *
 * Sources (merged, in order):
 *   1. data/africa-verified-bidets.json   — hand-curated, cited rows
 *   2. data/africa-web-crawl-bidets.json  — output of crawl-africa-web.cjs (optional)
 *
 * Only adds net-new rows that carry explicit source evidence (sourceUrl +
 * sourceQuote). Never replaces existing rows.
 */
const fs = require('fs');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const path = require('path');

const SOURCES = [
  path.join(__dirname, '../data/africa-verified-bidets.json'),
  path.join(__dirname, '../data/africa-web-crawl-bidets.json'),
];

const AFRICA = new Set([
  'Kenya',
  'Uganda',
  'Nigeria',
  'Chad',
  'Niger',
  'Ethiopia',
  'Somalia',
  'South Africa',
  'Tanzania',
  'Ghana',
  'Rwanda',
  'Senegal',
  "Cote d'Ivoire",
  'Cameroon',
  'Zambia',
  'Zimbabwe',
  'Botswana',
  'Namibia',
  'Mozambique',
  'Angola',
  'Burkina Faso',
  'Mali',
  'Malawi',
  'Benin',
  'Gabon',
  'DR Congo',
  'Congo',
]);

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
    access: row.access || 'public',
    ...(row.accessNote ? { accessNote: row.accessNote } : {}),
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

const existing = readSeed();
const verified = [];
for (const src of SOURCES) {
  if (!fs.existsSync(src)) continue;
  try {
    const rows = JSON.parse(fs.readFileSync(src, 'utf8'));
    verified.push(...rows);
    console.log(`Loaded ${rows.length} rows from ${path.basename(src)}`);
  } catch (e) {
    console.warn(`Skipping ${path.basename(src)}: ${e.message}`);
  }
}
if (!verified.length) {
  console.error('No source rows found in', SOURCES.map((s) => path.basename(s)).join(', '));
  process.exit(1);
}

const seen = new Set(existing.map(dedupeKey));
const seenUrl = new Set(existing.filter((r) => r.sourceUrl).map((r) => r.sourceUrl));

let added = 0;
let skipped = 0;
const merged = [...existing];

for (const item of verified) {
  if (!item.sourceUrl || !item.sourceQuote) {
    console.warn('Skipping (no source evidence):', item.name);
    continue;
  }
  if (!AFRICA.has(item.country)) {
    console.warn('Skipping (not a supported African country):', item.name);
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

  if (seenUrl.has(row.sourceUrl)) {
    console.log('Skip (sourceUrl exists):', row.name);
    skipped++;
    continue;
  }
  if (seen.has(key)) {
    console.log('Skip (coords+name):', row.name);
    skipped++;
    continue;
  }
  if (existing.some((e) => isNearDuplicate(e, row))) {
    console.log('Skip (near duplicate):', row.name);
    skipped++;
    continue;
  }

  seen.add(key);
  seenUrl.add(row.sourceUrl);
  merged.push(row);
  added++;
}

writeSeed(merged);

const counts = {};
merged
  .filter((r) => AFRICA.has(r.country))
  .forEach((r) => {
    counts[r.country] = (counts[r.country] || 0) + 1;
  });

console.log(`Africa import: +${added} new (${skipped} skipped, ${verified.length} in source).`);
console.log('Africa totals:', counts);
console.log(`Total seed entries: ${merged.length}`);
