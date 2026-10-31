// Price tiers, per pax in S$. A place's tier is derived from its price.
const TIERS = [
  { id: 'street',     label: 'Street food',  rule: 'under S$5',   max: 5 },
  { id: 'budget',     label: 'Budget food',  rule: 'under S$10',  max: 10 },
  { id: 'local',      label: 'Local fav',    rule: 'under S$20',  max: 20 },
  { id: 'restaurant', label: 'Restaurant',   rule: 'under S$50',  max: 50 },
  { id: 'premium',    label: 'Premium',      rule: 'S$50 and above', max: Infinity },
];
const tierOf = p => TIERS.find(t => p.price < t.max);
const tierIndex = p => TIERS.indexOf(tierOf(p));

// Paste the Google Sheet "Publish to web" CSV link here. While it is empty (or fails), places.json is used.
const SHEET_CSV_URL = '';

const LS_STATUS = 'fh_status', LS_ADDED = 'fh_added';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let base = [];
let statusMap = load(LS_STATUS, {});
let added = load(LS_ADDED, []);
// Restricted to https://speedazz.github.io/* in Google Cloud; safe to be public.
const GMAPS_KEY = 'AIzaSyCULEXVVdkt1q6CPwBbrx0efD0VHOS6SE0';
let map, info, markers = [], gmapsPromise;

const $ = id => document.getElementById(id);
const all = () => [...base, ...added].map(p => ({ ...p, status: statusMap[p.id] || p.status || 'want' }));

function fillSelects() {
  const places = all();
  $('f-tier').innerHTML = '<option value="">All price tiers</option>' +
    TIERS.map(t => `<option value="${t.id}">${t.label} (${t.rule})</option>`).join('');
  const areas = [...new Set(places.map(p => p.area))].sort();
  const cur = $('f-area').value;
  $('f-area').innerHTML = '<option value="">All areas</option>' +
    areas.map(a => `<option>${a}</option>`).join('');
  $('f-area').value = cur;
  $('areas').innerHTML = areas.map(a => `<option value="${a}">`).join('');
}

