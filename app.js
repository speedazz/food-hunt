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

const LS_STATUS = 'fh_status', LS_ADDED = 'fh_added';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let base = [];
let statusMap = load(LS_STATUS, {});
let added = load(LS_ADDED, []);
let map, markers;

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
    </div></article>`;
}

function render() {
  const items = filtered();
  $('count').textContent = `${items.length} place${items.length === 1 ? '' : 's'}`;
  $('list').innerHTML = items.length ? items.map(card).join('') : '<p class="meta">No places match.</p>';
  renderMarkers(items);
}

function renderMarkers(items) {
  if (!map) return;
  markers.clearLayers();
  const pts = [];
  items.filter(p => p.lat && p.lng).forEach(p => {
    const t = tierOf(p);
    L.marker([p.lat, p.lng]).addTo(markers)
      .bindPopup(`<b>${esc(p.name)}</b><br>${t.label} · S$${Number(p.price).toFixed(2)}<br>${esc(p.area)}`);
    pts.push([p.lat, p.lng]);
  });
  if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
}

function showTab(which) {
  const isMap = which === 'map';
  $('list').hidden = isMap; $('map').hidden = !isMap;
  $('tab-list').classList.toggle('active', !isMap);
  $('tab-map').classList.toggle('active', isMap);
  if (isMap) {
    if (!map) {
      map = L.map('map').setView([1.3521, 103.8198], 12);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
      markers = L.layerGroup().addTo(map);
    }
    map.invalidateSize();
    renderMarkers(filtered());
  }
}

async function init() {
  try { base = await (await fetch('places.json')).json(); } catch { base = []; }
  fillSelects();
  render();
  ['q', 'f-tier', 'f-area', 'f-status', 'f-sort'].forEach(id => $(id).addEventListener('input', render));
  $('tab-list').onclick = () => showTab('list');
  $('tab-map').onclick = () => showTab('map');

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
