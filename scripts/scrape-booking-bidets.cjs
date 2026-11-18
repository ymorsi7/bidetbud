#!/usr/bin/env node
/**
 * Scrape Booking.com searches filtered to room facility Bidet (code 100).
 * Each hotel that lists Bidet is per-venue evidence.
 *
 * Booking's HTML search payload only includes the first ~20 hits, so we query
 * many cities/neighborhoods instead of paginating one city.
 *
 *   node scripts/scrape-booking-bidets.cjs
 *   node scripts/scrape-booking-bidets.cjs --import
 *   node scripts/scrape-booking-bidets.cjs --reset
 *
 * Output: data/booking-bidet-hotels.json
 * State:  data/booking-bidet-state.json
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { normalizeCountry, isFriendlyCountry } = require('./lib/non-friendly-countries.cjs');

const OUT = path.join(__dirname, '../data/booking-bidet-hotels.json');
const STATE = path.join(__dirname, '../data/booking-bidet-state.json');

const CHECKIN = '2026-11-20';
const CHECKOUT = '2026-11-21';
const DO_IMPORT = process.argv.includes('--import');
const RESET = process.argv.includes('--reset');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.split('=').slice(1).join('=').toLowerCase() : '';

function dests(country, names) {
  return names.map((n) => ({ ss: n.includes(',') ? n : `${n}, ${country}` }));
}

const CITIES = [
  ...dests('Spain', [
    'Madrid', 'Barcelona', 'Valencia', 'Seville', 'Malaga', 'Palma de Mallorca', 'Bilbao',
    'Granada', 'Alicante', 'Zaragoza', 'San Sebastian', 'Tenerife', 'Las Palmas', 'Cordoba',
    'Murcia', 'Vigo', 'Santander', 'Oviedo', 'Pamplona', 'Salamanca', 'Toledo', 'Cadiz',
    'Marbella', 'Ibiza', 'Valencia City Center', 'Madrid Centro', 'Chamartin, Madrid',
    'Salamanca, Madrid', 'Malasana, Madrid', 'Eixample, Barcelona', 'Gracia, Barcelona',
    'Gothic Quarter, Barcelona', 'El Born, Barcelona', 'Seville Centro',
  ]),
  ...dests('Portugal', [
    'Lisbon', 'Porto', 'Faro', 'Funchal', 'Coimbra', 'Braga', 'Aveiro', 'Sintra',
    'Cascais', 'Albufeira', 'Lagos, Portugal', 'Lisbon City Center', 'Baixa, Lisbon',
    'Alfama, Lisbon', 'Belem, Lisbon', 'Ribeira, Porto',
  ]),
  ...dests('France', [
    'Paris', 'Lyon', 'Marseille', 'Nice', 'Bordeaux', 'Toulouse', 'Strasbourg', 'Lille',
    'Nantes', 'Montpellier', 'Rennes', 'Reims', 'Cannes', 'Aix-en-Provence', 'Avignon',
    'Annecy', 'Grenoble', 'Dijon', 'Rouen', 'Tours', 'Paris 1st Arrondissement',
    'Le Marais, Paris', 'Saint-Germain, Paris', 'Montmartre, Paris', 'Lyon Presquile',
  ]),
  ...dests('United States', [
    'New York', 'Los Angeles', 'San Francisco', 'Chicago', 'Miami', 'Houston', 'Dallas',
    'Seattle', 'Boston', 'Washington DC', 'Atlanta', 'Denver', 'Las Vegas', 'Honolulu',
    'San Diego', 'Austin', 'Philadelphia', 'Phoenix', 'Portland', 'Minneapolis',
    'Detroit', 'Charlotte', 'Orlando', 'Tampa', 'Nashville', 'New Orleans', 'San Jose',
    'Sacramento', 'Salt Lake City', 'Kansas City', 'Columbus', 'Indianapolis',
    'Manhattan, New York', 'Brooklyn, New York', 'Queens, New York', 'Miami Beach',
    'Beverly Hills', 'Santa Monica', 'Pasadena', 'Oakland', 'Cambridge, Massachusetts',
  ]),
  ...dests('Canada', [
    'Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa', 'Edmonton', 'Quebec City',
    'Winnipeg', 'Halifax', 'Victoria', 'Mississauga', 'Downtown Toronto',
    'Downtown Vancouver', 'Old Montreal',
  ]),
  ...dests('United Kingdom', [
    'London', 'Manchester', 'Edinburgh', 'Birmingham', 'Glasgow', 'Liverpool', 'Bristol',
    'Leeds', 'Cardiff', 'Belfast', 'Newcastle', 'Oxford', 'Cambridge', 'Brighton',
    'Westminster, London', 'Kensington, London', 'Camden, London', 'Shoreditch, London',
    'Canary Wharf, London', 'Edinburgh Old Town',
  ]),
  ...dests('Ireland', ['Dublin', 'Cork', 'Galway', 'Limerick', 'Kilkenny', 'Belfast']),
  ...dests('Australia', [
    'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast', 'Canberra',
    'Hobart', 'Cairns', 'Darwin', 'Surry Hills, Sydney', 'St Kilda, Melbourne',
  ]),
  ...dests('New Zealand', ['Auckland', 'Wellington', 'Christchurch', 'Queenstown', 'Rotorua', 'Dunedin']),
  ...dests('Mexico', [
    'Mexico City', 'Cancun', 'Guadalajara', 'Monterrey', 'Playa del Carmen',
    'Puerto Vallarta', 'Tijuana', 'Oaxaca', 'Merida', 'Puebla', 'San Miguel de Allende',
    'Polanco, Mexico City', 'Roma Norte, Mexico City', 'Condesa, Mexico City',
  ]),
  ...dests('Colombia', ['Bogota', 'Medellin', 'Cartagena', 'Cali', 'Barranquilla']),
  ...dests('Chile', ['Santiago', 'Valparaiso', 'Puerto Varas', 'San Pedro de Atacama']),
  ...dests('Peru', ['Lima', 'Cusco', 'Arequipa', 'Miraflores, Lima']),
  ...dests('Germany', [
    'Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Cologne', 'Dusseldorf', 'Stuttgart',
    'Leipzig', 'Dresden', 'Nuremberg', 'Hannover', 'Mitte, Berlin', 'Prenzlauer Berg, Berlin',
  ]),
  ...dests('Netherlands', ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven', 'Haarlem']),
  ...dests('Switzerland', ['Zurich', 'Geneva', 'Basel', 'Bern', 'Lausanne', 'Lucerne', 'Interlaken']),
  ...dests('Austria', ['Vienna', 'Salzburg', 'Innsbruck', 'Graz', 'Linz']),
  ...dests('Belgium', ['Brussels', 'Antwerp', 'Ghent', 'Bruges', 'Liege']),
  ...dests('Denmark', ['Copenhagen', 'Aarhus', 'Odense']),
  ...dests('Sweden', ['Stockholm', 'Gothenburg', 'Malmo']),
  ...dests('Norway', ['Oslo', 'Bergen', 'Tromso', 'Stavanger']),
  ...dests('Poland', ['Warsaw', 'Krakow', 'Gdansk', 'Wroclaw', 'Poznan']),
  ...dests('Czech Republic', ['Prague', 'Brno', 'Ostrava']),
  ...dests('Hungary', ['Budapest', 'Debrecen']),
  ...dests('Romania', ['Bucharest', 'Cluj-Napoca', 'Brasov']),
  ...dests('Croatia', ['Zagreb', 'Split', 'Dubrovnik', 'Zadar', 'Rijeka', 'Pula', 'Hvar']),
  ...dests('Slovenia', ['Ljubljana', 'Bled', 'Piran']),
  ...dests('Finland', ['Helsinki', 'Tampere', 'Turku']),
  ...dests('Slovakia', ['Bratislava', 'Kosice']),
  ...dests('Bulgaria', ['Sofia', 'Plovdiv', 'Varna']),
  ...dests('Serbia', ['Belgrade', 'Novi Sad']),
  ...dests('Russia', ['Moscow', 'Saint Petersburg', 'Kazan', 'Sochi']),
  ...dests('South Africa', ['Cape Town', 'Johannesburg', 'Durban', 'Pretoria']),
  ...dests('Kenya', ['Nairobi', 'Mombasa']),
  ...dests('Nigeria', ['Lagos', 'Abuja']),
  ...dests('China', ['Beijing', 'Shanghai', 'Shenzhen', 'Guangzhou', 'Hangzhou', 'Chengdu', 'Xian']),
  { ss: 'Hong Kong' },
  ...dests('Philippines', ['Manila', 'Cebu', 'Davao', 'Makati', 'Quezon City', 'Boracay']),
  // Round-2 destinations (prior CITIES batch fully scraped)
  ...dests('United States', [
    'Raleigh', 'Pittsburgh', 'Cleveland', 'Cincinnati', 'Milwaukee', 'St Louis',
    'Baltimore', 'Richmond', 'Buffalo', 'Rochester', 'Providence', 'Hartford',
    'Albuquerque', 'Tucson', 'Boise', 'Spokane', 'Anchorage', 'Fresno',
    'Long Beach', 'Anaheim', 'Irvine', 'Santa Barbara', 'Palm Springs',
    'Scottsdale', 'Tucson Downtown', 'Madison', 'Des Moines', 'Omaha',
    'Tulsa', 'Oklahoma City', 'Memphis', 'Knoxville', 'Charleston',
    'Savannah', 'Asheville', 'Jacksonville', 'Fort Lauderdale', 'Key West',
    'Jersey City', 'Hoboken', 'Newark', 'Stamford', 'White Plains',
  ]),
  ...dests('Canada', [
    'Hamilton', 'London Ontario', 'Kitchener', 'Waterloo', 'Windsor',
    'Saskatoon', 'Regina', 'Kelowna', 'Banff', 'Jasper', 'Whistler',
    'Niagara Falls', 'Kingston', 'Guelph', 'Surrey', 'Burnaby',
  ]),
  ...dests('United Kingdom', [
    'Bath', 'York', 'Chester', 'Exeter', 'Plymouth', 'Southampton',
    'Norwich', 'Nottingham', 'Sheffield', 'Leicester', 'Coventry',
    'Reading', 'Bournemouth', 'Aberdeen', 'Inverness', 'Stirling',
    'Swansea', 'Newport', 'Derry', 'Canterbury', 'Windsor, United Kingdom',
  ]),
  ...dests('Ireland', ['Waterford', 'Killarney', 'Sligo', 'Drogheda', 'Wexford']),
  ...dests('France', [
    'Biarritz', 'La Rochelle', 'Perpignan', 'Bayonne', 'Colmar', 'Metz',
    'Nancy', 'Clermont-Ferrand', 'Limoges', 'Poitiers', 'Orleans',
    'Amiens', 'Besancon', 'Angers', 'Le Havre', 'Saint-Malo', 'Deauville',
  ]),
  ...dests('Spain', [
    'Girona', 'Tarragona', 'Leon', 'Burgos', 'Valladolid', 'Almeria',
    'Jerez', 'Huelva', 'Lugo', 'Ourense', 'Logrono', 'Cuenca',
    'Segovia', 'Avila', 'Soria', 'Benidorm', 'Sitges', 'Salou',
  ]),
  ...dests('Portugal', [
    'Evora', 'Guimaraes', 'Viseu', 'Leiria', 'Setubal', 'Viana do Castelo',
    'Portimao', 'Tavira', 'Obidos', 'Nazare',
  ]),
  ...dests('Germany', [
    'Bonn', 'Heidelberg', 'Freiburg', 'Regensburg', 'Augsburg', 'Wurzburg',
    'Munster', 'Bremen', 'Kiel', 'Rostock', 'Erfurt', 'Potsdam', 'Mainz',
  ]),
  ...dests('Netherlands', ['Maastricht', 'Groningen', 'Leiden', 'Delft', 'Utrecht Centrum']),
  ...dests('Belgium', ['Leuven', 'Mechelen', 'Namur', 'Ostend', 'Dinant']),
  ...dests('Switzerland', ['Zermatt', 'St Moritz', 'Lugano', 'Winterthur', 'Thun']),
  ...dests('Austria', ['Linz Zentrum', 'Klagenfurt', 'Bregenz', 'Hallstatt', 'Zell am See']),
  ...dests('Poland', ['Lublin', 'Katowice', 'Szczecin', 'Bialystok', 'Lodz']),
  ...dests('Czech Republic', ['Cesky Krumlov', 'Plzen', 'Karlovy Vary', 'Olomouc']),
  ...dests('Hungary', ['Pecs', 'Szeged', 'Gyor', 'Eger']),
  ...dests('Romania', ['Timisoara', 'Iasi', 'Sibiu', 'Constanta', 'Oradea']),
  ...dests('Croatia', ['Rovinj', 'Sibenik', 'Makarska', 'Opatija', 'Korcula']),
  ...dests('Slovenia', ['Maribor', 'Portoroz', 'Koper', 'Ptuj']),
  ...dests('Bulgaria', ['Burgas', 'Veliko Tarnovo', 'Bansko', 'Nessebar']),
  ...dests('Serbia', ['Nis', 'Subotica', 'Kragujevac']),
  ...dests('Finland', ['Oulu', 'Rovaniemi', 'Jyväskylä', 'Porvoo']),
  ...dests('Sweden', ['Uppsala', 'Lund', 'Visby', 'Kiruna']),
  ...dests('Norway', ['Trondheim', 'Tromso Centrum', 'Flam', 'Alesund']),
  ...dests('Denmark', ['Aalborg', 'Esbjerg', 'Roskilde', 'Helsingor']),
  ...dests('Slovakia', ['Zilina', 'Trnava', 'Banska Bystrica']),
  ...dests('Estonia', ['Tallinn', 'Tartu', 'Parnu']),
  ...dests('Latvia', ['Riga', 'Jurmala', 'Liepaja']),
  ...dests('Lithuania', ['Vilnius', 'Kaunas', 'Klaipeda']),
  ...dests('Ukraine', ['Kyiv', 'Lviv', 'Odesa', 'Kharkiv']),
  // Skip bidet-friendly nations (filtered at scrape time anyway).
  ...dests('Paraguay', ['Asuncion', 'Ciudad del Este']),
  ...dests('Ecuador', ['Quito', 'Guayaquil', 'Cuenca Ecuador']),
  ...dests('Bolivia', ['La Paz', 'Santa Cruz Bolivia', 'Sucre']),
  ...dests('Venezuela', ['Caracas', 'Maracaibo']),
  ...dests('Panama', ['Panama City', 'Boquete', 'Coronado']),
  ...dests('Costa Rica', ['San Jose Costa Rica', 'Liberia Costa Rica', 'Tamarindo', 'La Fortuna']),
  ...dests('Guatemala', ['Antigua Guatemala', 'Guatemala City']),
  ...dests('Dominican Republic', ['Santo Domingo', 'Punta Cana', 'Puerto Plata']),
  ...dests('Jamaica', ['Kingston', 'Montego Bay', 'Ocho Rios']),
  ...dests('Trinidad and Tobago', ['Port of Spain']),
  ...dests('South Africa', [
    'Stellenbosch', 'Hermanus', 'Knysna', 'Port Elizabeth', 'Bloemfontein',
    'Nelspruit', 'Umhlanga', 'Sandton',
  ]),
  ...dests('Kenya', ['Kisumu', 'Nakuru', 'Malindi', 'Diani Beach']),
  ...dests('Ghana', ['Accra', 'Kumasi', 'Cape Coast']),
  ...dests('Tanzania', ['Dar es Salaam', 'Arusha', 'Zanzibar', 'Stone Town']),
  ...dests('Uganda', ['Kampala', 'Entebbe']),
  ...dests('Rwanda', ['Kigali']),
  ...dests('Ethiopia', ['Addis Ababa']),
  ...dests('Georgia', ['Tbilisi', 'Batumi']),
  ...dests('Armenia', ['Yerevan']),
  ...dests('Azerbaijan', ['Baku']),
  ...dests('Kazakhstan', ['Almaty', 'Astana']),
  ...dests('Uzbekistan', ['Tashkent', 'Samarkand', 'Bukhara']),
  ...dests('Philippines', ['Cagayan de Oro', 'Iloilo', 'Baguio', 'Palawan', 'El Nido', 'Siargao']),
  ...dests('China', [
    'Nanjing', 'Suzhou', 'Wuhan', 'Chongqing', 'Tianjin', 'Qingdao', 'Dalian',
    'Xiamen', 'Kunming', 'Sanya',
  ]),
  { ss: 'Macau' },
  ...dests('Australia', [
    'Newcastle Australia', 'Wollongong', 'Geelong', 'Townsville', 'Toowoomba',
    'Ballarat', 'Bendigo', 'Launceston', 'Alice Springs', 'Broome',
    'Byron Bay', 'Noosa', 'Port Douglas', 'Margaret River',
  ]),
  ...dests('New Zealand', [
    'Hamilton New Zealand', 'Napier', 'Nelson', 'Dunedin City', 'Wanaka',
    'Paihia', 'Taupo', 'New Plymouth',
  ]),
  ...dests('Fiji', ['Nadi', 'Suva']),
  ...dests('Iceland', ['Reykjavik', 'Akureyri']),
  ...dests('Malta', ['Valletta', 'Sliema', 'St Julians']),
  ...dests('Cyprus', ['Nicosia', 'Limassol', 'Paphos', 'Larnaca']),
  ...dests('Luxembourg', ['Luxembourg City']),
  ...dests('Andorra', ['Andorra la Vella']),
  ...dests('Monaco', ['Monte Carlo']),
  ...dests('Albania', ['Tirana', 'Durres']),
  ...dests('North Macedonia', ['Skopje', 'Ohrid']),
  ...dests('Bosnia and Herzegovina', ['Sarajevo', 'Mostar']),
  ...dests('Montenegro', ['Podgorica', 'Kotor', 'Budva']),
  ...dests('Moldova', ['Chisinau']),
  ...dests('Belarus', ['Minsk']),
  ...dests('Russia', ['Yekaterinburg', 'Novosibirsk', 'Kaliningrad', 'Vladivostok', 'Nizhny Novgorod']),
  ...dests('Mexico', [
    'Leon Mexico', 'Queretaro', 'Puebla Centro', 'Guanajuato', 'Morelia',
    'Mazatlan', 'Cabo San Lucas', 'Cozumel', 'Isla Mujeres', 'Tulum',
  ]),
  ...dests('Colombia', ['Santa Marta', 'Pereira', 'Bucaramanga', 'Manizales', 'Armenia Colombia']),
  ...dests('Chile', ['Valdivia', 'Concepcion', 'La Serena', 'Punta Arenas', 'Iquique']),
  ...dests('Peru', ['Trujillo', 'Puno', 'Iquitos', 'Huacachina', 'Paracas']),
].filter((c) => c.ss);

const REGION = new Intl.DisplayNames(['en'], { type: 'region' });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

function unquote(s) {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return String(s).replace(/\\u0026/g, '&').replace(/\\"/g, '"');
  }
}

function countryFromCc(cc) {
  if (!cc) return null;
  const iso = String(cc).toUpperCase();
  if (iso === 'GB') return 'UK';
  if (iso === 'US') return 'USA';
  try {
    return normalizeCountry(REGION.of(iso)) || REGION.of(iso);
  } catch {
    return null;
  }
}

function parsePage(html) {
  const hotels = [];
  const re = /"basicPropertyData":\{/g;
  let m;
  while ((m = re.exec(html))) {
    const chunk = html.slice(m.index, m.index + 9000);
    const loc = chunk.match(
      /"location":\{"__typename":"Location","address":"((?:\\.|[^"\\])*)","city":"((?:\\.|[^"\\])*)","countryCode":"([a-z]{2})","latitude":(-?[0-9.]+),"longitude":(-?[0-9.]+)/
    );
    const pageName = chunk.match(/"pageName":"([^"]+)"/);
    const display = chunk.match(
      /"displayName":\{"__typename":"TextWithTranslationTag","text":"((?:\\.|[^"\\])*)"/
    );
    if (!loc || !pageName) continue;
    const cc = loc[3];
    hotels.push({
      name: display ? unquote(display[1]) : unquote(pageName[1]).replace(/-/g, ' '),
      address: unquote(loc[1]),
      city: unquote(loc[2]),
      countryCode: cc,
      latitude: loc[4],
      longitude: loc[5],
      pageName: pageName[1],
      sourceUrl: `https://www.booking.com/hotel/${cc}/${pageName[1]}.html`,
    });
  }
  const totalMatch = html.match(/"nbResultsTotal":(\d+)/);
  return { hotels, total: totalMatch ? Number(totalMatch[1]) : hotels.length };
}

function toRow(h) {
  const country = countryFromCc(h.countryCode);
  if (!country || isFriendlyCountry(country) || country === 'Israel') return null;
  const name = String(h.name || '').trim();
  if (!name || name.length < 2) return null;
  return {
    name: name.slice(0, 140),
    address: h.address || '',
    latitude: String(h.latitude),
    longitude: String(h.longitude),
    city: h.city || '',
    country,
    type: 'hotel',
    bidetStatus: 'internet',
    bidetType: 'Bidet',
    sourceUrl: h.sourceUrl,
    sourceQuote: 'Booking.com lists Bidet as a room facility at this hotel.',
    verifiedMethod: 'web-source',
    access: 'limited',
    accessNote: 'Hotel guests',
  };
}

function searchUrl(ss) {
  const u = new URL('https://www.booking.com/searchresults.html');
  u.searchParams.set('ss', ss);
  u.searchParams.set('checkin', CHECKIN);
  u.searchParams.set('checkout', CHECKOUT);
  u.searchParams.set('group_adults', '2');
  u.searchParams.set('no_rooms', '1');
  u.searchParams.set('nflt', 'roomfacility=100');
  u.searchParams.set('lang', 'en-us');
  u.searchParams.set('selected_currency', 'USD');
  return u.toString();
}

async function main() {
  if (RESET) {
    saveJson(OUT, []);
    saveJson(STATE, { done: {}, startedAt: Date.now() });
    console.log('Reset output + state');
  }

  const rows = loadJson(OUT, []);
  const seen = new Set(rows.map((r) => r.sourceUrl));
  const state = loadJson(STATE, { done: {}, startedAt: Date.now() });
  const cities = ONLY ? CITIES.filter((c) => c.ss.toLowerCase().includes(ONLY)) : CITIES;
  if (!cities.length) {
    console.error('No destinations matched --only=');
    process.exit(1);
  }
  console.log(`${cities.length} destinations, ${rows.length} hotels already saved`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1400, height: 900 },
  });

  for (const { ss } of cities) {
    if (state.done[ss] && state.done[ss].complete) {
      continue;
    }
    let addedHere = 0;
    let parsed = { hotels: [], total: 0 };
    for (let tries = 0; tries < 3; tries++) {
      let html = '';
      try {
        const res = await page.goto(searchUrl(ss), { waitUntil: 'domcontentloaded', timeout: 60000 });
        const status = res && res.status();
        if (status && status >= 400) {
          console.warn(`HTTP ${status} ${ss} — skip`);
          break;
        }
        await page
          .waitForSelector('[data-testid="property-card"], [data-testid="title"]', { timeout: 12000 })
          .catch(() => null);
        await sleep(800 + Math.floor(Math.random() * 600));
        html = await page.content();
      } catch (e) {
        console.warn(`nav error ${ss}: ${e.message}`);
        await sleep(4000);
        continue;
      }

      if (/unusual traffic|captcha|client-challenge/i.test(html) && !html.includes('basicPropertyData')) {
        console.warn(`challenge on ${ss} — waiting 20s`);
        await sleep(20000);
        continue;
      }

      parsed = parsePage(html);
      if (!parsed.hotels.length) {
        console.warn(`empty ${ss} — retry ${tries + 1}`);
        await sleep(2000);
        continue;
      }
      break;
    }
    for (const h of parsed.hotels) {
      const row = toRow(h);
      if (!row || seen.has(row.sourceUrl)) continue;
      seen.add(row.sourceUrl);
      rows.push(row);
      addedHere++;
    }
    state.done[ss] = { complete: true, count: addedHere, listed: parsed.total };
    saveJson(OUT, rows);
    saveJson(STATE, state);
    console.log(`${ss}: +${addedHere}/${parsed.hotels.length} listed ${parsed.total}  file ${rows.length}`);
    await sleep(700 + Math.floor(Math.random() * 600));
  }

  await browser.close();
  saveJson(OUT, rows);
  const byC = {};
  for (const r of rows) byC[r.country] = (byC[r.country] || 0) + 1;
  console.log(`\nSaved ${rows.length} hotels → ${OUT}`);
  console.log(
    Object.entries(byC)
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `  ${n} ${c}`)
      .join('\n')
  );

  if (DO_IMPORT) {
    const { importBookingBidets } = require('./import-booking-bidets.cjs');
    importBookingBidets();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
