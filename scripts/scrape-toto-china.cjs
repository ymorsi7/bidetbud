#!/usr/bin/env node
/**
 * Scrape TOTO China high-end project case studies (toto.com.cn/highendproject).
 * Downloads each PDF, extracts 卫洗丽/诺锐斯特/NEOREST/WASHLET quotes via pdftotext,
 * geocodes hotels, and writes data/china-toto-projects.json.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const os = require('os');

const OUT = path.join(__dirname, '../data/china-toto-projects.json');
const CACHE = path.join(__dirname, '../data/china-geocode-cache.json');
const INDEX_URL = 'https://www.toto.com.cn/cn/company/highendproject/index.html';
const PDF_BASE = 'https://www.toto.com.cn';

const SKIP_NAMES = /京都|伦敦|巴黎|悉尼|蒙特利尔|迪拜|东京|河内|新加坡|瑞士|加利福尼亚|多哈|西贡|万韵|BRUSHSTROKE|虹夕诺雅|大仓|轻井泽|竹泉庄|维也纳|慕尼黑|莫斯科|法兰克福|哈利库拉尼|安达仕茂宜|旧金山|诺富特|泰姬陵|埃尔毛|纳帕|香蕉岛|帕克路|莫里斯|菩提|费尔蒙|威斯汀莫阿纳|成田国际|哈利/;

/** Non-hotel commercial / private projects on the same page */
const SKIP_PROJECT = new Set([
  '北京杨林',
  '苏州仁恒仓街商业广场',
  '成都SKP',
  '上海苏河湾万象天地',
  '深圳平安金融中心',
]);

const NAME_EN = {
  '苏州丽思卡尔顿': 'The Ritz-Carlton, Suzhou',
  '上海前滩华尔道夫酒店': 'Waldorf Astoria Shanghai Qiantan',
  '北京瑰丽酒店': 'Rosewood Beijing',
  '大连四季酒店': 'Four Seasons Hotel Dalian',
  '杭州中心四季酒店': 'Four Seasons Hotel Hangzhou at Centre',
  '深圳星河丽思卡尔顿酒店': 'The Ritz-Carlton, Shenzhen',
  '溧阳温德姆至尊豪廷温泉酒店': 'Wyndham Grand Plaza Royale Hot Springs Tianmu Lake',
  '苏州四季酒店': 'Four Seasons Hotel Suzhou',
  '西安曲江希尔顿嘉悦里酒店': 'Canopy by Hilton Xi\'an Qujiang',
  '青岛钓鱼台酒店': 'Diaoyutai Hotel Qingdao',
  '青岛美高梅酒店': 'MGM Qingdao',
  '烟台威斯汀酒店': 'The Westin Yantai',
  'J酒店上海中心': 'J Hotel Shanghai Tower',
  '南京威斯汀温泉度假酒店': 'The Westin Nanjing Resort & Spa',
  '厦门W酒店': 'W Xiamen',
  '南京园博园悦榕庄': 'Banyan Tree Nanjing Garden Expo',
  '上海前滩香格里拉': 'Shangri-La Qiantan, Shanghai',
  '三亚艾迪逊酒店': 'The Sanya EDITION',
  '深圳湾安达仕酒店': 'Andaz Shenzhen Bay',
  '天台山嘉助酒店': 'Kasuitei Tiantai',
  '长沙W酒店': 'W Changsha',
  '成都W酒店': 'W Chengdu',
  '厦门华尔道夫酒店': 'Waldorf Astoria Xiamen',
  '广州富力丽思卡尔顿酒店': 'The Ritz-Carlton, Guangzhou',
  '天津康莱德酒店': 'Conrad Tianjin',
  '南京丽思卡尔顿酒店': 'The Ritz-Carlton, Nanjing',
  '苏州柏悦酒店': 'Park Hyatt Suzhou',
  '杭州远洋凯宾斯基酒店': 'Kempinski Hotel Hangzhou',
  '西安丽思卡尔顿酒店': 'The Ritz-Carlton, Xi\'an',
  '南宁龙光那莲豪华精选酒店': 'The Luxury Collection Nanning',
  '北京王府井文华东方酒店': 'Mandarin Oriental Wangfujing, Beijing',
  '沈阳康莱德酒店': 'Conrad Shenyang',
  '武义璟园· 蝶来望境': 'Dielai Wangjing, Wuyi',
  '厦门佳逸希尔顿格芮精选酒店': 'Curio Collection by Hilton Xiamen',
  '上海浦东机场T3卫星厅': 'Shanghai Pudong Airport T3 Satellite Terminal',
  '上海佘山世茂洲际酒店': 'InterContinental Shanghai Wonderland',
  '阿丽拉乌镇': 'Alila Wuzhen',
  '北京璞瑄酒店': 'The PuXuan Hotel & Spa',
  '无印良品酒店·深圳': 'MUJI Hotel Shenzhen',
  '无印良品酒店·北京': 'MUJI Hotel Beijing',
  '三亚保利瑰丽酒店': 'Rosewood Sanya',
  '南京涵碧楼': 'The Lalu Nanjing',
  '上海苏宁宝丽嘉酒店': 'Bellagio by Shanghai Bellagio',
  '北京三里屯通盈中心洲际酒店': 'InterContinental Beijing Sanlitun',
  '长沙瑞吉酒店': 'The St. Regis Changsha',
  '绍兴兰亭安麓酒店': 'Ahn Luh Shaoxing',
  '上海外滩W酒店': 'W Shanghai — The Bund',
  '成都华尔道夫酒店': 'Waldorf Astoria Chengdu',
  '义乌香格里拉大酒店': 'Shangri-La Yiwu',
  '杭州柏悦酒店': 'Park Hyatt Hangzhou',
  '厦门康莱德酒店': 'Conrad Xiamen',
  '上海万达瑞华酒店': 'Wanda Reign on the Bund Shanghai',
  '广州柏悦酒店': 'Park Hyatt Guangzhou',
  '广州四季酒店': 'Four Seasons Hotel Guangzhou',
  '成都富力丽思卡尔顿': 'The Ritz-Carlton, Chengdu',
  '成都富力丽思卡尔顿酒店': 'The Ritz-Carlton, Chengdu',
  '成都瑞吉酒店': 'The St. Regis Chengdu',
  '黄山悦榕庄': 'Banyan Tree Huangshan',
};

