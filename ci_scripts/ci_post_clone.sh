#!/bin/bash
# CapPackages are committed - nothing to install for SPM.
# Prefer the project-local script (Xcode Cloud runs that when present).
set -euo pipefail
echo "=== BidetBud post-clone ==="
ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"
bash mobile/ios/App/ci_scripts/ci_post_clone.sh
