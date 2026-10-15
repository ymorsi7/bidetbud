#!/usr/bin/env node
/**
 * Search scoring: name vs city vs name+city, chains, acronyms, short-token traps.
 * Run: node --test scripts/test-search-seed.cjs
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '../js/search-seed.js'), 'utf8');
const ctx = { window: {}, globalThis: {} };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.runInNewContext(src, ctx);
const {
  searchScore,
  searchNameScore,
  matchesSearch,
  matchesNameSearch,
  cityMatchesQuery,
  searchFitRows,
  normalizeSeed,
  normalizeSearchText,
} = ctx.window.BidetBudSearch;

function row(partial) {
  return normalizeSeed({
    bidetStatus: 'verified',
    latitude: '0',
    longitude: '0',
    country: 'USA',
    type: 'restaurant',
    ...partial,
  });
}

const delahSf = row({
  name: 'Delah Coffee (San Francisco)',
  city: 'San Francisco, CA',
  address: '370 4th St, San Francisco, CA 94107',
  bidetStatus: 'none',
  searchAliases: 'Delah Coffee, Delah Coffee SF, Delah Coffee House, Delah 4th Street',
  latitude: '37.7809853',
  longitude: '-122.4002625',
});
const delahNap = row({
  name: 'Delah Coffee',
  city: 'Naperville, Illinois',
  address: '1336 Illinois Rte 59, Naperville, Illinois, 60563',
  bidetStatus: 'internet',
  latitude: '41.772',
  longitude: '-88.147',
});
const laVaca = row({
  name: 'La Vaca Birria',
  city: 'San Francisco, CA',
  address: '2962 24th St, San Francisco, CA 94110',
  bidetStatus: 'none',
  searchAliases: 'La Vaca, La Vaca Birria SF, La Vaca Mission',
  latitude: '37.7527720',
  longitude: '-122.4114050',
});
const kusakabe = row({
  name: 'Kusakabe',
  city: 'San Francisco, CA',
  address: '584 Washington St',
  latitude: '37.795',
  longitude: '-122.403',
});
const angelesSpot = row({
  name: 'Sushi Gen',
  city: 'Los Angeles, CA',
  address: '422 E 2nd St',
  latitude: '34.047',
  longitude: '-118.239',
});
const richardsonCafe = row({
  name: 'Royal Roastery',
  city: 'Richardson, TX',
  address: '1055 S Sherman St, Suite 100, Richardson, TX 75081',
  searchAliases: 'Royal Roastery Richardson, Royal Roastery Dallas',
  latitude: '32.948',
  longitude: '-96.729',
});
const richardsonShowroom = row({
  name: 'Richardson Nice',
  city: 'Nice',
  country: 'France',
  address: '70-72 Route de Turin, 06300 Nice',
  bidetStatus: 'warmed',
  latitude: '43.710',
  longitude: '7.262',
});
const masDallas = row({
  name: 'MAS Dallas',
  city: 'Richardson, TX',
  address: '1515 Blake Dr, Richardson, TX 75081',
  type: 'mosque',
  searchAliases: 'Mas Dallas, MAS DFW, Muslim American Society Dallas, MAS Islamic Center Of Dallas',
  latitude: '32.964',
  longitude: '-96.696',
});
const icsd = row({
  name: 'Islamic Center of San Diego',
  city: 'San Diego, CA',
  type: 'mosque',
  searchAliases: 'ICSD',
  latitude: '32.832',
  longitude: '-117.176',
});
const iacc = row({
  name: 'Islamic Association of Collin County (Plano Mosque)',
  city: 'Plano, TX',
  type: 'mosque',
  searchAliases: 'IACC, Plano Mosque, Plano Masjid, Islamic Association of Collin County',
  latitude: '33.072',
  longitude: '-96.751',
});
const conejo = row({
  name: 'Islamic Center Conejo Valley',
  city: 'Newbury Park, CA',
  type: 'mosque',
  latitude: '34.185',
  longitude: '-118.914',
});
const inchgarth = row({
  name: 'Inchgarth Community Centre',
  city: 'Aberdeen, Scotland',
  country: 'UK',
  bidetStatus: 'warmed',
  latitude: '57.13',
  longitude: '-2.14',
});
const iccCoppell = row({
  name: 'Islamic Center of Coppell (ICC)',
  city: 'Coppell, TX',
  type: 'mosque',
  searchAliases: 'ICC, ICC Masjid, ICC Coppell, ICC Dallas',
  latitude: '32.9699413',
  longitude: '-96.9760123',
});
const mapsRedmond = row({
  name: 'MAPS (Muslim Association of Puget Sound)',
  city: 'Redmond, WA',
  type: 'mosque',
  searchAliases: 'MAPS Redmond, MAPS, Muslim Association of Puget Sound, Redmond masjid',
  latitude: '47.666',
  longitude: '-122.127',
});
const mapsSeattle = row({
  name: 'MAPS Seattle',
  city: 'Seattle, WA',
  type: 'mosque',
  searchAliases: 'MAPS downtown Seattle, MAPS Seattle campus',
  latitude: '47.614',
  longitude: '-122.341',
});
const qahwahManhattan = row({
  name: 'Qahwah House (West Village)',
  city: 'New York, NY',
  address: '13 Carmine Street, New York, NY 10014',
  searchAliases: 'Qahwah House Manhattan, Qawa House Manhattan, Qawa house Manhattan',
  latitude: '40.730',
  longitude: '-74.003',
});
const qahwahBrooklyn = row({
  name: 'Qahwah House (Williamsburg)',
  city: 'Brooklyn, NY',
  address: '162 Bedford Avenue, Brooklyn, NY 11211',
  searchAliases: 'Qahwah House Brooklyn, Qawa House Brooklyn',
  latitude: '40.718',
  longitude: '-73.957',
});
const alIman = row({
  name: 'Al-Iman Mosque',
  city: 'Astoria, NY',
  type: 'mosque',
  searchAliases: 'Masjid Al-Iman, Al Iman, Al-Iman, Astoria masjid',
  latitude: '40.766',
  longitude: '-73.912',
});
const arequipa = row({
  name: 'ARIQUEPAY HOTEL',
  city: 'Arequipa',
  country: 'Peru',
  address: '211 Calle San Francisco',
  bidetStatus: 'internet',
  latitude: '-16.399',
  longitude: '-71.537',
});
const ibizaSfName = row({
  name: 'Apartamentos San Francisco',
  city: 'San Antonio de Portmany',
  country: 'Spain',
  latitude: '38.98',
  longitude: '1.30',
});
const casaAfonso = row({
  name: 'Casa Afonso',
  city: 'Lagos',
  country: 'Portugal',
  latitude: '37.10',
  longitude: '-8.67',
});
const yorkNy = row({
  name: 'Yakiniku Toraji An',
  city: 'New York, NY',
  latitude: '40.76',
  longitude: '-73.98',
});
const portlandOr = row({
  name: 'Masjid As-Saber',
  city: 'Portland, OR',
  type: 'mosque',
  searchAliases: 'Masjid Assaber, Portland masjid',
  latitude: '45.45',
  longitude: '-122.72',
});

describe('city search scoring', () => {
  it('ranks Richardson TX spots above French Richardson showrooms', () => {
    assert.ok(searchScore(richardsonCafe, 'richardson') > searchScore(richardsonShowroom, 'richardson'));
    assert.ok(matchesSearch(richardsonCafe, 'richardson'));
    assert.equal(searchScore(richardsonShowroom, 'richardson'), 0);
  });

  it('matches NYC to New York city pins', () => {
    const tokyo = row({ name: 'Park Hyatt Tokyo', city: 'Tokyo', country: 'Japan' });
    assert.ok(searchScore(yorkNy, 'nyc') > 0);
    assert.equal(searchScore(tokyo, 'nyc'), 0);
  });

  it('matches Bay Area to San Francisco / Oakland', () => {
    const dallas = row({ name: 'Nice Mezze Cocktail Bar', city: 'Dallas, TX' });
    assert.ok(searchScore(kusakabe, 'bay area') > 0);
    assert.equal(searchScore(dallas, 'bay area'), 0);
  });

  it('does not substring-match short tokens inside other words', () => {
    assert.equal(searchScore(yorkNy, 'or'), 0);
    assert.equal(searchScore(yorkNy, 'in'), 0);
  });
});

describe('stop words and junk queries', () => {
  it('scores stop-word-only queries as 0', () => {
    for (const q of ['the', 'and', 'or', 'in', 'on', 'to', 'a', 'of', 'at', 'for']) {
      assert.equal(searchScore(yorkNy, q), 0, q);
      assert.equal(searchScore(portlandOr, q), 0, q);
    }
  });

  it('ignores extra spaces, punctuation, and case', () => {
    assert.ok(searchScore(laVaca, '  LA-VACA  ') > 0);
    assert.ok(searchScore(alIman, 'al iman'));
    assert.equal(searchScore(delahSf, 'delah coffee san francisco'), searchScore(delahSf, 'Delah Coffee, San Francisco!'));
    assert.equal(normalizeSearchText('San  Fran!!!'), 'san fran');
  });

  it('does not treat 1-letter queries as matches', () => {
    assert.equal(searchScore(laVaca, 'l'), 0);
    assert.equal(searchScore(icsd, 'i'), 0);
  });
});

describe('2-letter and short-token traps', () => {
  it('does not dump every CA / TX / OR pin for a state code', () => {
    assert.equal(searchScore(richardsonCafe, 'tx'), 0);
    assert.equal(searchScore(kusakabe, 'ca'), 0);
    assert.equal(searchScore(portlandOr, 'or'), 0);
    assert.equal(searchScore(casaAfonso, 'ca'), 0);
  });

  it('does not treat "york" as New York or "san" as every San-* city', () => {
    assert.equal(searchScore(yorkNy, 'york'), 0);
    assert.equal(searchScore(kusakabe, 'san'), 0);
    const sanBidetAlias = row({
      name: '3rd Floor My Health Clinic',
      city: 'Quezon City',
      country: 'Philippines',
      searchAliases: 'San Bidet Quezon City',
    });
    const sanGennaro = row({ name: 'San Gennaro', city: 'Naples', country: 'Italy' });
    assert.equal(searchScore(sanBidetAlias, 'san'), 0);
    assert.equal(searchScore(sanGennaro, 'san'), 0);
  });

  it('treats "la" as Los Angeles, not every city with "la" in it', () => {
    const playa = row({ name: 'Apartamentos Colón2', city: 'Playa de la Américas', country: 'Spain' });
    assert.ok(searchScore(angelesSpot, 'la') > 0);
    assert.equal(searchScore(playa, 'la'), 0);
    assert.ok(searchScore(angelesSpot, 'la') > searchScore(laVaca, 'la'));
  });

  it('does not match a San Francisco street in another country for "sf"', () => {
    assert.ok(searchScore(kusakabe, 'sf') > 0);
    assert.equal(searchScore(arequipa, 'sf'), 0);
    assert.equal(searchScore(ibizaSfName, 'sf'), 0);
  });
});

describe('chain names vs name+city', () => {
  it('ranks both Delah branches equally on the brand name', () => {
    assert.equal(searchScore(delahSf, 'delah coffee'), searchScore(delahNap, 'delah coffee'));
    assert.ok(searchScore(delahSf, 'delah coffee') >= 90);
    assert.ok(searchScore(delahNap, 'delah') >= 70);
  });

  it('uniquely ranks the SF Delah on city suffixes', () => {
    assert.ok(searchScore(delahSf, 'delah coffee san francisco') > 0);
    assert.equal(searchScore(delahNap, 'delah coffee san francisco'), 0);
    assert.ok(searchScore(delahSf, 'delah coffee sf') > 0);
    assert.equal(searchScore(delahNap, 'delah coffee sf'), 0);
    assert.ok(searchScore(delahSf, 'delah 4th') > 0);
  });

  it('keeps no-bidet spots searchable by name', () => {
    assert.ok(matchesNameSearch(delahSf, 'delah coffee'));
    assert.ok(matchesNameSearch(laVaca, 'la vaca birria'));
    assert.equal(searchNameScore(delahSf, 'sf'), 0);
    assert.ok(searchNameScore(delahSf, 'delah coffee sf') > 0);
  });

  it('matches La Vaca without treating "la" as Los Angeles', () => {
    assert.ok(searchScore(laVaca, 'la vaca') >= 90);
    assert.ok(searchScore(laVaca, 'la vaca birria') >= 90);
    assert.ok(searchScore(laVaca, 'la vaca san francisco') > searchScore(angelesSpot, 'la vaca san francisco'));
    assert.equal(searchScore(angelesSpot, 'la vaca'), 0);
  });
});

describe('acronyms and aliases', () => {
  it('ranks an explicit ICC alias over a generated ICC acronym', () => {
    assert.ok(searchScore(iccCoppell, 'icc') > searchScore(inchgarth, 'icc'));
    assert.ok(searchScore(iccCoppell, 'icc') > searchScore(conejo, 'icc'));
    assert.equal(searchScore(conejo, 'icc'), 0);
  });

  it('does not prefix-match every Islamic Center for "ic"', () => {
    assert.equal(searchScore(icsd, 'ic'), 0);
    assert.equal(searchScore(conejo, 'ic'), 0);
    assert.equal(searchScore(iacc, 'ic'), 0);
  });

  it('matches ICSD and IACC as exact aliases', () => {
    assert.ok(searchScore(icsd, 'icsd') >= 100);
    assert.ok(searchScore(iacc, 'iacc') >= 100);
    assert.ok(searchScore(icsd, 'islamic center san diego') > searchScore(conejo, 'islamic center san diego'));
  });

  it('splits MAPS Redmond vs MAPS Seattle', () => {
    assert.ok(searchScore(mapsRedmond, 'maps redmond') > searchScore(mapsSeattle, 'maps redmond'));
    assert.ok(searchScore(mapsSeattle, 'maps seattle') > searchScore(mapsRedmond, 'maps seattle'));
    assert.ok(searchScore(mapsRedmond, 'maps') > 0);
    assert.ok(searchScore(mapsSeattle, 'maps') > 0);
  });
});

describe('name + city compound queries', () => {
  it('matches MAS Dallas on mas dallas / mas dfw / dallas metro', () => {
    assert.ok(searchScore(masDallas, 'mas dallas') >= 90);
    assert.ok(searchScore(masDallas, 'mas dfw') > 0);
    assert.ok(searchScore(masDallas, 'muslim american society dallas') > 0);
    assert.ok(searchScore(masDallas, 'dallas') > 0);
  });

  it('matches Qahwah House Manhattan vs Brooklyn', () => {
    assert.ok(searchScore(qahwahManhattan, 'qawa house manhattan') > 0);
    assert.ok(searchScore(qahwahBrooklyn, 'qawa house brooklyn') > 0);
    assert.ok(searchScore(qahwahManhattan, 'qawa house manhattan') > searchScore(qahwahBrooklyn, 'qawa house manhattan'));
  });

  it('matches hyphenated names and trailing city tokens', () => {
    assert.ok(searchScore(alIman, 'al-iman astoria') > 0);
    assert.ok(searchScore(portlandOr, 'portland masjid') > 0);
    assert.ok(searchScore(richardsonCafe, 'royal roastery richardson') > searchScore(richardsonShowroom, 'royal roastery richardson'));
  });

  it('allows token-order swaps for the name', () => {
    assert.ok(searchScore(delahSf, 'coffee delah') > 0);
    assert.ok(searchScore(laVaca, 'birria vaca') > 0);
  });
});

describe('city helper and fit', () => {
  it('cityMatchesQuery uses metro aliases without address false positives', () => {
    assert.equal(cityMatchesQuery('San Francisco, CA', 'sf'), true);
    assert.equal(cityMatchesQuery('Arequipa', 'sf'), false);
    assert.equal(cityMatchesQuery('Los Angeles, CA', 'la'), true);
    assert.equal(cityMatchesQuery('Playa de la Américas', 'la'), false);
    assert.equal(cityMatchesQuery('Richardson, TX', 'richardson'), true);
  });

  it('searchFitRows flies a chain query to the nearby branch', () => {
    const sfAnchor = { lat: 37.78, lng: -122.4 };
    const fitted = searchFitRows([delahSf, delahNap, kusakabe], 'delah coffee', sfAnchor);
    assert.equal(fitted.length, 1);
    assert.equal(fitted[0].name, 'Delah Coffee (San Francisco)');
  });

  it('searchFitRows keeps Richardson in Texas, not Nice', () => {
    const fitted = searchFitRows([richardsonCafe, richardsonShowroom, masDallas], 'richardson');
    assert.ok(fitted.every((m) => /richardson/i.test(m.city)));
    assert.ok(!fitted.some((m) => m.name === 'Richardson Nice'));
  });

  it('searchFitRows clusters a city query even when the user is far away', () => {
    const nycAnchor = { lat: 40.71, lng: -74.0 };
    const fitted = searchFitRows([kusakabe, angelesSpot, delahSf], 'sf', nycAnchor);
    assert.ok(fitted.length >= 1);
    assert.ok(fitted.every((m) => /san francisco/i.test(m.city)));
  });
});

describe('real seed integration', () => {
  const seedPath = path.join(__dirname, '../bidet-seed.json');
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8')).map(normalizeSeed);

  function ranked(q, n = 8) {
    return seed
      .map((m) => ({ m, s: searchScore(m, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.m.name.localeCompare(b.m.name))
      .slice(0, n);
  }

  it('delah coffee sf is the San Francisco no-bidet pin, not Naperville', () => {
    const hits = ranked('delah coffee sf', 5);
    assert.ok(hits.length >= 1);
    assert.match(hits[0].m.name, /San Francisco/i);
    assert.equal(hits[0].m.bidetStatus, 'none');
    assert.ok(!hits.some((h) => /Naperville/i.test(h.m.city)));
  });

  it('delah coffee keeps both branches as top hits', () => {
    const hits = ranked('delah coffee', 5).map((h) => h.m.name);
    assert.ok(hits.includes('Delah Coffee'));
    assert.ok(hits.includes('Delah Coffee (San Francisco)'));
  });

  it('la vaca san francisco hits the Mission pin', () => {
    const hits = ranked('la vaca san francisco', 3);
    assert.equal(hits[0].m.name, 'La Vaca Birria');
  });

  it('icsd is Islamic Center of San Diego', () => {
    assert.equal(ranked('icsd', 1)[0].m.name, 'Islamic Center of San Diego');
  });

  it('richardson prefers Texas cafes over French Richardson showrooms', () => {
    const hits = ranked('richardson', 40);
    assert.ok(hits.some((h) => /TX/i.test(h.m.city)));
    assert.ok(!hits.some((h) => /France/i.test(h.m.country) || /Nice/i.test(h.m.city)));
  });

  it('nyc does not rank Tokyo', () => {
    const hits = ranked('nyc', 15);
    assert.ok(hits.every((h) => /new york|brooklyn|queens|manhattan|bronx|astoria|flushing|williamsburg/i.test(h.m.city + ' ' + h.m.address)));
  });

  it('sf does not rank Arequipa or Ibiza San Francisco apartments', () => {
    const hits = ranked('sf', 40);
    assert.ok(!hits.some((h) => /Arequipa/i.test(h.m.city)));
    assert.ok(!hits.some((h) => /Portmany/i.test(h.m.city)));
  });

  it('ca / tx / or / ic / san are not mass dumps', () => {
    assert.ok(ranked('ca', 20).length < 5);
    assert.ok(ranked('tx', 20).length < 5);
    assert.ok(ranked('or', 20).length < 5);
    assert.ok(ranked('ic', 20).length < 8);
    assert.ok(ranked('san', 20).length < 8, 'san should not match San Bidet aliases');
  });

  it('mas dallas is the Richardson masjid', () => {
    const hits = ranked('mas dallas', 3);
    assert.equal(hits[0].m.name, 'MAS Dallas');
  });
});
