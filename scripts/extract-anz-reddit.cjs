#!/usr/bin/env node
/** Extract AU/NZ bidet mentions from global-crawler-reddit-raw.json */
const fs = require('fs');
const path = require('path');
const https = require('https');

const IN = path.join(__dirname, '../data/global-crawler-reddit-raw.json');
const OUT = path.join(__dirname, '../data/anz-reddit-bidets.json');
const CACHE = path.join(__dirname, '../data/anz-reddit-geocode-cache.json');

const SUB = {
  sydney: 'Australia', australia: 'Australia', melbourne: 'Australia',
  AskAnAustralian: 'Australia', AusTravel: 'Australia', brisbane: 'Australia', perth: 'Australia',
  newzealand: 'New Zealand', auckland: 'New Zealand', Wellington: 'New Zealand',
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function load(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } }

function geocode(q, cc) {
  return new Promise((resolve) => {
    https.get(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&countrycodes=${cc}`, { headers: { 'User-Agent': 'BidetBud/1.0' } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          const f = JSON.parse(d).features?.[0];
          if (!f) return resolve(null);
          const p = f.properties || {};
          resolve({
            latitude: String(f.geometry.coordinates[1]),
            longitude: String(f.geometry.coordinates[0]),
            address: [p.street, p.city, p.state, p.country].filter(Boolean).join(', '),
            city: [p.city, p.state].filter(Boolean).join(', ') || p.country,
          });
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function main() {
  if (!fs.existsSync(IN)) { fs.writeFileSync(OUT, '[]\n'); console.log('No reddit raw file'); return; }
  const raw = load(IN, []);
  const cache = load(CACHE, {});
  const out = [];
  const seen = new Set();

  for (const lead of raw) {
    const country = SUB[lead.subreddit];
    if (!country) continue;
    if (!/bidet|washlet|toto|shattaf|handheld sprayer|japanese toilet/i.test(lead.snippet || '')) continue;
    if (!lead.name || lead.name.length < 4 || lead.name.length > 80) continue;
    const key = `${country}|${lead.name}`;
    if (seen.has(key)) continue;

    let geo = cache[key];
    if (!geo) {
      geo = await geocode(`${lead.name}, ${country}`, country === 'Australia' ? 'au' : 'nz');
      if (geo) cache[key] = geo;
      await sleep(300);
    }
    if (!geo) continue;
    seen.add(key);
    out.push({
      name: lead.name,
      ...geo,
      country,
      type: /hotel|resort|motel/i.test(lead.snippet) ? 'hotel' : 'restaurant',
      bidetStatus: 'internet',
      bidetType: /washlet|toto/i.test(lead.snippet) ? 'TOTO / washlet bidet' : 'Bidet',
      sourceUrl: lead.permalink,
      sourceQuote: `Reddit r/${lead.subreddit}: ${String(lead.snippet).slice(0, 220)}`,
      verifiedMethod: 'web-source',
      access: 'public',
    });
  }

  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${out.length} reddit ANZ rows → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
