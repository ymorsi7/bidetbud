#!/usr/bin/env node
/**
 * Bidet map smoke: seed loads, search works, detail opens.
 * Run: node scripts/test-bidet-smoke.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, extname } from 'path';

const ROOT = join(import.meta.dirname, '..');
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
};

function startServer(port = 8770) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      const file = join(ROOT, path);
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

const { server, url } = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => {
      const el = document.getElementById('countLabel');
      return el && el.textContent && !/loading/i.test(el.textContent);
    },
    { timeout: 45000 }
  );

  const countText = await page.locator('#countLabel').textContent();
  if (!/\d/.test(countText || '')) throw new Error('countLabel has no number: ' + countText);

  await page.fill('#searchInput', 'ICSD');
  await page.waitForTimeout(400);
  const cards = page.locator('#locationList .card');
  await cards.first().waitFor({ state: 'visible', timeout: 10000 });

  await cards.first().click();
  await page.locator('#detailOverlay.open').waitFor({ state: 'visible', timeout: 5000 });
  const title = await page.locator('#detailContent h2').textContent();
  if (!title || !/san diego/i.test(title)) throw new Error('detail title unexpected: ' + title);

  await page.locator('#detailClose').click();
  await page.waitForFunction(() => !document.getElementById('detailOverlay')?.classList.contains('open'), {
    timeout: 3000,
  });

  if (errors.length) throw new Error('console errors: ' + errors.join('; '));
  console.log('  ✓ load, search ICSD, open detail');
  console.log('\nBidet smoke checks passed.');
} finally {
  await browser.close();
  server.close();
}
