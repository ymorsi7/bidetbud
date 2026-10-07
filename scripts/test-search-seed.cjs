#!/usr/bin/env node
/**
 * Search scoring: city queries must rank city pins over brand-name collisions.
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
const { searchScore, matchesSearch, normalizeSeed } = ctx.window.BidetBudSearch;

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

describe('city search scoring', () => {
  it('ranks Richardson TX spots above French Richardson showrooms', () => {
    const cafe = row({
      name: 'Royal Roastery',
      city: 'Richardson, TX',
      address: '1055 S Sherman St, Suite 100, Richardson, TX 75081',
    });
    const showroom = row({
      name: 'Richardson Nice',
      city: 'Nice',
      country: 'France',
      address: '70-72 Route de Turin, 06300 Nice',
      bidetStatus: 'warmed',
    });
    assert.ok(searchScore(cafe, 'richardson') > searchScore(showroom, 'richardson'));
    assert.ok(matchesSearch(cafe, 'richardson'));
  });

  it('matches NYC to New York city pins', () => {
    const ny = row({ name: 'Torishin', city: 'New York, NY', address: '362 West 53rd Street' });
    const tokyo = row({ name: 'Park Hyatt Tokyo', city: 'Tokyo', country: 'Japan' });
    assert.ok(searchScore(ny, 'nyc') > 0);
    assert.equal(searchScore(tokyo, 'nyc'), 0);
  });

  it('matches Bay Area to San Francisco / Oakland', () => {
    const sf = row({ name: 'Kusakabe', city: 'San Francisco, CA' });
    const dallas = row({ name: 'Nice Mezze Cocktail Bar', city: 'Dallas, TX' });
    assert.ok(searchScore(sf, 'bay area') > 0);
    assert.equal(searchScore(dallas, 'bay area'), 0);
  });

  it('does not substring-match short tokens inside other words', () => {
    const york = row({ name: 'Yakiniku Toraji An', city: 'New York, NY' });
    assert.equal(searchScore(york, 'or'), 0);
    assert.equal(searchScore(york, 'in'), 0);
  });
});
