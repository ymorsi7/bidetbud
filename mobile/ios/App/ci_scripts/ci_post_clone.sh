#!/bin/bash
set -euo pipefail
echo "=== BidetBud Xcode Cloud post-clone (project-local) ==="
ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
cd "$ROOT"
test -d mobile/ios/App/CapPackages/app
if grep -q 'node_modules/@capacitor' mobile/ios/App/CapApp-SPM/Package.swift; then
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
echo "CapPackages SPM paths OK"
