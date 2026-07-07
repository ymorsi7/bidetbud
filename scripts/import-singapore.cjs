#!/usr/bin/env node
/**
 * Import Singapore bidet locations from Bidet Bud SG / @toiletswithbidetsg.
 *
 * VERIFICATION: Every row in this dataset is a community-reported bidet sighting.
 * @toiletswithbidetsg only documents toilets confirmed to have bidets (user photos
 * + location DMs). This is NOT a generic toilet or mosque directory.
 *
 * Source: https://www.bidetbud.com/data/bidets.geolocation.json
 *         (synced from the public Google Sheet behind @toiletswithbidetsg)
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../index.html');
const dataPath = path.join(
  __dirname,
  '../data/singapore-bidets.geolocation.json'
);

const { isFoodVenue, isHotelVenue, loadSingaporePublicOverrides } = require('./lib/infer-type.cjs');
const INSTAGRAM_URL = 'https://www.instagram.com/toiletswithbidetsg/';
const SOURCE_URL = 'https://www.bidetbud.com/data/bidets.geolocation.json';
const MOSQUE = /\b(mosque|masjid)\b/i;

function formatRegion(region) {
  if (!region) return 'Singapore';
  return region
    .split('-')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join('-');
}

function mapType(sgType, location) {
  if (sgType === 'Hotel') return 'hotel';
  const overrides = loadSingaporePublicOverrides();
  const key = String(location || '').trim();
  if (overrides[key]) return overrides[key];
  if (isHotelVenue(location) && !isFoodVenue(location)) return 'hotel';
  if (isFoodVenue(location)) return 'restaurant';
  if (MOSQUE.test(location)) return 'mosque';
  return 'public';
}

function mapAccess(remarks) {
  const r = (remarks || '').toLowerCase();
  if (
    /handicap|hotel room|all rooms|members only|staff only|private|showroom/.test(
      r
    )
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

function buildName(location, sgType) {
  let name = location.trim();
  if (sgType && sgType !== 'Hotel') {
    name += ` (${sgType})`;
  }
  return name;
}

function buildSourceQuote(remarks) {
  const base =
    'Community bidet report — @toiletswithbidetsg (user-submitted sighting with photo/location)';
  if (!remarks?.trim()) {
    return `${base}. Listed on community bidet map.`;
  }
  return `${base}. Reporter note: ${remarks.trim()}`;
}

function toSeedRow(row) {
  const access = mapAccess(row.Remarks);
  const accessNote =
    access === 'limited' ? (row.Remarks || '').trim() : '';
  const name = buildName(row.Location, row.Type);
  const address = (row.Address || row.geocoded_address || '').trim();

  return {
    name,
    address,
    latitude: String(row.lat),
    longitude: String(row.lng),
    city: formatRegion(row.Region),
    country: 'Singapore',
    type: mapType(row.Type, row.Location),
    bidetStatus: 'internet',
    bidetType: mapBidetType(row.Type, row.Remarks),
    sourceUrl: SOURCE_URL,
    sourceQuote: buildSourceQuote(row.Remarks),
    verifiedMethod: 'community-sighting',
    searchAliases: [row.Location, row.Region, row.Type, INSTAGRAM_URL]
      .filter(Boolean)
      .join(' '),
    access,
    ...(accessNote ? { accessNote } : {}),
  };
}

function dedupeKey(row) {
  return [row.name.toLowerCase(), row.latitude, row.longitude].join('|');
}

const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/window\.BIDETBUD_SEED\s*=\s*(\[[\s\S]*?\]);/);
if (!match) {
  console.error('Could not find BIDETBUD_SEED in index.html');
  process.exit(1);
}

const existing = JSON.parse(match[1]);
const sgRaw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const sgRows = sgRaw.map(toSeedRow);

// Replace existing Singapore rows (refresh metadata) and add any new ones
const nonSg = existing.filter((r) => r.country !== 'Singapore');
const seen = new Set(nonSg.map(dedupeKey));
const merged = [...nonSg];
let added = 0;
for (const row of sgRows) {
  const key = dedupeKey(row);
  if (seen.has(key)) continue;
  seen.add(key);
  merged.push(row);
  added++;
}

const newSeed = JSON.stringify(merged);
const newHtml = html.replace(
  /window\.BIDETBUD_SEED\s*=\s*\[[\s\S]*?\];/,
  `window.BIDETBUD_SEED = ${newSeed};`
);

fs.writeFileSync(htmlPath, newHtml);
console.log(
  `Singapore: ${sgRows.length} community-verified bidet rows (${added} new vs prior seed).`
);
console.log(`Total seed entries: ${merged.length}`);
