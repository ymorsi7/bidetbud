# Changelog

BidetBud started as **BidetBeacon** on [ymorsi7.github.io](https://github.com/ymorsi7/ymorsi7.github.io) (`new/bidetbeacon.html`). It moved to this repo on **2026-07-02**. Commits before that date are in the github.io repo; commits after are here.

Format: newest first. Skips routine “added N pins” commits unless it was a big batch. **Every user-facing or seed-policy change must land here in the same PR/commit** (see `AGENTS.md`).

## 2026-11-24

**Map / UI**

- Fixed mobile **Suggest a spot** screen: `#addDialog` `max-height:720px` was beating the full-screen rules, so the form floated as a short card with gaps. Now true full-bleed on phone / Capacitor, cleaner labels, Yes/No control, and keyboard-safe footer. Mobile **1.0.5 (19)**.

**Map / API**

- Fixed TestFlight / Capacitor empty map: CapHttp omits Origin so `/api/bootstrap` was 403. Native client now warms `/api/session`, then sends `Authorization: Bearer` (Netlify was stripping custom `X-BB-S`).
- Fixed Xcode Cloud hard-fail: `ci_post_clone` `grep CapPackages` exited 1 after Cap sync rewrote `CapApp-SPM` to `node_modules`. Cloud scripts now rewrite SPM to vendored `CapPackages` and assert before archive. Mobile **1.0.5 (18)**.

**Demo**

- YouTube A/B pack v2: 3 distinct colorful thumbs (emerald masjid / cream 10K+ / blue near-me split) with large type + paired titles

## 2026-11-23

**Demo**

- HyperFrames 60s product film under `demo/` (cold open → world pins → live UI verbs → evidence → phone + Moka clip → add a spot → bidetbud.com)
- YouTube thumbnail composited from real Near me + Moka captures (`demo/assets/youtube-thumbnail.jpg`)
- Demo audio: wordless vocal-pad bed (no religious lyrics) + UI SFX; YouTube thumbnail rebuilt in modern sans (no Impact yellow)
- Demo: "Bidets." land now hits with riser/impact/pop/spray SFX and a harder visual pop

**Mobile / TestFlight**

- Bumped to **1.0.4 (16)** and re-synced `App/public` from the current map shell (was stuck on a Nov 21 copy)
- Xcode Cloud `ci_post_clone.sh` now runs `sync:web` + copies into `App/public` + `patch-native` so Cloud builds stop shipping a stale web bundle

## 2026-11-22

**Map / UI**

- New **Bidet blog** at `/blog/` (same topbar/footer chrome as Privacy/Shop)
- Footer + menu links: Blog and [github.com/ymorsi7/bidetbud](https://github.com/ymorsi7/bidetbud)
- First post: Nov 21 Astoria field note with muted portrait video of the Moka & Co sprayer
- Blog: Nov 22 Bridgeview / Chicagoland field note (Jazwah, M'daKhan, ZamZam Sweets)
- First clean visit to the map opens the US overview (`/?view=36.8741,-103.2715,4`); shared links still win. Added a 15 mi radius chip.
- Stopped the bare map load from `fitBounds` to every pin worldwide (that was rewriting the URL to a mid-Atlantic zoom-3 view).

**Data**

- Added **Moka & Co** (28-54 Steinway St, Astoria, NY) as `verified` - in-person bidet confirmation
- Added **Zmzm Sweets** (10511 S Harlem Ave, Chicago Ridge / Bridgeview area) as `verified` - in-person bidet confirmation
- Added **M'daKhan** (9115 S Harlem Ave, Bridgeview, IL) as `none` - in-person check, no bidet

## 2026-11-21

**Mobile / Xcode Cloud**

- Fixed Archive failure: `capacitor.config.json` and `config.xml` were gitignored under `mobile/ios/` so Cloud had no Resources to copy. Track them, regenerate in `ci_post_clone` if missing, bump to 1.0.3 (15)

**Map / seed quality**

- **Permanently closed** venues: seed field `closed: true`. Hidden from the default map/list; still findable by name search with a Closed badge, grey marker, and detail banner. Report form already had "Permanently closed" - apply this flag when those reports check out.
- Marked **Zauo** (152 W 24th St, NYC) permanently closed
- Corrected **Five Guys** (56 W 14th St, NYC): in-person check -> `bidetStatus: "none"` (Atly "bidet toilets" claim was wrong)
- `isClosed` in `js/core.js`; `closed` passed through `normalizeSeed`, slim seed, and sealed public rows
- **AGENTS.md**: changelog is required on every noticeable change; **no em dashes** (U+2014) or en dashes (U+2013) anywhere in the repo (use ASCII `-`)

## 2026-11-18

**Mobile / TestFlight (Xcode Cloud)**

- Wired **Xcode Cloud** archive path for App Store / TestFlight (`mobile/ios/App/App.xcodeproj`, shared `App` scheme, vendored CapPackages / CapApp-SPM)
- Fixed SPM resolve on Cloud (no more `node_modules`-only package paths)
- Xcode 26+ ad-hoc archive fix: Release sets `CODE_SIGNING_ALLOWED = NO` so Cloud can archive with `CODE_SIGN_IDENTITY=-` and re-sign on export
- App Store review assets and reply notes under `mobile/store/ios/`
- App bug fixes and UI polish on the Capacitor shell

**Data**

- Location coordinate accuracy audit + duplicate cleanup
- Form masajid fills and SoCal naming conflict fixes (earlier in the week: 2026-11-12)

## 2026-11-10

**API / privacy**

- Map pins no longer ship as a public `bidet-seed.json` dump
- Sealed AES blob (`npm run seal` → `netlify/functions/_data/map-seed.enc`) served via rate-limited `/api/*` (session, spots, search, spot, meta, bootstrap)
- Plaintext research `data/` stays gitignored; sample seed for OSS
- Full-map boot via one `/api/bootstrap` request; sealed-seed path fix inside Netlify function bundles
- Mobile CI no longer depends on a root plaintext seed file

## 2026-11 (early)

- Map/tile and UX follow-ups (`maps`, issue closes)
- Ongoing pin and copy updates ahead of the sealed-API cutover

## 2026-10 (late)

**Map / UI**

- **No-bidet** listings (`bidetStatus: "none"`): shown in no-bidet mode or when searching by name, with distinct list/detail styling
- Search improvements (scoring / name matching in `js/search-seed.js`)
- UI fixes on web + iOS (filters, detail sheet, native polish)

**Data**

- Philippines location imports
- Batch pin adds, form imports, Dallas masjid / IACC naming fixes
- Kafi BBQ and other community spots
- Pin duplicate removal
- Carto Voyager basemap key read from `window.BIDETBUD_CARTO_KEY` (secret not committed)

## 2026-10 (early)

**Map/list rework**

- The sidebar list is **scoped to the map view** - panning or zooming re-renders it, and the count line reads "N places in view of M". Previously the list was global and alphabetical, so the map could sit over North America while the first card was a toilet in Singapore
- Typing a query **flies the map to the matches** instead of leaving them off-screen in a distant cluster
- Default sort is **closest to the map centre** (or to you, with Near me); added a **Closest / Verified first / A-Z** sort control
- **Country chips are generated from the seed** (any country with 10+ pins, ranked by count) instead of ten hard-coded names - Austria, Switzerland, Netherlands, Belgium and Denmark are now filterable, and `?country=` accepts anything in the data
- Shareable **`view=lat,lng,zoom`** and **`sort=`** URL params, so a copied link reproduces what you were looking at
- Empty views get a **"Show all N"** escape hatch rather than a dead end
- Fixed: mobile filter toggles rendered as **unlabelled icons** below 420px (a bare padlock for "Guests only"); the icon drops instead of the label now
- Fixed: **Escape threw** on every keypress because the commented-out three-dots menu was queried unguarded, so it never closed any dialog
- Dropped the "N open access" count chip when every result is open access
- New regression test `scripts/test-viewport-list.mjs` in `npm run test:e2e`

**Data**

- **Open-access** pins ~**2,460+** on the default map (was ~2,120); **`npm run count:public`** gates releases at **3,000**
- Singapore `@toiletswithbidetsg` import: handicap / family-toilet sightings count as **public** (mall and hawker restrooms, not "limited")
- `scripts/lib/map-public-access.cjs`, `normalize-seed-access.cjs`, `count-mappable-public.cjs`
- Atly global crawler **`--slug-burst=`** for batch slug deep-scans; `import-crawler-json.cjs` (fast merge, no Reddit geocode)
- Fixed stale `if (!match)` guards in several `import-*.cjs` scripts (seed lives in JSON now, not `index.html`)
- `import-france.cjs` keeps TOTO Try WASHLET + Geberit rows when refreshing curated France data
- Re-synced TOTO Try WASHLET finder (~1,310 EU showrooms, `access: public`)
- Reddit + Atly crawl merges: hundreds of **public** restaurant/coffee rows (USA, UK, Canada, France, and more)
- Country filters: **Germany**, **Australia**, **Mexico** (desktop + mobile sheet)
- Slim seed carries `verifiedMethod` again so trust lines work from JSON fetch
- Import scripts dedupe on **source URL + venue name** (one article can cite many hotels)
- JSON-LD `WebSite` on the map home page
- Seed cache **`20261005a`**

## 2026-09-23 to 2026-09-30

- **Privacy** page and other App Store / store-listing friendly pages
- App Store dependency and asset prep; UI/UX passes on web and native
- Islamic Center of Tucson and other single-spot adds
- Capacitor app assets and store adjustments

## 2026-09-15

**Mobile (Capacitor)**

- iOS + Android shell under `mobile/` wrapping the same static map (offline `sync:web` -> `www/`, optional live refresh of seed from bidetbud.com)
- Capacitor 8, bundle id `com.bidetbud.app`, custom scheme `bidetbud://open?spot=&view=&country=`
- Smoke, deep-link unit tests, Playwright at 390x844; GitHub Actions job `Mobile` / `mobile` (no Xcode)
- Native trees (`ios/`, `android/`, `www/`) stay gitignored so Netlify still publishes the repo root
- Same-day UI/UX, popup, and footer fixes on the main site

## 2026-09 (late)

**Week of 2026-09-28**

- +9 net-new map rows from curated imports (~3,728 total): six Tokyo hotels (Mighty Travels WASHLET roundup), Yosaku Portland, and other NA supplemental entries
- Manual spot tests for Yosaku, Ayat Bushwick, Miyabi 45th

**Week of 2026-09-21**

- `import-verified-expansion.cjs` / `import-na-bidets.cjs` / `import-western.cjs` evidence dedupe fix
- Re-ran expansion + NA imports after dedupe change

**Week of 2026-09-14** (validator sprint)

- Seed validator (`npm run test:seed`) for map rows, sources, and slim/full drift
- Singapore country filter chip; meta and About copy match global coverage
- Footer **Copy link** (⋯ menu still hidden; shop/HalalBud footer links stay commented out)
- Add-spot form inline errors; photo link must be http(s)
- Search/normalize logic in `js/search-seed.js`; Playwright smoke test (load, ICSD search, detail)

## 2026-09 (mid)

- Repo layout: HalalBud under `halal/`; shop under `shop/`. Old URLs redirect via `_redirects`.
- Instagram link in footer and menu
- Map tile fallback to OpenStreetMap when Carto Voyager needs an API key

## 2026-08

- Shop page (`/shop/`) with a short list of bidet picks
- Community form submissions processed into the seed (Dallas, Bay Area, NYC, etc.)
- Australia and New Zealand import scripts and data
- Distance units follow the browser locale (mi vs km)
- Seed caching fix (some pins were not showing after deploy)
- Mobile layout fixes on the detail sheet and filters

## 2026-07 (this repo)

- **2026-07-02** - Repo created; files migrated from GitHub Pages (~408 pins, USA / UK / Canada). `bidetbeacon.html` removed from github.io; `/bidetbeacon` redirects to [bidetbud.com](https://bidetbud.com/)
- **2026-07-04** - Renamed BidetBeacon → BidetBud in code and domain
- **2026-07-05** - Portfolio footer links on github.io updated to bidetbud.com
- Singapore community data imported ([@toiletswithbidetsg](https://www.instagram.com/toiletswithbidetsg/))
- Bulk imports: TOTO WASHLET references, Geberit AquaClean hotels, Russia / China / Africa / Mexico crawlers
- “Report incorrect info” and “no bidet here” on the add-spot form
- Async seed load (`bidet-seed.json`) so the map opens faster ([#1](https://github.com/ymorsi7/bidetbud/pull/1))
- **HalalBud** - separate halal restaurant map ([#2](https://github.com/ymorsi7/bidetbud/pull/2)); now served at `/halal/`
- Search: acronym matching (e.g. ICSD → Islamic Center of San Diego)
- Filter overlay and legend UI fixes
- Add-spot form moved to Web3Forms (was FormSubmit on GitHub Pages)

## 2026-06 (GitHub Pages - BidetBeacon)

Hosted at `ymorsi7.github.io/new/bidetbeacon.html`, linked from the portfolio site footer.

- **2026-06-03** - First public version: Leaflet map, ~40 verified masajid and restaurants (USA, UK, Canada)
- Same day: bulk seed import brought the list to ~200 pins
- Add-spot form (FormSubmit), search, masjid/restaurant filters, map legend (verified / heated / web)
- GoatCounter analytics; GitHub star link in footer
- **2026-06-04** - Green overlay for bidet-friendly countries; custom favicon; YouTube demo link in footer; promo popup asking visitors to submit spots; first form submissions merged in; geocode helper script (`apply-address-fixes.cjs`)
- **2026-06-06** - +25 verified locations in one batch
- Through **2026-06-30** - Steady community additions; ~408 pins total (340 USA, 46 UK, 22 Canada)

---

**Counts (approx., `main` today):** ~3,870 seed rows; **~2,460** mappable **open access** pins - run `node scripts/scrape-atly-na.cjs` + `import-na-bidets.cjs` / global list bursts to push past **3,000** (`npm run count:public`).

Pre-migration git history: `git log --oneline -- new/bidetbeacon.html` in [ymorsi7/ymorsi7.github.io](https://github.com/ymorsi7/ymorsi7.github.io). Post-migration: `git log --oneline` here.
