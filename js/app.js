(function(){
  // Web3Forms access key — public client key (safe in source per web3forms.com docs).
  const WEB3FORMS_ACCESS_KEY = 'b0f5343d-1608-4224-a49a-d32d13fbbdfe';
  const SITE_URL = 'https://bidetbud.com/';
  const COUNTRY_FILTERS = ['USA', 'UK', 'Canada', 'France', 'Russia', 'China'];
  const POPULAR_CITIES = ['NYC', 'Bay Area', 'Houston', 'London', 'Toronto', 'Chicago', 'Dallas', 'Sunset Park', 'Williamsburg'];
  const RADIUS_OPTIONS = [5, 10, 25, 50, 100];
  const RECENT_SEARCH_KEY = 'bb_recent_searches';
  const ALONG_ROUTE_MI = 3;
  const MAP_MIN_ZOOM = 3;
  const DEFAULT_MAP_CENTER = { lat: 39.8283, lng: -98.5795 };
  const DEFAULT_MAP_ZOOM = 4;

  const HAS_BIDET = s => s === 'verified' || s === 'warmed' || s === 'internet';
  const NO_BIDET = s => s === 'none';
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  let allLocations = [], userLocation = null, map, clusterGroup, countriesLayer;
  let userMarker = null, userRadiusCircle = null, markerById = new Map(), highlightedMarkerId = null;
  let useKm = false, alongRoute = null, searchAcIndex = -1, listFocusIndex = -1;
  let lastFiltered = [];
  let refreshTimer = null;
  let mapMoveTimer = null;
  const LIST_CAP = 200;
  const MAP_MARKER_CAP = 2500;
  let placeFilter = 'all', extraFilter = null, countryFilter = null, noBidetMode = false, showLimitedAccess = false;
  let nearMe = false, radiusMi = 50, nearMeFitPending = false;
  let suppressUrlWrite = false, initialBoundsDone = false, activeSpotId = null;

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
    'Malaysia', 'Indonesia', 'Thailand', 'Vietnam', 'Philippines', 'Cambodia',
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
  // Natural Earth 50m — johan/world.geo.json omits Singapore (SG falls inside Malaysia's polygon).
  const BIDET_COUNTRY_GEOJSON_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
  // Never shade these as bidet-friendly even if a coarse polygon swallows them.
  const FRIENDLY_SHADE_EXCLUDE_GEO = new Set(['Singapore']);

  function addCartoVoyagerTiles(targetMap, showAttribution, noWrap){
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      noWrap: Boolean(noWrap),
      attribution: showAttribution ? '© OpenStreetMap · © CARTO' : undefined
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

  function stableSeedId(row){
    const s = (row.name||'') + '|' + row.latitude + '|' + row.longitude;
    let h = 0; for (let i=0;i<s.length;i++) h = ((h<<5)-h+s.charCodeAt(i))|0;
    return 'seed_' + Math.abs(h).toString(36);
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
    return 'https://www.google.com/maps/dir/?api=1&destination=' + q;
  }

  function updateUserMarker(){
    if(userMarker && map){ map.removeLayer(userMarker); userMarker = null; }
    if(userRadiusCircle && map){ map.removeLayer(userRadiusCircle); userRadiusCircle = null; }
    if(!map || !nearMe || !userLocation) return;
    const userIcon = L.divIcon({
      html: '<div class="user-loc-dot"></div>',
      className: 'user-loc-marker',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
    userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 2000, interactive: false });
    userMarker.addTo(map);
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
    map.setView([+m.latitude, +m.longitude], zoom, { animate: true });
    highlightMarker(m.id);
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
    const q = getQuery();
    const hint = document.getElementById('noBidetSearchHint');
    if(!hint) return;
    if(noBidetMode || !q){
      hint.hidden = true;
      return;
    }
    const hiddenNone = allLocations.filter(m =>
      NO_BIDET(m.bidetStatus) && matchesSearch(m, q) && !noBidetMode
    );
    if(hiddenNone.length){
      hint.innerHTML = 'We have a no-bidet record for <strong>' + escapeHtml(hiddenNone[0].name) + '</strong>. Turn on <button type="button" class="inline-link" id="hintEnableNoBidet">No bidet</button> to see it.';
      hint.hidden = false;
      document.getElementById('hintEnableNoBidet')?.addEventListener('click', () => setNoBidetMode(true));
    } else {
      hint.hidden = true;
    }
  }

  function activeFilterItems(){
    const items = [];
    if(nearMe) items.push({ key: 'near', label: 'Near me' });
    if(nearMe) items.push({ key: 'radius', label: 'Within ' + formatRadiusLabel(radiusMi) });
    if(noBidetMode) items.push({ key: 'nobidet', label: 'No bidet' });
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
    if(showLimitedAccess && extraFilter !== 'limited') items.push({ key: 'limitedtoggle', label: 'Guests only on' });
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
    const local = nearMeFitPins(filtered).length;
    el.textContent = filtered.length
      ? ('Showing ' + filtered.length + ' within ' + formatRadiusLabel(radiusMi) + (local ? '. Map zoomed to nearest ' + local + '.' : '.'))
      : ('Nothing within ' + formatRadiusLabel(radiusMi) + '. Try a wider radius or search a city.');
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
    document.title = m.name + ' – ' + lead + ' | BidetBud';
  }

  function copyViewLink(){
    const url = location.origin + location.pathname + (location.search || '');
    navigator.clipboard?.writeText(url).then(() => alert('Link copied!')).catch(() => prompt('Copy link:', url));
  }

  function openAddFormPrefill(m, noBidet){
    setOverlayOpen('addOverlay', true);
    const nameEl = document.getElementById('addName');
    const addrEl = document.getElementById('addAddress');
    if(nameEl) nameEl.value = m?.name || '';
    if(addrEl) addrEl.value = [m?.address, m?.city].filter(Boolean).join(', ');
    setAddHasBidet(noBidet ? 'none' : 'verified');
    nameEl?.focus();
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
          btn.title = 'Report places without bidets too (first tip)';
          setTimeout(() => { btn.title = 'Show places we\'ve recorded that do NOT have a bidet'; }, 8000);
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

  function normalizeSeed(row){
    const s = row.bidetStatus;
    let defaultType = 'Verified bidet';
    if(s === 'warmed') defaultType = 'Heated seat';
    else if(s === 'internet') defaultType = 'Web source';
    else if(s === 'none') defaultType = '';
    const access = row.access === 'limited' ? 'limited' : 'public';
    return {
      id: stableSeedId(row), name: row.name, address: row.address||'', latitude: String(row.latitude), longitude: String(row.longitude),
      city: row.city||'', country: row.country||'', type: row.type||'mosque', bidetStatus: s,
      bidetType: row.bidetType || defaultType,
      sourceUrl: row.sourceUrl || '',
      sourceQuote: row.sourceQuote || '',
      verifiedMethod: row.verifiedMethod || '',
      searchAliases: row.searchAliases || '',
      access,
      accessNote: access === 'limited' ? (row.accessNote || 'Not a regular public restroom') : ''
    };
  }

  function initData(){
    allLocations = (window.BIDETBUD_SEED||[])
      .map(normalizeSeed)
      .filter(l => HAS_BIDET(l.bidetStatus) || NO_BIDET(l.bidetStatus))
      .filter(l => !isBidetFriendlyCountry(l.country));
  }

  function ensureSearchMeta(m){
    if(!m._search) m._search = buildSearchMeta(m);
  }

  const SEARCH_STOP = new Set(['the','a','an','and','or','of','at','in','on','for','to','&']);

  function normalizeSearchText(s){
    return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function nameWords(name){
    return normalizeSearchText(name).split(' ').filter(w => w && !SEARCH_STOP.has(w));
  }

  function buildSearchMeta(m){
    const words = nameWords(m.name);
    const acronym = words.map(w => w[0]).join('');
    const hay = normalizeSearchText([m.name, m.city, m.address, m.country, m.bidetType, m.searchAliases].filter(Boolean).join(' '));
    const aliases = new Set([acronym]);
    if(m.searchAliases){
      String(m.searchAliases).split(/[,;|]/).forEach(a => {
        const t = normalizeSearchText(a).replace(/\s/g, '');
        if(t) aliases.add(t);
      });
    }
    return { hay, words, acronym, aliases: [...aliases] };
  }

  function matchesInitials(words, compact){
    if(!compact) return false;
    let wi = 0;
    for(let i = 0; i < compact.length; i++){
      while(wi < words.length && words[wi][0] !== compact[i]) wi++;
      if(wi >= words.length) return false;
      wi++;
    }
    return true;
  }

  function searchScore(m, rawQ){
    const q = normalizeSearchText(rawQ);
    if(!q) return 0;
    ensureSearchMeta(m);
    const s = m._search;
    const compact = q.replace(/\s/g, '');
    if(s.hay.includes(q)){
      if(s.hay.startsWith(q)) return 90;
      if(normalizeSearchText(m.name).startsWith(q)) return 85;
      return 70;
    }
    if(compact.length >= 2){
      if(s.acronym === compact) return 100;
      if(s.aliases.some(a => a === compact)) return 98;
      if(s.acronym.startsWith(compact)) return 88;
      if(s.aliases.some(a => a.startsWith(compact))) return 86;
      if(matchesInitials(s.words, compact)) return 75;
    }
    const tokens = q.split(' ').filter(Boolean);
    if(tokens.length > 1){
      const hayWords = s.hay.split(' ');
      if(tokens.every(t => hayWords.some(w => w.startsWith(t)))) return 65;
    }
    return 0;
  }

  function matchesSearch(m, rawQ){
    return searchScore(m, rawQ) > 0;
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
    if(activeSpotId) p.set('spot', activeSpotId);
    const next = p.toString() ? '?' + p.toString() : location.pathname;
    history.replaceState(null, '', next);
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
    const spotId = p.get('spot') || '';
    if(spotId){
      const spot = allLocations.find(x => x.id === spotId);
      if(spot && spot.access === 'limited') showLimitedAccess = true;
    }
    const country = p.get('country');
    if(country && COUNTRY_FILTERS.includes(country)) countryFilter = country;
    if(p.get('near') === '1') nearMe = true;
    if(p.get('radius')) radiusMi = parseInt(p.get('radius'), 10) || 50;
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
    showLimitedAccess = Boolean(on);
    if(!showLimitedAccess && extraFilter === 'limited') extraFilter = null;
    initialBoundsDone = false;
    updateFilterUi();
    refresh();
    if(typeof window.trackEvent === 'function') window.trackEvent('bidetbud_limited_toggle', { on: showLimitedAccess });
  }

  function setNoBidetMode(on){
    noBidetMode = Boolean(on);
    // Status filters (verified/heated/web) don't apply to no-bidet records.
    if(noBidetMode){
      if(extraFilter==='verified' || extraFilter==='warmed' || extraFilter==='internet'){
        extraFilter = null;
      }
      // Masajid/Restaurants filter would hide cafe reports like Pleasanton Qamaria.
      placeFilter = 'all';
      if(nearMe){
        nearMe = false;
        updateNearMeUi();
      }
      const si = document.getElementById('searchInput');
      if(si && si.value.trim()){
        si.value = '';
        hideSearchAc();
      }
    }
    initialBoundsDone = false;
    updateFilterUi();
    refresh();
    if(typeof window.trackEvent === 'function') window.trackEvent('bidetbud_no_bidet_toggle', { on: noBidetMode });
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
      intro.textContent = 'Just the name is enough. We\'ll look it up. Every submission is reviewed before it goes live.';
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
  function isTypingTarget(el){
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  function setOverlayOpen(id, open){
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.toggle('open', open);
    const anyOpen = document.querySelector('.overlay.open');
    document.body.classList.toggle('modal-open', Boolean(anyOpen));
    if(id === 'addOverlay' && open){
      setOverlayOpen('promoOverlay', false);
    }
    if(id === 'detailOverlay' && !open){
      activeSpotId = null;
      setDocumentTitleForSpot(null);
    }
    if(!open || id === 'detailOverlay') syncUrlFromState();
  }

  function openAddForm(source){
    setOverlayOpen('addOverlay', true);
    document.getElementById('addName')?.focus();
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
    const shareUrl = encodeURIComponent(SITE_URL);
    const shareText = encodeURIComponent('We use BidetBud to find masajid and restaurants with bidets. Add spots your community should know about:');
    document.getElementById('thankYouContent').innerHTML =
      '<h2>Thanks for contributing!</h2>'+
      '<p class="sub">We review every submission before it goes live. Share with your local WhatsApp group so others can find (or avoid) spots.</p>'+
      '<div class="dialog-actions share-actions">'+
      '<button type="button" class="btn btn-primary" id="addAnotherSpot">Add another spot</button>'+
      '<button type="button" class="btn btn-ghost" id="thankYouDone">Done</button>'+
      '</div>'+
      '<p class="sub thank-share-label">Share BidetBud:</p>'+
      '<div class="dialog-actions share-actions thank-share-actions">'+
      '<a class="btn btn-ghost" href="https://wa.me/?text='+shareText+'%20'+shareUrl+'" target="_blank" rel="noopener">WhatsApp group</a>'+
      '<a class="btn btn-ghost" href="https://t.me/share/url?url='+shareUrl+'&text='+shareText+'" target="_blank" rel="noopener">Telegram</a>'+
      '<button type="button" class="btn btn-ghost" id="copySiteLink">Copy link</button>'+
      '</div>';
    setOverlayOpen('thankYouOverlay', true);
    document.getElementById('addAnotherSpot')?.addEventListener('click', ()=>{
      setOverlayOpen('thankYouOverlay', false);
      openAddForm('add_another');
    });
    document.getElementById('thankYouDone')?.addEventListener('click', ()=>{
      setOverlayOpen('thankYouOverlay', false);
    });
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
    if(map) setTimeout(()=>map.invalidateSize(), 120);
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
      const isNone = NO_BIDET(m.bidetStatus);
      if(noBidetMode){
        if(!isNone) return false;
      } else if(!HAS_BIDET(m.bidetStatus)){
        // No-bidet spots stay off the default map, but show up when searched by name.
        if(!(isNone && q)) return false;
      }
      if(!noBidetMode){
        if(placeFilter==='mosque' && m.type!=='mosque') return false;
        if(placeFilter==='restaurant' && m.type!=='restaurant') return false;
        if(placeFilter==='hotel' && m.type!=='hotel') return false;
        if(placeFilter==='public' && m.type!=='public') return false;
      }
      if(extraFilter==='warmed' && m.bidetStatus!=='warmed') return false;
      if(extraFilter==='verified' && m.bidetStatus!=='verified') return false;
      if(extraFilter==='internet' && m.bidetStatus!=='internet') return false;
      if(extraFilter==='public' && m.access!=='public') return false;
      if(extraFilter==='limited' && m.access!=='limited') return false;
      if(!showLimitedAccess && m.access==='limited' && extraFilter!=='limited') return false;
      if(countryFilter && m.country !== countryFilter) return false;
      if(nearMe && userLocation){
        const dist = haversineMiles(userLocation,{lat:+m.latitude,lng:+m.longitude});
        if(dist>radiusMi) return false;
      }
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
    if(m.bidetStatus==='none') return '<span class="tag tag-none">No bidet</span>';
    if(m.bidetStatus==='internet') return '<span class="tag tag-internet">Web</span>';
    if(m.bidetStatus==='warmed') return '<span class="tag tag-warmed">Heated</span>';
    return '<span class="tag tag-verified">Verified</span>';
  }

  function accessTag(m){
    if(m.access==='limited') return '<span class="tag tag-limited">Limited access</span>';
    return '';
  }

  function accessWarn(m){
    if(m.access!=='limited') return '';
    return '<div class="access-warn"><strong>Limited access: not a public restroom</strong>'+escapeHtml(m.accessNote||'Hotel rooms, showrooms, and private clubs are not open to walk-in visitors.')+'</div>';
  }

  function typeLabel(t){ return t==='restaurant' ? 'Restaurant' : t==='hotel' ? 'Hotel' : t==='public' ? 'Public' : 'Masjid'; }

  function createIcon(status, access){
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

  function sortedLocations(list){
    const q = getQuery();
    return [...list].sort((a,b)=>{
      if(q){
        const sa = searchScore(a, q), sb = searchScore(b, q);
        if(sa !== sb) return sb - sa;
      }
      if(a.access!==b.access){
        if(a.access==='public') return -1;
        if(b.access==='public') return 1;
      }
      if(nearMe && userLocation){
        const da=haversineMiles(userLocation,{lat:+a.latitude,lng:+a.longitude});
        const db=haversineMiles(userLocation,{lat:+b.latitude,lng:+b.longitude});
        return da-db;
      }
      return a.name.localeCompare(b.name);
    });
  }

  function cardStatusClass(m){
    if(m.bidetStatus==='none') return 'card--none';
    if(m.access==='limited') return 'card-limited';
    if(m.bidetStatus==='internet') return 'card--internet';
    if(m.bidetStatus==='warmed') return 'card--warmed';
    return 'card--verified';
  }

  function emptyStateHtml(){
    let msg = 'No places match your filters.';
    let actions = '';
    if(noBidetMode){
      msg = 'No spots recorded without a bidet here yet. Know one? Add it.';
      actions = '<button type="button" class="btn btn-primary" id="emptyAddBtn">Add a no-bidet spot</button>';
    } else if(nearMe && !getQuery()){
      msg = 'Nothing within ' + formatRadiusLabel(radiusMi) + '. Try a wider radius or search a city name.';
      actions = '<div class="empty-actions">' +
        (radiusMi < 100 ? '<button type="button" class="btn btn-ghost" id="emptyWidenBtn">Widen to ' + formatRadiusLabel(100) + '</button>' : '') +
        '<button type="button" class="btn btn-ghost" id="emptyNoBidetBtn">Show no-bidet spots</button>' +
        '<button type="button" class="btn btn-primary" id="emptyAddBtn">Add a spot</button></div>';
    } else if(nearMe && placeFilter === 'mosque'){
      msg = 'No masajid with bidets within ' + formatRadiusLabel(radiusMi) + '. Try a wider radius or search a nearby city.';
      actions = '<button type="button" class="btn btn-primary" id="emptyAddBtn">Add a spot</button>';
    } else if(placeFilter === 'mosque'){
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
    const verified = filtered.filter(m=>m.bidetStatus==='verified').length;
    const warmed = filtered.filter(m=>m.bidetStatus==='warmed').length;
    const internet = filtered.filter(m=>m.bidetStatus==='internet').length;
    const limited = filtered.filter(m=>m.access==='limited').length;
    const pub = filtered.length - limited;
    const masajid = filtered.filter(m=>m.type==='mosque').length;
    let countHtml;
    if(noBidetMode){
      countHtml = '<strong>'+filtered.length+'</strong> '+(filtered.length===1?'spot':'spots')+' recorded <em>without</em> a bidet';
    } else if(placeFilter==='restaurant'){
      countHtml = '<strong>'+filtered.length+'</strong> '+(filtered.length===1?'restaurant':'restaurants')+' with bidets';
    } else if(placeFilter==='mosque'){
      countHtml = '<strong>'+filtered.length+'</strong> '+(filtered.length===1?'masjid':'masajid')+' with bidets';
    } else {
      countHtml = '<strong>'+filtered.length+'</strong> '+(filtered.length===1?'place':'places');
    }
    if(nearMe) countHtml += ' within ' + formatRadiusLabel(radiusMi);
    const badges = [];
    if(masajid && placeFilter!=='mosque') badges.push(masajid+' masajid');
    const restaurants = filtered.filter(m=>m.type==='restaurant').length;
    if(restaurants && placeFilter!=='restaurant') badges.push(restaurants+' restaurants');
    if(pub && placeFilter==='all') badges.push(pub+' open access');
    if(limited) badges.push(limited+' guests only');
    if(verified) badges.push(verified+' verified');
    if(warmed) badges.push(warmed+' heated');
    if(internet) badges.push(internet+' web');
    if(badges.length) countHtml += '<div class="count-badges">'+badges.map(b=>'<span class="count-badge">'+b+'</span>').join('')+'</div>';
    document.getElementById('countLabel').innerHTML = countHtml;
    updateMobileTabBadge(filtered.length);
    if(!filtered.length){
      el.innerHTML = emptyStateHtml();
      wireEmptyStateActions();
      updateNearMeHint(filtered);
      return;
    }
    el.innerHTML = sortedLocations(filtered).slice(0, LIST_CAP).map(m=>{
      let dist='';
      if(nearMe && userLocation) dist = formatDistance(haversineMiles(userLocation,{lat:+m.latitude,lng:+m.longitude}));
      const limitedNote = m.bidetStatus==='none'
        ? '<p class="card-note card-note--none">We checked: no bidet or handheld sprayer here.</p>'
        : (m.access==='limited' ? '<p class="card-note">'+escapeHtml(m.accessNote)+'</p>' : '');
      const cardClass = 'card '+cardStatusClass(m)+(activeSpotId===m.id?' active':'');
      const typeIcon = typeLabel(m.type);
      const bidetLead = '<p class="card-bidet-lead">'+escapeHtml(bidetLeadLabel(m))+'</p>';
      const trust = '<p class="card-trust">'+escapeHtml(verificationPlainText(m))+'</p>';
      return '<article class="'+cardClass+'" data-id="'+m.id+'" tabindex="0" role="button" aria-label="'+escapeHtml(m.name)+'"><h3>'+highlight(m.name,q)+'</h3>'+bidetLead+'<div class="card-tags">'+statusTag(m)+accessTag(m)+'</div>'+(m.address?'<p class="addr">'+highlight(m.address,q)+'</p>':'')+(m.city?'<p class="loc">'+highlight(m.city,q)+(m.country?', '+highlight(m.country,q):'')+'</p>':'')+limitedNote+trust+'<div class="card-meta"><span class="tag tag-type">'+typeIcon+'</span>'+(dist?'<span class="dist card-foot">'+dist+'</span>':'')+'</div></article>';
    }).join('') + (filtered.length > LIST_CAP ? '<p class="sub list-cap-note">Showing '+LIST_CAP+' of '+filtered.length+'. Zoom the map or search to narrow results.</p>' : '');
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
  }

  function markersForMap(filtered){
    if(!filtered.length) return [];
    const q = getQuery();
    let rows = filtered;
    if(map && !q && !nearMe && !activeSpotId && filtered.length > 1200){
      const bounds = map.getBounds().pad(0.25);
      const inView = filtered.filter(m => bounds.contains([+m.latitude, +m.longitude]));
      if(inView.length) rows = inView;
    }
    if(rows.length > MAP_MARKER_CAP) return rows.slice(0, MAP_MARKER_CAP);
    return rows;
  }

  function renderMap(filtered){
    if(!clusterGroup) return;
    clusterGroup.clearLayers();
    markerById.clear();
    const mapRows = markersForMap(filtered);
    const markers = mapRows.map(m=>{
      const marker = L.marker([+m.latitude,+m.longitude],{icon:createIcon(m.bidetStatus,m.access)});
      marker.on('click',()=>{
        scrollToListCard(m.id);
        openDetail(m.id);
      });
      const tip = stripEmDash(m.access==='limited' ? m.name + ' (limited access)' : m.name);
      marker.bindTooltip(tip,{direction:'top',offset:[0,-12]});
      markerById.set(m.id, marker);
      return marker;
    });
    clusterGroup.addLayers(markers);
    if(highlightedMarkerId && markerById.has(highlightedMarkerId)){
      highlightMarker(highlightedMarkerId);
    }
    updateUserMarker();
    const shouldFit = !initialBoundsDone && filtered.length && !getQuery() && !nearMe && !activeSpotId;
    if(shouldFit){
      let fitTargets = filtered;
      if(!countryFilter){
        const usa = filtered.filter(m => m.country === 'USA');
        if(usa.length) fitTargets = usa;
      }
      const bounds = L.latLngBounds(fitTargets.map(m=>[+m.latitude,+m.longitude]));
      if(bounds.isValid()){
        map.fitBounds(bounds.pad(0.12),{maxZoom:10,animate:false});
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
  }

  function openDetail(id, fromUrl){
    const m=allLocations.find(x=>x.id===id);
    if(!m) return;
    activeSpotId = id;
    focusSpotOnMap(m);
    scrollToListCard(id);
    setDocumentTitleForSpot(m);
    const mobile = isMobile();
    const distLine = (nearMe && userLocation)
      ? '<p class="sub">' + formatDistance(haversineMiles(userLocation, { lat: +m.latitude, lng: +m.longitude })) + ' away</p>'
      : '';
    const source = m.sourceUrl ? '<p class="detail-source"><a href="'+escapeHtml(m.sourceUrl)+'" target="_blank" rel="noopener">View source ↗</a></p>' : '';
    const quote = m.sourceQuote ? '<blockquote class="source-quote"><strong>Review excerpt</strong>'+escapeHtml(m.sourceQuote)+'</blockquote>' : '';
    const verifyText = verificationPlainText(m);
    const trustLine = trustSourceLine(m);
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
        stickyFooter.innerHTML =
          '<div class="detail-footer-actions">'+
          '<a class="btn btn-primary" href="'+directionsUrl+'" target="_blank" rel="noopener">Directions</a>'+
          mapsBtn+
          '</div>'+
          '<div class="detail-footer-links">'+
          '<button type="button" class="detail-link-btn js-copy-spot-link">Share spot</button>'+
          '<span class="detail-footer-sep" aria-hidden="true">·</span>'+
          '<button type="button" class="detail-link-btn js-copy-address">Copy address</button>'+
          '</div>';
        stickyFooter.hidden = false;
        wireDetailButtons(stickyFooter, m, shareLink);
      } else {
        stickyFooter.innerHTML = '';
        stickyFooter.hidden = true;
      }
    }

    const desktopActions =
      '<div class="dialog-actions detail-actions detail-actions--desktop">'+
      '<a class="btn btn-primary" href="'+directionsUrl+'" target="_blank" rel="noopener">Directions</a>'+
      mapsBtn+
      '<button type="button" class="btn btn-ghost js-copy-spot-link">Share spot</button>'+
      '<button type="button" class="btn btn-ghost js-copy-address">Copy address</button>'+
      '<button type="button" class="btn btn-ghost js-report-no-bidet">Report no bidet here</button>'+
      '<button type="button" class="btn btn-ghost js-open-add-form">Add another</button>'+
      '</div>';

    const mobileSecondary =
      '<div class="detail-more-actions">'+
      '<button type="button" class="btn btn-ghost js-report-no-bidet">Report no bidet here</button>'+
      '<button type="button" class="btn btn-ghost js-open-add-form">Add another spot</button>'+
      '</div>';

    document.getElementById('detailContent').innerHTML =
      '<h2>'+escapeHtml(m.name)+'</h2>'+
      '<p class="sub">'+escapeHtml(typeLabel(m.type))+' · '+escapeHtml(m.city)+', '+escapeHtml(m.country)+'</p>'+
      distLine+
      '<p class="detail-bidet-callout">'+escapeHtml(bidetLeadLabel(m))+'</p>'+
      '<p class="detail-trust">'+escapeHtml(verifyText)+'</p>'+
      (m.bidetStatus==='none' ? '<div class="access-warn access-warn--none"><strong>No bidet here</strong>We\'ve recorded this spot as not having a bidet or handheld sprayer. Bring your own if you need one.</div>' : '')+
      accessWarn(m)+
      '<p class="detail-address">'+escapeHtml(m.address)+'</p>'+
      '<div class="row">'+statusTag(m)+accessTag(m)+'</div>'+
      trustHtml+quote+source+
      (mobile ? mobileSecondary : desktopActions)+
      reportFormHtml(m);
    const content = document.getElementById('detailContent');
    wireDetailButtons(content, m, shareLink);
    wireReportForm(content, m);
    setOverlayOpen('detailOverlay', true);
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

  function refresh(){
    lastFiltered = filterLocations();
    renderList(lastFiltered);
    renderMap(lastFiltered);
    if(nearMeFitPending && nearMe && userLocation){
      nearMeFitPending = false;
      const pins = lastFiltered;
      fitNearMeView(pins);
      if(map){
        setTimeout(()=>{
          map.invalidateSize();
          fitNearMeView(pins);
        }, 0);
      }
    }
    updateFilterUi();
    updateUserMarker();
    syncUrlFromState();
    if(map && !(nearMe && userLocation)) setTimeout(()=>map.invalidateSize(), 0);
  }

  function scheduleRefresh(){
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(()=>{ refreshTimer = null; refresh(); }, 220);
  }

  function scheduleMapRefresh(){
    clearTimeout(mapMoveTimer);
    mapMoveTimer = setTimeout(()=>{
      mapMoveTimer = null;
      if(clusterGroup && lastFiltered.length && !getQuery() && !nearMe && !activeSpotId) renderMap(lastFiltered);
    }, 180);
  }

  function resetAddForm(){
    ['addName','addAddress','addNotes','addPhoto'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.value='';
    });
    setAddHasBidet('verified');
  }

  function getAddHasBidet(){
    return document.getElementById('addHasBidet')?.value || 'verified';
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
      photo_link: payload.photoLink || '(none)',
      lookup_link: mapsQuery
        ? ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapsQuery))
        : '(none)',
      botcheck: ''
    };
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
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

  function showLoadToast(){
    const t = document.getElementById('loadToast');
    if(!t) return;
    t.textContent = allLocations.length + ' spots loaded';
    t.classList.add('show');
    setTimeout(()=> t.classList.remove('show'), 2800);
  }

  function hideSearchAc(){ document.getElementById('searchAc')?.setAttribute('hidden',''); }

  function renderSearchAc(){
    const q = getQuery();
    const box = document.getElementById('searchAc');
    searchAcIndex = -1;
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
    const nq = normalizeSearchText(q);
    const placeMatches = allLocations
      .filter(m => matchesSearch(m, q))
      .sort((a, b) => searchScore(b, q) - searchScore(a, q))
      .slice(0, 6);
    const cityMatches = [...new Set(
      allLocations
        .filter(m => normalizeSearchText(m.city).includes(nq))
        .map(m => m.city.split(',')[0].trim())
    )].slice(0, 3);
    const items = [];
    placeMatches.forEach(m => {
      const hint = m._search.acronym ? m._search.acronym.toUpperCase() : '';
      items.push({
        fill: m.name,
        label: m.name,
        hint: hint + (m.city ? ' · ' + m.city.split(',')[0].trim() : '')
      });
    });
    cityMatches.forEach(c => {
      if(!items.some(i => i.fill === c)) items.push({ fill: c, label: c, hint: 'City' });
    });
    if(!items.length){ hideSearchAc(); return; }
    box.innerHTML = items.slice(0, 8).map(it =>
      '<button type="button" class="search-ac-item" data-value="'+escapeHtml(it.fill)+'">'+
      '<span class="search-ac-label">'+highlight(it.label, q)+'</span>'+
      (it.hint ? '<span class="search-ac-hint">'+escapeHtml(it.hint)+'</span>' : '')+
      '</button>'
    ).join('');
    box.removeAttribute('hidden');
    wireSearchAcItems(box);
  }

  function wireSearchAcItems(box){
    box.querySelectorAll('.search-ac-item').forEach(btn=>btn.addEventListener('click', ()=>{
      document.getElementById('searchInput').value = btn.dataset.value;
      hideSearchAc();
      saveRecentSearch(btn.dataset.value);
      if(isMobile()) setMobileView('list');
      refresh();
      maybeShowPromo('search');
    }));
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
      btn.click();
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

  function initMap(){
    map = L.map('map',{
      zoomControl:true,
      minZoom:MAP_MIN_ZOOM,
      worldCopyJump:true
    }).setView([DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng], DEFAULT_MAP_ZOOM);
    map.createPane('countriesPane');
    map.getPane('countriesPane').style.zIndex = 350;
    addCartoVoyagerTiles(map, true, false);
    // Defer the (network + parse + polygon render) country overlay so it never
    // competes with first paint, tiles, or marker rendering.
    const loadCountries = () => loadBidetFriendlyCountries();
    if('requestIdleCallback' in window) requestIdleCallback(loadCountries, { timeout: 3000 });
    else setTimeout(loadCountries, 1200);
    clusterGroup = L.markerClusterGroup({
      maxClusterRadius:40,
      chunkedLoading:true,
      chunkInterval:80,
      chunkDelay:8,
      removeOutsideVisibleBounds:true,
      iconCreateFunction:c=>L.divIcon({
        html:'<div style="background:#047857;color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-weight:700;border:2px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.18)">'+c.getChildCount()+'</div>',
        className:'custom-marker', iconSize:[36,36]
      })
    });
    map.addLayer(clusterGroup);
    clusterGroup.on('clusterclick', e=>{
      const cluster = e.layer;
      const childCount = cluster.getChildCount();
      if(childCount <= 12){
        map.fitBounds(cluster.getBounds().pad(0.15), { maxZoom: 16, animate: true });
      } else {
        map.fitBounds(cluster.getBounds().pad(0.08), { maxZoom: 14, animate: true });
      }
    });
    map.on('moveend', scheduleMapRefresh);
    map.on('zoomend', scheduleMapRefresh);
    map.zoomControl.setPosition(isMobile() ? 'topright' : 'bottomright');
    const mobileMq = window.matchMedia('(max-width:820px)');
    mobileMq.addEventListener('change', e=>{
      map.zoomControl.setPosition(e.matches ? 'topright' : 'bottomright');
      setTimeout(()=>map.invalidateSize(), 100);
    });
    setTimeout(()=>{ if(map) map.invalidateSize(); }, 150);
    if(window.visualViewport){
      window.visualViewport.addEventListener('resize',()=>{ if(map) map.invalidateSize(); });
    }
    window.addEventListener('resize',()=>{ if(map) map.invalidateSize(); });
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

  function requestNearMe(){
    if(!navigator.geolocation){ alert('Geolocation not supported.'); return; }
    navigator.geolocation.getCurrentPosition(pos=>{
      userLocation = {lat:pos.coords.latitude,lng:pos.coords.longitude};
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
    },()=>alert('Could not get your location.'));
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
      '<button type="button" class="filter-toggle'+(showLimitedAccess?' active':'')+'" data-sheet="limited">Guests only</button>'+
      '<button type="button" class="filter-toggle'+(noBidetMode?' active':'')+'" data-sheet="nobidet">No bidet</button>'+
      '</div></div>'+
      '<div class="filter-sheet-section"><span class="filter-sheet-label">More</span>'+
      '<div class="more-panel" id="sheetTypeChips">'+
      ['verified','warmed','internet','public','limited','USA','UK','Canada','France','Russia','China'].map(t =>
        '<button type="button" class="chip'+((COUNTRY_FILTERS.includes(t)?countryFilter===t:extraFilter===t)?' active':'')+'" data-type="'+t+'">'+t+'</button>'
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
    initPromoPopup();

    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', ()=>{
      renderSearchAc();
      if(isMobile() && searchInput.value.trim().length >= 2) setMobileView('list');
      scheduleRefresh();
    });
    searchInput.addEventListener('focus', renderSearchAc);
    searchInput.addEventListener('blur', ()=> setTimeout(hideSearchAc, 180));
    searchInput.addEventListener('keydown', e=>{
      if(e.key === 'ArrowDown'){ e.preventDefault(); moveSearchAc(1); return; }
      if(e.key === 'ArrowUp'){ e.preventDefault(); moveSearchAc(-1); return; }
      if(e.key === 'Enter'){
        if(selectSearchAcIndex()) return;
        hideSearchAc();
        saveRecentSearch(searchInput.value.trim());
        maybeShowPromo('search');
      }
    });

    document.querySelectorAll('.quick-chip').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const q = btn.dataset.quick;
        if(q === 'no-bidet'){ setNoBidetMode(true); return; }
        placeFilter = q === 'near-masjid' ? 'mosque' : 'restaurant';
        updateFilterUi();
        requestNearMe();
      });
    });

    document.querySelectorAll('#placeFilter button').forEach(btn=>{
      btn.addEventListener('click',()=>{
        placeFilter = btn.dataset.type;
        updateFilterUi();
        refresh();
      });
    });
    document.getElementById('noBidetToggle')?.addEventListener('click',()=>{
      setNoBidetMode(!noBidetMode);
    });
    document.getElementById('limitedAccessToggle')?.addEventListener('click',()=>{
      setShowLimitedAccess(!showLimitedAccess);
    });
    document.querySelectorAll('#typeChips .chip').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const t = btn.dataset.type;
        if(COUNTRY_FILTERS.includes(t)){
          countryFilter = countryFilter === t ? null : t;
        } else if(extraFilter===t){
          extraFilter = null;
        } else {
          extraFilter = t;
          if(t === 'limited') showLimitedAccess = true;
          // Bidet-status chips are meaningless while viewing no-bidet spots.
          if(t==='verified' || t==='warmed' || t==='internet') noBidetMode = false;
        }
        updateFilterUi();
        refresh();
      });
    });
    document.querySelectorAll('#radiusRow button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        radiusMi = parseInt(btn.dataset.radius, 10);
        if(nearMe) nearMeFitPending = true;
        updateFilterUi();
        refresh();
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
      document.getElementById('menuDrop').hidden = true;
      copyViewLink();
    });
    // Notify-me-for-a-city disabled

    document.getElementById('mobileFilterBtn')?.addEventListener('click', ()=>{
      buildFilterSheet();
      setOverlayOpen('filterSheetOverlay', true);
    });
    document.getElementById('filterSheetClose')?.addEventListener('click', ()=> setOverlayOpen('filterSheetOverlay', false));
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
    document.getElementById('footerAbout')?.addEventListener('click', e=>{ e.preventDefault(); setOverlayOpen('aboutOverlay', true); });
    const footerYear = document.getElementById('footerYear');
    if(footerYear) footerYear.textContent = String(new Date().getFullYear());
    document.getElementById('addBtn').addEventListener('click',()=> openAddForm('header'));
    document.getElementById('detailContent').addEventListener('click', e=>{
      if(e.target.closest('.js-open-add-form')){
        setOverlayOpen('detailOverlay', false);
        openAddForm('detail');
      }
    });
    document.getElementById('addClose').addEventListener('click',()=>{ setOverlayOpen('addOverlay', false); resetAddForm(); });
    document.getElementById('detailClose').addEventListener('click',()=> setOverlayOpen('detailOverlay', false));
    document.getElementById('thankYouClose')?.addEventListener('click', ()=> setOverlayOpen('thankYouOverlay', false));
    ['detailOverlay','addOverlay','aboutOverlay','thankYouOverlay','legendOverlay','filterSheetOverlay'].forEach(id=>{
      const node = document.getElementById(id);
      if(node) node.addEventListener('click',e=>{ if(e.target.id===id) setOverlayOpen(id, false); });
    });
    document.addEventListener('keydown',e=>{
      if(e.key==='/' && !isTypingTarget(document.activeElement)){
        e.preventDefault();
        searchInput.focus();
        return;
      }
      if(e.key==='Escape'){
        hideSearchAc();
        document.getElementById('menuDrop').hidden = true;
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
      if(document.getElementById('addHoney').value) return;
      const name=document.getElementById('addName').value.trim();
      if(!name){
        alert('Please enter a place name.');
        document.getElementById('addName')?.focus();
        return;
      }
      const bidetStatus = getAddHasBidet();
      const payload={
        name,
        address: document.getElementById('addAddress').value.trim(),
        bidetStatus,
        notes: document.getElementById('addNotes').value.trim(),
        photoLink: document.getElementById('addPhoto')?.value.trim() || ''
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

  function bootWithSeed(seed){
    window.BIDETBUD_SEED = seed || [];
    initData();
    applyDistanceUnits();
    refresh();
    showLoadToast();
    maybeShowFirstRunHints();
    if(spotFromUrl) setTimeout(()=> openDetail(spotFromUrl, true), 400);
    if (typeof window.trackEvent === 'function') {
      window.trackEvent('bidetbud_view', { spots: String(allLocations.length) });
    }
  }

  window.addEventListener('bidetbud-seed-update', e=>{
    const fresh = e.detail;
    if(!Array.isArray(fresh) || !fresh.length) return;
    const prev = window.BIDETBUD_SEED || [];
    if(fresh.length === prev.length && fresh[fresh.length - 1]?.name === prev[prev.length - 1]?.name) return;
    bootWithSeed(fresh);
  });

  const seedPromise = window.__BIDET_SEED_P
    || fetch('bidet-seed.json', { credentials: 'same-origin' })
        .then(r => { if(!r.ok) throw new Error('Could not load map data'); return r.json(); });

  seedPromise.then(bootWithSeed).catch(err => {
    console.error(err);
    let cached = null;
    try{
      cached = JSON.parse(localStorage.getItem('bb_seed_cache_20260817a') || 'null');
    }catch(e){}
    const el = document.getElementById('countLabel');
    if(Array.isArray(cached) && cached.length){
      if(el) el.textContent = 'Showing cached spots (offline). Refresh when online.';
      bootWithSeed(cached);
      return;
    }
    if(el) el.innerHTML = 'Could not load spots. <button type="button" class="inline-link" id="retryLoadBtn">Retry</button>';
    document.getElementById('retryLoadBtn')?.addEventListener('click', ()=> location.reload());
    bootWithSeed([]);
  });
})();
