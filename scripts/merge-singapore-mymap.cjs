#!/usr/bin/env node
/**
 * Merge the live @toiletswithbidetsg Google My Map into
 * data/singapore-bidets.geolocation.json, then re-import Singapore rows.
 *
 * Instagram / Linktree "Public Toilet Bidet Map":
 *   https://www.google.com/maps/d/viewer?mid=1QEJocnDLq-vO8XRTOfRa50sFfJ3tLns0
 *
 *   node scripts/merge-singapore-mymap.cjs
 *   node scripts/merge-singapore-mymap.cjs --offline   # reuse data/singapore-mymap-bidets.json
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { fetchText } = require('./lib/atly-web.cjs');

const ROOT = path.join(__dirname, '..');
const GEO_PATH = path.join(ROOT, 'data/singapore-bidets.geolocation.json');
const OUT_JSON = path.join(ROOT, 'data/singapore-mymap-bidets.json');
const MAP_MID = '1QEJocnDLq-vO8XRTOfRa50sFfJ3tLns0';
const KML_URL = `https://www.google.com/maps/d/kml?mid=${MAP_MID}&forcekml=1`;

function nameKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/&/g, 'and')
    .replace(/@/g, 'at')
    .replace(/pavillion/g, 'pavilion')
    .replace(/musuem/g, 'museum')
    .replace(/badoque/g, 'badaque')
    .replace(/people'?s\s*park/g, 'peoplespark')
    .replace(/\(paya lebar quarter\)/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function folderToRegion(folder) {
  const f = String(folder || '').trim();
  if (!f) return 'CENTRAL';
  if (f.toLowerCase() === 'institutions') return 'INSTITUTIONS';
  return f.toUpperCase();
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : '';
}

function decode(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function parsePlaces(kml) {
  const places = [];
  const seen = new Set();
  const folders = [...kml.matchAll(/<Folder>[\s\S]*?<\/Folder>/g)].map((m) => m[0]);
  const blocks = folders.length ? folders : [kml];
  for (const folderXml of blocks) {
    const folder = decode(tag(folderXml, 'name'));
    for (const m of folderXml.matchAll(/<Placemark>[\s\S]*?<\/Placemark>/g)) {
      const xml = m[0];
      const name = decode(tag(xml, 'name'));
      const coordText = tag(xml, 'coordinates');
      const parts = coordText.split(',').map(Number);
      if (!name || parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
        continue;
      }
      const key = nameKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      places.push({
        name,
        folder,
        lat: parts[1],
        lng: parts[0],
        remarks: decode(tag(xml, 'description')),
      });
    }
  }
  return places;
}

function applyPlaces(places) {
  fs.writeFileSync(OUT_JSON, JSON.stringify(places, null, 2) + '\n');
  const geo = JSON.parse(fs.readFileSync(GEO_PATH, 'utf8'));
  const byKey = new Map();
  for (const row of geo) {
    const k = nameKey(row.Location);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(row);
  }

  let filled = 0;
  let added = 0;
  for (const place of places) {
    const matches = byKey.get(nameKey(place.name)) || [];
    if (matches.length) {
      for (const row of matches) {
        if (row.lat == null || row.lng == null || !Number.isFinite(Number(row.lat))) {
          row.lat = place.lat;
          row.lng = place.lng;
          filled++;
        }
      }
      continue;
    }
    const row = {
      Region: folderToRegion(place.folder),
      Location: place.name,
      Remarks: place.remarks,
      Address: '',
      Type: '',
      lat: place.lat,
      lng: place.lng,
      geocoded_address: '',
      source: 'toiletswithbidetsg-mymap',
    };
    geo.push(row);
    byKey.set(nameKey(place.name), [row]);
    added++;
  }

  fs.writeFileSync(GEO_PATH, JSON.stringify(geo, null, 2) + '\n');
  return { places: places.length, filled, added, geo: geo.length };
}

async function main() {
  let places;
  if (process.argv.includes('--offline') && fs.existsSync(OUT_JSON)) {
    places = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
    console.log(`Singapore My Map: ${places.length} cached placemarks`);
  } else {
    const kml = await fetchText(KML_URL, { timeoutMs: 90000 });
    places = parsePlaces(kml);
    if (!places.length) throw new Error('My Map KML parsed 0 placemarks');
  }
  const stats = applyPlaces(places);
  console.log('Singapore My Map merge:', stats);
  execFileSync(process.execPath, [path.join(__dirname, 'import-singapore.cjs')], {
    stdio: 'inherit',
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
