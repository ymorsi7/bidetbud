#!/bin/bash
# Ensure Capacitor node_modules exist before xcodebuild resolves CapApp-SPM.
set -euo pipefail

echo "=== BidetBud Xcode Cloud pre-xcodebuild (project-local) ==="
ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
cd "$ROOT/mobile"

if [ ! -d node_modules/@capacitor/app ]; then
  echo "node_modules missing — running npm ci"
  export HOMEBREW_NO_AUTO_UPDATE=1
  export HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK=1
  if ! command -v node >/dev/null 2>&1 || [ "$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)" -lt 20 ]; then
    brew install node@22 || brew install node
    [ -d "$(brew --prefix node@22 2>/dev/null)/bin" ] && export PATH="$(brew --prefix node@22)/bin:$PATH"
    [ -d "$(brew --prefix node 2>/dev/null)/bin" ] && export PATH="$(brew --prefix node)/bin:$PATH"
  fi
  npm ci --no-audit --no-fund
  npm run sync:web
  npx cap sync ios
fi

for pkg in app camera geolocation keyboard splash-screen status-bar; do
  test -d "node_modules/@capacitor/$pkg"
done
echo "Capacitor SPM paths OK"
