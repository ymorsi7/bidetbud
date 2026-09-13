#!/usr/bin/env node
/**
 * Run all halal list crawlers then merge into halal/index.html.
 *
 *   node halal/scripts/crawl-halal-all.cjs --minutes=120
 *   node halal/scripts/crawl-halal-all.cjs --minutes=60 --zabihah-only
 *   node halal/scripts/crawl-halal-all.cjs --minutes=60 --extras-only
 *   node halal/scripts/crawl-halal-all.cjs --minutes=30 --osm-only
 */
const { execFileSync } = require('child_process');
const { REPO_ROOT } = require('./lib/paths.cjs');

const args = process.argv.slice(2);
const minutesArg = args.find((a) => a.startsWith('--minutes='));
const rawMinutes = minutesArg ? minutesArg.split('=')[1] : '90';
const MINUTES = /^\d+$/.test(rawMinutes) ? rawMinutes : '90';
const zabihahOnly = args.includes('--zabihah-only');
const osmOnly = args.includes('--osm-only');
const extrasOnly = args.includes('--extras-only');
const skipImport = args.includes('--no-import');

function run(script, scriptArgs = []) {
  console.log('\n▶', script, scriptArgs.join(' '));
  execFileSync(process.execPath, [script, ...scriptArgs], { cwd: REPO_ROOT, stdio: 'inherit' });
}

try {
  run('halal/scripts/import-muis-halal.cjs');
  run('halal/scripts/import-halal-atly.cjs');
  run('halal/scripts/crawl-halal-directories.cjs');

  if (!osmOnly && !extrasOnly) {
    run('halal/scripts/crawl-zabihah-listings.cjs', [`--minutes=${Math.max(30, Math.floor(Number(MINUTES) / 2))}`, '--no-import']);
    run('halal/scripts/crawl-zabihah.cjs', [`--minutes=${MINUTES}`, '--no-import']);
  }

  if (!zabihahOnly) {
    run('halal/scripts/crawl-osm-halal.cjs', [`--minutes=${Math.max(15, Math.floor(Number(MINUTES) / 3))}`, '--extended-only']);
    run('halal/scripts/crawl-reddit-halal.cjs');
    run('halal/scripts/crawl-halal-web.cjs', [`--minutes=${Math.max(20, Math.floor(Number(MINUTES) / 2))}`]);
  }

  if (!skipImport) run('halal/scripts/import-halal-all.cjs');
} catch (e) {
  process.exit(e.status || 1);
}
