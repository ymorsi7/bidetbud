#!/usr/bin/env node
/**
 * Deep-scrape Atly *bathroom* list pages for one country (public restaurants by default).
 * Uses scripts/lib/atly-web.cjs — only venue pages linked near bidet copy on list HTML.
 *
 * Note: Atly only serves bathroom lists for deep US paths in practice; UK/AU probe URLs
 * often 404 — use crawl-uk-web.cjs / crawl-anz-web.cjs for those regions.
 *
 *   node scripts/scrape-atly-country.cjs --country=UK
 *   node scripts/scrape-atly-country.cjs --country=Australia --max-lists=80 --max-locs=400
 */
const fs = require('fs');
const path = require('path');
const {
  fetchText,
  parseLocationPage,
  bidetVenueUrlsFromListHtml,
} = require('./lib/atly-web.cjs');

const PROBE = path.join(__dirname, '../data/atly-bathroom-probe-urls.json');
const SITEMAP_LISTS = path.join(__dirname, '../data/atly-bathroom-lists.json');

const SLUGS = {
  UK: {
    out: 'atly-uk-bidets.json',
    country: 'UK',
    listUrlRe: /united-kingdom|england-|scotland-|wales-|northern-ireland|-uk-/i,
  },
  Australia: {
    out: 'atly-australia-bidets.json',
    country: 'Australia',
    listUrlRe: /\/australia\//i,
    listUrlExcludeRe: /united-kingdom|united-states|new-zealand/i,
  },
  Canada: {
    out: 'atly-canada-bidets.json',
    country: 'Canada',
    listUrlRe: /\/canada\//i,
    listUrlExcludeRe: /united-states|united-kingdom|australia/i,
  },
  Mexico: {
    out: 'atly-mexico-bidets.json',
    country: 'Mexico',
    listUrlRe: /\/mexico\//i,
    listUrlExcludeRe: /united-states|new-mexico/i,
  },
  Colombia: {
    out: 'atly-colombia-bidets.json',
    country: 'Colombia',
    listUrlRe: /colombia|bogot[aá]|medell[ií]n|cali|cartagena|barranquilla/i,
  },
  USA: {
    out: 'atly-usa-bidets.json',
    country: 'USA',
    listUrlRe: /\/united-states\//i,
  },
};

const args = process.argv.slice(2);
const countryArg = args.find((a) => a.startsWith('--country='))?.split('=')[1];
const maxLists = Number(args.find((a) => a.startsWith('--max-lists='))?.split('=')[1] || 9999);
const maxLocs = Number(args.find((a) => a.startsWith('--max-locs='))?.split('=')[1] || 9999);
const sleepMs = Number(args.find((a) => a.startsWith('--sleep='))?.split('=')[1] || 220);

const cfg = SLUGS[countryArg];
if (!cfg) {
  console.error('Use --country=', Object.keys(SLUGS).join(', '));
  process.exit(1);
}

const OUT = path.join(__dirname, '../data', cfg.out);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildListUrls() {
  let urls = [];
  if (fs.existsSync(PROBE)) urls = urls.concat(JSON.parse(fs.readFileSync(PROBE, 'utf8')));
  if (fs.existsSync(SITEMAP_LISTS)) {
    urls = urls.concat(JSON.parse(fs.readFileSync(SITEMAP_LISTS, 'utf8')));
  }
  let out = [...new Set(urls.filter(Boolean))];
  if (cfg.listUrlRe) out = out.filter((u) => cfg.listUrlRe.test(u));
  if (cfg.listUrlExcludeRe) out = out.filter((u) => !cfg.listUrlExcludeRe.test(u));
  return out.slice(0, maxLists);
}

async function main() {
  const lists = buildListUrls();
  console.log(`Atly bathroom scrape: ${cfg.country}, ${lists.length} list URLs`);

  const prior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
  const known = new Set(prior.map((r) => (r.sourceUrl || '').replace(/\/$/, '')));
  const venueQueue = new Set();

  for (const listUrl of lists) {
    process.stderr.write(`List: ${listUrl}\n`);
    try {
      const html = await fetchText(listUrl);
      if (html.length < 8000 || /Page not found/i.test(html)) continue;
      for (const url of bidetVenueUrlsFromListHtml(html)) venueQueue.add(url);
      await sleep(180);
    } catch (e) {
      console.warn('List fail:', listUrl, e.message);
    }
  }

  console.log('Venue URLs (bidet on list):', venueQueue.size);
  const newRows = [];
  let scanned = 0;

  for (const url of venueQueue) {
    if (newRows.length >= maxLocs) break;
    scanned++;
    if (known.has(url.replace(/\/$/, ''))) continue;
    if (scanned % 25 === 0) {
      process.stderr.write(`… scanned ${scanned}/${venueQueue.size}, found ${newRows.length}\n`);
    }
    try {
      const html = await fetchText(url);
      const row = parseLocationPage(html, url);
      await sleep(sleepMs);
      if (!row || row.country !== cfg.country) continue;
      newRows.push(row);
      process.stderr.write(`+ [${row.country}] ${row.name} (${row.access})\n`);
    } catch (e) {
      console.warn('Loc fail:', url, e.message);
    }
  }

  const merged = new Map();
  for (const row of prior) {
    merged.set(`${row.name}|${row.latitude}|${row.longitude}`, row);
  }
  for (const row of newRows) {
    merged.set(`${row.name}|${row.latitude}|${row.longitude}`, row);
  }
  const outRows = [...merged.values()];
  fs.writeFileSync(OUT, JSON.stringify(outRows, null, 2) + '\n');
  const pub = outRows.filter((r) => r.access === 'public').length;
  console.log(`Wrote ${outRows.length} to ${OUT} (+${newRows.length} new, ${pub} public)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
