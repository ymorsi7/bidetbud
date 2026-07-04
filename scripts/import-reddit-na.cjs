#!/usr/bin/env node
/**
 * Geocode Reddit NA leads and import verified-looking entries into seed.
 * Reads data/reddit-na-raw.json — requires bidet in snippet + successful geocode.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const htmlPath = path.join(__dirname, '../index.html');
const rawPath = path.join(__dirname, '../data/reddit-na-raw.json');
const CACHE = path.join(__dirname, '../data/reddit-na-geocode-cache.json');

const SUB_COUNTRY = {
  AskNYC: 'USA', nyc: 'USA', Brooklyn: 'USA', Queens: 'USA',
  AskLosAngeles: 'USA', LosAngeles: 'USA', sanfrancisco: 'USA', bayarea: 'USA',
  SanDiego: 'USA', Seattle: 'USA', Portland: 'USA', chicago: 'USA', AskChicago: 'USA',
  boston: 'USA', philadelphia: 'USA', WashingtonDC: 'USA', Miami: 'USA', Atlanta: 'USA',
  Austin: 'USA', houston: 'USA', dallas: 'USA', Denver: 'USA', Phoenix: 'USA',
  Minneapolis: 'USA', Nashville: 'USA', NewOrleans: 'USA', SaltLakeCity: 'USA',
  toronto: 'Canada', askTO: 'Canada', vancouver: 'Canada', montreal: 'Canada',
  Calgary: 'Canada', Edmonton: 'Canada',
  mexicocity: 'Mexico', Monterrey: 'Mexico', Cancun: 'Mexico',
};

const SUB_CITY = {
  AskNYC: 'New York, NY', nyc: 'New York, NY', Brooklyn: 'Brooklyn, NY',
  AskLosAngeles: 'Los Angeles, CA', LosAngeles: 'Los Angeles, CA',
  sanfrancisco: 'San Francisco, CA', bayarea: 'San Francisco Bay Area, CA',
  chicago: 'Chicago, IL', Seattle: 'Seattle, WA', toronto: 'Toronto, ON',
  vancouver: 'Vancouver, BC', montreal: 'Montreal, QC', mexicocity: 'Mexico City, Mexico',
};

function hasBidetInSnippet(s) {
  return /bidet|washlet|toto (?:bidet|smart|toilet)|smart toilet|japanese toilet|shattaf/i.test(s);
}

function isBadLeadName(name) {
  return /^(their|this|that|every|each|some|any|not|also|just|only|even|still|room|bathroom|restroom|toilet|seat|place|spot|one|two|both|hotel|restaurant|bar|cafe)$/i.test(
    name.trim()
  );
}

function normName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function dedupeKey(row) {
  return [normName(row.name), Number(row.latitude).toFixed(5), Number(row.longitude).toFixed(5)].join('|');
}

function isNearDuplicate(existing, candidate) {
  if (existing.country !== candidate.country) return false;
  const a = normName(existing.name);
  const b = normName(candidate.name);
  if (a === b) return true;
  const min = Math.min(a.length, b.length, 12);
  if (min >= 8 && (a.includes(b.slice(0, min)) || b.includes(a.slice(0, min)))) {
    const dLat = Math.abs(Number(existing.latitude) - Number(candidate.latitude));
    const dLon = Math.abs(Number(existing.longitude) - Number(candidate.longitude));
    if (dLat < 0.03 && dLon < 0.03) return true;
  }
  return false;
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(c) {
  fs.writeFileSync(CACHE, JSON.stringify(c, null, 2));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'BidetBeacon/1.0' } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function geocode(name, subreddit, cache) {
  const country = SUB_COUNTRY[subreddit] || 'USA';
  const cityHint = SUB_CITY[subreddit] || '';
  const query = `${name}, ${cityHint}, ${country}`.replace(/,\s*,/g, ',');
  if (cache[query]) return cache[query];
  const url = 'https://photon.komoot.io/api/?limit=1&q=' + encodeURIComponent(query);
  let result = null;
  try {
    const j = await fetchJson(url);
    const f = j.features?.[0];
    if (f) {
      const [lon, lat] = f.geometry.coordinates;
      const p = f.properties;
      const cc = p.countrycode === 'US' ? 'USA' : p.countrycode === 'CA' ? 'Canada' : p.countrycode === 'MX' ? 'Mexico' : country;
      if (!['USA', 'Canada', 'Mexico'].includes(cc)) return null;
      result = {
        lat: String(lat),
        lon: String(lon),
        address: [p.housenumber, p.street, p.city, p.state, p.postcode].filter(Boolean).join(', '),
        city: [p.city, p.state].filter(Boolean).join(', '),
        country: cc,
      };
    }
  } catch {
    /* ignore */
  }
  await sleep(280);
  cache[query] = result;
  saveCache(cache);
  return result;
}

