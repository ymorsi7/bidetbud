#!/usr/bin/env node
/**
 * Map legend bar should render without the first-run tip overlay.
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
  await page.waitForSelector('.map-legend', { timeout: 10000 });

  const tip = page.locator('#legendTip');
  if (await tip.count()) {
    if (await tip.isVisible()) throw new Error('Legend first-run tip should stay hidden/disabled');
  }

  const legend = page.locator('.map-legend');
  const text = await legend.innerText();
  if (!/Verified/.test(text) || !/Limited/.test(text)) {
    throw new Error('Legend bar missing expected items');
  }

  await legend.locator('#legendHelpBtn').click();
  await page.waitForSelector('#legendOverlay.open', { timeout: 5000 });

  console.log('  ✓ legend bar renders; first-run tip disabled');
  console.log('\nLegend UI checks passed.');
} finally {
  await browser?.close();
  server.close();
}
