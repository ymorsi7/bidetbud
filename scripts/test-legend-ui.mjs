#!/usr/bin/env node
/**
 * Legend tooltip must sit above the legend pill without overlapping it.
 * Run: node scripts/test-legend-ui.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, extname } from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { boxesOverlap } = require('../js/core.js');
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
  await page.addInitScript(() => {
    localStorage.removeItem('bb_legend_tip');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const tip = document.getElementById('legendTip');
    return tip && !tip.hidden;
  }, { timeout: 10000 });

  const tip = page.locator('#legendTip');
  const tipText = await tip.innerText();
  if(/Gray X/i.test(tipText)){
    throw new Error('Legend tip copy should not mention "Gray X" (legend uses dots, not X icons)');
  }

  const legendBox = await page.locator('.map-legend').boundingBox();
  const tipBox = await tip.boundingBox();
  if(!legendBox || !tipBox) throw new Error('Could not measure legend or tip');

  if(boxesOverlap(tipBox, legendBox)){
    throw new Error('Legend tip overlaps the legend pill');
  }
  if(tipBox.bottom > legendBox.top + 2){
    throw new Error('Legend tip should sit above the legend pill');
  }

  await page.locator('#legendTipDismiss').click();
  if(await tip.isVisible()) throw new Error('Legend tip did not dismiss');

  console.log('  ✓ legend tip layout and copy');
  console.log('\nLegend UI checks passed.');
} finally {
  await browser?.close();
  server.close();
}
