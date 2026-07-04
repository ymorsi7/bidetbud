#!/usr/bin/env node
/**
 * Discover Atly gluten-free city list URLs with bidet evidence.
 * Output: data/atly-gluten-us-urls.json
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '../data/atly-gluten-us-urls.json');

const CITIES = [
  ['california', 'san-francisco'],
  ['california', 'los-angeles'],
  ['california', 'san-diego'],
  ['california', 'san-jose'],
  ['california', 'oakland'],
  ['california', 'sacramento'],
  ['california', 'irvine'],
  ['california', 'anaheim'],
  ['new-york', 'new-york'],
  ['new-york', 'brooklyn'],
  ['new-york', 'queens'],
  ['texas', 'houston'],
  ['texas', 'dallas'],
  ['texas', 'austin'],
  ['texas', 'san-antonio'],
  ['texas', 'fort-worth'],
  ['illinois', 'chicago'],
  ['florida', 'miami'],
  ['florida', 'orlando'],
  ['florida', 'tampa'],
  ['washington', 'seattle'],
  ['georgia', 'atlanta'],
  ['arizona', 'phoenix'],
  ['arizona', 'scottsdale'],
  ['colorado', 'denver'],
  ['massachusetts', 'boston'],
  ['pennsylvania', 'philadelphia'],
  ['oregon', 'portland'],
  ['nevada', 'las-vegas'],
  ['michigan', 'detroit'],
  ['minnesota', 'minneapolis'],
  ['tennessee', 'nashville'],
  ['north-carolina', 'charlotte'],
  ['north-carolina', 'raleigh'],
  ['virginia', 'arlington'],
  ['maryland', 'baltimore'],
  ['ohio', 'columbus'],
  ['ohio', 'cleveland'],
  ['indiana', 'indianapolis'],
  ['missouri', 'kansas-city'],
  ['missouri', 'st-louis'],
  ['wisconsin', 'milwaukee'],
  ['utah', 'salt-lake-city'],
  ['new-jersey', 'jersey-city'],
  ['new-jersey', 'newark'],
  ['connecticut', 'new-haven'],
  ['connecticut', 'hartford'],
  ['hawaii', 'honolulu'],
  ['louisiana', 'new-orleans'],
  ['south-carolina', 'charleston'],
  ['district-of-columbia', 'washington'],
];

const MEALS = ['dinner', 'lunch', 'breakfast'];
const BIDET_RE =
  /\bbidet(s|\s+toilet|\s+attachment|\s+hand\s+shower|\s+functions?|-style|\s+and\s+wudu)?\b|\bwashlet\b|\bshattaf\b|\bhandheld sprayer\b|\bhand shower\b/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'BidetBud/1.0 (atly-gluten)' } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

function countBidetSlugs(html) {
  let hits = 0;
  const slugRe = /\/location\/([A-Za-z0-9_-]+)/g;
  let m;
  while ((m = slugRe.exec(html))) {
    const start = Math.max(0, m.index - 4000);
    const end = Math.min(html.length, m.index + 12000);
    if (BIDET_RE.test(html.slice(start, end))) hits++;
  }
  return hits;
}

async function main() {
  const urls = [];
  for (const [state, city] of CITIES) {
    for (const meal of MEALS) {
      const pathPart = `best/gluten-free/${meal}-united-states-${state}-${city}`;
      const url = `https://www.atly.com/${pathPart}`;
      try {
        const html = await fetchText(url);
        if (html.length < 20000 || html.includes('Page not found')) continue;
        const hits = countBidetSlugs(html);
        if (hits > 0) {
          urls.push({ url, hits, state, city, meal });
          process.stderr.write(`+ ${hits} ${pathPart}\n`);
        }
        await sleep(120);
      } catch (e) {
        process.stderr.write(`x ${pathPart}: ${e.message}\n`);
      }
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(urls, null, 2) + '\n');
  console.log(`Found ${urls.length} gluten-free city pages with bidet evidence`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
