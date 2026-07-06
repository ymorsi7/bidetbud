#!/usr/bin/env node
/**
 * Aggregate verified France bidet locations from French / FR-market sources.
 *
 * Sources:
 * - TOTO Europe case studies (eu.toto.com/fr) — WASHLET only
 * - TOTO WASHLET Finder France (public test locations)
 * - Geberit AquaClean hotel press (geberit.fr, French trade press)
 * - French hotel/restaurant sites with explicit bidet/washlet/WC lavant mentions
 *
 * Does NOT bulk-import mosques or generic OSM data.
 * Skips TOTO references that only document standard toilets (Louvre, Viparis).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '../data/france-verified-bidets.json');
const TOTO_EU = path.join(__dirname, '../data/toto-europe-references.json');
const TOTO_FINDER_CACHE = path.join(__dirname, '../data/toto-france-finder.json');

const SKIP_TOTO_NAMES = /^(Louvre|Viparis)\b/i;
const HAS_WASHLET = /washlet|wc lavant|toilette japonaise|neorest|aquaclean|bidet/i;

/** Hand-curated rows from French websites not in automated scrapes */
const FRENCH_WEB_SOURCES = [
  {
    name: 'Manolita Paris',
    address: '1 Rue Lepic, 75018 Paris',
    latitude: '48.884200',
    longitude: '2.338600',
    city: 'Paris',
    type: 'hotel',
    bidetStatus: 'warmed',
    bidetType: 'TOTO Washlet',
    sourceUrl: 'https://www.manolitaparis.com/chambres',
    sourceQuote:
      'Official hotel site lists Toilettes Japonaise Toto Washlet in Deluxe room bathrooms',
    verifiedMethod: 'web-source',
    access: 'limited',
    accessNote: 'Hotel guests only',
  },
  {
    name: 'Hôtel Tourisme Avenue',
    address: '17 Avenue de la Motte-Picquet, 75015 Paris',
    latitude: '48.856742',
    longitude: '2.300103',
    city: 'Paris',
    type: 'hotel',
    bidetStatus: 'warmed',
    bidetType: 'TOTO washlet (toilettes japonaises)',
    sourceUrl: 'http://reservation-hotel.atel-hotels.com/hotel-tourisme-avenue_H86fr.html',
    sourceQuote:
      'French hotel booking page: most rooms equipped with Japanese TOTO toilets (toilettes japonaises TOTO)',
    verifiedMethod: 'web-source',
    access: 'limited',
    accessNote: 'Hotel guests only — confirm room category when booking',
  },
  {
    name: 'Hotel Plaza Elysées',
    address: '177 Boulevard Haussmann, 75008 Paris',
    latitude: '48.874889',
    longitude: '2.307778',
    city: 'Paris',
    type: 'hotel',
    bidetStatus: 'internet',
    bidetType: 'Toilettes japonaises',
    sourceUrl: 'https://www.booking.com/hotel/fr/plazaelysees.fr.html',
    sourceQuote:
      'Booking.com room amenities list private bathrooms with Japanese-style toilets (toilettes japonaises)',
    verifiedMethod: 'web-source',
    access: 'limited',
    accessNote: 'Hotel guests only',
  },
  {
    name: 'Hostellerie de Levernois',
    address: '15 Rue du Golf, 21200 Levernois',
    latitude: '46.993198',
    longitude: '4.877602',
    city: 'Levernois',
    type: 'hotel',
    bidetStatus: 'warmed',
    bidetType: 'Geberit AquaClean Sela',
    sourceUrl:
      'https://www.cattoire.com/architecture-btp/a-hostellerie-de-levernois-geberit-participe-aux-nouveaux-codes-de-lhospitalite-haut-de-gamme/',
    sourceQuote:
      'French trade press: every renovated room and new villa bathroom equipped with Geberit AquaClean Sela shower toilets',
    verifiedMethod: 'web-source',
    access: 'limited',
    accessNote: 'Hotel guests only',
  },
  {
    name: 'Okomusu',
    address: '11 Rue Charlot, 75003 Paris',
    latitude: '48.863089',
    longitude: '2.362278',
    city: 'Paris',
    type: 'restaurant',
    bidetStatus: 'internet',
    bidetType: 'Japanese washlet (ウォッシュレット)',
    sourceUrl: 'https://www.arukikata.co.jp/tokuhain/236314/',
    sourceQuote:
      'Japanese travel guide notes rare Japanese washlet in restaurant restroom — "パリではかなり珍しい日本のウォッシュレット"',
    verifiedMethod: 'web-source',
    access: 'public',
    accessNote: 'Restaurant patrons',
  },
  {
    name: 'Le Trône (showroom WC japonais)',
    address: '85 Rue d\'Assas, 75006 Paris',
    latitude: '48.843889',
    longitude: '2.330278',
    city: 'Paris',
    type: 'public',
    bidetStatus: 'internet',
    bidetType: 'Washlet showroom (multiple brands)',
    sourceUrl: 'https://les-toilettes-japonaises.fr/exposition-wc-japonais/',
    sourceQuote:
      'French specialist site: Le Trône is Paris\'s first washlet showroom where visitors can try Japanese toilets',
    verifiedMethod: 'web-source',
    access: 'public',
    accessNote: 'Showroom — call ahead for visit hours',
    searchAliases: ['Le Trone', 'Trone Paris'],
  },
];