function guessType(name, snippet) {
  if (/hotel|inn|resort|suites|marriott|hilton|hyatt|motel|airbnb/i.test(name + ' ' + snippet)) return 'hotel';
  if (/mosque|masjid|islamic center/i.test(name + ' ' + snippet)) return 'mosque';
  return 'restaurant';
}

if (!fs.existsSync(rawPath)) {
  console.error('Run: node scripts/scrape-reddit-na.cjs first');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/window\.BIDETBEACON_SEED\s*=\s*(\[[\s\S]*?\]);/);
if (!match) process.exit(1);

const existing = JSON.parse(match[1]);
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const cache = loadCache();
const seen = new Set(existing.map(dedupeKey));
const seenUrl = new Set(existing.filter((r) => r.sourceUrl).map((r) => r.sourceUrl));

let added = 0;
let skipped = 0;
const merged = [...existing];

for (const lead of raw) {
  if (isBadLeadName(lead.name)) {
    skipped++;
    continue;
  }
  if (!lead.snippet || !hasBidetInSnippet(lead.snippet)) {
    skipped++;
    continue;
  }
  if (seenUrl.has(lead.permalink)) {
    skipped++;
    continue;
  }
  const geo = await geocode(lead.name, lead.subreddit, cache);
  if (!geo) {
    skipped++;
    continue;
  }

  const type = guessType(lead.name, lead.snippet);
  const row = {
    name: lead.name,
    address: geo.address || geo.city,
    latitude: geo.lat,
    longitude: geo.lon,
    city: geo.city,
    country: geo.country,
    type,
    bidetStatus: 'internet',
    bidetType: /washlet|toto|smart toilet|japanese toilet/i.test(lead.snippet)
      ? 'TOTO / washlet bidet'
      : 'Bidet',
    sourceUrl: lead.permalink,
    sourceQuote: `Reddit r/${lead.subreddit}: ${lead.snippet.slice(0, 240)}`,
    verifiedMethod: 'web-source',
    access: type === 'hotel' ? 'limited' : 'public',
    ...(type === 'hotel' ? { accessNote: 'Hotel guests; verify before visiting' } : {}),
  };

  const key = dedupeKey(row);
  if (seen.has(key) || existing.some((e) => isNearDuplicate(e, row))) {
    skipped++;
    continue;
  }
  seen.add(key);
  seenUrl.add(row.sourceUrl);
  merged.push(row);
  added++;
}

const newHtml = html.replace(
  /window\.BIDETBEACON_SEED\s*=\s*\[[\s\S]*?\];/,
  `window.BIDETBEACON_SEED = ${JSON.stringify(merged)};`
);
fs.writeFileSync(htmlPath, newHtml);

const counts = { USA: 0, Canada: 0, Mexico: 0 };
merged.filter((r) => counts[r.country] !== undefined).forEach((r) => counts[r.country]++);

console.log(`Reddit NA import: +${added} new (${skipped} skipped, ${raw.length} leads).`);
console.log('NA totals:', counts);
console.log(`Total seed entries: ${merged.length}`);
