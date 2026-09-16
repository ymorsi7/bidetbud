/**
 * Capacitor-only boot helpers. Copied into mobile/www/js/ by sync-web.
 * Not loaded on the Netlify site. Depends on js/deep-link.js (BidetBudDeepLink).
 *
 * - Status bar + splash (zinc / Inter shell)
 * - Geolocation via @capacitor/geolocation (Near me)
 * - Deep links: bidetbud://open?spot=&view=&country=
 * - Live seed refresh from bidetbud.com using the same SEED_VER / cache key
 */
(function () {
  var LIVE_SEED_ORIGIN = 'https://bidetbud.com/';

  function isNative() {
    try {
      return !!(
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === 'function' &&
        window.Capacitor.isNativePlatform()
      );
    } catch (e) {
      return false;
    }
  }

  function seedFingerprint(data) {
    if (!Array.isArray(data) || !data.length) return '0';
    var last = data[data.length - 1];
    return String(data.length) + ':' + (last && last.name ? last.name : '') + ':' + (last && last.latitude ? last.latitude : '');
  }

  function seedVer() {
    return window.__BIDET_SEED_VER || '20261010a';
  }

  function refreshSeedFromLive() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    var ver = seedVer();
    var cacheKey = 'bb_seed_cache_' + ver;
    var url = LIVE_SEED_ORIGIN + 'bidet-seed.json?v=' + encodeURIComponent(ver);
    fetch(url, { credentials: 'omit', cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('live seed ' + r.status);
        return r.json();
      })
      .then(function (fresh) {
        if (!Array.isArray(fresh) || !fresh.length) return;
        var cached = null;
        try {
          cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        } catch (e) {}
        var cachedFp = Array.isArray(cached) && cached.length ? seedFingerprint(cached) : '';
        if (seedFingerprint(fresh) === cachedFp) return;
        try {
          localStorage.setItem(cacheKey, JSON.stringify(fresh));
        } catch (e) {}
        window.dispatchEvent(new CustomEvent('bidetbud-seed-update', { detail: fresh }));
      })
      .catch(function () {});
  }

  function queryFromAppUrl(raw) {
    if (typeof BidetBudDeepLink !== 'undefined' && BidetBudDeepLink.queryFromAppUrl) {
      return BidetBudDeepLink.queryFromAppUrl(raw);
    }
    return '';
  }

  function applyDeepLink(raw) {
    var qs = queryFromAppUrl(raw);
    if (!qs) return;
    if (location.search === qs) return;
    history.replaceState(null, '', location.pathname + qs);
    location.reload();
  }

  function patchGeolocation(P) {
    if (!P.Geolocation || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition = function (success, error, options) {
      var opts = options || {};
      var run = function () {
        return P.Geolocation.getCurrentPosition({
          enableHighAccuracy: opts.enableHighAccuracy !== false,
          timeout: typeof opts.timeout === 'number' ? opts.timeout : 15000,
          maximumAge: typeof opts.maximumAge === 'number' ? opts.maximumAge : 0,
        });
      };
      var pending = P.Geolocation.requestPermissions
        ? P.Geolocation.requestPermissions().then(run)
        : run();
      pending
        .then(function (pos) {
          if (typeof success === 'function') success(pos);
        })
        .catch(function (err) {
          if (typeof error === 'function') error(err);
        });
    };
  }

  function bootNative() {
    document.documentElement.classList.add('capacitor-native');
    if (document.body) document.body.classList.add('capacitor-native');

    var P = (window.Capacitor && window.Capacitor.Plugins) || {};

    if (P.StatusBar) {
      P.StatusBar.setStyle({ style: 'LIGHT' }).catch(function () {});
      P.StatusBar.setBackgroundColor({ color: '#f4f4f5' }).catch(function () {});
    }
    if (P.SplashScreen) {
      P.SplashScreen.hide({ fadeOutDuration: 250 }).catch(function () {});
    }

    patchGeolocation(P);

    if (P.App) {
      if (typeof P.App.getLaunchUrl === 'function') {
        P.App.getLaunchUrl()
          .then(function (result) {
            if (result && result.url) applyDeepLink(result.url);
          })
          .catch(function () {});
      }
      if (typeof P.App.addListener === 'function') {
        P.App.addListener('appUrlOpen', function (event) {
          if (event && event.url) applyDeepLink(event.url);
        });
      }
    }

    refreshSeedFromLive();
  }

  function start() {
    if (isNative()) {
      if (document.body) bootNative();
      else document.addEventListener('DOMContentLoaded', bootNative);
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', refreshSeedFromLive);
    } else {
      refreshSeedFromLive();
    }
  }

  start();
})();
