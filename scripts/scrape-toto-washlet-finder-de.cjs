#!/usr/bin/env node
/**
 * Extract Germany hotel/showroom entries from TOTO WASHLET-Finder (eu.toto.com/de).
 * Output: data/germany-toto-finder.json
 */
const fs = require('fs');
const path = require('path');
const { fetchText, sleep } = require('./lib/germany-web.cjs');

const OUT = path.join(__dirname, '../data/germany-toto-finder.json');
const URL = 'https://eu.toto.com/de/service/washlet-testen';

function parseFinder(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<[^>]+>/g, '\n')
    .replace(/\s+/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const rows = [];
  const dePlz = /^\d{5}\s/;
  for (let i = 0; i < text.length; i++) {
    const line = text[i];
    if (!dePlz.test(line)) continue;
    const addr = line;
    const plz = addr.slice(0, 5);
    if (Number(plz) < 1000 || Number(plz) > 99999) continue;
    const name = (text[i - 1] || '').trim();
    if (!name || name.length < 4) continue;
    if (/share|route|karte|mail|whatsapp|washlet®|neorest/i.test(name)) continue;
    const product = (text[i + 1] || '').trim();
    if (!/washlet|neorest|dusch/i.test(product) && !/hotel|flughafen|gmbh/i.test(name)) continue;
    rows.push({ name, address: addr, product, plz });
  }

  const seen = new Set();
  return rows.filter((r) => {
    const k = r.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return /hotel|flughafen|kempinski|sofitel|marriott|mandarin|vierjahreszeiten|bayerpost|resort|schloss/i.test(r.name);
  });
}

async function main() {
  const html = await fetchText(URL);
  const rows = parseFinder(html);
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
  console.log(`Wrote ${rows.length} Germany TOTO finder hotel entries to ${OUT}`);
  rows.slice(0, 15).forEach((r) => console.log('-', r.name, '|', r.address));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
