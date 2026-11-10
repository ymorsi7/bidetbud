#!/usr/bin/env node
/**
 * Unit tests for shared map/filter logic (js/core.js).
 * Run: node --test scripts/test-app-core.cjs
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');

const {
  haversineMiles,
  denseMetroRadius,
  formatDistance,
  formatRadiusLabel,
  distToSegmentMi,
  nearMeFitPins,
  nearMeMaxZoom,
  verificationPlainText,
  bidetLeadLabel,
  doesNotOperate,
  boxesOverlap,
  pickMapMarkers,
  allowLimitedAccessState,
  passesBidetStatusFilter,
  nextShowLimitedAccess
} = core;

const { geoCountryName, shouldShadeBidetFriendly } = core;

describe('haversineMiles', () => {
  it('returns ~0 for same point', () => {
    const p = { lat: 40.7128, lng: -74.006 };
    assert.ok(haversineMiles(p, p) < 0.001);
  });

  it('NYC to Brooklyn is a few miles', () => {
    const manhattan = { lat: 40.758, lng: -73.9855 };
    const sunset = { lat: 40.645, lng: -74.017 };
    const d = haversineMiles(manhattan, sunset);
    assert.ok(d > 5 && d < 15);
  });
});

describe('denseMetroRadius', () => {
  it('uses 10 mi in NYC', () => {
    assert.equal(denseMetroRadius(40.73, -73.99), 10);
  });

  it('defaults to 50 mi outside dense metros', () => {
    assert.equal(denseMetroRadius(32.78, -96.8), 50);
  });
});

describe('formatDistance', () => {
  it('formats miles', () => {
    assert.equal(formatDistance(2.34, false), '2.3 mi');
  });

  it('formats kilometers', () => {
    assert.match(formatDistance(2.34, true), /km$/);
  });
});

describe('resolveUseKm', () => {
  it('uses miles for en-US locale', () => {
    assert.equal(core.resolveUseKm({ locales: ['en-US'] }), false);
  });

  it('uses km for en-CA locale', () => {
    assert.equal(core.resolveUseKm({ locales: ['en-CA'] }), true);
  });

  it('uses miles for en-GB locale', () => {
    assert.equal(core.resolveUseKm({ locales: ['en-GB'] }), false);
  });

  it('uses km for fr-FR locale', () => {
    assert.equal(core.resolveUseKm({ locales: ['fr-FR'] }), true);
  });

  it('uses miles when coords are in the UK', () => {
    assert.equal(core.resolveUseKm({ lat: 51.5074, lng: -0.1278, locales: ['fr-FR'] }), false);
  });

  it('uses km when coords are in Singapore', () => {
    assert.equal(core.resolveUseKm({ lat: 1.3521, lng: 103.8198, locales: ['en-US'] }), true);
  });
});

describe('formatRadiusLabel', () => {
  it('shows mi or km', () => {
    assert.equal(formatRadiusLabel(10, false), '10 mi');
    assert.equal(formatRadiusLabel(10, true), '16 km');
  });
});

describe('nearMeFitPins', () => {
  it('zooms to local cluster, not entire metro list', () => {
    const user = { lat: 40.645, lng: -74.017 };
    const far = { latitude: '40.85', longitude: '-73.87', name: 'Bronx' };
    const near = { latitude: '40.648', longitude: '-74.02', name: 'Local' };
    const pins = Array.from({ length: 30 }, (_, i) => ({
      latitude: String(40.64 + i * 0.01),
      longitude: String(-74.02 + i * 0.005),
      name: 'Pin ' + i
    }));
    pins.push(far, near);
    const fit = nearMeFitPins(pins, user, 50);
    assert.ok(fit.length <= 10);
    assert.ok(fit.some(p => p.name === 'Local'));
    assert.ok(!fit.some(p => p.name === 'Bronx'));
  });
});

describe('distToSegmentMi', () => {
  it('measures distance to a route segment', () => {
    const a = { lat: 40.0, lng: -74.0 };
    const b = { lat: 40.1, lng: -74.0 };
    const onLine = { lat: 40.05, lng: -74.0 };
    const offLine = { lat: 40.05, lng: -73.9 };
    assert.ok(distToSegmentMi(onLine, a, b) < 1);
    assert.ok(distToSegmentMi(offLine, a, b) > 5);
  });
});

describe('nearMeMaxZoom', () => {
  it('returns tighter zoom for smaller spans', () => {
    assert.ok(nearMeMaxZoom(0.02) > nearMeMaxZoom(0.5));
  });
});

describe('verificationPlainText', () => {
  it('describes bidet status plainly', () => {
    assert.match(verificationPlainText({ bidetStatus: 'verified' }), /confirmed/i);
    assert.match(verificationPlainText({ bidetStatus: 'none' }), /no bidet/i);
  });
  it('locks countries BidetBud does not operate in', () => {
    assert.match(
      verificationPlainText({ country: 'Israel', bidetStatus: 'internet' }),
      /does not operate/i
    );
  });
});

describe('doesNotOperate', () => {
  it('is true for Israel and false otherwise', () => {
    assert.equal(doesNotOperate({ country: 'Israel' }), true);
    assert.equal(doesNotOperate({ country: 'USA' }), false);
  });
});

describe('bidetLeadLabel', () => {
  it('prefers bidet type when present', () => {
    assert.equal(bidetLeadLabel({ bidetStatus: 'verified', bidetType: 'Handheld sprayer' }), 'Handheld sprayer');
  });
  it('marks no-operate countries as unavailable', () => {
    assert.equal(bidetLeadLabel({ country: 'Israel', bidetType: 'Bidet' }), 'Unavailable');
  });
});

describe('boxesOverlap', () => {
  it('detects overlapping rectangles', () => {
    const a = { left: 0, top: 0, right: 10, bottom: 10 };
    const b = { left: 5, top: 5, right: 15, bottom: 15 };
    const c = { left: 20, top: 20, right: 30, bottom: 30 };
    assert.equal(boxesOverlap(a, b), true);
    assert.equal(boxesOverlap(a, c), false);
  });
});

describe('shouldShadeBidetFriendly', () => {
  const friendly = new Set(['Malaysia', 'Indonesia', 'Japan']);

  it('never shades Singapore (has its own pins, not bidet-by-default)', () => {
    assert.equal(shouldShadeBidetFriendly({ properties: { ADMIN: 'Singapore' } }, friendly), false);
  });

  it('still shades Malaysia', () => {
    assert.equal(shouldShadeBidetFriendly({ properties: { ADMIN: 'Malaysia' } }, friendly), true);
  });

  it('reads Natural Earth ADMIN property', () => {
    assert.equal(geoCountryName({ properties: { ADMIN: 'Singapore' } }), 'Singapore');
  });
});

describe('pickMapMarkers', () => {
  it('returns all rows under the cap', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    assert.deepEqual(pickMapMarkers(rows, 6000), rows);
  });

  it('ranks before slicing so nearby pins are kept', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i, name: 'seed-' + i }));
    const ranked = pickMapMarkers(rows, 2, (list) => [...list].reverse());
    assert.deepEqual(ranked.map((r) => r.id), [4, 3]);
  });
});

describe('passesBidetStatusFilter', () => {
  it('excludes none rows when a status chip is active', () => {
    assert.equal(passesBidetStatusFilter('none', 'verified'), false);
    assert.equal(passesBidetStatusFilter('verified', 'verified'), true);
    assert.equal(passesBidetStatusFilter('none', null), true);
  });
});

describe('allowLimitedAccessState / nextShowLimitedAccess', () => {
  it('treats Hotels type as limited access', () => {
    assert.equal(allowLimitedAccessState({
      showLimitedAccess: false,
      extraFilter: null,
      placeFilter: 'hotel'
    }), true);
  });

  it('keeps limited access on when clearing the toggle under Hotels', () => {
    const next = nextShowLimitedAccess(false, { placeFilter: 'hotel', extraFilter: null });
    assert.equal(next.showLimitedAccess, true);
    assert.equal(next.extraFilter, null);
  });

  it('clears limited extraFilter when turning the toggle off', () => {
    const next = nextShowLimitedAccess(false, { placeFilter: 'all', extraFilter: 'limited' });
    assert.equal(next.showLimitedAccess, false);
    assert.equal(next.extraFilter, null);
  });
});
