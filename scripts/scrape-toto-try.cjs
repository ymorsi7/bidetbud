#!/usr/bin/env node
/**
 * Parse the TOTO "Try WASHLET®" finder listing into candidate rows.
 * Source: https://eu.toto.com/en/service/try-washlettm (rendered page saved as markdown)
 *
 * These are TOTO showrooms / dealers / retailers where a specific WASHLET model
 * is installed "in the guest toilet" and can be tried in person — treated as
 * public spots with manufacturer-reference evidence.
 *
 * Usage:
 *   node scripts/scrape-toto-try.cjs [path/to/try-washlettm.md]
 *
 * Writes data/toto-try-washlet.json (candidates, no coordinates yet).
 * Run scripts/geocode-toto-try.cjs afterwards to fill in lat/lon.
 */
const fs = require('fs');
const path = require('path');
const {
  countryFromPhone,
  countryFromWebsite,
  countryFromPostcode,
  countryFromCity,
} = require('./lib/toto-try.cjs');

const DEFAULT_SRC =
  '/Users/yusufmorsi/.cursor/projects/Users-yusufmorsi-Documents-GitHub-bidetbeacon/uploads/try-washlettm-0.md';
const SRC = process.argv[2] || DEFAULT_SRC;
const OUT = path.join(__dirname, '../data/toto-try-washlet.json');
const SOURCE_URL = 'https://eu.toto.com/en/service/try-washlettm';

const PREFIX_COUNTRY = require('./lib/toto-try.cjs').PREFIX_COUNTRY;