/** TOTO WASHLET Finder — France public test locations (parsed from eu.toto.com/fr/service/tester-le-washlettm) */
const TOTO_FINDER_FRANCE = [
  {
    name: 'The Peninsula Paris',
    address: '19 Avenue Kléber, 75116 Paris',
    latitude: '48.870833',
    longitude: '2.293611',
    city: 'Paris',
    type: 'hotel',
    bidetType: 'TOTO WASHLET',
    access: 'limited',
    accessNote: 'Hotel guests and patrons',
  },
  {
    name: 'Mandarin Oriental Paris',
    address: '251 Rue Saint-Honoré, 75001 Paris',
    latitude: '48.867500',
    longitude: '2.328889',
    city: 'Paris',
    type: 'hotel',
    bidetType: 'TOTO WASHLET',
    access: 'limited',
    accessNote: 'Hotel guests and patrons',
  },
  {
    name: 'Four Seasons Hotel George V Paris',
    address: '31 Avenue George V, 75008 Paris',
    latitude: '48.868611',
    longitude: '2.300833',
    city: 'Paris',
    type: 'hotel',
    bidetType: 'TOTO WASHLET',
    access: 'limited',
    accessNote: 'Hotel guests and patrons',
    searchAliases: ['Le Four Seasons George V'],
  },
  {
    name: 'La Réserve Paris',
    address: '42 Avenue Gabriel, 75008 Paris',
    latitude: '48.870556',
    longitude: '2.312222',
    city: 'Paris',
    type: 'hotel',
    bidetType: 'TOTO WASHLET',
    access: 'limited',
    accessNote: 'Hotel guests only',
    searchAliases: ['Le Hotel la Reserve'],
  },
  {
    name: 'Lancaster Paris',
    address: '7 Rue de Berri, 75008 Paris',
    latitude: '48.872222',
    longitude: '2.304444',
    city: 'Paris',
    type: 'hotel',
    bidetType: 'TOTO WASHLET',
    access: 'limited',
    accessNote: 'Hotel guests and patrons',
  },
  {
    name: 'Le Royal Monceau Raffles Paris',
    address: '37 Avenue Hoche, 75008 Paris',
    latitude: '48.875833',
    longitude: '2.300556',
    city: 'Paris',
    type: 'hotel',
    bidetType: 'TOTO WASHLET',
    access: 'limited',
    accessNote: 'Hotel guests and patrons',
  },
  {
    name: 'Hôtel Marignan Champs-Élysées',
    address: '12 Rue de Marignan, 75008 Paris',
    latitude: '48.869722',
    longitude: '2.307500',
    city: 'Paris',
    type: 'hotel',
    bidetType: 'TOTO WASHLET',
    access: 'limited',
    accessNote: 'Hotel guests and patrons',
    searchAliases: ['Hotel Marignan'],
  },
  {
    name: 'Hôtel Lapin Blanc',
    address: '41 Boulevard Saint-Michel, 75005 Paris',
    latitude: '48.849722',
    longitude: '2.343056',
    city: 'Paris',
    type: 'hotel',
    bidetType: 'TOTO WASHLET',
    access: 'limited',
    accessNote: 'Hotel guests only',
    searchAliases: ['Hotel Lapin blanc'],
  },
  {
    name: 'Hôtel Edouard VI',
    address: '61 Boulevard du Montparnasse, 75006 Paris',
    latitude: '48.842500',
    longitude: '2.326944',
    city: 'Paris',
    type: 'hotel',
    bidetType: 'TOTO WASHLET',
    access: 'limited',
    accessNote: 'Hotel guests only',
    searchAliases: ['Hotel Edouard VI Paris'],
  },
  {
    name: 'AC Hotel Paris Porte Maillot',
    address: '6 Rue Gustave Charpentier, 75017 Paris',
    latitude: '48.878889',
    longitude: '2.282500',
    city: 'Paris',
    type: 'hotel',
    bidetType: 'TOTO WASHLET',
    access: 'limited',
    accessNote: 'Hotel guests only',
    searchAliases: ['Hotel AC Marriott Paris'],
  },
  {
    name: 'Hôtel Le Bouclier d\'Or',
    address: '1 Rue du Bouclier, 67000 Strasbourg',
    latitude: '48.581111',
    longitude: '7.750556',
    city: 'Strasbourg',
    type: 'hotel',
    bidetType: 'TOTO WASHLET',
    access: 'limited',
    accessNote: 'Hotel guests only',
    searchAliases: ['Le Bouclier d\'Or Strasbourg'],
  },
  {
    name: 'Aman Le Mélézin',
    address: '310 Rue de Bellecôte, 73120 Courchevel',
    latitude: '45.414167',
    longitude: '6.634722',
    city: 'Courchevel',
    type: 'hotel',
    bidetType: 'TOTO WASHLET',
    access: 'limited',
    accessNote: 'Hotel guests only',
    searchAliases: ['Aman Le Melezin'],
  },
  {
    name: 'Cheval Blanc Courchevel',
    address: 'Rue du Jardin Alpin, 73120 Courchevel 1850',
    latitude: '45.414722',
    longitude: '6.636111',
    city: 'Courchevel',
    type: 'hotel',
    bidetType: 'TOTO WASHLET',
    access: 'limited',
    accessNote: 'Hotel guests only',
    searchAliases: ['Metropole 1850 Cheval Blanc Courchevel'],
  },
  {
    name: 'Le Strato Courchevel',
    address: 'Route de Bellecôte, 73120 Courchevel',
    latitude: '45.413889',
    longitude: '6.635000',
    city: 'Courchevel',
    type: 'restaurant',
    bidetType: 'TOTO WASHLET',
    access: 'public',
    accessNote: 'Restaurant patrons',
  },
  {
    name: 'Passage 53',
    address: '53 Passage des Panoramas, 75002 Paris',
    latitude: '48.871389',
    longitude: '2.341667',
    city: 'Paris',
    type: 'restaurant',
    bidetType: 'TOTO WASHLET',
    access: 'public',
    accessNote: 'Restaurant patrons',
    searchAliases: ['Restaurant Passage 53 Paris'],
  },
  {
    name: 'Espace Aubade Paris',
    address: '6 Rue Abel, 75012 Paris',
    latitude: '48.845833',
    longitude: '2.373056',
    city: 'Paris',
    type: 'public',
    bidetType: 'TOTO WASHLET (showroom)',
    access: 'public',
    accessNote: 'Bathroom showroom — WASHLET test location',
  },
  {
    name: 'Carré d\'Azur Marseille',
    address: '54 Avenue du Prado, 13006 Marseille',
    latitude: '43.284722',
    longitude: '5.383889',
    city: 'Marseille',
    type: 'public',
    bidetType: 'TOTO WASHLET (showroom)',
    access: 'public',
    accessNote: 'Bathroom showroom — WASHLET test location',
  },
  {
    name: 'DVA Bath Concept Lyon',
    address: '24 Cours Lafayette, 69003 Lyon',
    latitude: '45.760556',
    longitude: '4.843889',
    city: 'Lyon',
    type: 'public',
    bidetType: 'TOTO WASHLET (showroom)',
    access: 'public',
    accessNote: 'Bathroom showroom — WASHLET test location',
  },
];