const CITY_FROM_NAME = [
  [/上海/, 'Shanghai'],
  [/北京/, 'Beijing'],
  [/苏州/, 'Suzhou'],
  [/大连/, 'Dalian'],
  [/杭州/, 'Hangzhou'],
  [/深圳/, 'Shenzhen'],
  [/溧阳/, 'Liyang'],
  [/西安/, 'Xi\'an'],
  [/青岛/, 'Qingdao'],
  [/烟台/, 'Yantai'],
  [/成都/, 'Chengdu'],
  [/南京/, 'Nanjing'],
  [/厦门/, 'Xiamen'],
  [/三亚/, 'Sanya'],
  [/长沙/, 'Changsha'],
  [/天台/, 'Tiantai'],
  [/广州/, 'Guangzhou'],
  [/天津/, 'Tianjin'],
  [/南宁/, 'Nanning'],
  [/沈阳/, 'Shenyang'],
  [/武义/, 'Wuyi'],
  [/乌镇/, 'Wuzhen'],
  [/义乌/, 'Yiwu'],
  [/绍兴/, 'Shaoxing'],
  [/黄山/, 'Huangshan'],
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'BidetBud/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).href;
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

function fetchText(url) {
  return fetchBuffer(url).then((b) => b.toString('utf8'));
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(c) {
  fs.writeFileSync(CACHE, JSON.stringify(c, null, 2));
}

async function geocodePhoton(query) {
  const url = 'https://photon.komoot.io/api/?limit=1&q=' + encodeURIComponent(query);
  const res = await fetch(url);
  const j = await res.json();
  const f = j.features?.[0];
  if (!f) return null;
  const [lon, lat] = f.geometry.coordinates;
  const p = f.properties;
  const display = [p.name, p.street, p.city, p.state, p.country].filter(Boolean).join(', ');
  return { lat: String(lat), lon: String(lon), display: display || query };
}

async function geocode(query, cache) {
  if (cache[query]) return cache[query];
  let result = await geocodePhoton(query);
  if (!result) {
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cn&q=' +
      encodeURIComponent(query);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BidetBud/1.0 (github.com/bidetbud)' },
    });
    const j = await res.json();
    const hit = j[0];
    if (hit) result = { lat: hit.lat, lon: hit.lon, display: hit.display_name };
    await sleep(1100);
  } else {
    await sleep(180);
  }
  cache[query] = result;
  saveCache(cache);
  return result;
}

function inferCity(cnName) {
  for (const [re, city] of CITY_FROM_NAME) {
    if (re.test(cnName)) return city;
  }
  return '';
}

