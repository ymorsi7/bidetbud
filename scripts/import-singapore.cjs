#!/usr/bin/env node
/**
 * Import Singapore bidet locations from Bidet Beacon SG / @toiletswithbidetsg dataset.
 * Source: https://www.bidetbeacon.com/data/bidets.geolocation.json
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../index.html');
const dataPath = path.join(__dirname, '../data/singapore-bidets.geolocation.json');

const SOURCE_URL = 'https://www.bidetbeacon.com/data/bidets.geolocation.json';
const INSTAGRAM_URL = 'https://www.instagram.com/toiletswithbidetsg/';

function formatRegion(region) {
  if (!region) return 'Singapore';
  return region
    .split('-')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join('-');
}

function mapType(sgType) {
  if (sgType === 'Hotel') return 'hotel';
  return 'public';
}

function mapAccess(remarks) {
  const r = (remarks || '').toLowerCase();
  if (
    /handicap|hotel room|all rooms|members only|staff only|private|showroom/.test(r)
  ) {
    return 'limited';
  }
  return 'public';
}

function mapBidetType(sgType, remarks) {
  const r = (remarks || '').toLowerCase();
  if (sgType === 'Hotel' || /washlet|toto|electronic|heated seat/.test(r)) {
    return 'Electronic bidet seat / washlet';
  }
  return 'Handheld sprayer';
}

function buildName(location, sgType, remarks) {
  let name = location.trim();
  if (sgType && sgType !== 'Hotel') {
    name += ` (${sgType})`;
  }
  return name;
}

function buildAccessNote(remarks) {
  if (!remarks) return '';
  return remarks.trim();
}

function toSeedRow(row) {
  const access = mapAccess(row.Remarks);
  const accessNote = access === 'limited' ? buildAccessNote(row.Remarks) : '';
  const name = buildName(row.Location, row.Type, row.Remarks);
  const address = (row.Address || row.geocoded_address || '').trim();

  return {
    name,
    address,
    latitude: String(row.lat),
    longitude: String(row.lng),
    city: formatRegion(row.Region),
    country: 'Singapore',
    type: mapType(row.Type),
    bidetStatus: 'internet',
    bidetType: mapBidetType(row.Type, row.Remarks),
    sourceUrl: SOURCE_URL,
    sourceQuote: row.Remarks
      ? `@toiletswithbidetsg — ${row.Remarks}`
      : '@toiletswithbidetsg community map',
    searchAliases: [row.Location, row.Region, row.Type, INSTAGRAM_URL]
      .filter(Boolean)
      .join(' '),
    access,
    ...(accessNote ? { accessNote } : {}),
  };
}

function dedupeKey(row) {
  return [
    row.name.toLowerCase(),
    row.latitude,
    row.longitude,
  ].join('|');
}

const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/window\.BIDETBEACON_SEED\s*=\s*(\[[\s\S]*?\]);/);
if (!match) {
  console.error('Could not find BIDETBEACON_SEED in index.html');
  process.exit(1);
}

const existing = JSON.parse(match[1]);
const sgRaw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const sgRows = sgRaw.map(toSeedRow);

const seen = new Set(existing.map(dedupeKey));
let added = 0;
for (const row of sgRows) {
  const key = dedupeKey(row);
  if (seen.has(key)) continue;
  seen.add(key);
  existing.push(row);
  added++;
}

const newSeed = JSON.stringify(existing);
const newHtml = html.replace(
  /window\.BIDETBEACON_SEED\s*=\s*\[[\s\S]*?\];/,
  `window.BIDETBEACON_SEED = ${newSeed};`
);

fs.writeFileSync(htmlPath, newHtml);
console.log(`Imported ${added} Singapore locations (${sgRows.length} in source).`);
console.log(`Total seed entries: ${existing.length}`);
