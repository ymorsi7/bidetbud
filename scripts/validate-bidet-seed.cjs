#!/usr/bin/env node
/**
 * Validate bidet full + slim seed. Exit 1 on errors (npm test).
 *   node scripts/validate-bidet-seed.cjs
 *   node scripts/validate-bidet-seed.cjs --warn-only   # duplicates / none coords as warnings only
 */
const fs = require('fs');
const path = require('path');
const { readSeed, slimRow, SEED_JSON, FULL_JSON } = require('./lib/bidet-seed.cjs');

const warnOnly = process.argv.includes('--warn-only');
const MAP_STATUSES = new Set(['verified', 'warmed', 'internet']);
const NEEDS_SOURCE = new Set(['warmed', 'internet']);

const errors = [];
const warnings = [];

function err(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

function normName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCoord(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
}

function haversineM(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function slimKey(row) {
  return `${row.name}|${String(row.latitude)}|${String(row.longitude)}`;
}

const full = readSeed();
if (!Array.isArray(full)) {
  err('Full seed is not an array');
  process.exit(1);
}

let slim = [];
if (fs.existsSync(SEED_JSON)) {
  slim = JSON.parse(fs.readFileSync(SEED_JSON, 'utf8'));
}
const slimByKey = new Map(slim.map((r) => [slimKey(r), r]));

for (let i = 0; i < full.length; i++) {
  const r = full[i];
  const label = r.name || `(row ${i})`;
  const status = r.bidetStatus;
  const lat = parseCoord(r.latitude);
  const lng = parseCoord(r.longitude);
  const onMap = MAP_STATUSES.has(status);

  if (onMap) {
    if (!r.name || !String(r.name).trim()) err(`${label}: missing name (mappable)`);
    if (!r.country || !String(r.country).trim()) err(`${label}: missing country`);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) err(`${label}: invalid lat/lon`);
    else if (lat < -90 || lat > 90 || lng < -180 || lng > 180) err(`${label}: lat/lon out of range`);
    else if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) err(`${label}: coords at 0,0`);
    if (NEEDS_SOURCE.has(status) && !(r.sourceUrl && String(r.sourceUrl).trim())) {
      err(`${label}: ${status} missing sourceUrl`);
    }
    const sk = slimKey(slimRow(r));
    if (!slimByKey.has(sk)) {
      err(`${label}: missing from bidet-seed.json (slim drift)`);
    }
  } else if (status === 'none') {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      warn(`${label}: none status with bad coords`);
    }
  }
}

// Near-duplicates among mappable rows
const mappable = full.filter((r) => MAP_STATUSES.has(r.bidetStatus));
const byNorm = new Map();
for (const r of mappable) {
  const nn = normName(r.name);
  if (!nn) continue;
  const lat = parseCoord(r.latitude);
  const lng = parseCoord(r.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  if (!byNorm.has(nn)) byNorm.set(nn, []);
  byNorm.get(nn).push({ name: r.name, lat, lng, country: r.country });
}

for (const [nn, list] of byNorm) {
  if (list.length < 2) continue;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const d = haversineM(
        { lat: list[i].lat, lng: list[i].lng },
        { lat: list[j].lat, lng: list[j].lng }
      );
      if (d <= 100) {
        warn(`Near-duplicate (~${Math.round(d)}m): "${list[i].name}" vs "${list[j].name}" (${list[i].country})`);
      }
    }
  }
}

const slimCount = slim.filter((r) => MAP_STATUSES.has(r.bidetStatus)).length;
const fullMapCount = mappable.length;
if (slim.length && slimCount !== fullMapCount) {
  err(`Slim mappable count ${slimCount} != full ${fullMapCount}`);
}

console.log(`Validated ${full.length} full rows (${fullMapCount} on map), ${slim.length} slim rows.`);

if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  warnings.slice(0, 40).forEach((w) => console.log('  -', w));
  if (warnings.length > 40) console.log(`  … and ${warnings.length - 40} more`);
}

if (errors.length) {
  console.error(`\nErrors (${errors.length}):`);
  errors.slice(0, 50).forEach((e) => console.error('  -', e));
  if (errors.length > 50) console.error(`  … and ${errors.length - 50} more`);
  process.exit(1);
}

if (warnings.length && !warnOnly) {
  console.error('\nTreat warnings as failures (use --warn-only to ignore).');
  process.exit(1);
}

console.log('OK');
