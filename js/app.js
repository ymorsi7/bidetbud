(function(){
  // Web3Forms access key: public client key (safe in source per web3forms.com docs).
  const WEB3FORMS_ACCESS_KEY = 'b0f5343d-1608-4224-a49a-d32d13fbbdfe';
  const SITE_URL = 'https://bidetbud.com/';
  // Rebuilt from the seed on load; this literal is only the pre-seed fallback.
  let COUNTRY_FILTERS = ['USA', 'UK', 'Canada', 'Mexico', 'Colombia', 'Australia', 'New Zealand', 'China', 'Singapore', 'Germany', 'France', 'Russia'];
  // A country needs at least this many pins to earn a filter chip.
  const COUNTRY_CHIP_MIN = 10;
  const POPULAR_CITIES = ['NYC', 'Bay Area', 'Houston', 'London', 'Toronto', 'Chicago', 'Dallas', 'Sunset Park', 'Williamsburg'];
  const RADIUS_OPTIONS = [5, 10, 15, 25, 50, 100];
  const RECENT_SEARCH_KEY = 'bb_recent_searches';
  const FIRST_VISIT_KEY = 'bb_visited';
  const FIRST_VISIT_NEAR_RADIUS = 15;
  const ALONG_ROUTE_MI = 3;
  const MAP_MIN_ZOOM = 3;
  const DEFAULT_MAP_CENTER = { lat: 39.8283, lng: -98.5795 };
  const DEFAULT_MAP_ZOOM = 4;

  const HAS_BIDET = s => s === 'verified' || s === 'warmed' || s === 'internet';
  const NO_BIDET = s => s === 'none';
  const isIOS = () => {
    try {
      if (window.Capacitor && typeof window.Capacitor.getPlatform === 'function' &&
          window.Capacitor.getPlatform() === 'ios') return true;
    } catch (e) {}
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  };

  const {
    stableSeedId,
    normalizeSeed,
    normalizeSearchText,
    searchScore,
    matchesSearch,
    matchesNameSearch,
    cityMatchesQuery,
    searchFitRows,
  } = typeof BidetBudSearch !== 'undefined' ? BidetBudSearch : {};

  let allLocations = [], userLocation = null, map, clusterGroup, countriesLayer;
  let userMarker = null, userRadiusCircle = null, markerById = new Map(), highlightedMarkerId = null;
  let useKm = false, alongRoute = null, searchAcIndex = -1, listFocusIndex = -1;
  let lastFiltered = [];
  let refreshTimer = null;
  let mapMoveTimer = null;
  const LIST_CAP = 200;
  const MAP_MARKER_CAP = 6000;
  let placeFilter = 'all', extraFilter = null, countryFilter = null, noBidetMode = false, showLimitedAccess = false;
  let sortMode = 'closest';
  let lastFitKey = null;
  let pendingView = null;
  let zoomDragLock = false;
  let zoomQuietUntil = 0;
  let invalidateTimer = 0;
  let autoCentered = false;
  // Rows matching the filters globally, vs. the subset inside the current map view.
  let totalMatchCount = 0;
  let nearMe = false, radiusMi = 50, nearMeFitPending = false;
  let suppressUrlWrite = false, initialBoundsDone = false, activeSpotId = null;
  let autoFitUntil = 0;

  // Countries where bidets, washlets, or handheld sprayers are the norm, not spot-level exceptions.
  const BIDET_FRIENDLY_COUNTRIES = [
    'Japan', 'South Korea', 'Taiwan',
    'Italy', 'Greece',
    // Middle East & North Africa: shattaf / handheld sprayers are standard
    'Turkey', 'Syria', 'Lebanon', 'Jordan', 'Palestine', 'Iraq', 'Iran', 'Yemen',
    'Saudi Arabia', 'United Arab Emirates', 'Kuwait', 'Qatar', 'Bahrain', 'Oman',
    'Egypt', 'Libya', 'Tunisia', 'Algeria', 'Morocco', 'Sudan',
    // South & Southeast Asia: sprayers / water cleansing are standard
    'India', 'Pakistan', 'Bangladesh', 'Nepal', 'Sri Lanka', 'Afghanistan',
    'Malaysia', 'Indonesia', 'Thailand', 'Vietnam', 'Cambodia',
    'Brunei', 'Laos', 'Myanmar', 'Maldives', 'East Timor',
    'Argentina', 'Uruguay', 'Brazil'
  ];
  const BIDET_FRIENDLY_GEO_NAMES = new Set(BIDET_FRIENDLY_COUNTRIES.map(name => ({
    Serbia: 'Republic of Serbia'
  }[name] || name)));
  // Bidets are common nationwide in these countries (shaded on the map), so
  // individual pins there are redundant and get filtered out of the seed.
  const BIDET_FRIENDLY_COUNTRY_SET = new Set(
    BIDET_FRIENDLY_COUNTRIES
      .concat(['UAE']) // seed abbreviation for United Arab Emirates
      .map(c => c.toLowerCase())
  );
  function isBidetFriendlyCountry(country){
    return BIDET_FRIENDLY_COUNTRY_SET.has(String(country || '').trim().toLowerCase());
  }
  function doesNotOperate(m){
    return core.doesNotOperate ? core.doesNotOperate(m) : String(m && m.country || '').trim().toLowerCase() === 'israel';
  }
  function isClosed(m){
    return core.isClosed ? core.isClosed(m) : !!(m && m.closed);
  }
  // Natural Earth 50m: johan/world.geo.json omits Singapore (SG falls inside Malaysia's polygon).
  const BIDET_COUNTRY_GEOJSON_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
  // Never shade these as bidet-friendly even if a coarse polygon swallows them.
  const FRIENDLY_SHADE_EXCLUDE_GEO = new Set(['Singapore']);

  function addCartoVoyagerTiles(targetMap, showAttribution, noWrap){
    const cartoKey = (typeof window !== 'undefined' && window.BIDETBUD_CARTO_KEY) || '';
    const url = cartoKey
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=' + encodeURIComponent(cartoKey)
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    L.tileLayer(url, {
      maxZoom: 19,
      subdomains: cartoKey ? 'abcd' : 'abc',
      noWrap: Boolean(noWrap),
      updateWhenZooming: false,
      updateWhenIdle: true,
      keepBuffer: 6,
      attribution: showAttribution
        ? (cartoKey ? '© OpenStreetMap · © CARTO' : '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>')
        : undefined
    }).addTo(targetMap);
  }

  function seedMapCenter(locations){
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    let count = 0;
    for (const m of locations) {
      if (!validCoord(m)) continue;
      const lat = +m.latitude, lng = +m.longitude;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      count++;
    }
    if (!count) return { lat: 20, lng: 0 };
    return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  }

  const core = typeof BidetBudCore !== 'undefined' ? BidetBudCore : {};
  const haversineMiles = core.haversineMiles || function(a, b){
    const R=3959,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180;
    const x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
    return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
  };

  function boundsSpanDeg(bounds){
    if(!bounds || !bounds.isValid()) return 0;
    return Math.max(
      Math.abs(bounds.getNorth() - bounds.getSouth()),
      Math.abs(bounds.getEast() - bounds.getWest())
    );
  }

  function nearMeEmptyZoom(){
    if(radiusMi <= 25) return 11;
    if(radiusMi <= 50) return 10;
    return 9;
  }

  function nearMeFitPins(filtered){
    if(core.nearMeFitPins) return core.nearMeFitPins(filtered, userLocation, radiusMi);
    if(!userLocation || !filtered.length) return [];
    const ranked = filtered
      .map(m => ({ m, dist: haversineMiles(userLocation, { lat: +m.latitude, lng: +m.longitude }) }))
      .sort((a, b) => a.dist - b.dist);
    const windowMi = Math.min(radiusMi, Math.max(3, ranked[0].dist + 4));
    return ranked.filter(x => x.dist <= windowMi).slice(0, 10).map(x => x.m);
  }

  function nearMeMaxZoom(span){
    return core.nearMeMaxZoom ? core.nearMeMaxZoom(span) : (span > 0.18 ? 12 : 14);
  }

  function fitNearMeView(filtered){
    if(!map || !userLocation || !nearMe) return;
    const userPt = [userLocation.lat, userLocation.lng];
    const fitPins = nearMeFitPins(filtered);
    if(!fitPins.length){
      map.setView(userPt, nearMeEmptyZoom(), { animate: false });
      return;
    }
    const bounds = L.latLngBounds([userPt]);
    fitPins.forEach(m => bounds.extend([+m.latitude, +m.longitude]));
    if(!bounds.isValid()) return;
    const span = boundsSpanDeg(bounds);
    const pad = fitPins.length <= 2 ? 0.32
      : fitPins.length <= 5 ? 0.22
      : fitPins.length <= 10 ? 0.14
      : 0.1;
    map.fitBounds(bounds.pad(pad), {
      maxZoom: nearMeMaxZoom(span),
      animate: false,
      padding: [56, 56]
    });
  }

  function applyDistanceUnits(){
    const lat = userLocation?.lat;
    const lng = userLocation?.lng;
    useKm = core.resolveUseKm
      ? core.resolveUseKm({ lat, lng })
      : (core.localePrefersKm ? core.localePrefersKm() : false);
    updateRadiusChipLabels();
  }

  function formatDistance(mi){
    return core.formatDistance ? core.formatDistance(mi, useKm) : (mi.toFixed(1) + ' mi');
  }

  function formatRadiusLabel(r){
    return core.formatRadiusLabel ? core.formatRadiusLabel(r, useKm) : (r + ' mi');
  }

  function denseMetroRadius(lat, lng){
    return core.denseMetroRadius ? core.denseMetroRadius(lat, lng) : 50;
  }

  function distToSegmentMi(pt, a, b){
    return core.distToSegmentMi ? core.distToSegmentMi(pt, a, b) : haversineMiles(pt, a);
  }

  function saveRecentSearch(q){
    const t = String(q || '').trim();
    if(t.length < 2) return;
    try{
      let list = JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) || '[]');
      list = [t, ...list.filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, 5);
      localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(list));
    }catch(e){}
  }

  function getRecentSearches(){
    try{
      const list = JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    }catch(e){ return []; }
  }

  function verificationPlainText(m){
    return core.verificationPlainText ? core.verificationPlainText(m) : '';
  }

  function trustSourceLine(m){
    if(m.verifiedMethod === 'in person') return 'Verified in person';
    if(m.verifiedMethod === 'community-sighting') return 'Added via community sighting';
    if(m.verifiedMethod === 'manufacturer-reference') return 'From manufacturer locator (TOTO / Geberit)';
    if(m.verifiedMethod === 'web-source') return 'From a web source with bidet evidence';
    if(m.bidetStatus === 'verified') return 'Added via community report';
    if(m.sourceUrl) return 'Listed from an online source';
    return '';
  }

  function bidetLeadLabel(m){
    return core.bidetLeadLabel ? core.bidetLeadLabel(m) : (m.name || '');
  }

  function mapsDirectionsUrl(m){
    const q = encodeURIComponent([m.name, m.address, m.city].filter(Boolean).join(', '));
    // iPhone / Capacitor iOS: Apple Maps is the system maps app.
    if(isIOS()) return 'https://maps.apple.com/?daddr=' + q;
    return 'https://www.google.com/maps/dir/?api=1&destination=' + q;
  }

  function openExternalUrl(url){
    if(!url) return;
    try {
      const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if(isNativeApp() && App && typeof App.openUrl === 'function'){
        App.openUrl({ url: url }).catch(function(){ window.location.href = url; });
        return;
      }
    } catch (e) {}
    window.open(url, '_blank', 'noopener');
  }

  function wireMapsLinks(root){
    if(!root) return;
    root.querySelectorAll('a[href*="maps.apple.com"], a[href*="google.com/maps"]').forEach(a=>{
      a.addEventListener('click', (e)=>{
        if(!isNativeApp() && !isIOS()) return;
        e.preventDefault();
        openExternalUrl(a.href);
      });
    });
  }

  function updateUserMarker(){
    if(userMarker && map){ map.removeLayer(userMarker); userMarker = null; }
    if(userRadiusCircle && map){ map.removeLayer(userRadiusCircle); userRadiusCircle = null; }
    if(!map || !userLocation) return;
    const userIcon = L.divIcon({
      html: '<div class="user-loc-dot"></div>',
      className: 'user-loc-marker',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
    userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 2000, interactive: false });
    userMarker.addTo(map);
    if(!nearMe) return;
    const radiusM = radiusMi * 1609.34;
    userRadiusCircle = L.circle([userLocation.lat, userLocation.lng], {
      radius: radiusM,
      color: '#2563eb',
      weight: 1.5,
      fillColor: '#2563eb',
      fillOpacity: 0.06,
      interactive: false
    });
    userRadiusCircle.addTo(map);
  }

  function highlightMarker(id){
    highlightedMarkerId = id;
    markerById.forEach((marker, mid) => {
      const el = marker.getElement?.();
      if(el) el.classList.toggle('marker-highlight', mid === id);
    });
  }

  function focusSpotOnMap(m, opts){
    if(!map || !m) return;
    const zoom = opts?.zoom || Math.max(map.getZoom(), 15);
    map.setView([+m.latitude, +m.longitude], zoom, { animate: !(isIOS() || isNativeApp()) });
    highlightMarker(m.id);
    if(opts?.offset !== false) offsetMapForDetailSheet();
  }

  function scrollToListCard(id){
    document.querySelectorAll('.card').forEach(c => c.classList.remove('active', 'keyboard-focus'));
    const card = document.querySelector('.card[data-id="' + id + '"]');
    if(card){
      card.classList.add('active');
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function updateNoBidetUi(){
    const banner = document.getElementById('noBidetBanner');
    if(banner) banner.hidden = !noBidetMode;
    const hint = document.getElementById('noBidetSearchHint');
    // Name search already includes matching no-bidet pins; don't imply they are hidden.
    if(hint) hint.hidden = true;
  }

  function activeFilterItems(){
    const items = [];
    if(nearMe) items.push({ key: 'near', label: 'Near me' });
    if(nearMe) items.push({ key: 'radius', label: 'Within ' + formatRadiusLabel(radiusMi) });
    if(noBidetMode) items.push({ key: 'nobidet', label: 'No-bidet too' });
    if(placeFilter === 'mosque') items.push({ key: 'place', label: 'Masajid' });
    if(placeFilter === 'restaurant') items.push({ key: 'place', label: 'Restaurants' });
    if(placeFilter === 'hotel') items.push({ key: 'place', label: 'Hotels' });
    if(placeFilter === 'public') items.push({ key: 'place', label: 'Public' });
    if(extraFilter === 'verified') items.push({ key: 'extra', label: 'User verified' });
    if(extraFilter === 'warmed') items.push({ key: 'extra', label: 'Heated / TOTO' });
    if(extraFilter === 'internet') items.push({ key: 'extra', label: 'From internet' });
    if(extraFilter === 'public') items.push({ key: 'extra', label: 'Public access' });
    if(extraFilter === 'limited') items.push({ key: 'extra', label: 'Guests only' });
    if(countryFilter) items.push({ key: 'country', label: countryFilter });
    if(showLimitedAccess && extraFilter !== 'limited' && placeFilter !== 'hotel') items.push({ key: 'limitedtoggle', label: 'Hotels included' });
    if(alongRoute) items.push({ key: 'route', label: 'Along route' });
    const q = getQuery();
    if(q) items.push({ key: 'q', label: '"' + q + '"' });
    return items;
  }

  function clearFilterKey(key){
    if(key === 'near'){ nearMe = false; userLocation = null; nearMeFitPending = false; updateNearMeUi(); }
    if(key === 'radius') radiusMi = 50;
    if(key === 'nobidet') noBidetMode = false;
    if(key === 'place') placeFilter = 'all';
    if(key === 'extra') extraFilter = null;
    if(key === 'country') countryFilter = null;
    if(key === 'limitedtoggle') showLimitedAccess = false;
    if(key === 'route') alongRoute = null;
    if(key === 'q'){
      document.getElementById('searchInput').value = '';
      hideSearchAc();
    }
    initialBoundsDone = false;
    updateFilterUi();
    refresh();
  }

  function clearAllFilters(){
    nearMe = false;
    userLocation = null;
    nearMeFitPending = false;
    noBidetMode = false;
    placeFilter = 'all';
    extraFilter = null;
    countryFilter = null;
    showLimitedAccess = false;
    alongRoute = null;
    radiusMi = 50;
    document.getElementById('searchInput').value = '';
    hideSearchAc();
    initialBoundsDone = false;
    updateNearMeUi();
    updateFilterUi();
    refresh();
  }

  function updateActiveFiltersBar(){
    const bar = document.getElementById('activeFilters');
    if(!bar) return;
    const items = activeFilterItems();
    if(!items.length){ bar.hidden = true; bar.innerHTML = ''; return; }
    bar.hidden = false;
    bar.innerHTML = items.map(it =>
      '<span class="active-filter-chip">' + escapeHtml(it.label) +
      ' <button type="button" aria-label="Remove ' + escapeHtml(it.label) + '" data-clear="' + it.key + '">×</button></span>'
    ).join('') + '<button type="button" class="active-filter-clear" id="clearAllFilters">Clear all</button>';
    bar.querySelectorAll('[data-clear]').forEach(btn => {
      btn.addEventListener('click', () => clearFilterKey(btn.dataset.clear));
    });
    document.getElementById('clearAllFilters')?.addEventListener('click', clearAllFilters);
  }

  function updateNearMeHint(filtered){
    const el = document.getElementById('nearMeHint');
    if(!el) return;
    if(!nearMe || !userLocation){
      el.hidden = true;
      return;
    }
    const local = rowsWithinRadius(filtered).length;
    if(local){
      el.textContent = 'Nearest first · ' + local + ' within ' + formatRadiusLabel(radiusMi) + '.';
    } else {
      el.textContent = 'Nothing within ' + formatRadiusLabel(radiusMi) + '. Showing the closest spots instead.';
    }
    el.hidden = false;
  }

  function updateRadiusChipLabels(){
    document.querySelectorAll('#radiusRow button[data-radius]').forEach(b=>{
      const r = parseInt(b.dataset.radius, 10);
      b.textContent = formatRadiusLabel(r);
    });
  }

  function setDocumentTitleForSpot(m){
    if(!m){ document.title = 'BidetBud'; return; }
    const lead = bidetLeadLabel(m);
    document.title = m.name + ' - ' + lead + ' | BidetBud';
  }

  function copyViewLink(){
    const url = location.origin + location.pathname + (location.search || '');
    const live = document.getElementById('copyLinkStatus');
    const done = () => {
      if(live){
        live.textContent = 'Link copied';
        live.hidden = false;
        setTimeout(() => { live.textContent = ''; live.hidden = true; }, 2500);
      } else alert('Link copied!');
    };
    navigator.clipboard?.writeText(url).then(done).catch(() => {
      const picked = prompt('Copy link:', url);
      if(picked != null && live) done();
    });
  }

  function setAddScreenTitle(text){
    const title = document.getElementById('addTitle');
    if(title) title.textContent = text || 'Suggest a spot';
  }

  function setAddUpdateBanner(m){
    const el = document.getElementById('addUpdateBanner');
    if(!el) return;
    if(m && m.name){
      el.hidden = false;
      el.textContent = 'Updating “' + m.name + '”. Change what’s wrong and submit.';
    } else {
      el.hidden = true;
      el.textContent = '';
    }
  }

  function openAddFormPrefill(m, noBidet){
    resetAddForm();
    const nameEl = document.getElementById('addName');
    const addrEl = document.getElementById('addAddress');
    const updateEl = document.getElementById('addUpdateOf');
    if(nameEl) nameEl.value = m?.name || '';
    if(addrEl) addrEl.value = [m?.address, m?.city].filter(Boolean).join(', ');
    if(updateEl) updateEl.value = m?.id || '';
    setAddHasBidet(noBidet ? 'none' : 'verified');
    setAddScreenTitle(m?.name ? 'Suggest an update' : 'Suggest a spot');
    setAddUpdateBanner(m);
    const more = document.getElementById('addMoreDetails');
    if(more && addrEl?.value) more.open = true;
    setOverlayOpen('addOverlay', true);
    renderAddDuplicates();
    if(typeof window.trackEvent === 'function'){
      window.trackEvent('bidetbud_add_open', { source: 'prefill' });
    }
  }

  function maybeShowLegendTip(){
    /* first-run legend tip disabled */
  }

  function dismissLegendTip(){
    try{ localStorage.setItem('bb_legend_tip', '1'); }catch(e){}
    const tip = document.getElementById('legendTip');
    if(tip) tip.hidden = true;
  }

  function maybeShowFirstRunHints(){
    try{
      if(localStorage.getItem('bb_hint_nobidet') !== '1' && !noBidetMode){
        const btn = document.getElementById('noBidetToggle');
        if(btn){
          btn.title = 'Also show places without a bidet (first tip)';
          setTimeout(() => { btn.title = 'Also show places we\'ve recorded that do NOT have a bidet'; }, 8000);
        }
        localStorage.setItem('bb_hint_nobidet', '1');
      }
    }catch(e){}
  }

  async function geocodePlace(query){
    const url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(query) + '&limit=1';
    const res = await fetch(url);
    if(!res.ok) throw new Error('Could not look up place');
    const data = await res.json();
    const f = data.features?.[0];
    if(!f?.geometry?.coordinates) throw new Error('Place not found');
    return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: f.properties?.name || query };
  }

  async function applyAlongRoute(fromQ, toQ){
    const from = await geocodePlace(fromQ);
    const to = await geocodePlace(toQ);
    alongRoute = { from, to };
    initialBoundsDone = false;
    refresh();
    if(map){
      const bounds = L.latLngBounds([[from.lat, from.lng], [to.lat, to.lng]]);
      map.fitBounds(bounds.pad(0.2), { maxZoom: 11 });
    }
  }

  function initData(){
    const api = window.BidetBudMapApi;
    const raw = api && api.allCached ? api.allCached() : (window.BIDETBUD_SEED || []);
    allLocations = raw
      .map(normalizeSeed)
      .filter(l => HAS_BIDET(l.bidetStatus) || NO_BIDET(l.bidetStatus))
      .filter(l => !isBidetFriendlyCountry(l.country));
    buildCountryFilters();
    renderCountryChips();
  }

  function buildCountryFilters(){
    const api = window.BidetBudMapApi;
    if(api && api.countries && api.countries.length){
      COUNTRY_FILTERS = api.countries.map(c => c.name);
    } else {
      const counts = new Map();
      for(const m of allLocations){
        const c = String(m.country || '').trim();
        if(c) counts.set(c, (counts.get(c) || 0) + 1);
      }
      const ranked = [...counts.entries()]
        .filter(([, n]) => n >= COUNTRY_CHIP_MIN)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([c]) => c);
      if(ranked.length) COUNTRY_FILTERS = ranked;
    }
    // A country deep-linked via ?country= stays selectable even below the threshold.
    if(countryFilter && !COUNTRY_FILTERS.includes(countryFilter)) COUNTRY_FILTERS.push(countryFilter);
  }

  function renderCountryChips(){
    const panel = document.getElementById('typeChips');
    if(!panel) return;
    const divider = panel.querySelector('.chip-divider');
    if(!divider) return;
    let node = divider.nextElementSibling;
    while(node){
      const next = node.nextElementSibling;
      node.remove();
      node = next;
    }
    divider.insertAdjacentHTML('afterend', COUNTRY_FILTERS.map(c =>
      '<button type="button" class="chip'+(countryFilter===c?' active':'')+'" data-type="'+escapeHtml(c)+'">'+escapeHtml(c)+'</button>'
    ).join(''));
  }

  function spotShareUrl(id){
    const p = new URLSearchParams(location.search);
    p.set('spot', id);
    return location.origin + location.pathname + '?' + p.toString();
  }

  function syncUrlFromState(){
    if(suppressUrlWrite) return;
    const p = new URLSearchParams();
    const q = document.getElementById('searchInput').value.trim();
    if(q) p.set('q', q);
    if(placeFilter !== 'all') p.set('type', placeFilter);
    if(extraFilter) p.set('filter', extraFilter);
    if(countryFilter) p.set('country', countryFilter);
    if(noBidetMode) p.set('nobidet', '1');
    if(showLimitedAccess) p.set('limited', '1');
    if(nearMe){ p.set('near', '1'); p.set('radius', String(radiusMi)); }
    if(sortMode !== 'closest') p.set('sort', sortMode);
    // The list is scoped to the map view, so a shared link has to carry the view.
    if(map && !nearMe){
      const c = map.getCenter();
      p.set('view', c.lat.toFixed(4) + ',' + c.lng.toFixed(4) + ',' + map.getZoom());
    }
    if(activeSpotId) p.set('spot', activeSpotId);
    const next = p.toString() ? '?' + p.toString() : location.pathname;
    history.replaceState(null, '', next);
  }

  function parseViewParam(raw){
    if(!raw) return null;
    const [lat, lng, zoom] = String(raw).split(',').map(Number);
    if(!isFinite(lat) || !isFinite(lng) || !isFinite(zoom)) return null;
    if(lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng, zoom: Math.max(MAP_MIN_ZOOM, Math.min(19, zoom)) };
  }

  function applyUrlState(){
    const p = new URLSearchParams(location.search);
    suppressUrlWrite = true;
    if(p.get('utm_source') === 'masjid') placeFilter = 'mosque';
    const q = p.get('q');
    if(q) document.getElementById('searchInput').value = q;
    if(p.get('type')) placeFilter = p.get('type');
    if(p.get('filter')) extraFilter = p.get('filter');
    if(p.get('nobidet') === '1') noBidetMode = true;
    if(p.get('limited') === '1') showLimitedAccess = true;
    if(placeFilter === 'hotel') showLimitedAccess = true;
    const spotId = p.get('spot') || '';
    if(spotId){
      const spot = allLocations.find(x => x.id === spotId);
      if(spot && spot.access === 'limited') showLimitedAccess = true;
    }
    // Any country in the seed is linkable, not just the ones with a chip.
    const country = p.get('country');
    if(country) countryFilter = country;
    if(p.get('near') === '1') nearMe = true;
    if(p.get('radius')) radiusMi = parseInt(p.get('radius'), 10) || 50;
    const sort = p.get('sort');
    if(sort === 'verified' || sort === 'name'){
      sortMode = sort;
      const sel = document.getElementById('sortSelect');
      if(sel) sel.value = sort;
    }
    pendingView = parseViewParam(p.get('view'));
    updateFilterUi();
    updateNearMeUi();
    suppressUrlWrite = false;
    if(p.get('near') === '1' && !userLocation && navigator.geolocation){
      navigator.geolocation.getCurrentPosition(pos=>{
        userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if(!p.get('radius')) radiusMi = denseMetroRadius(userLocation.lat, userLocation.lng);
        applyDistanceUnits();
        nearMeFitPending = true;
        refresh();
      }, ()=>{});
    }
    return spotId;
  }

  function setShowLimitedAccess(on){
    const next = core.nextShowLimitedAccess
      ? core.nextShowLimitedAccess(on, { placeFilter, extraFilter })
      : { showLimitedAccess: Boolean(on), extraFilter: (!on && extraFilter === 'limited') ? null : extraFilter };
    showLimitedAccess = next.showLimitedAccess;
    extraFilter = next.extraFilter;
    initialBoundsDone = false;
    updateFilterUi();
    refresh();
    if(typeof window.trackEvent === 'function') window.trackEvent('bidetbud_limited_toggle', { on: showLimitedAccess });
  }

  function setNoBidetMode(on){
    noBidetMode = Boolean(on);
    updateFilterUi();
    refresh();
    if(typeof window.trackEvent === 'function') window.trackEvent('bidetbud_no_bidet_toggle', { on: noBidetMode });
  }

  function allowLimitedAccess(){
    if(core.allowLimitedAccessState){
      return core.allowLimitedAccessState({ showLimitedAccess, extraFilter, placeFilter });
    }
    return showLimitedAccess || extraFilter === 'limited' || placeFilter === 'hotel';
  }

  function updateFilterUi(){
    const noBidetBtn = document.getElementById('noBidetToggle');
    if(noBidetBtn){
      noBidetBtn.classList.toggle('active', noBidetMode);
      noBidetBtn.setAttribute('aria-pressed', noBidetMode ? 'true' : 'false');
    }
    const limitedBtn = document.getElementById('limitedAccessToggle');
    if(limitedBtn){
      limitedBtn.classList.toggle('active', showLimitedAccess);
      limitedBtn.setAttribute('aria-pressed', showLimitedAccess ? 'true' : 'false');
    }
    const legendNone = document.getElementById('legendNone');
    if(legendNone) legendNone.hidden = !noBidetMode;
    const legendPopupNone = document.getElementById('legendPopupNone');
    if(legendPopupNone) legendPopupNone.hidden = !noBidetMode;
    document.querySelectorAll('#placeFilter button').forEach(b=>{
      b.classList.toggle('active', b.dataset.type === placeFilter);
    });
    document.querySelectorAll('#typeChips .chip[data-type]').forEach(b=>{
      const t = b.dataset.type;
      if(COUNTRY_FILTERS.includes(t)){
        b.classList.toggle('active', countryFilter === t);
      } else {
        b.classList.toggle('active', extraFilter === t);
      }
    });
    document.querySelectorAll('#radiusRow button').forEach(b=>{
      b.classList.toggle('active', parseInt(b.dataset.radius, 10) === radiusMi);
    });
    const radiusRow = document.getElementById('radiusRow');
    if(radiusRow) radiusRow.hidden = !nearMe;
    updateRadiusChipLabels();
    updateNoBidetUi();
    updateActiveFiltersBar();
  }

  function updateNearMeUi(){
    const btn = document.getElementById('nearMeBtn');
    const label = btn?.querySelector('.btn-label');
    btn?.classList.toggle('active', nearMe);
    if(label) label.textContent = nearMe ? 'Near me ✓' : 'Near me';
  }

  function initSubmitPanel(){
    const intro = document.getElementById('addIntro');
    if(intro){
      intro.textContent = 'Name and whether it has a bidet is enough. We review every submission before it goes live.';
    }
    const emailPanel = document.getElementById('emailPanel');
    if(emailPanel) emailPanel.hidden = false;
    document.querySelectorAll('#addDialog .add-bidet-segmented button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        setAddHasBidet(btn.dataset.value || 'verified');
      });
    });
  }

  function setAddHasBidet(value){
    const v = value === 'none' ? 'none' : 'verified';
    const hidden = document.getElementById('addHasBidet');
    if(hidden) hidden.value = v;
    document.querySelectorAll('#addDialog .add-bidet-segmented button').forEach(btn=>{
      const on = btn.dataset.value === v;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function validCoord(m){
    const lat=+m.latitude,lng=+m.longitude;
    return !isNaN(lat)&&!isNaN(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180;
  }

  function stripEmDash(s){
    return String(s)
      .replace(/\s*\u2014\s*/g, ': ')
      .replace(/\u2013/g, '-')
      .replace(/(\w) +: /g, '$1: ')
      .replace(/: {2,}/g, ': ');
  }
  function escapeHtml(s){
    return stripEmDash(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function highlight(text,q){
    if(!q||!text) return escapeHtml(text||'');
    const t=String(text), i=t.toLowerCase().indexOf(q);
    if(i===-1) return escapeHtml(t);
    return escapeHtml(t.slice(0,i))+'<mark class="hl">'+escapeHtml(t.slice(i,i+q.length))+'</mark>'+escapeHtml(t.slice(i+q.length));
  }

  function getQuery(){ return document.getElementById('searchInput').value.trim().toLowerCase(); }
  function isMobile(){ return window.matchMedia('(max-width:820px)').matches; }
  function isNativeApp(){
    try {
      return !!(document.documentElement.classList.contains('capacitor-native') ||
        (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()));
    } catch (e) {
      return false;
    }
  }
  function isTypingTarget(el){
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  function setOverlayOpen(id, open){
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.toggle('open', open);
    const anyOpen = document.querySelector('.overlay.open');
    document.body.classList.toggle('modal-open', Boolean(anyOpen));
    document.body.classList.toggle('add-screen-open', isMobile() && (
      document.getElementById('addOverlay')?.classList.contains('open') ||
      document.getElementById('thankYouOverlay')?.classList.contains('open')
    ));
    document.body.classList.toggle('native-page-open', isNativeApp() && (
      document.getElementById('filterSheetOverlay')?.classList.contains('open') ||
      document.getElementById('legendOverlay')?.classList.contains('open')
    ));
    if(id === 'addOverlay' && open){
      setOverlayOpen('promoOverlay', false);
    }
    if(id === 'detailOverlay' && !open){
      activeSpotId = null;
      setDocumentTitleForSpot(null);
      resetDetailSheetChrome();
    }
    if(!open || id === 'detailOverlay') syncUrlFromState();
  }

  let detailSheetSnap = 'peek';

  function resetDetailSheetChrome(){
    const overlay = document.getElementById('detailOverlay');
    const dialog = document.getElementById('detailDialog');
    overlay?.classList.remove('detail-snap-peek', 'detail-snap-expanded');
    if(dialog){
      dialog.classList.remove('is-dragging');
      dialog.style.height = '';
      dialog.style.removeProperty('--detail-h');
      dialog.style.removeProperty('--detail-drag');
    }
    detailSheetSnap = 'peek';
  }

  function offsetMapForDetailSheet(){
    if(!map || !isMobile()) return;
    const overlay = document.getElementById('detailOverlay');
    if(!overlay?.classList.contains('open')) return;
    const dialog = document.getElementById('detailDialog');
    const h = dialog?.getBoundingClientRect().height || 0;
    if(h < 40) return;
    map.panBy([0, Math.round(h * 0.42)], { animate: false });
  }

  function applyDetailSheetSnap(snap){
    const overlay = document.getElementById('detailOverlay');
    const dialog = document.getElementById('detailDialog');
    if(!overlay || !dialog) return;
    if(!isMobile() || !overlay.classList.contains('open')){
      resetDetailSheetChrome();
      return;
    }
    detailSheetSnap = snap === 'expanded' ? 'expanded' : 'peek';
    overlay.classList.toggle('detail-snap-peek', detailSheetSnap === 'peek');
    overlay.classList.toggle('detail-snap-expanded', detailSheetSnap === 'expanded');
    dialog.style.removeProperty('--detail-drag');
    const vh = window.innerHeight;
    const peekMax = Math.round(vh * 0.48);
    const expandedH = Math.round(vh * 0.88);
    if(detailSheetSnap === 'peek'){
      dialog.style.height = 'auto';
      const natural = Math.ceil(dialog.scrollHeight);
      dialog.style.height = Math.min(Math.max(natural, 168), peekMax) + 'px';
    } else {
      dialog.style.height = expandedH + 'px';
    }
    const content = document.getElementById('detailContent');
    if(content && detailSheetSnap === 'peek') content.scrollTop = 0;
    setTimeout(()=> offsetMapForDetailSheet(), 340);
  }

  function initDetailSheet(){
    const dialog = document.getElementById('detailDialog');
    const overlay = document.getElementById('detailOverlay');
    const handle = document.getElementById('detailSheetHandle');
    const content = document.getElementById('detailContent');
    if(!dialog || !overlay || !handle) return;

    let dragging = false;
    let pointerId = null;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let vel = 0;
    let startH = 0;
    let didDrag = false;

    function sheetOn(){
      return isMobile() && overlay.classList.contains('open');
    }

    function canDragFrom(target){
      if(!target || target.closest('a,button,input,textarea,select,label,summary')) return false;
      if(target.closest('#detailSheetHandle')) return true;
      if(target.closest('#detailContent')){
        if(detailSheetSnap === 'expanded' && content && content.scrollTop > 2) return false;
        return true;
      }
      return target === dialog || target.closest('#detailStickyFooter');
    }

    function peekMaxH(){ return Math.round(window.innerHeight * 0.48); }
    function expandedH(){ return Math.round(window.innerHeight * 0.88); }

    function beginDrag(y, id){
      dragging = true;
      pointerId = id;
      startY = y;
      lastY = y;
      lastT = performance.now();
      vel = 0;
      startH = dialog.getBoundingClientRect().height;
      didDrag = false;
      dialog.classList.add('is-dragging');
    }

    function moveDrag(y){
      if(!dragging) return;
      const now = performance.now();
      const dy = y - startY;
      if(Math.abs(dy) > 16) didDrag = true;
      vel = (y - lastY) / Math.max(8, now - lastT);
      lastY = y;
      lastT = now;
      if(dy >= 0){
        dialog.style.height = startH + 'px';
        dialog.style.setProperty('--detail-drag', dy + 'px');
        return;
      }
      dialog.style.removeProperty('--detail-drag');
      const next = Math.min(expandedH(), startH - dy);
      dialog.style.height = Math.max(peekMaxH() * 0.7, next) + 'px';
    }

    function finishDrag(){
      if(!dragging) return;
      dragging = false;
      dialog.classList.remove('is-dragging');
      dialog.style.removeProperty('--detail-drag');
      try{ if(typeof pointerId === 'number') dialog.releasePointerCapture(pointerId); }catch(e){}
      pointerId = null;
      const dy = lastY - startY;
      const flick = vel;
      if(detailSheetSnap === 'peek'){
        if(dy > 72 || flick > 0.55) setOverlayOpen('detailOverlay', false);
        else if(dy < -48 || flick < -0.45) applyDetailSheetSnap('expanded');
        else applyDetailSheetSnap('peek');
        return;
      }
      if(dy > 240 || (dy > 160 && flick > 1.2)) setOverlayOpen('detailOverlay', false);
      else if(dy > 80 || flick > 0.5) applyDetailSheetSnap('peek');
      else applyDetailSheetSnap('expanded');
    }

    dialog.addEventListener('pointerdown', e=>{
      if(!sheetOn() || !canDragFrom(e.target)) return;
      beginDrag(e.clientY, e.pointerId);
      try{ dialog.setPointerCapture(e.pointerId); }catch(err){}
    });
    dialog.addEventListener('pointermove', e=>{
      if(!dragging || e.pointerId !== pointerId) return;
      moveDrag(e.clientY);
    });
    dialog.addEventListener('pointerup', e=>{
      if(e.pointerId !== pointerId) return;
      finishDrag();
    });
    dialog.addEventListener('pointercancel', e=>{
      if(e.pointerId !== pointerId) return;
      finishDrag();
    });

    function touchStart(e){
      if(!sheetOn() || !canDragFrom(e.target) || !e.touches[0]) return;
      beginDrag(e.touches[0].clientY, 'touch');
    }
    function touchMove(e){
      if(!dragging || pointerId !== 'touch' || !e.touches[0]) return;
      e.preventDefault();
      moveDrag(e.touches[0].clientY);
    }
    function touchEnd(){
      if(pointerId !== 'touch') return;
      finishDrag();
    }
    [handle, dialog].forEach(el=>{
      el.addEventListener('touchstart', touchStart, {passive:true});
      el.addEventListener('touchmove', touchMove, {passive:false});
      el.addEventListener('touchend', touchEnd);
      el.addEventListener('touchcancel', touchEnd);
    });

    handle.addEventListener('click', e=>{
      if(!sheetOn() || didDrag) return;
      e.preventDefault();
      applyDetailSheetSnap(detailSheetSnap === 'peek' ? 'expanded' : 'peek');
    });
    handle.addEventListener('keydown', e=>{
      if(e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      applyDetailSheetSnap(detailSheetSnap === 'peek' ? 'expanded' : 'peek');
    });
  }

  function focusAddName(){
    /* iOS WKWebView zooms/pans the page if we focus an input on open. */
    if(document.documentElement.classList.contains('capacitor-native')) return;
    if(isMobile()) return;
    document.getElementById('addName')?.focus();
  }

  function openAddForm(source){
    resetAddForm();
    setAddScreenTitle('Suggest a spot');
    setOverlayOpen('addOverlay', true);
    focusAddName();
    if(typeof window.trackEvent === 'function'){
      window.trackEvent('bidetbud_add_open', { source: source || 'unknown' });
    }
    maybeShowPromo('intent');
  }

  function markPromoSeen(){
    try{ localStorage.setItem('bb_promo_seen', '1'); }catch(e){}
  }

  function promoLater(){
    try{ localStorage.setItem('bb_promo_later', String(Date.now() + 7 * 86400000)); }catch(e){}
    setOverlayOpen('promoOverlay', false);
  }

  function shouldShowPromoPopup(){
    try{
      if(localStorage.getItem('bb_promo_seen') === '1') return false;
      const later = parseInt(localStorage.getItem('bb_promo_later') || '0', 10);
      if(later && Date.now() < later) return false;
    }catch(e){}
    return true;
  }

  function maybeShowPromo(reason){
    if(isNativeApp()) return;
    if(!shouldShowPromoPopup()) return;
    if(document.querySelector('.overlay.open')) return;
    setOverlayOpen('promoOverlay', true);
    markPromoSeen();
    if(typeof window.trackEvent === 'function'){
      window.trackEvent('bidetbud_promo_show', { reason: reason || 'unknown' });
    }
  }

  function initPromoPopup(){
    document.getElementById('promoGotItBtn')?.addEventListener('click', ()=> dismissPromoPopup());
    document.getElementById('promoLaterBtn')?.addEventListener('click', ()=> promoLater());
    document.getElementById('promoClose')?.addEventListener('click', ()=> dismissPromoPopup());
    document.getElementById('promoOverlay')?.addEventListener('click', e=>{
      if(e.target.id === 'promoOverlay') dismissPromoPopup();
    });
  }

  function dismissPromoPopup(){
    setOverlayOpen('promoOverlay', false);
    markPromoSeen();
  }

  function showThankYou(){
    if(isNativeApp()){
      document.getElementById('thankYouContent').innerHTML =
        '<p class="thank-lead">Got it.</p><p class="sub">We review every submission before it goes on the map.</p>';
      setOverlayOpen('thankYouOverlay', true);
      return;
    }
    const shareUrl = encodeURIComponent(SITE_URL);
    const shareText = encodeURIComponent('We use BidetBud to find masajid and restaurants with bidets. Add spots your community should know about:');
    document.getElementById('thankYouContent').innerHTML =
      '<p class="sub">Thanks - we review every submission before it goes live. Share BidetBud with a group that would use it.</p>'+
      '<div class="dialog-actions share-actions">'+
      '<a class="btn btn-ghost" href="https://wa.me/?text='+shareText+'%20'+shareUrl+'" target="_blank" rel="noopener">WhatsApp</a>'+
      '<a class="btn btn-ghost" href="https://t.me/share/url?url='+shareUrl+'&text='+shareText+'" target="_blank" rel="noopener">Telegram</a>'+
      '<button type="button" class="btn btn-ghost" id="copySiteLink">Copy link</button>'+
      '</div>';
    setOverlayOpen('thankYouOverlay', true);
    document.getElementById('copySiteLink')?.addEventListener('click', ()=>{
      navigator.clipboard?.writeText(SITE_URL).then(()=> alert('Link copied!')).catch(()=>{});
    });
  }

  function setMobileView(view){
    document.querySelectorAll('.mobile-tab').forEach(t=>{
      const on = t.dataset.view === view;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.getElementById('appMain').classList.toggle('show-list', view === 'list');
    renderSearchPeek(lastFiltered);
    // Leaflet needs a fresh size after the map pane is shown again.
    if(map && view === 'map'){
      setTimeout(()=>safeInvalidateSize(), 40);
      setTimeout(()=>safeInvalidateSize(), 220);
    }
  }

  function updateMobileTabBadge(count){
    const badge = document.getElementById('listTabBadge');
    if(!badge) return;
    if(isMobile() && count > 0){
      badge.textContent = count > 999 ? '999+' : String(count);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function filterLocations(){
    const q = getQuery();
    return allLocations.filter(m=>{
      if(!validCoord(m)) return false;
      // Permanently closed: hide unless the visitor searches the name
      // (so "Zauo" still explains why it vanished).
      if(isClosed(m)){
        const named = q && (typeof matchesNameSearch === 'function' ? matchesNameSearch(m, q) : matchesSearch(m, q));
        if(!named) return false;
      }
      const isNone = NO_BIDET(m.bidetStatus);
      if(isNone){
        const named = q && (typeof matchesNameSearch === 'function' ? matchesNameSearch(m, q) : matchesSearch(m, q));
        if(!noBidetMode && !named) return false;
      } else if(!HAS_BIDET(m.bidetStatus)){
        return false;
      }
      if(placeFilter==='mosque' && m.type!=='mosque') return false;
      if(placeFilter==='restaurant' && m.type!=='restaurant') return false;
      if(placeFilter==='hotel' && m.type!=='hotel') return false;
      if(placeFilter==='public' && m.type!=='public') return false;
      // Status chips apply to every row (including none) so "User verified" +
      // "No-bidet too" does not keep unverified none pins visible.
      if(core.passesBidetStatusFilter){
        if(!core.passesBidetStatusFilter(m.bidetStatus, extraFilter)) return false;
      } else {
        if(extraFilter==='warmed' && m.bidetStatus!=='warmed') return false;
        if(extraFilter==='verified' && m.bidetStatus!=='verified') return false;
        if(extraFilter==='internet' && m.bidetStatus!=='internet') return false;
      }
      if(extraFilter==='public' && m.access!=='public') return false;
      if(extraFilter==='limited' && m.access!=='limited') return false;
      if(!allowLimitedAccess() && m.access==='limited' && !doesNotOperate(m)) return false;
      if(countryFilter && m.country !== countryFilter) return false;
      if(alongRoute){
        const dist = distToSegmentMi(
          { lat: +m.latitude, lng: +m.longitude },
          alongRoute.from,
          alongRoute.to
        );
        if(dist > ALONG_ROUTE_MI) return false;
      }
      if(q) return matchesSearch(m, q);
      return true;
    });
  }

  function formatBidetType(s){
    return core.formatBidetType ? core.formatBidetType(s) : String(s || '');
  }

  function statusTag(m){
    if(doesNotOperate(m)) return '';
    if(isClosed(m)) return '<span class="tag tag-closed">Closed</span>';
    if(m.bidetStatus==='none') return '<span class="tag tag-none">No bidet</span>';
    if(m.bidetStatus==='internet') return '<span class="tag tag-internet">Web</span>';
    if(m.bidetStatus==='warmed') return '<span class="tag tag-warmed">Heated</span>';
    return '<span class="tag tag-verified">Verified</span>';
  }

  function accessTag(m){
    if(doesNotOperate(m)) return '<span class="tag tag-unavailable">Unavailable</span>';
    if(m.access==='limited') return '<span class="tag tag-limited">Limited access</span>';
    return '';
  }

  function accessWarn(m){
    if(doesNotOperate(m)){
      return '<div class="access-warn access-warn--locked"><strong>BidetBud does not operate in this country</strong>This spot is locked and is not listed or verified here.</div>';
    }
    if(isClosed(m)){
      return '<div class="access-warn access-warn--closed"><strong>Permanently closed</strong>This spot is no longer open. We keep the pin so search still finds it.</div>';
    }
    if(m.access!=='limited') return '';
    return '<div class="access-warn"><strong>Limited access: not a public restroom</strong>'+escapeHtml(m.accessNote||'Hotel rooms, showrooms, and private clubs are not open to walk-in visitors.')+'</div>';
  }

  function typeLabel(t){ return t==='restaurant' ? 'Restaurant' : t==='hotel' ? 'Hotel' : t==='public' ? 'Public' : 'Masjid'; }

  function createIcon(m){
    if(doesNotOperate(m)){
      return L.divIcon({
        html:'<div class="marker-locked" aria-label="Locked">🔒</div>',
        className:'custom-marker custom-marker--locked', iconSize:[30,30], iconAnchor:[15,15], popupAnchor:[0,-15]
      });
    }
    if(isClosed(m)){
      return L.divIcon({
        html:'<div style="background:#a1a1aa;color:#fff;border:2.5px solid #fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.22);font-size:13px;font-weight:700;">-</div>',
        className:'custom-marker custom-marker--closed', iconSize:[30,30], iconAnchor:[15,15], popupAnchor:[0,-15]
      });
    }
    const status = m.bidetStatus;
    const access = m.access;
    let color = '#059669', emoji = '✓';
    if(status==='warmed'){ color = '#d97706'; emoji = '🔥'; }
    else if(status==='internet'){ color = '#2563eb'; emoji = '🌐'; }
    else if(status==='none'){ color = '#71717a'; emoji = '✕'; }
    if(access==='limited' && status!=='none'){ emoji = '🔒'; }
    const border = access==='limited' ? '2.5px dashed #fff' : '2.5px solid #fff';
    const ring = access==='limited' ? 'outline:2px dashed #fb923c;outline-offset:1px;' : '';
    return L.divIcon({
      html:'<div style="background:'+color+';color:#fff;border:'+border+';border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.22);font-size:13px;font-weight:700;'+ring+'">'+emoji+'</div>',
      className:'custom-marker', iconSize:[30,30], iconAnchor:[15,15], popupAnchor:[0,-15]
    });
  }

  const STATUS_RANK = { verified: 0, warmed: 1, internet: 2, none: 3 };

  // Anchor for "closest": the user's position when we have it, otherwise the
  // centre of what they're currently looking at.
  function distanceAnchor(){
    if(userLocation) return userLocation;
    if(map){
      const c = map.getCenter();
      return { lat: c.lat, lng: c.lng };
    }
    return null;
  }

  function sortedLocations(list){
    const q = getQuery();
    const anchor = sortMode === 'name' ? null : distanceAnchor();
    return [...list].sort((a,b)=>{
      if(q){
        const sa = searchScore(a, q), sb = searchScore(b, q);
        if(sa !== sb) return sb - sa;
      }
      if(a.access!==b.access){
        if(a.access==='public') return -1;
        if(b.access==='public') return 1;
      }
      if(sortMode === 'verified'){
        const ra = STATUS_RANK[a.bidetStatus] ?? 9, rb = STATUS_RANK[b.bidetStatus] ?? 9;
        if(ra !== rb) return ra - rb;
      }
      if(anchor){
        const da=haversineMiles(anchor,{lat:+a.latitude,lng:+a.longitude});
        const db=haversineMiles(anchor,{lat:+b.latitude,lng:+b.longitude});
        if(da !== db) return da-db;
      }
      return a.name.localeCompare(b.name);
    });
  }

  function cardStatusClass(m){
    if(doesNotOperate(m)) return 'card-unavailable';
    if(isClosed(m)) return 'card--closed';
    if(m.bidetStatus==='none') return 'card--none';
    if(m.access==='limited') return 'card-limited';
    if(m.bidetStatus==='internet') return 'card--internet';
    if(m.bidetStatus==='warmed') return 'card--warmed';
    return 'card--verified';
  }

  function emptyStateHtml(){
    let msg = 'No places match your filters.';
    let actions = '';
    if(placeFilter === 'mosque'){
      msg = 'No masajid match yet. Try another city or add a wudu-friendly spot you know.';
      actions = '<button type="button" class="btn btn-primary" id="emptyAddBtn">Add a spot</button>';
    } else {
      actions = '<button type="button" class="btn btn-primary" id="emptyAddBtn">Add a spot</button>';
    }
    const chips = POPULAR_CITIES.map(c=>'<button type="button" class="chip city-chip" data-city="'+escapeHtml(c)+'">'+escapeHtml(c)+'</button>').join('');
    return '<div class="empty"><p class="empty-title">No matches</p><p class="empty-sub">'+msg+'</p><div class="empty-chips">'+chips+'</div>'+actions+'</div>';
  }

  function wireEmptyStateActions(){
    document.getElementById('emptyAddBtn')?.addEventListener('click', ()=> openAddForm('empty_list'));
    document.getElementById('emptyWidenBtn')?.addEventListener('click', ()=>{
      radiusMi = 100;
      nearMeFitPending = true;
      updateFilterUi();
      refresh();
    });
    document.getElementById('emptyNoBidetBtn')?.addEventListener('click', ()=> setNoBidetMode(true));
    document.getElementById('emptyZoomOutBtn')?.addEventListener('click', ()=> fitMapToMatches());
    document.querySelectorAll('.city-chip').forEach(btn=>btn.addEventListener('click', ()=>{
      document.getElementById('searchInput').value = btn.dataset.city;
      hideSearchAc();
      saveRecentSearch(btn.dataset.city);
      refresh();
    }));
  }

  function renderList(filtered){
    const q=getQuery(), el=document.getElementById('locationList');
    el.classList.remove('location-list-loading');
    const verified = filtered.filter(m=>m.bidetStatus==='verified' && !doesNotOperate(m) && !isClosed(m)).length;
    const warmed = filtered.filter(m=>m.bidetStatus==='warmed' && !doesNotOperate(m) && !isClosed(m)).length;
    const internet = filtered.filter(m=>m.bidetStatus==='internet' && !doesNotOperate(m) && !isClosed(m)).length;
    const limited = filtered.filter(m=>m.access==='limited' && !doesNotOperate(m) && !isClosed(m)).length;
    const pub = filtered.filter(m=>m.access!=='limited' && !doesNotOperate(m) && !isClosed(m)).length;
    const masajid = filtered.filter(m=>m.type==='mosque').length;
    let countHtml;
    if(noBidetMode){
      const noneN = filtered.filter(m => NO_BIDET(m.bidetStatus)).length;
      countHtml = '<strong>'+filtered.length+'</strong> '+(filtered.length===1?'place':'places');
      if(noneN) countHtml += ' <span class="count-of-total">including '+noneN+' without a bidet</span>';
    } else if(placeFilter==='restaurant'){
      countHtml = '<strong>'+filtered.length+'</strong> '+(filtered.length===1?'restaurant':'restaurants')+' with bidets';
    } else if(placeFilter==='mosque'){
      countHtml = '<strong>'+filtered.length+'</strong> '+(filtered.length===1?'masjid':'masajid')+' with bidets';
    } else {
      countHtml = '<strong>'+filtered.length+'</strong> '+(filtered.length===1?'place':'places');
    }
    if(sortMode !== 'name') countHtml += ' nearest first';
    if(filtered.length > LIST_CAP){
      countHtml += ' <span class="count-of-total">showing '+LIST_CAP+' of '+filtered.length+'</span>';
    }
    const badges = [];
    if(masajid && placeFilter!=='mosque') badges.push(masajid+' masajid');
    const restaurants = filtered.filter(m=>m.type==='restaurant').length;
    if(restaurants && placeFilter!=='restaurant') badges.push(restaurants+' restaurants');
    // "open access" only says something when some results are guests-only.
    if(pub && limited && placeFilter==='all') badges.push(pub+' open access');
    if(limited) badges.push(limited+' guests only');
    if(verified) badges.push(verified+' verified');
    if(warmed) badges.push(warmed+' heated');
    if(internet) badges.push(internet+' web');
    if(badges.length && !isNativeApp()) countHtml += '<div class="count-badges">'+badges.map(b=>'<span class="count-badge">'+b+'</span>').join('')+'</div>';
    document.getElementById('countLabel').innerHTML = countHtml;
    updateMobileTabBadge(filtered.length);
    if(!filtered.length){
      el.innerHTML = emptyStateHtml();
      wireEmptyStateActions();
      updateNearMeHint(filtered);
      renderSearchPeek(filtered);
      return;
    }
    el.innerHTML = sortedLocations(filtered).slice(0, LIST_CAP).map(m=>{
      let dist='';
      const anchor = distanceAnchor();
      if(anchor && sortMode !== 'name') dist = formatDistance(haversineMiles(anchor,{lat:+m.latitude,lng:+m.longitude}));
      const locked = doesNotOperate(m);
      const closed = isClosed(m);
      const limitedNote = locked
        ? '<p class="card-note card-note--locked">BidetBud does not operate in this country</p>'
        : (closed
        ? '<p class="card-note card-note--closed">Permanently closed</p>'
        : (m.bidetStatus==='none'
        ? '<p class="card-note card-note--none">We checked: no bidet or handheld sprayer here.</p>'
        : (m.access==='limited' ? '<p class="card-note">'+escapeHtml(m.accessNote)+'</p>' : '')));
      const cardClass = 'card '+cardStatusClass(m)+(activeSpotId===m.id?' active':'');
      const typeIcon = typeLabel(m.type);
      const bidetLead = locked ? '' : '<p class="card-bidet-lead">'+escapeHtml(bidetLeadLabel(m))+'</p>';
      const trust = locked ? '' : '<p class="card-trust">'+escapeHtml(verificationPlainText(m))+'</p>';
      return '<article class="'+cardClass+'" data-id="'+m.id+'" tabindex="0" role="button" aria-label="'+escapeHtml(m.name)+'"><h3>'+highlight(m.name,q)+'</h3>'+bidetLead+'<div class="card-tags">'+statusTag(m)+accessTag(m)+'</div>'+(m.address?'<p class="addr">'+highlight(m.address,q)+'</p>':'')+(m.city?'<p class="loc">'+highlight(m.city,q)+(m.country?', '+highlight(m.country,q):'')+'</p>':'')+limitedNote+trust+'<div class="card-meta"><span class="tag tag-type">'+typeIcon+'</span>'+(dist?'<span class="dist card-foot">'+dist+'</span>':'')+'</div></article>';
    }).join('') + (filtered.length > LIST_CAP ? '<p class="sub list-cap-note">Showing the '+LIST_CAP+' closest. Search a city to narrow results.</p>' : '');
    el.querySelectorAll('.card').forEach((c, idx)=>{
      c.addEventListener('click',()=>{
        const m = allLocations.find(x => x.id === c.dataset.id);
        if(m) focusSpotOnMap(m);
        openDetail(c.dataset.id);
      });
      c.addEventListener('keydown', e=>{
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          c.click();
        }
      });
    });
    updateNearMeHint(filtered);
    renderSearchPeek(filtered);
  }

  const SEARCH_PEEK_CAP = 5;

  function hideSearchPeek(){
    const box = document.getElementById('searchPeek');
    if(box) box.hidden = true;
    document.body.classList.remove('search-peek-open');
  }

  function renderSearchPeek(filtered){
    const box = document.getElementById('searchPeek');
    if(!box) return;
    const q = getQuery();
    const onMap = !document.getElementById('appMain')?.classList.contains('show-list');
    const show = isMobile() && onMap && q.length >= 2;
    if(!show){
      hideSearchPeek();
      return;
    }
    const rows = sortedLocations(filtered || []).slice(0, SEARCH_PEEK_CAP);
    const countEl = document.getElementById('searchPeekCount');
    const listEl = document.getElementById('searchPeekList');
    const n = (filtered || []).length;
    if(countEl) countEl.textContent = n ? (n + (n === 1 ? ' place' : ' places')) : 'No matches';
    if(listEl){
      listEl.innerHTML = rows.map(m =>
        '<button type="button" class="search-peek-item'+(isClosed(m)?' search-peek-item--closed':NO_BIDET(m.bidetStatus)?' search-peek-item--none':'')+'" data-id="'+m.id+'">'+
        '<strong>'+highlight(m.name, q)+'</strong>'+
        '<span>'+escapeHtml([m.city, m.country].filter(Boolean).join(', '))+'</span>'+
        '</button>'
      ).join('');
      listEl.querySelectorAll('.search-peek-item').forEach(btn => {
        btn.addEventListener('click', () => {
          hideSearchAc();
          const m = allLocations.find(x => x.id === btn.dataset.id);
          if(m) focusSpotOnMap(m);
          openDetail(btn.dataset.id);
        });
      });
    }
    box.hidden = false;
    document.body.classList.add('search-peek-open');
  }

  function markersForMap(filtered){
    if(!filtered.length) return [];
    // Rank before capping so nearby / top search hits stay on the map when the
    // global set exceeds MAP_MARKER_CAP (seed-order slice used to drop them).
    const rank = (rows) => sortedLocations(rows);
    if(core.pickMapMarkers) return core.pickMapMarkers(filtered, MAP_MARKER_CAP, rank);
    if(filtered.length <= MAP_MARKER_CAP) return filtered;
    return rank(filtered).slice(0, MAP_MARKER_CAP);
  }

  function renderMap(filtered){
    if(!clusterGroup) return;
    clusterGroup.clearLayers();
    markerById.clear();
    const mapRows = markersForMap(filtered);
    const markers = mapRows.map(m=>{
      const marker = L.marker([+m.latitude,+m.longitude],{icon:createIcon(m)});
      marker.on('click',()=>{
        scrollToListCard(m.id);
        openDetail(m.id);
      });
      if(!isNativeApp()){
        const tip = stripEmDash(
          doesNotOperate(m) ? m.name + ' (unavailable)' :
          (m.access==='limited' ? m.name + ' (limited access)' : m.name)
        );
        marker.bindTooltip(tip,{direction:'top',offset:[0,-12]});
      }
      markerById.set(m.id, marker);
      return marker;
    });
    clusterGroup.addLayers(markers);
    if(highlightedMarkerId && markerById.has(highlightedMarkerId)){
      highlightMarker(highlightedMarkerId);
    }
    updateUserMarker();
    const shouldFit = !initialBoundsDone && filtered.length && !getQuery() && !nearMe && !activeSpotId && !isNativeApp();
    if(isNativeApp() && !initialBoundsDone) initialBoundsDone = true;
    if(shouldFit){
      const bounds = L.latLngBounds(filtered.map(m=>[+m.latitude,+m.longitude]));
      if(bounds.isValid()){
        markAutoFit();
        const maxZoom = countryFilter ? 8 : 4;
        map.fitBounds(bounds.pad(0.1), { maxZoom, animate: false });
        if(map.getZoom() < MAP_MIN_ZOOM) map.setZoom(MAP_MIN_ZOOM);
        initialBoundsDone = true;
      }
    }
  }

  const REPORT_REASONS = [
    "This place doesn't have a bidet",
    'Permanently closed',
    'Wrong location / pin is off',
    'Wrong address or details',
    'Duplicate listing',
    'Other'
  ];

  function reportFormHtml(m){
    const options = REPORT_REASONS.map(r =>
      '<option value="'+escapeHtml(r)+'">'+escapeHtml(r)+'</option>').join('');
    return ''+
      '<details class="report-box">'+
        '<summary>Report incorrect pin</summary>'+
        '<form class="report-form form" novalidate>'+
          '<label for="reportReason">What\'s wrong?</label>'+
          '<select id="reportReason" name="reason">'+options+'</select>'+
          '<label for="reportNote">Details (optional)</label>'+
          '<textarea id="reportNote" name="note" placeholder="Anything that helps us fix it"></textarea>'+
          '<div class="dialog-actions">'+
            '<button type="submit" class="btn btn-primary js-report-submit">Send report</button>'+
          '</div>'+
          '<p class="report-status" role="status" aria-live="polite" hidden></p>'+
        '</form>'+
      '</details>';
  }

  async function submitReport(m, reason, note){
    if(!WEB3FORMS_ACCESS_KEY || WEB3FORMS_ACCESS_KEY === 'YOUR_WEB3FORMS_ACCESS_KEY'){
      throw new Error('Reporting is not set up yet.');
    }
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: WEB3FORMS_ACCESS_KEY,
        subject: 'BidetBud report: ' + m.name,
        from_name: 'BidetBud report',
        reason: reason,
        details: note || '(none)',
        spot_name: m.name,
        spot_id: m.id,
        address: m.address,
        city: m.city,
        country: m.country,
        maps_link: 'https://www.google.com/maps/search/?api=1&query=' + m.latitude + ',' + m.longitude,
        spot_link: spotShareUrl(m.id)
      })
    });
    const data = await res.json().catch(() => ({}));
    if(!res.ok || data.success === false){
      throw new Error(data.message || 'Could not send report. Try again in a moment.');
    }
    return true;
  }

  function wireReportForm(container, m){
    const form = container.querySelector('.report-form');
    if(!form) return;
    const status = form.querySelector('.report-status');
    const submitBtn = form.querySelector('.js-report-submit');
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const reason = form.querySelector('#reportReason').value;
      const note = form.querySelector('#reportNote').value.trim();
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      status.hidden = true;
      status.classList.remove('is-error','is-ok');
      try {
        await submitReport(m, reason, note);
        status.textContent = 'Thanks. Report sent. We\'ll take a look.';
        status.classList.add('is-ok');
        status.hidden = false;
        form.querySelector('#reportNote').value = '';
        submitBtn.textContent = 'Sent';
        if(typeof window.trackEvent === 'function') window.trackEvent('bidetbud_report', { id: m.id, reason });
      } catch(err){
        status.textContent = err.message || 'Could not send report.';
        status.classList.add('is-error');
        status.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send report';
      }
    });
  }

  function wireDetailButtons(root, m, shareLink){
    if(!root) return;
    root.querySelector('.js-copy-spot-link')?.addEventListener('click', ()=>{
      if(navigator.share){
        navigator.share({ title: m.name, url: shareLink, text: m.name }).catch(function(){});
        return;
      }
      navigator.clipboard?.writeText(shareLink).then(()=> alert('Link copied!')).catch(()=> prompt('Copy link:', shareLink));
    });
    root.querySelector('.js-copy-address')?.addEventListener('click', ()=>{
      const txt = [m.name, m.address, m.city].filter(Boolean).join(', ');
      navigator.clipboard?.writeText(txt).then(()=> alert('Address copied!')).catch(()=>{});
    });
    root.querySelector('.js-report-no-bidet')?.addEventListener('click', ()=>{
      setOverlayOpen('detailOverlay', false);
      openAddFormPrefill(m, true);
    });
    root.querySelector('.js-suggest-update')?.addEventListener('click', ()=>{
      setOverlayOpen('detailOverlay', false);
      openAddFormPrefill(m, NO_BIDET(m.bidetStatus));
    });
    root.querySelector('.js-open-report')?.addEventListener('click', ()=>{
      const box = document.querySelector('#detailContent .report-box');
      if(box){
        box.open = true;
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    wireMapsLinks(root);
  }

  function openDetail(id, fromUrl){
    const local = allLocations.find(x=>x.id===id);
    if(local){
      renderDetail(local, id, fromUrl);
      return;
    }
    const api = window.BidetBudMapApi;
    if(!api || !api.loadSpot) return;
    api.loadSpot(id).then(spot=>{
      if(!spot) return;
      initData();
      const m = allLocations.find(x=>x.id===id) || normalizeSeed(spot);
      renderDetail(m, id, fromUrl);
    }).catch(()=>{});
  }

  function renderDetail(m, id, fromUrl){
    if(!m) return;
    activeSpotId = id;
    focusSpotOnMap(m);
    scrollToListCard(id);
    setDocumentTitleForSpot(m);
    const mobile = isMobile();
    const distLine = (nearMe && userLocation)
      ? '<p class="sub">' + formatDistance(haversineMiles(userLocation, { lat: +m.latitude, lng: +m.longitude })) + ' away</p>'
      : '';
    const locked = doesNotOperate(m);
    const source = (!locked && m.sourceUrl) ? '<p class="detail-source"><a href="'+escapeHtml(m.sourceUrl)+'" target="_blank" rel="noopener">View source ↗</a></p>' : '';
    const quote = (!locked && m.sourceQuote) ? '<blockquote class="source-quote"><strong>Review excerpt</strong>'+escapeHtml(m.sourceQuote)+'</blockquote>' : '';
    const verifyText = locked ? '' : verificationPlainText(m);
    const trustLine = locked ? '' : trustSourceLine(m);
    const trustHtml = (trustLine && trustLine !== verifyText)
      ? '<p class="detail-trust detail-trust--source">'+escapeHtml(trustLine)+'</p>'
      : '';
    const shareLink = spotShareUrl(id);
    const directionsUrl = mapsDirectionsUrl(m);
    const appleMaps = 'https://maps.apple.com/?daddr='+encodeURIComponent([m.name, m.address].filter(Boolean).join(', '));
    const googleMaps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([m.name, m.address, m.city].filter(Boolean).join(', '));
    const mapsBtn = isIOS()
      ? '<a class="btn btn-ghost" href="'+appleMaps+'" target="_blank" rel="noopener">Apple Maps</a>'
      : '<a class="btn btn-ghost" href="'+googleMaps+'" target="_blank" rel="noopener">Open in Maps</a>';

    const stickyFooter = document.getElementById('detailStickyFooter');
    if(stickyFooter){
      if(mobile){
        stickyFooter.innerHTML = locked
          ? ''
          : (
          '<div class="detail-footer-actions">'+
          '<a class="btn btn-primary" href="'+directionsUrl+'" target="_blank" rel="noopener">'+(isIOS() ? 'Apple Maps' : 'Directions')+'</a>'+
          '</div>'+
          '<div class="detail-footer-links">'+
          '<button type="button" class="detail-link-btn js-copy-spot-link">Share</button>'+
          '<span class="detail-footer-sep" aria-hidden="true">·</span>'+
          '<button type="button" class="detail-link-btn js-copy-address">Copy</button>'+
          '<span class="detail-footer-sep" aria-hidden="true">·</span>'+
          '<button type="button" class="detail-link-btn js-suggest-update">Update</button>'+
          '<span class="detail-footer-sep" aria-hidden="true">·</span>'+
          '<button type="button" class="detail-link-btn '+(isNativeApp() ? 'js-open-report' : 'js-report-no-bidet')+'">Report</button>'+
          '</div>');
        stickyFooter.hidden = locked || false;
        if(!locked) wireDetailButtons(stickyFooter, m, shareLink);
      } else {
        stickyFooter.innerHTML = '';
        stickyFooter.hidden = true;
      }
    }

    const desktopActions = locked
      ? ''
      : (
      '<div class="dialog-actions detail-actions detail-actions--desktop">'+
      '<a class="btn btn-primary" href="'+directionsUrl+'" target="_blank" rel="noopener">'+(isIOS() ? 'Apple Maps' : 'Directions')+'</a>'+
      (isIOS() ? '' : mapsBtn)+
      '<button type="button" class="btn btn-ghost js-copy-spot-link">Share spot</button>'+
      '<button type="button" class="btn btn-ghost js-copy-address">Copy address</button>'+
      '<button type="button" class="btn btn-ghost js-suggest-update">Suggest an update</button>'+
      '<button type="button" class="btn btn-ghost js-report-no-bidet">Report no bidet here</button>'+
      '</div>');

    const nativeTitle = document.getElementById('detailNativeTitle');
    if(nativeTitle) nativeTitle.textContent = m.name;
    document.getElementById('detailContent').innerHTML =
      '<h2>'+escapeHtml(m.name)+'</h2>'+
      '<p class="sub">'+escapeHtml(typeLabel(m.type))+' · '+escapeHtml(m.city)+', '+escapeHtml(m.country)+'</p>'+
      distLine+
      (locked ? '' : '<p class="detail-bidet-callout">'+escapeHtml(bidetLeadLabel(m))+'</p>')+
      (isClosed(m) && !locked ? '' : (m.bidetStatus==='none' && !locked ? '<div class="access-warn access-warn--none"><strong>No bidet here</strong>We\'ve recorded this spot as not having a bidet or handheld sprayer. Bring your own if you need one.</div>' : ''))+
      accessWarn(m)+
      (locked ? '' : '<p class="detail-address">'+escapeHtml(m.address)+'</p>')+
      '<div class="row">'+statusTag(m)+accessTag(m)+'</div>'+
      (locked ? '' : (
      '<div class="detail-sheet-more">'+
      '<p class="detail-trust">'+escapeHtml(verifyText)+'</p>'+
      (isClosed(m) ? '' : trustHtml+quote+source)+
      reportFormHtml(m)+
      '</div>'))+
      (mobile ? '' : desktopActions);
    const content = document.getElementById('detailContent');
    wireDetailButtons(content, m, shareLink);
    wireDetailButtons(document.getElementById('detailStickyFooter'), m, shareLink);
    wireReportForm(content, m);
    const keepSnap = fromUrl ? detailSheetSnap : 'peek';
    setOverlayOpen('detailOverlay', true);
    if(isMobile()) applyDetailSheetSnap(keepSnap);
    else resetDetailSheetChrome();
    syncUrlFromState();
    if(typeof window.trackEvent === 'function' && !fromUrl){
      window.trackEvent('bidetbud_spot_open', { id: id });
    }
  }

  let detailLayoutTimer;
  window.addEventListener('resize', ()=>{
    clearTimeout(detailLayoutTimer);
    detailLayoutTimer = setTimeout(()=>{
      const ov = document.getElementById('detailOverlay');
      if(activeSpotId && ov?.classList.contains('open')) openDetail(activeSpotId, true);
    }, 120);
  });

  function markAutoFit(ms = 450){
    autoFitUntil = Date.now() + ms;
  }

  function rowsWithinRadius(rows){
    if(!nearMe || !userLocation) return rows;
    return rows.filter(m => haversineMiles(userLocation, { lat: +m.latitude, lng: +m.longitude }) <= radiusMi);
  }

  function onUserMapViewChange(){
    if(zoomDragLock) return;
    if(Date.now() < autoFitUntil) return;
    scheduleMapRefresh();
  }

  function fitMapToMatches(){
    if(!map || !lastFiltered.length) return;
    const bounds = L.latLngBounds(lastFiltered.map(m=>[+m.latitude,+m.longitude]));
    if(bounds.isValid()){
      markAutoFit();
      map.fitBounds(bounds.pad(0.1), { maxZoom: 4, animate: !(isIOS() || isNativeApp()) });
      refresh();
    }
  }

  // City queries often match a brand elsewhere (TOTO "Richardson Nice").
  // Fit the top-scoring cluster; chain queries prefer the branch near the map/user.
  function fitSearchRows(rows, q){
    if(typeof searchFitRows === 'function') return searchFitRows(rows, q, distanceAnchor());
    return rows.slice(0, 25);
  }

  function fitToSearchResults(rows){
    if(!map || !rows.length || nearMe || activeSpotId) return false;
    const q = getQuery();
    const key = q + '|' + placeFilter + '|' + (extraFilter||'') + '|' + (countryFilter||'');
    if(!q || key === lastFitKey) return false;
    lastFitKey = key;
    const fitRows = fitSearchRows(rows, q);
    const bounds = L.latLngBounds(fitRows.map(m=>[+m.latitude,+m.longitude]));
    if(!bounds.isValid()) return false;
    markAutoFit();
    map.fitBounds(bounds.pad(0.25), { maxZoom: 14, animate: false });
    return true;
  }

  function refresh(){
    lastFiltered = filterLocations();
    totalMatchCount = lastFiltered.length;
    if(!getQuery()) lastFitKey = null;
    fitToSearchResults(lastFiltered);
    renderList(lastFiltered);
    renderMap(lastFiltered);
    if(nearMeFitPending && nearMe && userLocation){
      nearMeFitPending = false;
      const pins = lastFiltered;
      fitNearMeView(pins);
      if(map){
        setTimeout(()=>{
          safeInvalidateSize();
          fitNearMeView(pins);
        }, 0);
      }
    }
    updateFilterUi();
    updateUserMarker();
    syncUrlFromState();
  }

  function scheduleRefresh(){
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(()=>{ refreshTimer = null; refresh(); }, 220);
  }

  function scheduleMapRefresh(){
    clearTimeout(mapMoveTimer);
    mapMoveTimer = setTimeout(()=>{
      mapMoveTimer = null;
      if(!clusterGroup || !lastFiltered.length) return;
      renderList(lastFiltered);
      syncUrlFromState();
    }, 180);
  }

  function resetAddForm(){
    ['addName','addAddress','addNotes','addUpdateOf'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.value='';
    });
    const errEl = document.getElementById('addFormError');
    if(errEl){ errEl.textContent = ''; errEl.hidden = true; }
    const more = document.getElementById('addMoreDetails');
    if(more) more.open = false;
    clearAddPhoto();
    setAddHasBidet('verified');
    setAddScreenTitle('Suggest a spot');
    setAddUpdateBanner(null);
    const dupes = document.getElementById('addDupes');
    if(dupes){ dupes.innerHTML = ''; dupes.hidden = true; }
  }

  function getAddHasBidet(){
    return document.getElementById('addHasBidet')?.value || 'verified';
  }

  let addPhotoBlob = null;
  let addPhotoObjectUrl = '';
  let addDupeTimer = null;

  function clearAddPhoto(){
    addPhotoBlob = null;
    if(addPhotoObjectUrl){
      URL.revokeObjectURL(addPhotoObjectUrl);
      addPhotoObjectUrl = '';
    }
    const fileEl = document.getElementById('addPhotoFile');
    if(fileEl) fileEl.value = '';
    const preview = document.getElementById('addPhotoPreview');
    const thumb = document.getElementById('addPhotoThumb');
    const btn = document.getElementById('addPhotoBtn');
    if(preview) preview.hidden = true;
    if(thumb) thumb.removeAttribute('src');
    if(btn){
      const label = btn.querySelector('.add-photo-label');
      if(label) label.textContent = 'Add a photo';
      else btn.textContent = 'Add a photo';
    }
  }

  function setAddPhotoFromBlob(blob){
    if(!blob){ clearAddPhoto(); return; }
    addPhotoBlob = blob;
    if(addPhotoObjectUrl) URL.revokeObjectURL(addPhotoObjectUrl);
    addPhotoObjectUrl = URL.createObjectURL(blob);
    const preview = document.getElementById('addPhotoPreview');
    const thumb = document.getElementById('addPhotoThumb');
    const btn = document.getElementById('addPhotoBtn');
    if(thumb) thumb.src = addPhotoObjectUrl;
    if(preview) preview.hidden = false;
    if(btn){
      const label = btn.querySelector('.add-photo-label');
      if(label) label.textContent = 'Replace photo';
      else btn.textContent = 'Replace photo';
    }
    const more = document.getElementById('addMoreDetails');
    if(more) more.open = true;
  }

  function blobFromBase64(b64, mime){
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime || 'image/jpeg' });
  }

  function blobFromNativePhoto(photo){
    if(!photo) return Promise.resolve(null);
    if(photo.base64String){
      return Promise.resolve(blobFromBase64(photo.base64String, photo.format === 'png' ? 'image/png' : 'image/jpeg'));
    }
    const src = photo.webPath || photo.path;
    if(!src) return Promise.resolve(null);
    return fetch(src).then(function(res){ return res.ok ? res.blob() : null; }).catch(function(){ return null; });
  }

  function isNativePhotoCancel(err){
    const msg = err && err.message ? String(err.message) : '';
    return /cancel/i.test(msg);
  }

  async function pickAddPhoto(){
    const Camera = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Camera;
    const platform = window.Capacitor && typeof window.Capacitor.getPlatform === 'function'
      ? window.Capacitor.getPlatform()
      : 'web';
    if(Camera){
      try {
        // Android: system photo picker only - no READ_MEDIA_IMAGES / READ_MEDIA_VIDEO.
        if(platform === 'android' && typeof Camera.pickImages === 'function'){
          const gallery = await Camera.pickImages({ quality: 70, limit: 1 });
          const blob = await blobFromNativePhoto(gallery && gallery.photos && gallery.photos[0]);
          if(blob) setAddPhotoFromBlob(blob);
          return;
        }
        if(typeof Camera.getPhoto === 'function'){
          const photo = await Camera.getPhoto({
            quality: 70,
            allowEditing: false,
            resultType: 'base64',
            source: 'PROMPT',
            saveToGallery: false
          });
          const blob = await blobFromNativePhoto(photo);
          if(blob) setAddPhotoFromBlob(blob);
          return;
        }
      } catch (err) {
        if(isNativePhotoCancel(err)) return;
      }
    }
    document.getElementById('addPhotoFile')?.click();
  }

  function findAddDuplicates(name){
    const q = (name || '').trim();
    if(q.length < 3 || typeof searchScore !== 'function') return [];
    const skipId = document.getElementById('addUpdateOf')?.value || '';
    return allLocations
      .filter(m => m && m.id !== skipId)
      .map(m => ({ m, score: searchScore(m, q) }))
      .filter(x => x.score >= 70)
      .sort((a,b) => b.score - a.score)
      .slice(0, 3)
      .map(x => x.m);
  }

  function renderAddDuplicates(){
    const box = document.getElementById('addDupes');
    if(!box) return;
    const name = document.getElementById('addName')?.value || '';
    const hits = findAddDuplicates(name);
    if(!hits.length){
      box.innerHTML = '';
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML = '<p class="add-dupe-hint">Already on the map - tap to open</p>' + hits.map(m =>
      '<button type="button" class="add-dupe" data-id="'+escapeHtml(m.id)+'">'+
      '<strong>'+escapeHtml(m.name)+'</strong>'+
      '<span>'+escapeHtml([m.city, m.country].filter(Boolean).join(', '))+'</span>'+
      '</button>'
    ).join('');
  }

  async function submitViaWeb3Forms(payload){
    if(!WEB3FORMS_ACCESS_KEY || WEB3FORMS_ACCESS_KEY === 'YOUR_WEB3FORMS_ACCESS_KEY'){
      throw new Error('Submissions are not set up yet.');
    }
    const noBidet = payload.bidetStatus === 'none';
    const mapsQuery = [payload.name, payload.address].filter(Boolean).join(', ');
    const body = {
      access_key: WEB3FORMS_ACCESS_KEY,
      subject: noBidet ? 'BidetBud: no bidet report' : 'BidetBud: new verified spot',
      from_name: 'BidetBud',
      name: payload.name,
      email: 'noreply@bidetbud.com',
      address: payload.address || '(not provided)',
      bidet_status: noBidet ? 'no bidet' : 'has bidet',
      notes: payload.notes || '(none)',
      photo_link: payload.photoFile ? '(photo attached)' : '(none)',
      update_of: payload.updateOf || '(new spot)',
      lookup_link: mapsQuery
        ? ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapsQuery))
        : '(none)',
      botcheck: ''
    };
    let res;
    if(payload.photoFile){
      const fd = new FormData();
      Object.keys(body).forEach(k => fd.append(k, body[k]));
      fd.append('attachment', payload.photoFile, payload.photoName || 'spot.jpg');
      res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: fd
      });
    } else {
      res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      });
    }
    const data = await res.json().catch(() => ({}));
    if(!res.ok || data.success === false){
      throw new Error(data.message || 'Submission failed. Try again in a moment.');
    }
    return true;
  }

  function shouldShadeBidetFriendly(feature){
    if(core.shouldShadeBidetFriendly){
      return core.shouldShadeBidetFriendly(feature, BIDET_FRIENDLY_GEO_NAMES, new Set(FRIENDLY_SHADE_EXCLUDE_GEO));
    }
    const name = geoCountryName(feature);
    if(!name || FRIENDLY_SHADE_EXCLUDE_GEO.has(name)) return false;
    return BIDET_FRIENDLY_GEO_NAMES.has(name);
  }

  function geoCountryName(feature){
    if(core.geoCountryName) return core.geoCountryName(feature);
    const p = feature.properties || {};
    return p.ADMIN || p.name || p.NAME || p.name_long || '';
  }

  function bidetCountryStyle(feature){
    if(!shouldShadeBidetFriendly(feature)){
      return { fillOpacity: 0, opacity: 0, weight: 0, interactive: false };
    }
    return { fillColor: '#34d399', fillOpacity: 0.42, color: '#059669', weight: 1.25, opacity: 0.9 };
  }

  function onBidetCountryFeature(feature, layer){
    const name = geoCountryName(feature);
    if(!shouldShadeBidetFriendly(feature)) return;
    layer.bindTooltip(stripEmDash(name) + ': bidet-friendly country', {
      sticky: true,
      direction: 'top',
      className: 'bidet-country-tip'
    });
    layer.on({
      mouseover(e){ e.target.setStyle({ fillOpacity: 0.58, weight: 2 }); },
      mouseout(e){ if(countriesLayer) countriesLayer.resetStyle(e.target); }
    });
  }

  function loadBidetFriendlyCountries(){
    fetch(BIDET_COUNTRY_GEOJSON_URL)
      .then(res => {
        if(!res.ok) throw new Error('Country boundaries unavailable');
        return res.json();
      })
      .then(geo => {
        if(!map) return;
        if(countriesLayer) map.removeLayer(countriesLayer);
        countriesLayer = L.geoJSON(geo, {
          style: bidetCountryStyle,
          onEachFeature: onBidetCountryFeature,
          pane: 'countriesPane'
        }).addTo(map);
      })
      .catch(err => console.warn('Bidet-friendly country layer:', err));
  }

  function showLoadToast(){}

  function hideSearchAc(){ document.getElementById('searchAc')?.setAttribute('hidden',''); }

  let searchAcPicking = false;

  function updateSearchClearBtn(){
    const btn = document.getElementById('searchClear');
    const input = document.getElementById('searchInput');
    if(!btn || !input) return;
    const on = !!input.value.trim();
    btn.hidden = !on;
    btn.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  function applySearchAcChoice(btn){
    if(!btn) return;
    const value = btn.dataset.value || '';
    const id = btn.dataset.id || '';
    const input = document.getElementById('searchInput');
    if(input) input.value = value;
    searchAcPicking = true;
    hideSearchAc();
    updateSearchClearBtn();
    if(value) saveRecentSearch(value);
    lastFitKey = null;
    if(id){
      refresh();
      if(isMobile()) setMobileView('map');
      openDetail(id);
    } else {
      refresh();
      // City / free-text: list is the readable result surface on phones.
      if(isMobile() && value) setMobileView('list');
    }
    maybeShowPromo('search');
    setTimeout(()=>{ searchAcPicking = false; }, 320);
  }

  function renderSearchAc(){
    const q = getQuery();
    const box = document.getElementById('searchAc');
    searchAcIndex = -1;
    updateSearchClearBtn();
    if(!box) return;
    if(!q){
      const recent = getRecentSearches();
      const items = [];
      if(recent.length){
        items.push('<div class="search-ac-section">Recent</div>');
        recent.forEach(r => {
          items.push('<button type="button" class="search-ac-item" data-value="'+escapeHtml(r)+'"><span class="search-ac-label">'+escapeHtml(r)+'</span></button>');
        });
      }
      items.push('<div class="search-ac-section">Popular</div>');
      POPULAR_CITIES.slice(0, 6).forEach(c => {
        items.push('<button type="button" class="search-ac-item" data-value="'+escapeHtml(c)+'"><span class="search-ac-label">'+escapeHtml(c)+'</span><span class="search-ac-hint">City</span></button>');
      });
      box.innerHTML = items.join('');
      box.removeAttribute('hidden');
      wireSearchAcItems(box);
      return;
    }
    if(q.length < 2){ hideSearchAc(); return; }
    if(!allLocations.length){
      box.innerHTML = '<div class="search-ac-section">Still loading places…</div>';
      box.removeAttribute('hidden');
      return;
    }
    const nq = normalizeSearchText(q);
    const placeMatches = allLocations
      .filter(m => matchesSearch(m, q))
      .sort((a, b) => searchScore(b, q) - searchScore(a, q))
      .slice(0, 6);
    const cityMatches = [...new Set(
      allLocations
        .filter(m => m.city && (typeof cityMatchesQuery === 'function'
          ? cityMatchesQuery(m.city, q)
          : (normalizeSearchText(m.city) === nq)))
        .map(m => m.city.split(',')[0].trim())
    )].slice(0, 3);
    const items = [];
    placeMatches.forEach(m => {
      const city = m.city ? m.city.split(',')[0].trim() : '';
      const hint = doesNotOperate(m)
        ? ('Unavailable' + (city ? ' · ' + city : ''))
        : ((m._search && m._search.acronym ? m._search.acronym.toUpperCase() : '') + (city ? ' · ' + city : ''));
      items.push({
        fill: m.name,
        label: m.name,
        hint,
        id: m.id
      });
    });
    cityMatches.forEach(c => {
      if(!items.some(i => i.fill === c && !i.id)) items.push({ fill: c, label: c, hint: 'City' });
    });
    if(!items.length){ hideSearchAc(); return; }
    box.innerHTML = items.slice(0, 8).map(it =>
      '<button type="button" class="search-ac-item" data-value="'+escapeHtml(it.fill)+'"'+(it.id ? ' data-id="'+escapeHtml(it.id)+'"' : '')+'>'+
      '<span class="search-ac-label">'+highlight(it.label, q)+'</span>'+
      (it.hint ? '<span class="search-ac-hint">'+escapeHtml(it.hint)+'</span>' : '')+
      '</button>'
    ).join('');
    box.removeAttribute('hidden');
    wireSearchAcItems(box);
  }

  function wireSearchAcItems(box){
    // pointerdown beats iOS blur-before-click, which used to swallow taps.
    box.querySelectorAll('.search-ac-item').forEach(btn=>{
      btn.addEventListener('pointerdown', (e)=>{
        if(e.button != null && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        applySearchAcChoice(btn);
      });
    });
  }

  function moveSearchAc(delta){
    const box = document.getElementById('searchAc');
    if(!box || box.hasAttribute('hidden')) return;
    const items = [...box.querySelectorAll('.search-ac-item')];
    if(!items.length) return;
    searchAcIndex = Math.max(0, Math.min(items.length - 1, searchAcIndex + delta));
    items.forEach((it, i) => it.classList.toggle('active', i === searchAcIndex));
    items[searchAcIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function selectSearchAcIndex(){
    const box = document.getElementById('searchAc');
    if(!box || searchAcIndex < 0) return false;
    const items = box.querySelectorAll('.search-ac-item');
    const btn = items[searchAcIndex];
    if(btn){
      applySearchAcChoice(btn);
      return true;
    }
    return false;
  }

  function initPullRefresh(){
    const el = document.getElementById('locationList');
    if(!el) return;
    let startY = 0, pulling = false;
    el.addEventListener('touchstart', e=>{ if(el.scrollTop <= 0) startY = e.touches[0].clientY; }, {passive:true});
    el.addEventListener('touchmove', e=>{
      if(el.scrollTop > 0) return;
      const dy = e.touches[0].clientY - startY;
      if(dy > 70) pulling = true;
    }, {passive:true});
    el.addEventListener('touchend', ()=>{
      if(!pulling){ pulling = false; return; }
      pulling = false;
      if(nearMe && navigator.geolocation){
        navigator.geolocation.getCurrentPosition(pos=>{
          userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          applyDistanceUnits();
          nearMeFitPending = true;
          refresh();
        }, ()=> refresh());
      } else {
        refresh();
      }
    }, {passive:true});
  }

  function safeInvalidateSize(){
    if(!map || zoomDragLock || Date.now() < zoomQuietUntil) return;
    map.invalidateSize({ animate: false, pan: false });
  }

  function queueInvalidateSize(delay = 250){
    clearTimeout(invalidateTimer);
    const wait = Math.max(delay, Math.max(0, zoomQuietUntil - Date.now()) + 40);
    invalidateTimer = setTimeout(()=>{
      invalidateTimer = 0;
      safeInvalidateSize();
    }, wait);
  }

  function enableDoubleTapDragZoom(leafletMap){
    // Google/Apple Maps: tap, then tap-and-drag vertically to zoom around
    // that point. On iOS, changing Leaflet zoom every frame reloads tiles and
    // the map jumps; preview with a CSS scale, then commit once on finger-up.
    if(leafletMap.doubleClickZoom) leafletMap.doubleClickZoom.disable();
    const iosLike = isIOS() || isNativeApp();
    // Keep Leaflet pinch disabled - custom CSS-scale preview avoids tile thrash
    // on iOS WKWebView. Pan still uses Leaflet dragging.
    if(leafletMap.touchZoom) leafletMap.touchZoom.disable();
    const container = leafletMap.getContainer();
    container.style.touchAction = 'none';
    container.classList.add('leaflet-touch-drag', 'leaflet-touch-zoom');

    const TAP_MS = 550;
    const TAP_PX = 64;
    const PX_PER_ZOOM = 90;
    let lastUpAt = 0;
    let lastUpPoint = null;
    let dragging = false;
    let moved = false;
    let startY = 0;
    let startZoom = 0;
    let pendingZoom = 0;
    let around = null;
    let savedSnap = leafletMap.options.zoomSnap;
    let raf = 0;
    let pinch = null;
    let previewPos = null;

    function touchPoint(touch){
      const rect = container.getBoundingClientRect();
      return L.point(touch.clientX - rect.left, touch.clientY - rect.top);
    }

    function eventPoint(e){
      const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
      return { pt: touchPoint(t), y: t.clientY };
    }

    function onMap(e){
      const t = e.target;
      return t === container || (t && container.contains(t));
    }

    function clampZoom(z){
      return Math.max(leafletMap.getMinZoom(), Math.min(leafletMap.getMaxZoom(), z));
    }

    function steal(e){
      if(e.cancelable) e.preventDefault();
      e.stopPropagation();
      if(typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    }

    function mapPane(){
      return leafletMap._mapPane;
    }

    function startPreview(){
      const el = mapPane();
      if(!el) return;
      previewPos = leafletMap._getMapPanePos().clone();
      el.style.transformOrigin = '0 0';
      el.style.willChange = 'transform';
    }

    function previewZoom(fromZoom, toZoom, origin){
      if(!previewPos || !origin || !Number.isFinite(toZoom)) return;
      const el = mapPane();
      if(!el) return;
      const scale = leafletMap.getZoomScale(toZoom, fromZoom);
      const nx = origin.x - (origin.x - previewPos.x) * scale;
      const ny = origin.y - (origin.y - previewPos.y) * scale;
      el.style.transform = 'translate3d(' + nx + 'px,' + ny + 'px,0) scale(' + scale + ')';
    }

    function stopPreview(){
      const el = mapPane();
      if(el){
        el.style.willChange = '';
        el.style.transformOrigin = '';
        if(previewPos) L.DomUtil.setPosition(el, previewPos);
      }
      previewPos = null;
    }

    function commitZoom(z){
      if(raf){ cancelAnimationFrame(raf); raf = 0; }
      stopPreview();
      z = clampZoom(z);
      if(!around || !Number.isFinite(z)) return;
      if(Math.abs(z - leafletMap.getZoom()) < 0.01) return;
      leafletMap.setZoomAround(around, z, { animate: false });
      zoomQuietUntil = Date.now() + 500;
      queueInvalidateSize(520);
    }

    function cancelGesture(){
      if(raf){ cancelAnimationFrame(raf); raf = 0; }
      stopPreview();
      leafletMap.options.zoomSnap = savedSnap;
      dragging = false;
      pinch = null;
      around = null;
      if(leafletMap.dragging) leafletMap.dragging.enable();
      zoomDragLock = false;
    }

    function schedulePreview(){
      if(raf) cancelAnimationFrame(raf);
      const from = pinch ? pinch.startZoom : startZoom;
      const origin = around;
      const z = pendingZoom;
      raf = requestAnimationFrame(()=>{
        raf = 0;
        previewZoom(from, z, origin);
      });
    }

    function beginDrag(e){
      const { pt, y } = eventPoint(e);
      dragging = true;
      moved = false;
      startY = y;
      startZoom = leafletMap.getZoom();
      pendingZoom = startZoom;
      around = pt;
      savedSnap = leafletMap.options.zoomSnap;
      leafletMap.options.zoomSnap = 0;
      zoomDragLock = true;
      if(leafletMap.dragging) leafletMap.dragging.disable();
      startPreview();
      steal(e);
      lastUpAt = 0;
      lastUpPoint = null;
    }

    function endPinch(){
      if(!pinch) return;
      leafletMap.options.zoomSnap = savedSnap;
      let next = pendingZoom;
      if(savedSnap) next = clampZoom(Math.round(next / savedSnap) * savedSnap);
      around = pinch.around;
      pinch = null;
      commitZoom(next);
      if(leafletMap.dragging) leafletMap.dragging.enable();
      zoomDragLock = false;
    }

    function beginPinch(e){
      const a = e.touches[0], b = e.touches[1];
      const pa = touchPoint(a), pb = touchPoint(b);
      const dist = pa.distanceTo(pb);
      if(dist < 8) return;
      endDrag(false);
      pinch = {
        dist,
        around: L.point((pa.x + pb.x) / 2, (pa.y + pb.y) / 2),
        startZoom: leafletMap.getZoom(),
      };
      around = pinch.around;
      pendingZoom = pinch.startZoom;
      savedSnap = leafletMap.options.zoomSnap;
      leafletMap.options.zoomSnap = 0;
      zoomDragLock = true;
      if(leafletMap.dragging) leafletMap.dragging.disable();
      startPreview();
      steal(e);
      lastUpAt = 0;
      lastUpPoint = null;
    }

    function endDrag(applyTapZoom){
      if(!dragging) return;
      dragging = false;
      leafletMap.options.zoomSnap = savedSnap;
      let next = pendingZoom;
      if(applyTapZoom && !moved && around) next = clampZoom(startZoom + 1);
      else if(moved && savedSnap) next = clampZoom(Math.round(next / savedSnap) * savedSnap);
      commitZoom(next);
      if(leafletMap.dragging) leafletMap.dragging.enable();
      zoomDragLock = false;
    }

    function onStart(e){
      if(!onMap(e) && !dragging && !pinch) return;
      if(e.touches && e.touches.length >= 2){
        if(iosLike) beginPinch(e);
        else {
          endDrag(false);
          lastUpAt = 0;
          lastUpPoint = null;
        }
        return;
      }
      if(pinch){
        endPinch();
        return;
      }
      if(e.touches && e.touches.length !== 1){
        endDrag(false);
        lastUpAt = 0;
        lastUpPoint = null;
        return;
      }
      const { pt } = eventPoint(e);
      const now = Date.now();
      if(lastUpPoint && now - lastUpAt < TAP_MS && pt.distanceTo(lastUpPoint) < TAP_PX){
        beginDrag(e);
      }
    }

    function onMove(e){
      if(pinch){
        if(!e.touches || e.touches.length < 2) return;
        steal(e);
        const pa = touchPoint(e.touches[0]), pb = touchPoint(e.touches[1]);
        const dist = pa.distanceTo(pb);
        const scale = dist / pinch.dist;
        pendingZoom = clampZoom(leafletMap.getScaleZoom(scale, pinch.startZoom));
        around = pinch.around;
        schedulePreview();
        return;
      }
      if(!dragging) return;
      if(e.touches && e.touches.length !== 1) return;
      steal(e);
      const { y } = eventPoint(e);
      const dy = startY - y;
      if(Math.abs(dy) > 6) moved = true;
      pendingZoom = clampZoom(startZoom + dy / PX_PER_ZOOM);
      schedulePreview();
    }

    function onEnd(e){
      if(pinch){
        steal(e);
        endPinch();
        return;
      }
      if(dragging){
        steal(e);
        endDrag(true);
        return;
      }
      if(!onMap(e)) return;
      if(e.touches && e.touches.length) return;
      const { pt } = eventPoint(e);
      lastUpAt = Date.now();
      lastUpPoint = pt;
    }

    function onCancel(){
      if(pinch || dragging) cancelGesture();
    }

    const opts = { passive: false, capture: true };
    container.addEventListener('touchstart', onStart, opts);
    container.addEventListener('touchmove', onMove, opts);
    container.addEventListener('touchend', onEnd, opts);
    container.addEventListener('touchcancel', onCancel, opts);
    if(iosLike){
      container.addEventListener('gesturestart', steal, opts);
      container.addEventListener('gesturechange', steal, opts);
      container.addEventListener('gestureend', steal, opts);
    }
  }

  function initMap(){
    const native = isNativeApp();
    const startLoc = window.__BB_LAST_LOC;
    const iosLike = isIOS() || native;
    map = L.map('map',{
      zoomControl:!native,
      minZoom:MAP_MIN_ZOOM,
      worldCopyJump:true,
      tap:false,
      bounceAtZoomLimits:false,
      // Light inertia on iOS - zero made the map feel stuck/dead.
      inertia:true,
      inertiaDeceleration:iosLike ? 2500 : 3000,
      inertiaMaxSpeed:iosLike ? 1800 : 4000,
      fadeAnimation:false,
      markerZoomAnimation:false,
      zoomAnimation:!iosLike
    }).setView(
      startLoc && native ? [startLoc.lat, startLoc.lng] : [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng],
      startLoc && native ? 13 : DEFAULT_MAP_ZOOM
    );
    if(startLoc && native){
      userLocation = { lat:startLoc.lat, lng:startLoc.lng };
      autoCentered = true;
      initialBoundsDone = true;
    }
    if(pendingView){
      map.setView([pendingView.lat, pendingView.lng], pendingView.zoom, { animate: false });
      initialBoundsDone = true;
      pendingView = null;
    }
    map.createPane('countriesPane');
    map.getPane('countriesPane').style.zIndex = 350;
    addCartoVoyagerTiles(map, true, false);
    if(!native){
      const loadCountries = () => loadBidetFriendlyCountries();
      if('requestIdleCallback' in window) requestIdleCallback(loadCountries, { timeout: 3000 });
      else setTimeout(loadCountries, 1200);
    }
    clusterGroup = L.markerClusterGroup({
      maxClusterRadius: native ? 56 : 40,
      chunkedLoading: native,
      chunkInterval: 40,
      chunkDelay: 20,
      removeOutsideVisibleBounds: native,
      iconCreateFunction:c=>L.divIcon({
        html:'<div style="background:#047857;color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:700;border:2px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.18)">'+c.getChildCount()+'</div>',
        className:'custom-marker', iconSize:[36,36]
      })
    });
    map.addLayer(clusterGroup);
    clusterGroup.on('clusterclick', e=>{
      const cluster = e.layer;
      const childCount = cluster.getChildCount();
      const anim = !iosLike;
      if(childCount <= 12){
        map.fitBounds(cluster.getBounds().pad(0.15), { maxZoom: 16, animate: anim });
      } else {
        map.fitBounds(cluster.getBounds().pad(0.08), { maxZoom: 14, animate: anim });
      }
    });
    map.on('moveend', onUserMapViewChange);
    map.on('zoomend', onUserMapViewChange);
    enableDoubleTapDragZoom(map);
    window.__BB_MAP = map;
    if(map.zoomControl) map.zoomControl.setPosition(isMobile() ? 'topright' : 'bottomright');
    const mobileMq = window.matchMedia('(max-width:820px)');
    mobileMq.addEventListener('change', e=>{
      if(map.zoomControl) map.zoomControl.setPosition(e.matches ? 'topright' : 'bottomright');
      setTimeout(()=>safeInvalidateSize(), 100);
    });
    setTimeout(()=>safeInvalidateSize(), 150);
    // visualViewport fires during pinch and URL-bar hide. safeInvalidateSize
    // no-ops while zoomDragLock/quiet is active; queueInvalidateSize retries
    // after the quiet window so rotate/chrome changes still resize the map.
    if(window.visualViewport){
      window.visualViewport.addEventListener('resize',()=> queueInvalidateSize(250));
    }
    window.addEventListener('resize',()=> queueInvalidateSize(250));
  }

  function initLegendHelp(){
    document.getElementById('legendHelpBtn')?.addEventListener('click', ()=> setOverlayOpen('legendOverlay', true));
    document.getElementById('legendClose')?.addEventListener('click', ()=> setOverlayOpen('legendOverlay', false));
    document.getElementById('legendOverlay')?.addEventListener('click', e=>{
      if(e.target.id === 'legendOverlay') setOverlayOpen('legendOverlay', false);
    });
  }

  function initMenu(){
    const btn = document.getElementById('menuBtn');
    const drop = document.getElementById('menuDrop');
    if(!btn || !drop) return;
    drop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      const open = drop.hidden;
      drop.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    drop.addEventListener('click', e=> e.stopPropagation());
    document.addEventListener('click', ()=>{
      drop.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    });
    document.getElementById('menuAbout')?.addEventListener('click', ()=>{ drop.hidden = true; btn.setAttribute('aria-expanded', 'false'); setOverlayOpen('aboutOverlay', true); });
    document.getElementById('menuLegend')?.addEventListener('click', ()=>{ drop.hidden = true; btn.setAttribute('aria-expanded', 'false'); setOverlayOpen('legendOverlay', true); });
  }

  function requestUserLocation(opts){
    const silent = !!(opts && opts.silent);
    const onOk = opts && opts.onOk;
    if(!navigator.geolocation){
      if(!silent) alert('Geolocation not supported.');
      return;
    }
    const apply = (pos)=>{
      const lat = pos && pos.coords ? +pos.coords.latitude : NaN;
      const lng = pos && pos.coords ? +pos.coords.longitude : NaN;
      if(!isFinite(lat) || !isFinite(lng)) return false;
      userLocation = { lat, lng };
      window.__BB_LAST_LOC = userLocation;
      updateUserMarker();
      if(typeof onOk === 'function') onOk(userLocation);
      return true;
    };
    navigator.geolocation.getCurrentPosition(pos=>{
      if(!apply(pos) && !silent) alert('Could not get your location.');
    }, ()=>{
      navigator.geolocation.getCurrentPosition(pos=>{
        if(!apply(pos) && !silent) alert('Could not get your location.');
      }, ()=>{
        if(!silent) alert('Could not get your location.');
      }, { enableHighAccuracy:true, timeout:15000, maximumAge:0 });
    }, { enableHighAccuracy:false, timeout:8000, maximumAge:120000 });
  }

  function flyMapToUser(){
    if(!map || !userLocation) return;
    map.setView([userLocation.lat, userLocation.lng], 13, { animate:false });
    setTimeout(()=>safeInvalidateSize(), 80);
  }

  function urlHasBrowseIntent(params){
    return Boolean(
      params.get('view') ||
      params.get('near') ||
      params.get('spot') ||
      params.get('q') ||
      params.get('country') ||
      params.get('type') ||
      params.get('filter') ||
      params.get('nobidet') ||
      params.get('limited') ||
      params.get('sort')
    );
  }

  /** First clean visit lands on near-me at 15 mi (same as /?near=1&radius=15). */
  function maybeFirstVisitNearMe(){
    if(isNativeApp() || autoCentered || !map || spotFromUrl) return false;
    let seen = false;
    try{ seen = localStorage.getItem(FIRST_VISIT_KEY) === '1'; }catch(e){ return false; }
    const params = new URLSearchParams(location.search);
    const intent = urlHasBrowseIntent(params);
    try{ localStorage.setItem(FIRST_VISIT_KEY, '1'); }catch(e){}
    if(seen || intent) return false;

    radiusMi = FIRST_VISIT_NEAR_RADIUS;
    nearMe = true;
    nearMeFitPending = true;
    autoCentered = true;
    const next = '/?near=1&radius=' + FIRST_VISIT_NEAR_RADIUS + (location.hash || '');
    try{ history.replaceState(null, '', next); }catch(e){}
    updateNearMeUi();
    updateFilterUi();
    requestUserLocation({
      silent:true,
      onOk(){
        applyDistanceUnits();
        nearMeFitPending = true;
        updateUserMarker();
        updateNearMeUi();
        refresh();
        maybeShowPromo('nearme');
      }
    });
    syncUrlFromState();
    refresh();
    return true;
  }

  function maybeAutoCenterOnUser(){
    if(autoCentered || !map) return;
    if(spotFromUrl) return;
    const params = new URLSearchParams(location.search);
    if(urlHasBrowseIntent(params)) return;
    const cached = window.__BB_LAST_LOC;
    if(cached && isFinite(cached.lat) && isFinite(cached.lng)){
      autoCentered = true;
      userLocation = { lat:cached.lat, lng:cached.lng };
      updateUserMarker();
      flyMapToUser();
      refresh();
      return;
    }
    requestUserLocation({
      silent:true,
      onOk(){
        autoCentered = true;
        flyMapToUser();
        refresh();
      }
    });
  }

  function requestNearMe(){
    requestUserLocation({
      onOk(){
        if(!new URLSearchParams(location.search).get('radius')){
          radiusMi = denseMetroRadius(userLocation.lat, userLocation.lng);
        }
        applyDistanceUnits();
        nearMe = true;
        nearMeFitPending = true;
        updateNearMeUi();
        updateFilterUi();
        if(isMobile()) setMobileView('map');
        refresh();
        maybeShowPromo('nearme');
      }
    });
  }

  function buildFilterSheet(){
    const body = document.getElementById('filterSheetBody');
    if(!body) return;
    body.innerHTML =
      '<div class="filter-sheet-section"><span class="filter-sheet-label">Place type</span>'+
      '<div class="segmented" id="sheetPlaceFilter">'+
      ['all','mosque','restaurant','hotel','public'].map(t =>
        '<button type="button" data-type="'+t+'"'+(placeFilter===t?' class="active"':'')+'>'+
        (t==='all'?'All':t==='mosque'?'Masajid':t==='restaurant'?'Restaurants':t==='hotel'?'Hotels':'Public')+
        '</button>').join('')+'</div></div>'+
      '<div class="filter-sheet-section"><span class="filter-sheet-label">Toggles</span>'+
      '<div class="filter-toggles">'+
      '<button type="button" class="filter-toggle'+(showLimitedAccess?' active':'')+'" data-sheet="limited">Include hotels</button>'+
      '<button type="button" class="filter-toggle'+(noBidetMode?' active':'')+'" data-sheet="nobidet">No-bidet too</button>'+
      '</div></div>'+
      '<div class="filter-sheet-section"><span class="filter-sheet-label">More</span>'+
      '<div class="more-panel" id="sheetTypeChips">'+
      ['verified','warmed','internet','public','limited'].concat(COUNTRY_FILTERS).map(t =>
        '<button type="button" class="chip'+((COUNTRY_FILTERS.includes(t)?countryFilter===t:extraFilter===t)?' active':'')+'" data-type="'+escapeHtml(t)+'">'+escapeHtml(t)+'</button>'
      ).join('')+'</div></div>'+
      '<div class="filter-sheet-section"><span class="filter-sheet-label">Along route</span>'+
      '<input id="routeFrom" placeholder="From (city or address)">'+
      '<input id="routeTo" placeholder="To (city or address)">'+
      '<button type="button" class="btn btn-ghost" id="routeApplyBtn">Show spots along route</button></div>';
  }

  function readFilterSheet(){
    const pf = document.querySelector('#sheetPlaceFilter button.active');
    if(pf) placeFilter = pf.dataset.type;
    showLimitedAccess = Boolean(document.querySelector('[data-sheet="limited"].active'));
    noBidetMode = Boolean(document.querySelector('[data-sheet="nobidet"].active'));
    if(placeFilter === 'hotel') showLimitedAccess = true;
    extraFilter = null;
    countryFilter = null;
    document.querySelectorAll('#sheetTypeChips .chip.active').forEach(btn=>{
      const t = btn.dataset.type;
      if(COUNTRY_FILTERS.includes(t)) countryFilter = t;
      else extraFilter = t;
    });
    updateFilterUi();
  }

  async function submitNotify(){
    const email = document.getElementById('notifyEmail')?.value.trim();
    const city = document.getElementById('notifyCity')?.value.trim();
    const status = document.getElementById('notifyStatus');
    if(!email || !city){
      alert('Please enter your email and a city.');
      return;
    }
    const btn = document.getElementById('notifySubmit');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: WEB3FORMS_ACCESS_KEY,
          subject: 'BidetBud notify: ' + city,
          from_name: 'BidetBud notify',
          email,
          city,
          message: 'Please notify when new verified spots are added in ' + city
        })
      });
      status.textContent = 'Thanks! We will watch for new spots in ' + city + '.';
      status.hidden = false;
      status.classList.add('is-ok');
    } catch(e){
      status.textContent = 'Could not send. Try again later.';
      status.hidden = false;
      status.classList.add('is-error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Subscribe';
    }
  }

  function wire(){
    initSubmitPanel();
    initLegendHelp();
    initMenu();
    initPullRefresh();
    initDetailSheet();
    initPromoPopup();

    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', ()=>{
      renderSearchAc();
      scheduleRefresh();
    });
    searchInput.addEventListener('focus', renderSearchAc);
    searchInput.addEventListener('blur', ()=> setTimeout(()=>{
      if(searchAcPicking) return;
      hideSearchAc();
    }, 220));
    searchInput.addEventListener('keydown', e=>{
      if(e.key === 'ArrowDown'){ e.preventDefault(); moveSearchAc(1); return; }
      if(e.key === 'ArrowUp'){ e.preventDefault(); moveSearchAc(-1); return; }
      if(e.key === 'Enter'){
        if(selectSearchAcIndex()) return;
        hideSearchAc();
        const q = searchInput.value.trim();
        if(q) saveRecentSearch(q);
        lastFitKey = null;
        refresh();
        if(isMobile() && q) setMobileView('list');
        maybeShowPromo('search');
      }
      if(e.key === 'Escape'){
        hideSearchAc();
        searchInput.blur();
      }
    });
    document.getElementById('searchClear')?.addEventListener('click', (e)=>{
      e.preventDefault();
      searchInput.value = '';
      hideSearchAc();
      updateSearchClearBtn();
      lastFitKey = null;
      refresh();
      searchInput.focus();
    });
    updateSearchClearBtn();

    document.querySelectorAll('.quick-chip').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const q = btn.dataset.quick;
        placeFilter = q === 'near-masjid' ? 'mosque' : 'restaurant';
        updateFilterUi();
        requestNearMe();
      });
    });

    document.querySelectorAll('#placeFilter button').forEach(btn=>{
      btn.addEventListener('click',()=>{
        placeFilter = btn.dataset.type;
        if(placeFilter === 'hotel') showLimitedAccess = true;
        updateFilterUi();
        refresh();
      });
    });
    document.getElementById('sortSelect')?.addEventListener('change', e=>{
      sortMode = e.target.value;
      refresh();
      if(typeof window.trackEvent === 'function') window.trackEvent('bidetbud_sort_change', { mode: sortMode });
    });
    document.getElementById('noBidetToggle')?.addEventListener('click',()=>{
      setNoBidetMode(!noBidetMode);
    });
    document.getElementById('limitedAccessToggle')?.addEventListener('click',()=>{
      setShowLimitedAccess(!showLimitedAccess);
    });
    // Delegated: country chips are re-rendered from the seed after load.
    document.getElementById('typeChips')?.addEventListener('click', e=>{
      const btn = e.target.closest('.chip[data-type]');
      if(!btn) return;
      const t = btn.dataset.type;
      if(COUNTRY_FILTERS.includes(t)){
        countryFilter = countryFilter === t ? null : t;
        initialBoundsDone = false;
      } else if(extraFilter===t){
        extraFilter = null;
      } else {
        extraFilter = t;
        if(t === 'limited') showLimitedAccess = true;
      }
      updateFilterUi();
      refresh();
    });
    document.querySelectorAll('#radiusRow button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        radiusMi = parseInt(btn.dataset.radius, 10);
        if(nearMe) nearMeFitPending = true;
        updateFilterUi();
        refresh();
      });
    });

    document.getElementById('locateFab')?.addEventListener('click',()=>{
      if(userLocation){
        if(isMobile()) setMobileView('map');
        flyMapToUser();
        return;
      }
      requestUserLocation({
        onOk(){
          if(isMobile()) setMobileView('map');
          flyMapToUser();
        }
      });
    });

    document.getElementById('nearMeBtn').addEventListener('click',()=>{
      if(nearMe){
        nearMe = false;
        userLocation = null;
        nearMeFitPending = false;
        updateNearMeUi();
        updateFilterUi();
        refresh();
        return;
      }
      requestNearMe();
    });

    document.getElementById('menuCopyView')?.addEventListener('click', ()=>{
      const menuDrop = document.getElementById('menuDrop');
      if(menuDrop) menuDrop.hidden = true;
      copyViewLink();
    });
    // Notify-me-for-a-city disabled

    document.getElementById('mobileFilterBtn')?.addEventListener('click', ()=>{
      buildFilterSheet();
      setOverlayOpen('filterSheetOverlay', true);
    });
    document.getElementById('filterSheetClose')?.addEventListener('click', ()=> setOverlayOpen('filterSheetOverlay', false));
    document.getElementById('filterSheetBack')?.addEventListener('click', ()=> setOverlayOpen('filterSheetOverlay', false));
    document.getElementById('filterSheetClear')?.addEventListener('click', ()=>{
      clearAllFilters();
      buildFilterSheet();
    });
    document.getElementById('filterSheetApply')?.addEventListener('click', ()=>{
      readFilterSheet();
      setOverlayOpen('filterSheetOverlay', false);
      refresh();
    });
    document.getElementById('filterSheetOverlay')?.addEventListener('click', e=>{
      if(e.target.id === 'filterSheetOverlay') setOverlayOpen('filterSheetOverlay', false);
    });
    document.getElementById('filterSheetBody')?.addEventListener('click', e=>{
      const seg = e.target.closest('#sheetPlaceFilter button');
      if(seg){
        document.querySelectorAll('#sheetPlaceFilter button').forEach(b=>b.classList.toggle('active', b===seg));
        if(seg.dataset.type === 'hotel'){
          document.querySelector('[data-sheet="limited"]')?.classList.add('active');
        }
        return;
      }
      const toggle = e.target.closest('[data-sheet]');
      if(toggle){ toggle.classList.toggle('active'); return; }
      const chip = e.target.closest('#sheetTypeChips .chip');
      if(chip){
        document.querySelectorAll('#sheetTypeChips .chip').forEach(b=>{
          if(b===chip) b.classList.toggle('active');
          else if(!COUNTRY_FILTERS.includes(b.dataset.type) && !COUNTRY_FILTERS.includes(chip.dataset.type)) b.classList.remove('active');
        });
      }
      if(e.target.id === 'routeApplyBtn'){
        const from = document.getElementById('routeFrom')?.value.trim();
        const to = document.getElementById('routeTo')?.value.trim();
        if(from && to){
          applyAlongRoute(from, to).catch(err=> alert(err.message || 'Could not find route'));
        }
      }
    });

    document.querySelectorAll('.mobile-tab').forEach(tab=>{
      tab.addEventListener('click',()=> setMobileView(tab.dataset.view));
    });
    document.getElementById('aboutClose').addEventListener('click',()=> setOverlayOpen('aboutOverlay', false));
    document.getElementById('searchPeekAll')?.addEventListener('click', ()=> setMobileView('list'));
    document.getElementById('footerAbout')?.addEventListener('click', e=>{ e.preventDefault(); setOverlayOpen('aboutOverlay', true); });
    document.getElementById('footerCopyLink')?.addEventListener('click', e=>{ e.preventDefault(); copyViewLink(); });
    const footerYear = document.getElementById('footerYear');
    if(footerYear) footerYear.textContent = String(new Date().getFullYear());
    document.getElementById('addBtn').addEventListener('click',()=> openAddForm('header'));
    document.getElementById('addFab')?.addEventListener('click',()=> openAddForm('fab'));
    document.getElementById('addName')?.addEventListener('input', ()=>{
      clearTimeout(addDupeTimer);
      addDupeTimer = setTimeout(renderAddDuplicates, 180);
    });
    document.getElementById('addDupes')?.addEventListener('click', e=>{
      const btn = e.target.closest('.add-dupe');
      if(!btn) return;
      const id = btn.getAttribute('data-id');
      if(!id) return;
      setOverlayOpen('addOverlay', false);
      resetAddForm();
      openDetail(id);
    });
    document.getElementById('addPhotoBtn')?.addEventListener('click', ()=> pickAddPhoto());
    document.getElementById('addPhotoFile')?.addEventListener('change', e=>{
      const file = e.target.files && e.target.files[0];
      if(file) setAddPhotoFromBlob(file);
    });
    document.getElementById('addPhotoRemove')?.addEventListener('click', ()=> clearAddPhoto());
    document.getElementById('addMoreDetails')?.addEventListener('toggle', ()=>{
      const more = document.getElementById('addMoreDetails');
      if(more && more.open) more.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    document.getElementById('detailContent').addEventListener('click', e=>{
      if(e.target.closest('.js-open-add-form')){
        setOverlayOpen('detailOverlay', false);
        openAddForm('detail');
      }
    });
    document.getElementById('addClose').addEventListener('click',()=>{ setOverlayOpen('addOverlay', false); resetAddForm(); });
    document.getElementById('detailClose').addEventListener('click',()=> setOverlayOpen('detailOverlay', false));
    document.getElementById('detailBack')?.addEventListener('click',()=> setOverlayOpen('detailOverlay', false));
    document.getElementById('thankYouClose')?.addEventListener('click', ()=> setOverlayOpen('thankYouOverlay', false));
    document.getElementById('addAnotherSpot')?.addEventListener('click', ()=>{
      setOverlayOpen('thankYouOverlay', false);
      openAddForm('add_another');
    });
    ['detailOverlay','addOverlay','aboutOverlay','thankYouOverlay','legendOverlay','filterSheetOverlay'].forEach(id=>{
      const node = document.getElementById(id);
      if(!node) return;
      node.addEventListener('click',e=>{
        if(e.target.id!==id) return;
        if((id==='addOverlay' || id==='thankYouOverlay') && isMobile()) return;
        setOverlayOpen(id, false);
        if(id==='addOverlay') resetAddForm();
      });
    });
    document.addEventListener('keydown',e=>{
      if(e.key==='/' && !isTypingTarget(document.activeElement)){
        e.preventDefault();
        searchInput.focus();
        return;
      }
      if(e.key==='Escape'){
        hideSearchAc();
        // The three-dots menu is currently commented out of the markup.
        const menuDrop = document.getElementById('menuDrop');
        if(menuDrop) menuDrop.hidden = true;
        if(document.getElementById('promoOverlay')?.classList.contains('open')){
          dismissPromoPopup();
        } else {
          setOverlayOpen('detailOverlay', false);
          setOverlayOpen('addOverlay', false);
          setOverlayOpen('aboutOverlay', false);
          setOverlayOpen('thankYouOverlay', false);
          setOverlayOpen('legendOverlay', false);
          setOverlayOpen('filterSheetOverlay', false);
          resetAddForm();
        }
        return;
      }
      if(e.key === 'ArrowDown' && !isTypingTarget(document.activeElement) && document.getElementById('detailOverlay')?.classList.contains('open') === false){
        const cards = [...document.querySelectorAll('#locationList .card')];
        if(!cards.length) return;
        e.preventDefault();
        listFocusIndex = Math.min(cards.length - 1, listFocusIndex + 1);
        cards.forEach((c,i)=> c.classList.toggle('keyboard-focus', i === listFocusIndex));
        cards[listFocusIndex]?.focus();
        cards[listFocusIndex]?.scrollIntoView({ block: 'nearest' });
      }
      if(e.key === 'ArrowUp' && !isTypingTarget(document.activeElement)){
        const cards = [...document.querySelectorAll('#locationList .card')];
        if(!cards.length) return;
        e.preventDefault();
        listFocusIndex = Math.max(0, listFocusIndex - 1);
        cards.forEach((c,i)=> c.classList.toggle('keyboard-focus', i === listFocusIndex));
        cards[listFocusIndex]?.focus();
        cards[listFocusIndex]?.scrollIntoView({ block: 'nearest' });
      }
    });

    document.getElementById('submitAdd').addEventListener('click', async ()=>{
      const btn = document.getElementById('submitAdd');
      const errEl = document.getElementById('addFormError');
      const showErr = (msg) => {
        if(errEl){
          errEl.textContent = msg;
          errEl.hidden = !msg;
        } else if(msg) alert(msg);
      };
      showErr('');
      if(document.getElementById('addHoney').value) return;
      const name=document.getElementById('addName').value.trim();
      if(!name){
        showErr('Enter a place name.');
        document.getElementById('addName')?.focus();
        return;
      }
      const bidetStatus = getAddHasBidet();
      const payload={
        name,
        address: document.getElementById('addAddress').value.trim(),
        bidetStatus,
        notes: document.getElementById('addNotes').value.trim(),
        photoFile: addPhotoBlob,
        photoName: addPhotoBlob && addPhotoBlob.type === 'image/png' ? 'spot.png' : 'spot.jpg',
        updateOf: document.getElementById('addUpdateOf')?.value || ''
      };
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        await submitViaWeb3Forms(payload);
        setOverlayOpen('addOverlay', false);
        resetAddForm();
        showThankYou();
        if(typeof window.trackEvent === 'function'){
          window.trackEvent('bidetbud_add_submit', { bidet: bidetStatus === 'none' ? 'none' : 'yes' });
        }
      } catch (err) {
        alert(err.message || 'Could not send submission.');
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });
  }

  const spotFromUrl = applyUrlState();
  wire();
  try{ if(typeof L!=='undefined') initMap(); }catch(e){ console.error(e); }

  function bootFromCache(){
    initData();
    applyDistanceUnits();
    refresh();
    showLoadToast();
    if(!maybeFirstVisitNearMe()) maybeAutoCenterOnUser();
    maybeShowFirstRunHints();
    if(spotFromUrl){
      const api = window.BidetBudMapApi;
      const open = ()=> setTimeout(()=> openDetail(spotFromUrl, true), 400);
      if(api && api.loadSpot) api.loadSpot(spotFromUrl).then(()=>{ initData(); open(); }).catch(open);
      else open();
    }
    if (typeof window.trackEvent === 'function') {
      window.trackEvent('bidetbud_view', { spots: String(allLocations.length) });
    }
  }

  window.addEventListener('bidetbud-user-loc', e=>{
    const loc = e.detail;
    if(!loc || autoCentered || !isNativeApp() || !map) return;
    if(spotFromUrl) return;
    userLocation = { lat:+loc.lat, lng:+loc.lng };
    if(!isFinite(userLocation.lat) || !isFinite(userLocation.lng)) return;
    autoCentered = true;
    updateUserMarker();
    flyMapToUser();
  });

  async function bootMapData(){
    const api = window.BidetBudMapApi;
    if(!api || !api.bootstrap) throw new Error('Map API missing');
    // Paint immediately from local cache if present, then refresh from /api/bootstrap.
    if(api.preloadCache) api.preloadCache();
    if(api.size) bootFromCache();
    await api.bootstrap();
    bootFromCache();
  }

  bootMapData().catch(err => {
    console.error(err);
    const api = window.BidetBudMapApi;
    if(api && api.size){
      bootFromCache();
      return;
    }
    const el = document.getElementById('countLabel');
    if(el) el.innerHTML = 'Could not load spots. <button type="button" class="inline-link" id="retryLoadBtn">Retry</button>';
    document.getElementById('retryLoadBtn')?.addEventListener('click', ()=> location.reload());
    bootFromCache();
  });
})();
