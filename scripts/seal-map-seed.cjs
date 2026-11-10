#!/usr/bin/env node
/**
 * Encrypt the public map payload for Netlify functions.
 * Reads local plaintext seed (gitignored); writes ciphertext only.
 *
 *   MAP_SEED_KEY=... node scripts/seal-map-seed.cjs
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readSeed } = require('./lib/bidet-seed.cjs');
const { buildPublicSeed, countryCounts, ENC_REL, META_REL } = require('./lib/public-map-seed.cjs');
const { seal, loadDotEnv, ROOT } = require('./lib/map-seed-crypto.cjs');

loadDotEnv();
let key = process.env.MAP_SEED_KEY;
if (!key) {
  key = crypto.randomBytes(32).toString('base64url');
  const envPath = path.join(ROOT, '.env');
  const line = `MAP_SEED_KEY=${key}\n`;
  if (fs.existsSync(envPath)) {
    const cur = fs.readFileSync(envPath, 'utf8');
    if (!/^MAP_SEED_KEY=/m.test(cur)) fs.appendFileSync(envPath, line);
    else fs.writeFileSync(envPath, cur.replace(/^MAP_SEED_KEY=.*$/m, `MAP_SEED_KEY=${key}`));
  } else {
    fs.writeFileSync(envPath, line);
  }
  console.log('Generated MAP_SEED_KEY and wrote .env (gitignored). Set the same value in Netlify env.');
  process.env.MAP_SEED_KEY = key;
}

const rows = buildPublicSeed(readSeed());
if (rows.length < 100) {
  console.error('Refusing to seal: public seed only has', rows.length, 'rows');
  process.exit(1);
}

const ver = new Date().toISOString().slice(0, 10).replace(/-/g, '') + 'a';
const encPath = path.join(ROOT, ENC_REL);
const metaPath = path.join(ROOT, META_REL);
fs.mkdirSync(path.dirname(encPath), { recursive: true });
fs.writeFileSync(encPath, seal(rows, key));
fs.writeFileSync(metaPath, JSON.stringify({
  ver,
  total: rows.length,
  countries: countryCounts(rows),
  sealedAt: new Date().toISOString(),
}, null, 2) + '\n');

// Tiny public sample for OSS / offline UI smoke (no research fields).
const sample = rows.filter((r) => r.country === 'USA').slice(0, 24);
fs.writeFileSync(path.join(ROOT, 'bidet-seed.sample.json'), JSON.stringify(sample, null, 2) + '\n');

console.log('Sealed', rows.length, 'public rows →', ENC_REL);
console.log('Meta ver', ver, '→', META_REL);
console.log('Sample', sample.length, 'rows → bidet-seed.sample.json');
