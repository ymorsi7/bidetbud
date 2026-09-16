#!/usr/bin/env node
/**
 * Copy the site favicon into mobile/assets/logo.png for @capacitor/assets.
 * Source is the repo-root image — not a second design file.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const DEST_DIR = path.resolve(__dirname, '../assets');
const SRC = path.join(ROOT, 'images', 'bidetbud-favicon-192.png');
const DEST = path.join(DEST_DIR, 'logo.png');

if (!fs.existsSync(SRC)) {
  console.error('Missing ' + SRC);
  process.exit(1);
}

fs.mkdirSync(DEST_DIR, { recursive: true });
fs.copyFileSync(SRC, DEST);
console.log('prepare-assets: ' + path.relative(ROOT, SRC) + ' → ' + path.relative(ROOT, DEST));
console.log('Note: source is 192×192; App Store prefers 1024×1024. Replace mobile/assets/logo.png before a store icon pass if you have a larger mark.');
