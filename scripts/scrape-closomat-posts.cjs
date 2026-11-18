#!/usr/bin/env node
/**
 * Walk Closomat case-study posts and keep only venues whose page names a
 * Palma Vita / wash-and-dry toilet (not a conventional Changing Places WC).
 * Schools/colleges are skipped (not public restrooms).
 *
 *   node scripts/scrape-closomat-posts.cjs
 */
const fs = require('fs');
const https = require('https');
const path = require('path');
const { fetchText, sleep, decodeHtml, plainText } = require('./lib/africa-web.cjs');
const { readSeed, writeSeed } = require('./lib/bidet-seed.cjs');
const { mergeIntoSeed } = require('./lib/seed-merge.cjs');

const SITEMAP = 'https://www.changingplaces.closomat.co.uk/post-sitemap.xml';
const OUT = path.join(__dirname, '../data/closomat-posts-bidets.json');
const WASH =
  /palma\s*vita|wash\s*(?:and|&)\s*dry|in-?built douch|built-in douch|shower toilet|douching and drying/i;
const INSTALL =
  /installed|fitted|features a closomat|featuring a closomat|replaced.{0,60}(palma|wash)|incorporated a closomat|added one of|addition of a closomat/i;
const BOILER = /explore more topics|not a legal requirement|widely used throughout europe/i;
const SKIP_URL =
  /white-paper|webinar|campaign|election|period-poverty|occupational|specification|grading|giveaway|carers-week|cinemas-need|theatres-need|lack-of-changing|could-you-hold|made-in-britain|government-funding|think-about-toilets|nbs-service|looselfie/i;
const SKIP_VENUE =
  /\b(school|college|academy|pupil|primary|secondary school|special needs provision|student)\b/i;
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

function postcodesIo(postcodes) {
  const body = JSON.stringify({ postcodes });
  return new Promise((resolve, reject) => {
    const req = https.request(
      'https://api.postcodes.io/postcodes',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data).result || []);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function photon(q) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en&countrycodes=gb`;
  return new Promise((resolve) => {
    https
      .get(url, { headers: { 'User-Agent': 'BidetBud/1.0 (https://bidetbud.com)' } }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            const f = JSON.parse(d).features?.[0];
            if (!f) return resolve(null);
            const p = f.properties || {};
            resolve({
              latitude: String(f.geometry.coordinates[1]),
              longitude: String(f.geometry.coordinates[0]),
              address: [p.name, p.street, p.housenumber, p.city, p.state, p.postcode, 'UK']
                .filter(Boolean)
                .join(', '),
              city: p.city || p.name || '',
            });
          } catch {
            resolve(null);
          }
        });
      })
      .on('error', () => resolve(null));
  });
}

function venueName(html, url) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  let t = h1
    ? decodeHtml(h1[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    : '';
  if (!t || /closomat|changing places|blog/i.test(t)) {
    const title = html.match(/<title[^>]*>([^<]+)/i);
    t = title ? decodeHtml(title[1]).replace(/\s*[|\-–].*$/, '').trim() : '';
  }
  t = t
    .replace(/^Changing Places (?:at|by Closomat at)\s+/i, '')
    .replace(/\s*\|\s*Closomat.*$/i, '')
    .trim();
  if (!t) {
    const slug = url.replace(/\/$/, '').split('/').pop().replace(/-/g, ' ');
    t = slug.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return t.slice(0, 90);
}

function quoteFrom(text) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return (
    sentences.find((s) => WASH.test(s) && s.length > 40 && s.length < 400) ||
    sentences.find((s) => WASH.test(s)) ||
    ''
  ).slice(0, 240);
}

async function main() {
  const xml = await fetchText(SITEMAP, { lang: 'en' });
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => !SKIP_URL.test(u));
  console.log(`Closomat posts: ${urls.length}`);
  const found = [];

  for (const url of urls) {
    try {
      const html = await fetchText(url, { lang: 'en' });
      const text = plainText(html);
      if (!WASH.test(text)) continue;
      const name = venueName(html, url);
      if (!name || SKIP_VENUE.test(name) || /\/(school|college|academy|pupil)/i.test(url)) continue;
      const quote = quoteFrom(text);
      if (!quote || BOILER.test(quote) || !INSTALL.test(quote)) continue;
      const pc = (text.match(POSTCODE) || [])[1];
      found.push({ name, url, quote, postcode: pc || '' });
      console.log(`+ ${name}`);
    } catch (e) {
      /* skip */
    }
    await sleep(350);
  }

  const lookup = new Map();
  const pcs = [...new Set(found.map((r) => r.postcode).filter(Boolean))];
  for (let i = 0; i < pcs.length; i += 80) {
    const batch = pcs.slice(i, i + 80);
    const result = await postcodesIo(batch);
    for (const item of result) {
      if (!item.result) continue;
      lookup.set(String(item.query).toUpperCase().replace(/\s+/g, ''), item.result);
    }
  }

  const rows = [];
  for (const item of found) {
    let geo = null;
    if (item.postcode) {
      const r = lookup.get(String(item.postcode).toUpperCase().replace(/\s+/g, ''));
      if (r) {
        geo = {
          latitude: String(r.latitude),
          longitude: String(r.longitude),
          address: `${item.name}, ${item.postcode}`,
          city: r.admin_district || r.parish || '',
        };
      }
    }
    if (!geo) geo = await photon(`${item.name}, UK`);
    await sleep(150);
    if (!geo) {
      console.warn(`no coords: ${item.name}`);
      continue;
    }
    rows.push({
      name: item.name,
      address: geo.address || item.name,
      latitude: geo.latitude,
      longitude: geo.longitude,
      city: geo.city || '',
      country: 'UK',
      type: 'public',
      bidetStatus: 'warmed',
      bidetType: 'Closomat wash-and-dry toilet',
      sourceUrl: item.url,
      sourceQuote: item.quote,
      verifiedMethod: 'manufacturer-reference',
      access: 'public',
      accessNote: 'Changing Places / hygiene room - check venue opening hours and access method',
    });
  }

  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2) + '\n');
  const existing = readSeed();
  const { merged, added, skipped } = mergeIntoSeed(existing, rows, {
    accept: (row) => row.country === 'UK' && WASH.test(row.sourceQuote),
  });
  writeSeed(merged);
  console.log(`Closomat posts: ${rows.length} evidenced, +${added} new (${skipped} skipped). Total ${merged.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
