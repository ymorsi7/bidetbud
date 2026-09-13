#!/usr/bin/env node
/**
 * Pull the Closomat "Changing Places by Closomat" map (a Google My Map) and keep
 * only the venues in the "Changing Places with a Closomat Toilet" layer.
 *
 * A Closomat is a wash-and-dry toilet — it washes with warm water and dries with
 * warm air — so those layers are per-venue bidet evidence. The second layer on the
 * same map ("with a conventional toilet") is explicitly not, and is dropped.
 *
 * The map stores addresses rather than points, so postcodes are resolved through
 * api.postcodes.io (same service the UK TOTO finder import uses).
 *
 *   node scripts/scrape-closomat-uk.cjs
 *   node scripts/import-closomat-uk.cjs
 */
const fs = require('fs');
const https = require('https');
const path = require('path');
const { fetchText } = require('./lib/atly-web.cjs');

const MAP_ID = '1R2ZaVKmHsXu2ejbnH_9sOB_hEXfOKczZ';
const KML_URL = `https://www.google.com/maps/d/kml?mid=${MAP_ID}&forcekml=1`;
const PAGE_URL =
  'https://www.changingplaces.closomat.co.uk/about-us/cp-by-closomat-locations/';
const OUT = path.join(__dirname, '../data/closomat-uk-bidets.json');

const WASH_DRY_LAYER = /closomat toilet/i;

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : '';
}

function extendedData(xml) {
  const out = {};
  for (const m of xml.matchAll(/<Data name="([^"]+)">\s*<value>([\s\S]*?)<\/value>\s*<\/Data>/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

function decode(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Crewe, Cheshire" style city from the KML's Address 1..4 ladder. */
function cityFrom(data) {
  const parts = [data['Address 3'], data['Address 4']]
    .map((p) => decode(p || '').replace(/,$/, ''))
    .filter(Boolean);
  if (parts.length) return parts.join(', ');
  return decode(data['Address 2'] || '').replace(/,$/, '');
}

/** api.postcodes.io bulk lookup — 100 postcodes per request. */
function lookupPostcodes(postcodes) {
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
        res.setEncoding('utf8');
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
    req.end(body);
  });
}

/** Retired postcodes keep their point; otherwise fall back to the outcode centroid. */
async function resolveStragglers(postcode) {
  for (const url of [
    `https://api.postcodes.io/terminated_postcodes/${encodeURIComponent(postcode)}`,
    `https://api.postcodes.io/outcodes/${encodeURIComponent(postcode.split(' ')[0])}`,
  ]) {
    try {
      const { result } = JSON.parse(await fetchText(url));
      if (result && result.latitude != null) {
        return {
          latitude: result.latitude,
          longitude: result.longitude,
          city: result.admin_district || (result.admin_district || [])[0] || result.region,
        };
      }
    } catch {
      // try the next fallback
    }
  }
  return null;
}

async function geocode(postcodes) {
  const coords = new Map();
  for (let i = 0; i < postcodes.length; i += 100) {
    const batch = postcodes.slice(i, i + 100);
    for (const entry of await lookupPostcodes(batch)) {
      if (!entry.result) continue;
      coords.set(entry.query.toUpperCase(), {
        latitude: entry.result.latitude,
        longitude: entry.result.longitude,
        city: entry.result.admin_district || entry.result.parish || entry.result.region,
      });
    }
  }
  for (const pc of postcodes) {
    if (coords.has(pc)) continue;
    const point = await resolveStragglers(pc);
    if (point) coords.set(pc, point);
  }
  return coords;
}

async function main() {
  const kml = await fetchText(KML_URL, { timeoutMs: 90000 });
  const folders = [...kml.matchAll(/<Folder>[\s\S]*?<\/Folder>/g)].map((m) => m[0]);
  const layer = folders.find((f) => WASH_DRY_LAYER.test(tag(f, 'name')));
  if (!layer) throw new Error('Closomat wash-and-dry layer not found in KML');

  const placemarks = [];
  for (const pm of layer.matchAll(/<Placemark>[\s\S]*?<\/Placemark>/g)) {
    const xml = pm[0];
    const name = decode(tag(xml, 'name'));
    const data = extendedData(xml);
    const postcode = decode(data['Post Code'] || tag(xml, 'address')).toUpperCase();
    if (!name || !postcode) continue;
    placemarks.push({ name, data, postcode });
  }

  const coords = await geocode([...new Set(placemarks.map((p) => p.postcode))]);

  const rows = [];
  for (const { name, data, postcode } of placemarks) {
    const point = coords.get(postcode);
    if (!point) {
      console.warn('No coordinates for', name, postcode);
      continue;
    }
    const street = ['Address 1', 'Address 2', 'Address 3', 'Address 4']
      .map((k) => decode(data[k] || '').replace(/,$/, ''))
      .filter(Boolean)
      .join(', ');

    rows.push({
      name,
      address: [street, postcode].filter(Boolean).join(', '),
      latitude: String(point.latitude),
      longitude: String(point.longitude),
      city: cityFrom(data) || point.city || postcode,
      country: 'UK',
      type: 'public',
      bidetStatus: 'warmed',
      bidetType: 'Closomat wash-and-dry toilet',
      sourceUrl: PAGE_URL,
      sourceQuote:
        'Changing Places by Closomat map, "Changing Places with a Closomat Toilet" layer: wash-and-dry toilet installed',
      verifiedMethod: 'manufacturer-reference',
      access: 'public',
      accessNote: 'Changing Places facility — check venue opening hours and access method (RADAR key / keycode)',
    });
  }

  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
  console.log(`Wrote ${rows.length} Closomat wash-and-dry venues to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
