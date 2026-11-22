/* POTA Rare Parks: static, no build step. Data comes from data/parks.json,
   which scripts/update-data.mjs generates from the public pota.app API. */
(function () {
  'use strict';

  const SETTINGS_KEY = 'potaRare.settings.v1';
  const MINE_KEY = 'potaRare.myActivations.v1';
  const RINGS_MI = [50, 100, 200, 300, 400];
  const M_PER_MI = 1609.344;
  const UNCLUSTER_ZOOM = 10;

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n).toLocaleString('en-US');

  // ---------- storage (everything personal stays in this browser) ----------
  function load(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v && typeof v === 'object' ? v : fallback;
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  // ---------- derived fields ----------
  const TYPES = [
    ['National Trail', /National (Historic|Scenic|Recreation) Trail/i],
    ['State Historic Site', /State Histori(c|cal) (Site|Park)|Historic State Park/i],
    ['State Park', /State Park$/i],
    ['Trail', /Trail$/i],
    ['National Wildlife Refuge', /National Wildlife Refuge|National Fish Hatchery/i],
    ['Wetland / Waterfowl Area', /Wetland Management District|Waterfowl Production Area/i],
    ['National Forest / Grassland', /National (Forest|Grassland)/i],
    ['National Park Service', /National (Park|Monument|Memorial|Historic Site|Historical Park|Battlefield|Preserve|Recreation Area|Recreational River|Scenic River|Wild and Scenic)/i],
    ['State Recreation Area', /State (Vehicle )?Recreation(al)? Area/i],
    ['Conservation Area', /Conservation (Area|Reserve)/i],
    ['Wildlife Area', /Wildlife (Management )?Area/i],
    ['State Fishing Lake', /State Fishing Lake|Fish Hatchery/i],
    ['State Forest', /State Forest/i],
    ['Natural Area / Preserve', /Natur(al|e) (Area|Preserve)|State Preserve/i],
  ];
  function parkType(name) {
    for (const [label, re] of TYPES) if (re.test(name)) return label;
    return 'Other';
  }

  // Flags are a rough reading of the free-text notes. They err toward
  // flagging; always read the note itself before driving out.
  const FLAGS = [
    ['closed', 'closed / seasonal', /\bclosed\b|\bclosures?\b|seasonal|prohibited|\bopen (may|april|memorial|from)\b|no public access/i],
    ['access', 'hike / boat / rough road', /hike[- ]?in|walk[- ]?in|accessed on foot|on foot only|only by (boat|foot)|boat\/canoe|high clearance|4x4|4wd|minimum maintenance|no vehicle access/i],
    ['permit', 'permit', /permit|licen[cs]e|sticker/i],
    ['fee', 'fee', /\$\s?\d|\bfees?\b|day pass|vehicle pass|admission/i],
  ];
  function noteFlags(notes) {
    if (!notes) return [];
    const text = notes
      // South Dakota boilerplate about winterised plumbing is not a closure
      .replace(/showers,? flush toilets and other water systems may be closed\.?/gi, ' ')
      .replace(/water systems may be closed\.?/gi, ' ')
      // "no fee" style statements are good news, not a warning
      .replace(/\b(there (are|is) )?no (entrance |entry |access |admission )?fees?( (is|are))?( required)?/gi, ' ')
      .replace(/free entry|used to be a fee/gi, ' ')
      .replace(/(park |entry |vehicle )?permit (is |are )?not required/gi, ' ')
      .replace(/special permit/gi, ' ');
    return FLAGS.filter(([, , re]) => re.test(text)).map(([key, label]) => ({ key, label }));
  }

  function colorClass(n) {
    return n <= 3 ? 'c0' : n <= 5 ? 'c1' : n <= 8 ? 'c2' : n <= 12 ? 'c3' : 'c4';
  }
  function shortNum(n) {
    return n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  }
  function miles(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180;
    const a =
      Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
    return 3958.7613 * 2 * Math.asin(Math.sqrt(a));
  }
  const stateAbbr = (desc) => desc.split(',').map((s) => s.replace(/^US-/, ''));

  // ---------- CSV ----------
  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
        } else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  }
  function csvCell(v) {
    let s = String(v ?? '');
    // Stop spreadsheet apps from treating a cell as a formula
    if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function download(name, mime, text) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- state ----------
  let config, parks = [], visible = [], selectedRef = null;
  let mine = load(MINE_KEY, {});
  let settings;
  const markers = new Map();
  let map, cluster, homeMarker, ringLayer;

  const canHover = window.matchMedia('(hover: hover)').matches;

  function saveSettings() { save(SETTINGS_KEY, settings); }

  function computeDistances() {
    for (const p of parks) p.distance = miles(settings.home.lat, settings.home.lon, p.latitude, p.longitude);
  }

  // ---------- map ----------
  function initMap() {
    map = L.map('map', { zoomControl: true, worldCopyJump: true }).setView([settings.home.lat, settings.home.lon], 7);
    // Standard OSM tiles: attribution shown, no prefetching or bulk download,
    // browser caching left on, per https://operations.osmfoundation.org/policies/tiles/
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · park data: <a href="https://pota.app">Parks on the Air</a>',
    }).addTo(map);

    ringLayer = L.layerGroup().addTo(map);
    cluster = L.markerClusterGroup({
      maxClusterRadius: 26,
      disableClusteringAtZoom: UNCLUSTER_ZOOM,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      iconCreateFunction(c) {
        const kids = c.getAllChildMarkers();
        const rarest = Math.min(...kids.map((m) => m.park.activations));
        return L.divIcon({
          className: 'cluster-icon',
          html: `<div class="cluster ${colorClass(rarest)}" title="${kids.length} parks, rarest has ${rarest} activations">×${kids.length}</div>`,
          iconSize: [38, 38],
        });
      },
    }).addTo(map);

    homeMarker = L.marker([settings.home.lat, settings.home.lon], {
      draggable: true,
      zIndexOffset: 1000,
      title: 'Home (drag to move)',
      icon: L.divIcon({ className: 'home-icon', html: '<div class="home-pin">⌂</div>', iconSize: [28, 28] }),
    }).addTo(map);
    homeMarker.on('dragend', () => {
      const ll = homeMarker.getLatLng();
      setHome(ll.lat, ll.lng, false);
    });
    drawRings();
  }

  function drawRings() {
    ringLayer.clearLayers();
    const { lat, lon } = settings.home;
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    for (const mi of RINGS_MI) {
      L.circle([lat, lon], {
        radius: mi * M_PER_MI,
        color: dark ? '#b9c2cc' : '#3a4450',
        weight: 1.5,
        dashArray: '6 6',
        fill: false,
        interactive: false,
      }).addTo(ringLayer);
      L.marker([lat + mi / 69.047, lon], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: 'ring-label', html: `<span>${mi} mi</span>`, iconSize: [0, 0] }),
      }).addTo(ringLayer);
    }
  }

  function fitToDistance() {
    const { lat, lon } = settings.home;
    const dLat = settings.dist / 69.047;
    const dLon = dLat / Math.cos((lat * Math.PI) / 180);
    map.fitBounds([[lat - dLat, lon - dLon], [lat + dLat, lon + dLon]], { padding: [10, 10] });
  }

  function iconFor(p) {
    const label = shortNum(p.activations);
    const cls = ['dot', colorClass(p.activations)];
    if (mine[p.reference]) cls.push('mine');
    if (label.length > 2) cls.push('small');
    if (p.reference === selectedRef) cls.push('sel');
    return L.divIcon({ className: 'park-icon', html: `<span class="${cls.join(' ')}">${label}</span>`, iconSize: [26, 26] });
  }

  function flagsHtml(p) {
    return p.flags.map((f) => `<span class="flag ${f.key}">${esc(f.label)}</span>`).join('');
  }

  function tooltipHtml(p) {
    const notes = p.notes.length > 180 ? p.notes.slice(0, 180) + '…' : p.notes;
    return `<div class="tip"><b>${esc(p.name)}</b><br>${esc(p.reference)} · ${esc(stateAbbr(p.locationDesc).join(', '))}<br>` +
      `${fmt(p.activations)} activations · ${fmt(p.attempts)} attempts · ${fmt(p.qsos)} QSOs<br>` +
      `${Math.round(p.distance)} mi from home` +
      (mine[p.reference] ? `<br>You: ${mine[p.reference]} activation(s)` : '') +
      (p.flags.length ? `<br>${flagsHtml(p)}` : '') +
      (notes ? `<br><i>${esc(notes)}</i>` : '') + '</div>';
  }

  function popupHtml(p) {
    const states = stateAbbr(p.locationDesc);
    const dest = `${p.latitude},${p.longitude}`;
    const links = [
      `<a href="https://pota.app/#/park/${encodeURIComponent(p.reference)}" target="_blank" rel="noopener">pota.app page</a>`,
      `<a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}" target="_blank" rel="noopener">Directions</a>`,
    ];
    if (/^https?:\/\//i.test(p.website)) links.push(`<a href="${esc(p.website)}" target="_blank" rel="noopener noreferrer">Park website</a>`);
    return `<div class="pop"><h2>${esc(p.name)}</h2>` +
      `<p class="sub">${esc(p.reference)} · ${esc(states.join(', '))} · ${esc(p.type)} · ${esc(p.grid)}</p>` +
      `<dl><dt>Activations</dt><dd><b>${fmt(p.activations)}</b></dd>` +
      `<dt>Attempts</dt><dd>${fmt(p.attempts)}</dd>` +
      `<dt>QSOs</dt><dd>${fmt(p.qsos)}</dd>` +
      `<dt>From home</dt><dd>${Math.round(p.distance)} mi (straight line)</dd>` +
      (mine[p.reference] ? `<dt>Mine</dt><dd>${fmt(mine[p.reference])} activation(s)</dd>` : '') + '</dl>' +
      (p.flags.length ? `<div>${flagsHtml(p)}</div>` : '') +
      (states.length > 1 ? `<p class="notes"><i>Spans ${states.length} states. The dot is a single reference point, not the whole park.</i></p>` : '') +
      (p.notes ? `<p class="notes">${esc(p.notes)}</p>` : '') +
      `<div class="links">${links.join('')}</div></div>`;
  }

  function markerFor(p) {
    let m = markers.get(p.reference);
    if (!m) {
      m = L.marker([p.latitude, p.longitude], { title: canHover ? '' : p.name, riseOnHover: true });
      m.park = p;
      m.bindPopup(() => popupHtml(p), { maxWidth: 300, autoPanPadding: [20, 20] });
      if (canHover) m.bindTooltip(() => tooltipHtml(p), { direction: 'top', offset: [0, -12], opacity: 1 });
      m.on('click', () => select(p.reference, { fromMap: true }));
      markers.set(p.reference, m);
    }
    m.setIcon(iconFor(p));
    return m;
  }

  // ---------- filtering, list ----------
  function applyFilters() {
    const q = settings.search.trim().toLowerCase();
    const states = new Set(settings.states);
    visible = parks.filter((p) =>
      p.distance <= settings.dist &&
      p.activations <= settings.act &&
      p.locationDesc.split(',').some((s) => states.has(s)) &&
      (!settings.type || p.type === settings.type) &&
      (!settings.hideMine || !mine[p.reference]) &&
      (!settings.easyOnly || p.flags.length === 0) &&
      (!q || p.name.toLowerCase().includes(q) || p.reference.toLowerCase().includes(q))
    );
    sortVisible();
  }

  function sortVisible() {
    const dir = settings.sortDir === 'desc' ? -1 : 1;
    const key = settings.sortKey;
    const primary = {
      activations: (a, b) => a.activations - b.activations,
      distance: (a, b) => a.distance - b.distance,
      name: (a, b) => a.name.localeCompare(b.name),
      state: (a, b) => a.locationDesc.localeCompare(b.locationDesc),
    }[key];
    visible.sort((a, b) =>
      primary(a, b) * dir ||
      (key === 'activations' ? a.distance - b.distance : a.activations - b.activations || a.distance - b.distance)
    );
  }

  function render() {
    applyFilters();

    cluster.clearLayers();
    cluster.addLayers(visible.map(markerFor));

    const tbody = document.querySelector('#list tbody');
    if (!visible.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">No parks match. Try raising the distance or activation sliders.</td></tr>';
    } else {
      tbody.innerHTML = visible.map((p) => {
        const cls = ['dot', colorClass(p.activations)];
        if (mine[p.reference]) cls.push('mine');
        const label = shortNum(p.activations);
        if (label.length > 2) cls.push('small');
        return `<tr data-ref="${esc(p.reference)}"${p.reference === selectedRef ? ' class="sel"' : ''}>` +
          `<td class="num"><span class="${cls.join(' ')}">${label}</span></td>` +
          `<td>${esc(p.name)}<br><span class="ref">${esc(p.reference)}</span> ${flagsHtml(p)}</td>` +
          `<td>${esc(stateAbbr(p.locationDesc).slice(0, 3).join(', '))}${p.locationDesc.split(',').length > 3 ? '…' : ''}</td>` +
          `<td class="num">${Math.round(p.distance)}</td></tr>`;
      }).join('');
    }

    const mineShown = visible.filter((p) => mine[p.reference]).length;
    $('count').textContent =
      `${visible.length} of ${parks.length} parks shown` + (mineShown ? ` · ${mineShown} already activated by you` : '');

    document.querySelectorAll('#list thead th').forEach((th) => {
      if (th.dataset.sort === settings.sortKey) th.setAttribute('aria-sort', settings.sortDir === 'desc' ? 'descending' : 'ascending');
      else th.removeAttribute('aria-sort');
    });
  }

  let renderQueued = false;
  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    setTimeout(() => { renderQueued = false; render(); }, 40);
  }

  function select(ref, { fromMap = false } = {}) {
    const prev = selectedRef;
    selectedRef = ref;
    for (const r of [prev, ref]) {
      const m = r && markers.get(r);
      if (m) m.setIcon(iconFor(m.park));
    }
    document.querySelectorAll('#list tbody tr.sel').forEach((tr) => tr.classList.remove('sel'));
    const row = document.querySelector(`#list tbody tr[data-ref="${CSS.escape(ref)}"]`);
    if (row) {
      row.classList.add('sel');
      if (fromMap) row.scrollIntoView({ block: 'nearest' });
    }
    if (!fromMap) {
      const m = markers.get(ref);
      if (!m) return;
      if (window.matchMedia('(max-width: 800px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
      // Zoom at least far enough that clustering is off, then open the popup
      // once the marker is actually on the map.
      map.closePopup();
      map.setView(m.getLatLng(), Math.max(map.getZoom(), UNCLUSTER_ZOOM));
      let tries = 0;
      const open = () => {
        if (selectedRef !== ref) return;
        if (m._map && m._icon) m.openPopup();
        else if (tries++ < 40) setTimeout(open, 100);
      };
      setTimeout(open, 150);
    }
  }

  // ---------- home ----------
  function setHome(lat, lon, moveMarker = true) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      alert('Home needs a latitude between -90 and 90 and a longitude between -180 and 180.');
      return;
    }
    settings.home = { lat: +lat.toFixed(5), lon: +lon.toFixed(5) };
    saveSettings();
    $('homeLat').value = settings.home.lat;
    $('homeLon').value = settings.home.lon;
    if (moveMarker) homeMarker.setLatLng([lat, lon]);
    drawRings();
    computeDistances();
    render();
    if (moveMarker) fitToDistance();
  }

  // ---------- my activations ----------
  function mineStatus(msg) {
    const n = Object.keys(mine).length;
    $('mineStatus').textContent = msg || (n ? `${n} activated park(s) remembered in this browser.` : 'Nothing loaded. Download a park list CSV from pota.app while signed in, then load it here. It never leaves this browser.');
  }
  async function loadMyCsv(files) {
    let rowsRead = 0, activated = 0;
    const problems = [];
    for (const file of files) {
      const rows = parseCsv(await file.text());
      const head = (rows[0] || []).map((h) => h.trim().toLowerCase());
      const iRef = head.indexOf('reference');
      const iMine = head.indexOf('my_activations');
      if (iRef < 0 || iMine < 0) {
        problems.push(`${file.name}: no "reference" and "my_activations" columns. Export the CSV from pota.app while signed in.`);
        continue;
      }
      for (const r of rows.slice(1)) {
        const ref = (r[iRef] || '').trim().toUpperCase();
        if (!/^[A-Z0-9]{1,4}-\d{3,6}$/.test(ref)) continue;
        const n = parseInt(r[iMine], 10) || 0;
        rowsRead++;
        if (n > 0) { mine[ref] = n; activated++; } else delete mine[ref];
      }
    }
    save(MINE_KEY, mine);
    render();
    mineStatus(
      (rowsRead ? `Read ${rowsRead} parks, ${activated} with your activations. ${Object.keys(mine).length} remembered in total.` : '') +
      (problems.length ? ' ' + problems.join(' ') : '')
    );
  }

  // ---------- exports ----------
  function exportCsv() {
    const cols = ['reference', 'name', 'latitude', 'longitude', 'grid', 'locationDesc', 'attempts', 'activations', 'qsos', 'website', 'notes'];
    const lines = [[...cols, 'distance_mi', 'type', 'flags', 'my_activations'].join(',')];
    for (const p of visible) {
      lines.push([...cols.map((c) => p[c]), p.distance.toFixed(1), p.type, p.flags.map((f) => f.key).join(' '), mine[p.reference] || 0].map(csvCell).join(','));
    }
    download('pota-rare-parks.csv', 'text/csv;charset=utf-8', '﻿' + lines.join('\r\n') + '\r\n');
  }
  function exportGpx() {
    const wpts = visible.map((p) => {
      const desc = `${p.activations} activations, ${p.attempts} attempts, ${p.qsos} QSOs, ${Math.round(p.distance)} mi from home.` +
        (p.flags.length ? ` Flags: ${p.flags.map((f) => f.label).join(', ')}.` : '') + (p.notes ? ` ${p.notes}` : '');
      return `  <wpt lat="${p.latitude}" lon="${p.longitude}">\n    <name>${esc(p.reference + ' ' + p.name)}</name>\n` +
        `    <desc>${esc(desc)}</desc>\n    <link href="https://pota.app/#/park/${esc(p.reference)}"><text>pota.app</text></link>\n` +
        `    <sym>Park</sym>\n    <type>POTA</type>\n  </wpt>`;
    });
    download('pota-rare-parks.gpx', 'application/gpx+xml',
      `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="POTA Rare Parks" xmlns="http://www.topografix.com/GPX/1/1">\n` +
      `  <metadata><name>POTA Rare Parks</name><time>${new Date().toISOString()}</time></metadata>\n${wpts.join('\n')}\n</gpx>\n`);
  }

  // ---------- wiring ----------
  function wireControls() {
    const dist = $('dist'), act = $('act');
    dist.value = settings.dist;
    act.value = settings.act;
    const labels = () => { $('distVal').textContent = dist.value; $('actVal').textContent = act.value; };
    labels();
    dist.addEventListener('input', () => { settings.dist = +dist.value; labels(); saveSettings(); queueRender(); });
    dist.addEventListener('change', fitToDistance);
    act.addEventListener('input', () => { settings.act = +act.value; labels(); saveSettings(); queueRender(); });

    $('search').value = settings.search;
    $('search').addEventListener('input', (e) => { settings.search = e.target.value; saveSettings(); queueRender(); });

    $('states').innerHTML = config.states.map((s) =>
      `<label title="${esc(s.name)}"><input type="checkbox" value="${esc(s.code)}"${settings.states.includes(s.code) ? ' checked' : ''}> ${esc(s.code.replace(/^US-/, ''))}</label>`).join('');
    $('states').addEventListener('change', () => {
      settings.states = [...document.querySelectorAll('#states input:checked')].map((i) => i.value);
      saveSettings(); render();
    });

    const counts = {};
    for (const p of parks) counts[p.type] = (counts[p.type] || 0) + 1;
    $('type').insertAdjacentHTML('beforeend', Object.keys(counts).sort().map((t) => `<option value="${esc(t)}">${esc(t)} (${counts[t]})</option>`).join(''));
    if (!counts[settings.type]) settings.type = '';
    $('type').value = settings.type;
    $('type').addEventListener('change', (e) => { settings.type = e.target.value; saveSettings(); render(); });

    for (const id of ['hideMine', 'easyOnly']) {
      $(id).checked = !!settings[id];
      $(id).addEventListener('change', (e) => { settings[id] = e.target.checked; saveSettings(); render(); });
    }

    document.querySelector('#list thead').addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      if (settings.sortKey === th.dataset.sort) settings.sortDir = settings.sortDir === 'asc' ? 'desc' : 'asc';
      else { settings.sortKey = th.dataset.sort; settings.sortDir = 'asc'; }
      saveSettings(); render();
    });
    document.querySelector('#list tbody').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-ref]');
      if (tr) select(tr.dataset.ref);
    });

    $('exportCsv').addEventListener('click', exportCsv);
    $('exportGpx').addEventListener('click', exportGpx);

    $('loadCsv').addEventListener('click', () => $('csvFile').click());
    $('csvFile').addEventListener('change', async (e) => {
      if (e.target.files.length) await loadMyCsv([...e.target.files]);
      e.target.value = '';
    });
    $('clearMine').addEventListener('click', () => {
      if (!Object.keys(mine).length || !confirm('Forget your activations stored in this browser?')) return;
      mine = {};
      try { localStorage.removeItem(MINE_KEY); } catch {}
      render(); mineStatus();
    });
    mineStatus();

    $('homeLat').value = settings.home.lat;
    $('homeLon').value = settings.home.lon;
    $('homeSet').addEventListener('click', () => setHome(parseFloat($('homeLat').value), parseFloat($('homeLon').value)));
    $('homeReset').addEventListener('click', () => setHome(config.home.lat, config.home.lon));
    $('homeLocate').addEventListener('click', () => {
      if (!navigator.geolocation) return alert('This browser does not offer location.');
      navigator.geolocation.getCurrentPosition(
        (pos) => setHome(pos.coords.latitude, pos.coords.longitude),
        (err) => alert('Could not get your location: ' + err.message),
        { timeout: 15000 }
      );
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawRings);
  }

  async function getJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  }

  async function start() {
    try {
      let meta, raw;
      [config, raw, meta] = await Promise.all([getJson('../config.json'), getJson('../data/parks.json'), getJson('../data/meta.json')]);

      const stored = load(SETTINGS_KEY, {});
      const codes = config.states.map((s) => s.code);
      settings = {
        dist: 200, act: 10, search: '', type: '', hideMine: false, easyOnly: false,
        sortKey: 'activations', sortDir: 'asc',
        ...stored,
        home: stored.home && Number.isFinite(stored.home.lat) && Number.isFinite(stored.home.lon) ? stored.home : { lat: config.home.lat, lon: config.home.lon },
      };
      // States added to config.json later are switched on automatically
      const known = new Set(stored.knownStates || []);
      settings.states = codes.filter((c) => !known.has(c) || (stored.states || []).includes(c));
      settings.knownStates = codes;
      if (!['activations', 'distance', 'name', 'state'].includes(settings.sortKey)) settings.sortKey = 'activations';

      parks = raw
        .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
        .map((p) => ({ ...p, type: parkType(p.name), flags: noteFlags(p.notes) }));
      computeDistances();

      const when = new Date(meta.generatedAt);
      $('updated').textContent = 'Data last updated: ' + when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      $('updated').title = meta.generatedAt;
      if (config.repo && !/^OWNER\//.test(config.repo)) {
        $('actionsLink').href = `https://github.com/${config.repo}/actions/workflows/update-data.yml`;
        $('actionsLink').hidden = false;
      }

      $('filters').open = !window.matchMedia('(max-width: 800px)').matches;
      initMap();
      wireControls();
      fitToDistance();
      render();
      // Until you touch the map, keep it fitted to the distance slider when the
      // map changes size (page loaded in a background tab, phone rotated, etc.)
      let touched = false, lastSize = '';
      const container = $('map');
      for (const ev of ['pointerdown', 'wheel', 'keydown']) container.addEventListener(ev, () => { touched = true; }, { passive: true });
      $('list').addEventListener('click', () => { touched = true; });
      new ResizeObserver(() => {
        const size = container.clientWidth + 'x' + container.clientHeight;
        if (touched || size === lastSize || !container.clientWidth || !container.clientHeight) return;
        lastSize = size;
        map.invalidateSize();
        fitToDistance();
      }).observe(container);
    } catch (err) {
      console.error(err);
      $('updated').textContent = 'Could not load park data: ' + err.message;
    }
  }

  start();
})();
