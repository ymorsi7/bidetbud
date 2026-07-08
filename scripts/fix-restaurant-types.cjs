#!/usr/bin/env node
/**
 * Re-tag mislabeled venues in BIDETBUD_SEED:
 * - Hotels wrongly set to type "restaurant" -> "hotel"
 * - Obvious restaurants tagged "public" -> "restaurant" (incl. SG hawkers/cafes)
 */
const fs = require('fs');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const path = require('path');
const { shouldBeHotel, shouldBeMosque, shouldBeRestaurant } = require('./lib/infer-type.cjs');

const seed = readSeed();
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

writeSeed(seed);

console.log('Re-tagged to hotel:', toHotel, `(access -> limited: ${accessFixed})`);
console.log('Re-tagged to restaurant:', toRestaurant);
console.log('Re-tagged to mosque:', toMosque);
