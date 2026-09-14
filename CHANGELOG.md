# Changelog

BidetBud started as **BidetBeacon** on [ymorsi7.github.io](https://github.com/ymorsi7/ymorsi7.github.io) (`new/bidetbeacon.html`). It moved to this repo on **2026-07-02**. Commits before that date are in the github.io repo; commits after are here.

Format: newest first. Skips routine “added N pins” commits unless it was a big batch.

## 2026-10 (early)

**Map/list rework**

- The sidebar list is now **scoped to the map view** — panning or zooming re-renders it, and the count line reads "N places in view of M". Previously the list was global and alphabetical, so the map could sit over North America while the first card was a toilet in Singapore
- Typing a query **flies the map to the matches** instead of leaving them off-screen in a distant cluster
- Default sort is **closest to the map centre** (or to you, with Near me); added a **Closest / Verified first / A–Z** sort control
- **Country chips are generated from the seed** (any country with 10+ pins, ranked by count) instead of ten hard-coded names — Austria, Switzerland, Netherlands, Belgium and Denmark are now filterable, and `?country=` accepts anything in the data
- Shareable **`view=lat,lng,zoom`** and **`sort=`** URL params, so a copied link reproduces what you were looking at
- Empty views get a **"Show all N"** escape hatch rather than a dead end
- Fixed: mobile filter toggles rendered as **unlabelled icons** below 420px (a bare padlock for "Guests only"); the icon drops instead of the label now
- Fixed: **Escape threw** on every keypress because the commented-out three-dots menu was queried unguarded, so it never closed any dialog
- Dropped the "N open access" count chip when every result is open access
- New regression test `scripts/test-viewport-list.mjs` in `npm run test:e2e`

**Data**

- **Open-access** pins ~**2,460+** on the default map (was ~2,120); **`npm run count:public`** gates releases at **3,000**
- Singapore `@toiletswithbidetsg` import: handicap / family-toilet sightings count as **public** (mall & hawker restrooms, not “limited”)
- `scripts/lib/map-public-access.cjs`, `normalize-seed-access.cjs`, `count-mappable-public.cjs`
- Atly global crawler **`--slug-burst=`** for batch slug deep-scans; `import-crawler-json.cjs` (fast merge, no Reddit geocode)
- Fixed stale `if (!match)` guards in several `import-*.cjs` scripts (seed lives in JSON now, not `index.html`)
- `import-france.cjs` keeps TOTO Try WASHLET + Geberit rows when refreshing curated France data
- Re-synced TOTO Try WASHLET finder (~1,310 EU showrooms, `access: public`)
- Reddit + Atly crawl merges: hundreds of **public** restaurant/coffee rows (USA, UK, Canada, France, …)
- Country filters: **Germany**, **Australia**, **Mexico** (desktop + mobile sheet)
- Slim seed carries `verifiedMethod` again so trust lines work from JSON fetch
- Import scripts dedupe on **source URL + venue name** (one article can cite many hotels)
- JSON-LD `WebSite` on the map home page
- Seed cache **`20261005a`**

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

- **2026-07-02** — Repo created; files migrated from GitHub Pages (~408 pins, USA / UK / Canada). `bidetbeacon.html` removed from github.io; `/bidetbeacon` redirects to [bidetbud.com](https://bidetbud.com/)
- **2026-07-04** — Renamed BidetBeacon → BidetBud in code and domain
- **2026-07-05** — Portfolio footer links on github.io updated to bidetbud.com
- Singapore community data imported ([@toiletswithbidetsg](https://www.instagram.com/toiletswithbidetsg/))
- Bulk imports: TOTO WASHLET references, Geberit AquaClean hotels, Russia / China / Africa / Mexico crawlers
- “Report incorrect info” and “no bidet here” on the add-spot form
- Async seed load (`bidet-seed.json`) so the map opens faster ([#1](https://github.com/ymorsi7/bidetbud/pull/1))
- **HalalBud** — separate halal restaurant map ([#2](https://github.com/ymorsi7/bidetbud/pull/2)); now served at `/halal/`
- Search: acronym matching (e.g. ICSD → Islamic Center of San Diego)
- Filter overlay and legend UI fixes
- Add-spot form moved to Web3Forms (was FormSubmit on GitHub Pages)

## 2026-06 (GitHub Pages — BidetBeacon)

Hosted at `ymorsi7.github.io/new/bidetbeacon.html`, linked from the portfolio site footer.

- **2026-06-03** — First public version: Leaflet map, ~40 verified masajid and restaurants (USA, UK, Canada)
- Same day: bulk seed import brought the list to ~200 pins
- Add-spot form (FormSubmit), search, masjid/restaurant filters, map legend (verified / heated / web)
- GoatCounter analytics; GitHub star link in footer
- **2026-06-04** — Green overlay for bidet-friendly countries; custom favicon; YouTube demo link in footer; promo popup asking visitors to submit spots; first form submissions merged in; geocode helper script (`apply-address-fixes.cjs`)
- **2026-06-06** — +25 verified locations in one batch
- Through **2026-06-30** — Steady community additions; ~408 pins total (340 USA, 46 UK, 22 Canada)

---

**Counts (approx., `main` today):** ~3,870 seed rows; **~2,460** mappable **open access** pins — run `node scripts/scrape-atly-na.cjs` + `import-na-bidets.cjs` / global list bursts to push past **3,000** (`npm run count:public`).

Pre-migration git history: `git log --oneline -- new/bidetbeacon.html` in [ymorsi7/ymorsi7.github.io](https://github.com/ymorsi7/ymorsi7.github.io). Post-migration: `git log --oneline` here.
