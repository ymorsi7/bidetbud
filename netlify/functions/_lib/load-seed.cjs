const fs = require('fs');
const path = require('path');
const { open, loadDotEnv } = require('../../../scripts/lib/map-seed-crypto.cjs');

let cache = null;
let resolved = null;

function candidateDataDirs() {
  const roots = [
    path.join(__dirname, '..'),
    path.join(__dirname, '..', '..'),
    __dirname,
    path.join(process.cwd(), 'netlify', 'functions'),
    path.join(process.cwd(), 'src', 'netlify', 'functions'),
    process.cwd(),
    process.env.LAMBDA_TASK_ROOT || '',
    process.env.LAMBDA_TASK_ROOT
      ? path.join(process.env.LAMBDA_TASK_ROOT, 'netlify', 'functions')
      : '',
  ].filter(Boolean);

  const dirs = [];
  for (const root of roots) {
    dirs.push(path.join(root, '_data'));
    dirs.push(path.join(root, 'netlify', 'functions', '_data'));
  }
  return [...new Set(dirs.map((d) => path.resolve(d)))];
}

function resolveDataPaths() {
  if (resolved) return resolved;
  for (const dir of candidateDataDirs()) {
    const enc = path.join(dir, 'map-seed.enc');
    if (fs.existsSync(enc)) {
      resolved = { enc, meta: path.join(dir, 'map-meta.json'), dir };
      return resolved;
    }
  }
  return null;
}

function seedMeta() {
  try {
    const paths = resolveDataPaths();
    if (!paths) return { ver: '0', total: 0, countries: [] };
    return JSON.parse(fs.readFileSync(paths.meta, 'utf8'));
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
  const paths = resolveDataPaths();
  if (!paths) {
    const err = new Error(
      'Sealed map seed missing - run node scripts/seal-map-seed.cjs (searched: '
      + candidateDataDirs().slice(0, 6).join(', ') + ')'
    );
    err.status = 503;
    throw err;
  }
  cache = open(fs.readFileSync(paths.enc), key);
  if (!Array.isArray(cache)) {
    const err = new Error('Bad seed');
    err.status = 503;
    throw err;
  }
  return cache;
}

module.exports = { loadSeed, seedMeta, resolveDataPaths, candidateDataDirs };
