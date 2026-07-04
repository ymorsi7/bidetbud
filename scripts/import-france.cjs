#!/usr/bin/env node
/**
 * Import France bidet locations — VERIFIED SOURCES ONLY.
 *
 * Do NOT bulk-import mosques, halal restaurants, or generic restrooms from OSM
 * unless a public source explicitly confirms a bidet/washlet/spray is present.
 *
 * Allowed sources:
 * - Manufacturer/installation references (e.g. TOTO WASHLET case studies)
 * - User reviews or articles that explicitly mention bidet / washlet / douchette
 * - Curated rows in data/france-verified-bidets.json (each must cite evidence)
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../index.html');
const verifiedPath = path.join(
  __dirname,
  '../data/france-verified-bidets.json'
);

function toSeedRow(row) {
  const isWarm =
    row.bidetStatus === 'warmed' ||
    /washlet|toto|heated|electronic bidet/i.test(row.bidetType || '');

  return {
    name: row.name,
    address: row.address,
    latitude: String(row.latitude),
    longitude: String(row.longitude),
    city: row.city,
    country: 'France',
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

const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/window\.BIDETBUD_SEED\s*=\s*(\[[\s\S]*?\]);/);
if (!match) {
  console.error('BIDETBUD_SEED not found');
  process.exit(1);
}

const existing = JSON.parse(match[1]);
const verified = JSON.parse(fs.readFileSync(verifiedPath, 'utf8'));
const seen = new Set(existing.map(dedupeKey));
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
  existing.push(row);
  added++;
}

const newHtml = html.replace(
  /window\.BIDETBUD_SEED\s*=\s*\[[\s\S]*?\];/,
  `window.BIDETBUD_SEED = ${JSON.stringify(existing)};`
);
fs.writeFileSync(htmlPath, newHtml);

console.log(`Added ${added} verified France locations (${verified.length} in source).`);
console.log(`Total seed entries: ${existing.length}`);