const FOUQUET_MANUAL = {
  name: "Hôtel Barrière Le Fouquet's",
  address: '46 Avenue George V, 75008 Paris',
  latitude: '48.871358',
  longitude: '2.301214',
  city: 'Paris',
  type: 'hotel',
  bidetStatus: 'warmed',
  bidetType: 'TOTO NEOREST WASHLET EW 2.0',
  sourceUrl:
    'https://eu.toto.com/fr/lentreprise/references/hotel-barriere-le-fouquets',
  sourceQuote:
    'TOTO France case study: signature suites equipped with NEOREST WASHLET EW 2.0',
  verifiedMethod: 'manufacturer-reference',
  access: 'limited',
  accessNote: 'Hotel guests only — signature suites',
};

const IMPERATOR_MANUAL = {
  name: 'Maison Albar – Imperator',
  address: '3 Quai de la Fontaine, 30000 Nîmes',
  latitude: '43.838889',
  longitude: '4.360556',
  city: 'Nîmes',
  type: 'hotel',
  bidetStatus: 'warmed',
  bidetType: 'TOTO WASHLET GL 2.0',
  sourceUrl:
    'https://eu.toto.com/fr/lentreprise/references/maison-albar-imperator-hotel',
  sourceQuote:
    'TOTO France case study: all 53 rooms and 8 private houses equipped with WASHLET GL 2.0',
  verifiedMethod: 'manufacturer-reference',
  access: 'limited',
  accessNote: 'Hotel guests only',
};

