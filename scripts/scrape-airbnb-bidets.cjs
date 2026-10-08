#!/usr/bin/env node
/**
 * Scrape Airbnb listings tagged with bidet amenity (code 167) in non-friendly countries.
 *
 *   node scripts/scrape-airbnb-bidets.cjs [--limit=2500] [--skip-search] [--import]
 *
 * Output: data/airbnb-bidets.json
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { isFriendlyCountry } = require('./lib/non-friendly-countries.cjs');

const OUT = path.join(__dirname, '../data/airbnb-bidets.json');
const PENDING = path.join(__dirname, '../data/airbnb-bidet-pending.json');
const WORKERS = 3;
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 2500;
const SKIP_SEARCH = process.argv.includes('--skip-search');
const DO_IMPORT = process.argv.includes('--import');

const SEARCHES = [
  { country: 'USA', places: [
    'New-York--NY--United-States', 'Los-Angeles--CA--United-States', 'San-Francisco--CA--United-States',
    'Chicago--IL--United-States', 'Miami--FL--United-States', 'Houston--TX--United-States',
    'Seattle--WA--United-States', 'Boston--MA--United-States', 'Washington--DC--United-States',
    'Austin--TX--United-States', 'Denver--CO--United-States', 'Honolulu--HI--United-States',
    'Las-Vegas--NV--United-States', 'San-Diego--CA--United-States', 'Atlanta--GA--United-States',
    'Philadelphia--PA--United-States', 'Portland--OR--United-States', 'New-Orleans--LA--United-States',
  ]},
  { country: 'Canada', places: [
    'Toronto--ON--Canada', 'Vancouver--BC--Canada', 'Montreal--QC--Canada',
    'Calgary--AB--Canada', 'Ottawa--ON--Canada',
  ]},
  { country: 'UK', places: [
    'London--United-Kingdom', 'Manchester--United-Kingdom', 'Edinburgh--United-Kingdom',
    'Birmingham--United-Kingdom', 'Glasgow--United-Kingdom',
  ]},
  { country: 'France', places: [
    'Paris--France', 'Lyon--France', 'Marseille--France', 'Nice--France', 'Bordeaux--France',
  ]},
  { country: 'Spain', places: [
    'Madrid--Spain', 'Barcelona--Spain', 'Valencia--Spain', 'Seville--Spain', 'Malaga--Spain',
  ]},
  { country: 'Portugal', places: [
    'Lisbon--Portugal', 'Porto--Portugal', 'Faro--Portugal',
  ]},
  { country: 'Germany', places: [
    'Berlin--Germany', 'Munich--Germany', 'Hamburg--Germany', 'Frankfurt--Germany',
  ]},
  { country: 'Mexico', places: [
    'Mexico-City--Mexico', 'Cancun--Mexico', 'Playa-del-Carmen--Mexico', 'Guadalajara--Mexico',
  ]},
  { country: 'Australia', places: [
    'Sydney--NSW--Australia', 'Melbourne--VIC--Australia', 'Brisbane--QLD--Australia',
  ]},
];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function roomId(url) { return String(url).match(/\/rooms\/(\d+)/)?.[1] || url; }
function cityLabel(slug, country) {
  const main = slug.split('--')[0].replace(/-/g, ' ');
  return `${main}, ${country}`;
}
function loadJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function saveOut(rows) { fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n'); }

async function collectRoomIds(page, placeSlug) {
  const url = `https://www.airbnb.com/s/${placeSlug}/homes?amenities%5B%5D=167`;
  const ids = new Map();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('a[href*="/rooms/"]', { timeout: 25000 }).catch(() => null);
    await sleep(1000);
    for (let i = 0; i < 8; i++) {
      const batch = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('a[href*="/rooms/"]').forEach((a) => {
          const id = a.href.match(/\/rooms\/(\d+)/)?.[1];
          if (id) out.push({ id, url: a.href.split('?')[0] });
        });
        return out;
      });
      for (const b of batch) ids.set(b.id, { url: b.url });
      await page.mouse.wheel(0, 2400);
      await sleep(450);
    }
  } catch (e) {
    console.warn(`  search skip ${placeSlug}: ${e.message}`);
  }
  return ids;
}

async function fetchListing(page, id, meta) {
  const sourceUrl = meta.url || `https://www.airbnb.com/rooms/${id}`;
  try {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 55000 });
    await sleep(700);
    const parsed = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      if (!/bidet/i.test(html)) return null;
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
      verifiedMethod: 'web-source',
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
      if (isFriendlyCountry(country)) continue;
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
  console.log(`Done: ${collected.length} → ${OUT}`);

  if (DO_IMPORT) {
    const { importAirbnbBidets } = require('./import-airbnb-bidets.cjs');
    importAirbnbBidets();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
