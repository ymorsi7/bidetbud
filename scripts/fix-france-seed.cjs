#!/usr/bin/env node
/**
 * Fix bad France geocodes and remove duplicate TOTO import rows in BIDETBUD_SEED.
 *
 * Known issues from TOTO Europe bulk import:
 * - MAISON ALBAR LE PONT NEUF geocoded to Saint-Jean-du-Bruel (Aveyron) instead of Paris
 * - Maison Albar – Imperator Hotel geocoded to Paris instead of Nîmes (duplicate of correct Nîmes row)
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../index.html');

const MANUAL = {
  'Maison Albar Hotels Le Pont-Neuf': {
    name: 'Maison Albar Hotels Le Pont-Neuf',
    address: '23-25 Rue du Pont Neuf, 75001 Paris',
    latitude: '48.858889',
    longitude: '2.341667',
    city: 'Paris',
  },
  'Maison Albar – Imperator': {
    name: 'Maison Albar – Imperator',
    address: '3 Quai de la Fontaine, 30000 Nîmes',
    latitude: '43.838889',
    longitude: '4.360556',
    city: 'Nîmes',
  },
};

/** Rows to drop entirely (wrong place / duplicate) */
function shouldRemove(row) {
  if (row.country !== 'France') return false;
  const lat = Number(row.latitude);
  const lon = Number(row.longitude);
  const n = row.name || '';

  if (/^MAISON ALBAR LE PONT NEUF$/i.test(n)) return true;
  if (/^Louvre, Paris$/i.test(n)) return true;
  if (/^HOTEL BARRI.+LE FOUQUET/i.test(n)) return true;
  if (/^Hôtel Plaza Athénée – Paris, France$/i.test(n)) return true;
  if (/^The Restaurant Blanc – Paris 16è$/i.test(n)) return true;
  if (/^Les Neiges Hotel Courchevel$/i.test(n)) return true;
  if (/Maison Albar.*Imperator Hotel/i.test(n) && lat > 48.5 && lat < 49 && lon > 2 && lon < 3) {
    return true;
  }
  if (/Maison Albar.*Pont.?Neuf/i.test(n) && lat < 46) return true;
  return false;
}

function main() {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/window\.BIDETBUD_SEED\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    console.error('BIDETBUD_SEED not found');
    process.exit(1);
  }

  const seed = JSON.parse(match[1]);
  let removed = 0;
  let fixed = 0;

  const out = [];
  for (const row of seed) {
    if (shouldRemove(row)) {
      removed++;
      console.log('Remove:', row.name, '@', row.latitude, row.longitude);
      continue;
    }
    const manual = MANUAL[row.name];
    if (manual && row.country === 'France') {
      Object.assign(row, manual);
      fixed++;
      console.log('Fixed:', row.name);
    }
    out.push(row);
  }

  const newHtml = html.replace(
    /window\.BIDETBUD_SEED\s*=\s*\[[\s\S]*?\];/,
    `window.BIDETBUD_SEED = ${JSON.stringify(out)};`
  );
  fs.writeFileSync(htmlPath, newHtml);

  const frCount = out.filter((r) => r.country === 'France').length;
  console.log(`Done: removed ${removed}, fixed ${fixed}. France rows in seed: ${frCount}`);
}

main();
