#!/usr/bin/env node
/**
 * Count pins that appear on the map with access "public" (matches js/app.js filters).
 *
 *   node scripts/count-mappable-public.cjs
 */
const { readSeed } = require('./lib/bidet-seed.cjs');
const { isFriendlyCountry } = require('./lib/non-friendly-countries.cjs');

const HAS_BIDET = new Set(['verified', 'warmed', 'internet']);

const rows = readSeed();
let total = 0;
let publicAccess = 0;
let limited = 0;

for (const r of rows) {
  if (!HAS_BIDET.has(r.bidetStatus)) continue;
  if (isFriendlyCountry(r.country)) continue;
  total++;
  if (r.access === 'public') publicAccess++;
  else limited++;
}

const payload = { totalMappable: total, publicAccess, limitedAccess: limited };
const min = Number(process.argv.find((a) => a.startsWith('--min='))?.split('=')[1] || 3000);
console.log(JSON.stringify({ ...payload, target: min }, null, 2));
if (publicAccess < min) {
  console.error(`Need ${min - publicAccess} more public-access pins to reach ${min}.`);
  process.exit(1);
}