function filtered() {
  const q = $('q').value.trim().toLowerCase();
  const tier = $('f-tier').value, area = $('f-area').value, st = $('f-status').value;
  const sort = $('f-sort').value;
  const out = all().filter(p =>
    (!tier || tierOf(p).id === tier) &&
    (!area || p.area === area) &&
    (!st || p.status === st) &&
    (!q || [p.name, p.cuisine, p.dish, p.notes, p.area].join(' ').toLowerCase().includes(q)));
  const by = {
    tier: (a, b) => tierIndex(a) - tierIndex(b) || a.price - b.price,
    price: (a, b) => a.price - b.price,
    rating: (a, b) => (b.rating || 0) - (a.rating || 0),
    name: (a, b) => a.name.localeCompare(b.name),
  }[sort];
  return out.sort(by);
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function rowsToPlaces(rows) {
  const [head, ...body] = rows;
  const keys = head.map(h => h.trim().toLowerCase());
  return body.map((r, i) => {
    const o = Object.fromEntries(keys.map((k, j) => [k, (r[j] ?? '').trim()]));
    return {
      id: o.id || 's' + (i + 1), name: o.name, area: o.area || 'Other', cuisine: o.cuisine,
      price: Number(o.price) || 0, rating: o.rating ? Number(o.rating) : null,
      dish: o.dish, notes: o.notes, photo: o.photo,
      lat: o.lat ? Number(o.lat) : null, lng: o.lng ? Number(o.lng) : null,
      status: o.status === 'visited' ? 'visited' : 'want',
    };
  }).filter(p => p.name);
}

async function loadPlaces() {
  if (SHEET_CSV_URL) {
    try {
      const res = await fetch(SHEET_CSV_URL, { cache: 'no-store' });
      if (res.ok) { const places = rowsToPlaces(parseCSV(await res.text())); if (places.length) return places; }
    } catch {}
  }
  try { return await (await fetch('places.json')).json(); } catch { return []; }
}

// Search links for one place or any free-text idea. Instagram, TikTok and blogs go through Google
// site: searches because they have no stable public search URLs of their own.
const BLOGS = ['sethlui.com', 'ladyironchef.com', 'eatbook.sg', 'danielfooddiary.com', 'misstamchiak.com'];
function researchLinks(q) {
  const e = encodeURIComponent, g = s => 'https://www.google.com/search?q=' + e(s);
  return [
    ['Google Maps', 'https://www.google.com/maps/search/?api=1&query=' + e(q)],
    ['Instagram', g(`site:instagram.com ${q}`)],
    ['TikTok', 'https://www.tiktok.com/search?q=' + e(q)],
    ['YouTube', 'https://www.youtube.com/results?search_query=' + e(q)],
    ['Reddit', 'https://www.reddit.com/search/?q=' + e(q)],
    ['Burpple', 'https://www.burpple.com/search/sg?q=' + e(q)],
    ['Food blogs', g(`${q} (${BLOGS.map(b => 'site:' + b).join(' OR ')})`)],
    ['Reviews', g(`${q} review`)],
  ].map(([label, href]) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`).join('');
}

function card(p) {
  const t = tierOf(p);
  const mapLink = p.lat && p.lng
    ? `<a href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">Open in Maps</a>` : '';
  return `<article class="card">
    ${p.photo ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove()">` : ''}
    <div class="body">
      <div class="chips"><span class="chip ${t.id}">${t.label}</span>
        <span class="price">S$${Number(p.price).toFixed(2)}/pax</span>
        ${p.rating ? `<span class="meta">★ ${p.rating}</span>` : ''}</div>
      <h3>${esc(p.name)}</h3>
      <div class="meta">${esc(p.area)}${p.cuisine ? ' · ' + esc(p.cuisine) : ''}</div>
      ${p.dish ? `<div class="dish">Try: ${esc(p.dish)}</div>` : ''}
      ${p.notes ? `<div class="notes">${esc(p.notes)}</div>` : ''}
      <div class="foot">
        <button class="status ${p.status}" data-id="${esc(p.id)}">${p.status === 'visited' ? '✓ Visited' : 'Want to try'}</button>
        ${mapLink}
      </div>
      <details class="research"><summary>Research</summary>
        <div class="rlinks">${researchLinks(`${p.name} ${p.area} Singapore`)}</div></details>
    </div></article>`;
}

function render() {
  const items = filtered();
  $('count').textContent = `${items.length} place${items.length === 1 ? '' : 's'}`;
  $('list').innerHTML = items.length ? items.map(card).join('') : '<p class="meta">No places match.</p>';
  renderMarkers(items);
}

function loadGMaps() {
  gmapsPromise ??= new Promise((resolve, reject) => {
    window.__gmapsInit = resolve;
    window.gm_authFailure = () => { gmapsPromise = null; $('map-msg').textContent = 'Google rejected the API key. Check its website restriction.'; };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&loading=async&callback=__gmapsInit&v=weekly`;
    s.onerror = () => { gmapsPromise = null; reject(new Error('Google Maps failed to load')); };
    document.head.append(s);
  });
  return gmapsPromise;
}

// Counts as one billable map load, so it only runs when you tap "Load map".
async function startMap() {
  $('btn-loadmap').disabled = true;
  $('map-msg').textContent = 'Loading map…';
  try {
    await loadGMaps();
    const { Map, InfoWindow } = await google.maps.importLibrary('maps');
    await google.maps.importLibrary('marker');
    map = new Map($('gmap'), { center: { lat: 1.3521, lng: 103.8198 }, zoom: 12, streetViewControl: false, mapTypeControl: false });
    info = new InfoWindow();
    $('map-start').hidden = true;
    renderMarkers(filtered());
  } catch (err) {
    $('map-msg').textContent = 'Could not load Google Maps. Try again.';
    $('btn-loadmap').disabled = false;
  }
}

