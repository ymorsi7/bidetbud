#!/usr/bin/env node
/**
 * Sidebar pin-colors control opens full legend modal.
 * Run: node scripts/test-legend-ui.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, extname } from 'path';

const ROOT = join(import.meta.dirname, '..');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function startServer(port = 8766) {
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
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sidebar-legend', { timeout: 10000 });

  const mapLegend = page.locator('.map-legend');
  if (await mapLegend.count()) {
    throw new Error('On-map legend bar should be removed');
  }

  const legend = page.locator('.sidebar-legend-btn');
  const text = await legend.innerText();
  if (!/Pin colors/.test(text)) {
    throw new Error('Sidebar legend missing Pin colors label');
  }

  await legend.click();
  await page.waitForSelector('#legendOverlay.open', { timeout: 5000 });
  const popup = page.locator('.legend-grid');
  const popupText = await popup.innerText();
  if (!/Verified/.test(popupText) || !/Web source/.test(popupText)) {
    throw new Error('Legend popup missing expected items');
  }

  console.log('  ✓ sidebar pin colors opens legend modal');
  console.log('\nLegend UI checks passed.');
} finally {
  await browser?.close();
  server.close();
}
