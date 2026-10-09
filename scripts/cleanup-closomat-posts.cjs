#!/usr/bin/env node
/**
 * Drop Closomat post imports whose only wash-and-dry mention is site boilerplate,
 * then keep the public Palma Vita installs we verified on the venue page.
 */
const fs = require('fs');
const https = require('https');
const path = require('path');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { mergeIntoSeed } = require('./lib/seed-merge.cjs');

function lookupPostcode(pc) {
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`;
  return new Promise((resolve) => {
    https
      .get(url, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            const r = JSON.parse(d).result;
            if (!r) return resolve(null);
            resolve({ latitude: String(r.latitude), longitude: String(r.longitude), city: r.admin_district || '' });
          } catch {
            resolve(null);
          }
        });
      })
      .on('error', () => resolve(null));
  });
}

function photon(q) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en&countrycodes=gb`;
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

const POSTS = path.join(__dirname, '../data/closomat-posts-bidets.json');
const EXTRAS = path.join(__dirname, '../data/uk-au-public-extras.json');

const KEEP_HOST_PATHS = new Set([
  '/about-us/cp-by-closomat-locations/',
  '/gatwick-airport-north-terminal/',
  '/world-class-facilities-enable-health-wellbeing/',
  '/harrow-college/',
]);

/** Pages that name a Palma Vita / wash-and-dry install at a public venue. */
const ALLOW = {
  '/innovative-provision-for-the-disabled/': {
    name: 'Lady Place Car Park toilets',
    city: 'Alton',
    postcode: 'GU34 1ET',
  },
  '/changing-places-at-the-orangebox-to-optimise-youth-potential/': {
    name: 'Orangebox',
    city: 'Huddersfield',
  },
  '/apex-works/': { name: 'Apex Works', city: 'UK' },
  '/toddington-services/': { name: 'Moto Toddington Services', city: 'Toddington' },
  '/cherwell-valley/': { name: 'Moto Cherwell Valley Services', city: 'Cherwell Valley' },
  '/heading-to-the-toilets-improves-accessibility-of-harbour-facilities/': {
    name: 'Ullapool Harbour Changing Places',
    city: 'Ullapool',
    postcode: 'IV26 2UH',
  },
  '/the-trafford-centre/': { name: 'Trafford Centre Orient', city: 'Manchester' },
  '/delivery-of-great-brands-on-the-motorway-heads-south/': {
    name: 'Moto Exeter Services',
    city: 'Exeter',
    postcode: 'EX2 7HF',
  },
  '/unique-location-for-changing-places/': {
    name: 'Kelvin Hall',
    city: 'Glasgow',
    postcode: 'G3 8AW',
  },
  '/wet-n-wild-changing-places/': {
    name: 'Sandy Lane Aqua Park',
    city: 'Chester',
    postcode: 'CH4 8HE',
  },
};

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

const extrasUrls = new Set(
  JSON.parse(fs.readFileSync(EXTRAS, 'utf8')).map((r) => r.sourceUrl)
);

async function main() {
  const seed = readSeed();
  const kept = seed.filter((r) => {
    const url = String(r.sourceUrl || '');
    if (!url.includes('changingplaces.closomat.co.uk')) return true;
    const p = pathOf(url);
    if (KEEP_HOST_PATHS.has(p)) return true;
    if (extrasUrls.has(url)) return true;
    return false;
  });
  const dropped = seed.length - kept.length;

  const posts = JSON.parse(fs.readFileSync(POSTS, 'utf8'));
  const candidates = [];
  for (const row of posts) {
    const p = pathOf(row.sourceUrl);
    const fix = ALLOW[p];
    if (!fix) continue;
    let geo = null;
    if (fix.postcode) geo = await lookupPostcode(fix.postcode);
    if (!geo) geo = await photon(`${fix.name}, ${fix.city || ''}, UK`);
    if (!geo) continue;
    candidates.push({
      ...row,
      name: fix.name,
      city: geo.city || fix.city || row.city,
      address: fix.postcode ? `${fix.name}, ${fix.postcode}` : row.address,
      latitude: geo.latitude,
      longitude: geo.longitude,
    });
  }

  const { merged, added, skipped } = mergeIntoSeed(kept, candidates, {
    accept: (row) => row.country === 'UK' && row.access === 'public',
  });
  writeSeed(merged);
  console.log(
    `Removed ${dropped} boilerplate Closomat posts; +${added} verified public (${skipped} skipped). Total ${merged.length}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
