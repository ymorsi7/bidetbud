#!/usr/bin/env node
/**
 * Append verified US/UK/Canada bidet locations from data/western-verified-bidets.json.
 * Does NOT replace existing rows — only adds net-new entries with source evidence.
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../index.html');
const verifiedPath = path.join(
  __dirname,
  '../data/western-verified-bidets.json'
);

const { inferType } = require('./lib/infer-type.cjs');

const WESTERN = new Set(['USA', 'UK', 'Canada']);

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
    type: row.type || inferType(row),
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
const seenUrl = new Set(
  existing.filter((r) => r.sourceUrl).map((r) => r.sourceUrl)
);

let added = 0;
let skipped = 0;
const merged = [...existing];

for (const item of verified) {
  if (!item.sourceUrl || !item.sourceQuote) {
    console.warn('Skipping (no source evidence):', item.name);
    continue;
  }
  if (!WESTERN.has(item.country)) {
    console.warn('Skipping (not USA/UK/Canada):', item.name);
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

const newHtml = html.replace(
  /window\.BIDETBUD_SEED\s*=\s*\[[\s\S]*?\];/,
  `window.BIDETBUD_SEED = ${JSON.stringify(merged)};`
);
fs.writeFileSync(htmlPath, newHtml);

const counts = { USA: 0, UK: 0, Canada: 0 };
merged
  .filter((r) => WESTERN.has(r.country))
  .forEach((r) => {
    counts[r.country]++;
  });

console.log(
  `Western import: +${added} new (${skipped} skipped, ${verified.length} in source).`
);
console.log('Western totals:', counts);
console.log(`Total seed entries: ${merged.length}`);
