/**
 * Map data client. Loads the full public pin set once via /api/bootstrap
 * (session cookie + rate limit). No public bidet-seed.json dump.
 *
 * Native (CapacitorHttp): warm /api/session first, then send the returned
 * token as X-BB-S on bootstrap. CapHttp often omits Origin and may not
 * attach HttpOnly cookies the way a browser would - the header is the
 * reliable path for TestFlight / Play builds.
 */
(function (global) {
  const state = {
    ver: '',
    sessionReady: null,
    sessionToken: '',
    byId: new Map(),
    countries: [],
    total: 0,
    bootstrapped: false,
  };

  const LIVE_ORIGIN = 'https://bidetbud.com';
  const TOKEN_KEY = 'bb_s_token';

  function isNativeShell() {
    // Only the real Capacitor runtime - not the CSS class sync-web adds for layout
    // (Playwright serves www with that class but still needs same-origin /api stubs).
    try {
      return !!(
        global.Capacitor &&
        typeof global.Capacitor.isNativePlatform === 'function' &&
        global.Capacitor.isNativePlatform()
      );
    } catch (e) {
      return false;
    }
  }

  function apiOrigin() {
    // Capacitor WebView origin is capacitor://localhost / https://localhost -
    // talk to production for map pins (CapacitorHttp bypasses CORS).
    if (isNativeShell()) return LIVE_ORIGIN;
    return location.origin;
  }

  function apiUrl(path, params) {
    const u = new URL(path, apiOrigin());
    if (params) {
      Object.keys(params).forEach((k) => {
        if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
          u.searchParams.set(k, String(params[k]));
        }
      });
    }
    if (isNativeShell()) return u.href;
    return u.pathname + u.search;
  }

  function readStoredToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function storeToken(token) {
    state.sessionToken = token || '';
    if (!token) return;
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_KEY, token);
    } catch (e) { /* private mode */ }
  }

  function authHeaders() {
    const headers = { Accept: 'application/json' };
    const token = state.sessionToken || readStoredToken();
    if (token) {
      state.sessionToken = token;
      // Prefer Authorization - Netlify edge strips some custom X-* headers.
      // Keep X-BB-S as a fallback for local / older proxies.
      headers.Authorization = 'Bearer ' + token;
      headers['X-BB-S'] = token;
    }
    return headers;
  }

  async function getJson(path, params) {
    const cross = isNativeShell();
    const res = await fetch(apiUrl(path, params), {
      credentials: cross ? 'include' : 'same-origin',
      headers: authHeaders(),
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
    } catch (e) { /* quota - ignore */ }
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

  function ensureSession() {
    if (state.sessionReady) return state.sessionReady;
    state.sessionToken = state.sessionToken || readStoredToken();
    state.sessionReady = getJson('/api/session')
      .then((data) => {
        state.ver = data.ver || state.ver;
        global.__BIDET_SEED_VER = state.ver;
        if (data && data.token) storeToken(data.token);
        return data;
      })
      .catch((err) => {
        state.sessionReady = null;
        throw err;
      });
    return state.sessionReady;
  }

  async function bootstrap() {
    preloadCache();
    // Native CapHttp: session first so bootstrap can auth via X-BB-S without Origin.
    if (isNativeShell() || !state.sessionToken) {
      try {
        await ensureSession();
      } catch (e) {
        // Website same-origin bootstrap still works without a prior session.
        if (isNativeShell()) throw e;
      }
    }
    const data = await getJson('/api/bootstrap');
    if (!data || !Array.isArray(data.spots) || !data.spots.length) {
      throw new Error('Empty map bootstrap');
    }
    applyBootstrap(data);
    writeLocalCache(data);
    return data;
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
