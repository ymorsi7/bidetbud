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
echo "OK"
