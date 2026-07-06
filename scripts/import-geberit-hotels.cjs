#!/usr/bin/env node
/**
 * Import Geberit AquaClean hotels into BIDETBUD_SEED.
 *
 * Sources merged:
 *   - data/geberit-hotels.json         (scrape-geberit-hotels.cjs, geocoded)
 *   - data/geberit-france-hotels.json  (scrape-geberit-france-hotels.cjs, curated)
 *
 * Every hotel is manufacturer-listed as having a Geberit AquaClean shower
 * toilet installed, so rows get bidetStatus: "warmed" and
 * verifiedMethod: "manufacturer-reference". Requires sourceUrl + sourceQuote
 * and geocoded coordinates. Dedupes on coordinates and on a normalized name key
 * (so hotels already in the seed under a slightly different label — e.g. from
 * the TOTO references — aren't re-added).
 *
 * Usage: node scripts/import-geberit-hotels.cjs
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../index.html');
const scrapedPath = path.join(__dirname, '../data/geberit-hotels.json');
const francePath = path.join(__dirname, '../data/geberit-france-hotels.json');

function toSeedRow(row) {
  const out = {
    name: row.name,
    ...(row.address ? { address: row.address } : {}),
    latitude: String(row.latitude),
    longitude: String(row.longitude),
    city: row.city || row.region || '',
    country: row.country,
    type: row.type || 'hotel',
    bidetStatus: row.bidetStatus || 'warmed',
    bidetType: row.bidetType || 'Geberit AquaClean shower toilet',
    sourceUrl: row.sourceUrl,
    sourceQuote: row.sourceQuote,
    verifiedMethod: row.verifiedMethod || 'manufacturer-reference',
    access: row.access || 'limited',
    ...(row.accessNote ? { accessNote: row.accessNote } : {}),
    ...(row.searchAliases ? { searchAliases: row.searchAliases } : {}),
  };
  return out;
}

function coordKey(row) {
  return [
    Number(row.latitude).toFixed(4),
    Number(row.longitude).toFixed(4),
  ].join('|');
}

function nameKey(name) {
  return String(name)
    .toLowerCase()
    .replace(/["'’.,]/g, '')
    .replace(
      /\b(hotel|hôtel|resort|the|le|la|das|der|die|gmbh|amsterdam|london|paris)\b/g,
      ''
    )
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function loadRows(p) {
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.warn('Could not parse', p, e.message);
    return [];
  }
}

const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/window\.BIDETBUD_SEED\s*=\s*(\[[\s\S]*?\]);/);
if (!match) {
  console.error('BIDETBUD_SEED not found');
  process.exit(1);
}
const existing = JSON.parse(match[1]);

const incoming = [...loadRows(scrapedPath), ...loadRows(francePath)];
if (incoming.length === 0) {
  console.error('No Geberit hotel rows found. Run scrape/geocode first.');
  process.exit(1);
}

const seenCoords = new Set(existing.map(coordKey));
const seenNames = new Set(existing.map((r) => nameKey(r.name)));

let added = 0;
let skippedNoCoords = 0;
let skippedNoSource = 0;
let skippedDup = 0;

for (const item of incoming) {
  if (!item.latitude || !item.longitude) {
    skippedNoCoords++;
    continue;
  }
  const row = toSeedRow(item);
  if (!row.sourceUrl || !row.sourceQuote) {
    skippedNoSource++;
    continue;
  }
  const ck = coordKey(row);
  const nk = nameKey(row.name);
  if (seenCoords.has(ck) || seenNames.has(nk)) {
    skippedDup++;
    continue;
  }
  seenCoords.add(ck);
  seenNames.add(nk);
  existing.push(row);
  added++;
}

const newHtml = html.replace(
  /window\.BIDETBUD_SEED\s*=\s*\[[\s\S]*?\];/,
  `window.BIDETBUD_SEED = ${JSON.stringify(existing)};`
);
fs.writeFileSync(htmlPath, newHtml);

console.log(`Added ${added} Geberit AquaClean hotels (${incoming.length} in sources).`);
console.log(
  `Skipped: ${skippedDup} dup, ${skippedNoCoords} missing coords, ${skippedNoSource} missing source.`
);
console.log(`Total seed entries: ${existing.length}`);
