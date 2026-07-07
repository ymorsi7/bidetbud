/**
 * Infer place type from name when source data omits or mislabels it.
 */
const HOTEL =
  /\b(hotel|motel|inn|resort|hostel|suites|lodge|hyatt|marriott|hilton|sheraton|fairmont|westin|radisson|intercontinental|ritz|waldorf|four seasons|hampton|holiday inn|best western|wyndham|embassy suites|crowne plaza|novotel|ibis|mercure|sofitel|pullman|accor|bed and breakfast|b&b|casino resort)\b/i;
const MOSQUE =
  /\b(mosque|masjid|islamic center|islamic society|islamic centre|jamia|jamaat|musallah|masjidul)\b/i;
const RESTAURANT =
  /\b(restaurant|restaurante|bistro|cafe|café|diner|eatery|grill|kitchen|bbq|barbecue|pizzeria|pizza|sushi|ramen|izakaya|taqueria|cantina|dhaba|steakhouse|buffet|trattoria|osteria|brasserie|bakery|patisserie|shawarma|kebab)\b/i;
/** Restaurants, cafes, hawkers, and food courts (incl. SG community sightings). */
const FOOD_VENUE =
  /\b(restaurant|restaurante|bistro|cafe|café|coffee|kopi|kopitiam|kedai|diner|eatery|grill|kitchen|bbq|barbecue|pizzeria|pizza|sushi|ramen|izakaya|taqueria|cantina|dhaba|steakhouse|buffet|trattoria|osteria|brasserie|bakery|patisserie|shawarma|kebab|noodle|burger|wings|food court|foodcourt|food centre|food center|food village|food town|hawker|gelato|gelateria|brunch|tapas|wine connection|tomahawk|mcdonald|mcdonald's|kfc|starbucks|subway|chipotle|nandos|wagamama|jollibee|pizza hut|dunkin|toast box|ya kun|old chang|prata|chicken rice|yakiniku|hotpot|steamboat|bubble tea|boba|dim sum|zichar|tze char|zi char|japan food town|market and food|ikea)\b/i;

function baseVenueName(name) {
  return String(name || '')
    .replace(/\s*\((male|female) toilet\)/i, '')
    .replace(/\s*\(hotel\)/i, '')
    .trim();
}

function isFoodVenue(name) {
  const base = baseVenueName(name);
  return FOOD_VENUE.test(base) || FOOD_VENUE.test(name);
}

/** Venue is primarily a restaurant even if it also has rooms. */
function isRestaurantPrimary(name) {
  const n = String(name || '');
  return /^[^|]*\brestaurant\b/i.test(n) && RESTAURANT.test(n);
}

function inferType(row) {
  const name = row.name || '';
  if (MOSQUE.test(name)) return 'mosque';
  if (isRestaurantPrimary(name)) return 'restaurant';
  if (HOTEL.test(name)) return 'hotel';
  if (isFoodVenue(name) || RESTAURANT.test(name)) return 'restaurant';
  if (row.type) return row.type;
  return 'public';
}

function shouldBeHotel(row) {
  return row.type === 'restaurant' && HOTEL.test(row.name || '') && !isRestaurantPrimary(row.name);
}

function shouldBeRestaurant(row) {
  if (row.type === 'restaurant' || row.type === 'mosque') return false;
  if (HOTEL.test(row.name || '')) return false;
  // Singapore @toiletswithbidetsg sightings at restaurants / hawkers / cafes
  if (row.country === 'Singapore' && row.type === 'public') {
    return row.verifiedMethod === 'community-sighting' && isFoodVenue(row.name);
  }
  if (row.country === 'Singapore') return false;
  if (/\((male|female) toilet\)/i.test(row.name || '')) return false;
  return RESTAURANT.test(row.name || '') && !HOTEL.test(row.name || '');
}

module.exports = {
  inferType,
  shouldBeHotel,
  shouldBeRestaurant,
  isFoodVenue,
  HOTEL,
  RESTAURANT,
  FOOD_VENUE,
};
