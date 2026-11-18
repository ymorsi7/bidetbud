#!/bin/bash
# Xcode Cloud (next to App.xcodeproj): install Capacitor deps so CapApp-SPM resolves.
set -euo pipefail

echo "=== BidetBud Xcode Cloud post-clone (project-local) ==="
ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
cd "$ROOT"
echo "ROOT=$ROOT"

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK=1
export HOMEBREW_NO_ANALYTICS=1

if ! command -v node >/dev/null 2>&1 || [ "$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)" -lt 20 ]; then
  echo "Installing Node via Homebrew…"
  brew install node@22 || brew upgrade node@22 || brew install node
  [ -d "$(brew --prefix node@22 2>/dev/null)/bin" ] && export PATH="$(brew --prefix node@22)/bin:$PATH"
  [ -d "$(brew --prefix node 2>/dev/null)/bin" ] && export PATH="$(brew --prefix node)/bin:$PATH"
fi

node -v
npm -v
test -f mobile/package-lock.json

cd mobile
npm ci --no-audit --no-fund
npm run sync:web
npx cap sync ios
node scripts/patch-native.cjs

for pkg in app camera geolocation keyboard splash-screen status-bar; do
  test -d "node_modules/@capacitor/$pkg" || { echo "MISSING @capacitor/$pkg"; exit 1; }
  echo "ok @capacitor/$pkg"
done

echo "iOS project ready"
