#!/usr/bin/env node
/**
 * Import UK TOTO WASHLET locations from data/uk-toto-finder.json into BIDETBUD_SEED.
 *
 * Source: TOTO Europe "Try WASHLET" finder (eu.toto.com/en/service/try-washlettm).
 * Each row is a manufacturer-listed WASHLET install/test location, so entries get
 * bidetStatus: "warmed" and verifiedMethod: "manufacturer-reference".
 *
 * Dedupes on name+coords AND on a normalized name key, to avoid re-adding venues
 * already present in the seed under a slightly different label.
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../index.html');
const finderPath = path.join(__dirname, '../data/uk-toto-finder.json');
const SOURCE_URL = 'https://eu.toto.com/en/service/try-washlettm';

function toSeedRow(row) {
  return {
    name: row.name,
    address: row.address,
    latitude: String(row.latitude),
    longitude: String(row.longitude),
    city: row.city,
    country: 'UK',
    type: row.type || 'hotel',
    bidetStatus: row.bidetStatus || 'warmed',
    bidetType: row.bidetType,
    sourceUrl: row.sourceUrl || SOURCE_URL,
    sourceQuote: row.sourceQuote,
    verifiedMethod: row.verifiedMethod || 'manufacturer-reference',
    access: row.access || 'public',
    ...(row.accessNote ? { accessNote: row.accessNote } : {}),
    ...(row.searchAliases ? { searchAliases: row.searchAliases } : {}),
  };
}

function coordKey(row) {
  return [
    row.name.toLowerCase(),
    Number(row.latitude).toFixed(5),
    Number(row.longitude).toFixed(5),
  ].join('|');
}

function nameKey(name) {
  return name
    .toLowerCase()
    .replace(/["'’.,]/g, '')
    .replace(/\b(hotel|ltd|limited|london|the|gmbh|niederlassung)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

if (!fs.existsSync(finderPath)) {
  console.error('Missing', finderPath);
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/window\.BIDETBUD_SEED\s*=\s*(\[[\s\S]*?\]);/);
if (!match) {
  console.error('BIDETBUD_SEED not found');
  process.exit(1);
}

const existing = JSON.parse(match[1]);
const finder = JSON.parse(fs.readFileSync(finderPath, 'utf8'));

const seenCoords = new Set(existing.map(coordKey));
const seenNames = new Set(
  existing.filter((r) => r.country === 'UK').map((r) => nameKey(r.name))
);

let added = 0;
for (const item of finder) {
  const row = toSeedRow(item);
  if (!row.sourceUrl || !row.sourceQuote) {
    console.warn('Skipping (no source evidence):', row.name);
    continue;
  }
  if (seenCoords.has(coordKey(row))) {
    console.warn('Skipping (dup coords):', row.name);
    continue;
  }
  if (seenNames.has(nameKey(row.name))) {
    console.warn('Skipping (already in seed):', row.name);
    continue;
  }
  seenCoords.add(coordKey(row));
  seenNames.add(nameKey(row.name));
  existing.push(row);
  added++;
}

const newHtml = html.replace(
  /window\.BIDETBUD_SEED\s*=\s*\[[\s\S]*?\];/,
  `window.BIDETBUD_SEED = ${JSON.stringify(existing)};`
);
fs.writeFileSync(htmlPath, newHtml);

console.log(`Added ${added} UK TOTO WASHLET locations (${finder.length} in source).`);
console.log(`Total seed entries: ${existing.length}`);
