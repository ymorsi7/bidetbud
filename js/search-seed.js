/**
 * Seed normalization + search scoring (loaded before app.js).
 */
(function (global) {
  const SEARCH_STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'at', 'in', 'on', 'for', 'to', '&']);

  // Two-letter USPS codes: never treat these as a city/name dump.
  const REGION_CODES = new Set(
    'al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc'
      .split(' ')
  );

  // Nicknames / metros used as search queries (NYC chip, "bay area", etc.).
  const CITY_QUERY_ALIASES = {
    nyc: [
      'new york',
      'brooklyn',
      'queens',
      'bronx',
      'manhattan',
      'staten island',
      'astoria',
      'williamsburg',
      'long island city',
      'flushing',
      'jackson heights',
      'sunset park',
    ],
    ny: null,
    'new york city': ['new york', 'nyc'],
    'new york': ['new york', 'brooklyn', 'queens', 'bronx', 'manhattan', 'staten island'],
    manhattan: ['new york', 'manhattan'],
    brooklyn: ['brooklyn'],
    williamsburg: ['williamsburg', 'brooklyn'],
    'sunset park': ['sunset park', 'brooklyn'],
    'bay area': [
      'san francisco',
      'oakland',
      'berkeley',
      'san jose',
      'palo alto',
      'mountain view',
      'cupertino',
      'fremont',
      'san mateo',
      'sunnyvale',
      'santa clara',
      'daly city',
      'redwood city',
    ],
    sf: ['san francisco'],
    'san fran': ['san francisco'],
    'san francisco': ['san francisco'],
    la: ['los angeles'],
    'los angeles': ['los angeles'],
    dfw: ['dallas', 'fort worth', 'richardson', 'plano', 'irving', 'frisco', 'arlington', 'coppell', 'garland', 'carrollton', 'addison'],
    dallas: null,
    chi: ['chicago'],
    chicago: ['chicago'],
  };
  CITY_QUERY_ALIASES.ny = CITY_QUERY_ALIASES.nyc;
  CITY_QUERY_ALIASES.dallas = CITY_QUERY_ALIASES.dfw;

  // Too generic to use as a name prefix ("san" → every San Juan / San Bidet alias).
  const WEAK_NAME_PREFIX = new Set([
    'san',
    'santa',
    'new',
    'los',
    'las',
    'el',
    'la',
    'st',
    'saint',
    'fort',
    'north',
    'south',
    'east',
    'west',
    'hotel',
    'city',
    'center',
    'centre',
  ]);

  const PLACE_PHRASES = [];
  Object.keys(CITY_QUERY_ALIASES).forEach((key) => {
    PLACE_PHRASES.push(key);
    (CITY_QUERY_ALIASES[key] || []).forEach((v) => PLACE_PHRASES.push(v));
  });
  PLACE_PHRASES.sort((a, b) => b.length - a.length);
  const PLACE_PHRASE_SET = new Set(PLACE_PHRASES);

  function isPlaceOnlyQuery(q) {
    return Boolean(metroCities(q) || PLACE_PHRASE_SET.has(q));
  }

  function stableSeedId(row) {
    const s = (row.name || '') + '|' + row.latitude + '|' + row.longitude;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return 'seed_' + Math.abs(h).toString(36);
  }

  function normalizeSearchText(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function nameWords(name) {
    return normalizeSearchText(name).split(' ').filter((w) => w && !SEARCH_STOP.has(w));
  }

  function significantTokens(q) {
    return q.split(' ').filter((t) => t && !SEARCH_STOP.has(t));
  }

  function hasPhrase(hay, phrase) {
    if (!hay || !phrase) return false;
    if (hay === phrase) return true;
    return (' ' + hay + ' ').indexOf(' ' + phrase + ' ') !== -1;
  }

  function canonicalName(name) {
    return normalizeSearchText(String(name || '').replace(/\s+\([^)]*\)\s*$/, ''));
  }

  function cityPrimaryOf(city) {
    return normalizeSearchText(String(city || '').split(',')[0]);
  }

  function compactText(s) {
    return String(s || '').replace(/\s/g, '');
  }

  function buildSearchMeta(m) {
    const words = nameWords(m.name);
    const acronym = words.map((w) => w[0]).join('');
    const name = normalizeSearchText(m.name);
    const canon = canonicalName(m.name);
    const city = normalizeSearchText(m.city);
    const cityPrimary = cityPrimaryOf(m.city);
    const address = normalizeSearchText(m.address);
    const country = normalizeSearchText(m.country);
    const aliasPhrases = [];
    const aliasCompacts = [];
    if (m.searchAliases) {
      String(m.searchAliases)
        .split(/[,;|]/)
        .forEach((a) => {
          const phrase = normalizeSearchText(a);
          if (!phrase) return;
          aliasPhrases.push(phrase);
          aliasCompacts.push(compactText(phrase));
        });
    }
    const hay = [name, canon, city, address, country, normalizeSearchText(m.bidetType)]
      .concat(aliasPhrases)
      .filter(Boolean)
      .join(' ');
    return {
      hay,
      words,
      acronym,
      aliasPhrases,
      aliasCompacts,
      name,
      canon,
      city,
      cityPrimary,
      address,
      country,
    };
  }

  function ensureSearchMeta(m) {
    if (!m._search) m._search = buildSearchMeta(m);
  }

  function metroCities(q) {
    if (!q) return null;
    const compact = compactText(q);
    return CITY_QUERY_ALIASES[q] || CITY_QUERY_ALIASES[compact] || null;
  }

  function cityHitsList(cityPrimary, list) {
    if (!cityPrimary || !list) return false;
    return list.some((a) => cityPrimary === a || cityPrimary.startsWith(a + ' ') || hasPhrase(cityPrimary, a));
  }

  function placeScore(s, placeQ) {
    if (!placeQ) return 0;
    if (placeQ.length < 2) return 0;
    const compact = compactText(placeQ);
    if (placeQ.length === 2 && REGION_CODES.has(placeQ) && !metroCities(placeQ)) return 0;

    const metro = metroCities(placeQ);
    if (metro && cityHitsList(s.cityPrimary, metro)) return 94;

    if (s.cityPrimary === placeQ) return 94;
    if (placeQ.length >= 4 && s.cityPrimary.startsWith(placeQ)) return 88;
    if (s.country === placeQ || (placeQ.length >= 3 && hasPhrase(s.country, placeQ))) return 52;
    return 0;
  }

  function nameScore(s, q) {
    if (!q) return 0;
    const compact = compactText(q);
    if (q.length === 1) return 0;
    if (q.length === 2 && REGION_CODES.has(q) && !s.aliasCompacts.includes(q)) return 0;

    if (s.name === q || s.canon === q) return 100;
    if (s.aliasPhrases.some((a) => a === q)) return 100;
    if (compact.length >= 2 && s.aliasCompacts.includes(compact)) return 100;

    const strongPrefix = q.length >= 4 && !WEAK_NAME_PREFIX.has(q);
    if (strongPrefix && (hasPhrase(s.name, q) || hasPhrase(s.canon, q)) && (s.name.startsWith(q) || s.canon.startsWith(q))) return 90;
    if (strongPrefix && s.aliasPhrases.some((a) => hasPhrase(a, q) && a.startsWith(q))) return 92;
    // 3-letter brand prefixes ("mas", "icc") must be a whole first word, not "san…".
    if (
      q.length === 3 &&
      !WEAK_NAME_PREFIX.has(q) &&
      (s.name.split(' ')[0] === q || s.canon.split(' ')[0] === q)
    ) {
      return 90;
    }

    if (q.length >= 4 && !WEAK_NAME_PREFIX.has(q) && (hasPhrase(s.name, q) || hasPhrase(s.canon, q))) return 86;
    if (q.length >= 4 && !WEAK_NAME_PREFIX.has(q) && s.aliasPhrases.some((a) => hasPhrase(a, q))) return 86;

    if ((q.length >= 5 || (q.length >= 3 && /\d/.test(q))) && hasPhrase(s.address, q)) return 74;

    if (compact.length >= 3 && compact.length <= 6 && !q.includes(' ') && !metroCities(compact)) {
      if (s.acronym === compact) return 82;
    }

    const tokens = significantTokens(q);
    if (tokens.length > 1) {
      const hayWords = s.hay.split(' ');
      const ok = tokens.every((t) =>
        hayWords.some((w) => w === t || (t.length >= 3 && w.startsWith(t)) || (w.length >= 3 && t.startsWith(w)))
      );
      if (ok) return 68;
    } else if (tokens.length === 1 && tokens[0].length >= 4) {
      const t = tokens[0];
      const nameHay = (s.canon + ' ' + s.name + ' ' + s.aliasPhrases.join(' ')).split(' ');
      if (nameHay.some((w) => w === t || w.startsWith(t))) return 70;
    }
    return 0;
  }

  function possibleSplits(q) {
    const out = [];
    const seen = new Set();
    function add(nameQ, placeQ) {
      if (!placeQ) return;
      const key = nameQ + '|' + placeQ;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ nameQ, placeQ });
    }

    for (let i = 0; i < PLACE_PHRASES.length; i++) {
      const phrase = PLACE_PHRASES[i];
      if (q === phrase) {
        add('', phrase);
        break;
      }
      if (q.endsWith(' ' + phrase)) {
        add(q.slice(0, q.length - phrase.length - 1).trim(), phrase);
        break;
      }
    }

    const tokens = significantTokens(q);
    if (tokens.length >= 2) {
      add(tokens.slice(0, -1).join(' '), tokens[tokens.length - 1]);
      if (tokens.length >= 3) add(tokens.slice(0, -2).join(' '), tokens.slice(-2).join(' '));
    }
    return out;
  }

  function scoreParts(m, rawQ) {
    const q = normalizeSearchText(rawQ);
    const empty = { name: 0, place: 0, combined: 0, best: 0, q };
    if (!q || q.length < 2) return empty;
    const sig = significantTokens(q);
    if (!sig.length) return empty;
    ensureSearchMeta(m);
    const s = m._search;
    const place = placeScore(s, q);
    if (isPlaceOnlyQuery(q)) {
      return { name: 0, place, combined: 0, best: place, q };
    }
    const name = nameScore(s, q);
    let combined = 0;
    const splits = possibleSplits(q);
    for (let i = 0; i < splits.length; i++) {
      const nameQ = splits[i].nameQ;
      const placeQ = splits[i].placeQ;
      if (!nameQ || !placeQ) continue;
      if (placeQ.length < 2) continue;
      if (placeQ.length === 2 && !metroCities(placeQ)) continue;
      const ns = nameScore(s, nameQ);
      const ps = placeScore(s, placeQ);
      if (ns > 0 && ps > 0) {
        const next = ns >= 70 && ps >= 80 ? 100 : Math.min(98, ns + 8);
        if (next > combined) combined = next;
      }
    }
    return { name, place, combined, best: Math.max(name, place, combined), q };
  }

  function searchScore(m, rawQ) {
    return scoreParts(m, rawQ).best;
  }

  function searchNameScore(m, rawQ) {
    const p = scoreParts(m, rawQ);
    return Math.max(p.name, p.combined);
  }

  function matchesSearch(m, rawQ) {
    return searchScore(m, rawQ) > 0;
  }

  function matchesNameSearch(m, rawQ) {
    return searchNameScore(m, rawQ) > 0;
  }

  function cityMatchesQuery(city, rawQ) {
    const q = normalizeSearchText(rawQ);
    if (!q) return false;
    const fake = {
      cityPrimary: cityPrimaryOf(city),
      city: normalizeSearchText(city),
      name: '',
      canon: '',
      address: '',
      country: '',
      acronym: '',
      aliasPhrases: [],
      aliasCompacts: [],
      words: [],
      hay: cityPrimaryOf(city),
    };
    return placeScore(fake, q) > 0;
  }

  function haversineMiles(a, b) {
    const R = 3959;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function medianCoord(values) {
    const s = values.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  function searchFitRows(rows, q, anchor) {
    if (!rows || !rows.length) return [];
    const scored = rows
      .map((m) => ({ m, score: searchScore(m, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!scored.length) return rows.slice(0, 25);
    const best = scored[0].score;
    const top = scored.filter((x) => x.score >= best - 3).map((x) => x.m);
    if (top.length <= 1) return top;
    const sample = top.slice(0, 40);
    const clusterAround = (center) =>
      sample.filter((m) => haversineMiles(center, { lat: +m.latitude, lng: +m.longitude }) < 80);
    const median = {
      lat: medianCoord(sample.map((m) => +m.latitude)),
      lng: medianCoord(sample.map((m) => +m.longitude)),
    };
    const medianCluster = clusterAround(median);
    if (medianCluster.length >= Math.max(2, Math.ceil(sample.length * 0.5))) return medianCluster;
    if (anchor && Number.isFinite(+anchor.lat) && Number.isFinite(+anchor.lng)) {
      const near = clusterAround({ lat: +anchor.lat, lng: +anchor.lng });
      if (near.length) return near;
      let nearest = sample[0];
      let bestD = Infinity;
      for (let i = 0; i < sample.length; i++) {
        const d = haversineMiles(anchor, { lat: +sample[i].latitude, lng: +sample[i].longitude });
        if (d < bestD) {
          bestD = d;
          nearest = sample[i];
        }
      }
      return [nearest];
    }
    return sample.slice(0, 25);
  }

  function normalizeSeed(row) {
    const s = row.bidetStatus;
    let defaultType = 'Verified bidet';
    if (s === 'warmed') defaultType = 'Heated seat';
    else if (s === 'internet') defaultType = 'Web source';
    else if (s === 'none') defaultType = '';
    const access = row.access === 'limited' ? 'limited' : 'public';
    return {
      id: stableSeedId(row),
      name: row.name,
      address: row.address || '',
      latitude: String(row.latitude),
      longitude: String(row.longitude),
      city: row.city || '',
      country: row.country || '',
      type: row.type || 'mosque',
      bidetStatus: s,
      bidetType: row.bidetType || defaultType,
      sourceUrl: row.sourceUrl || '',
      sourceQuote: row.sourceQuote || '',
      verifiedMethod: row.verifiedMethod || '',
      searchAliases: row.searchAliases || '',
      access,
      accessNote: access === 'limited' ? row.accessNote || 'Not a regular public restroom' : '',
      closed: !!(row.closed === true || row.closed === 'true' || row.closed === 1),
      photos: Array.isArray(row.photos)
        ? row.photos.map((p) => String(p || '').trim()).filter(Boolean).slice(0, 6)
        : [],
    };
  }

  global.BidetBudSearch = {
    stableSeedId,
    normalizeSeed,
    normalizeSearchText,
    buildSearchMeta,
    ensureSearchMeta,
    searchScore,
    searchNameScore,
    matchesSearch,
    matchesNameSearch,
    cityMatchesQuery,
    searchFitRows,
    CITY_QUERY_ALIASES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
