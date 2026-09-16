#!/usr/bin/env node
/**
 * Copy the BidetBud static map from the repo root into mobile/www/
 * so Capacitor can serve it offline. Does not duplicate seed maintenance —
 * the same bidet-seed.json the website ships is copied as-is.
 *
 * Never copies shop/, halal/, data/, or scripts/. bidet-seed.js is optional.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MOBILE = path.resolve(__dirname, '..');
const WWW = path.join(MOBILE, 'www');
const BRIDGE_SRC = path.join(MOBILE, 'src', 'native-bridge.js');
const DEEP_LINK_SRC = path.join(MOBILE, 'src', 'deep-link.cjs');
const NATIVE_CSS_SRC = path.join(MOBILE, 'src', 'native.css');

const COPY_DIRS = ['js', 'css', 'vendor'];
const NEVER_COPY = new Set(['shop', 'halal', 'data', 'scripts', 'mobile', 'node_modules', '.git']);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest, skipNames) {
  const skip = new Set(skipNames || []);
  if (!fs.existsSync(src)) {
    throw new Error('Missing source directory: ' + src);
  }
  ensureDir(dest);
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.has(ent.name) || NEVER_COPY.has(ent.name)) continue;
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(from, to);
    else if (ent.isFile()) copyFile(from, to);
  }
}

function rewriteIndex(html) {
  html = html.replace(
    /<meta name="viewport"[^>]*>/i,
    '<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">'
  );

  if (!/\bcapacitor-native\b/.test(html)) {
    html = html.replace(
      /<html\b([^>]*)>/i,
      (m, attrs) => {
        if (/\bclass=/.test(attrs)) {
          return m.replace(/class=(["'])/, 'class=$1capacitor-native ');
        }
        return '<html class="capacitor-native"' + attrs + '>';
      }
    );
  }

  if (!/<base\s/i.test(html)) {
    html = html.replace(
      /<meta name="viewport"[^>]*>/i,
      (m) => m + '\n<base href="./">'
    );
  }

  // capacitor:// and https://localhost cannot resolve protocol-relative URLs.
  html = html.replace(/(\s(?:src|href)=")\/\//gi, '$1https://');

  // Root-absolute home would leave the WebView.
  html = html.replace(/href="\/"/g, 'href="./"');

  html = html.replace(
    /var SEED_VER = ('[^']+'|"[^"]+");/,
    'var SEED_VER = $1;\n  window.__BIDET_SEED_VER = SEED_VER;'
  );

  if (!html.includes('css/native.css')) {
    html = html.replace(
      /<link rel="stylesheet" href="css\/app\.css[^"]*">/,
      (m) => m + '\n<link rel="stylesheet" href="css/native.css">'
    );
  }

  if (!html.includes('js/native-bridge.js')) {
    html = html.replace(
      /<script src="js\/app\.js[^"]*" defer><\/script>/,
      '<script src="js/deep-link.js" defer></script>\n<script src="js/native-bridge.js" defer></script>\n$&'
    );
  } else if (!html.includes('js/deep-link.js')) {
    html = html.replace(
      /<script src="js\/native-bridge\.js"[^>]*><\/script>/,
      '<script src="js/deep-link.js" defer></script>\n$&'
    );
  }

  return html;
}

function assertNoSiblingApps() {
  for (const blocked of ['shop', 'halal', 'data', 'scripts']) {
    const p = path.join(WWW, blocked);
    if (fs.existsSync(p)) {
      throw new Error('sync-web must not copy ' + blocked + '/ into www (' + p + ')');
    }
  }
}

function main() {
  for (const dir of COPY_DIRS) {
    if (NEVER_COPY.has(dir)) {
      throw new Error('COPY_DIRS must not include ' + dir);
    }
  }

  if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
    throw new Error('Repo root index.html not found (run from bidetbeacon).');
  }
  const seedSrc = path.join(ROOT, 'bidet-seed.json');
  if (!fs.existsSync(seedSrc)) {
    throw new Error('Missing root bidet-seed.json — the app does not keep its own seed.');
  }
  for (const src of [BRIDGE_SRC, DEEP_LINK_SRC, NATIVE_CSS_SRC]) {
    if (!fs.existsSync(src)) throw new Error('Missing ' + src);
  }

  fs.rmSync(WWW, { recursive: true, force: true });
  ensureDir(WWW);

  const indexDest = path.join(WWW, 'index.html');
  copyFile(path.join(ROOT, 'index.html'), indexDest);
  const rewritten = rewriteIndex(fs.readFileSync(indexDest, 'utf8'));
  fs.writeFileSync(indexDest, rewritten);

  for (const dir of COPY_DIRS) {
    copyDir(path.join(ROOT, dir), path.join(WWW, dir));
  }

  // Map icons/logo only — shop product photos are not needed in the app bundle.
  copyDir(path.join(ROOT, 'images'), path.join(WWW, 'images'), ['shop']);

  copyFile(seedSrc, path.join(WWW, 'bidet-seed.json'));
  const seedJs = path.join(ROOT, 'bidet-seed.js');
  if (fs.existsSync(seedJs)) {
    copyFile(seedJs, path.join(WWW, 'bidet-seed.js'));
  }

  copyFile(BRIDGE_SRC, path.join(WWW, 'js', 'native-bridge.js'));
  copyFile(DEEP_LINK_SRC, path.join(WWW, 'js', 'deep-link.js'));
  copyFile(NATIVE_CSS_SRC, path.join(WWW, 'css', 'native.css'));

  assertNoSiblingApps();

  const seed = JSON.parse(fs.readFileSync(path.join(WWW, 'bidet-seed.json'), 'utf8'));
  if (!Array.isArray(seed) || !seed.length) {
    throw new Error('Copied bidet-seed.json is empty or not an array.');
  }

  console.log(
    'sync-web: copied map + ' + seed.length + ' seed rows → ' + path.relative(ROOT, WWW)
  );
}

try {
  main();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
