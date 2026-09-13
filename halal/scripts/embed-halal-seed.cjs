#!/usr/bin/env node
/**
 * Embed halal restaurant data for the static site.
 * Writes halal/seed.json for async client fetch (halal/index.html stays small).
 * Also writes halal/seed.js as deploy fallback when JSON fetch fails.
 *
 *   node halal/scripts/embed-halal-seed.cjs
 *   node halal/scripts/embed-halal-seed.cjs path/to/rows.json
 */
const fs = require('fs');
const path = require('path');

const { HALAL_ROOT } = require('./lib/paths.cjs');
const HTML = path.join(HALAL_ROOT, 'index.html');
const SEED_JS = path.join(HALAL_ROOT, 'seed.js');
const SEED_JSON = path.join(HALAL_ROOT, 'seed.json');
const DEFAULT_JSON = path.join(HALAL_ROOT, 'data/halal-restaurants.json');

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
  if (r.venueType === 'store') out.venueType = 'store';
  if (r.hasBidet) {
    out.hasBidet = true;
    if (r.bidetType) out.bidetType = String(r.bidetType).slice(0, 80);
    if (r.bidetSpotId) out.bidetSpotId = r.bidetSpotId;
  }
  return out;
}

const seed = rows.map(slimRow);
const seedJson = JSON.stringify(seed);
fs.writeFileSync(SEED_JS, 'window.HALALBUD_SEED=' + seedJson + ';\n');
fs.writeFileSync(SEED_JSON, seedJson + '\n');

// seed.json is fetched first; seed.js is the fallback.

let html = fs.readFileSync(HTML, 'utf8');
const seedJsTag = /<script src="seed\.js"><\/script>\s*/g;
const inlineRe = /<script>\s*window\.HALALBUD_SEED\s*=\s*\[[\s\S]*?\];\s*<\/script>\s*/;

html = html.replace(seedJsTag, '');
html = html.replace(inlineRe, '');

fs.writeFileSync(HTML, html);

const seedKb = Math.round(fs.statSync(SEED_JS).size / 1024);
const jsonKb = Math.round(fs.statSync(SEED_JSON).size / 1024);
const htmlKb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`Embedded ${seed.length} restaurants → halal/seed.json (${jsonKb} KB), halal/seed.js (${seedKb} KB), halal/index.html (${htmlKb} KB)`);
