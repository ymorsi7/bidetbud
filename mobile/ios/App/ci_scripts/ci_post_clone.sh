#!/bin/bash
set -euo pipefail
echo "=== BidetBud post-clone (project-local) ==="
ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
cd "$ROOT"
ls mobile/ios/App/CapPackages
grep CapPackages mobile/ios/App/CapApp-SPM/Package.swift

# Xcode embeds these as Resources. Cap sync generates them locally, but they
# used to be gitignored so Cloud archives failed with missing-file errors.
APP_DIR=mobile/ios/App/App
if [[ ! -f "$APP_DIR/capacitor.config.json" ]]; then
  echo "[ci_post_clone] writing missing capacitor.config.json"
  cat > "$APP_DIR/capacitor.config.json" <<'JSON'
{
	"appId": "com.bidetbud.app",
	"appName": "BidetBud",
	"webDir": "www",
	"server": {
		"androidScheme": "https",
		"iosScheme": "capacitor"
	},
	"plugins": {
		"CapacitorHttp": {
			"enabled": true
		},
		"SplashScreen": {
			"launchShowDuration": 400,
			"launchAutoHide": true,
			"backgroundColor": "#18181b",
			"showSpinner": false,
			"splashFullScreen": true,
			"splashImmersive": true
		},
		"StatusBar": {
			"style": "LIGHT",
			"backgroundColor": "#f4f4f5",
			"overlaysWebView": false
		},
		"Keyboard": {
			"resize": "none"
		}
	},
	"ios": {
		"contentInset": "never",
		"preferredContentMode": "mobile"
	},
	"android": {
		"allowMixedContent": false,
		"backgroundColor": "#f4f4f5"
	},
	"packageClassList": [
		"AppPlugin",
		"CAPCameraPlugin",
		"GeolocationPlugin",
		"KeyboardPlugin",
		"SplashScreenPlugin",
		"StatusBarPlugin"
	]
}
JSON
fi
if [[ ! -f "$APP_DIR/config.xml" ]]; then
  echo "[ci_post_clone] writing missing config.xml"
  cat > "$APP_DIR/config.xml" <<'XML'
<?xml version='1.0' encoding='utf-8'?>
<widget version="1.0.0" xmlns="http://www.w3.org/ns/widgets" xmlns:cdv="http://cordova.apache.org/ns/1.0">
  <access origin="*" />
</widget>
XML
fi
test -f "$APP_DIR/capacitor.config.json"
test -f "$APP_DIR/config.xml"

# Refresh the embedded web shell from the repo root. Without this, Cloud archives
# ship whatever stale App/public was last committed (TestFlight never picks up
# map/blog/seed UI changes).
echo "[ci_post_clone] syncing web → App/public"
if ! command -v node >/dev/null 2>&1; then
  echo "[ci_post_clone] installing node via brew"
  brew install node@22
  brew link --force --overwrite node@22 || true
fi
cd "$ROOT/mobile"
# sync-web + patch-native are plain Node (no npm install / Cap CLI needed).
# Keep cordova.js / cordova_plugins.js already committed under App/public -
# those are Cap bridge files that sync-web does not generate.
node scripts/sync-web.cjs
PUBLIC_DIR=ios/App/App/public
mkdir -p "$PUBLIC_DIR"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude cordova.js \
    --exclude cordova_plugins.js \
    www/ "$PUBLIC_DIR/"
else
  cp -R www/. "$PUBLIC_DIR/"
fi
rm -f "$PUBLIC_DIR/css/blog.css"
rm -rf "$PUBLIC_DIR/images/blog"
node scripts/patch-native.cjs
test -f "$PUBLIC_DIR/index.html"
test -f "$PUBLIC_DIR/js/app.js"
test -f "$PUBLIC_DIR/cordova.js"
echo "[ci_post_clone] App/public refreshed ($(wc -c < "$PUBLIC_DIR/js/app.js") bytes app.js)"
echo "OK"
