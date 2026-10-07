/**
 * Seed normalization + search scoring (loaded before app.js).
 */
(function (global) {
  const SEARCH_STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'at', 'in', 'on', 'for', 'to', '&']);

  // Nicknames / metros used as search queries (NYC chip, "bay area", etc.).
  const CITY_QUERY_ALIASES = {
    nyc: ['new york', 'brooklyn', 'queens', 'bronx', 'manhattan', 'staten island', 'astoria', 'williamsburg', 'long island city', 'flushing', 'jackson heights', 'sunset park'],
    'new york city': ['new york', 'nyc'],
    'new york': ['nyc'],
    'bay area': ['san francisco', 'oakland', 'berkeley', 'san jose', 'palo alto', 'mountain view', 'cupertino', 'fremont', 'san mateo', 'sunnyvale', 'santa clara', 'daly city', 'redwood city'],
    sf: ['san francisco'],
    'san fran': ['san francisco'],
    la: ['los angeles'],
    dfw: ['dallas', 'fort worth', 'richardson', 'plano', 'irving', 'frisco', 'arlington'],
    chi: ['chicago'],
  };

  function stableSeedId(row) {
    const s = (row.name || '') + '|' + row.latitude + '|' + row.longitude;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return 'seed_' + Math.abs(h).toString(36);
  }

  function normalizeSearchText(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function nameWords(name) {
    return normalizeSearchText(name).split(' ').filter((w) => w && !SEARCH_STOP.has(w));
  }

  function hasPhrase(hay, phrase) {
    if (!hay || !phrase) return false;
    if (hay === phrase) return true;
    return (' ' + hay + ' ').indexOf(' ' + phrase + ' ') !== -1;
  }

  function fieldBlob(m) {
    ensureSearchMeta(m);
    return m._search;
  }

  function buildSearchMeta(m) {
    const words = nameWords(m.name);
    const acronym = words.map((w) => w[0]).join('');
    const name = normalizeSearchText(m.name);
    const city = normalizeSearchText(m.city);
    const address = normalizeSearchText(m.address);
    const country = normalizeSearchText(m.country);
    const hay = [name, city, address, country, normalizeSearchText(m.bidetType), normalizeSearchText(m.searchAliases)]
      .filter(Boolean)
      .join(' ');
    const aliases = new Set([acronym]);
    if (m.searchAliases) {
      String(m.searchAliases)
        .split(/[,;|]/)
        .forEach((a) => {
          const t = normalizeSearchText(a).replace(/\s/g, '');
          if (t) aliases.add(t);
        });
    }
    return { hay, words, acronym, aliases: [...aliases], name, city, address, country };
  }

  function matchesInitials(words, compact) {
    if (!compact) return false;
    let wi = 0;
    for (let i = 0; i < compact.length; i++) {
      while (wi < words.length && words[wi][0] !== compact[i]) wi++;
      if (wi >= words.length) return false;
      wi++;
    }
    return true;
  }

  function ensureSearchMeta(m) {
    if (!m._search) m._search = buildSearchMeta(m);
  }

  function aliasHits(s, q) {
    const aliases = CITY_QUERY_ALIASES[q];
    if (!aliases) return false;
    const blob = s.city + ' ' + s.address + ' ' + s.name;
    return aliases.some((a) => hasPhrase(blob, a) || blob.indexOf(a) !== -1);
  }

  function searchScore(m, rawQ) {
    const q = normalizeSearchText(rawQ);
    if (!q) return 0;
    ensureSearchMeta(m);
    const s = m._search;
    const compact = q.replace(/\s/g, '');
    const name = s.name;
    const city = s.city;

    if (name === q) return 100;
    if (hasPhrase(name, q) && name.startsWith(q)) return 92;

    if (city === q || hasPhrase(city, q) || city.startsWith(q + ' ') || city.startsWith(q + ',')) return 96;
    if (aliasHits(s, q) || aliasHits(s, compact)) return 95;

    if (hasPhrase(name, q)) return 88;
    if (hasPhrase(s.address, q)) return 74;
    if (s.country === q || hasPhrase(s.country, q)) return 52;

    if (compact.length >= 2 && compact.length <= 6 && !q.includes(' ') && !CITY_QUERY_ALIASES[compact]) {
      if (s.acronym === compact) return 100;
      if (s.aliases.some((a) => a === compact)) return 98;
      if (compact.length <= 3 && s.acronym.startsWith(compact)) return 80;
      if (compact.length <= 3 && s.aliases.some((a) => a.startsWith(compact))) return 78;
      if (compact.length <= 4 && matchesInitials(s.words, compact)) return 75;
    }

    const tokens = q.split(' ').filter(Boolean);
    if (tokens.length > 1) {
      const hayWords = s.hay.split(' ');
      if (tokens.every((t) => hayWords.some((w) => w === t || w.startsWith(t)))) return 68;
    }
    return 0;
  }

  function matchesSearch(m, rawQ) {
    return searchScore(m, rawQ) > 0;
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
    };
  }

  global.BidetBudSearch = {
    stableSeedId,
    normalizeSeed,
    normalizeSearchText,
    buildSearchMeta,
    ensureSearchMeta,
    searchScore,
    matchesSearch,
    CITY_QUERY_ALIASES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
