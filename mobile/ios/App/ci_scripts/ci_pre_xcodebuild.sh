#!/bin/bash
set -euo pipefail
echo "=== BidetBud pre-xcodebuild (project-local) ==="
ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
cd "$ROOT"
test -d mobile/ios/App/CapPackages/app

# Xcode Cloud archives with CODE_SIGN_IDENTITY=- (ad-hoc) and re-signs the
# archive itself for App Store Connect. Xcode 26+ rejects ad-hoc archives of
# device app targets ("has entitlements that require signing with a development
# certificate") even with no entitlements file. Disable signing on the App
# target for the CI archive only; Cloud's export/re-sign still produces the IPA.
PBXPROJ=mobile/ios/App/App.xcodeproj/project.pbxproj
python3 - "$PBXPROJ" <<'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text()
# Inject into App target configs (both contain PRODUCT_BUNDLE_IDENTIFIER).
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
