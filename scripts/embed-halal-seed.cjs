#!/usr/bin/env node
/**
 * Embed halal restaurant data for the static site.
 * Writes halal-seed.json for async client fetch (halal.html shell stays small).
 * Also writes halal-seed.js for optional legacy use — not loaded by halal.html.
 *
 *   node scripts/embed-halal-seed.cjs
 *   node scripts/embed-halal-seed.cjs path/to/rows.json
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'halal.html');
const SEED_JS = path.join(ROOT, 'halal-seed.js');
const SEED_JSON = path.join(ROOT, 'halal-seed.json');
const DEFAULT_JSON = path.join(ROOT, 'data/halal-restaurants.json');

const src = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_JSON;
if (!fs.existsSync(src)) {
  console.error('No seed file:', src);
  process.exit(1);
}

const rows = JSON.parse(fs.readFileSync(src, 'utf8'));
if (!Array.isArray(rows)) {
  console.error('Expected JSON array');
  process.exit(1);
}

/** Minimal fields for the client map — drops import-only metadata and long quotes. */
function slimRow(r) {
  const out = {
    name: r.name,
    latitude: String(r.latitude),
    longitude: String(r.longitude),
    halalStatus: r.halalStatus === 'options' ? 'options' : 'full',
  };
  if (r.address) out.address = r.address;
  if (r.city) out.city = r.city;
  if (r.country) out.country = r.country;
  if (r.cuisine) out.cuisine = r.cuisine;
  if (r.sourceUrl) out.sourceUrl = r.sourceUrl;
  if (r.sourceQuote) out.sourceQuote = String(r.sourceQuote).slice(0, 120);
  out.venueType = r.venueType === 'store' ? 'store' : 'restaurant';
  return out;
}

const seed = rows.map(slimRow);
const seedJson = JSON.stringify(seed);
fs.writeFileSync(SEED_JS, 'window.HALALBUD_SEED=' + seedJson + ';\n');
fs.writeFileSync(SEED_JSON, seedJson + '\n');

// halal-seed.json is optional locally (faster fetch); halal-seed.js is the deploy fallback.

let html = fs.readFileSync(HTML, 'utf8');
const seedJsTag = /<script src="halal-seed\.js"><\/script>\s*/g;
const inlineRe = /<script>\s*window\.HALALBUD_SEED\s*=\s*\[[\s\S]*?\];\s*<\/script>\s*/;

html = html.replace(seedJsTag, '');
html = html.replace(inlineRe, '');

fs.writeFileSync(HTML, html);

const seedKb = Math.round(fs.statSync(SEED_JS).size / 1024);
const jsonKb = Math.round(fs.statSync(SEED_JSON).size / 1024);
const htmlKb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`Embedded ${seed.length} restaurants → halal-seed.json (${jsonKb} KB), halal-seed.js (${seedKb} KB), halal.html (${htmlKb} KB)`);
