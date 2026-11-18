#!/bin/bash
set -euo pipefail
echo "=== BidetBud pre-xcodebuild ==="
ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"
test -d mobile/ios/App/CapPackages/app

PBXPROJ=mobile/ios/App/App.xcodeproj/project.pbxproj
if ! grep -q 'CODE_SIGNING_ALLOWED = NO' "$PBXPROJ"; then
  echo "[ci_pre_xcodebuild] ERROR: Release is missing CODE_SIGNING_ALLOWED=NO" >&2
  exit 1
fi
echo "[ci_pre_xcodebuild] CODE_SIGNING_ALLOWED=NO present for Cloud archive"
echo "OK"
