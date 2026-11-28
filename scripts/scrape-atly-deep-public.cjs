#!/usr/bin/env node
/**
 * Deep-scan Atly bathroom list pages for non-hotel venues whose own page
 * explicitly names a bidet / washlet / sprayer. Unlike the sitemap crawler
 * (which only queues venues when bidet copy sits near the link on the list),
 * this fetches every linked location and keeps rows with venue-page evidence.
 *
 * Skips hotels and never invents mosque pins without a bidet quote.
 *
 *   node scripts/scrape-atly-deep-public.cjs --minutes=60
 *   node scripts/scrape-atly-deep-public.cjs --minutes=60 --import
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  fetchText,
  parseLocationPage,
  BIDET_RE,
  extractLocationSlugs,
} = require('./lib/atly-web.cjs');
const { isFriendlyCountry } = require('./lib/non-friendly-countries.cjs');
const { readSeed } = require('./lib/bidet-seed.cjs');

const LISTS = path.join(__dirname, '../data/atly-bathroom-lists.json');
const OUT = path.join(__dirname, '../data/atly-deep-public-bidets.json');
const STATE = path.join(__dirname, '../data/atly-deep-public-state.json');

const HOTEL_RE =
  /\b(hotel|motel|inn|resort|hostel|suites|lodge|marriott|hilton|hyatt|sheraton|westin|radisson|sofitel|novotel|ibis|mercure)\b/i;

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const MINUTES = Number(arg('minutes', 60));
const CONCURRENCY = Math.max(1, Number(arg('concurrency', 10)));
const MAX_LISTS = Number(arg('max-lists', 900));
const DELAY_MS = Number(arg('delay', 60));

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickLists(all) {
  // Prefer cafe / restaurant / halal / food bathroom guides; drop hotel lists.
  const scored = all
    .filter((u) => !/hotel/i.test(u))
    .map((u) => {
      let score = 0;
      if (/halal|cafe|coffee|restaurant|food|vegan|dinner|bakery|sushi|ramen/i.test(u)) score += 5;
      if (/best-bathroom-(?!hotel)/i.test(u)) score += 2;
      if (/united-states|canada|united-kingdom|australia|mexico/i.test(u)) score += 1;
      return { u, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_LISTS).map((x) => x.u);
}

async function pool(items, deadline, task) {
  let cursor = 0;
  let stop = false;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (!stop) {
        const item = items[cursor++];
        if (item === undefined) return;
        if (Date.now() > deadline) {
          stop = true;
          return;
        }
        await task(item);
        await sleep(DELAY_MS);
      }
    })
  );
}

async function main() {
  if (hasFlag('reset')) {
    for (const f of [STATE]) if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  const allLists = readJson(LISTS, []);
  if (!allLists.length) {
    console.error('Missing bathroom lists - run crawl-atly-sitemap discovery first.');
    process.exit(1);
  }

  const lists = pickLists(allLists);
  const state = readJson(STATE, { listsDone: [], locsDone: [] });
  const listsDone = new Set(state.listsDone);
  const locsDone = new Set(state.locsDone);
  const rows = readJson(OUT, []);
  const seenUrl = new Set(rows.map((r) => (r.sourceUrl || '').replace(/\/$/, '')));

  const seed = readSeed();
  for (const r of seed) {
    if (r.sourceUrl) seenUrl.add(r.sourceUrl.replace(/\/$/, ''));
  }

  const deadline = Date.now() + MINUTES * 60 * 1000;
  const locMap = new Map(); // url -> listUrl

  function persist() {
    writeJson(STATE, { listsDone: [...listsDone], locsDone: [...locsDone] });
    writeJson(OUT, rows);
  }

  const pendingLists = lists.filter((u) => !listsDone.has(u));
  process.stderr.write(
    `Deep public Atly: ${lists.length} prioritized lists, ${pendingLists.length} pending, ${rows.length} prior rows\n`
  );

  await pool(pendingLists, deadline, async (listUrl) => {
    try {
      const html = await fetchText(listUrl);
      if (html.length < 5000 || /Page not found/i.test(html)) {
        listsDone.add(listUrl);
        return;
      }
      for (const slug of extractLocationSlugs(html)) {
        const url = `https://www.atly.com/location/${slug}`;
        if (locsDone.has(url) || seenUrl.has(url.replace(/\/$/, ''))) continue;
        if (!locMap.has(url)) locMap.set(url, listUrl);
      }
      listsDone.add(listUrl);
    } catch (e) {
      if (/HTTP 4\d\d/.test(e.message)) listsDone.add(listUrl);
    }
  });
  persist();

  const pendingLocs = [...locMap.keys()];
  process.stderr.write(`Location pages to scan: ${pendingLocs.length}\n`);
  let checked = 0;
  let added = 0;

  await pool(pendingLocs, deadline, async (url) => {
    try {
      const html = await fetchText(url);
      locsDone.add(url);
      if (!BIDET_RE.test(html)) return;
      const row = parseLocationPage(html, url);
      if (!row) return;
      if (isFriendlyCountry(row.country)) return;
      if (!row.sourceQuote || !BIDET_RE.test(row.sourceQuote)) return;
      if (row.type === 'hotel' || HOTEL_RE.test(row.name || '')) return;
      // Mosques only if the quote itself names a bidet (already required above).
      const key = (row.sourceUrl || url).replace(/\/$/, '');
      if (seenUrl.has(key)) return;
      seenUrl.add(key);
      // Force non-hotel public access for restaurants / cafes / public.
      if (row.type === 'hotel') return;
      row.access = row.access || 'public';
      rows.push(row);
      added++;
      process.stderr.write(`  + [${row.country}] ${row.name} (${row.type})\n`);
    } catch (e) {
      if (/HTTP 4\d\d/.test(e.message)) locsDone.add(url);
    }
    if (++checked % 100 === 0) {
      persist();
      process.stderr.write(
        `  scanned ${checked}/${pendingLocs.length} · +${added} · ${Math.round(
          (deadline - Date.now()) / 60000
        )} min left\n`
      );
    }
  });
  persist();

  const byType = rows.reduce((a, r) => {
    a[r.type] = (a[r.type] || 0) + 1;
    return a;
  }, {});
  console.log(`Deep public Atly: checked ${checked}, +${added} new (file ${rows.length}).`, byType);

  if (hasFlag('import')) {
    execFileSync(process.execPath, [path.join(__dirname, 'import-atly-deep-public.cjs')], {
      stdio: 'inherit',
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
