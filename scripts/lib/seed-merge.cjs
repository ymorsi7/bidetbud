/**
 * Shared dedupe + merge for import scripts.
 *
 * Matches the rules the older per-region importers grew independently: skip a row
 * when the same name sits on the same coordinates, when the same sourceUrl already
 * backs a row with that name, or when a near-identical name sits within ~3 km.
 */
function normName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function coordKey(row) {
  return [normName(row.name), Number(row.latitude).toFixed(5), Number(row.longitude).toFixed(5)].join(
    '|'
  );
}

function evidenceKey(row) {
  return [row.sourceUrl || '', normName(row.name)].join('|');
}

function isNearDuplicate(existing, candidate) {
  if (existing.country !== candidate.country) return false;
  const a = normName(existing.name);
  const b = normName(candidate.name);
  if (a === b) return true;
  const min = Math.min(a.length, b.length, 14);
  if (min >= 8 && (a.includes(b.slice(0, min)) || b.includes(a.slice(0, min)))) {
    const dLat = Math.abs(Number(existing.latitude) - Number(candidate.latitude));
    const dLon = Math.abs(Number(existing.longitude) - Number(candidate.longitude));
    if (dLat < 0.03 && dLon < 0.03) return true;
  }
  return false;
}

/**
 * Merge candidate rows into the existing seed.
 * `accept` may return false to drop a row before dedupe runs.
 */
function mergeIntoSeed(existing, candidates, { accept = () => true } = {}) {
  const merged = [...existing];
  const seenCoords = new Set(existing.map(coordKey));
  const seenEvidence = new Set(existing.filter((r) => r.sourceUrl).map(evidenceKey));
  const byCountry = new Map();
  for (const row of merged) {
    if (!byCountry.has(row.country)) byCountry.set(row.country, []);
    byCountry.get(row.country).push(row);
  }

  let added = 0;
  let skipped = 0;

  for (const row of candidates) {
    if (!row || !row.latitude || !row.longitude || !row.sourceUrl || !accept(row)) {
      skipped++;
      continue;
    }
    if (seenCoords.has(coordKey(row)) || seenEvidence.has(evidenceKey(row))) {
      skipped++;
      continue;
    }
    const neighbours = byCountry.get(row.country) || [];
    if (neighbours.some((e) => isNearDuplicate(e, row))) {
      skipped++;
      continue;
    }
    seenCoords.add(coordKey(row));
    seenEvidence.add(evidenceKey(row));
    if (!byCountry.has(row.country)) byCountry.set(row.country, []);
    byCountry.get(row.country).push(row);
    merged.push(row);
    added++;
  }

  return { merged, added, skipped };
}

module.exports = { normName, coordKey, evidenceKey, isNearDuplicate, mergeIntoSeed };
