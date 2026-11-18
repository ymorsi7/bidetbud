#!/bin/bash
# Xcode Cloud: install Capacitor deps so CapApp-SPM path packages resolve.
# CapApp-SPM/Package.swift points at mobile/node_modules/@capacitor/* —
# those paths must exist before xcodebuild resolves packages.
set -euo pipefail

echo "=== BidetBud Xcode Cloud post-clone ==="
ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"
echo "ROOT=$ROOT"
pwd
ls -la

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK=1
export HOMEBREW_NO_ANALYTICS=1

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
    if [ "$major" -ge 20 ]; then
      echo "Using existing Node $(node -v)"
      return 0
    fi
  fi
  echo "Installing Node via Homebrew…"
  if command -v brew >/dev/null 2>&1; then
    brew install node@22 || brew upgrade node@22 || brew install node
    if [ -d "$(brew --prefix node@22 2>/dev/null)/bin" ]; then
      export PATH="$(brew --prefix node@22)/bin:$PATH"
    fi
    if [ -d "$(brew --prefix node 2>/dev/null)/bin" ]; then
      export PATH="$(brew --prefix node)/bin:$PATH"
    fi
  else
    echo "ERROR: brew not found and Node missing"
    exit 1
  fi
}

ensure_node
command -v node
command -v npm
node -v
npm -v

test -f mobile/ios/App/App.xcodeproj/project.pbxproj
test -f mobile/package-lock.json

cd mobile
echo "=== npm ci ==="
npm ci --no-audit --no-fund
echo "=== sync web + cap ==="
npm run sync:web
npx cap sync ios
node scripts/patch-native.cjs

echo "=== verify Capacitor SPM paths ==="
for pkg in app camera geolocation keyboard splash-screen status-bar; do
  test -d "node_modules/@capacitor/$pkg" || {
    echo "MISSING node_modules/@capacitor/$pkg"
    exit 1
  }
  echo "ok @capacitor/$pkg"
done

echo "iOS project ready: mobile/ios/App/App.xcodeproj"
