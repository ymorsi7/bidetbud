/**
 * Cross-reference halal venues with BidetBud seed (restaurant/hotel bidets).
 */
const { readSeed } = require('./bidet-seed.cjs');

const HAS_BIDET = new Set(['verified', 'warmed', 'internet']);
const STOP = new Set(['the', 'and', 'halal', 'restaurant', 'cafe', 'coffee', 'kitchen', 'grill', 'bar']);

function stableBidetId(row) {
  const s = `${row.name || ''}|${row.latitude}|${row.longitude}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `seed_${Math.abs(h).toString(36)}`;
}

function haversineMeters(a, b) {
  if (!isFinite(a.lat) || !isFinite(a.lng) || !isFinite(b.lat) || !isFinite(b.lng)) return Infinity;
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function normName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(name) {
  return normName(name)
    .split(' ')
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function namesSimilar(a, b) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  let overlap = 0;
  for (const w of ta) if (tb.includes(w)) overlap++;
  if (!overlap) return false;
  const na = normName(a);
  const nb = normName(b);
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return overlap / Math.min(ta.length, tb.length) >= 0.45;
}

function isFacilityToilet(name) {
  return /\b(toilet|restroom|washroom|bathroom|male|female|wc|urinal)\b/i.test(String(name || ''));
}

function explicitBidetInQuote(quote) {
  return /\b(bidet|washlet|shattaf|sprayer|toto|neorest|aqualclean)\b/i.test(String(quote || ''));
}

function bidetTypeLabel(b) {
  if (b.bidetType) return b.bidetType;
  if (b.bidetStatus === 'warmed') return 'Heated seat / washlet';
  if (b.bidetStatus === 'verified') return 'Verified bidet';
  return 'Bidet (web source)';
}

function buildBidetGrid(bidets, cellDeg = 0.00045) {
  const grid = new Map();
  for (const b of bidets) {
    const lat = +b.latitude;
    const lng = +b.longitude;
    if (!isFinite(lat) || !isFinite(lng)) continue;
    const key = `${Math.floor(lat / cellDeg)}:${Math.floor(lng / cellDeg)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(b);
  }
  return { grid, cellDeg };
}

function nearbyFromGrid(grid, cellDeg, lat, lng) {
  const ci = Math.floor(lat / cellDeg);
  const cj = Math.floor(lng / cellDeg);
  const out = [];
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const list = grid.get(`${ci + di}:${cj + dj}`);
      if (list) out.push(...list);
    }
  }
  return out;
}

function matchHalalToBidet(halalRow, grid, bidets) {
  if (explicitBidetInQuote(halalRow.sourceQuote)) {
    return {
      hasBidet: true,
      bidetType: 'Bidet (source evidence)',
      bidetStatus: 'internet',
      bidetMatch: 'source-quote',
    };
  }

  const lat = +halalRow.latitude;
  const lng = +halalRow.longitude;
  if (!isFinite(lat) || !isFinite(lng)) return null;

  const candidates = grid ? nearbyFromGrid(grid.grid, grid.cellDeg, lat, lng) : bidets;
  const here = { lat, lng };
  let best = null;
  let bestScore = -Infinity;

  for (const b of candidates) {
    if (!HAS_BIDET.has(b.bidetStatus)) continue;
    if (b.type !== 'restaurant' && b.type !== 'hotel') continue;
    if (isFacilityToilet(b.name)) continue;

    const d = haversineMeters(here, { lat: +b.latitude, lng: +b.longitude });
    if (d > 50) continue;

    const sim = namesSimilar(halalRow.name, b.name);
    if (d > 25 && !sim) continue;
    if (d > 15 && !sim) continue;

    const score = (sim ? 1000 : 0) - d;
    if (score > bestScore) {
      bestScore = score;
      best = { b, d, sim };
    }
  }

  if (!best || (best.d > 15 && !best.sim)) return null;

  return {
    hasBidet: true,
    bidetType: bidetTypeLabel(best.b),
    bidetStatus: best.b.bidetStatus,
    bidetSpotId: stableBidetId(best.b),
    bidetName: best.b.name,
    bidetMatch: 'bidetbud',
    bidetDistanceM: Math.round(best.d),
  };
}

function attachBidetMatches(halalRows, bidetRows) {
  const bidets = (bidetRows || []).filter(
    (b) => HAS_BIDET.has(b.bidetStatus) && (b.type === 'restaurant' || b.type === 'hotel'),
  );
  const grid = buildBidetGrid(bidets);
  let matched = 0;

  const out = halalRows.map((row) => {
    const hit = matchHalalToBidet(row, grid, bidets);
    if (!hit) {
      const { hasBidet, bidetType, bidetStatus, bidetSpotId, bidetName, bidetMatch, bidetDistanceM, ...rest } =
        row;
      return rest;
    }
    matched++;
    return { ...row, ...hit };
  });

  return { rows: out, matched, bidetCandidates: bidets.length };
}

function loadBidetRows() {
  try {
    return readSeed();
  } catch {
    return [];
  }
}

module.exports = {
  attachBidetMatches,
  loadBidetRows,
  stableBidetId,
  namesSimilar,
};