function dedupeKey(row) {
  return [
    row.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
    Number(row.latitude).toFixed(4),
    Number(row.longitude).toFixed(4),
  ].join('|');
}

function normalizeTotoEurope(row) {
  if (row.country !== 'France') return null;
  if (SKIP_TOTO_NAMES.test(row.name)) return null;
  const quote = `${row.sourceQuote || ''} ${row.bidetType || ''}`;
  if (!HAS_WASHLET.test(quote)) return null;
  return {
    name: row.name.replace(/\s*[–—].*Paris.*$/i, '').trim(),
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    city: row.city,
    type: row.type || 'hotel',
    bidetStatus: row.bidetStatus || 'warmed',
    bidetType: row.bidetType,
    sourceUrl: row.sourceUrl,
    sourceQuote: row.sourceQuote,
    verifiedMethod: row.verifiedMethod || 'manufacturer-reference',
    access: row.access || 'limited',
    accessNote: row.accessNote,
  };
}

function normalizeFinder(row) {
  return {
    ...row,
    bidetStatus: 'warmed',
    sourceUrl: 'https://eu.toto.com/fr/service/tester-le-washlettm',
    sourceQuote:
      'TOTO France WASHLET Finder: public location where visitors can test WASHLET',
    verifiedMethod: 'manufacturer-reference',
  };
}

function mergeRows(existing, incoming) {
  const seen = new Set(existing.map(dedupeKey));
  let added = 0;
  for (const row of incoming) {
    if (!row.sourceUrl || !row.sourceQuote) continue;
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    existing.push(row);
    added++;
  }
  return added;
}

function main() {
  const rows = [];

  if (fs.existsSync(TOTO_EU)) {
    const toto = JSON.parse(fs.readFileSync(TOTO_EU, 'utf8'));
    for (const r of toto) {
      const n = normalizeTotoEurope(r);
      if (n) rows.push(n);
    }
  }

  rows.push(FOUQUET_MANUAL, IMPERATOR_MANUAL);
  rows.push(...FRENCH_WEB_SOURCES);
  rows.push(...TOTO_FINDER_FRANCE.map(normalizeFinder));

  // Dedupe by name+coords
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  out.sort((a, b) =>
  `${a.city}|${a.name}`.localeCompare(`${b.city}|${b.name}`, 'fr'));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(TOTO_FINDER_CACHE, JSON.stringify(TOTO_FINDER_FRANCE, null, 2));
  console.log(`Wrote ${out.length} verified France rows to ${OUT}`);
}

main();
