#!/usr/bin/env node
/**
 * Mine Reddit comments for NA bidet venue leads via Pullpush.
 * Output: data/reddit-na-raw.json
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '../data/reddit-na-raw.json');

const SUBREDDITS = [
  'AskNYC', 'nyc', 'Brooklyn', 'Queens', 'AskLosAngeles', 'LosAngeles', 'sanfrancisco',
  'bayarea', 'SanDiego', 'Seattle', 'Portland', 'chicago', 'AskChicago', 'boston',
  'philadelphia', 'WashingtonDC', 'Miami', 'Atlanta', 'Austin', 'houston', 'dallas',
  'Denver', 'Phoenix', 'Minneapolis', 'Nashville', 'NewOrleans', 'SaltLakeCity',
  'toronto', 'askTO', 'vancouver', 'montreal', 'Calgary', 'Edmonton',
  'mexicocity', 'Monterrey', 'Cancun', 'bidets', 'travel', 'solotravel',
  'JapanTravel', 'japanesefood', 'KoreanFood', 'halal', 'islam',
];

const QUERIES = [
  'bidet', 'washlet', 'toto toilet', 'japanese toilet', 'smart toilet bathroom',
  'bidet restaurant', 'bidet hotel', 'heated bidet',
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'BidetBudResearch/1.0' } }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(data.slice(0, 120)));
          }
        });
      })
      .on('error', reject);
  });
}

function hasBidetEvidence(body) {
  return /bidet|washlet|toto (?:bidet|smart|toilet)|smart toilet|japanese toilet|built.?in bidet|heated seat and a bidet|shattaf/i.test(
    body
  );
}

function extractVenues(body, subreddit, permalink) {
  const hits = [];
  const seen = new Set();
  const patterns = [
    /\*\*([^*]{4,70})\*\*/g,
    /(?:at|went to|try|recommend|stayed at|ate at)\s+([A-Z][A-Za-z0-9 '&./-]{3,60})/g,
    /([A-Z][A-Za-z0-9 '&./-]{3,55})\s+has\s+(?:a\s+)?bidets?/gi,
    /([A-Z][A-Za-z0-9 '&./-]{3,55})(?:'s)?\s+(?:restroom|bathroom)s?\s+have\s+bidets?/gi,
    /([A-Z][A-Za-z0-9 '&./-]{3,55})\s+(?:has|have)\s+(?:a\s+)?(?:TOTO|japanese|smart)\s+toilet/gi,
  ];
  for (const pat of patterns) {
    for (const m of body.matchAll(pat)) {
      let name = m[1].trim().replace(/\s+/g, ' ');
      name = name.replace(/^(The|A|An|My|Their|This|That|It|We|I|They)\s+/i, '').trim();
      if (name.length < 4 || name.length > 70) continue;
      if (/^(Reddit|Google|Yelp|NYC|LA|SF|USA|Canada|Mexico|Hotel|Restaurant)$/i.test(name)) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        name,
        subreddit,
        permalink: permalink.startsWith('http') ? permalink : `https://reddit.com${permalink}`,
        snippet: body.replace(/\s+/g, ' ').slice(0, 320),
      });
    }
  }
  return hits;
}

async function main() {
  const existing = fs.existsSync(OUT)
    ? JSON.parse(fs.readFileSync(OUT, 'utf8'))
    : [];
  const seen = new Map(existing.map((r) => [r.name.toLowerCase() + '|' + r.subreddit, r]));
  let added = 0;

  for (const sub of SUBREDDITS) {
    for (const q of QUERIES) {
      const url =
        'https://api.pullpush.io/reddit/search/comment/?subreddit=' +
        encodeURIComponent(sub) +
        '&q=' +
        encodeURIComponent(q) +
        '&size=100';
      try {
        const j = await fetchJson(url);
        for (const c of j.data || []) {
          const body = c.body || '';
          if (!hasBidetEvidence(body)) continue;
          for (const hit of extractVenues(body, sub, c.permalink || '')) {
            const key = hit.name.toLowerCase() + '|' + hit.subreddit;
            if (seen.has(key)) continue;
            seen.set(key, hit);
            added++;
          }
        }
        await sleep(600);
      } catch (e) {
        console.warn('Pullpush fail:', sub, q, e.message);
        await sleep(1200);
      }
    }
  }

  const out = [...seen.values()];
  if (out.length) fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Reddit NA: ${out.length} leads (${added} new this run)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
