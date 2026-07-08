#!/usr/bin/env node
/**
 * Embed bidet seed for the static site.
 * Writes data/bidet-restaurants.json (full) + slim bidet-seed.js (browser).
 *
 *   node scripts/embed-bidet-seed.cjs
 *   node scripts/embed-bidet-seed.cjs path/to/rows.json
 */
const fs = require('fs');
const path = require('path');
const { readSeed, writeSeed, FULL_JSON } = require('./lib/bidet-seed.cjs');

const src = process.argv[2] ? path.resolve(process.argv[2]) : null;
const rows = src
  ? JSON.parse(fs.readFileSync(src, 'utf8'))
  : readSeed();

if (!Array.isArray(rows)) {
  console.error('Expected JSON array');
  process.exit(1);
}

writeSeed(rows);

const seedKb = Math.round(fs.statSync(path.join(__dirname, '..', 'bidet-seed.js')).size / 1024);
const htmlKb = Math.round(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').length / 1024);
const fullKb = fs.existsSync(FULL_JSON) ? Math.round(fs.statSync(FULL_JSON).size / 1024) : 0;
console.log(
  `Embedded ${rows.length} spots → bidet-seed.js (${seedKb} KB), data/bidet-restaurants.json (${fullKb} KB), index.html (${htmlKb} KB)`
);
