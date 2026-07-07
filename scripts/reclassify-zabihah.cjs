#!/usr/bin/env node
/**
 * Re-fetch Zabihah pages and fix halalStatus (full vs options) with updated parser.
 *
 *   node scripts/reclassify-zabihah.cjs --minutes=90
 *   node scripts/reclassify-zabihah.cjs --minutes=90 --import
 */
const fs = require('fs');
const path = require('path');
const { fetchText, parseZabihahHtml, sleep } = require('./lib/halal-web.cjs');

const ROOT = path.join(__dirname, '..');
const IN = path.join(ROOT, 'data/zabihah-halal-restaurants.json');
const OUT = IN;
const STATE = path.join(ROOT, 'data/zabihah-reclassify-state.json');
const DELAY_MS = 2100;

const args = process.argv.slice(2);
const minutesArg = args.find((a) => a.startsWith('--minutes='));
const MINUTES = minutesArg ? Number(minutesArg.split('=')[1]) : 60;
const DO_IMPORT = args.includes('--import');
const RESET = args.includes('--reset');

function loadState() {
  if (RESET || !fs.existsSync(STATE)) return { done: {}, rows: null };
  return JSON.parse(fs.readFileSync(STATE, 'utf8'));
}

function saveState(st) {
  fs.writeFileSync(STATE, JSON.stringify(st, null, 2) + '\n');
}

async function main() {
  if (!fs.existsSync(IN)) {
    console.error('Missing', IN);
    process.exit(1);
  }
  const original = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const st = loadState();
  if (!st.rows) {
    // Re-check likely-wrong "fully halal" rows first (old parser default).
    const suspicious = (r) =>
      r.halalStatus === 'full' &&
      (/Zabihah listing — halal restaurant/i.test(r.sourceQuote || '') ||
        /brew(?:ery|ing)?|distillery|bar & grill|wine/i.test(r.name || ''));
    st.rows = [
      ...original.filter(suspicious),
      ...original.filter((r) => !suspicious(r)),
    ].map((r) => ({ ...r }));
  }

  const deadline = Date.now() + MINUTES * 60 * 1000;
  let changed = 0;
  let processed = 0;

  for (let i = 0; i < st.rows.length && Date.now() < deadline; i++) {
    const row = st.rows[i];
    const url = row.sourceUrl;
    if (!url || st.done[url]) continue;

    try {
      const html = await fetchText(url);
      const parsed = parseZabihahHtml(html, url);
      if (parsed) {
        const before = row.halalStatus;
        row.halalStatus = parsed.halalStatus;
        row.sourceQuote = parsed.sourceQuote;
        if (parsed.cuisine) row.cuisine = parsed.cuisine;
        if (before !== row.halalStatus) changed++;
      }
      st.done[url] = 'ok';
    } catch (e) {
      st.done[url] = `err: ${e.message}`;
    }

    processed++;
    if (processed % 25 === 0) {
      const full = st.rows.filter((r) => r.halalStatus === 'full').length;
      const opts = st.rows.filter((r) => r.halalStatus === 'options').length;
      console.log(`  ${processed} checked · ${changed} changed · full ${full} · options ${opts}`);
      saveState(st);
      fs.writeFileSync(OUT, JSON.stringify(st.rows, null, 2) + '\n');
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(OUT, JSON.stringify(st.rows, null, 2) + '\n');
  saveState(st);

  const full = st.rows.filter((r) => r.halalStatus === 'full').length;
  const opts = st.rows.filter((r) => r.halalStatus === 'options').length;
  console.log(`\nReclassified ${Object.keys(st.done).length}/${st.rows.length} Zabihah rows`);
  console.log(`  Fully halal: ${full} · Halal options: ${opts} · ${changed} status changes this run`);

  if (DO_IMPORT) {
    require('child_process').execSync('node scripts/import-halal-all.cjs', { cwd: ROOT, stdio: 'inherit' });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
