#!/usr/bin/env node
/**
 * Scrape Airbnb AU/NZ listings tagged with bidet amenity (code 167).
 * Host-selected amenity = explicit bidet claim on listing page.
 *
 * Usage: node scripts/scrape-anz-airbnb-bidets.cjs [--limit=500]
 * Output: data/anz-airbnb-bidets.json
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '../data/anz-airbnb-bidets.json');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 1200;

const TARGETS = [
  { country: 'Australia', places: [
    'Sydney--New-South-Wales--Australia',
    'Melbourne--Victoria--Australia',
    'Brisbane--Queensland--Australia',
    'Perth--Western-Australia--Australia',
    'Adelaide--South-Australia--Australia',
    'Canberra--Australian-Capital-Territory--Australia',
    'Gold-Coast--Queensland--Australia',
    'Sunshine-Coast--Queensland--Australia',
    'Hobart--Tasmania--Australia',
    'Darwin--Northern-Territory--Australia',
    'Cairns--Queensland--Australia',
    'Newcastle--New-South-Wales--Australia',
    'Wollongong--New-South-Wales--Australia',
    'Geelong--Victoria--Australia',
    'Townsville--Queensland--Australia',
    'Toowoomba--Queensland--Australia',
    'Ballarat--Victoria--Australia',
    'Bendigo--Victoria--Australia',
    'Launceston--Tasmania--Australia',
    'Rockhampton--Queensland--Australia',
    'Mackay--Queensland--Australia',
    'Bundaberg--Queensland--Australia',
    'Coffs-Harbour--New-South-Wales--Australia',
    'Port-Macquarie--New-South-Wales--Australia',
    'Byron-Bay--New-South-Wales--Australia',
    'Noosa--Queensland--Australia',
    'Surfers-Paradise--Queensland--Australia',
  ]},
  { country: 'New Zealand', places: [
    'Auckland--New-Zealand',
    'Wellington--New-Zealand',
    'Christchurch--Canterbury--New-Zealand',
    'Queenstown--Otago--New-Zealand',
    'Rotorua--Bay-of-Plenty--New-Zealand',
    'Hamilton--Waikato--New-Zealand',
    'Dunedin--Otago--New-Zealand',
    'Tauranga--Bay-of-Plenty--New-Zealand',
    'Napier--Hawkes-Bay--New-Zealand',
    'Nelson--Nelson--New-Zealand',
    'Palmerston-North--Manawatu-Wanganui--New-Zealand',
    'Invercargill--Southland--New-Zealand',
  ]},
];

function cityLabel(slug, country) {
  const main = slug.split('--')[0].replace(/-/g, ' ');
  return `${main}, ${country === 'Australia' ? 'Australia' : 'NZ'}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scrapePlace(page, placeSlug, country) {
  const url = `https://www.airbnb.com.au/s/${placeSlug}/homes?amenities[]=167`;
  const rows = [];
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(2500);

    // Dismiss cookie/consent if present
    for (const sel of ['button:has-text("OK")', 'button:has-text("Accept")', '[data-testid="accept-btn"]']) {
      const btn = page.locator(sel).first();
      if (await btn.count()) {
        await btn.click({ timeout: 2000 }).catch(() => {});
        await sleep(800);
        break;
      }
    }

    for (let scroll = 0; scroll < 8; scroll++) {
      const batch = await page.evaluate(() => {
        const out = [];
        const seen = new Set();
        document.querySelectorAll('a[href*="/rooms/"]').forEach((a) => {
          const href = a.href.split('?')[0];
          if (seen.has(href)) return;
          seen.add(href);
          let name = '';
          const card = a.closest('[data-testid="card-container"]') || a.closest('div[itemprop="itemListElement"]') || a.parentElement?.parentElement;
          if (card) {
            const t = card.querySelector('[data-testid="listing-card-title"]') || card.querySelector('span[id^="title_"]') || card.querySelector('div[aria-labelledby]');
            name = t?.textContent?.trim() || '';
          }
          if (!name) name = a.getAttribute('aria-label') || a.textContent?.trim() || '';
          name = name.replace(/\s+/g, ' ').slice(0, 120);
          if (name.length < 3) return;
          out.push({ url: href, name });
        });
        return out;
      });
      for (const b of batch) rows.push(b);
      await page.mouse.wheel(0, 2200);
      await sleep(1200);
    }
  } catch (e) {
    console.warn(`  skip ${placeSlug}: ${e.message}`);
  }

  const city = cityLabel(placeSlug, country);
  return rows.map((r) => ({
    name: r.name,
    city,
    country,
    sourceUrl: r.url,
    sourceQuote: 'Airbnb listing tagged with Bidet amenity (host-selected).',
    bidetType: 'Bidet (Airbnb amenity tag)',
    type: 'hotel',
    access: 'limited',
    accessNote: 'Short-term rental; verify amenity on listing before booking.',
  }));
}

async function geocodeRow(row, cache) {
  const key = `${row.country}|${row.name}|${row.city}`;
  if (cache[key]) return { ...row, ...cache[key] };

  const https = require('https');
  const q = encodeURIComponent(`${row.name}, ${row.city}, ${row.country}`);
  const cc = row.country === 'Australia' ? 'au' : 'nz';
  const url = `https://photon.komoot.io/api/?q=${q}&limit=1&lang=en&countrycodes=${cc}`;

  const hit = await new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'BidetBud/1.0' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          const f = j.features?.[0];
          if (!f) return resolve(null);
          const p = f.properties || {};
          resolve({
            latitude: String(f.geometry.coordinates[1]),
            longitude: String(f.geometry.coordinates[0]),
            address: [p.name, p.street, p.city, p.state, p.country].filter(Boolean).join(', '),
          });
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });

  if (hit) cache[key] = hit;
  await sleep(120);
  return hit ? { ...row, ...hit } : null;
}

async function main() {
  let existing = [];
  if (fs.existsSync(OUT)) {
    try { existing = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { existing = []; }
  }
  const seenUrl = new Set(existing.map((r) => r.sourceUrl));
  const cachePath = path.join(__dirname, '../data/anz-geocode-cache.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch { cache = {}; }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  const collected = [...existing];
  for (const { country, places } of TARGETS) {
    for (const place of places) {
      if (collected.length >= LIMIT) break;
      console.log(`Scraping ${place}…`);
      const batch = await scrapePlace(page, place, country);
      let added = 0;
      for (const row of batch) {
        if (collected.length >= LIMIT) break;
        if (seenUrl.has(row.sourceUrl)) continue;
        const geo = await geocodeRow(row, cache);
        if (!geo?.latitude) continue;
        seenUrl.add(row.sourceUrl);
        collected.push(geo);
        added++;
      }
      console.log(`  +${added} (total ${collected.length})`);
      await sleep(1500);
    }
  }

  await browser.close();
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  fs.writeFileSync(OUT, JSON.stringify(collected, null, 2) + '\n');
  console.log(`Wrote ${collected.length} rows → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
