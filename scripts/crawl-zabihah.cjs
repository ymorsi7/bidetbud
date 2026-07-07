#!/usr/bin/env node
/**
 * Crawl Zabihah.com restaurant sitemaps → venue pages with coords.
 * Resumable; respects robots Crawl-delay: 2.
 *
 *   node scripts/crawl-zabihah.cjs --minutes=90
 *   node scripts/crawl-zabihah.cjs --minutes=90 --no-import   # skip halal.html embed
 *   node scripts/crawl-zabihah.cjs --discover-only
 *
 * Output: data/zabihah-halal-restaurants.json
 * State:  data/zabihah-crawl-state.json
 */
const fs = require('fs');
const path = require('path');
const { fetchText, parseZabihahHtml, sleep } = require('./lib/halal-web.cjs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data/zabihah-halal-restaurants.json');
const STATE = path.join(ROOT, 'data/zabihah-crawl-state.json');
const SITEMAP_INDEX = 'https://www.zabihah.com/sitemap.xml';
const SHARDS = [...Array.from({ length: 10 }, (_, i) => i), 1000, 1001, 1002];
const DELAY_MS = 2100;

const args = process.argv.slice(2);
const minutesArg = args.find((a) => a.startsWith('--minutes='));
const MINUTES = minutesArg ? Number(minutesArg.split('=')[1]) : 90;
const DISCOVER_ONLY = args.includes('--discover-only');
const SKIP_IMPORT = args.includes('--no-import');
const LIMIT_ARG = args.find((a) => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split('=')[1]) : 0;

function loadState() {
  if (!fs.existsSync(STATE)) {
    return { queue: [], done: {}, rows: [], discoveredAt: null };
  }
  return JSON.parse(fs.readFileSync(STATE, 'utf8'));
}

function saveState(st) {
  fs.writeFileSync(STATE, JSON.stringify(st, null, 2) + '\n');
}

function saveRows(rows) {
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
}

function extractLocs(xml, pattern) {
  const re = new RegExp(`<loc>(${pattern}[^<]+)</loc>`, 'gi');
  const urls = [];
  let m;
  while ((m = re.exec(xml))) urls.push(m[1].trim());
  return urls;
}

async function discoverRestaurantUrls() {
  console.log('Fetching Zabihah sitemap index…');
  const index = await fetchText(SITEMAP_INDEX);
  const shardUrls = extractLocs(index, 'https://www\\.zabihah\\.com/sitemap/[^<]+');
  const shards = shardUrls.length ? shardUrls : SHARDS.map((n) => `https://www.zabihah.com/sitemap/${n}.xml`);
  const all = new Set();
  for (const shardUrl of shards) {
    process.stdout.write(`  shard ${shardUrl.split('/').pop()}… `);
    try {
      const xml = await fetchText(shardUrl);
      const urls = extractLocs(xml, 'https://www\\.zabihah\\.com/restaurants/[^<]+');
      urls.forEach((u) => all.add(u.split('?')[0]));
      console.log(urls.length, 'restaurants');
    } catch (e) {
      console.log('ERR', e.message);
    }
    await sleep(500);
  }
  return [...all];
}

function embedHalalPage() {
  require('child_process').execSync('node scripts/import-halal-all.cjs', { cwd: ROOT, stdio: 'inherit' });
}

async function main() {
  const deadline = Date.now() + MINUTES * 60 * 1000;
  const st = loadState();

  if (!st.queue.length) {
    st.queue = await discoverRestaurantUrls();
    st.discoveredAt = new Date().toISOString();
    console.log(`Discovered ${st.queue.length} Zabihah restaurant URLs`);
    saveState(st);
    if (DISCOVER_ONLY) return;
  } else {
    console.log(`Resuming queue of ${st.queue.length} URLs (${Object.keys(st.done).length} done, ${st.rows.length} rows)`);
  }

  let fetched = 0;
  let errors = 0;
  while (st.queue.length && Date.now() < deadline) {
    if (LIMIT && st.rows.length >= LIMIT) break;
    const url = st.queue.shift();
    if (st.done[url]) continue;
    try {
      const html = await fetchText(url);
      const row = parseZabihahHtml(html, url);
      st.done[url] = row ? 'ok' : 'skip';
      if (row) st.rows.push(row);
      fetched++;
      if (fetched % 25 === 0) {
        console.log(`  ${st.rows.length} rows · ${Object.keys(st.done).length} fetched · ${st.queue.length} left`);
        saveState(st);
        saveRows(st.rows);
        if (!SKIP_IMPORT) embedHalalPage();
      }
    } catch (e) {
      st.done[url] = 'err';
      errors++;
      if (errors % 10 === 0) console.warn('  error:', url, e.message);
    }
    await sleep(DELAY_MS);
  }

  saveState(st);
  saveRows(st.rows);
  console.log(`\nZabihah crawl paused: ${st.rows.length} restaurants saved → ${path.relative(ROOT, OUT)}`);
  console.log(`  ${st.queue.length} URLs remaining in queue`);

  if (!SKIP_IMPORT && st.rows.length) embedHalalPage();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
