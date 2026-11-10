#!/usr/bin/env node
/**
 * Shared links restore the map view. The list is nearest-first, not clipped to
 * the current bounds (so an empty ocean view still has a list).
 * Run: node scripts/test-viewport-list.mjs
 */
import { chromium, devices } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, extname } from 'path';

const ROOT = join(import.meta.dirname, '..');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function startServer(port = 8767) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = req.url.split('?')[0];
      const file = join(ROOT, path === '/' ? '/index.html' : path);
      try {
        const body = readFileSync(file);
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    server.listen(port, () => resolve({ server, url: `http://127.0.0.1:${port}/` }));
  });
}

function cityOf(text) {
  return text.split('\n').map((s) => s.trim()).filter(Boolean);
}

const { server, url } = await startServer();
let browser;
try {
  browser = await chromium.launch();

  // A San Diego view lists San Diego spots, not whatever sorts first globally.
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${url}?view=32.7845,-117.0586,11`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const view = new URL(page.url()).searchParams.get('view');
  if (!view || !view.startsWith('32.78')) {
    throw new Error(`?view= was not restored, got ${view}`);
  }
  console.log('  ✓ ?view= restores the map position');

  await page.locator('#locationList .card').first().waitFor({ timeout: 15000 }).catch(async () => {
    throw new Error(`no cards rendered; count line reads "${cityOf(await page.locator('#countLabel').innerText())[0]}"`);
  });
  const firstCity = await page.locator('#locationList .card .loc').first().innerText();
  if (!/San Diego|El Cajon|CA|Chula Vista/.test(firstCity)) {
    throw new Error(`list is not nearest to the map center, first card reads "${firstCity}"`);
  }
  console.log('  ✓ list is nearest-first for the map center');

  const countLine = await page.locator('#countLabel').innerText();
  if (/^0\s/.test(countLine.trim())) {
    throw new Error(`count line is empty: "${cityOf(countLine)[0]}"`);
  }
  console.log('  ✓ count line is non-zero');

  // Panning to empty ocean still lists the closest spots (not 0 items).
  await page.goto(`${url}?view=-40,-130,6`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const oceanCards = await page.locator('#locationList .card').count();
  if (!oceanCards) throw new Error('empty map view cleared the list instead of showing nearest spots');
  console.log('  ✓ empty map view still lists nearest spots');

  // City search must fly to that city, not a brand-name collision overseas.
  await page.goto(`${url}?q=Richardson`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const richardsonLoc = await page.locator('#locationList .card .loc').first().innerText();
  if (!/Richardson|Dallas|Plano|TX/i.test(richardsonLoc) || /Nice|France/i.test(richardsonLoc)) {
    throw new Error(`Richardson search did not land in Texas, first card reads "${richardsonLoc}"`);
  }
  const richardsonView = new URL(page.url()).searchParams.get('view') || '';
  const [rLat, rLng] = richardsonView.split(',').map(Number);
  if (!isFinite(rLat) || !isFinite(rLng) || rLat < 32 || rLat > 34 || rLng > -95 || rLng < -98) {
    throw new Error(`Richardson search map is not over DFW, view=${richardsonView}`);
  }
  console.log('  ✓ Richardson search lands in Texas');

  await page.goto(`${url}?q=NYC`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const nycLoc = await page.locator('#locationList .card .loc').first().innerText();
  if (!/New York|Brooklyn|Queens|Manhattan|NY/i.test(nycLoc)) {
    throw new Error(`NYC search did not land in New York, first card reads "${nycLoc}"`);
  }
  console.log('  ✓ NYC search lands in New York');

  // Countries beyond the original ten hard-coded chips are filterable.
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  if (!(await page.locator('#typeChips .chip[data-type="Austria"]').count())) {
    throw new Error('country chips were not rebuilt from the seed (no Austria chip)');
  }
  console.log('  ✓ country chips are built from the seed');

  // Additive no-bidet mode + status chip must not keep none rows under Verified.
  await page.goto(`${url}?nobidet=1&filter=verified`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const noneUnderVerified = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#locationList .card')];
    return cards.some((c) => c.querySelector('.tag-none'));
  });
  if (noneUnderVerified) {
    throw new Error('?nobidet=1&filter=verified still shows No bidet cards');
  }
  const nobidetParam = new URL(page.url()).searchParams.get('nobidet');
  if (nobidetParam !== '1') throw new Error('?nobidet=1 was not preserved in the URL');
  console.log('  ✓ ?nobidet=1 with verified excludes none rows');

  // Nearest list cards must be representable on the map (marker cap ranks first).
  await page.goto(`${url}?view=32.95,-96.73,12`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const firstCard = page.locator('#locationList .card').first();
  await firstCard.waitFor({ timeout: 15000 });
  await firstCard.click();
  await page.waitForTimeout(500);
  const detailVisible = await page.evaluate(() => {
    const ov = document.getElementById('detailOverlay');
    return !!(ov && ov.classList.contains('open'));
  });
  if (!detailVisible) {
    throw new Error('clicking the nearest list card did not open detail');
  }
  console.log('  ✓ nearest list card opens detail');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Escape closes dialogs; a missing optional element must not break the handler.
  await page.click('#addBtn');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const stillOpen = await page.locator('#addOverlay').evaluate((e) => e.classList.contains('open'));
  if (stillOpen) throw new Error('Escape did not close the add-spot dialog');
  console.log('  ✓ Escape closes dialogs');

  // Mobile keeps the filter toggle labels readable instead of bare icons.
  const mobile = await browser.newPage(devices['iPhone 13']);
  await mobile.goto(url, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(2000);
  await mobile.click('.mobile-tab[data-view="list"]');
  await mobile.waitForTimeout(600);
  for (const id of ['limitedAccessToggle', 'noBidetToggle']) {
    const label = (await mobile.locator(`#${id} span`).innerText()).trim();
    if (!label) throw new Error(`#${id} renders without a visible label on mobile`);
  }
  console.log('  ✓ mobile filter toggles keep their labels');

  // Mobile filter sheet countries come from COUNTRY_FILTERS (same as desktop).
  await mobile.click('#mobileFilterBtn');
  await mobile.waitForTimeout(400);
  if (!(await mobile.locator('#sheetTypeChips .chip[data-type="Austria"]').count())) {
    throw new Error('mobile filter sheet missing Austria chip from COUNTRY_FILTERS');
  }
  if (!(await mobile.locator('#sheetTypeChips .chip[data-type="Spain"]').count())) {
    throw new Error('mobile filter sheet missing Spain chip from COUNTRY_FILTERS');
  }
  console.log('  ✓ mobile filter sheet countries match seed chips');
  await mobile.click('#filterSheetClose');
  await mobile.waitForTimeout(200);

  const mobileCount = await mobile.locator('#countLabel').innerText();
  if (/^0\s/.test(mobileCount.trim())) {
    throw new Error('mobile list view reports zero results');
  }
  console.log('  ✓ mobile list view still has results');

  await mobile.click('.mobile-tab[data-view="map"]');
  await mobile.waitForTimeout(400);
  await mobile.waitForFunction(() => window.__BB_MAP, { timeout: 15000 });
  const zoomed = await mobile.evaluate(() => {
    const mapEl = document.getElementById('map');
    const leafletMap = window.__BB_MAP;
    if (!mapEl || !leafletMap) return { ok: false, reason: 'no map' };
    const before = leafletMap.getZoom();
    const r = mapEl.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const fire = (type, cy, down) => {
      const t = new Touch({
        identifier: 1,
        target: mapEl,
        clientX: x,
        clientY: cy,
        radiusX: 8,
        radiusY: 8,
        rotationAngle: 0,
        force: 1,
      });
      const list = down ? [t] : [];
      mapEl.dispatchEvent(new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        touches: list,
        targetTouches: list,
        changedTouches: [t],
      }));
    };
    fire('touchstart', y, true);
    fire('touchend', y, false);
    fire('touchstart', y, true);
    fire('touchmove', y - 160, true);
    fire('touchend', y - 160, false);
    return { ok: leafletMap.getZoom() > before + 0.4, before, after: leafletMap.getZoom() };
  });
  if (!zoomed.ok) {
    throw new Error(`double-tap-drag did not zoom (before=${zoomed.before}, after=${zoomed.after}, reason=${zoomed.reason || ''})`);
  }
  console.log('  ✓ double-tap-drag zooms the map');

  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  console.log('\nViewport list checks passed.');
} finally {
  await browser?.close();
  server.close();
}
