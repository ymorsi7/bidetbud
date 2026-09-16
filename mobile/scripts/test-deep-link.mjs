#!/usr/bin/env node
/**
 * Unit tests for bidetbud:// and https://bidetbud.com deep-link parsing.
 * No simulator required.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const MOBILE = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const {
  queryFromAppUrl,
  parseDeepLinkSearch,
  parseAppUrl,
} = require(join(MOBILE, 'src', 'deep-link.cjs'));

test('bidetbud://open?spot=', () => {
  const qs = queryFromAppUrl('bidetbud://open?spot=icsd');
  assert.equal(qs, '?spot=icsd');
  assert.deepEqual(parseAppUrl('bidetbud://open?spot=icsd'), { spot: 'icsd' });
});

test('bidetbud://open?view=', () => {
  const url = 'bidetbud://open?view=37.8,-122.3,12';
  assert.equal(queryFromAppUrl(url), '?view=37.8,-122.3,12');
  assert.deepEqual(parseAppUrl(url), { view: '37.8,-122.3,12' });
});

test('bidetbud://open?country=', () => {
  const url = 'bidetbud://open?country=USA';
  assert.equal(queryFromAppUrl(url), '?country=USA');
  assert.deepEqual(parseAppUrl(url), { country: 'USA' });
});

test('combined query params are preserved for applyUrlState', () => {
  const url = 'bidetbud://open?spot=icsd&view=32.7,-117.1,14&country=USA';
  const qs = queryFromAppUrl(url);
  assert.equal(qs, '?spot=icsd&view=32.7,-117.1,14&country=USA');
  assert.deepEqual(parseDeepLinkSearch(qs), {
    spot: 'icsd',
    view: '32.7,-117.1,14',
    country: 'USA',
  });
});

test('https://bidetbud.com/?spot= (Universal Links follow-up) still parses', () => {
  assert.deepEqual(parseAppUrl('https://bidetbud.com/?spot=icsd'), { spot: 'icsd' });
  assert.deepEqual(parseAppUrl('https://bidetbud.com/index.html?country=UK'), {
    country: 'UK',
  });
});

test('empty / invalid URLs yield no query', () => {
  assert.equal(queryFromAppUrl(''), '');
  assert.equal(queryFromAppUrl('bidetbud://open'), '');
  assert.deepEqual(parseAppUrl('bidetbud://open'), {});
});
