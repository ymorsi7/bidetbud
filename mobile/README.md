# BidetBud mobile (`mobile/`)

Capacitor shell that ships **iOS + Android** from the **same static map** as [bidetbud.com](https://bidetbud.com). Node tooling lives here only. The Netlify site is still the repo root (`index.html` + `js/app.js`); this folder is not a React/Vite rewrite.

v1 is **offline-first**: `sync:web` copies the website into `www/`. When the device is online, `js/native-bridge.js` optionally refreshes from `https://bidetbud.com/bidet-seed.json?v=<SEED_VER>` using the same cache key as the website.

**Do not edit `mobile/www` by hand.** It is generated. Change the root site, then `npm run sync:web` (or `npm run cap:sync`).

## What is tracked vs gitignored

| Tracked (commit these) | Gitignored (never commit / never deploy) |
|------------------------|------------------------------------------|
| `package.json`, `package-lock.json` | `node_modules/` |
| `capacitor.config.ts` | `ios/` (from `cap add`) |
| `src/` (`native-bridge.js`, `deep-link.cjs`, `native.css`) | `android/` (from `cap add`) |
| `scripts/` (sync, patch, tests) | `www/` (from `sync:web`) |
| this README, `.gitignore` | `assets/logo.png` (copied at icon generate time) |

**No seed copy is maintained here.** `sync:web` reads root `bidet-seed.json`. `bidet-seed.js` is copied only if that file exists at the repo root.

Netlify publishes the **repo root**. The ignored trees never go live. Do not point Netlify’s publish directory at `mobile/`.

A **fresh clone** has no `ios/`, `android/`, or `www/` until you run the first-time commands below.

## Prerequisites

| Platform | Need |
|----------|------|
| Both | **Node.js 22+** (Capacitor 8), npm |
| iOS | macOS, **full Xcode.app** (not only Command Line Tools), CocoaPods |
| Android | **Android Studio**, Android SDK 35+, device or emulator (Play services for location) |

If `xcode-select -p` is `/Library/Developer/CommandLineTools`, install Xcode and run:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

Apple / Google accounts are only required for store uploads.

## First-time setup

```bash
cd mobile
npm install
npm run sync:web
npx cap add ios
npx cap add android
npm run cap:sync
npx cap doctor          # optional
```

Or after `npm install`: `npm run cap:add` (runs `sync:web`, adds both platforms, patches native files).

Bundle id **`com.bidetbud.app`**, display name **BidetBud**. Location permission copy (reuse in App Privacy / Play Data safety):

> BidetBud uses your location only to find bidet spots near you.

Location is **Near me only** — not tracking, not ads. `patch-native.cjs` writes that string into iOS `Info.plist` and Android `strings.xml`.

Camera / photos (Suggest a spot): `patch-native.cjs` also writes `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, and Android `CAMERA` / media permissions. Copy:

> BidetBud uses the camera so you can attach a photo when suggesting a spot.

## Daily dev loop

```bash
cd mobile
npm run sync:web          # after any root HTML / JS / CSS / seed change
npm run cap:sync          # www → native projects + Info.plist / manifest patches
npm run ios               # or: npm run android
# or open the IDE:
npm run open:ios
npm run open:android
```

`ios` / `android` run `cap:sync` first. Never hand-edit `www/`.

## How `sync:web` keeps web and app in sync

Copies from the **repo root**:

- `index.html` (rewritten: `<base href="./">`, `https://` on protocol-relative URLs, brand `href="./"`, injects `js/deep-link.js`, `js/native-bridge.js`, `css/native.css`)
- `js/`, `css/`, `vendor/`
- `images/` except `images/shop/`
- `bidet-seed.json` (required) and `bidet-seed.js` **if present**

It **never** copies `shop/`, `halal/`, `data/`, or `scripts/`. After a data change that updates `bidet-seed.json`, run `sync:web` (and `cap:sync` before a device/store build).

Live refresh when online uses the `SEED_VER` already in root `index.html` (`bb_seed_cache_<SEED_VER>`). Do not add a second version in `mobile/`. Native `CapacitorHttp` plus CORS on `/bidet-seed.json` in root `_headers` (`Access-Control-Allow-Origin: *`, methods GET/HEAD/OPTIONS) make that fetch work from `capacitor://localhost` / `https://localhost`.

## Tests

| Command | What | Needs |
|---------|------|--------|
| `npm test` | `sync:web` + file smoke + deep-link unit tests | Node only |
| `npm run lint` | Syntax check on scripts | Node only |
| `npm run test:mobile:playwright` | Serve `www` @ **390×844**, seed + Map/List tabs, no `pageerror` | Playwright Chromium (`npx playwright install chromium` once) |
| `npx cap doctor` | Native toolchain | Xcode / Android SDK |

From the repo root: `npm run test:mobile` and `npm run test:mobile:playwright`. Root `npm run test:all` includes the Node smoke/deep-link suite (not Playwright) so CI that already runs site e2e is not doubled up.

### CI vs a Mac with Xcode

GitHub Actions job **`Mobile` / `mobile`** (`.github/workflows/mobile.yml`) on every push and pull request:

```text
cd mobile && npm ci && npm run lint && npm test && npm run test:mobile:playwright
```

No Xcode, no Android emulator. It does **not** run `cap run` or archive.

On a Mac with **Xcode.app** selected, you still need to `cap add` + `cap:sync` locally and run the [device checklist](#device-validation-checklist) before TestFlight.

## Test deep links

v1 custom scheme (no Universal Links yet):

```
bidetbud://open?spot=<id>
bidetbud://open?view=37.8,-122.3,12
bidetbud://open?country=USA
```

`src/deep-link.cjs` turns those into `?spot=` / `?view=` / `?country=` for `applyUrlState` in `js/app.js`. Covered by `npm run test:deep-link`.

**iOS (simulator or device, app already installed)**

Xcode → Product → Scheme → Edit Scheme → Run → Arguments → **App Store / URL** (or use Terminal):

```bash
xcrun simctl openurl booted 'bidetbud://open?country=USA'
xcrun simctl openurl booted 'bidetbud://open?view=37.8,-122.3,12'
xcrun simctl openurl booted 'bidetbud://open?spot=YOUR_SPOT_ID'
```

In Safari on a device: type the URL in the address bar, or Messages/Notes and tap the link.

**Android**

```bash
adb shell am start -a android.intent.action.VIEW -d "bidetbud://open?country=USA"
adb shell am start -a android.intent.action.VIEW -d "bidetbud://open?view=37.8,-122.3,12"
adb shell am start -a android.intent.action.VIEW -d "bidetbud://open?spot=YOUR_SPOT_ID"
```

**TODO (follow-up):** Universal Links / Digital Asset Links for `https://bidetbud.com/?spot=` need Associated Domains + `apple-app-site-association` and Play `assetlinks.json` on the site. Not in v1.

## Device validation checklist

On a Mac with `xcode-select` → `Xcode.app`:

1. `cd mobile && npm run cap:sync`
2. `npm run ios` and/or `npm run android` (or `open:ios` / `open:android` and Run)
3. Confirm the map loads from the **bundled** seed (pins, count label)
4. **Near me** — allow location; list/map should scope to you
5. Open a spot via deep link (`bidetbud://open?spot=…` or `?country=` / `?view=`)
6. **Airplane mode** — kill and reopen; bundled seed still paints the map
7. Go **online** — if production `SEED_VER` / seed fingerprint changed, pins refresh without a store update

## Release (TestFlight / Play internal)

### iOS (TestFlight)

```bash
cd mobile
npm run cap:sync
npm run open:ios
```

In Xcode: App target → Signing & Capabilities → your Team. Product → Archive → Distribute App → TestFlight.

App Privacy: location **used only for Near me**. No tracking. No ad SDK.

### Android (Play internal testing)

```bash
cd mobile
npm run cap:sync
npm run open:android
```

Build → Generate Signed App Bundle. Data safety: location, app functionality, Near me only.

### Splash / icon

Splash and status bar are zinc (`#18181b` splash, `#f4f4f5` bar, dark icons / `Style.LIGHT`). Native topbar is forced opaque in `css/native.css` so the notch is not glass-over-map.

Generate store icons **after** `cap add` (writes into gitignored `ios/` + `android/`):

```bash
cd mobile
npm run assets
# same as: copy images/bidetbud-favicon-192.png → assets/logo.png
# then npx capacitor-assets generate --ios --android --iconBackgroundColor '#18181b' ...
```

The favicon is **192×192**; Apple prefers **1024×1024**. For a store-quality icon, drop a larger square PNG on `mobile/assets/logo.png` and re-run `npm run assets`.

## Deferred in v1

- Universal Links / `assetlinks.json` for `https://bidetbud.com?...` (see TODO above)
- 1024px branded icon (command is ready; source is still the 192 favicon)
- Playwright against the **native** WebView (needs Appium / a booted simulator)
- Shop / HalalBud pages inside the app

Geolocation **is** wired: on a native platform, `native-bridge.js` routes `navigator.geolocation.getCurrentPosition` through `@capacitor/geolocation`.

## Architecture

```
mobile/
  capacitor.config.ts     app id com.bidetbud.app, webDir www
  src/native-bridge.js    splash, status bar, geo, deep links, live seed
  src/deep-link.cjs       bidetbud:// query parser (browser + Node)
  src/native.css          opaque zinc topbar in the WebView
  scripts/sync-web.cjs    root → www (no shop/halal)
  scripts/patch-native.cjs  Info.plist + AndroidManifest + strings
  scripts/test-mobile-smoke.mjs
  scripts/test-deep-link.mjs
  scripts/test-mobile-playwright.mjs
  www/                    generated; do not edit
  ios/  android/          generated by cap add; gitignored
```
