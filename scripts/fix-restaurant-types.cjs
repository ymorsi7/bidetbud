#!/usr/bin/env node
/**
 * Re-tag mislabeled venues in BIDETBUD_SEED:
 * - Hotels wrongly set to type "restaurant" -> "hotel"
 * - Obvious restaurants tagged "public" -> "restaurant" (incl. SG hawkers/cafes)
 */
const fs = require('fs');
const path = require('path');
const { shouldBeHotel, shouldBeMosque, shouldBeRestaurant } = require('./lib/infer-type.cjs');

const htmlPath = path.join(__dirname, '../index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/window\.BIDETBUD_SEED\s*=\s*(\[[\s\S]*?\]);/);
if (!match) {
  console.error('BIDETBUD_SEED not found');
  process.exit(1);
}

const seed = JSON.parse(match[1]);
let toHotel = 0;
let toRestaurant = 0;
let toMosque = 0;
let accessFixed = 0;

for (const row of seed) {
  if (shouldBeMosque(row)) {
    row.type = 'mosque';
    toMosque++;
  } else if (shouldBeHotel(row)) {
    row.type = 'hotel';
    toHotel++;
    if (row.access !== 'limited') {
      row.access = 'limited';
      row.accessNote = row.accessNote || 'Hotel guests';
      accessFixed++;
    }
  } else if (shouldBeRestaurant(row)) {
    row.type = 'restaurant';
    toRestaurant++;
  }
}

const newHtml = html.replace(
  /window\.BIDETBUD_SEED\s*=\s*\[[\s\S]*?\];/,
  `window.BIDETBUD_SEED = ${JSON.stringify(seed)};`
);
fs.writeFileSync(htmlPath, newHtml);

console.log('Re-tagged to hotel:', toHotel, `(access -> limited: ${accessFixed})`);
console.log('Re-tagged to restaurant:', toRestaurant);
console.log('Re-tagged to mosque:', toMosque);
