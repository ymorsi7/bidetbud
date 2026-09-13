#!/usr/bin/env node
/**
 * Manual / in-person spots must exist in slim seed and match common searches.
 * Run: node scripts/test-manual-spots.cjs
 */
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { readSeed, slimRow } = require('./lib/bidet-seed.cjs');

const searchSrc = fs.readFileSync(path.join(__dirname, '../js/search-seed.js'), 'utf8');
const ctx = { window: {}, globalThis: {} };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.runInNewContext(searchSrc, ctx);
const { searchScore } = ctx.window.BidetBudSearch;

const full = readSeed();
const slim = require('../bidet-seed.json');

const MANUAL_SPOTS = [
  { name: 'Masjid As-Saber', queries: ['masjid assaber', 'portland masjid'], status: ['verified', 'none'] },
  { name: 'MAPS (Muslim Association of Puget Sound)', queries: ['maps redmond'], status: ['verified', 'none'] },
  { name: 'MAPS Seattle', queries: ['maps seattle', 'maps downtown'], status: ['verified', 'none'] },
  { name: 'Islamic House at the UW', queries: ['islamic house uw'], status: ['verified', 'none'] },
  { name: 'Al-Iman Mosque', queries: ['al iman astoria'], status: ['verified', 'none'] },
  { name: 'Hello Bangladesh', queries: ['hello bangladesh'], status: ['verified', 'none'] },
  { name: 'Alsabeel Masjid Noor Al-Islam', queries: ['alsabeel san francisco'], status: ['verified', 'none'] },
  { name: 'Qahwah House (West Village)', queries: ['qawa house manhattan'], status: ['verified', 'none'] },
  { name: 'Qahwah House (Williamsburg)', queries: ['qawa house brooklyn'], status: ['verified', 'none'] },
  { name: 'Islamic Center of San Diego', queries: ['icsd', 'islamic center san diego'], status: ['verified', 'none'] },
  { name: 'Champa Kitchen', queries: ['champa kitchen san jose'], status: ['verified'] },
  { name: 'Golden Shawarma', queries: ['golden shawarma richardson'], status: ['verified'] },
  { name: 'Islamic Center of Frisco', queries: ['islamic center frisco'], status: ['verified'] },
  { name: 'Yosaku', queries: ['yosaku portland'], status: ['warmed', 'internet', 'verified'] },
  { name: 'Ayat Bushwick', queries: ['ayat bushwick'], status: ['internet', 'verified'] },
  { name: 'Miyabi 45th', queries: ['miyabi seattle'], status: ['warmed', 'internet', 'verified'] },
];

for (const spot of MANUAL_SPOTS) {
  const row = full.find((r) => r.name === spot.name);
  assert.ok(row, `missing from full seed: ${spot.name}`);
  assert.ok(spot.status.includes(row.bidetStatus), `${spot.name} bad status ${row.bidetStatus}`);
  const slimRow_ = slim.find((r) => r.name === row.name && r.latitude === String(row.latitude));
  assert.ok(slimRow_, `missing from slim seed: ${spot.name}`);
  const slimAliases = slimRow(row).searchAliases || '';
  assert.ok(
    !row.searchAliases || slimAliases === row.searchAliases || slimAliases === row.searchAliases.slice(0, 120),
    `${spot.name} slim aliases truncated unexpectedly`
  );
  for (const q of spot.queries) {
    assert.ok(searchScore(slimRow_, q) > 0, `${spot.name} should match "${q}"`);
  }
  console.log('  ✓', spot.name);
}

console.log('\nAll manual spot checks passed.');
