#!/usr/bin/env node
/**
 * Merge TOIMAP washlet toilets into BIDETBUD_SEED (replaces prior toimap.jp rows).
 *
 *   node scripts/scrape-toimap.cjs
 *   node scripts/import-toimap.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { mergeIntoSeed } = require('./lib/seed-merge.cjs');

const SOURCE = path.join(__dirname, '../data/toimap-washlet-toilets.json');

if (!fs.existsSync(SOURCE)) {
  console.error('Missing ' + SOURCE + ' - run scripts/scrape-toimap.cjs first.');
  process.exit(1);
}

const candidates = JSON.parse(fs.readFileSync(SOURCE, 'utf8')).map((row) => {
  const out = { ...row };
  delete out.toimapId;
  if (out.city === 'Japan') out.city = '';
  return out;
});

const existing = readSeed().filter((row) => !String(row.sourceUrl || '').includes('toimap.jp'));
const { merged, added, skipped } = mergeIntoSeed(existing, candidates, {
  accept: (row) =>
    row.country === 'Japan' &&
    row.bidetStatus === 'warmed' &&
    String(row.sourceUrl || '').includes('toimap.jp'),
});

writeSeed(merged);

const japan = merged.filter((r) => r.country === 'Japan');
const toimap = japan.filter((r) => String(r.sourceUrl || '').includes('toimap.jp'));
console.log('TOIMAP import: +' + added + ' new (' + skipped + ' skipped).');
console.log('TOIMAP rows in seed: ' + toimap.length);
console.log('Japan rows in seed: ' + japan.length);
console.log('Total seed entries: ' + merged.length);
