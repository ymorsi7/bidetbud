#!/usr/bin/env node
/**
 * One-off cleanup: merge same-venue duplicates and fix/remove misplaced pins.
 * Never merges different bidetStatus (keeps bidet vs no-bidet pairs).
 *
 *   node scripts/fix-seed-mistakes.cjs
 */
const fs = require('fs');
const path = require('path');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');

const CACHE_PATH = path.join(__dirname, '../data/fix-mistakes-geocode-cache.json');

const strip = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

function nameKey(name) {
  return strip(name)
    .toLowerCase()
    .replace(/["'’`.,]/g, '')
    .replace(/\bwien\b/g, 'vienna')
    .replace(/\bmunchen\b/g, 'munich')
    .replace(/\bzuerich\b/g, 'zurich')
    .replace(/\b(hotel|hôtel|resort|the|le|la|das|der|die|gmbh|management|co kg|inc|and|&|llc)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function cityKey(city) {
  return strip(city)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const la1 = num(a.latitude);
  const lo1 = num(a.longitude);
  const la2 = num(b.latitude);
  const lo2 = num(b.longitude);
  if (la1 == null || lo1 == null || la2 == null || lo2 == null) return Infinity;
  const dLat = toRad(la2 - la1);
  const dLon = toRad(lo2 - lo1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bidetFlag(row) {
  return row.bidetStatus === 'none' ? 'none' : 'yes';
}

function isMaleFemalePair(a, b) {
  const na = String(a.name || '').toLowerCase();
  const nb = String(b.name || '').toLowerCase();
  return (
    (na.includes('male') && nb.includes('female')) ||
    (na.includes('female') && nb.includes('male'))
  );
}

function vagueAddress(row) {
  const a = String(row.address || '').trim();
  if (!a || /^none$/i.test(a)) return true;
  if (/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(a)) return true;
  if (/^RUE_|TEMOIN|BD-7/i.test(a)) return true;
  const parts = a.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1 && !/\d/.test(a)) return true;
  return false;
}

function statusRank(s) {
  if (s === 'verified') return 4;
  if (s === 'warmed') return 3;
  if (s === 'internet') return 2;
  return 1;
}

function richness(row) {
  let n = 0;
  if (row.address && !vagueAddress(row)) n += 3;
  if (row.city && cityKey(row.city).length > 2) n += 2;
  if (row.sourceQuote) n += 1;
  if (row.sourceUrl) n += 1;
  if (row.type === 'hotel' || row.type === 'restaurant') n += 1;
  n += String(row.address || '').length / 80;
  return n;
}

function pickKeep(a, b) {
  if (statusRank(a.bidetStatus) !== statusRank(b.bidetStatus)) {
    return statusRank(a.bidetStatus) > statusRank(b.bidetStatus) ? a : b;
  }
  if (vagueAddress(a) !== vagueAddress(b)) return vagueAddress(a) ? b : a;
  return richness(a) >= richness(b) ? a : b;
}

function absorb(keep, drop) {
  if (vagueAddress(keep) && !vagueAddress(drop)) keep.address = drop.address;
  if ((!keep.city || cityKey(keep.city).length < 3) && drop.city) keep.city = drop.city;
  if (!keep.sourceQuote && drop.sourceQuote) keep.sourceQuote = drop.sourceQuote;
  if (!keep.sourceUrl && drop.sourceUrl) keep.sourceUrl = drop.sourceUrl;
  if (!keep.bidetType && drop.bidetType) keep.bidetType = drop.bidetType;
  if (!keep.searchAliases && drop.searchAliases) keep.searchAliases = drop.searchAliases;
}

function aliasKey(row) {
  const k = nameKey(row.name);
  if (k.includes('sofitel') && k.includes('stjames')) return 'sofitelstjameslondon';
  if (k.includes('schlosselmau')) return 'schlosselmau';
  if (k.includes('parkhyatt') && (k.includes('paris') || k.includes('vendome'))) {
    return 'parkhyattparisvendome';
  }
  if (k.includes('maisonalbar') && k.includes('pontneuf')) return 'maisonalbarpontneuf';
  if (k.includes('maisonalbar') && k.includes('imperator')) return 'maisonalbarimperator';
  if (k.includes('plazaathen')) return 'plazaatheneeparis';
  if (k.includes('mozart') && k.includes('richardson')) return 'rvmozartparis';
  if (k.includes('chouchou')) return 'hotelchouchouparis';
  if (k.includes('restaurantblanc') && k.includes('paris')) return 'restaurantblancparis16';
  if (k.includes('armancette')) return 'hotelarmancette';
  if (k.includes('fouquet')) return 'hotelfouquetsparis';
  return k;
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

async function geocodeNominatim(q, countrycodes) {
  const params = { format: 'jsonv2', limit: '1', q };
  if (countrycodes) params.countrycodes = countrycodes;
  const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams(params);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BidetBud/1.0 (seed location cleanup)' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function geocodePhoton(q) {
  const url = 'https://photon.komoot.io/api/?' + new URLSearchParams({ q, limit: '1' });
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BidetBud/1.0 (seed location cleanup)' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const feat = data && data.features && data.features[0];
  const coords = feat && feat.geometry && feat.geometry.coordinates;
  if (!coords) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function geocode(q, countrycodes, cache) {
  const key = `${countrycodes || ''}|${q}`;
  if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
  let hit = await geocodePhoton(q);
  if (!hit) {
    await sleep(1100);
    hit = await geocodeNominatim(q, countrycodes);
  }
  cache[key] = hit;
  saveCache(cache);
  await sleep(400);
  return hit;
}

function isJunk(row) {
  const name = String(row.name || '');
  const addr = String(row.address || '');
  const city = String(row.city || '');
  if (name === 'RalyoZ' || name === 'Starckbucks') return true;
  if (name === 'Hotels' && city === 'Lagos') return true;
  if (/Gravedona/i.test(name) && row.country === 'Nigeria') return true;
  if (name === 'Giardino del Lago' && /Vicolo Del Forno/i.test(addr)) return true;
  return false;
}

function applyKnownPatches(row) {
  const name = row.name || '';
  const addr = row.address || '';
  const city = row.city || '';

  // Country / city label fixes that don't need geocode
  if (name === 'Banyan Tree Nanjing Garden Expo' && /南宁/.test(addr)) {
    row.city = 'Nanning';
    row.name = 'Banyan Tree Nanning Garden Expo';
  }
  if (name === 'Park Hyatt Sanya Sunny Bay Resort' && city === '5') row.city = 'Sanya';
  if (name === 'Park Hyatt Sydney' && city === '7') row.city = 'Sydney';
  if (name === 'Sincerity Chicken House' && /San Juan/i.test(addr)) {
    row.city = 'San Juan';
  }
  if (name === 'Hotel The Leo Grand' && city === 'Austria') row.city = 'Vienna';
  if (name === 'Hotel Austria Lech' && city === 'Austria') row.city = 'Lech';
  if (name === 'Refugium Lunz' && city === 'Austria') row.city = 'Lunz';
  if (name === 'Mandarin Oriental, Genf' && city === 'Switzerland') row.city = 'Geneva';
  if (row.country === 'Czech Republic' && /Berlin|Paris/i.test(city)) {
    if (/Berlin/i.test(city)) row.country = 'Germany';
    if (/Paris/i.test(city)) row.country = 'France';
  }
}

const GEOCODE_TARGETS = [
  {
    match: (r) => r.name === 'Sorell Hotel Seidenhof',
    q: 'Sihlstrasse 9, 8001 Zürich, Switzerland',
    cc: 'ch',
    city: 'Zürich',
    country: 'Switzerland',
  },
  {
    match: (r) => r.name === 'Résidence Henri IV',
    q: '50 Rue des Bernardins, 75005 Paris, France',
    cc: 'fr',
    city: 'Paris',
    country: 'France',
  },
  {
    match: (r) => r.name === 'Hotel Waerwaters',
    q: 'Rodenberg 21, 1702 Groot-Bijgaarden, Belgium',
    cc: 'be',
    city: 'Groot-Bijgaarden',
    country: 'Belgium',
  },
  {
    match: (r) => r.name === 'Hotel Le Sanglier des Ardennes',
    q: "Rue du Comte Théodule d'Ursel 14, 6940 Durbuy, Belgium",
    cc: 'be',
    city: 'Durbuy',
    country: 'Belgium',
  },
  {
    match: (r) => r.name === 'Wellnesshotel Erika' && /Tirolo/i.test(r.city || ''),
    q: 'Wellnesshotel Erika, Via Tirolo, 39019 Tirolo, Italy',
    cc: 'it',
    city: 'Tirolo',
    country: 'Italy',
  },
  {
    match: (r) => r.name === 'Image Wohn + Objekteinrichtungen Berlin',
    q: 'Wilhelmstraße 43, 10117 Berlin, Germany',
    cc: 'de',
    city: 'Berlin',
    country: 'Germany',
  },
  {
    match: (r) => r.name === 'SHK Bergmann & Franz GmbH' && /Martin-Luther/i.test(r.address || ''),
    q: 'Martin-Luther-Straße 7, 10777 Berlin, Germany',
    cc: 'de',
    city: 'Berlin',
    country: 'Germany',
  },
  {
    match: (r) => r.name === 'Hotel Plaza Athenee Paris' && r.country === 'Czech Republic',
    q: '25 Avenue Montaigne, 75008 Paris, France',
    cc: 'fr',
    city: 'Paris',
    country: 'France',
    address: '25 Avenue Montaigne, 75008 Paris',
  },
  {
    match: (r) => r.name.includes('R&V Mozart') && r.country === 'Czech Republic',
    q: '35 Avenue Mozart, 75016 Paris, France',
    cc: 'fr',
    city: 'Paris',
    country: 'France',
    address: '35 Avenue Mozart, 75016 Paris',
  },
  {
    match: (r) => r.name === 'Four Seasons Hotel Pudong',
    q: 'Four Seasons Hotel Pudong, Shanghai',
    cc: 'cn',
    city: 'Shanghai',
    country: 'China',
    address: '500 Dongyu Road, Pudong, Shanghai',
  },
  {
    match: (r) => r.name === "Canopy by Hilton Xi'an Qujiang",
    q: "Canopy by Hilton Xi'an Qujiang, Xi'an, China",
    cc: 'cn',
    city: "Xi'an",
    country: 'China',
    address: "Canopy by Hilton Xi'an Qujiang, Xi'an, China",
  },
  {
    match: (r) => r.name === '佳域酒店' && /乌鲁木齐|Urumqi/i.test((r.city || '') + (r.address || '')),
    q: '新疆乌鲁木齐米东区裕丰路1166号',
    cc: 'cn',
    city: 'Urumqi',
    country: 'China',
  },
  {
    match: (r) => r.name.includes('成都太古里春熙路'),
    q: '全季酒店 成都太古里春熙路',
    cc: 'cn',
    city: 'Chengdu',
    country: 'China',
  },
  {
    match: (r) => r.name.includes('成都木棉花'),
    q: '四川成都成华区万年场街道双成二路38号',
    cc: 'cn',
    city: 'Chengdu',
    country: 'China',
  },
  {
    match: (r) => r.name.includes('大连站中山广场'),
    q: '辽宁大连中山区解放路8号 美豪丽致酒店',
    cc: 'cn',
    city: 'Dalian',
    country: 'China',
  },
  {
    match: (r) => r.name.includes('佛山祖庙'),
    q: '广东佛山禅城区汾江西路4号',
    cc: 'cn',
    city: 'Foshan',
    country: 'China',
  },
  {
    match: (r) => r.name === 'Cloud Naan',
    q: '888 S Greenville Ave Ste 224, Richardson, TX 75081',
    cc: 'us',
    city: 'Richardson, TX',
    country: 'USA',
  },
  {
    match: (r) => r.name === 'Alora Countryside Garden',
    q: 'Kaytitinga-Sinaliw Road, Sinaliw Malaki, Alfonso, Cavite, Philippines',
    cc: 'ph',
    city: 'Alfonso',
    country: 'Philippines',
  },
  {
    match: (r) => r.name === 'Kuya J Restaurant' && /Lipa/i.test(r.city || ''),
    q: 'Kuya J Restaurant, SM City Lipa, Lipa, Batangas, Philippines',
    cc: 'ph',
    city: 'Lipa',
    country: 'Philippines',
  },
  {
    match: (r) => r.name === 'LTO Bayambang Extension Office',
    q: 'LTO Bayambang Extension Office, Bayambang, Pangasinan, Philippines',
    cc: 'ph',
    city: 'Bayambang',
    country: 'Philippines',
  },
  {
    match: (r) => r.name === 'Sta. Lucia Barangay Hall',
    q: 'Barcelona Street, Santa Lucia, San Juan, Metro Manila, Philippines',
    cc: 'ph',
    city: 'San Juan',
    country: 'Philippines',
  },
  {
    match: (r) => r.name === 'Tori Tori Kushiyaki Snack Bar',
    q: 'Tori Tori Kushiyaki, Wilson Street, San Juan, Metro Manila, Philippines',
    cc: 'ph',
    city: 'San Juan',
    country: 'Philippines',
  },
  {
    match: (r) => r.name === 'VXI Global Holdings B. V',
    q: 'VXI, Sunrise Drive, Pasay, Metro Manila, Philippines',
    cc: 'ph',
    city: 'Pasay',
    country: 'Philippines',
  },
  {
    match: (r) => r.name === 'Delta Continental Hotel and Suite',
    q: 'Ibis Lagos Airport, 35 Airport Road, Lagos, Nigeria',
    cc: 'ng',
    city: 'Lagos',
    country: 'Nigeria',
  },
  {
    match: (r) => r.name === 'Tranquil Mews Hotel',
    q: 'Tranquil Mews Hotel, Umar Shuaibu Avenue, Utako, Abuja, Nigeria',
    cc: 'ng',
    city: 'Abuja',
    country: 'Nigeria',
  },
];

function shouldMerge(a, b) {
  if (bidetFlag(a) !== bidetFlag(b)) return false;
  if (isMaleFemalePair(a, b)) return false;
  if (String(a.country || '').toLowerCase() !== String(b.country || '').toLowerCase()) {
    // allow Paris/Berlin Czech mislabels already patched, or alias hotels
    const aa = aliasKey(a);
    const bb = aliasKey(b);
    if (aa !== bb || aa.length < 8) return false;
  }
  const ka = aliasKey(a);
  const kb = aliasKey(b);
  if (!ka || ka !== kb) return false;
  if (ka.length < 5) return false;

  const d = haversine(a, b);
  if (d <= 300) return true;

  // Same hotel, one copy geocoded to the wrong city (Imperator Nîmes vs Paris)
  if (
    [
      'maisonalbarimperator',
      'maisonalbarpontneuf',
      'plazaatheneeparis',
      'rvmozartparis',
      'parkhyattparisvendome',
      'hotelchouchouparis',
      'restaurantblancparis16',
      'hotelarmancette',
    ].includes(ka)
  ) {
    return true;
  }

  const ca = cityKey(a.city);
  const cb = cityKey(b.city);
  const sameCity = ca && cb && ca === cb;
  if (sameCity && d <= 5000 && (vagueAddress(a) || vagueAddress(b))) return true;
  return false;
}

async function main() {
  const seed = readSeed();
  const cache = loadCache();
  const report = { removed: [], relocated: [], merged: [] };

  const kept = [];
  for (const row of seed) {
    if (isJunk(row)) {
      report.removed.push(`${row.name} (${row.city}, ${row.country})`);
      continue;
    }
    applyKnownPatches(row);
    kept.push(row);
  }

  for (const spec of GEOCODE_TARGETS) {
    const row = kept.find(spec.match);
    if (!row) continue;
    const hit = await geocode(spec.q, spec.cc, cache);
    if (!hit) {
      console.warn('NO GEOCODE', spec.q);
      if (spec.city) row.city = spec.city;
      if (spec.country) row.country = spec.country;
      if (spec.address) row.address = spec.address;
      continue;
    }
    const before = `${row.latitude},${row.longitude}`;
    row.latitude = String(hit.lat);
    row.longitude = String(hit.lon);
    if (spec.city) row.city = spec.city;
    if (spec.country) row.country = spec.country;
    if (spec.address) row.address = spec.address;
    report.relocated.push(`${row.name}: ${before} → ${row.latitude},${row.longitude}`);
  }

  // Dedup
  const drop = new Set();
  for (let i = 0; i < kept.length; i++) {
    if (drop.has(i)) continue;
    for (let j = i + 1; j < kept.length; j++) {
      if (drop.has(j)) continue;
      if (!shouldMerge(kept[i], kept[j])) continue;
      const keep = pickKeep(kept[i], kept[j]);
      const other = keep === kept[i] ? kept[j] : kept[i];
      absorb(keep, other);
      // If keep was the later row, copy it onto the earlier slot so we drop j
      if (keep === kept[j]) {
        Object.assign(kept[i], keep);
        drop.add(j);
      } else {
        drop.add(j);
      }
      report.merged.push(`KEEP ${kept[i].name} @ ${kept[i].city}  DROP ${other.name} @ ${other.city}`);
    }
  }

  const out = kept.filter((_, i) => !drop.has(i));
  writeSeed(out);

  console.log(JSON.stringify({
    before: seed.length,
    after: out.length,
    removed: report.removed.length,
    relocated: report.relocated.length,
    merged: report.merged.length,
  }, null, 2));
  console.log('\nRemoved:');
  report.removed.forEach((x) => console.log('  -', x));
  console.log('\nRelocated:');
  report.relocated.forEach((x) => console.log('  -', x));
  console.log('\nMerged:');
  report.merged.forEach((x) => console.log('  -', x));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
