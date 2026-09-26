#!/usr/bin/env node
/** Record a BidetBud walkthrough for App Review (Guideline 2.1). */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, cpSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const WWW = join(MOBILE, 'www');
const OUT_DIR = join(MOBILE, 'store', 'ios');
const PORT = 8778;
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

if (!existsSync(join(WWW, 'index.html'))) {
  console.error('run npm run sync:web first');
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

function startServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const pathname = (req.url || '/').split('?')[0];
      const file = join(WWW, pathname === '/' ? '/index.html' : pathname);
      try {
        const body = readFileSync(file);
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

const server = await startServer();
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  geolocation: { latitude: 40.7589, longitude: -73.9851 },
  permissions: ['geolocation'],
  recordVideo: { dir: OUT_DIR, size: { width: 390, height: 844 } },
});
const page = await context.newPage();
page.setDefaultTimeout(45000);

try {
  await page.goto('http://127.0.0.1:' + PORT + '/?view=40.7589,-73.9851,13', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => {
    const el = document.getElementById('countLabel');
    return el && el.textContent && !/loading/i.test(el.textContent);
  });
  await page.waitForTimeout(2800);

  await page.locator('#nearMeBtn').click();
  await page.waitForTimeout(2200);

  await page.locator('.mobile-tab[data-view="list"]').click();
  await page.waitForFunction(() => document.getElementById('appMain')?.classList.contains('show-list'));
  await page.locator('#locationList .card').first().waitFor();
  await page.waitForTimeout(1800);

  await page.locator('#locationList .card').first().click();
  await page.waitForSelector('#detailOverlay.open');
  await page.waitForTimeout(2200);
  await page.locator('.js-open-report, .report-box summary').first().click();
  await page.waitForTimeout(2000);

  await page.locator('#detailBack, #detailClose').first().click();
  await page.waitForTimeout(800);

  await page.locator('#mobileFilterBtn').click();
  await page.waitForSelector('#filterSheetOverlay.open');
  await page.waitForTimeout(1800);
  await page.locator('#filterSheetBack, #filterSheetClose').first().click();
  await page.waitForTimeout(700);

  await page.locator('.mobile-tab[data-view="map"]').click();
  await page.waitForTimeout(900);
  await page.locator('#addFab').click();
  await page.waitForFunction(() => document.body.classList.contains('add-screen-open'));
  await page.locator('#addName').fill('Islamic Center');
  await page.waitForTimeout(2000);
  await page.locator('#addClose').click();
  await page.waitForTimeout(1400);
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  server.close();
  if (video) {
    const tmp = await video.path();
    const dest = join(OUT_DIR, 'bidetbud-app-review.webm');
    cpSync(tmp, dest);
    console.log('wrote', dest);
  }
}
