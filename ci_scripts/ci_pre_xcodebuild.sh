#!/bin/bash
set -euo pipefail
echo "=== BidetBud pre-xcodebuild ==="
ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"
test -d mobile/ios/App/CapPackages/app

# Mirror of mobile/ios/App/ci_scripts/ci_pre_xcodebuild.sh — keep in sync.
# Xcode 26+ rejects Cloud's ad-hoc archive unless the App target skips signing;
# Cloud re-signs during App Store Connect export.
PBXPROJ=mobile/ios/App/App.xcodeproj/project.pbxproj
python3 - "$PBXPROJ" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text()
needle = "PRODUCT_BUNDLE_IDENTIFIER = com.bidetbud.app;"
inject = "CODE_SIGNING_ALLOWED = NO;\n\t\t\t\t" + needle
if "CODE_SIGNING_ALLOWED = NO" not in text:
    if text.count(needle) < 2:
        raise SystemExit(f"expected ≥2 bundle id settings in {path}, found {text.count(needle)}")
    text = text.replace(needle, inject)
    path.write_text(text)
if "CODE_SIGNING_ALLOWED = NO" not in path.read_text():
    raise SystemExit("failed to inject CODE_SIGNING_ALLOWED=NO")
print("[ci_pre_xcodebuild] CODE_SIGNING_ALLOWED=NO injected for App target")
PY

echo "OK"
