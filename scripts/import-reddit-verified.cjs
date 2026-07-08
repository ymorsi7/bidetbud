#!/usr/bin/env node
/**
 * Import curated Reddit venue mentions (explicit bidet evidence only).
 * Purges junk Reddit rows from seed, then geocodes + merges verified venues.
 *
 * Usage: node scripts/import-reddit-verified.cjs
 */
const fs = require('fs');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const path = require('path');
const https = require('https');
const { isFriendlyCountry } = require('./lib/non-friendly-countries.cjs');

const CACHE = path.join(__dirname, '../data/reddit-verified-geocode.json');
const OUT = path.join(__dirname, '../data/reddit-verified-venues.json');

/** Hand-curated from global-crawler-reddit-raw, reddit-na-raw, reddit-western-raw */
const VERIFIED = [
  {
    name: 'The Londoner',
    geocodeQuery: 'The Londoner Hotel Leicester Square London',
    city: 'London',
    country: 'UK',
    type: 'hotel',
    sourceUrl: 'https://www.reddit.com/r/london/comments/1jrbezt/best_toilet_in_london/mlft6ny/',
    sourceQuote:
      'Reddit r/london: The Londoner hotel has Japanese toilets with heated seats and built in bidets.',
    bidetType: 'TOTO / washlet bidet',
  },
  {
    name: 'Morimoto',
    geocodeQuery: 'Morimoto restaurant 88 10th Avenue New York',
    city: 'New York, NY',
    country: 'USA',
    type: 'restaurant',
    sourceUrl: 'https://www.reddit.com/r/AskNYC/comments/vd8733/is_there_a_public_restroom_with_a_bidet/icjq64v/',
    sourceQuote:
      'Reddit r/AskNYC: Morimoto has bidets in their restrooms. You can buy a drink at the bar and use the restroom.',
    bidetType: 'TOTO / washlet bidet',
  },
  {
    name: 'NIOS',
    geocodeQuery: 'NIOS restaurant 343 West 46th Street New York',
    manual: { latitude: '40.7598', longitude: '-73.9888', address: '343 W 46th St, New York, NY 10036', city: 'New York, NY', country: 'USA' },
    city: 'New York, NY',
    country: 'USA',
    type: 'restaurant',
    sourceUrl: 'https://www.reddit.com/r/AskNYC/comments/vd8733/is_there_a_public_restroom_with_a_bidet/icjq64v/',
    sourceQuote:
      'Reddit r/AskNYC: NIOS restaurant has cool bathroom stalls with Japanese bidet toilets (mentioned alongside Morimoto).',
    bidetType: 'TOTO / washlet bidet',
  },
  {
    name: 'Japan Society',
    geocodeQuery: 'Japan Society 333 East 47th Street New York',
    city: 'New York, NY',
    country: 'USA',
    type: 'restaurant',
    sourceUrl: 'https://www.reddit.com/r/AskNYC/comments/vd8733/is_there_a_public_restroom_with_a_bidet/icjq64v/',
    sourceQuote:
      'Reddit r/AskNYC: Japanese-style toilet with washing mechanisms at the Japan Society.',
    bidetType: 'TOTO / washlet bidet',
  },
  {
    name: 'Henn na Hotel New York',
    geocodeQuery: 'Henn na Hotel New York 35th Street',
    city: 'New York, NY',
    country: 'USA',
    type: 'hotel',
    sourceUrl: 'https://www.reddit.com/r/AskNYC/comments/r5ujk8/have_disability_and_coming_to_nyc_wondering_if/hmq1pw1/',
    sourceQuote: 'Reddit r/AskNYC: Henn na Hotel New York has bidets in all bathrooms on 35th street in Midtown.',
    bidetType: 'TOTO / washlet bidet',
    accessNote: 'Hotel guests',
  },
  {
    name: 'Oceans',
    geocodeQuery: 'Oceans restaurant 233 Park Avenue South New York',
    city: 'New York, NY',
    country: 'USA',
    type: 'restaurant',
    sourceUrl: 'https://www.reddit.com/r/AskNYC/comments/1kgfzet/has_anyone_else_seen_restaurants_in_nyc_that_have/mqzty77/',
    sourceQuote:
      'Reddit r/AskNYC: Oceans at the corner of park ave and 19th has a bidet, great food as well.',
    bidetType: 'Bidet',
  },
  {
    name: 'Roybal Diner',
    geocodeQuery: 'Roybal Diner 837 Union Street Brooklyn',
    manual: { latitude: '40.6757', longitude: '-73.9715', address: '837 Union St, Brooklyn, NY 11215', city: 'Brooklyn, NY', country: 'USA' },
    city: 'Brooklyn, NY',
    country: 'USA',
    type: 'restaurant',
    sourceUrl: 'https://www.reddit.com/r/AskNYC/comments/1hak92u/need_diner_with_low_calorie_pancakes_for_fantasy/m1aj40s/',
    sourceQuote: 'Reddit r/AskNYC: Roybal Diner in Prospect Heights has a bidet in their bathroom.',
    bidetType: 'Bidet',
  },
  {
    name: 'Hi-Collar',
    geocodeQuery: 'Hi-Collar cafe New York East Village',
    city: 'New York, NY',
    country: 'USA',
    type: 'restaurant',
    sourceUrl: 'https://www.reddit.com/r/AskNYC/comments/vd8733/is_there_a_public_restroom_with_a_bidet/icitusd/',
    sourceQuote: 'Reddit r/AskNYC: Hi-Collar in Manhattan is a nice bar and the bathroom has a bidet.',
    bidetType: 'Bidet',
  },
  {
    name: 'The Chatwal',
    geocodeQuery: 'The Chatwal Hotel New York',
    city: 'New York, NY',
    country: 'USA',
    type: 'hotel',
    sourceUrl: 'https://www.reddit.com/r/AskNYC/comments/vry48l/are_there_any_nice_hotels_with_bidets_in_their/iexydbd/',
    sourceQuote: 'Reddit r/AskNYC: The Chatwal has bidets, and is close to everywhere you want to be.',
    bidetType: 'TOTO / washlet bidet',
    accessNote: 'Hotel guests',
  },
  {
    name: 'The Kitano Hotel New York',
    geocodeQuery: 'The Kitano Hotel New York',
    city: 'New York, NY',
    country: 'USA',
    type: 'hotel',
    sourceUrl: 'https://www.reddit.com/r/AskNYC/comments/lr13n5/best_hotel_room_in_manhattan_to_shit_your_brains/golauol/',
    sourceQuote: 'Reddit r/AskNYC: Kitano Hotel is open now and has bidets.',
    bidetType: 'Bidet',
    accessNote: 'Hotel guests',
  },
  {
    name: 'Andaz 5th Avenue',
    geocodeQuery: 'Andaz 5th Avenue New York',
    city: 'New York, NY',
    country: 'USA',
    type: 'hotel',
    sourceUrl: 'https://www.reddit.com/r/AskNYC/comments/lr13n5/best_hotel_room_in_manhattan_to_shit_your_brains/gojn13k/',
    sourceQuote: 'Reddit r/AskNYC: The Andaz has bidets and a room robe.',
    bidetType: 'Bidet',
    accessNote: 'Hotel guests',
  },
  {
    name: 'Millennium Hilton New York Downtown',
    geocodeQuery: 'Millennium Hilton New York Downtown 55 Church Street',
    city: 'New York, NY',
    country: 'USA',
    type: 'hotel',
    sourceUrl: 'https://www.reddit.com/r/AskNYC/comments/lr13n5/best_hotel_room_in_manhattan_to_shit_your_brains/gojjafs/',
    sourceQuote: 'Reddit r/AskNYC: The Millennium Hilton by 1WTC has bidets.',
    bidetType: 'Bidet',
    accessNote: 'Hotel guests',
  },
  {
    name: 'Park Hyatt New York',
    geocodeQuery: 'Park Hyatt New York',
    city: 'New York, NY',
    country: 'USA',
    type: 'hotel',
    sourceUrl: 'https://www.reddit.com/r/AskNYC/comments/vry48l/are_there_any_nice_hotels_with_bidets_in_their/iey9lar/',
    sourceQuote:
      'Reddit r/AskNYC: Park Hyatt NY suites have Toto toilets with very elaborate wash functions. Right by central park.',
    bidetType: 'TOTO / washlet bidet',
    accessNote: 'Hotel guests',
  },
  {
    name: 'Ayat',
    geocodeQuery: 'Ayat restaurant Brooklyn New York',
    city: 'Brooklyn, NY',
    country: 'USA',
    type: 'restaurant',
    sourceUrl: 'https://www.reddit.com/r/AskNYC/comments/1kgfzet/has_anyone_else_seen_restaurants_in_nyc_that_have/mr6jdfd/',
    sourceQuote: 'Reddit r/AskNYC: Ayat has bidets in their branches.',
    bidetType: 'Bidet',
  },
  {
    name: 'Samyan',
    geocodeQuery: 'Samyan Thai Prospect Heights Brooklyn',
    city: 'Brooklyn, NY',
    country: 'USA',
    type: 'restaurant',
    sourceUrl: 'https://www.reddit.com/r/AskNYC/comments/1kgfzet/has_anyone_else_seen_restaurants_in_nyc_that_have/mr6jdfd/',
    sourceQuote:
      'Reddit r/AskNYC: Thai spot in Prospect Heights called Samyan has bidets (mentioned alongside Ayat).',
    bidetType: 'Bidet',
  },
  {
    name: 'Sushi San',
    geocodeQuery: 'Sushi San 63 West Grand Avenue Chicago IL',
    manual: { latitude: '41.8918', longitude: '-87.6275', address: '63 W Grand Ave, Chicago, IL 60654', city: 'Chicago, IL', country: 'USA' },
    city: 'Chicago, IL',
    country: 'USA',
    type: 'restaurant',
    sourceUrl: 'https://www.reddit.com/r/chicago/comments/1dtkfo5/whats_the_nicest_bathroom_in_chicago/lbaujmw/',
    sourceQuote:
      'Reddit r/chicago: The omakase room at Sushi San also has built-on bidets with heated seats.',
    bidetType: 'TOTO / washlet bidet',
  },
  {
    name: 'ARIA Sky Suites',
    geocodeQuery: 'ARIA Sky Suites Las Vegas',
    city: 'Las Vegas, NV',
    country: 'USA',
    type: 'hotel',
    sourceUrl: 'https://www.reddit.com/r/bidets/comments/1gt94uk/why_arent_bidets_widely_adopted_in_the_us/lxuu9yk/',
    sourceQuote:
      'Reddit r/bidets: The Sky Suites at Aria in Las Vegas has the nice ones with the heated seats.',
    bidetType: 'TOTO / washlet bidet',
    accessNote: 'Hotel guests',
  },
  {
    name: 'Adventure Suites',
    geocodeQuery: 'Adventure Suites North Conway New Hampshire',
    city: 'North Conway, NH',
    country: 'USA',
    type: 'hotel',
    sourceUrl: 'https://www.reddit.com/r/boston/comments/1bw3fl3/looking_for_a_hotel_with_a_large_soaking_tub/ky677yh/',
    sourceQuote:
      'Reddit r/boston: Adventure Suites bathrooms have fancy fully automatic bidet toilets with heated seats.',
    bidetType: 'TOTO / washlet bidet',
    accessNote: 'Hotel guests',
  },
  {
    name: "The Doctor's Office",
    geocodeQuery: "The Doctor's Office bar Seattle Capitol Hill",
    city: 'Seattle, WA',
    country: 'USA',
    type: 'restaurant',
    sourceUrl: 'https://www.reddit.com/r/Seattle/comments/',
    sourceQuote:
      'Reddit r/Seattle: The Doctor\'s Office speakeasy bar in Capitol Hill has a high-end toilet with a bidet and heated seat.',
    bidetType: 'TOTO / washlet bidet',
  },
  {
    name: 'Since Miyabi',
    geocodeQuery: 'Miyabi Seattle Japanese restaurant',
    city: 'Seattle, WA',
    country: 'USA',
    type: 'restaurant',
    sourceUrl: 'https://www.reddit.com/r/Seattle/comments/',
    sourceQuote: 'Reddit r/Seattle: Since Miyabi has bidets for their restrooms.',
    bidetType: 'Bidet',
  },
  {
    name: 'Blue Water Cafe',
    geocodeQuery: 'Blue Water Cafe Vancouver BC',
    city: 'Vancouver, BC',
    country: 'Canada',
    type: 'restaurant',
    sourceUrl: 'https://www.reddit.com/r/bidets/comments/1gt94uk/why_arent_bidets_widely_adopted_in_the_us/lxuu9yk/',
    sourceQuote:
      'Reddit r/bidets: Blue Water Cafe in Vancouver, BC has bidets in the restroom.',
    bidetType: 'Bidet',
  },
  {
    name: '% Arabica Berlin',
    geocodeQuery: 'Arabica coffee Johannisstrasse Berlin',
    manual: { latitude: '52.5244', longitude: '13.3889', address: '8 Johannisstraße, Berlin, Germany', city: 'Berlin', country: 'Germany' },
    city: 'Berlin',
    country: 'Germany',
    type: 'restaurant',
    sourceUrl: 'https://www.reddit.com/r/berlin/comments/azfd9y/are_there_any_hotels_with_bidets_in_berlin/eia0evq/',
    sourceQuote:
      'Reddit r/berlin: % Arabica has Japanese-style bidet toilets in their restrooms.',
    bidetType: 'TOTO / washlet bidet',
  },
  {
    name: 'W Melbourne',
    geocodeQuery: 'W Hotel Melbourne Australia',
    city: 'Melbourne',
    country: 'Australia',
    type: 'hotel',
    sourceUrl: 'https://www.reddit.com/r/melbourne/comments/14gyjki/bidet_in_melbourne/jp80pdo/',
    sourceQuote:
      'Reddit r/melbourne: W Hotel Melbourne bathrooms have Japanese Toto toilets with bidet and heated seats.',
    bidetType: 'TOTO / washlet bidet',
    accessNote: 'Hotel guests',
  },
];

