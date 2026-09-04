# Changelog

BidetBud started as **BidetBeacon** on [ymorsi7.github.io](https://github.com/ymorsi7/ymorsi7.github.io) (`new/bidetbeacon.html`). It moved to this repo on **2026-07-02**. Commits before that date are in the github.io repo; commits after are here.

Format: newest first. Skips routine “added N pins” commits unless it was a big batch.

## 2026-09

- Instagram link in footer and menu
- Map tile fallback to OpenStreetMap when Carto Voyager needs an API key

## 2026-08

- Shop page (`shop.html`) with a short list of bidet picks
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
- **HalalBud** — separate halal restaurant map at `halal.html` ([#2](https://github.com/ymorsi7/bidetbud/pull/2))
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

**Counts (approx., `main` today):** ~3,700 bidet pins across 56 countries.

Pre-migration git history: `git log --oneline -- new/bidetbeacon.html` in [ymorsi7/ymorsi7.github.io](https://github.com/ymorsi7/ymorsi7.github.io). Post-migration: `git log --oneline` here.
