#!/usr/bin/env node
/**
 * Import Philippines community listings from Happy Bidet and San Bidet apps.
 *
 * Source: screenshots of the apps (data/philippines-app-listings.json).
 * Each row cites which app it came from in sourceQuote (shown as the review/
 * comments excerpt). Bidet and no-bidet rows are both imported.
 *
 *   node scripts/import-philippines-apps.cjs
 */
const fs = require('fs');
const path = require('path');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { inferType } = require('./lib/infer-type.cjs');

const LIST_PATH = path.join(__dirname, '../data/philippines-app-listings.json');
const CACHE_PATH = path.join(__dirname, '../data/philippines-geocode-cache.json');
const HAPPY_URL = 'https://apps.apple.com/ph/app/happy-bidet/id6745689326';
const SAN_URL = 'https://www.rappler.com/culture-desk/220879-san-bidet-app/';

function normName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/theatre/g, 'theater')
    .replace(/[^a-z0-9]+/g, '');
}

function round5(n) {
  return Number(n).toFixed(5);
}

function coordKey(lat, lng) {
  return `${round5(lat)}|${round5(lng)}`;
}

function nameKey(name) {
  return normName(name);
}

function isNear(a, b, deg = 0.008) {
  return (
    Math.abs(Number(a.latitude) - Number(b.latitude)) < deg &&
    Math.abs(Number(a.longitude) - Number(b.longitude)) < deg
  );
}

function cityKey(city) {
  return String(city || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '');
}

function distinctCities(a, b) {
  const ca = cityKey(a.city);
  const cb = cityKey(b.city);
  if (!ca || !cb || ca === 'philippines' || cb === 'philippines') return false;
  return ca !== cb;
}

function vagueCity(row) {
  const c = cityKey(row.city);
  return !c || c === 'philippines';
}

function addrKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '');
}

function extraNameInOther(shorter, longer, shorterRow) {
  const extra = longer.slice(shorter.length);
  if (extra.length < 6) return false;
  const blob = addrKey(shorterRow.address) + cityKey(shorterRow.city);
  return blob.includes(extra);
}

function vagueAddress(row) {
  const a = String(row.address || '')
    .replace(/,?\s*Philippines\s*$/i, '')
    .trim();
  const parts = a.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return true;
  if (parts.length <= 2 && parts.every((p) => p.length < 18 && !/\d/.test(p))) return true;
  return false;
}

function samePlace(a, b) {
  if (!a || !b) return false;
  const na = nameKey(a.name);
  const nb = nameKey(b.name);
  if (na && na === nb) {
    if (vagueAddress(a) || vagueAddress(b)) return true;
    if (distinctCities(a, b)) {
      if (!a.latitude || !b.latitude) return false;
      return isNear(a, b, 0.015);
    }
    if (!a.latitude || !b.latitude) return true;
    return isNear(a, b, 0.06);
  }
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length > nb.length ? na : nb;
  const shorterRow = na.length <= nb.length ? a : b;
  if (shorter.length >= 9 && longer.includes(shorter) && isNear(a, b, 0.015)) return true;
  if (shorter.length >= 6 && longer.includes(shorter) && extraNameInOther(shorter, longer, shorterRow)) {
    return true;
  }
  if (a.latitude && b.latitude && coordKey(a.latitude, a.longitude) === coordKey(b.latitude, b.longitude)) {
    const min = Math.min(na.length, nb.length);
    if (min >= 6 && na.slice(0, 6) === nb.slice(0, 6)) return true;
  }
  return false;
}

function isBetter(candidate, current) {
  const currentVagueAddr = vagueAddress(current);
  const candidateVagueAddr = vagueAddress(candidate);
  if (currentVagueAddr && !candidateVagueAddr) return true;
  if (!currentVagueAddr && candidateVagueAddr) return false;
  if (vagueCity(current) && !vagueCity(candidate)) return true;
  if (!vagueCity(current) && vagueCity(candidate)) return false;
  if ((candidate.name || '').length > (current.name || '').length + 3) return true;
  if ((candidate.address || '').length > (current.address || '').length + 12) return true;
  return false;
}

function absorb(hit, row) {
  if (row.sourceQuote) hit.sourceQuote = row.sourceQuote;
  if (row.sourceUrl) hit.sourceUrl = row.sourceUrl;
  if (row.searchAliases) hit.searchAliases = row.searchAliases;
  if (isBetter(row, hit)) {
    hit.name = row.name;
    hit.address = row.address;
    hit.city = row.city;
    hit.latitude = row.latitude;
    hit.longitude = row.longitude;
  }
}

function bidetFlag(row) {
  if (row.bidet === false || row.bidetStatus === 'none') return 'none';
  return 'yes';
}

function sameReport(a, b) {
  return samePlace(a, b) && bidetFlag(a) === bidetFlag(b);
}

function isNonPh(row) {
  const blob = [row.name, row.address, row.city].filter(Boolean).join(' ');
  return /vietnam|ho chi minh|singapore|saudi arabia|romania|malcoci|kleinkraftwerk|m[oöé]schitz|континент|kohthheht|kontnnent|poccha|russia|betterloving|qu[eé]bec|cambridge,\s*ma|museum of science|turkey|t[uü]rkiye|tesett[uü]r|tesettiir|cesme sokak|r[uü]stem|nederland|netherlands|almere|hong kong|disneyland|hyderabad|hydera|nanakaramguda|knowledge capital|germany|denzlingen|wittewerf/i.test(
    blob
  );
}

