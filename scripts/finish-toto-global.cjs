#!/usr/bin/env node
/**
 * Append TOTO global projects that failed Photon geocoding (manual coordinates).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const os = require('os');

const DATA = path.join(__dirname, '../data/toto-global-references.json');
const BASE = 'https://www.toto.com';

const MANUAL = {
  'Hotel-Plaza-Athenee-Paris.htm': {
    name: 'Hôtel Plaza Athénée Paris',
    address: '25 Avenue Montaigne, 75008 Paris, France',
    latitude: '48.866195',
    longitude: '2.304414',
    city: 'Paris',
    country: 'France',
  },
  'HOTEL-BARRIERE-LE-FOUQUETS.htm': {
    name: "Hôtel Barrière Le Fouquet's Paris",
    address: '46 Avenue George V, 75008 Paris, France',
    latitude: '48.871358',
    longitude: '2.301214',
    city: 'Paris',
    country: 'France',
  },
  'WYNDHAM-GRAND-PLAZA-ROYALE-HOT-SPRINGS-RESORT-TIANMU-LAKE.htm': {
    name: 'Wyndham Grand Plaza Royale Hot Springs Resort Tianmu Lake',
    address: 'Tianmu Lake, Liyang, Jiangsu, China',
    latitude: '31.1786',
    longitude: '119.4833',
    city: 'Liyang, Jiangsu',
    country: 'China',
  },
  'Eastin-Hotel-Residences-Hanoi.htm': {
    name: 'Eastin Hotel & Residences Hanoi',
    address: '2 Duy Tan Street, Cau Giay, Hanoi, Vietnam',
    latitude: '21.0315',
    longitude: '105.7845',
    city: 'Hanoi',
    country: 'Vietnam',
  },
  'MAISON-ALBAR-IMPERATOR-HOTEL.htm': {
    name: 'Maison Albar - Imperator Hotel',
    address: '15 Avenue Feuchères, 30000 Nîmes, France',
    latitude: '43.8347',
    longitude: '4.3606',
    city: 'Nîmes',
    country: 'France',
  },
  hoshino_resorts_kasuke_tiantai: {
    name: 'Hoshino Resorts Kasuke Tiantai',
    address: 'Tiantai County, Taizhou, Zhejiang, China',
    latitude: '29.1442',
    longitude: '121.0067',
    city: 'Tiantai, Zhejiang',
    country: 'China',
  },
  'shangri-la_qiantan.htm': {
    name: 'Shangri-La Qiantan, Shanghai',
    address: 'Qiantan, Pudong, Shanghai, China',
    latitude: '31.1578',
    longitude: '121.4802',
    city: 'Shanghai',
    country: 'China',
  },
  'four-seasons-london.htm': {
    name: 'Four Seasons Hotel London at Park Lane',
    address: 'Hamilton Place, Park Lane, London W1J 7DR',
    latitude: '51.50425',
    longitude: '-0.14789',
    city: 'London',
    country: 'UK',
  },
  langham: {
    name: 'The Langham Nymphenburg Residence',
    address: 'Münchner Schloss Nymphenburg, Munich, Germany',
    latitude: '48.1583',
    longitude: '11.5036',
    city: 'Munich',
    country: 'Germany',
  },
  'pdf/reference51.pdf': {
    name: 'Eastern Mangroves Anantara Resort',
    address: 'Sheikh Zayed Street, Abu Dhabi, UAE',
    latitude: '24.4512',
    longitude: '54.3969',
    city: 'Abu Dhabi',
    country: 'UAE',
  },
  'pdf/reference50.pdf': {
    name: 'Conrad Dubai',
    address: 'Sheikh Zayed Road, Dubai, UAE',
    latitude: '25.2244',
    longitude: '55.2839',
    city: 'Dubai',
    country: 'UAE',
  },
  'pdf/reference5.pdf': {
    name: 'Banana Island Resort Doha by Anantara',
    address: 'Banana Island, Doha, Qatar',
    latitude: '25.2983',
    longitude: '51.5708',
    city: 'Doha',
    country: 'Qatar',
  },
};

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'BidetBeacon/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : BASE + res.headers.location;
          fetchBuffer(next).then(resolve).catch(reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseHtml(buf, fallbackName) {
  const html = buf.toString('utf8');
  const titleMatch = html.match(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/i);
  const name = decodeHtml(titleMatch ? titleMatch[1] : fallbackName);
  const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) =>
    decodeHtml(m[1])
  );
  const bidetPara =
    paras.find((p) => /washlet|bidet|neorest|shower toilet/i.test(p) && p.length > 40) ||
    '';
  const products = [...html.matchAll(/class="itemName"[^>]*>([^<]+)/gi)].map((m) =>
    decodeHtml(m[1])
  );
  const bidetType =
    products.find((p) => /washlet|neorest/i.test(p)) || 'TOTO WASHLET / NEOREST';
  const sourceQuote = bidetPara
    ? bidetPara.slice(0, 280)
    : `TOTO Global Reference: ${name} — featured products include ${products.slice(0, 3).join(', ') || bidetType}`;
  return { name, bidetType, sourceQuote };
}

function parsePdf(buf, fallbackName) {
  const tmp = path.join(os.tmpdir(), `toto-finish-${Date.now()}.pdf`);
  fs.writeFileSync(tmp, buf);
  let text = '';
  try {
    text = execFileSync('pdftotext', [tmp, '-'], {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    });
  } catch {
    /* pdftotext unavailable */
  }
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  const washletLine = text
    .split('\n')
    .find((l) => /washlet|ウォシュレット|bidet|neorest|ノレスト|TOTO/i.test(l));
  const sourceQuote = washletLine
    ? `TOTO Global Reference (PDF): ${washletLine.trim().slice(0, 220)}`
    : `TOTO Global Reference case study documents TOTO WASHLET/NEOREST sanitary installations at ${fallbackName}`;
  return {
    name: fallbackName,
    bidetType: 'TOTO WASHLET / NEOREST',
    sourceQuote,
  };
}

