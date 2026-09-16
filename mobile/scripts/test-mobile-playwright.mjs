#!/usr/bin/env node
/**
 * Serve mobile/www and exercise the map in a 390×844 WebView-sized browser.
 * Run after sync-web: npm run test:mobile:playwright
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const WWW = join(MOBILE, 'www');
const PORT = 8772;

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

function startServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const pathname = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      const file = join(WWW, pathname);
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

  await page.locator('#addBtn').click();
  await page.waitForFunction(
    () => document.body.classList.contains('add-screen-open'),
    { timeout: 3000 }
  );
  const addLayout = await page.evaluate(() => {
    const title = document.getElementById('addTitle');
    const close = document.getElementById('addClose');
    const name = document.getElementById('addName');
    const shell = document.querySelector('.shell');
    const titleBox = title.getBoundingClientRect();
    const closeBox = close.getBoundingClientRect();
    return {
      shellHidden: getComputedStyle(shell).display === 'none',
      nameFont: getComputedStyle(name).fontSize,
      titleText: (title.textContent || '').trim(),
      titleTop: titleBox.top,
      titleVisible: titleBox.bottom > 0 && titleBox.top < window.innerHeight && titleBox.height > 0,
      closeText: (close.textContent || '').trim(),
      closeVisible: closeBox.width > 0 && closeBox.top >= 0 && closeBox.right <= window.innerWidth,
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
  if (addLayout.closeText !== 'Close' || !addLayout.closeVisible) {
    throw new Error('Close control missing on the add screen');
  }
  if (addLayout.nameFont !== '16px') {
    throw new Error('add name field must be 16px to avoid iOS zoom, got ' + addLayout.nameFont);
  }
  if (addLayout.pageOverflowX) {
    throw new Error('add screen requires sideways scroll');
  }

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
  console.log('  ✓ Suggest a spot is a full-screen page with a Close control');
  console.log('  ✓ no pageerror');
  console.log('\nmobile Playwright checks passed.');
} finally {
  await browser.close();
  server.close();
}
