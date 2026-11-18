#!/bin/sh
# Xcode Cloud: refresh Capacitor web assets into the committed iOS project.
# The xcodeproj must already exist in git — Apple skips scripts if the
# configured project path is missing after clone.
set -euo pipefail

echo "=== BidetBud Xcode Cloud post-clone ==="
ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(pwd)}"
cd "$ROOT"

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK=1

need_node=1
if command -v node >/dev/null 2>&1; then
  major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
  if [ "$major" -ge 22 ]; then
    need_node=0
  fi
fi

if [ "$need_node" -eq 1 ]; then
  echo "Installing Node 22 via Homebrew…"
  brew install node@22 || brew upgrade node@22 || brew install node
fi
if [ -d "$(brew --prefix node@22 2>/dev/null)/bin" ]; then
  export PATH="$(brew --prefix node@22)/bin:$PATH"
fi

node -v
npm -v

test -f mobile/ios/App/App.xcodeproj/project.pbxproj

cd mobile
npm ci
npm run sync:web
npx cap sync ios
node scripts/patch-native.cjs

echo "iOS project ready: mobile/ios/App/App.xcodeproj"
