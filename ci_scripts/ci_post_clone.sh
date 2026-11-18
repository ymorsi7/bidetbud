#!/bin/bash
# Xcode Cloud: keep web assets fresh. Capacitor SPM plugins are vendored in
# mobile/ios/App/CapPackages (no node_modules required for xcodebuild).
set -euo pipefail

echo "=== BidetBud Xcode Cloud post-clone ==="
ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"
echo "ROOT=$ROOT"

test -f mobile/ios/App/App.xcodeproj/project.pbxproj
test -d mobile/ios/App/CapPackages/app
test -f mobile/ios/App/CapApp-SPM/Package.swift

# Prefer CapPackages paths even if a prior cap sync rewrote Package.swift
if grep -q 'node_modules/@capacitor' mobile/ios/App/CapApp-SPM/Package.swift; then
  echo "Rewriting Package.swift away from node_modules…"
  # Node may be unavailable — do a sed fallback
  if command -v node >/dev/null 2>&1; then
    (cd mobile && node scripts/fix-cap-spm-paths.cjs) || true
  fi
  sed -i '' \
    -e 's|path: "../../../node_modules/@capacitor/app"|path: "../CapPackages/app"|g' \
    -e 's|path: "../../../node_modules/@capacitor/camera"|path: "../CapPackages/camera"|g' \
    -e 's|path: "../../../node_modules/@capacitor/geolocation"|path: "../CapPackages/geolocation"|g' \
    -e 's|path: "../../../node_modules/@capacitor/keyboard"|path: "../CapPackages/keyboard"|g' \
    -e 's|path: "../../../node_modules/@capacitor/splash-screen"|path: "../CapPackages/splash-screen"|g' \
    -e 's|path: "../../../node_modules/@capacitor/status-bar"|path: "../CapPackages/status-bar"|g' \
    mobile/ios/App/CapApp-SPM/Package.swift || true
fi

grep -q 'CapPackages/app' mobile/ios/App/CapApp-SPM/Package.swift
echo "CapPackages SPM paths OK — ready for archive"
