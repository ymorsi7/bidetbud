#!/usr/bin/env node
/**
 * Parse all France locations from TOTO WASHLET Finder (live HTML).
 * Writes data/toto-france-finder.json
 */
const fs = require('fs');
const path = require('path');
const { fetchText, parseTotoFranceFinderHtml } = require('./lib/france-web.cjs');

const OUT = path.join(__dirname, '../data/toto-france-finder.json');
const FINDER_URL = 'https://eu.toto.com/fr/service/tester-le-washlettm';

async function fetchTotoFranceFinder() {
  const html = await fetchText(FINDER_URL);
  return parseTotoFranceFinderHtml(html);
}

function toVerifiedRow(row) {
  return {
    name: row.name,
    address: row.address || `${row.latitude}, ${row.longitude}`,
    latitude: row.latitude,
    longitude: row.longitude,
    city: row.city || '',
    type: row.type,
    bidetStatus: 'warmed',
    bidetType: row.bidetType || 'TOTO WASHLET',
    sourceUrl: FINDER_URL,
    sourceQuote:
      'TOTO France WASHLET Finder : lieu public où les visiteurs peuvent tester un WASHLET',
    verifiedMethod: 'manufacturer-reference',
    access: row.access || 'public',
    ...(row.accessNote ? { accessNote: row.accessNote } : {}),
  };
}

async function main() {
  const parsed = await fetchTotoFranceFinder();
  const rows = parsed.map(toVerifiedRow);
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
  const hotels = rows.filter((r) => r.type === 'hotel');
  const showrooms = rows.filter((r) => r.type === 'public');
  console.log(
    `Wrote ${rows.length} TOTO France finder rows (${hotels.length} hotels, ${showrooms.length} showrooms/distributors)`
  );
  return rows;
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { fetchTotoFranceFinder, toVerifiedRow, FINDER_URL };
