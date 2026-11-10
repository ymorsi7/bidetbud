#!/usr/bin/env node
import { chromium } from 'playwright';
import { start as startServer } from './lib/e2e-server.mjs';

const { server, url } = await startServer(8766);
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
