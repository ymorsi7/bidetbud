#!/usr/bin/env node
/**
 * Copy the BidetBud static map from the repo root into mobile/www/
 * so Capacitor can serve it. Map pins load from https://bidetbud.com/api/*
 * (no public bidet-seed.json dump in the repo or the app bundle).
 *
 * Never copies shop/, halal/, data/, or scripts/.
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
const NEVER_COPY = new Set(['shop', 'halal', 'privacy', 'data', 'scripts', 'mobile', 'node_modules', '.git']);

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
  for (const blocked of ['shop', 'halal', 'privacy', 'data', 'scripts']) {
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
  for (const src of [BRIDGE_SRC, DEEP_LINK_SRC, NATIVE_CSS_SRC]) {
    if (!fs.existsSync(src)) throw new Error('Missing ' + src);
  }
  const mapApi = path.join(ROOT, 'js', 'map-api.js');
  if (!fs.existsSync(mapApi)) {
    throw new Error('Missing js/map-api.js - mobile map loads pins via /api/bootstrap.');
  }

  fs.rmSync(WWW, { recursive: true, force: true });
  ensureDir(WWW);

  const indexDest = path.join(WWW, 'index.html');
  copyFile(path.join(ROOT, 'index.html'), indexDest);
  const rewritten = rewriteIndex(fs.readFileSync(indexDest, 'utf8'));
  fs.writeFileSync(indexDest, rewritten);

  for (const dir of COPY_DIRS) {
    // Blog stylesheet is site-only (blog/ is not shipped in the app).
    copyDir(path.join(ROOT, dir), path.join(WWW, dir), dir === 'css' ? ['blog.css'] : []);
  }

  // Map icons/logo only - shop product photos and blog media stay on the site.
  copyDir(path.join(ROOT, 'images'), path.join(WWW, 'images'), ['shop', 'blog']);

  copyFile(BRIDGE_SRC, path.join(WWW, 'js', 'native-bridge.js'));
  copyFile(DEEP_LINK_SRC, path.join(WWW, 'js', 'deep-link.js'));
  copyFile(NATIVE_CSS_SRC, path.join(WWW, 'css', 'native.css'));

  assertNoSiblingApps();

  if (fs.existsSync(path.join(WWW, 'bidet-seed.json'))) {
    throw new Error('www must not ship bidet-seed.json (map data is API-only).');
  }

  console.log('sync-web: copied map shell → ' + path.relative(ROOT, WWW) + ' (pins via /api)');
}

try {
  main();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
