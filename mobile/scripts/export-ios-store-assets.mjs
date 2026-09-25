#!/usr/bin/env node
/**
 * Writes App Store iPhone screenshots into mobile/store/ios/
 *   6.5"  1242×2688  (414×896 @3x)
 *   6.7"  1290×2796  (430×932 @3x)
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const ROOT = join(MOBILE, '..');
const OUT = join(MOBILE, 'store', 'ios');
const PORT = 8776;

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

const SIZES = [
  { folder: '6.5', width: 414, height: 896, scale: 3 },
  { folder: '6.7', width: 430, height: 932, scale: 3 },
];

mkdirSync(OUT, { recursive: true });

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

async function exportPhoneShots(browser, url, size) {
  const destDir = join(OUT, size.folder);
  mkdirSync(destDir, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.scale,
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
    const dest = join(destDir, name);
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
  for (const size of SIZES) {
    await exportPhoneShots(browser, url, size);
  }
} finally {
  await browser.close();
  server.close();
}
if (!existsSync(join(OUT, '6.5', 'phone-01-map.png'))) {
  console.error('iOS export missing 6.5" map shot');
  process.exit(1);
}
console.log('App Store screenshots ready in', OUT);
