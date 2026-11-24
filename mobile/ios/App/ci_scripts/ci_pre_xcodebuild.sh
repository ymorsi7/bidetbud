#!/bin/bash
set -euo pipefail
echo "=== BidetBud pre-xcodebuild (project-local) ==="
ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
cd "$ROOT"
test -d mobile/ios/App/CapPackages/app
test -f mobile/ios/App/CapApp-SPM/Package.swift

# Cap sync must never leave node_modules path deps on Cloud.
if grep -q 'node_modules/@capacitor' mobile/ios/App/CapApp-SPM/Package.swift; then
  echo "[ci_pre_xcodebuild] CapApp-SPM references node_modules - rewriting"
  (cd mobile && node scripts/fix-cap-spm-paths.cjs)
fi
if ! grep -q '../CapPackages/app' mobile/ios/App/CapApp-SPM/Package.swift; then
  echo "[ci_pre_xcodebuild] ERROR: CapApp-SPM missing CapPackages paths" >&2
  exit 1
fi
if grep -q 'node_modules/@capacitor' mobile/ios/App/CapApp-SPM/Package.swift; then
  echo "[ci_pre_xcodebuild] ERROR: CapApp-SPM still references node_modules" >&2
  exit 1
fi

PBXPROJ=mobile/ios/App/App.xcodeproj/project.pbxproj
# Release must skip signing so Xcode Cloud's ad-hoc archive (IDENTITY=-) succeeds
# on Xcode 26+; Cloud re-signs during App Store export.
if ! grep -q 'CODE_SIGNING_ALLOWED = NO' "$PBXPROJ"; then
  echo "[ci_pre_xcodebuild] ERROR: Release is missing CODE_SIGNING_ALLOWED=NO" >&2
  exit 1
fi
echo "[ci_pre_xcodebuild] CapPackages SPM paths OK"
echo "[ci_pre_xcodebuild] CODE_SIGNING_ALLOWED=NO present for Cloud archive"
echo "OK"