// Detect the "postcode + city" line and split it. Returns { postcode, city,
// prefixCountry? } where prefixCountry is set for "A-6414"/"DK-3400" style codes.
function parsePostcodeCity(line) {
  const s = line.trim();
  // Country-letter prefix: "A-6414 Obermieming", "DK-3400 Hillerød",
  // "LV-1050 Riga", "L-1234 Luxembourg", "CH-8048 Zürich".
  let m = s.match(/^([A-Z]{1,3})-\s?(\d{3}\s?\d{2}|\d{4,5})\s+(.+)$/);
  if (m) {
    return {
      postcode: m[2].trim(),
      city: m[3].trim(),
      prefixCountry: PREFIX_COUNTRY[m[1].toUpperCase()] || null,
    };
  }
  // UK: "SW8 3RE London"
  m = s.match(/^([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s+(.+)$/i);
  if (m) return { postcode: m[1].trim(), city: m[2].trim() };
  // UK (lenient, tolerates typo'd outward code): "W2CR 0EZ London"
  m = s.match(/^([A-Z]{1,2}\d[A-Z\d]{1,2}\s+\d[A-Z]{2})\s+(.+)$/i);
  if (m) return { postcode: m[1].trim(), city: m[2].trim(), prefixCountry: 'UK' };
  // Irish Eircode: "D24 X39K Dublin 24"
  m = s.match(/^([A-Z]\d[A-Z\d]\s?[A-Z0-9]{4})\s+(.+)$/i);
  if (m) return { postcode: m[1].trim(), city: m[2].trim(), prefixCountry: 'Ireland' };
  // Netherlands: "1234 AB Amsterdam"
  m = s.match(/^(\d{4}\s?[A-Z]{2})\s+(.+)$/i);
  if (m) return { postcode: m[1].trim(), city: m[2].trim() };
  // Czech/Slovak: "110 00 Praha"
  m = s.match(/^(\d{3}\s\d{2})\s+(.+)$/);
  if (m) return { postcode: m[1].trim(), city: m[2].trim() };
  // French PO box line: "BP 90056 DAX Cedex" (BP number is not a real postcode)
  m = s.match(/^BP\s?\d+\s+(.+)$/i);
  if (m) return { postcode: '', city: m[1].trim(), prefixCountry: 'France' };
  // Generic 4-5 digit: "41238 Mönchengladbach" / "8048 Zürich"
  m = s.match(/^(\d{4,5})\s+(.+)$/);
  if (m) return { postcode: m[1].trim(), city: m[2].trim() };
  return null;
}

// A bare city line (no digits, no product/model tokens) — used when a venue
// listing has a city but no postcode, e.g. "Riga".
function looksLikeBareCity(line) {
  const s = line.trim();
  if (!s || /\d/.test(s)) return false;
  if (s.length > 40) return false;
  if (/washlet|neorest|guest toilet|flexcover|giovannoni|in some rooms|®/i.test(s))
    return false;
  return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'\/-]+$/.test(s);
}

function isNoise(line) {
  return (
    !line ||
    line === 'Show on map' ||
    line === 'Calculate Route' ||
    /^Share .* via (Mail|WhatsApp)$/.test(line)
  );
}

function looksLikePhone(line) {
  return /^\+?\d[\d\s()/-]{6,}$/.test(line.replace(/\s+/g, ' ').trim());
}

function looksLikeWebsite(line) {
  return (
    /^(https?:\/\/|www\.)/i.test(line) ||
    /^[a-z0-9-]+\.[a-z]{2,}(\.[a-z]{2})?\s*$/i.test(line)
  );
}

function main() {
  const raw = fs.readFileSync(SRC, 'utf8');
  const lines = raw.split('\n').map((l) => l.replace(/\s+$/g, '').trim());

  // Restrict to the results region.
  const startIdx = lines.findIndex((l) => l === 'Results');
  const endIdx = lines.findIndex((l) =>
    /^Unfortunately, no results could be found/.test(l)
  );
  const region = lines.slice(
    startIdx >= 0 ? startIdx + 1 : 0,
    endIdx >= 0 ? endIdx : lines.length
  );

  // Preserve already-resolved coordinates (and fixed countries) across re-runs
  // so we only need to geocode net-new rows.
  const prior = {};
  if (fs.existsSync(OUT)) {
    try {
      for (const r of JSON.parse(fs.readFileSync(OUT, 'utf8'))) {
        prior[`${r.name}|${r.address}`.toLowerCase()] = r;
      }
    } catch {}
  }

  // Segment into blocks terminated by "Share <name> via WhatsApp".
  const rows = [];
  let block = [];
  let skippedNoAddress = 0;

  for (const line of region) {
    block.push(line);
    const wa = line.match(/^Share (.+) via WhatsApp$/);
    if (!wa) continue;

    const name = wa[1].trim();
    const body = block.filter((l) => l.length > 0);
    block = [];

    const smIdx = body.indexOf('Show on map');
    if (smIdx < 0) continue;

    // Lines before "Show on map", excluding repeated name occurrences.
    const head = body.slice(0, smIdx).filter((l) => l !== name && l !== name + ' ');

    // Find postcode/city line; street is the non-empty line just above it.
    let addr = null;
    let pcIdx = -1;
    for (let i = 0; i < head.length; i++) {
      const pc = parsePostcodeCity(head[i]);
      if (pc) {
        addr = pc;
        pcIdx = i;
        break;
      }
    }

    // Fallback: a listing with a bare city line but no postcode (e.g. "Riga").
    if (!addr) {
      for (let i = 0; i < head.length; i++) {
        if (looksLikeBareCity(head[i])) {
          addr = { postcode: '', city: head[i].trim() };
          pcIdx = i;
          break;
        }
      }
    }

    if (!addr) {
      skippedNoAddress++;
      continue;
    }

    const street = pcIdx > 0 ? head[pcIdx - 1].trim() : '';
    // Everything after postcode/city (before Show on map) is the model text.
    const model =
      head
        .slice(pcIdx + 1)
        .join(' ')
        .replace(/\s*\|\s*/g, ' ')
        .replace(/in the guest toilet/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim() || 'TOTO WASHLET';

    // Tail: phone + website between "Calculate Route" and share links.
    const crIdx = body.indexOf('Calculate Route');
    const tail = body
      .slice(crIdx + 1)
      .filter((l) => !/^Share .* via (Mail|WhatsApp)$/.test(l));
    let phone = null;
    let website = null;
    for (const t of tail) {
      if (!phone && looksLikePhone(t)) phone = t.trim();
      else if (!website && looksLikeWebsite(t)) website = t.trim();
    }

    const addressParts = [street, [addr.postcode, addr.city].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', ');

    const country =
      countryFromPhone(phone) ||
      countryFromWebsite(website) ||
      addr.prefixCountry ||
      countryFromPostcode(addr.postcode, addr.city) ||
      countryFromCity(addr.city) ||
      null;

    const old = prior[`${name}|${addressParts}`.toLowerCase()];
    rows.push({
      name,
      address: addressParts,
      postcode: addr.postcode,
      city: addr.city,
      // Trust a previously-resolved country (may have been fixed by the geocoder).
      country: (old && old.latitude && old.country) || country,
      bidetType: model,
      phone: phone || undefined,
      website: website || undefined,
      sourceUrl: SOURCE_URL,
      sourceQuote: `TOTO "Try WASHLET" finder: ${model} in the guest toilet`,
      ...(old && old.latitude ? { latitude: old.latitude, longitude: old.longitude } : {}),
      ...(old && old.closed ? { closed: old.closed } : {}),
    });
  }

  // Report unresolved countries so they can be spot-fixed.
  const noCountry = rows.filter((r) => !r.country);
  const byCountry = rows.reduce((a, r) => {
    const k = r.country || '(unknown)';
    a[k] = (a[k] || 0) + 1;
    return a;
  }, {});

  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
  console.log(`Parsed ${rows.length} venues (skipped ${skippedNoAddress} without an address).`);
  console.log('By country:', byCountry);
  if (noCountry.length) {
    console.log(`\n${noCountry.length} rows still need a country (postcode ambiguous, no phone/website).`);
  }
  console.log(`\nWrote ${OUT}`);
}

main();
