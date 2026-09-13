/**
 * Map community / crawl remarks to access: "public" vs "limited".
 * Handicap-only stalls in malls, food courts, and masajid are still public venues.
 */

function mapSingaporeAccess(remarks) {
  const r = String(remarks || '').toLowerCase();
  if (
    /hotel room|all rooms|members only|staff only|employees only|guest room|guests only|private club|showroom only|google employees/.test(
      r
    )
  ) {
    return 'limited';
  }
  return 'public';
}

const PRIVATE_VENUE =
  /\b(hotel|apartment|residence|residential|klinikum|clinic|hospital|googleplex|employees only|guest room|guests only|members only)\b/i;

/** Promote or demote access on existing seed rows when evidence supports it. */
function normalizeRowAccess(row) {
  const out = { ...row };
  const note = String(out.accessNote || '').trim();
  const quote = String(out.sourceQuote || '');

  if (
    out.country === 'Singapore' &&
    out.verifiedMethod === 'community-sighting'
  ) {
    const next = mapSingaporeAccess(note);
    if (next === 'public') {
      out.access = 'public';
      if (note && /handicap|accessible|male|female|level|stall|cubicle/i.test(note)) {
        out.accessNote = note;
      } else {
        delete out.accessNote;
      }
    } else {
      out.access = 'limited';
      if (note) out.accessNote = note;
    }
    return out;
  }

  if (
    out.access === 'limited' &&
    /dealer showroom|try a washlet during|toto showroom|washlet on display/i.test(
      note + quote
    )
  ) {
    out.access = 'public';
    return out;
  }

  if (
    out.type === 'public' &&
    out.access === 'limited' &&
    note &&
    /handicap|accessible toilet|male and female|male toilet|female toilet/i.test(
      note
    ) &&
    !/hotel|guest room|members only|staff only|employees only|not open to the public/.test(
      note
    )
  ) {
    out.access = 'public';
    return out;
  }

  if (
    out.type === 'public' &&
    out.access === 'limited' &&
    out.verifiedMethod === 'manufacturer-reference' &&
    !PRIVATE_VENUE.test(out.name) &&
    !PRIVATE_VENUE.test(note) &&
    /verify public access|not a general public restroom/i.test(note)
  ) {
    out.access = 'public';
    delete out.accessNote;
    return out;
  }

  return out;
}

module.exports = { mapSingaporeAccess, normalizeRowAccess };
