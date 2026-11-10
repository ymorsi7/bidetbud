#!/usr/bin/env node
import { chromium } from 'playwright';
import { start as startServer } from './lib/e2e-server.mjs';

const { server, url } = await startServer(8770);
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

  await page.fill('#searchInput', 'Tel Aviv');
  await page.waitForTimeout(500);
  await page.locator('#locationList .card-unavailable').first().waitFor({ state: 'visible', timeout: 10000 });
  const lockedNote = await page.locator('.card-note--locked').first().textContent();
  if (!/does not operate in this country/i.test(lockedNote || '')) {
    throw new Error('Tel Aviv card missing lock copy: ' + lockedNote);
  }
  await page.locator('#locationList .card-unavailable').first().click();
  await page.locator('#detailOverlay.open .access-warn--locked').waitFor({ state: 'visible', timeout: 5000 });
  const lockWarn = await page.locator('.access-warn--locked').textContent();
  if (!/BidetBud does not operate in this country/i.test(lockWarn || '')) {
    throw new Error('detail lock message unexpected: ' + lockWarn);
  }

  if (errors.length) throw new Error('console errors: ' + errors.join('; '));
  console.log('  ✓ load, search ICSD, open detail');
  console.log('  ✓ Tel Aviv spots are locked');
  console.log('\nBidet smoke checks passed.');
} finally {
  await browser.close();
  server.close();
}