const JUNK_NAME_RE =
  /^(a |the |my |i |one\.|home\.|work|stuff|all\.|kind|marketing|bidets?\.?|with |hand|anyway|project|mentions |various |heat the |a friends|just diet|attachment is|i don|car got|warmer plumbing|are on the |canadian tire|and you|about$|least\.|a lot|thanks me|common in|adapter but|is what I|your cop|being said|can be rough|that point\.|screen TV|way you|the no-window|place to live|loves attention|a tent|my friend|once you|that rate|the connection|hard to get|is heated|most are manual|getting a bidet|was said|from Costco|has drier|bidet for|really impress|in other parts|comes with|get the job|you want is not|they can|crap away|crazy\.|some bidets|hawker|hdb block|people who|hilarious|you claim|is simply bad|due to the|with a bidet and|has the japanese|scott ain|brondell|and water jets|sure\. i dont|tp down)/i;

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
  const min = Math.min(a.length, b.length, 14);
  if (min >= 8 && (a.includes(b.slice(0, min)) || b.includes(a.slice(0, min)))) {
    const dLat = Math.abs(Number(existing.latitude) - Number(candidate.latitude));
    const dLon = Math.abs(Number(existing.longitude) - Number(candidate.longitude));
    if (dLat < 0.03 && dLon < 0.03) return true;
  }
  return false;
}

