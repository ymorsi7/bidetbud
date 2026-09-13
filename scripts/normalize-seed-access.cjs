#!/usr/bin/env node
/**
 * Reconcile access fields on existing seed rows (Singapore community, showrooms).
 *
 *   node scripts/normalize-seed-access.cjs
 */
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { normalizeRowAccess } = require('./lib/map-public-access.cjs');

const seed = readSeed();
let changed = 0;
let limitedToPublic = 0;

const next = seed.map((row) => {
  const updated = normalizeRowAccess(row);
  if (updated.access !== row.access) {
    changed++;
    if (row.access === 'limited' && updated.access === 'public') limitedToPublic++;
  }
  return updated;
});

writeSeed(next);
console.log(
  `normalize-seed-access: ${changed} rows updated (${limitedToPublic} limited → public). Total: ${next.length}`
);
