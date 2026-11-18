#!/bin/bash
set -euo pipefail
echo "=== BidetBud pre-xcodebuild (project-local) ==="
ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
cd "$ROOT"
test -d mobile/ios/App/CapPackages/app
echo "OK"
