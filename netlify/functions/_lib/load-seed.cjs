const fs = require('fs');
const path = require('path');
const { open, loadDotEnv } = require('../../../scripts/lib/map-seed-crypto.cjs');

const ENC = path.join(__dirname, '..', '_data', 'map-seed.enc');
const META = path.join(__dirname, '..', '_data', 'map-meta.json');

let cache = null;

function seedMeta() {
  try {
    return JSON.parse(fs.readFileSync(META, 'utf8'));
  } catch {
    return { ver: '0', total: 0, countries: [] };
  }
}

function loadSeed() {
  if (cache) return cache;
  loadDotEnv();
  const key = process.env.MAP_SEED_KEY;
  if (!key) {
    const err = new Error('MAP_SEED_KEY not configured');
    err.status = 503;
    throw err;
  }
  if (!fs.existsSync(ENC)) {
    const err = new Error('Sealed map seed missing — run node scripts/seal-map-seed.cjs');
    err.status = 503;
    throw err;
  }
  cache = open(fs.readFileSync(ENC), key);
  if (!Array.isArray(cache)) {
    const err = new Error('Bad seed');
    err.status = 503;
    throw err;
  }
  return cache;
}

module.exports = { loadSeed, seedMeta };
