#!/usr/bin/env node
/**
 * Run all halal list crawlers then merge into data/halal-restaurants.json.
 *
 *   node scripts/crawl-halal-all.cjs --minutes=90
 *   node scripts/crawl-halal-all.cjs --minutes=90 --zabihah-only
 *   node scripts/crawl-halal-all.cjs --minutes=30 --osm-only
 */
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const minutesArg = args.find((a) => a.startsWith('--minutes='));
const MINUTES = minutesArg ? minutesArg.split('=')[1] : '90';
const zabihahOnly = args.includes('--zabihah-only');
const osmOnly = args.includes('--osm-only');

function run(cmd) {
  console.log('\n▶', cmd);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

try {
  run('node scripts/import-muis-halal.cjs');
  run('node scripts/import-halal-atly.cjs');
  if (!osmOnly) run(`node scripts/crawl-zabihah.cjs --minutes=${MINUTES}`);
  if (!zabihahOnly) run(`node scripts/crawl-osm-halal.cjs --minutes=${Math.max(15, Math.floor(Number(MINUTES) / 3))}`);
  run('node scripts/import-halal-all.cjs');
} catch (e) {
  process.exit(e.status || 1);
}
