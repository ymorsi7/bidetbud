/**
 * Parse BidetBud custom-scheme and https URLs into the same query string
 * js/app.js already reads (?spot= ?view= ?country=).
 *
 * Loaded in the WebView as js/deep-link.js and required from Node tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BidetBudDeepLink = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function queryFromAppUrl(raw) {
    if (!raw) return '';
    var str = String(raw).trim();
    try {
      var u = new URL(str);
      if (u.search && u.search.length > 1) return u.search;
      if (u.hash && u.hash.indexOf('?') !== -1) {
        return u.hash.slice(u.hash.indexOf('?'));
      }
    } catch (e) {
      /* fall through */
    }
    var q = str.indexOf('?');
    if (q !== -1) return str.slice(q);
    return '';
  }

  function parseDeepLinkSearch(qs) {
    var raw = String(qs || '');
    if (raw.charAt(0) === '?') raw = raw.slice(1);
    var p = new URLSearchParams(raw);
    var out = {};
    if (p.get('spot')) out.spot = p.get('spot');
    if (p.get('view')) out.view = p.get('view');
    if (p.get('country')) out.country = p.get('country');
    return out;
  }

  function parseAppUrl(raw) {
    return parseDeepLinkSearch(queryFromAppUrl(raw));
  }

  return {
    queryFromAppUrl: queryFromAppUrl,
    parseDeepLinkSearch: parseDeepLinkSearch,
    parseAppUrl: parseAppUrl,
  };
});
