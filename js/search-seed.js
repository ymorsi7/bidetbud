/**
 * Seed normalization + search scoring (loaded before app.js).
 */
(function (global) {
  const SEARCH_STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'at', 'in', 'on', 'for', 'to', '&']);

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

  function buildSearchMeta(m) {
    const words = nameWords(m.name);
    const acronym = words.map((w) => w[0]).join('');
    const hay = normalizeSearchText(
      [m.name, m.city, m.address, m.country, m.bidetType, m.searchAliases].filter(Boolean).join(' ')
    );
    const aliases = new Set([acronym]);
    if (m.searchAliases) {
      String(m.searchAliases)
        .split(/[,;|]/)
        .forEach((a) => {
          const t = normalizeSearchText(a).replace(/\s/g, '');
          if (t) aliases.add(t);
        });
    }
    return { hay, words, acronym, aliases: [...aliases] };
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

  function searchScore(m, rawQ) {
    const q = normalizeSearchText(rawQ);
    if (!q) return 0;
    ensureSearchMeta(m);
    const s = m._search;
    const compact = q.replace(/\s/g, '');
    if (s.hay.includes(q)) {
      if (s.hay.startsWith(q)) return 90;
      if (normalizeSearchText(m.name).startsWith(q)) return 85;
      return 70;
    }
    if (compact.length >= 2) {
      if (s.acronym === compact) return 100;
      if (s.aliases.some((a) => a === compact)) return 98;
      if (s.acronym.startsWith(compact)) return 88;
      if (s.aliases.some((a) => a.startsWith(compact))) return 86;
      if (matchesInitials(s.words, compact)) return 75;
    }
    const tokens = q.split(' ').filter(Boolean);
    if (tokens.length > 1) {
      const hayWords = s.hay.split(' ');
      if (tokens.every((t) => hayWords.some((w) => w.startsWith(t)))) return 65;
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
  };
})(typeof window !== 'undefined' ? window : globalThis);