function appLabel(row) {
  const apps = [row.app, row.alsoApp].filter(Boolean);
  const uniq = [...new Set(apps)];
  if (uniq.length >= 2) return uniq.join(' + ') + ' apps';
  return (uniq[0] || 'Happy Bidet') + ' app';
}

function buildQuote(row) {
  const bits = [appLabel(row)];
  if (row.bidet === false) bits.push('No bidet');
  else bits.push('Bidet');
  if (row.note) bits.push(row.note);
  if (row.discoveredBy) bits.push('Discovered by ' + row.discoveredBy);
  return bits.join('. ').slice(0, 220);
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function geocodeNominatim(q) {
  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      format: 'jsonv2',
      limit: '1',
      countrycodes: 'ph',
      q,
    });
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BidetBud/1.0 (philippines community import)' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < 4.2 || lat > 21.3 || lon < 116.8 || lon > 127) return null;
  return { lat, lon };
}

async function geocodePhoton(q) {
  const url =
    'https://photon.komoot.io/api/?' +
    new URLSearchParams({ q, limit: '1' });
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BidetBud/1.0 (philippines community import)' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const feat = data && data.features && data.features[0];
  const coords = feat && feat.geometry && feat.geometry.coordinates;
  if (!coords) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < 4.2 || lat > 21.3 || lon < 116.8 || lon > 127) return null;
  return { lat, lon };
}

async function geocode(row, cache) {
  if (row.latitude && row.longitude) {
    return { lat: Number(row.latitude), lon: Number(row.longitude) };
  }
  const queries = [
    [row.name, row.address].filter(Boolean).join(', '),
    [row.name, row.city, 'Philippines'].filter(Boolean).join(', '),
    row.address,
  ].filter((q, i, arr) => q && arr.indexOf(q) === i);

  for (const q of queries) {
    if (Object.prototype.hasOwnProperty.call(cache, q)) {
      if (cache[q]) return cache[q];
      continue;
    }
    let hit = await geocodeNominatim(q);
    if (!hit) {
      await sleep(1100);
      hit = await geocodePhoton(q);
    }
    cache[q] = hit;
    saveCache(cache);
    await sleep(1100);
    if (hit) return hit;
  }
  return null;
}

function toSeedRow(row, coords) {
  const type = inferType({ name: row.name, type: row.type });
  const hotelish = type === 'hotel' || /sogo|villa|resort/i.test(row.name);
  const access = row.access || (hotelish ? 'limited' : 'public');
  const quote = buildQuote(row);
  const aliases = [row.app, row.alsoApp, row.city, row.note, row.discoveredBy].filter(Boolean).join(' ');
  return {
    name: row.name,
    address: row.address || '',
    latitude: String(coords.lat),
    longitude: String(coords.lon),
    city: row.city || 'Philippines',
    country: 'Philippines',
    type,
    bidetStatus: row.bidet === false ? 'none' : 'internet',
    bidetType: row.bidet === false ? '' : 'Handheld sprayer',
    sourceUrl: row.app === 'San Bidet' ? SAN_URL : HAPPY_URL,
    sourceQuote: quote,
    verifiedMethod: 'community-sighting',
    searchAliases: aliases,
    access,
    ...(access === 'limited'
      ? { accessNote: row.accessNote || 'Not a regular public restroom' }
      : {}),
  };
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(LIST_PATH, 'utf8'));
  const listings = Array.isArray(raw.listings) ? raw.listings : [];
  const cache = loadCache();
  const existing = readSeed().filter(
    (e) =>
      !(
        e.country === 'Philippines' &&
        (isNonPh(e) || /^ground floor$/i.test(String(e.address || '').trim()))
      )
  );
  const incoming = [];
  let failed = 0;

  for (const row of listings) {
    if (isNonPh(row) || /^ground floor$/i.test(String(row.address || '').trim())) {
      console.log('skip junk', row.name);
      continue;
    }
    const coords = await geocode(row, cache);
    if (!coords) {
      console.warn('NO GEOCODE', row.name, row.address);
      failed++;
      continue;
    }
    incoming.push(toSeedRow(row, coords));
  }

  const uniqueIncoming = [];
  for (const row of incoming) {
    const dup = uniqueIncoming.find((e) => sameReport(e, row));
    if (dup) {
      absorb(dup, row);
      continue;
    }
    uniqueIncoming.push(row);
  }

  const merged = [...existing];
  let added = 0;
  let skipped = 0;
  for (const row of uniqueIncoming) {
    const hit = merged.find((e) => sameReport(e, row));
    if (hit) {
      absorb(hit, row);
      skipped++;
      continue;
    }
    merged.push(row);
    added++;
  }

  const collapsed = [];
  let collapsedDups = 0;
  for (const row of merged) {
    if (row.country !== 'Philippines') {
      collapsed.push(row);
      continue;
    }
    const hit = collapsed.find((e) => e.country === 'Philippines' && sameReport(e, row));
    if (hit) {
      absorb(hit, row);
      collapsedDups++;
      continue;
    }
    collapsed.push(row);
  }

  writeSeed(collapsed);
  console.log(
    JSON.stringify(
      {
        listed: listings.length,
        geocoded: incoming.length,
        unique: uniqueIncoming.length,
        added,
        skippedExisting: skipped,
        collapsedDups,
        failedGeocode: failed,
        seed: collapsed.length,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
