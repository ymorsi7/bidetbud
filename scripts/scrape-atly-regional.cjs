#!/usr/bin/env node
/**
 * Scrape Atly bathroom list pages for Canada, UK, AU, NZ, China, Mexico, Colombia, …
 * Reads data/atly-regional-lists.json (from bathroom PROBE URLs).
 * Output: data/atly-regional-bidets.json (merge-safe)
 */
const fs = require('fs');
const path = require('path');

const scrapeNa = path.join(__dirname, 'scrape-atly-na.cjs');
const regionalLists = path.join(__dirname, '../data/atly-regional-lists.json');
const out = path.join(__dirname, '../data/atly-regional-bidets.json');
const naOut = path.join(__dirname, '../data/atly-na-bidets.json');

if (!fs.existsSync(regionalLists)) {
  console.error('Missing', regionalLists);
  process.exit(1);
}

// Reuse scrape-atly-na by temporarily pointing its ALL_URLS file at regional lists.
const backup = path.join(__dirname, '../data/atly-all-urls.json.bak');
const allUrls = path.join(__dirname, '../data/atly-all-urls.json');
if (fs.existsSync(allUrls)) fs.copyFileSync(allUrls, backup);
fs.writeFileSync(allUrls, fs.readFileSync(regionalLists));

const { execFileSync } = require('child_process');
try {
  execFileSync('node', [scrapeNa], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
} finally {
  if (fs.existsSync(backup)) {
    fs.copyFileSync(backup, allUrls);
    fs.unlinkSync(backup);
  }
}

if (fs.existsSync(naOut)) {
  const prior = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : [];
  const batch = JSON.parse(fs.readFileSync(naOut, 'utf8'));
  const merged = new Map();
  for (const row of [...prior, ...batch]) {
    const key = `${row.name}|${Number(row.latitude).toFixed(5)}|${Number(row.longitude).toFixed(5)}`;
    merged.set(key, row);
  }
  const rows = [...merged.values()];
  fs.writeFileSync(out, JSON.stringify(rows, null, 2) + '\n');
  const by = rows.reduce((a, r) => {
    a[r.country] = (a[r.country] || 0) + 1;
    return a;
  }, {});
  console.log(`Merged ${rows.length} regional Atly rows -> ${out}`, by);
}
