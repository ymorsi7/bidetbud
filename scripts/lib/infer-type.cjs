/**
 * Infer place type from name when source data omits or mislabels it.
 */
const fs = require('fs');
const path = require('path');
const HOTEL =
  /\b(hotel|motel|inn|resort|hostel|suites|lodge|hyatt|marriott|hilton|sheraton|fairmont|westin|radisson|intercontinental|ritz|waldorf|four seasons|hampton|holiday inn|best western|wyndham|embassy suites|crowne plaza|novotel|ibis|mercure|sofitel|pullman|accor|bed and breakfast|b&b|casino resort|serviced suites)\b/i;
const MOSQUE =
  /\b(mosque|masjid|islamic center|islamic society|islamic centre|jamia|jamaat|musallah|masjidul)\b/i;
const RESTAURANT =
  /\b(restaurant|restaurante|bistro|cafe|café|diner|eatery|grill|kitchen|bbq|barbecue|pizzeria|pizza|sushi|ramen|izakaya|taqueria|cantina|dhaba|steakhouse|buffet|trattoria|osteria|brasserie|bakery|patisserie|shawarma|kebab)\b/i;
/** Restaurants, cafes, hawkers, and food courts (incl. SG community sightings). */
const FOOD_VENUE =
  /\b(restaurant|restaurante|bistro|cafe|café|coffeehouse|coffee house|coffee|kopi|kopitiam|kedai|diner|eatery|grill|burgergrill|burger|kitchen|bbq|barbecue|pizzeria|pizza|sushi|ramen|izakaya|taqueria|cantina|dhaba|steakhouse|steak-me|buffet|trattoria|osteria|brasserie|bakery|patisserie|shawarma|kebab|noodle|wings|food court|foodcourt|food centre|food center|food village|food town|food market|hawker|hawkers|gelato|gelateria|creamery|brunch|tapas|wine connection|tomahawk|mcdonald|mcdonald's|kfc|starbucks|subway|chipotle|nandos|wagamama|jollibee|pizza hut|popeyes|dunkin|toast box|ya kun|old chang|prata|chicken rice|biryani|yakiniku|hotpot|steamboat|bubble tea|boba|dim sum|zichar|tze char|zi char|japan food town|market and food|wet market|ikea|haidilao|tuckshop|tuck shop|mess hall|supper deck|container park|commune|dessert|timbre|karaoke|ktv)\b/i;

/** SG @toiletswithbidetsg venues whose names don't say "restaurant" but are dining spots. */
const SG_FOOD_HINTS = [
  '212 social', 'badaque', 'butter space', 'cilantro', 'dessert first', 'east coast commune',
  'hans im glück', 'hans im gluck', 'mana lagi', 'fattybombom', 'steak-me', 'tekka centre',
  'tekka place', 'asylum coffeehouse', 'barbary coast', 'beo crescent market', 'black raisins',
  'chico loco', 'chye seng huat', 'haidilao', 'crane @ kim', 'daily ground', 'dopa dopa',
  'happy hawkers', 'margaret market', 'mess hall', 'picanha', 'rasa rasa', 'supper deck',
  'tarik', 'tenderbest', 'tuckshop', 'taste orchard', "three's a crowd", 'the ark @ cuppage',
  'punggol east container park', 'new bahru', 'atlas - bugis', 'anchorvale village',
  'east village', 'orchid country club', 'kada', 'timbre', 'popeyes', 'the midtown',
  'cash studio', 'eccellente', 'hao mart',
];

const SG_HOTEL_HINTS = [
  'grand hyatt', 'andaz singapore', 'furama city', 'furama', 'lyf farrer', 'lyf ',
  'parkroyal', 'fullerton', 'raffles hotel', 'one farrer', 'hotel mi', 'tan quee lan suites',
  'royal plaza on scotts',
];

function baseVenueName(name) {
  return String(name || '')
    .replace(/\s*\((male|female) toilet\)/i, '')
    .replace(/\s*\(hotel\)/i, '')
    .trim();
}

function matchesHint(name, hints) {
  const base = baseVenueName(name).toLowerCase();
  return hints.some((h) => base.includes(h));
}

function isFoodVenue(name) {
  const base = baseVenueName(name);
  return (
    FOOD_VENUE.test(base) ||
    FOOD_VENUE.test(name) ||
    matchesHint(name, SG_FOOD_HINTS)
  );
}

function isHotelVenue(name) {
  const base = baseVenueName(name);
  return HOTEL.test(base) || HOTEL.test(name) || matchesHint(name, SG_HOTEL_HINTS);
}

/** Venue is primarily a restaurant even if it also has rooms. */
function isRestaurantPrimary(name) {
  const n = String(name || '');
  return /^[^|]*\brestaurant\b/i.test(n) && RESTAURANT.test(n);
}

function loadSingaporePublicOverrides() {
  if (loadSingaporePublicOverrides._cache) {
    return loadSingaporePublicOverrides._cache;
  }
  const file = path.join(__dirname, '../../data/singapore-public-venue-types.json');
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete data._comment;
    loadSingaporePublicOverrides._cache = data;
  } catch {
    loadSingaporePublicOverrides._cache = {};
  }
  return loadSingaporePublicOverrides._cache;
}

function singaporePublicOverride(row) {
  if (row.country !== 'Singapore' || row.type !== 'public') return null;
  if (row.verifiedMethod !== 'community-sighting') return null;
  const base = baseVenueName(row.name);
  return loadSingaporePublicOverrides()[base] || null;
}

function inferType(row) {
  const name = row.name || '';
  if (MOSQUE.test(name)) return 'mosque';
  if (isRestaurantPrimary(name)) return 'restaurant';
  if (isHotelVenue(name)) return 'hotel';
  if (isFoodVenue(name) || RESTAURANT.test(name)) return 'restaurant';
  if (row.type) return row.type;
  return 'public';
}

function shouldBeHotel(row) {
  const sgOverride = singaporePublicOverride(row);
  if (sgOverride === 'hotel') return true;
  if (row.type === 'hotel') return false;
  if (row.type === 'restaurant' && isHotelVenue(row.name) && !isRestaurantPrimary(row.name)) {
    return true;
  }
  if (
    row.type === 'public' &&
    row.country === 'Singapore' &&
    row.verifiedMethod === 'community-sighting' &&
    isHotelVenue(row.name) &&
    !isFoodVenue(row.name)
  ) {
    return true;
  }
  return false;
}

function shouldBeMosque(row) {
  if (row.type === 'mosque') return false;
  return MOSQUE.test(row.name || '');
}

function shouldBeRestaurant(row) {
  if (row.type === 'restaurant' || row.type === 'mosque') return false;
  const sgOverride = singaporePublicOverride(row);
  if (sgOverride === 'restaurant') return true;
  if (sgOverride === 'hotel' || sgOverride === 'mosque') return false;
  if (isHotelVenue(row.name) && !isFoodVenue(row.name)) return false;
  if (row.country === 'Singapore' && row.type === 'public') {
    return row.verifiedMethod === 'community-sighting' && isFoodVenue(row.name);
  }
  if (row.country === 'Singapore') return false;
  if (/\((male|female) toilet\)/i.test(row.name || '')) return false;
  return RESTAURANT.test(row.name || '') && !isHotelVenue(row.name);
}

module.exports = {
  inferType,
  shouldBeHotel,
  shouldBeMosque,
  shouldBeRestaurant,
  isFoodVenue,
  isHotelVenue,
  loadSingaporePublicOverrides,
  singaporePublicOverride,
  HOTEL,
  RESTAURANT,
  FOOD_VENUE,
};
