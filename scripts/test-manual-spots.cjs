#!/usr/bin/env node
/**
 * Manual / in-person spots must exist in slim seed and match common searches.
 * Run: node scripts/test-manual-spots.cjs
 */
const assert = require('node:assert/strict');
const { readSeed, slimRow } = require('./lib/bidet-seed.cjs');
const full = readSeed();
const slim = require('../bidet-seed.json');

const MANUAL_SPOTS = [
  { name: 'Masjid As-Saber', queries: ['masjid assaber', 'portland masjid'] },
  { name: 'MAPS (Muslim Association of Puget Sound)', queries: ['maps redmond'] },
  { name: 'MAPS Seattle', queries: ['maps seattle', 'maps downtown'] },
  { name: 'Islamic House at the UW', queries: ['islamic house uw'] },
  { name: 'Al-Iman Mosque', queries: ['al iman astoria'] },
  { name: 'Hello Bangladesh', queries: ['hello bangladesh'] },
  { name: 'Alsabeel Masjid Noor Al-Islam', queries: ['alsabeel san francisco'] },
  { name: 'Qahwah House (West Village)', queries: ['qawa house manhattan'] },
  { name: 'Qahwah House (Williamsburg)', queries: ['qawa house brooklyn'] },
];

function normalizeSearchText(s){
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function searchScore(m, rawQ){
  const q = normalizeSearchText(rawQ);
  if(!q) return 0;
  const hay = normalizeSearchText([m.name, m.city, m.address, m.searchAliases].filter(Boolean).join(' '));
  if(hay.includes(q)) return 70;
  const tokens = q.split(' ').filter(Boolean);
  if(tokens.length > 1){
    const hayWords = hay.split(' ');
    if(tokens.every(t => hayWords.some(w => w.startsWith(t) || w.includes(t)))) return 65;
  }
  return hay.includes(q.replace(/\s/g, '')) ? 60 : 0;
}

for (const spot of MANUAL_SPOTS) {
  const row = full.find(r => r.name === spot.name);
  assert.ok(row, `missing from full seed: ${spot.name}`);
  assert.ok(['verified', 'none'].includes(row.bidetStatus), `${spot.name} bad status`);
  const slimRow_ = slim.find(r => r.name === row.name && r.latitude === String(row.latitude));
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
