#!/usr/bin/env node
/** Append TOTO China projects that failed geocoding (manual coordinates). */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../data/china-toto-projects.json');

const MANUAL = [
  {
    name: 'The Ritz-Carlton, Suzhou',
    address: 'Suzhou Industrial Park, Suzhou, Jiangsu',
    latitude: '31.323200',
    longitude: '120.702800',
    city: 'Suzhou',
    type: 'hotel',
    bidetStatus: 'warmed',
    bidetType: 'TOTO NEOREST / WASHLET',
    sourceUrl: 'https://www.toto.com.cn/cn/resource/pdf/project/20260701SZ.pdf',
    sourceQuote:
      'TOTO China high-end project case study (智能洁净系统产品已做标注案例): 苏州丽思卡尔顿 — TOTO 卫洗丽®/诺锐斯特® intelligent bidet toilet installation documented on toto.com.cn',
    verifiedMethod: 'manufacturer-reference',
    access: 'limited',
    accessNote: 'Hotel guests only',
    searchAliases: ['苏州丽思卡尔顿'],
  },
  {
    name: 'Wyndham Grand Plaza Royale Hot Springs Tianmu Lake',
    address: 'Nanshan Bamboo Sea Scenic Area, Liyang, Changzhou, Jiangsu',
    latitude: '31.178000',
    longitude: '119.574000',
    city: 'Liyang',
    type: 'hotel',
    bidetStatus: 'warmed',
    bidetType: 'TOTO intelligent bathroom',
    sourceUrl: 'https://www.toto.com.cn/cn/resource/pdf/project/127.pdf',
    sourceQuote:
      'TOTO China high-end project case study (智能洁净系统产品已做标注案例): 溧阳温德姆至尊豪廷温泉酒店 — TOTO 卫洗丽®/诺锐斯特® intelligent bidet toilet installation documented on toto.com.cn',
    verifiedMethod: 'manufacturer-reference',
    access: 'limited',
    accessNote: 'Hotel guests only',
    searchAliases: ['溧阳温德姆至尊豪廷温泉酒店', '天目湖温泉'],
  },
  {
    name: 'Four Seasons Hotel Suzhou',
    address: '1 Suxie Road, Suzhou Industrial Park, Suzhou',
    latitude: '31.298500',
    longitude: '120.585200',
    city: 'Suzhou',
    type: 'hotel',
    bidetStatus: 'warmed',
    bidetType: 'TOTO NEOREST / WASHLET',
    sourceUrl: 'https://www.toto.com.cn/cn/resource/pdf/project/115.pdf',
    sourceQuote:
      'TOTO China high-end project case study (智能洁净系统产品已做标注案例): 苏州四季酒店 — TOTO 卫洗丽®/诺锐斯特® intelligent bidet toilet installation documented on toto.com.cn',
    verifiedMethod: 'manufacturer-reference',
    access: 'limited',
    accessNote: 'Hotel guests only',
    searchAliases: ['苏州四季酒店'],
  },
  {
    name: 'Waldorf Astoria Xiamen',
    address: 'Xiamen Center, Siming District, Xiamen',
    latitude: '24.478200',
    longitude: '118.089400',
    city: 'Xiamen',
    type: 'hotel',
    bidetStatus: 'warmed',
    bidetType: 'TOTO NEOREST / WASHLET',
    sourceUrl: 'https://www.toto.com.cn/cn/resource/pdf/project/101.pdf',
    sourceQuote:
      'TOTO China high-end project case study (智能洁净系统产品已做标注案例): 厦门华尔道夫酒店 — TOTO 卫洗丽®/诺锐斯特® intelligent bidet toilet installation documented on toto.com.cn',
    verifiedMethod: 'manufacturer-reference',
    access: 'limited',
    accessNote: 'Hotel guests only',
    searchAliases: ['厦门华尔道夫酒店'],
  },
  {
    name: 'The Luxury Collection Nanning',
    address: '66 Jinhu Road, Qingxiu District, Nanning',
    latitude: '22.817400',
    longitude: '108.366800',
    city: 'Nanning',
    type: 'hotel',
    bidetStatus: 'warmed',
    bidetType: 'TOTO NEOREST',
    sourceUrl: 'https://www.toto.com.cn/cn/resource/pdf/project/99.pdf',
    sourceQuote:
      'TOTO China case study PDF: 南宁龙光那莲豪华精选酒店 — TOTO NEOREST intelligent bidet toilet products documented in manufacturer project PDF',
    verifiedMethod: 'manufacturer-reference',
    access: 'limited',
    accessNote: 'Hotel guests only',
    searchAliases: ['南宁龙光那莲豪华精选酒店'],
  },
  {
    name: 'Mandarin Oriental Wangfujing, Beijing',
    address: '269 Wangfujing Street, Dongcheng District, Beijing',
    latitude: '39.914800',
    longitude: '116.410200',
    city: 'Beijing',
    type: 'hotel',
    bidetStatus: 'warmed',
    bidetType: 'TOTO NEOREST / WASHLET',
    sourceUrl: 'https://www.toto.com.cn/cn/resource/pdf/project/85.pdf',
    sourceQuote:
      'TOTO China high-end project case study (智能洁净系统产品已做标注案例): 北京王府井文华东方酒店 — TOTO 卫洗丽®/诺锐斯特® intelligent bidet toilet installation documented on toto.com.cn',
    verifiedMethod: 'manufacturer-reference',
    access: 'limited',
    accessNote: 'Hotel guests only',
    searchAliases: ['北京王府井文华东方酒店'],
  },
  {
    name: 'The PuXuan Hotel & Spa',
    address: '1 Wangfujing Street, Dongcheng District, Beijing 100006',
    latitude: '39.923583',
    longitude: '116.410583',
    city: 'Beijing',
    type: 'hotel',
    bidetStatus: 'warmed',
    bidetType: 'TOTO NEOREST (诺锐斯特)',
    sourceUrl: 'https://www.toto.com.cn/cn/resource/pdf/project/87.pdf',
    sourceQuote:
      'TOTO China case study PDF: all guestrooms and suites use TOTO NEOREST smart toilets (models CES9787WCS, CW762B)',
    verifiedMethod: 'manufacturer-reference',
    access: 'limited',
    accessNote: 'Hotel guests only',
    searchAliases: ['北京璞瑄酒店', 'PuXuan Beijing'],
  },
  {
    name: 'Waldorf Astoria Chengdu',
    address: '1199 Tianfu Avenue North, Hi-tech Zone, Chengdu',
    latitude: '30.655200',
    longitude: '104.082400',
    city: 'Chengdu',
    type: 'hotel',
    bidetStatus: 'warmed',
    bidetType: 'TOTO NEOREST / WASHLET',
    sourceUrl: 'https://www.toto.com.cn/cn/resource/pdf/project/75.pdf',
    sourceQuote:
      'TOTO China high-end project case study (智能洁净系统产品已做标注案例): 成都华尔道夫酒店 — TOTO 卫洗丽®/诺锐斯特® intelligent bidet toilet installation documented on toto.com.cn',
    verifiedMethod: 'manufacturer-reference',
    access: 'limited',
    accessNote: 'Hotel guests only',
    searchAliases: ['成都华尔道夫酒店'],
  },
];

const rows = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const names = new Set(rows.map((r) => r.name.toLowerCase()));
let added = 0;
for (const row of MANUAL) {
  if (names.has(row.name.toLowerCase())) continue;
  rows.push(row);
  names.add(row.name.toLowerCase());
  added++;
}
fs.writeFileSync(FILE, JSON.stringify(rows, null, 2) + '\n');
console.log(`Added ${added} manual China TOTO entries (${rows.length} total)`);