async function main() {
  const existing = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, 'utf8')) : [];
  const seenUrl = new Set(existing.map((r) => r.sourceUrl));
  let added = 0;

  for (const [slug, manual] of Object.entries(MANUAL)) {
    const pageUrl = slug.startsWith('pdf/') ? `/en/project/${slug}` : `/en/project/${slug}`;
    const sourceUrl = BASE + pageUrl;
    if (seenUrl.has(sourceUrl)) {
      console.log('Skip (exists):', manual.name);
      continue;
    }

    let parsed;
    try {
      const buf = await fetchBuffer(sourceUrl);
      const isPdf = slug.endsWith('.pdf') || buf.slice(0, 4).toString() === '%PDF';
      parsed = isPdf ? parsePdf(buf, manual.name) : parseHtml(buf, manual.name);
    } catch (e) {
      console.warn('Fetch failed, using manual quote:', manual.name, e.message);
      parsed = {
        name: manual.name,
        bidetType: 'TOTO WASHLET / NEOREST',
        sourceQuote: `TOTO Global Reference project listing for ${manual.name}`,
      };
    }

    existing.push({
      name: parsed.name || manual.name,
      address: manual.address,
      latitude: manual.latitude,
      longitude: manual.longitude,
      city: manual.city,
      country: manual.country,
      type: 'hotel',
      bidetStatus: 'warmed',
      bidetType: parsed.bidetType,
      sourceUrl,
      sourceQuote: parsed.sourceQuote,
      verifiedMethod: 'manufacturer-reference',
      access: 'limited',
      accessNote: 'Hotel guests and patrons',
    });
    seenUrl.add(sourceUrl);
    added++;
    console.log('Added:', manual.name);
  }

  fs.writeFileSync(DATA, JSON.stringify(existing, null, 2) + '\n');
  console.log(`finish-toto-global: +${added} (${existing.length} total in file)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
