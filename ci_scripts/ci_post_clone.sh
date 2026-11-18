#!/bin/sh
# Xcode Cloud: ios/ is gitignored — generate it after clone, before xcodebuild.
set -euo pipefail

echo "=== BidetBud Xcode Cloud post-clone ==="
cd "$CI_PRIMARY_REPOSITORY_PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node via Homebrew…"
  brew install node@22
  export PATH="$(brew --prefix node@22)/bin:$PATH"
fi
# Prefer node@22 if brew installed it as keg-only
if [ -d "$(brew --prefix node@22 2>/dev/null)/bin" ]; then
  export PATH="$(brew --prefix node@22)/bin:$PATH"
fi

node -v
npm -v

cd mobile
npm ci
npm run sync:web

if [ ! -f ios/App/App.xcodeproj/project.pbxproj ]; then
  echo "Adding Capacitor iOS platform…"
  npx cap add ios
fi

npx cap sync ios
node scripts/patch-native.cjs

test -f ios/App/App.xcodeproj/project.pbxproj
echo "iOS project ready: mobile/ios/App/App.xcodeproj"
