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
      if (typeof P.StatusBar.setOverlaysWebView === 'function') {
        P.StatusBar.setOverlaysWebView({ overlay: false }).catch(function () {});
      }
      P.StatusBar.setStyle({ style: 'LIGHT' }).catch(function () {});
      P.StatusBar.setBackgroundColor({ color: '#f4f4f5' }).catch(function () {});
    }
    if (P.SplashScreen) {
      P.SplashScreen.hide({ fadeOutDuration: 250 }).catch(function () {});
    }

    patchGeolocation(P);

    if (P.Keyboard) {
      if (typeof P.Keyboard.setScroll === 'function') {
        P.Keyboard.setScroll({ isDisabled: true }).catch(function () {});
      }
      if (typeof P.Keyboard.setAccessoryBarVisible === 'function') {
        P.Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(function () {});
      }
      if (typeof P.Keyboard.setResizeMode === 'function') {
        P.Keyboard.setResizeMode({ mode: 'none' }).catch(function () {});
      }
    }

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

    try { localStorage.setItem('bb_promo_seen', '1'); } catch (e) {}

    lockNativeViewport();
    refreshSeedFromLive();
  }

  function lockNativeViewport() {
    var root = document.documentElement;
    function pin() {
      window.scrollTo(0, 0);
      root.scrollLeft = 0;
      root.scrollTop = 0;
      if (document.body) {
        document.body.scrollLeft = 0;
        document.body.scrollTop = 0;
      }
      root.style.zoom = '';
      var vv = window.visualViewport;
      if (vv) {
        root.style.setProperty('--vv-top', Math.round(vv.offsetTop) + 'px');
        root.style.setProperty('--vv-left', Math.round(vv.offsetLeft) + 'px');
        root.style.setProperty('--vv-width', Math.round(vv.width) + 'px');
        root.style.setProperty('--vv-height', Math.round(vv.height) + 'px');
      } else {
        root.style.setProperty('--vv-top', '0px');
        root.style.setProperty('--vv-left', '0px');
        root.style.setProperty('--vv-width', window.innerWidth + 'px');
        root.style.setProperty('--vv-height', window.innerHeight + 'px');
      }
    }
    function hardenInputs() {
      var nodes = document.querySelectorAll('input, select, textarea');
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].style.fontSize = '16px';
      }
    }
    pin();
    hardenInputs();
    window.addEventListener(
      'scroll',
      function () {
        if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
      },
      { passive: true }
    );
    document.addEventListener(
      'gesturestart',
      function (e) {
        e.preventDefault();
      },
      { passive: false }
    );
    document.addEventListener(
      'gesturechange',
      function (e) {
        e.preventDefault();
      },
      { passive: false }
    );
    if (window.visualViewport) {
      window.visualViewport.addEventListener('scroll', pin);
      window.visualViewport.addEventListener('resize', pin);
    }
    document.addEventListener(
      'focusin',
      function (e) {
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
          t.style.fontSize = '16px';
          try {
            t.focus({ preventScroll: true });
          } catch (err) {}
        }
        var Keyboard =
          window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Keyboard;
        if (Keyboard && typeof Keyboard.setAccessoryBarVisible === 'function') {
          Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(function () {});
        }
        pin();
        var add = document.getElementById('addDialog');
        var form = document.getElementById('emailPanel');
        if (add) add.scrollTop = 0;
        if (form) form.scrollTop = 0;
        setTimeout(pin, 0);
        setTimeout(pin, 50);
        setTimeout(pin, 300);
      },
      true
    );
    document.addEventListener('focusout', function () {
      setTimeout(pin, 0);
      setTimeout(pin, 300);
    });
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
