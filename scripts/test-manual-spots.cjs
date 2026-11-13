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
  { name: 'Masjid Al Huda (Huda Community Center)', queries: ['huda community center', 'masjid al huda san diego', 'al huda san diego'], status: ['verified'] },
  { name: 'Islamic Center of Northridge (Granada Hills)', queries: ['islamic center northridge', 'granada hills masjid', 'goicn'], status: ['verified'] },
  { name: 'Masjid Al Ansar', queries: ['west coast islamic society', 'wcis', 'west coast islamic center'], status: ['verified'] },
  { name: 'Masjid Sunnah', queries: ['masjid sunnah san diego'], status: ['none'] },
  { name: 'Mission Viejo Masjid', queries: ['ocif', 'orange county islamic foundation'], status: ['verified'] },
  { name: 'Champa Kitchen', queries: ['champa kitchen san jose'], status: ['verified'] },
  { name: 'Golden Shawarma', queries: ['golden shawarma richardson'], status: ['verified'] },
  { name: 'Cloud Naan', queries: ['cloud naan', 'cloud naan richardson'], status: ['verified'] },
  { name: 'Royal Roastery', queries: ['royal roastery', 'royal roastery richardson'], status: ['verified'] },
  { name: 'Mutabak Karak', queries: ['mutabak karak', 'mutabak karak richardson', 'mutabak'], status: ['verified'] },
  { name: "Hamburgotti's", queries: ['hamburgottis', 'hamburgotti', 'hamburgottis richardson'], status: ['none'] },
  { name: 'Chocolate Drip', queries: ['chocolate drip', 'chocolate drip richardson', 'chocolate drip cafe'], status: ['verified'] },
  { name: 'OG Chicken & Gyro', queries: ['og chicken', 'og chicken and gyro', 'og chicken richardson'], status: ['none'] },
  { name: 'Kafi BBQ', queries: ['kafi bbq', 'kafi', 'kafi bbq irving'], status: ['none'] },
  { name: 'Local Good Coffee', queries: ['local good coffee', 'local good', 'local good coffee plano'], status: ['none'] },
  { name: "Mike's Chicken (Plano)", queries: ['mikes chicken', "mike's chicken plano", 'mikes chicken plano'], status: ['none'] },
  { name: 'Dessert Lab (Richardson)', queries: ['dessert lab', 'dessert lab richardson', 'dessert lab polk'], status: ['none'] },
  { name: 'Tarboosh Gyro Grill', queries: ['tarboosh', 'tarboosh gyro', 'tarboosh richardson', 'tarboosh gyro grill'], status: ['none'] },
  { name: 'Zamzam Kabab (Plano)', queries: ['zamzam kabab', 'zamzam plano', 'zam zam kabab plano', 'zamzam kebab'], status: ['none'] },
  { name: "Ricky's Hot Chicken (Richardson)", queries: ['rickys hot chicken', "ricky's hot chicken richardson", 'ricky hot chicken richardson'], status: ['none'] },
  { name: 'Simply Noodles & Dim Sum Bryant Park', queries: ['simply noodles', 'simply noodles bryant park', 'simply dim sum'], status: ['none'] },
  { name: 'Islamic Center of Frisco', queries: ['islamic center frisco'], status: ['verified'] },
  { name: 'MAS Dallas', queries: ['mas dallas', 'mas dfw', 'muslim american society dallas'], status: ['verified'] },
  { name: 'Islamic Association of Collin County (Plano Mosque)', queries: ['iacc', 'plano mosque', 'plano masjid', 'islamic association of collin county'], status: ['verified'] },
  { name: 'Sapp Bros Travel Center (Toquerville / St. George)', queries: ['sapp bros toquerville', 'sapp bros st george'], status: ['verified'] },
  { name: 'Bright Horizon Academy', queries: ['bright horizon academy', 'bright horizon san diego'], status: ['verified'] },
  { name: 'Delah Coffee (San Francisco)', queries: ['delah coffee san francisco', 'delah 4th'], status: ['none'] },
  { name: 'La Vaca Birria', queries: ['la vaca birria', 'la vaca san francisco'], status: ['none'] },
  { name: 'Qishr Coffee House', queries: ['qishr', 'qishr coffee', 'qishr san jose'], status: ['verified'] },
  { name: 'Urth Caffé (Orange)', queries: ['urth cafe orange', 'urth caffe orange', 'urth orange'], status: ['none'] },
  { name: 'Fritzsche Haustechnik GmbH', queries: ['fritzsche haustechnik'], status: ['verified'] },
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

const icc = full.find((r) => /coppell|\bicc dallas\b/i.test([r.name, r.searchAliases].filter(Boolean).join(' ')));
assert.equal(icc, undefined, 'ICC Dallas / Coppell should not be on the map');

console.log('\nAll manual spot checks passed.');
