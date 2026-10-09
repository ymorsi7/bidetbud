#!/usr/bin/env node
/**
 * Merge curated public AU/UK extras (Closomat NBS wash-and-dry leftovers +
 * showrooms with a working WASHLET / AquaClean) into BIDETBUD_SEED.
 *
 *   node scripts/import-uk-au-public-extras.cjs
 */
const fs = require('fs');
const https = require('https');
const path = require('path');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { mergeIntoSeed } = require('./lib/seed-merge.cjs');

const SOURCE = path.join(__dirname, '../data/uk-au-public-extras.json');

function postcodesIo(postcodes) {
  const body = JSON.stringify({ postcodes });
  return new Promise((resolve, reject) => {
    const req = https.request(
      'https://api.postcodes.io/postcodes',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data).result || []);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function photon(q, countrycodes) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en&countrycodes=${countrycodes}`;
  return new Promise((resolve) => {
    https
      .get(url, { headers: { 'User-Agent': 'BidetBud/1.0 (https://bidetbud.com)' } }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            const f = JSON.parse(d).features?.[0];
            if (!f) return resolve(null);
            resolve({
              latitude: String(f.geometry.coordinates[1]),
              longitude: String(f.geometry.coordinates[0]),
            });
          } catch {
            resolve(null);
          }
        });
      })
      .on('error', () => resolve(null));
  });
}

async function main() {
  const rows = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  const uk = rows.filter((r) => r.country === 'UK' && r.postcode);
  const lookup = new Map();
  if (uk.length) {
    const result = await postcodesIo(uk.map((r) => r.postcode));
    for (const item of result) {
      const r = item.result;
      if (!r) continue;
      lookup.set(String(item.query).toUpperCase().replace(/\s+/g, ''), {
        latitude: String(r.latitude),
        longitude: String(r.longitude),
      });
    }
  }

  const candidates = [];
  for (const row of rows) {
    let geo = null;
    if (row.country === 'UK' && row.postcode) {
      geo = lookup.get(String(row.postcode).toUpperCase().replace(/\s+/g, ''));
    }
    if (!geo) {
      const cc = row.country === 'Australia' ? 'au' : 'gb';
      geo = await photon(`${row.name}, ${row.address || row.city}`, cc);
    }
    if (!geo) {
      console.warn(`skip (no coords): ${row.name}`);
      continue;
    }
    const { postcode, ...rest } = row;
    candidates.push({
      ...rest,
      latitude: geo.latitude,
      longitude: geo.longitude,
    });
  }

  const existing = readSeed();
  const { merged, added, skipped } = mergeIntoSeed(existing, candidates, {
    accept: (row) => row.access === 'public' && !!row.sourceQuote,
  });
  writeSeed(merged);
  console.log(`UK/AU public extras: +${added} new (${skipped} skipped). Total: ${merged.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