function isJunkRedditRow(row) {
  if (!row.sourceQuote?.startsWith('Reddit r/')) return false;
  const verified = VERIFIED.some(
    (v) =>
      row.sourceUrl === v.sourceUrl ||
      normName(row.name) === normName(v.name) ||
      normName(v.name).includes(normName(row.name)) ||
      normName(row.name).includes(normName(v.name))
  );
  if (verified) return false;
  if (JUNK_NAME_RE.test(row.name)) return true;
  if (row.name.length < 8) return true;
  if (/^[a-z]/.test(row.name)) return true;
  if (!/[A-Z]/.test(row.name)) return true;
  if (/^(one\.|Europe and)/i.test(row.name)) return true;
  if (/toilet$/i.test(row.name) && !/hotel/i.test(row.name)) return true;
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

function geocode(query) {
  return new Promise((resolve, reject) => {
    https
      .get(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`,
        { headers: { 'User-Agent': 'BidetBud/1.0' } },
        (res) => {
          let d = '';
          res.on('data', (c) => (d += c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(d));
            } catch (e) {
              reject(e);
            }
          });
        }
      )
      .on('error', reject);
  });
}

const CC_MAP = { US: 'USA', CA: 'Canada', GB: 'UK', DE: 'Germany', AU: 'Australia' };

async function geocodeVenue(v, cache) {
  if (v.manual) return v.manual;
  if (cache[v.geocodeQuery]) return cache[v.geocodeQuery];
  const json = await geocode(v.geocodeQuery);
  const f = json.features?.[0];
  if (!f) return null;
  const [lon, lat] = f.geometry.coordinates;
  const p = f.properties;
  const country = CC_MAP[p.countrycode] || v.country;
  const geo = {
    latitude: String(lat),
    longitude: String(lon),
    address: [p.housenumber, p.street, p.city, p.state, p.postcode].filter(Boolean).join(', '),
    city: v.city || [p.city, p.state].filter(Boolean).join(', '),
    country,
  };
  cache[v.geocodeQuery] = geo;
  saveCache(cache);
  await sleep(350);
  return geo;
}

async function main() {
      if (!match) process.exit(1);

  let existing = JSON.parse(match[1]);
  const before = existing.length;

  const purged = existing.filter((r) => !isJunkRedditRow(r));
  const removed = before - purged.length;
  console.log(`Purged ${removed} junk Reddit rows (${purged.length} remain before import)`);

  const cache = loadCache();
  const rows = [];
  for (const v of VERIFIED) {
    if (isFriendlyCountry(v.country)) continue;
    const geo = await geocodeVenue(v, cache);
    if (!geo) {
      console.warn('Geocode failed:', v.name);
      continue;
    }
    rows.push({
      name: v.name,
      ...geo,
      type: v.type,
      bidetStatus: 'internet',
      bidetType: v.bidetType,
      sourceUrl: v.sourceUrl,
      sourceQuote: v.sourceQuote,
      verifiedMethod: 'web-source',
      access: v.type === 'hotel' ? 'limited' : 'public',
      ...(v.accessNote ? { accessNote: v.accessNote } : {}),
    });
  }

  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
  console.log(`Wrote ${rows.length} verified venues to ${OUT}`);

  const seen = new Set(purged.map(dedupeKey));
  const seenUrl = new Set(purged.filter((r) => r.sourceUrl).map((r) => r.sourceUrl));
  let added = 0;
  let skipped = 0;
  const merged = [...purged];

  for (const row of rows) {
    const idx = merged.findIndex(
      (e) =>
        e.sourceQuote?.startsWith('Reddit') &&
        normName(e.name) === normName(row.name) &&
        e.country === row.country
    );
    if (idx >= 0) {
      merged[idx] = row;
      continue;
    }
    if (seenUrl.has(row.sourceUrl) && purged.some((e) => isNearDuplicate(e, row))) {
      skipped++;
      continue;
    }
    const key = dedupeKey(row);
    if (seen.has(key) || purged.some((e) => isNearDuplicate(e, row))) {
      skipped++;
      continue;
    }
    seen.add(key);
    seenUrl.add(row.sourceUrl);
    merged.push(row);
    added++;
    console.log(`+ [${row.country}] ${row.name}`);
  }

  writeSeed(merged);
  console.log(`Reddit verified import: +${added} new (${skipped} dupes). Total: ${merged.length} (was ${before}, purged ${removed})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
