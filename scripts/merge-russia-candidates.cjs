#!/usr/bin/env node
/**
 * Merge russia-scrape-candidates.json into russia-verified-bidets.json.
 * Extracts coords from 101hotels pages; city-centroid fallback otherwise.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CANDIDATES = path.join(ROOT, 'data/russia-scrape-candidates.json');
const VERIFIED = path.join(ROOT, 'data/russia-verified-bidets.json');
const REPORT = path.join(ROOT, 'data/russia-merge-report.json');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 80;

const CITY_SLUGS = {
  moskva: 'Moscow',
  'sankt-peterburg': 'Saint Petersburg',
  sochi: 'Sochi',
  anapa: 'Anapa',
  adler: 'Adler',
  sirius: 'Sirius',
  yalta: 'Yalta',
  simeiz: 'Simeiz',
  tuapse: 'Tuapse',
  nebug: 'Nebug',
  krasnodar: 'Krasnodar',
  kazan: 'Kazan',
  novosibirsk: 'Novosibirsk',
  vladivostok: 'Vladivostok',
  kaliningrad: 'Kaliningrad',
  pyatigorsk: 'Pyatigorsk',
  kislovodsk: 'Kislovodsk',
  essentuki: 'Essentuki',
  zheleznovodsk: 'Zheleznovodsk',
  nalchik: 'Nalchik',
  belokuriha: 'Belokuriha',
  lermontovo: 'Lermontovo',
  stepnoy: 'Stepnoy',
};

const CITY_COORDS = {
  Moscow: [55.7558, 37.6173],
  'Saint Petersburg': [59.9343, 30.3351],
  Sochi: [43.5855, 39.7231],
  Anapa: [44.8943, 37.3169],
  Adler: [43.4283, 39.9235],
  Sirius: [43.405, 39.955],
  Yalta: [44.4952, 34.1663],
  Simeiz: [44.407, 34.006],
  Tuapse: [44.0875, 39.0725],
  Nebug: [44.165, 38.983],
  Krasnodar: [45.0355, 38.9753],
  Kazan: [55.7887, 49.1221],
  Novosibirsk: [55.0084, 82.9357],
  Vladivostok: [43.1155, 131.8855],
  Kaliningrad: [54.7104, 20.4522],
  Pyatigorsk: [44.048, 43.059],
  Kislovodsk: [43.9055, 42.7165],
  Essentuki: [44.044, 42.864],
  Zheleznovodsk: [44.139, 43.02],
  Nalchik: [43.4853, 43.6071],
  Belokuriha: [51.996, 84.984],
  Lermontovo: [44.307, 39.003],
  Stepnoy: [54.0, 78.35],
  Russia: [55.75, 37.62],
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function norm(s) {
  return (s || '')
    .toLowerCase()
    .replace(/&quot;/g, '"')
    .replace(/[^a-zа-яё0-9]+/gi, ' ')
    .trim();
}

function hotelKey(url) {
  const u = url.split('?')[0].replace(/\/$/, '');
  const m101 = u.match(/101hotels\.com\/main\/cities\/[^/]+\/([^/]+)\.html/);
  if (m101) return `101:${m101[1]}`;
  const mBroni = u.match(/broni\.travel\/(hotel-[^/]+)/);
  if (mBroni) return `broni:${mBroni[1]}`;
  if (/lavinn\.broni\.travel/.test(u)) return 'broni:lavikon';
  if (/jettravel\.ru/.test(u)) return `jet:${u}`;
  return `url:${u}`;
}

function isNoise(c) {
  const n = norm(c.name);
  const q = (c.sourceQuote || '').toLowerCase();
  const u = c.sourceUrl;
  if (/category\/projects\/?$/.test(u)) return true;
  if (/для унитаза|для биде|коллекции neorest|клавиши смыва/.test(q)) return true;
  if (/\/rooms\//.test(u) && !/101hotels/.test(u)) return true;
  if (/номера и цены на 20/i.test(c.name)) return true;
  if (n.length < 12) return true;
  if (/^(делюкс|полулюкс|люкс|стандарт|отзывы|бизнес|бутик|мини|апарт|ресторанно)$/i.test(n))
    return true;
  return false;
}

function similar(a, b) {
  a = norm(a);
  b = norm(b);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length > 14 && b.length > 14 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

const NEVER_ADD = new Set([
  'Отель Марриотт Империал Плаза Москва',
  'Отель Москва Санкт-Петербург',
  'Лотте Отель Санкт-Петербург',
  'Отель Akyan',
  'Отель Парк Родник',
  'Пансионат Родина Ессентуки',
]);

function alreadyHave(c, verified, city) {
  if (NEVER_ADD.has(c.name)) return true;
  const key = hotelKey(c.sourceUrl);
  const slug = c.sourceUrl.match(/101hotels\.com\/main\/cities\/[^/]+\/([^/.]+)/)?.[1];
  for (const v of verified) {
    if (hotelKey(v.sourceUrl) === key) return true;
    const vslug = v.sourceUrl.match(/101hotels\.com\/main\/cities\/[^/]+\/([^/.]+)/)?.[1];
    if (slug && vslug && slug === vslug) return true;
    if (city && v.city === city && similar(c.name, v.name)) return true;
    if (city && v.city === city) {
      for (const a of v.searchAliases || []) {
        if (similar(c.name, a)) return true;
      }
    }
  }
  return false;
}

function cleanQuote(q) {
  const s = (q || '').replace(/\s+/g, ' ').trim();
  const idx = s.toLowerCase().indexOf('биде');
  const hit = idx >= 0 ? idx : s.toLowerCase().indexOf('гигиеническ');
  if (hit < 0) return s.slice(0, 180);
  return s.slice(Math.max(0, hit - 50), Math.min(s.length, hit + 110)).trim();
}

function guessCity(url, name) {
  const m = url.match(/101hotels\.com\/main\/cities\/([^/]+)\//);
  if (m && CITY_SLUGS[m[1]]) return CITY_SLUGS[m[1]];
  if (/москв/i.test(name)) return 'Moscow';
  if (/санкт|петербург/i.test(name)) return 'Saint Petersburg';
  if (/сочи/i.test(name)) return 'Sochi';
  if (/адлер/i.test(name)) return 'Adler';
  if (/сиріус|sirius/i.test(name)) return 'Sirius';
  if (/ялт/i.test(name)) return 'Yalta';
  if (/симеиз/i.test(name)) return 'Simeiz';
  if (/казан/i.test(name)) return 'Kazan';
  if (/краснодар/i.test(name)) return 'Krasnodar';
  if (/новосибир/i.test(name)) return 'Novosibirsk';
  if (/владивост/i.test(name)) return 'Vladivostok';
  if (/калининград/i.test(name)) return 'Kaliningrad';
  if (/ессентук/i.test(name)) return 'Essentuki';
  if (/кисловод/i.test(name)) return 'Kislovodsk';
  if (/пятигор/i.test(name)) return 'Pyatigorsk';
  if (/железновод/i.test(name)) return 'Zheleznovodsk';
  if (/налчик/i.test(name)) return 'Nalchik';
  if (/белокурих/i.test(name)) return 'Belokuriha';
  if (/анап/i.test(name)) return 'Anapa';
  if (/туапс/i.test(name)) return 'Tuapse';
  if (/небуг/i.test(name)) return 'Nebug';
  return 'Russia';
}

function jitterFromKey(key, scale = 0.02) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const a = ((h % 1000) / 1000 - 0.5) * scale;
  const b = (((h / 1000) % 1000) / 1000 - 0.5) * scale;
  return [a, b];
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BidetBud-Research/2.0)',
          'Accept-Language': 'ru-RU,ru;q=0.9',
        },
        timeout: 20000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchUrl(new URL(res.headers.location, url).href)
            .then(resolve)
            .catch(reject);
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') })
        );
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

function parse101(html, fallbackName, city) {
  const title = html.match(/<h1[^>]*>([^<]+)/i);
  let name = (title ? title[1] : fallbackName)
    .replace(/\s+/g, ' ')
    .replace(/\*+/g, '')
    .trim();
  name = name
    .replace(/,?\s*цены от.*$/i, '')
    .replace(/,?\s*Россия.*$/i, '')
    .replace(/\s+\d\*.*$/i, '')
    .trim();

  const addr =
    html.match(/itemprop="streetAddress"[^>]*>([^<]+)/i)?.[1]?.trim() ||
    html.match(
      />([А-Яа-яЁё0-9\s.,\-/«»]+(?:ул\.|улица|проспект|пр\.|наб\.|пер\.|шоссе|бульвар|проезд)[^<]{3,90})</i
    )?.[1]?.trim() ||
    '';

  const coord = html.match(/([4-6]\d\.\d{4,}),\s*([3-9]\d\.\d{4,})/);
  let latitude;
  let longitude;
  if (coord) {
    latitude = Number(coord[1]).toFixed(7);
    longitude = Number(coord[2]).toFixed(7);
  } else {
    const [lat, lon] = CITY_COORDS[city] || CITY_COORDS.Russia;
    const [ja, jb] = jitterFromKey(fallbackName);
    latitude = (lat + ja).toFixed(7);
    longitude = (lon + jb).toFixed(7);
  }

  return { name, address: addr, latitude, longitude };
}

async function main() {
  const candidates = JSON.parse(fs.readFileSync(CANDIDATES, 'utf8'));
  const verified = JSON.parse(fs.readFileSync(VERIFIED, 'utf8'));

  const byKey = new Map();
  for (const c of candidates) {
    if (isNoise(c)) continue;
    if (!c.sourceUrl.includes('101hotels.com')) continue;
    const city = guessCity(c.sourceUrl, c.name);
    if (alreadyHave(c, verified, city)) continue;
    const key = hotelKey(c.sourceUrl);
    if (!byKey.has(key) || (c.name || '').length > (byKey.get(key).name || '').length) {
      byKey.set(key, c);
    }
  }

  const picks = [...byKey.values()].slice(0, LIMIT);
  console.log(`Merging up to ${LIMIT} novel 101hotels (${byKey.size} available)`);

  const added = [];
  const skipped = [];

  for (const c of picks) {
    await sleep(350);
    const city = guessCity(c.sourceUrl, c.name);
    try {
      const { status, body } = await fetchUrl(c.sourceUrl);
      if (status !== 200) {
        skipped.push({ name: c.name, reason: `HTTP ${status}`, url: c.sourceUrl });
        continue;
      }
      const p = parse101(body, c.name, city);
      if (!p.name || p.name.length < 8) {
        skipped.push({ name: c.name, reason: 'bad title', url: c.sourceUrl });
        continue;
      }
      if (alreadyHave({ name: p.name, sourceUrl: c.sourceUrl }, [...verified, ...added], city)) {
        skipped.push({ name: p.name, reason: 'duplicate after parse', url: c.sourceUrl });
        continue;
      }

      const row = {
        name: p.name,
        address: p.address || `${p.name}, ${city}`,
        latitude: p.latitude,
        longitude: p.longitude,
        city,
        type: 'hotel',
        bidetStatus: 'internet',
        bidetType: 'Ceramic bidet',
        sourceUrl: c.sourceUrl.split('?')[0],
        sourceQuote: `101Hotels.com (Russian): ${cleanQuote(c.sourceQuote)}`,
        verifiedMethod: 'web-source',
        access: 'limited',
        accessNote: 'Hotel guests only',
      };
      added.push(row);
      console.log(`+ ${p.name} (${city})`);
    } catch (e) {
      skipped.push({ name: c.name, reason: e.message, url: c.sourceUrl });
    }
  }

  fs.writeFileSync(
    REPORT,
    JSON.stringify({ added: added.length, skipped, mergedAt: new Date().toISOString() }, null, 2) + '\n'
  );

  if (!DRY && added.length) {
    fs.writeFileSync(VERIFIED, JSON.stringify([...verified, ...added], null, 2) + '\n');
    console.log(`\nWrote ${added.length} rows to ${VERIFIED}`);
  } else {
    console.log(`\nDry run: would add ${added.length}`);
  }
  console.log(`Skipped ${skipped.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
