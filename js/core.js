(function(root, factory){
  const api = factory();
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BidetBudCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  const DENSE_METROS = [
    { minLat: 40.49, maxLat: 40.92, minLng: -74.26, maxLng: -73.68, radius: 10 },
    { minLat: 40.57, maxLat: 40.95, minLng: -74.05, maxLng: -73.75, radius: 10 },
    { minLat: 37.68, maxLat: 37.88, minLng: -122.52, maxLng: -122.35, radius: 15 },
    { minLat: 41.64, maxLat: 42.05, minLng: -87.95, maxLng: -87.52, radius: 15 },
    { minLat: 33.95, maxLat: 34.15, minLng: -118.45, maxLng: -118.15, radius: 20 },
    { minLat: 38.79, maxLat: 39.05, minLng: -77.15, maxLng: -76.90, radius: 15 }
  ];

  function haversineMiles(a, b){
    const R = 3959;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function denseMetroRadius(lat, lng){
    for(const m of DENSE_METROS){
      if(lat >= m.minLat && lat <= m.maxLat && lng >= m.minLng && lng <= m.maxLng) return m.radius;
    }
    return 50;
  }

  function formatDistance(mi, useKm){
    if(useKm){
      const km = mi * 1.60934;
      return (km < 10 ? km.toFixed(1) : Math.round(km)) + ' km';
    }
    return (mi < 10 ? mi.toFixed(1) : Math.round(mi)) + ' mi';
  }

  function formatRadiusLabel(r, useKm){
    if(useKm) return Math.round(r * 1.60934) + ' km';
    return r + ' mi';
  }

  const MILE_REGIONS = new Set(['US', 'GB', 'LR', 'MM']);

  function localeList(locales){
    return locales && locales.length
      ? locales
      : (typeof navigator !== 'undefined' && navigator.languages?.length
        ? [...navigator.languages]
        : [typeof navigator !== 'undefined' ? navigator.language : 'en-US']);
  }

  function localeHasExplicitRegion(locales){
    for(const lang of localeList(locales)){
      const tag = String(lang || '').trim();
      if(!tag) continue;
      try{
        if(new Intl.Locale(tag).region) return true;
      }catch(e){
        if(tag.split('-')[1]) return true;
      }
    }
    return false;
  }

  /** True when UI should show km (Canada, most of world). False for miles (US, UK). */
  function localePrefersKm(locales){
    const list = localeList(locales);
    for(const lang of list){
      const tag = String(lang || '').trim();
      if(!tag) continue;
      let region = '';
      try{
        region = new Intl.Locale(tag).region || '';
      }catch(e){
        region = tag.split('-')[1]?.toUpperCase() || '';
      }
      if(!region) continue;
      if(MILE_REGIONS.has(region)) return false;
      return true;
    }
    const primary = String(list[0] || 'en-US').toLowerCase();
    if(primary === 'en-us' || primary.endsWith('-us')) return false;
    if(primary === 'en-gb' || primary.endsWith('-gb')) return false;
    if(primary === 'en-ca' || primary.endsWith('-ca')) return true;
    if(primary.startsWith('en')) return false;
    return true;
  }

  /** No-permission hint from system timezone (refines locale for US vs Canada). */
  function timezonePrefersKm(){
    try{
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if(/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Yellowknife|Whitehorse|Iqaluit|Moncton|Glace_Bay|Goose_Bay)/.test(tz)) return true;
      if(/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Honolulu|Detroit|Boise|Indiana|Menominee|Sitka|Metlakatla|Nome|Adak)/.test(tz)) return false;
      if(tz === 'Europe/London') return false;
      if(tz.startsWith('Australia/') || tz.startsWith('Pacific/Auckland')) return true;
    }catch(e){}
    return null;
  }

  /** When Near me provides coords, UK is unambiguous for miles. */
  function inferUseKmFromCoords(lat, lng){
    const la = +lat;
    const lo = +lng;
    if(!Number.isFinite(la) || !Number.isFinite(lo)) return null;
    if(la >= 49.86 && la <= 60.95 && lo >= -8.65 && lo <= 1.92) return false;
    if(la >= 1.15 && la <= 1.48 && lo >= 103.6 && lo <= 104.1) return true;
    return null;
  }

  function resolveUseKm(opts){
    const o = opts || {};
    if(o.lat != null && o.lng != null){
      const fromCoords = inferUseKmFromCoords(o.lat, o.lng);
      if(fromCoords != null) return fromCoords;
    }
    const locales = o.locales || localeList();
    if(!localeHasExplicitRegion(locales)){
      const fromTz = timezonePrefersKm();
      if(fromTz != null) return fromTz;
    }
    return localePrefersKm(locales);
  }

  function distToSegmentMi(pt, a, b){
    const d12 = haversineMiles(a, b);
    if(d12 < 0.01) return haversineMiles(a, pt);
    const t = Math.max(0, Math.min(1,
      ((pt.lat - a.lat) * (b.lat - a.lat) + (pt.lng - a.lng) * (b.lng - a.lng)) /
      ((b.lat - a.lat) ** 2 + (b.lng - a.lng) ** 2 + 1e-9)
    ));
    const proj = { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
    return haversineMiles(pt, proj);
  }

  function nearMeFitPins(filtered, userLocation, radiusMi){
    if(!userLocation || !filtered.length) return [];
    const ranked = filtered
      .map(m => ({
        m,
        dist: haversineMiles(userLocation, { lat: +m.latitude, lng: +m.longitude })
      }))
      .sort((a, b) => a.dist - b.dist);
    const nearestDist = ranked[0].dist;
    const windowMi = Math.min(radiusMi, Math.max(3, nearestDist + 4));
    const local = ranked.filter(x => x.dist <= windowMi);
    const cap = Math.min(10, local.length || ranked.length);
    return (local.length ? local : ranked).slice(0, cap).map(x => x.m);
  }

  function nearMeMaxZoom(span){
    if(span > 0.45) return 11;
    if(span > 0.18) return 12;
    if(span > 0.08) return 13;
    if(span > 0.035) return 14;
    return 15;
  }

  function formatBidetType(s){
    return String(s || '')
      .split(',')
      .map(p => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(', ');
  }

  function verificationPlainText(m){
    if(m.bidetStatus === 'none') return 'Reported: no bidet or handheld sprayer here.';
    if(m.bidetStatus === 'verified') return 'Someone confirmed this in person.';
    if(m.bidetStatus === 'warmed') return 'Manufacturer install (heated seat / washlet).';
    if(m.bidetStatus === 'internet') return 'Found online, not yet checked in person.';
    return '';
  }

  function bidetLeadLabel(m){
    if(m.bidetStatus === 'none') return 'No bidet reported';
    const bt = formatBidetType(m.bidetType);
    if(bt) return bt;
    if(m.bidetStatus === 'warmed') return 'Heated / washlet';
    if(m.bidetStatus === 'verified') return 'Verified bidet';
    return 'Bidet reported';
  }

  function boxesOverlap(a, b){
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  const FRIENDLY_SHADE_EXCLUDE_GEO = ['Singapore'];

  function geoCountryName(feature){
    const p = feature.properties || {};
    return p.ADMIN || p.name || p.NAME || p.name_long || '';
  }

  function shouldShadeBidetFriendly(feature, friendlyGeoNames, excludeGeoNames){
    const exclude = excludeGeoNames instanceof Set
      ? excludeGeoNames
      : new Set(excludeGeoNames || FRIENDLY_SHADE_EXCLUDE_GEO);
    const name = geoCountryName(feature);
    if(!name || exclude.has(name)) return false;
    return friendlyGeoNames.has(name);
  }

  return {
    DENSE_METROS,
    haversineMiles,
    denseMetroRadius,
    formatDistance,
    formatRadiusLabel,
    localePrefersKm,
    timezonePrefersKm,
    inferUseKmFromCoords,
    resolveUseKm,
    distToSegmentMi,
    nearMeFitPins,
    nearMeMaxZoom,
    formatBidetType,
    verificationPlainText,
    bidetLeadLabel,
    boxesOverlap,
    geoCountryName,
    shouldShadeBidetFriendly,
    FRIENDLY_SHADE_EXCLUDE_GEO
  };
});