function renderMarkers(items) {
  if (!map) return;
  markers.forEach(m => m.setMap(null));
  markers = [];
  const bounds = new google.maps.LatLngBounds();
  items.filter(p => p.lat && p.lng).forEach(p => {
    const t = tierOf(p);
    const m = new google.maps.Marker({ position: { lat: p.lat, lng: p.lng }, map, title: p.name });
    m.addListener('click', () => {
      info.setContent(`<div style="color:#222"><b>${esc(p.name)}</b><br>${t.label} · S$${Number(p.price).toFixed(2)}<br>${esc(p.area)}<br>` +
        `<a href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">Open in Google Maps</a></div>`);
      info.open({ map, anchor: m });
    });
    markers.push(m);
    bounds.extend(m.getPosition());
  });
  if (markers.length) {
    map.fitBounds(bounds, 40);
    google.maps.event.addListenerOnce(map, 'idle', () => { if (map.getZoom() > 16) map.setZoom(16); });
  }
}

function showTab(which) {
  const isMap = which === 'map';
  $('list').hidden = isMap; $('map-wrap').hidden = !isMap;
  $('tab-list').classList.toggle('active', !isMap);
  $('tab-map').classList.toggle('active', isMap);
}

async function init() {
  base = await loadPlaces();
  fillSelects();
  render();
  ['q', 'f-tier', 'f-area', 'f-status', 'f-sort'].forEach(id => $(id).addEventListener('input', render));
  $('tab-list').onclick = () => showTab('list');
  $('tab-map').onclick = () => showTab('map');
  $('btn-loadmap').onclick = startMap;

  $('rform').addEventListener('submit', e => {
    e.preventDefault();
    const q = $('rq').value.trim();
    $('rlinks').innerHTML = q ? researchLinks(q) : '';
  });

  const root = document.documentElement;
  const syncThemeBtn = () => { $('btn-theme').textContent = root.dataset.theme === 'playful' ? 'Minimal' : 'Playful'; };
  syncThemeBtn();
  $('btn-theme').onclick = () => {
    root.dataset.theme = root.dataset.theme === 'playful' ? 'minimal' : 'playful';
    try { localStorage.setItem('fh_theme', root.dataset.theme); } catch {}
    syncThemeBtn();
  };

  $('list').addEventListener('click', e => {
    const b = e.target.closest('button.status');
    if (!b) return;
    const id = b.dataset.id, cur = all().find(p => p.id === id).status;
    statusMap[id] = cur === 'visited' ? 'want' : 'visited';
    save(LS_STATUS, statusMap);
    render();
  });

  $('btn-add').onclick = () => $('dlg').showModal();
  $('form').addEventListener('submit', e => {
    if (e.submitter?.value !== 'save') return;
    const f = Object.fromEntries(new FormData($('form')));
    added.push({
      id: 'u' + Date.now(), name: f.name.trim(), area: f.area.trim(), cuisine: f.cuisine.trim(),
      price: Number(f.price), dish: f.dish.trim(), notes: f.notes.trim(), photo: f.photo.trim(),
      lat: f.lat ? Number(f.lat) : null, lng: f.lng ? Number(f.lng) : null, status: 'want',
    });
    save(LS_ADDED, added);
    $('form').reset();
    fillSelects(); render();
  });

  $('btn-export').onclick = () => {
    const merged = all().map(({ status, ...p }) => ({ ...p, status }));
    const blob = new Blob([JSON.stringify(merged, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'places.json'; a.click();
  };
  $('btn-reset').onclick = () => {
    if (!confirm('Clear places and visited marks saved on this device?')) return;
    statusMap = {}; added = []; save(LS_STATUS, statusMap); save(LS_ADDED, added);
    fillSelects(); render();
  };
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
init();
