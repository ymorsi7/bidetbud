#!/usr/bin/env node
/**
 * Apply verified GPS coordinates to data/russia-verified-bidets.json.
 * Nominatim often misses Russian hotel names — use hotel contact pages / maps.
 */
const fs = require('fs');
const path = require('path');

const verifiedPath = path.join(__dirname, '../data/russia-verified-bidets.json');

/** name → { latitude, longitude, address? } from Russian hotel sites / maps */
const MANUAL = {
  'Helvetia Hotel': {
    latitude: '59.9296000',
    longitude: '30.3539000',
    address: '11 Marata Street, Saint Petersburg 191025',
  },
  'AKYAN St. Petersburg': {
    latitude: '59.9314000',
    longitude: '30.3606000',
    address: '19 Vosstaniya Street, Saint Petersburg 191036',
  },
  'Bridge Resort Adler': {
    latitude: '43.3901030',
    longitude: '39.9897000',
    address: '45 Figurnaya Street, Sirius 354349',
  },
  'Hotel Astrakhanskaya': {
    latitude: '46.3536754',
    longitude: '48.0327739',
    address: '6 Ulyanovykh Street / 10 Sverdlova Street, Astrakhan 414000',
  },
  'Russkiy Dvorik Hotel': {
    latitude: '56.3103000',
    longitude: '38.1336000',
    address: '1 Krasnoy Armii Avenue, Sergiev Posad 141300',
  },
  'Petro Palace Hotel': {
    latitude: '59.9342000',
    longitude: '30.3087000',
    address: '14 Malaya Morskaya Street, Saint Petersburg 190000',
  },
  'Hotel Pioner Uray': {
    latitude: '60.1290000',
    longitude: '64.7850000',
    address: '2A Pionerov Street, Uray 628280',
  },
  'Krymsky Briz Hotel': {
    latitude: '44.3930000',
    longitude: '33.9780000',
    address: '39 Parkovoye Highway, Parkovoye 298676',
  },
  'Moskovsky Kvartal Hotel': {
    latitude: '44.4897000',
    longitude: '34.1542000',
    address: '15 Moskovskaya Street, Bldg. 7, Yalta 298607',
  },
  'Hotel Diona Sukko': {
    latitude: '44.5139000',
    longitude: '37.3147000',
    address: '13A 3rd Lane, Sukko 353440',
  },
  'Hotel Bravo Vityazevo': {
    latitude: '44.9947000',
    longitude: '37.2642000',
    address: '10 Bolshevistskaya Street, Vityazevo 353417',
  },
  'Apart-Hotel Bristol Lazarevskoye': {
    latitude: '43.9061000',
    longitude: '39.3283000',
    address: '25B Partizanskaya Street, Lazarevskoye 354200',
  },
  'Hotel Complex Lidia': {
    latitude: '45.0310000',
    longitude: '35.3790000',
    address: '2 Aivazovsky Street, Feodosia 298176',
  },
  'Rodina Hotel and SPA Essentuki': {
    latitude: '44.0442000',
    longitude: '42.8639000',
    address: 'Rodina Hotel, Essentuki 357601',
  },
  'Barvikha Hotel and Spa': {
    latitude: '55.7408000',
    longitude: '37.2514000',
    address: 'Barvikha Luxury Village, Odintsovo 143083',
  },
  'Hotel Astoria Saint Petersburg': {
    latitude: '59.9347220',
    longitude: '30.3063890',
    address: '39 Bolshaya Morskaya Street, Saint Petersburg 190000',
  },
  'Sanatorium Sochi': {
    latitude: '43.5762731',
    longitude: '39.7284022',
    address: '51 Kurortny Prospekt, Sochi 354000',
  },
  'Villa Grand Hotel Polyana': {
    latitude: '43.6772000',
    longitude: '40.2042000',
    address: '14 Achipinskaya Street, Bldg. 10, Esto-Sadok 354392',
  },
  'Hotel Volga Essentuki': {
    latitude: '44.0420000',
    longitude: '42.8600000',
    address: '4 Razumovskogo Street, Essentuki 357600',
  },
  'Gostinitsa Rossiya Nalchik': {
    latitude: '43.4844000',
    longitude: '43.6082000',
    address: '32 Lenina Avenue, Nalchik 360000',
  },
  'Biznes-Otel Rossiya Belokuriha': {
    latitude: '51.9960000',
    longitude: '84.9890000',
    address: '22 Slavskogo Street, Belokuriha 659900',
  },
  'Sanatorium Revital Park': {
    latitude: '55.7648600',
    longitude: '37.9609100',
    address: '2 Leonovskoe Highway, Balashikha 143980',
  },
  'Marton Palace Kaliningrad': {
    latitude: '54.6968000',
    longitude: '20.5051000',
    address: '3 Bolshevistsky Lane, Kaliningrad 236039',
  },
  'Hotel Medovaya Adler': {
    latitude: '43.4385000',
    longitude: '39.9235000',
    address: '41 Medovaya Street, Adler, Sochi 354340',
  },
  'Lavicon Hotel Collection': {
    latitude: '44.1650000',
    longitude: '38.9830000',
    address: '10 Novorossiyskoye Highway, Nebug 352831',
  },
  'KS Klub Hostel Kislovodsk': {
    latitude: '43.9055000',
    longitude: '42.7165000',
    address: '91 Kalinina Street, Kislovodsk 357700',
  },
  'Pulsar Villa Deluxe': {
    latitude: '43.4050000',
    longitude: '39.9550000',
    address: '2 Tsimlyanskaya Street, Sirius 354350',
  },
  'Sanatorium Izvestiya Adler': {
    latitude: '43.4320000',
    longitude: '39.9200000',
    address: '282 Lenina Street, Adler, Sochi 354340',
  },
  'Nadezhda i K Hotel': {
    latitude: '53.7594000',
    longitude: '87.1362000',
    address: '57 Kirova Street, Novokuznetsk 654000',
  },
  'Park Rodnik Hotel Pyatigorsk': {
    latitude: '44.0480000',
    longitude: '43.0120000',
    address: '135 Rodnikovoye Highway, Pyatigorsk 357502',
  },
  'Ostrova Spa Hotel Sochi': {
    latitude: '43.5785000',
    longitude: '39.7265000',
    address: '4 Kurortny Prospekt, Sochi 354000',
  },
  'Aristocrat Boutique Hotel': {
    latitude: '59.9395000',
    longitude: '30.3485000',
    address: '61 Liteyny Prospekt, Saint Petersburg 191025',
  },
  'Odisseya Wellness Resort': {
    latitude: '43.9040000',
    longitude: '39.3320000',
    address: '37 Lazurnaya Street, Lazarevskoye 354200',
  },
  'Hotel Onegin Yekaterinburg': {
    latitude: '56.8389000',
    longitude: '60.5973000',
    address: '49 Rozy Luxemburg Street, Yekaterinburg 620026',
  },
  'Hotel Arbat Moscow': {
    latitude: '55.7478000',
    longitude: '37.5832000',
    address: '12 Plotnikov Lane, Moscow 119002',
  },
  'Sochi Marriott Krasnaya Polyana': {
    latitude: '43.6855000',
    longitude: '40.2565000',
    address: '1 Vremena Goda Embankment, Esto-Sadok, Sochi 354392',
  },
  'Bor Wellness Complex': {
    latitude: '55.2680000',
    longitude: '37.7160000',
    address: 'Okinzovo Village, Bor Territory, Domodedovo 142073',
  },
  'Hotel Dvor Podznoeva Pskov': {
    latitude: '57.8196000',
    longitude: '28.3316000',
    address: '2/2 Oktyabrsky Prospekt, Pskov 180000',
  },
  'Hotel Na Tverskoy Saratov': {
    latitude: '51.5789000',
    longitude: '46.0346000',
    address: '53 Tverskaya Street, Saratov 410015',
  },
  'Dolphin Resort Sochi': {
    latitude: '43.5803000',
    longitude: '39.7208000',
    address: '19 Chernomorskaya Street, Sochi 354000',
  },
  'Demetra Art Hotel': {
    latitude: '59.9441000',
    longitude: '30.3608000',
    address: '11 Vosstaniya Street, Saint Petersburg 191036',
  },
  'Ambassador Hotel Saint Petersburg': {
    latitude: '59.9286000',
    longitude: '30.3089000',
    address: '64 Rimsky-Korsakov Avenue, Saint Petersburg 190000',
  },
  'Taleon Imperial Hotel': {
    latitude: '59.9356000',
    longitude: '30.3142000',
    address: '15 Nevsky Prospekt, Saint Petersburg 191186',
  },
  'Grumant Resort and SPA': {
    latitude: '54.0050000',
    longitude: '37.5120000',
    address: 'Grumant Village, Shchyokino District, Tula Oblast 301247',
  },
  'Hotel MIO Adler': {
    latitude: '43.4308000',
    longitude: '39.9235000',
    address: '1A Chkalova Street, Adler, Sochi 354364',
  },
  'Sanatorium Istok Essentuki': {
    latitude: '44.0440000',
    longitude: '42.8640000',
    address: '23 Andzhiyevskogo Street, Essentuki 357600',
  },
  'Hotel Baden-Baden Astrakhan': {
    latitude: '46.3580000',
    longitude: '48.0420000',
    address: '191B Admiral Nakhimov Street, Astrakhan 414018',
  },
  'Sanatorium Akvamarin Anapa': {
    latitude: '44.9890000',
    longitude: '37.2560000',
    address: '42 Gorkogo Street, Vityazevo, Anapa 353417',
  },
  'Park-Hotel Kulibin': {
    latitude: '56.3152460',
    longitude: '44.0050880',
    address: '121 Maksima Gorkogo Street, Nizhny Novgorod 603006',
  },
  'Author Boutique Hotel': {
    latitude: '59.9285000',
    longitude: '30.3470000',
    address: '9A Vladimirsky Prospekt, Saint Petersburg 191025',
  },
  'Mantera Supreme Seaside': {
    latitude: '43.4055000',
    longitude: '39.9575000',
    address: '36/1 Olympic Avenue, Sirius, Sochi 354349',
  },
  'Zvezdniy Wellness and SPA Sochi': {
    latitude: '43.5855000',
    longitude: '39.7205000',
    address: '5 Gagarina Street, Sochi 354065',
  },
  'Oreanda Resort Yalta': {
    latitude: '44.4964000',
    longitude: '34.1588000',
    address: '35/2 Lenin Embankment, Yalta 298635',
  },
};

const rows = JSON.parse(fs.readFileSync(verifiedPath, 'utf8'));
let updated = 0;

for (const row of rows) {
  const m = MANUAL[row.name];
  if (!m) continue;
  if (m.address) row.address = m.address;
  row.latitude = m.latitude;
  row.longitude = m.longitude;
  updated++;
}

fs.writeFileSync(verifiedPath, JSON.stringify(rows, null, 2) + '\n');
console.log(`Updated coordinates for ${updated} Russia row(s).`);
