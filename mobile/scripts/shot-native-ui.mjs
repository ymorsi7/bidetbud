import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBILE = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const WWW = join(MOBILE, 'www');
const OUT = join(MOBILE, 'store', 'ios');
const PORT = 8779;
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

if (!existsSync(join(WWW, 'index.html'))) process.exit(1);
mkdirSync(OUT, { recursive: true });

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
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  geolocation: { latitude: 32.9382, longitude: -96.7406 },
  permissions: ['geolocation'],
});
await page.goto('http://127.0.0.1:' + PORT + '/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  document.documentElement.classList.add('capacitor-native');
  document.body.classList.add('capacitor-native');
});
await page.waitForFunction(() => {
  const el = document.getElementById('countLabel');
  return el && el.textContent && !/loading/i.test(el.textContent);
});
await page.waitForTimeout(800);
await page.screenshot({ path: join(OUT, 'qa-map.png') });
await page.locator('#addFab').click();
await page.waitForFunction(() => document.body.classList.contains('add-screen-open'));
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, 'qa-add.png') });
await page.locator('#addClose').click();
await page.locator('.mobile-tab[data-view="list"]').click();
await page.waitForFunction(() => document.getElementById('appMain')?.classList.contains('show-list'));
await page.locator('#locationList .card').first().waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, 'qa-list.png') });
await browser.close();
server.close();
console.log('wrote qa-map.png qa-add.png qa-list.png');
