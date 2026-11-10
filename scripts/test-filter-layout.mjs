#!/usr/bin/env node
/**
 * Quick layout smoke test: filter controls must not overlap at common viewports.
 * Run: node scripts/test-filter-layout.mjs
 * Requires: npx playwright install chromium (one-time)
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
};

function startServer(port = 8765) {
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

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function checkViewport(page, label, mobile) {
  const issues = [];
  if (mobile) {
    // #noBidetToggle lives under More filters / the filter sheet — only check
    // controls that sit on the primary mobile chrome for overlap.
    const filterBtn = await page.locator('#mobileFilterBtn').boundingBox();
    const guests = await page.locator('#limitedAccessToggle').boundingBox();
    const boxes = [
      ['filters-btn', filterBtn],
      ['include-hotels', guests],
    ].filter(([, b]) => b);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (overlaps(boxes[i][1], boxes[j][1])) {
          issues.push(`${boxes[i][0]} overlaps ${boxes[j][0]}`);
        }
      }
    }
    await page.locator('#mobileFilterBtn').click();
    await page.waitForTimeout(200);
    const sheetNoBidet = await page.locator('[data-sheet="nobidet"]').count();
    if (!sheetNoBidet) issues.push('filter sheet missing No-bidet too toggle');
    await page.keyboard.press('Escape');
  } else {
    const segmented = await page.locator('#placeFilter').boundingBox();
    const guests = await page.locator('#limitedAccessToggle').boundingBox();
    const more = await page.locator('.more-filters summary').boundingBox();
    const boxes = [
      ['segmented', segmented],
      ['include-hotels', guests],
      ['more-filters', more],
    ].filter(([, b]) => b);

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (overlaps(boxes[i][1], boxes[j][1])) {
          issues.push(`${boxes[i][0]} overlaps ${boxes[j][0]}`);
        }
      }
    }

    if (segmented && guests && segmented.bottom > guests.top + 2) {
      issues.push('segmented bleeds into toggle row');
    }

    // Open More filters so #noBidetToggle is measurable, then confirm it does
    // not collide with the primary Include hotels toggle row.
    await page.locator('.more-filters summary').click();
    await page.waitForTimeout(150);
    const noBidet = await page.locator('#noBidetToggle').boundingBox();
    if (!noBidet) {
      issues.push('no-bidet toggle missing inside More filters');
    } else if (guests && overlaps(guests, noBidet)) {
      issues.push('include-hotels overlaps no-bidet inside More filters');
    }
  }

  if (issues.length) {
    throw new Error(`${label}: ${issues.join('; ')}`);
  }
  console.log(`  ✓ ${label}`);
}

const viewports = [
  { name: 'mobile-list', width: 390, height: 844, mobile: true },
  { name: 'sidebar-desktop', width: 1280, height: 800, mobile: false },
];

const { server, url } = await startServer();
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (vp.mobile) {
      await page.locator('.mobile-tab[data-view="list"]').click();
      await page.waitForTimeout(200);
    }
    await checkViewport(page, vp.name, vp.mobile);
  }

  // Toggle interaction
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.mobile-tab[data-view="list"]').click();
  const guestsBtn = page.locator('#limitedAccessToggle');
  await guestsBtn.click();
  await page.waitForTimeout(100);
  const pressed = await guestsBtn.getAttribute('aria-pressed');
  if (pressed !== 'true') throw new Error('guests-only toggle did not activate');
  console.log('  ✓ guests-only toggle works');

  console.log('\nAll filter layout checks passed.');
} finally {
  await browser?.close();
  server.close();
}
