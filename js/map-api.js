/**
 * Map data client. Loads the full public pin set once via /api/bootstrap
 * (session cookie + rate limit). No public bidet-seed.json dump.
 */
(function (global) {
  const state = {
    ver: '',
    sessionReady: null,
    byId: new Map(),
    countries: [],
    total: 0,
    bootstrapped: false,
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
    if (!res.ok) throw new Error('Map API ' + res.status);
    return res.json();
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

  function cacheKey(ver) {
    return 'bb_map_public_' + (ver || '0');
  }

  function readLocalCache() {
    try {
      const ver = localStorage.getItem('bb_map_public_ver') || '';
      if (!ver) return null;
      const raw = localStorage.getItem(cacheKey(ver));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.spots) || !data.spots.length) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function writeLocalCache(data) {
    try {
      localStorage.setItem('bb_map_public_ver', data.ver || '');
      localStorage.setItem(cacheKey(data.ver), JSON.stringify({
        ver: data.ver,
        total: data.total,
        countries: data.countries || [],
        spots: data.spots,
      }));
    } catch (e) { /* quota — ignore */ }
  }

  function applyBootstrap(data) {
    state.byId.clear();
    mergeSpots(data.spots || []);
    state.countries = data.countries || [];
    state.total = data.total || state.byId.size;
    state.ver = data.ver || '';
    state.bootstrapped = true;
    state.sessionReady = Promise.resolve({ ok: true, ver: state.ver });
    global.__BIDET_SEED_VER = state.ver;
    return data;
  }

  function preloadCache() {
    const cached = readLocalCache();
    if (cached) applyBootstrap(cached);
    return state.bootstrapped;
  }

  async function bootstrap() {
    preloadCache();
    const data = await getJson('/api/bootstrap');
    if (!data || !Array.isArray(data.spots) || !data.spots.length) {
      throw new Error('Empty map bootstrap');
    }
    applyBootstrap(data);
    writeLocalCache(data);
    return data;
  }

  function ensureSession() {
    if (state.sessionReady) return state.sessionReady;
    state.sessionReady = getJson('/api/session')
      .then((data) => {
        state.ver = data.ver || state.ver;
        global.__BIDET_SEED_VER = state.ver;
        return data;
      })
      .catch((err) => {
        state.sessionReady = null;
        throw err;
      });
    return state.sessionReady;
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
    bootstrap,
    preloadCache,
    ensureSession,
    loadSpot,
    mergeSpots,
    allCached,
    get ver() { return state.ver; },
    get countries() { return state.countries; },
    get total() { return state.total; },
    get size() { return state.byId.size; },
    get bootstrapped() { return state.bootstrapped; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
