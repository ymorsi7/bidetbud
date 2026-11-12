#!/usr/bin/env node
/**
 * Smoke checks for the Capacitor web bundle in mobile/www/.
 * Run after sync-web (npm test in mobile/ does that).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const WWW = join(MOBILE, 'www');

let failed = 0;

function ok(cond, msg) {
  if (cond) {
    console.log('  ok  ' + msg);
    return;
  }
  failed++;
  console.error('  FAIL  ' + msg);
}

function requiredFile(rel) {
  const abs = join(WWW, rel);
  ok(existsSync(abs) && statSync(abs).isFile(), rel + ' exists');
  return abs;
}

console.log('mobile/www smoke');

ok(existsSync(join(WWW, 'index.html')), 'mobile/www/index.html exists');

const required = [
  'js/app.js',
  'js/core.js',
  'js/map-api.js',
  'js/search-seed.js',
  'js/native-bridge.js',
  'js/deep-link.js',
  'css/app.css',
  'css/native.css',
  'css/github-star.css',
  'vendor/leaflet.js',
  'vendor/leaflet.css',
  'vendor/leaflet.markercluster.js',
  'images/bidetbud-logo.png',
  'images/bidetbud-favicon-192.png',
];
for (const rel of required) requiredFile(rel);

ok(!existsSync(join(WWW, 'bidet-seed.json')), 'www does not ship bidet-seed.json');

const htmlPath = join(WWW, 'index.html');
const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : '';

ok(/<base href="\.\/"\s*\/?>/i.test(html), 'index.html has <base href="./">');
ok(html.includes('js/native-bridge.js'), 'index.html loads js/native-bridge.js');
ok(html.includes('js/deep-link.js'), 'index.html loads js/deep-link.js');
ok(html.includes('css/native.css'), 'index.html loads css/native.css');
ok(html.includes('js/map-api.js'), 'index.html loads js/map-api.js');
ok(/maximum-scale=1/.test(html), 'native viewport locks scale so iOS will not zoom inputs');
ok(/user-scalable=no/.test(html), 'native viewport disables pinch-zoom of the page');
ok(/\bcapacitor-native\b/.test(html), 'index.html marks the WebView shell for native CSS');
ok(!existsSync(join(WWW, 'shop')), 'www/ does not contain shop/');
ok(!existsSync(join(WWW, 'halal')), 'www/ does not contain halal/');
ok(!existsSync(join(WWW, 'privacy')), 'www/ does not contain privacy/');
ok(!existsSync(join(WWW, 'data')), 'www/ does not contain data/');
ok(/src="js\/app\.js/.test(html), 'index.html loads js/app.js relatively');
ok(/href="css\/app\.css/.test(html), 'index.html loads css/app.css relatively');
ok(!html.includes('bidet-seed.json'), 'index.html does not reference bidet-seed.json');
ok(!/(\s(?:src|href)=")\/\//.test(html), 'no protocol-relative src/href (breaks capacitor://)');
ok(!/href="\/"/.test(html), 'brand home is not href="/"');
ok(!/src="\/(js|css|vendor)\//.test(html), 'no root-absolute /js /css /vendor script paths');
ok(!/href="\/(js|css|vendor)\//.test(html), 'no root-absolute /js /css /vendor stylesheet paths');

const mapApi = existsSync(join(WWW, 'js/map-api.js'))
  ? readFileSync(join(WWW, 'js/map-api.js'), 'utf8')
  : '';
ok(mapApi.includes('/api/bootstrap'), 'map-api bootstraps from /api/bootstrap');
ok(mapApi.includes('bb_map_public_'), 'map-api caches pins under bb_map_public_*');
ok(mapApi.includes('bidetbud.com'), 'map-api uses bidetbud.com from the native WebView');

const bridge = existsSync(join(WWW, 'js/native-bridge.js'))
  ? readFileSync(join(WWW, 'js/native-bridge.js'), 'utf8')
  : '';
ok(bridge.includes('https://bidetbud.com'), 'native-bridge knows the live origin');
ok(bridge.includes('/api/session'), 'native-bridge warms a production API session');
ok(bridge.includes('lockNativeViewport'), 'native-bridge pins the WebView so iOS cannot pan/zoom the page');
ok(bridge.includes('setScroll'), 'native-bridge disables iOS keyboard WebView scroll');

if (failed) {
  console.error('\n' + failed + ' check(s) failed');
  process.exit(1);
}
console.log('\nall smoke checks passed');