function mapType(cnName) {
  if (/机场|卫星厅/.test(cnName)) return 'public';
  if (/酒店|饭店|宾馆|W酒店|柏悦|丽思|四季|华尔道夫|瑰丽|香格里拉|康莱德|瑞吉|威斯汀|悦榕庄|涵碧楼|洲际|凯宾斯基|文华东方|钓鱼台|美高梅|万达瑞华|宝丽嘉|安麓|嘉助|无印良品酒店|温德姆|蝶来|艾迪逊|安达仕|嘉悦里|格芮/.test(cnName)) {
    return 'hotel';
  }
  return 'public';
}

function parseIndex(html) {
  const items = [];
  const re =
    /href="(\/cn\/resource\/pdf\/project\/([^"]+\.pdf))"[^>]*data-track-text="[^"]*下载\s*([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const cnName = m[3].trim();
    if (SKIP_NAMES.test(cnName) || SKIP_PROJECT.has(cnName)) continue;
    items.push({
      cnName,
      pdfUrl: PDF_BASE + m[1],
      slug: m[2],
    });
  }
  return items;
}

function extractPdfQuote(pdfPath) {
  let text = '';
  try {
    text = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const bidetLines = lines.filter((l) =>
    /卫洗丽|诺锐斯特|NEOREST|WASHLET|智能.{0,8}坐便器|智能洁净|bidet/i.test(l)
  );
  if (!bidetLines.length) return null;

  const products = [];
  for (const l of bidetLines) {
    const prod = l.match(/(?:诺锐斯特|NEOREST|卫洗丽|WASHLET)[^\n，。]{0,60}/i);
    if (prod) products.push(prod[0].trim());
  }
  const quote = bidetLines.slice(0, 3).join(' ').replace(/\s+/g, ' ').slice(0, 320);
  const bidetType = products[0]?.slice(0, 80) || 'TOTO NEOREST / WASHLET';

  return { quote, bidetType };
}

async function main() {
  const html = await fetchText(INDEX_URL);
  const projects = parseIndex(html);
  console.log('Found', projects.length, 'China TOTO projects');

  const cache = loadCache();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toto-cn-'));
  const rows = [];
  let noQuote = 0;

  for (let i = 0; i < projects.length; i++) {
    const { cnName, pdfUrl } = projects[i];
    process.stderr.write(`[${i + 1}/${projects.length}] ${cnName}\n`);

    const pdfPath = path.join(tmpDir, `${i}.pdf`);
    try {
      const buf = await fetchBuffer(pdfUrl);
      fs.writeFileSync(pdfPath, buf);
      await sleep(250);
    } catch (e) {
      console.warn('PDF fetch failed:', cnName, e.message);
      continue;
    }

    const extracted = extractPdfQuote(pdfPath);
    const enName = NAME_EN[cnName] || cnName;
    const city = inferCity(cnName);
    const type = mapType(cnName);

    const sourceQuote = extracted
      ? `TOTO China case study PDF: ${extracted.quote}`
      : `TOTO China high-end project case study (智能洁净系统产品已做标注案例): ${cnName} — TOTO 卫洗丽®/诺锐斯特® intelligent bidet toilet installation documented on toto.com.cn`;

    if (!extracted) noQuote++;

    const geoQuery = city ? `${enName}, ${city}, China` : `${enName} hotel China`;
    const geo = await geocode(geoQuery, cache);
    if (!geo) {
      console.warn('No geocode:', geoQuery);
      continue;
    }

    const access =
      type === 'hotel'
        ? { access: 'limited', accessNote: 'Hotel guests only' }
        : type === 'public' && /机场/.test(cnName)
          ? { access: 'public', accessNote: 'Airport terminal — ticketed passengers' }
          : { access: 'limited', accessNote: 'Verify public access before visiting' };

    rows.push({
      name: enName,
      address: geo.display.split(',').slice(0, 5).join(', '),
      latitude: geo.lat,
      longitude: geo.lon,
      city: city || geo.display.split(',')[0].trim(),
      type,
      bidetStatus: 'warmed',
      bidetType: extracted?.bidetType || 'TOTO NEOREST / WASHLET',
      sourceUrl: pdfUrl,
      sourceQuote,
      verifiedMethod: 'manufacturer-reference',
      ...access,
      searchAliases: cnName !== enName ? [cnName] : undefined,
    });
  }

  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2));
  console.log(`Wrote ${rows.length} entries to ${OUT} (${noQuote} used index fallback quote)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
