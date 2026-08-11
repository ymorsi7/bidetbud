#!/usr/bin/env node
/**
 * Scrape Airbnb AU/NZ listings tagged with bidet amenity (code 167).
 * Saves incrementally; resume with --skip-search if pending file exists.
 *
 * Usage:
 *   node scripts/scrape-anz-airbnb-bidets.cjs [--limit=1200] [--skip-search]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '../data/anz-airbnb-bidets.json');
const PENDING = path.join(__dirname, '../data/anz-airbnb-pending.json');
const WORKERS = 4;

const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 1200;
const SKIP_SEARCH = process.argv.includes('--skip-search');

const SEARCHES = [
  { country: 'Australia', places: [
    'Australia', 'New-South-Wales--Australia', 'Victoria--Australia', 'Queensland--Australia',
    'Western-Australia--Australia', 'South-Australia--Australia', 'Tasmania--Australia',
    'Northern-Territory--Australia', 'Australian-Capital-Territory--Australia',
    'Sydney--New-South-Wales--Australia', 'Melbourne--Victoria--Australia', 'Brisbane--Queensland--Australia',
    'Perth--Western-Australia--Australia', 'Adelaide--South-Australia--Australia',
    'Canberra--Australian-Capital-Territory--Australia', 'Gold-Coast--Queensland--Australia',
    'Sunshine-Coast--Queensland--Australia', 'Hobart--Tasmania--Australia', 'Darwin--Northern-Territory--Australia',
    'Cairns--Queensland--Australia', 'Newcastle--New-South-Wales--Australia', 'Wollongong--New-South-Wales--Australia',
    'Geelong--Victoria--Australia', 'Townsville--Queensland--Australia', 'Toowoomba--Queensland--Australia',
    'Ballarat--Victoria--Australia', 'Bendigo--Victoria--Australia', 'Launceston--Tasmania--Australia',
    'Byron-Bay--New-South-Wales--Australia', 'Parramatta--New-South-Wales--Australia', 'Fremantle--Western-Australia--Australia',
  ]},
  { country: 'New Zealand', places: [
    'New-Zealand', 'Auckland--New-Zealand', 'Wellington--New-Zealand',
    'Christchurch--Canterbury--New-Zealand', 'Queenstown--Otago--New-Zealand',
    'Rotorua--Bay-of-Plenty--New-Zealand', 'Hamilton--Waikato--New-Zealand',
    'Dunedin--Otago--New-Zealand', 'Tauranga--Bay-of-Plenty--New-Zealand',
    'Napier--Hawkes-Bay--New-Zealand', 'Nelson--Nelson--New-Zealand',
  ]},
];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function roomId(url) { return String(url).match(/\/rooms\/(\d+)/)?.[1] || url; }
function cityLabel(slug, country) {
  const main = slug.split('--')[0].replace(/-/g, ' ');
  return slug.includes('--') ? `${main}, ${country}` : country;
}
function loadJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function saveOut(rows) { fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n'); }

async function collectRoomIds(page, placeSlug) {
  const url = `https://www.airbnb.com.au/s/${placeSlug}/homes?amenities[]=167`;
  const ids = new Map();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('a[href*="/rooms/"]', { timeout: 30000 }).catch(() => null);
    await sleep(1200);
    for (let i = 0; i < 10; i++) {
      const batch = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('a[href*="/rooms/"]').forEach((a) => {
          const id = a.href.match(/\/rooms\/(\d+)/)?.[1];
          if (id) out.push({ id, url: a.href.split('?')[0] });
        });
        return out;
      });
      for (const b of batch) ids.set(b.id, { url: b.url });
      await page.mouse.wheel(0, 2200);
      await sleep(500);
    }
  } catch (e) {
    console.warn(`  search skip ${placeSlug}: ${e.message}`);
  }
  return ids;
}

async function fetchListing(page, id, meta) {
  const sourceUrl = meta.url || `https://www.airbnb.com.au/rooms/${id}`;
  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 55000 });
    await sleep(800);
    const parsed = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((s) => { try { return JSON.parse(s.textContent); } catch { return null; } })
        .filter(Boolean);
      const vr = blocks.find((b) => b['@type'] === 'VacationRental' || b['@type'] === 'Accommodation') || blocks[0];
      if (!vr?.latitude) return null;
      const addr = vr.address;
      const address = typeof addr === 'string' ? addr : [addr?.streetAddress, addr?.addressLocality, addr?.addressRegion, addr?.postalCode, addr?.addressCountry].filter(Boolean).join(', ');
      return { name: vr.name || document.title.split(' - ')[0], latitude: vr.latitude, longitude: vr.longitude, address };
    });
    if (!parsed?.name) return null;
    return {
      name: String(parsed.name).slice(0, 120),
      address: parsed.address || '',
      latitude: String(parsed.latitude),
      longitude: String(parsed.longitude),
      city: meta.city,
      country: meta.country,
      type: 'hotel',
      sourceUrl,
      sourceQuote: 'Airbnb listing lists Bidet as a host-selected amenity.',
      bidetType: 'Bidet (Airbnb amenity tag)',
      access: 'limited',
      accessNote: 'Short-term rental; verify amenity on listing before booking.',
    };
  } catch {
    return null;
  }
}

async function main() {
  const existing = loadJson(OUT) || [];
  const seen = new Set(existing.map((r) => roomId(r.sourceUrl)));
  let pendingList = SKIP_SEARCH && loadJson(PENDING) ? loadJson(PENDING) : null;

  const browser = await chromium.launch({ headless: true });

  if (!pendingList) {
    const searchPage = await browser.newPage();
    await searchPage.setViewportSize({ width: 1280, height: 900 });
    const pending = new Map();
    for (const { country, places } of SEARCHES) {
      for (const place of places) {
        console.log(`Searching ${place}…`);
        const ids = await collectRoomIds(searchPage, place);
        for (const [id, meta] of ids) {
          if (!pending.has(id)) pending.set(id, { ...meta, country, city: cityLabel(place, country) });
        }
        console.log(`  found ${ids.size} (unique ${pending.size})`);
        await sleep(400);
      }
    }
    await searchPage.close();
    pendingList = [...pending.entries()].map(([id, meta]) => ({ id, ...meta }));
    fs.writeFileSync(PENDING, JSON.stringify(pendingList, null, 2) + '\n');
    console.log(`Saved ${pendingList.length} pending IDs`);
  } else {
    console.log(`Resuming ${pendingList.length} pending IDs`);
  }

  const pages = await Promise.all(Array.from({ length: WORKERS }, () => browser.newPage()));
  const collected = [...existing];
  const todo = pendingList.filter((j) => !seen.has(j.id));
  let done = 0;

  async function worker(page) {
    while (todo.length && collected.length < LIMIT) {
      const job = todo.shift();
      if (!job || seen.has(job.id)) continue;
      const row = await fetchListing(page, job.id, job);
      done++;
      if (done % 25 === 0) {
        console.log(`Progress ${done}/${pendingList.length}… saved ${collected.length}`);
        saveOut(collected);
      }
      if (!row) continue;
      seen.add(job.id);
      collected.push(row);
    }
  }

  await Promise.all(pages.map((p) => worker(p)));
  await browser.close();
  saveOut(collected);
  const au = collected.filter((r) => r.country === 'Australia').length;
  const nz = collected.filter((r) => r.country === 'New Zealand').length;
  console.log(`Done: ${collected.length} total (AU ${au}, NZ ${nz}) → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
