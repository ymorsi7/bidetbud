#!/usr/bin/env node
/**
 * Download every TOIMAP public toilet whose Washlet flag is true.
 *
 * TOIMAP (toimap.jp) is a Japan toilet map. Each Firestore row has a boolean
 * Washlet / 温水洗浄便座 field — that is per-venue bidet evidence. Rows with
 * Washlet=false are dropped.
 *
 *   node scripts/scrape-toimap.cjs
 *   node scripts/import-toimap.cjs
 */
'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');

const OUT = path.join(__dirname, '../data/toimap-washlet-toilets.json');
const QUERY_URL =
  'https://firestore.googleapis.com/v1/projects/toimap-demo/databases/(default)/documents:runQuery';
const PAGE = 250;
const SOURCE_BASE = 'https://toimap.jp/toilet/';

function field(fields, key) {
  const f = fields && fields[key];
  if (!f) return null;
  if (Object.prototype.hasOwnProperty.call(f, 'booleanValue')) return f.booleanValue === true;
  if (Object.prototype.hasOwnProperty.call(f, 'stringValue')) return f.stringValue;
  if (Object.prototype.hasOwnProperty.call(f, 'integerValue')) return Number(f.integerValue);
  if (Object.prototype.hasOwnProperty.call(f, 'doubleValue')) return f.doubleValue;
  return null;
}

function postJson(body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      QUERY_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'BidetBud/1.0 (+https://bidetbud.com)',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error('HTTP ' + res.statusCode + ' ' + raw.slice(0, 200)));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.setTimeout(60000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(payload);
  });
}

function queryPage(afterName) {
  const structuredQuery = {
    from: [{ collectionId: 'toilets' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'Washlet' },
        op: 'EQUAL',
        value: { booleanValue: true },
      },
    },
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    limit: PAGE,
  };
  if (afterName) {
    structuredQuery.startAfter = { values: [{ referenceValue: afterName }] };
  }
  return postJson({ structuredQuery });
}

function toRow(doc) {
  const fields = doc.fields || {};
  if (field(fields, 'Washlet') !== true) return null;
  const lat = field(fields, 'latitude');
  const lng = field(fields, 'longitude');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const id = String(doc.name || '').split('/').pop();
  if (!id) return null;
  const nameEn = String(field(fields, 'name_en') || '').trim();
  const nameJa = String(field(fields, 'name') || '').trim();
  const name = nameEn || nameJa;
  if (!name) return null;
  const area = String(field(fields, 'Area') || '').trim();
  const city = area ? area : 'Japan';
  const addressParts = [nameJa && nameJa !== name ? nameJa : '', area].filter(Boolean);
  return {
    name,
    address: addressParts.join(', '),
    latitude: String(lat),
    longitude: String(lng),
    city,
    country: 'Japan',
    type: 'public',
    bidetStatus: 'warmed',
    bidetType: 'Washlet',
    access: 'public',
    sourceUrl: SOURCE_BASE + encodeURIComponent(id) + '/en',
    sourceQuote:
      'TOIMAP lists this public toilet with Washlet (温水洗浄便座) as an on-site amenity.',
    verifiedMethod: 'web-source',
    toimapId: id,
  };
}

async function main() {
  const rows = [];
  const seen = new Set();
  let after = null;
  let pages = 0;
  for (;;) {
    const batch = await queryPage(after);
    pages++;
    const docs = (Array.isArray(batch) ? batch : [])
      .map((item) => item && item.document)
      .filter(Boolean);
    if (!docs.length) break;
    for (const doc of docs) {
      const row = toRow(doc);
      if (!row || seen.has(row.toimapId)) continue;
      seen.add(row.toimapId);
      rows.push(row);
    }
    after = docs[docs.length - 1].name;
    process.stdout.write('  TOIMAP washlets: ' + rows.length + ' (' + pages + ' pages)\r');
    if (docs.length < PAGE) break;
  }
  process.stdout.write('\n');
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
  console.log('Wrote ' + rows.length + ' washlet toilets → ' + path.relative(process.cwd(), OUT));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
