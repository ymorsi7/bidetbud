#!/usr/bin/env node
/**
 * Merge france-web-crawl-bidets.json into france-verified-bidets.json (deduped).
 */
const fs = require('fs');
const path = require('path');

const VERIFIED = path.join(__dirname, '../data/france-verified-bidets.json');
const CRAWL = path.join(__dirname, '../data/france-web-crawl-bidets.json');

function normName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9àâäéèêëïîôùûüç]/g, '');
}

function load(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}

const base = load(VERIFIED);
const crawl = load(CRAWL);
const seen = new Set(base.map((r) => normName(r.name)));
let added = 0;

for (const row of crawl) {
  if (!row.sourceUrl || !row.sourceQuote || !row.latitude) continue;
  const key = normName(row.name);
  if (seen.has(key)) continue;
  seen.add(key);
  const clean = { ...row };
  if (!clean.searchAliases) delete clean.searchAliases;
  base.push(clean);
  added++;
}

base.sort((a, b) =>
  `${a.city || ''}|${a.name}`.localeCompare(`${b.city || ''}|${b.name}`, 'fr')
);
fs.writeFileSync(VERIFIED, JSON.stringify(base, null, 2) + '\n');
console.log(`Merged +${added} new crawl rows. Total France verified: ${base.length}`);
