#!/usr/bin/env node
/**
 * Embed halal restaurant data for the static site.
 * Writes compact halal-seed.js (not inline in halal.html — keeps the page shell fast).
 *
 *   node scripts/embed-halal-seed.cjs
 *   node scripts/embed-halal-seed.cjs path/to/rows.json
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'halal.html');
const SEED_JS = path.join(ROOT, 'halal-seed.js');
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
  return out;
}

const seed = rows.map(slimRow);
fs.writeFileSync(SEED_JS, 'window.HALALBUD_SEED=' + JSON.stringify(seed) + ';\n');

let html = fs.readFileSync(HTML, 'utf8');
const seedTag = '<script src="halal-seed.js"></script>';
const inlineRe = /<script>\s*window\.HALALBUD_SEED\s*=\s*\[[\s\S]*?\];\s*<\/script>\s*/;

if (inlineRe.test(html)) {
  html = html.replace(inlineRe, seedTag + '\n');
} else if (!html.includes(seedTag)) {
  const needle = '<script src="https://unpkg.com/leaflet.markercluster';
  if (!html.includes(needle)) {
    console.error('Could not find insertion point in halal.html');
    process.exit(1);
  }
  html = html.replace(needle, seedTag + '\n' + needle);
}

fs.writeFileSync(HTML, html);

const seedKb = Math.round(fs.statSync(SEED_JS).size / 1024);
const htmlKb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`Embedded ${seed.length} restaurants → halal-seed.js (${seedKb} KB), halal.html (${htmlKb} KB)`);
