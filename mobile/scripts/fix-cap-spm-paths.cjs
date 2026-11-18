#!/usr/bin/env node
/**
 * Point CapApp-SPM at vendored CapPackages (not node_modules) so Xcode Cloud
 * can resolve Swift packages without npm. Idempotent; run after `cap sync`.
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'ios', 'App', 'CapApp-SPM', 'Package.swift');
let text = fs.readFileSync(pkgPath, 'utf8');
const before = text;

const map = [
  ['CapacitorApp', 'app'],
  ['CapacitorCamera', 'camera'],
  ['CapacitorGeolocation', 'geolocation'],
  ['CapacitorKeyboard', 'keyboard'],
  ['CapacitorSplashScreen', 'splash-screen'],
  ['CapacitorStatusBar', 'status-bar'],
];

for (const [name, dir] of map) {
  // Rewrite any path: for this package name to CapPackages
  const re = new RegExp(
    String.raw`\.package\(\s*name:\s*"${name}"\s*,\s*path:\s*"[^"]+"\s*\)`,
    'g'
  );
  text = text.replace(re, `.package(name: "${name}", path: "../CapPackages/${dir}")`);
}

if (text === before) {
  // Ensure CapPackages paths already present
  if (!text.includes('../CapPackages/app')) {
    console.error('fix-cap-spm-paths: could not find CapacitorApp package entry');
    process.exit(1);
  }
  console.log('fix-cap-spm-paths: already using CapPackages');
} else {
  fs.writeFileSync(pkgPath, text);
  console.log('fix-cap-spm-paths: rewrote Package.swift → CapPackages');
}
