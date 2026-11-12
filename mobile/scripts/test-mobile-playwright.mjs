#!/usr/bin/env node
/**
 * Serve mobile/www and exercise the map in a 390×844 WebView-sized browser.
 * Run after sync-web: npm run test:mobile:playwright
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const MOBILE = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const ROOT = join(MOBILE, '..');
const WWW = join(MOBILE, 'www');
const PORT = 8772;

const { buildPublicSeed, countryCounts } = require(join(ROOT, 'scripts/lib/public-map-seed.cjs'));
const SAMPLE = join(ROOT, 'bidet-seed.sample.json');
const FIXTURE_SPOTS = buildPublicSeed(
  JSON.parse(readFileSync(SAMPLE, 'utf8'))
).filter((r) => r.bidetStatus !== 'none');
const FIXTURE_VER = 'mobile-playwright';

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

if (!existsSync(join(WWW, 'index.html'))) {
  console.error('mobile/www/index.html missing — run npm run sync:web first');
  process.exit(1);
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const pathname = (req.url || '/').split('?')[0];
      // Local fixture — CI has no sealed seed; www never ships bidet-seed.json.
      if (pathname === '/api/session') {
        return sendJson(res, 200, { ok: true, ver: FIXTURE_VER });
      }
      if (pathname === '/api/bootstrap') {
        return sendJson(res, 200, {
          ok: true,
          ver: FIXTURE_VER,
          total: FIXTURE_SPOTS.length,
          countries: countryCounts(FIXTURE_SPOTS),
          spots: FIXTURE_SPOTS,
        });
      }
      if (pathname === '/api/spot') {
        const id = new URL(req.url || '/', 'http://127.0.0.1').searchParams.get('id') || '';
        const spot = FIXTURE_SPOTS.find((r) => r.id === id);
        if (!spot) return sendJson(res, 404, { error: 'not found' });
        return sendJson(res, 200, { spot });
      }
      const filePath = pathname === '/' ? '/index.html' : pathname;
      const file = join(WWW, filePath);
      try {
        const body = readFileSync(file);
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      resolve({ server, url: 'http://127.0.0.1:' + PORT + '/' });
    });
  });
}

const { server, url } = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => {
      const el = document.getElementById('countLabel');
      return el && el.textContent && el.textContent.trim() && !/loading/i.test(el.textContent);
    },
    { timeout: 45000 }
  );

  const countText = (await page.locator('#countLabel').textContent()) || '';
  if (!/\d/.test(countText)) {
    throw new Error('count label empty or has no number: ' + countText);
  }

  const tabs = page.locator('.mobile-tabs');
  await tabs.waitFor({ state: 'visible', timeout: 5000 });
  const tabsDisplay = await tabs.evaluate((el) => getComputedStyle(el).display);
  if (tabsDisplay === 'none') throw new Error('Map/List tabs hidden at 390×844');

  const mapTab = page.locator('.mobile-tab[data-view="map"]');
  const listTab = page.locator('.mobile-tab[data-view="list"]');
  await mapTab.waitFor({ state: 'visible' });
  await listTab.waitFor({ state: 'visible' });

  await listTab.click();
  await page.waitForFunction(
    () => document.getElementById('appMain')?.classList.contains('show-list'),
    { timeout: 3000 }
  );
  const listActive = await listTab.getAttribute('aria-selected');
  if (listActive !== 'true') throw new Error('List tab did not become selected');

  await mapTab.click();
  await page.waitForFunction(
    () => !document.getElementById('appMain')?.classList.contains('show-list'),
    { timeout: 3000 }
  );

  const addBtnHidden = await page.locator('#addBtn').evaluate(
    (el) => getComputedStyle(el).display === 'none'
  );
  if (!addBtnHidden) throw new Error('header Add should be hidden on mobile in favor of the map FAB');

  const fab = page.locator('#addFab');
  await fab.waitFor({ state: 'visible' });
  const locate = page.locator('#locateFab');
  await locate.waitFor({ state: 'visible' });
  const stack = await page.evaluate(() => {
    const loc = document.getElementById('locateFab').getBoundingClientRect();
    const plus = document.getElementById('addFab').getBoundingClientRect();
    return {
      gap: plus.top - loc.bottom,
      rightDelta: Math.abs(loc.right - plus.right),
    };
  });
  if (stack.gap < 6 || stack.gap > 16) {
    throw new Error('locate/plus stack gap should be ~10px, got ' + stack.gap);
  }
  if (stack.rightDelta > 6) {
    throw new Error('locate/plus should share the same right edge, delta=' + stack.rightDelta);
  }

  await fab.click();
  await page.waitForFunction(
    () => document.body.classList.contains('add-screen-open'),
    { timeout: 4000 }
  );
  const addUi = await page.evaluate(() => {
    const addr = document.getElementById('addAddress');
    const controls = document.getElementById('mapControls');
    const intro = document.getElementById('addIntro');
    return {
      addrVisible: !!(addr && addr.offsetParent && addr.getBoundingClientRect().height > 0),
      controlsHidden: !controls || getComputedStyle(controls).display === 'none',
      intro: (intro && intro.textContent || '').trim(),
    };
  });
  if (!addUi.addrVisible) throw new Error('Suggest a spot should show the Where field without opening More');
  if (!addUi.controlsHidden) throw new Error('map FABs should hide on the Suggest a spot screen');
  await page.locator('#addClose').click();
  await page.waitForFunction(
    () => !document.body.classList.contains('add-screen-open'),
    { timeout: 3000 }
  );

  await listTab.click();
  await page.waitForFunction(
    () => document.getElementById('appMain')?.classList.contains('show-list'),
    { timeout: 3000 }
  );
  if (!(await fab.isVisible())) {
    throw new Error('Suggest a spot FAB should stay available on the List tab');
  }

  await page.locator('#locationList .card').first().waitFor({ timeout: 8000 });
  await page.locator('#locationList .card').first().click();
  await page.locator('#detailOverlay.open').waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  const sheet = await page.evaluate(() => {
    const overlay = document.getElementById('detailOverlay');
    const dialog = document.getElementById('detailDialog');
    const handle = document.getElementById('detailSheetHandle');
    const box = dialog.getBoundingClientRect();
    return {
      height: box.height,
      top: box.top,
      vh: window.innerHeight,
      peek: overlay.classList.contains('detail-snap-peek'),
      handleH: handle ? handle.getBoundingClientRect().height : 0,
      handleOn: !!(handle && getComputedStyle(handle).display !== 'none'),
      pageOpen: document.body.classList.contains('native-page-open'),
    };
  });
  if (sheet.pageOpen) throw new Error('place detail should not be a full-screen native page');
  if (!sheet.peek || !sheet.handleOn || sheet.handleH < 8) {
    throw new Error('place detail should open as a peek sheet with a drag handle');
  }
  if (sheet.height > sheet.vh * 0.62 || sheet.top < sheet.vh * 0.35 || sheet.top > sheet.vh - 80) {
    throw new Error('place card took too much of the screen: h=' + Math.round(sheet.height) + ' top=' + Math.round(sheet.top));
  }

  await page.locator('#detailSheetHandle').evaluate((el) => el.click());
  await page.waitForFunction(
    () => document.getElementById('detailOverlay')?.classList.contains('detail-snap-expanded'),
    null,
    { timeout: 2000 }
  );
  await page.waitForFunction(
    (prev) => document.getElementById('detailDialog').getBoundingClientRect().height > prev + 40,
    sheet.height,
    { timeout: 2000 }
  );

  await page.locator('#detailSheetHandle').evaluate((el) => el.click());
  await page.waitForFunction(
    () => document.getElementById('detailOverlay')?.classList.contains('detail-snap-peek'),
    null,
    { timeout: 2000 }
  );

  await page.locator('.js-suggest-update').first().waitFor({ timeout: 5000 });
  await page.locator('.js-suggest-update').first().click();
  await page.waitForFunction(
    () => document.body.classList.contains('add-screen-open') &&
      (document.getElementById('addTitle')?.textContent || '').trim() === 'Suggest an update',
    { timeout: 4000 }
  );
  const prefillName = (await page.locator('#addName').inputValue()).trim();
  if (!prefillName) throw new Error('Suggest an update did not prefill the place name');
  const updateBanner = await page.locator('#addUpdateBanner').evaluate((el) => ({
    hidden: el.hidden,
    text: (el.textContent || '').trim(),
  }));
  if (updateBanner.hidden || !/Updating/i.test(updateBanner.text)) {
    throw new Error('Suggest an update is missing the updating banner');
  }
  await page.locator('#addClose').click();
  await page.waitForFunction(
    () => !document.body.classList.contains('add-screen-open'),
    { timeout: 3000 }
  );

  await mapTab.click();
  await fab.click();
  await page.waitForFunction(
    () => document.body.classList.contains('add-screen-open'),
    { timeout: 3000 }
  );
  const addLayout = await page.evaluate(() => {
    const title = document.getElementById('addTitle');
    const close = document.getElementById('addClose');
    const name = document.getElementById('addName');
    const submit = document.getElementById('submitAdd');
    const more = document.getElementById('addMoreDetails');
    const addr = document.getElementById('addAddress');
    const shell = document.querySelector('.shell');
    const titleBox = title.getBoundingClientRect();
    const closeBox = close.getBoundingClientRect();
    const submitBox = submit.getBoundingClientRect();
    return {
      shellHidden: getComputedStyle(shell).display === 'none',
      nameFont: getComputedStyle(name).fontSize,
      titleText: (title.textContent || '').trim(),
      titleTop: titleBox.top,
      titleVisible: titleBox.bottom > 0 && titleBox.top < window.innerHeight && titleBox.height > 0,
      closeText: (close.textContent || '').trim(),
      closeVisible: closeBox.width > 0 && closeBox.top >= 0 && closeBox.right <= window.innerWidth,
      submitVisible: submitBox.top < window.innerHeight && submitBox.bottom > 0,
      moreLabel: (more?.querySelector('summary')?.textContent || '').trim(),
      addrOnScreen: !!(addr && addr.getBoundingClientRect().height > 0 && addr.getBoundingClientRect().top < window.innerHeight),
      pageOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  if (!addLayout.shellHidden) {
    throw new Error('Suggest a spot should replace the map, not sit in a popup over it');
  }
  if (addLayout.titleText !== 'Suggest a spot') {
    throw new Error('missing Suggest a spot screen title');
  }
  if (!addLayout.titleVisible || addLayout.titleTop < 0) {
    throw new Error('Suggest a spot title is not on screen');
  }
  if (addLayout.closeText !== 'Cancel' || !addLayout.closeVisible) {
    throw new Error('Cancel control missing on the add screen');
  }
  if (!addLayout.submitVisible) {
    throw new Error('Submit is not pinned on screen');
  }
  if (!/Photo or note/i.test(addLayout.moreLabel)) {
    throw new Error('optional photo/note should stay collapsed: ' + addLayout.moreLabel);
  }
  if (!addLayout.addrOnScreen) {
    throw new Error('Where field should be visible on Suggest a spot');
  }
  if (addLayout.nameFont !== '16px') {
    throw new Error('add name field must be 16px to avoid iOS zoom, got ' + addLayout.nameFont);
  }
  if (addLayout.pageOverflowX) {
    throw new Error('add screen requires sideways scroll');
  }

  await page.locator('#addName').fill('Islamic Center');
  await page.waitForFunction(
    () => document.querySelectorAll('#addDupes .add-dupe').length > 0,
    { timeout: 5000 }
  );

  await page.locator('#addName').click();
  const afterFocus = await page.evaluate(() => {
    const title = document.getElementById('addTitle');
    const box = title.getBoundingClientRect();
    return { top: box.top, visible: box.height > 0 && box.top >= 0 && box.top < 120 };
  });
  if (!afterFocus.visible) {
    throw new Error('title left the screen after focusing the name field (top=' + afterFocus.top + ')');
  }

  await page.locator('#addClose').click();
  await page.waitForFunction(
    () => !document.body.classList.contains('add-screen-open'),
    { timeout: 3000 }
  );

  if (pageErrors.length) {
    throw new Error('pageerror on load: ' + pageErrors.join('; '));
  }

  console.log('  ✓ seed loaded (' + countText.trim().slice(0, 80) + ')');
  console.log('  ✓ Map / List tabs visible and switchable at 390×844');
  console.log('  ✓ Suggest a spot is a full-screen page with Cancel, Submit, and duplicate matches');
  console.log('  ✓ no pageerror');
  console.log('\nmobile Playwright checks passed.');
} finally {
  await browser.close();
  server.close();
}
