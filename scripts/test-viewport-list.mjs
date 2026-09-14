#!/usr/bin/env node
/**
 * The sidebar list mirrors the map view, and a shared link restores that view.
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
  if (!/San Diego|El Cajon|CA/.test(firstCity)) {
    throw new Error(`list is not scoped to the map view, first card reads "${firstCity}"`);
  }
  console.log('  ✓ list is scoped to the map view');

  const scoped = await page.locator('#countLabel').innerText();
  if (!/in view of/.test(scoped)) {
    throw new Error(`count line does not report the in-view subset: "${cityOf(scoped)[0]}"`);
  }
  console.log('  ✓ count line reports in-view vs total');

  // Panning to an empty ocean offers a way back instead of a dead end.
  await page.goto(`${url}?view=-40,-130,6`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const zoomOut = page.locator('#emptyZoomOutBtn');
  if (!(await zoomOut.count())) throw new Error('empty view is missing the "Show all" escape hatch');
  await zoomOut.click();
  await page.waitForTimeout(1500);
  if (!(await page.locator('#locationList .card').count())) {
    throw new Error('"Show all" did not bring results back');
  }
  console.log('  ✓ empty view offers a working "Show all" action');

  // Countries beyond the original ten hard-coded chips are filterable.
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  if (!(await page.locator('#typeChips .chip[data-type="Austria"]').count())) {
    throw new Error('country chips were not rebuilt from the seed (no Austria chip)');
  }
  console.log('  ✓ country chips are built from the seed');

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

  const mobileCount = await mobile.locator('#countLabel').innerText();
  if (/^0\s/.test(mobileCount.trim())) {
    throw new Error('mobile list view reports zero results (map bounds lost while hidden)');
  }
  console.log('  ✓ mobile list view keeps the last map bounds');

  if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
  console.log('\nViewport list checks passed.');
} finally {
  await browser?.close();
  server.close();
}
