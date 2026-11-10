/**
 * Viewport/search map data client. No full-seed download.
 */
(function (global) {
  const state = {
    ver: '',
    sessionReady: null,
    byId: new Map(),
    countries: [],
    total: 0,
  };

  function apiUrl(path, params) {
    const u = new URL(path, location.origin);
    if (params) {
      Object.keys(params).forEach((k) => {
        if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
          u.searchParams.set(k, String(params[k]));
        }
      });
    }
    return u.pathname + u.search;
  }

  async function getJson(path, params) {
    const res = await fetch(apiUrl(path, params), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.status === 401) {
      state.sessionReady = null;
      await ensureSession();
      const retry = await fetch(apiUrl(path, params), {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!retry.ok) throw new Error('Map API ' + retry.status);
      return retry.json();
    }
    if (!res.ok) throw new Error('Map API ' + res.status);
    return res.json();
  }

  function ensureSession() {
    if (state.sessionReady) return state.sessionReady;
    state.sessionReady = getJson('/api/session')
      .then((data) => {
        state.ver = data.ver || '';
        global.__BIDET_SEED_VER = state.ver;
        return data;
      })
      .catch((err) => {
        state.sessionReady = null;
        throw err;
      });
    return state.sessionReady;
  }

  function mergeSpots(spots) {
    if (!Array.isArray(spots)) return [];
    const out = [];
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      if (!s || !s.id) continue;
      state.byId.set(s.id, s);
      out.push(s);
    }
    return out;
  }

  function allCached() {
    return Array.from(state.byId.values());
  }

  async function loadMeta() {
    await ensureSession();
    const data = await getJson('/api/meta');
    state.countries = data.countries || [];
    state.total = data.total || 0;
    state.ver = data.ver || state.ver;
    return data;
  }

  async function loadSpotsForBounds(bounds, zoom) {
    if (!bounds) return [];
    await ensureSession();
    const west = bounds.getWest();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const north = bounds.getNorth();
    const data = await getJson('/api/spots', {
      west: west.toFixed(5),
      south: south.toFixed(5),
      east: east.toFixed(5),
      north: north.toFixed(5),
      z: Math.round(zoom || 10),
    });
    return mergeSpots(data.spots || []);
  }

  async function search(q, opts) {
    await ensureSession();
    const data = await getJson('/api/search', {
      q: q || '',
      country: (opts && opts.country) || '',
      limit: (opts && opts.limit) || 40,
    });
    return mergeSpots(data.spots || []);
  }

  async function loadSpot(id) {
    if (!id) return null;
    if (state.byId.has(id)) return state.byId.get(id);
    await ensureSession();
    const data = await getJson('/api/spot', { id });
    if (data.spot) mergeSpots([data.spot]);
    return data.spot || null;
  }

  global.BidetBudMapApi = {
    ensureSession,
    loadMeta,
    loadSpotsForBounds,
    search,
    loadSpot,
    mergeSpots,
    allCached,
    get ver() { return state.ver; },
    get countries() { return state.countries; },
    get total() { return state.total; },
    get size() { return state.byId.size; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
