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

  return {
    DENSE_METROS,
    haversineMiles,
    denseMetroRadius,
    formatDistance,
    formatRadiusLabel,
    distToSegmentMi,
    nearMeFitPins,
    nearMeMaxZoom,
    formatBidetType,
    verificationPlainText,
    bidetLeadLabel,
    boxesOverlap
  };
});
