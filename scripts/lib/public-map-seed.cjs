/**
 * Build the browser-facing map rows: no evidence fields, no bidet-friendly
 * countries. This is what gets sealed for the API - never the research dump.
 */
const path = require('path');

const FRIENDLY = new Set([
  'japan', 'south korea', 'taiwan',
  'italy', 'greece',
  'turkey', 'syria', 'lebanon', 'jordan', 'palestine', 'iraq', 'iran', 'yemen',
  'saudi arabia', 'united arab emirates', 'uae', 'kuwait', 'qatar', 'bahrain', 'oman',
  'egypt', 'libya', 'tunisia', 'algeria', 'morocco', 'sudan',
  'india', 'pakistan', 'bangladesh', 'nepal', 'sri lanka', 'afghanistan',
  'malaysia', 'indonesia', 'thailand', 'vietnam', 'cambodia',
  'brunei', 'laos', 'myanmar', 'maldives', 'east timor',
  'argentina', 'uruguay', 'brazil',
].map((s) => s.toLowerCase()));

const HAS_BIDET = new Set(['verified', 'warmed', 'internet']);
const NO_BIDET = new Set(['none']);

function stableSeedId(row) {
  const s = (row.name || '') + '|' + row.latitude + '|' + row.longitude;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return 'seed_' + Math.abs(h).toString(36);
}

function isFriendlyCountry(country) {
  return FRIENDLY.has(String(country || '').trim().toLowerCase());
}

function publicRow(r) {
  const status = r.bidetStatus;
  if (!HAS_BIDET.has(status) && !NO_BIDET.has(status)) return null;
  if (isFriendlyCountry(r.country)) return null;
  const lat = String(r.latitude ?? '');
  const lng = String(r.longitude ?? '');
  if (!lat || !lng || !Number.isFinite(+lat) || !Number.isFinite(+lng)) return null;

  const access = r.access === 'limited' ? 'limited' : 'public';
  let bidetType = r.bidetType ? String(r.bidetType).slice(0, 80) : '';
  if (!bidetType) {
    if (status === 'warmed') bidetType = 'Heated seat';
    else if (status === 'internet') bidetType = 'Web source';
    else if (status === 'verified') bidetType = 'Verified bidet';
  }

  const out = {
    id: r.id || stableSeedId(r),
    name: r.name,
    latitude: lat,
    longitude: lng,
    bidetStatus: status,
    type: r.type || 'mosque',
    access,
  };
  if (r.address) out.address = String(r.address).slice(0, 160);
  if (r.city) out.city = String(r.city).slice(0, 80);
  if (r.country) out.country = String(r.country).slice(0, 56);
  if (bidetType) out.bidetType = bidetType;
  if (r.searchAliases) out.searchAliases = String(r.searchAliases).slice(0, 120);
  if (access === 'limited' && r.accessNote) out.accessNote = String(r.accessNote).slice(0, 80);
  if (r.closed === true || r.closed === 'true' || r.closed === 1) out.closed = true;
  return out;
}

function buildPublicSeed(rows) {
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const p = publicRow(row);
    if (!p) continue;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

function countryCounts(rows) {
  const counts = new Map();
  for (const r of rows) {
    const c = String(r.country || '').trim();
    if (!c) continue;
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 10)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, n]) => ({ name, n }));
}

function inBBox(r, west, south, east, north) {
  const lat = +r.latitude;
  const lng = +r.longitude;
  if (lat < south || lat > north) return false;
  if (west <= east) return lng >= west && lng <= east;
  return lng >= west || lng <= east;
}

function spotsInBBox(rows, { west, south, east, north, limit = 400 }) {
  const hit = [];
  for (const r of rows) {
    if (inBBox(r, west, south, east, north)) hit.push(r);
  }
  hit.sort((a, b) => {
    const pa = a.access === 'public' ? 0 : 1;
    const pb = b.access === 'public' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const rank = { verified: 0, warmed: 1, internet: 2, none: 3 };
    return (rank[a.bidetStatus] ?? 9) - (rank[b.bidetStatus] ?? 9);
  });
  return hit.slice(0, limit);
}

function nearestSpots(rows, lat, lng, limit = 80) {
  return rows
    .map((r) => {
      const dlat = +r.latitude - lat;
      const dlng = +r.longitude - lng;
      const accessPenalty = r.access === 'public' ? 0 : 1e9;
      return { r, d: accessPenalty + dlat * dlat + dlng * dlng };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.r);
}

module.exports = {
  FRIENDLY,
  isFriendlyCountry,
  publicRow,
  buildPublicSeed,
  countryCounts,
  inBBox,
  spotsInBBox,
  nearestSpots,
  stableSeedId,
  ENC_REL: path.join('netlify', 'functions', '_data', 'map-seed.enc'),
  META_REL: path.join('netlify', 'functions', '_data', 'map-meta.json'),
};
