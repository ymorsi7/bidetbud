#!/usr/bin/env node
/**
 * Sweep atly.com's bathroom guides for venues whose editorial copy explicitly
 * names a bidet / washlet / sprayer.
 *
 * Earlier Atly imports walked a hand-written list of ~40 "best bathroom" pages.
 * Atly's sitemaps hold ~1.4M pages, so this crawler discovers every bathroom-topic
 * list page in them, collects the venues those lists link to, then checks each
 * venue page for bidet evidence.
 *
 *   node scripts/crawl-atly-sitemap.cjs --minutes=90
 *   node scripts/crawl-atly-sitemap.cjs --minutes=90 --import
 *   node scripts/crawl-atly-sitemap.cjs --reset
 *
 * Resumable: discovery output lives in data/atly-bathroom-lists.json, progress in
 * data/atly-sitemap-state.json, and rows stream to data/atly-sitemap-bidets.json.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { fetchText, parseLocationPage, BIDET_RE } = require('./lib/atly-web.cjs');
const { isFriendlyCountry } = require('./lib/non-friendly-countries.cjs');

const DATA = path.join(__dirname, '../data');
const LISTS = path.join(DATA, 'atly-bathroom-lists.json');
const STATE = path.join(DATA, 'atly-sitemap-state.json');
const OUT = path.join(DATA, 'atly-sitemap-bidets.json');

const SITEMAP_INDEX = 'https://www.atly.com/sitemap.xml';
// Bathroom-topic lists only appear in the "top-ten" sitemaps. The "steps" sitemaps
// (~480k urls) hold no bathroom pages, and location-pages sitemaps hold ~960k
// individual venues with no topic signal to filter on.
const LIST_SITEMAP_RE = /top-ten-sitemap/;
const BATHROOM_URL_RE = /bathroom|restroom|toilet/i;

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const MINUTES = Number(arg('minutes', 90));
const CONCURRENCY = Math.max(1, Number(arg('concurrency', 8)));
const DELAY_MS = Number(arg('delay', 80));

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

function locs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Every bathroom-topic list page Atly publishes. */
async function discoverLists() {
  const cached = readJson(LISTS, null);
  if (cached && cached.length) return cached;

  process.stderr.write('Discovering bathroom list pages…\n');
  const sitemaps = locs(await fetchText(SITEMAP_INDEX)).filter((u) => LIST_SITEMAP_RE.test(u));
  const found = new Set();
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < sitemaps.length) {
        const sitemap = sitemaps[next++];
        try {
          const urls = locs(await fetchText(sitemap, { timeoutMs: 180000 }));
          urls.filter((u) => BATHROOM_URL_RE.test(u)).forEach((u) => found.add(u));
          process.stderr.write(
            `  ${sitemap.split('/').pop()}: ${urls.length} urls, ${found.size} bathroom lists so far\n`
          );
        } catch (e) {
          process.stderr.write(`  ${sitemap}: ${e.message}\n`);
        }
      }
    })
  );
  const lists = [...found];
  writeJson(LISTS, lists);
  return lists;
}

/** Run `task` over `items` with a fixed worker pool, stopping at the deadline. */
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
  return cursor >= items.length;
}

async function main() {
  if (hasFlag('reset')) {
    for (const f of [LISTS, STATE]) if (fs.existsSync(f)) fs.unlinkSync(f);
    process.stderr.write('Reset discovery + state.\n');
  }

  const lists = await discoverLists();
  const state = readJson(STATE, { listsDone: [], venuesDone: [], venueQueue: [] });
  const listsDone = new Set(state.listsDone);
  const venuesDone = new Set(state.venuesDone);
  const venueQueue = new Set(state.venueQueue);

  const rows = readJson(OUT, []);
  const seenUrls = new Set(rows.map((r) => r.sourceUrl));

  const deadline = Date.now() + MINUTES * 60 * 1000;

  function persist() {
    writeJson(STATE, {
      listsDone: [...listsDone],
      venuesDone: [...venuesDone],
      venueQueue: [...venueQueue],
    });
    writeJson(OUT, rows);
  }

  // A list page carries the same editorial copy as the venue pages it links to,
  // but no coordinates. Queue only the venues whose surrounding copy names a
  // bidet, so phase 2 fetches hundreds of pages instead of tens of thousands.
  const WINDOW = 6000;
  function bidetVenues(html) {
    const found = new Set();
    for (const m of html.matchAll(/\/location\/([A-Za-z0-9_-]+)/g)) {
      const window = html.slice(
        Math.max(0, m.index - WINDOW),
        Math.min(html.length, m.index + WINDOW)
      );
      if (BIDET_RE.test(window)) found.add(`https://www.atly.com/location/${m[1]}`);
    }
    return found;
  }

  // Phase 1 — read each bathroom list page and collect the venues it links to.
  const pendingLists = lists.filter((u) => !listsDone.has(u));
  process.stderr.write(
    `Lists: ${lists.length} total, ${pendingLists.length} pending. Venue queue: ${venueQueue.size}.\n`
  );
  let listCount = 0;
  await pool(pendingLists, deadline, async (url) => {
    try {
      const html = await fetchText(url);
      for (const venue of bidetVenues(html)) {
        if (!venuesDone.has(venue) && !seenUrls.has(venue)) venueQueue.add(venue);
      }
      listsDone.add(url);
    } catch (e) {
      if (/HTTP 4\d\d/.test(e.message)) listsDone.add(url);
    }
    if (++listCount % 50 === 0) {
      persist();
      process.stderr.write(
        `  lists ${listCount}/${pendingLists.length} · venue queue ${venueQueue.size}\n`
      );
    }
  });
  persist();

  // Phase 2 — check each venue page for bidet evidence.
  const pendingVenues = [...venueQueue];
  process.stderr.write(`Venues to check: ${pendingVenues.length}\n`);
  let checked = 0;
  let added = 0;
  await pool(pendingVenues, deadline, async (url) => {
    try {
      const html = await fetchText(url);
      const row = parseLocationPage(html, url);
      if (row && !isFriendlyCountry(row.country) && !seenUrls.has(row.sourceUrl)) {
        seenUrls.add(row.sourceUrl);
        rows.push(row);
        added++;
        process.stderr.write(`  + ${row.name} (${row.city || row.country})\n`);
      }
      venuesDone.add(url);
      venueQueue.delete(url);
    } catch (e) {
      if (/HTTP 4\d\d/.test(e.message)) {
        venuesDone.add(url);
        venueQueue.delete(url);
      }
    }
    if (++checked % 200 === 0) {
      persist();
      process.stderr.write(
        `  venues ${checked}/${pendingVenues.length} · +${added} new · ${Math.round(
          (deadline - Date.now()) / 60000
        )} min left\n`
      );
    }
  });
  persist();

  const byCountry = rows.reduce((a, r) => {
    a[r.country] = (a[r.country] || 0) + 1;
    return a;
  }, {});
  console.log(`Checked ${checked} venues, +${added} new bidet venues (${rows.length} total).`);
  console.log(byCountry);

  if (hasFlag('import')) {
    execFileSync(process.execPath, [path.join(__dirname, 'import-atly-sitemap.cjs')], {
      stdio: 'inherit',
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
