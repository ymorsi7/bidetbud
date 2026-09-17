#!/usr/bin/env node
/**
 * Writes Google Play listing graphics into mobile/store/play/
 *   icon-512.png          512×512
 *   feature-graphic.png   1024×500
 *   phone-0N-*.png        1080×1920 (9:16)
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const ROOT = join(MOBILE, '..');
const OUT = join(MOBILE, 'store', 'play');
const ICON_SRC = join(OUT, 'icon-512.png');
const PORT = 8775;

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

mkdirSync(OUT, { recursive: true });
if (!existsSync(ICON_SRC)) {
  console.error('missing', ICON_SRC);
  process.exit(1);
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const raw = (req.url || '/').split('?')[0];
      const pathname = raw === '/' ? '/index.html' : raw;
      const file = join(ROOT, pathname);
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

async function exportFeatureGraphic(browser) {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 500 },
    deviceScaleFactor: 1,
  });
  const iconData = readFileSync(ICON_SRC).toString('base64');
  await page.setContent(`<!doctype html>
<html><head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:1024px;height:500px;overflow:hidden;background:#0a0a0a;}
  .wrap{display:flex;align-items:center;width:1024px;height:500px;}
  .art{width:420px;height:500px;object-fit:cover;object-position:50% 42%;flex:none;}
  .copy{padding:0 72px 0 36px;}
  h1{margin:0;color:#fff;font:700 72px/1 Inter,system-ui,sans-serif;letter-spacing:-2.4px;}
  p{margin:16px 0 0;color:#a1a1aa;font:500 26px/1.25 Inter,system-ui,sans-serif;letter-spacing:-.3px;}
</style>
</head>
<body>
  <div class="wrap">
    <img class="art" alt="" src="data:image/png;base64,${iconData}">
    <div class="copy">
      <h1>BidetBud</h1>
      <p>Find bidets near you</p>
    </div>
  </div>
</body></html>`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(200);
  const dest = join(OUT, 'feature-graphic.png');
  await page.screenshot({ path: dest, type: 'png', clip: { x: 0, y: 0, width: 1024, height: 500 } });
  await page.close();
  console.log('wrote', dest);
}

async function dismissChrome(page) {
  await page.evaluate(() => {
    const toast = document.getElementById('loadToast');
    if (toast) toast.style.display = 'none';
    const promo = document.getElementById('promoOverlay');
    if (promo) promo.classList.remove('open');
    document.body.classList.remove('modal-open');
  });
}

async function waitReady(page) {
  await page.waitForFunction(
    () => {
      const el = document.getElementById('countLabel');
      return el && el.textContent && !/loading/i.test(el.textContent);
    },
    { timeout: 90000 }
  );
  await page.waitForTimeout(1600);
  await dismissChrome(page);
}

async function exportPhoneShots(browser, url) {
  const page = await browser.newPage({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  page.setDefaultTimeout(90000);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(url + '?view=40.7589,-73.9851,13', { waitUntil: 'domcontentloaded', timeout: 90000 });
  try {
    await waitReady(page);
  } catch (err) {
    const hint = await page.evaluate(() => (document.getElementById('countLabel') || {}).textContent || '(no countLabel)');
    throw new Error('seed did not finish: ' + hint + ' pageerror=' + pageErrors.join('; ') + ' — ' + err.message);
  }

  const shot = async (name) => {
    const dest = join(OUT, name);
    await page.screenshot({ path: dest, type: 'png' });
    console.log('wrote', dest);
  };

  await shot('phone-01-map.png');

  await page.locator('.mobile-tab[data-view="list"]').click();
  await page.waitForFunction(() => document.getElementById('appMain')?.classList.contains('show-list'));
  await page.locator('#locationList .card').first().waitFor({ timeout: 8000 });
  await page.waitForTimeout(400);
  await shot('phone-02-list.png');

  await page.locator('#locationList .card').first().click();
  await page.waitForSelector('#detailOverlay.open', { timeout: 5000 });
  await page.waitForTimeout(400);
  await shot('phone-03-detail.png');

  await page.locator('#detailClose').click();
  await page.locator('.mobile-tab[data-view="map"]').click();
  await page.waitForFunction(() => !document.getElementById('appMain')?.classList.contains('show-list'));
  await page.locator('#addFab').click();
  await page.waitForFunction(() => document.body.classList.contains('add-screen-open'));
  await page.waitForTimeout(250);
  await shot('phone-04-add.png');

  await page.locator('#addName').fill('Islamic Center');
  await page.waitForFunction(() => document.querySelectorAll('#addDupes .add-dupe').length > 0, { timeout: 5000 });
  await page.waitForTimeout(250);
  await shot('phone-05-matches.png');

  await page.close();
}

const { server, url } = await startServer();
const browser = await chromium.launch();
try {
  await exportFeatureGraphic(browser);
  await exportPhoneShots(browser, url);
} finally {
  await browser.close();
  server.close();
}
console.log('Play store assets ready in', OUT);
