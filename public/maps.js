/* HIK PALERMO — mappe GIS (Leaflet): commesse, eventi del calendario, sede Hikvision */
(function () {
  'use strict';
  const HQ = { lat: 38.1418836, lng: 13.3379637, name: 'Hikvision Italia · sede di Palermo', addr: 'Viale Lazio 30b, 90144 Palermo' };
  const ETCOL = { riunione: 'var(--t-platinum)', call: 'var(--info)', visita: 'var(--ok)', appuntamento: 'var(--violet)', sopralluogo: 'var(--warn)' };
  const boxes = new Map();
  const origMap = window.mapSvg;
  const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function color(c) {
    if (!c) return '#C8102E';
    const m = /var\((--[\w-]+)/.exec(c);
    if (m) return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || '#C8102E';
    return c;
  }
  function starPin(c) {
    const w = 30, h = 38;
    return L.divIcon({ className: 'hp-pin hp-star', iconSize: [w, h], iconAnchor: [w / 2, h], popupAnchor: [0, -h + 4], tooltipAnchor: [w / 2 - 2, -h / 2],
      html: `<svg width="${w}" height="${h}" viewBox="0 0 26 34" aria-hidden="true"><path d="M13 33s11-11.2 11-19.5A11 11 0 0 0 2 13.5C2 21.8 13 33 13 33z" fill="${color(c)}" stroke="#fff" stroke-width="2"/><path d="M13 6.6l2.1 4.3 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7z" fill="#fff"/></svg>` });
  }
  function pin(c, big) {
    const w = big ? 34 : 26, h = big ? 44 : 34;
    return L.divIcon({ className: 'hp-pin', iconSize: [w, h], iconAnchor: [w / 2, h], popupAnchor: [0, -h + 4], tooltipAnchor: [w / 2 - 2, -h / 2],
      html: `<svg width="${w}" height="${h}" viewBox="0 0 26 34" aria-hidden="true"><path d="M13 33s11-11.2 11-19.5A11 11 0 0 0 2 13.5C2 21.8 13 33 13 33z" fill="${color(c)}" stroke="#fff" stroke-width="2"/><circle cx="13" cy="13.5" r="4.2" fill="#fff"/></svg>` });
  }
  const hqIcon = () => L.divIcon({ className: 'hp-hq', iconSize: [104, 46], iconAnchor: [52, 46], popupAnchor: [0, -42],
    html: '<div class="hq-b"><span>HIKVISION</span><small>PALERMO</small></div><div class="hq-t"></div>' });

  function baseLayers() {
    const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
    const attrE = 'Immagini &copy; Esri, Maxar, Earthstar Geographics';
    const sat = () => L.tileLayer(esri + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19, attribution: attrE });
    const lab = () => L.tileLayer(esri + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19 });
    const roads = () => L.tileLayer(esri + 'Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19, opacity: .8 });
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' });
    return { 'Ibrida': L.layerGroup([sat(), roads(), lab()]), 'Satellite': sat(), 'Stradale': osm };
  }
  function pref() { try { return localStorage.getItem('hp_maplayer') || 'Ibrida'; } catch (e) { return 'Ibrida'; } }

  function build(b) {
    const map = L.map(b.el, { zoomControl: true, scrollWheelZoom: false, worldCopyJump: true, attributionControl: true });
    const layers = baseLayers();
    (layers[pref()] || layers['Ibrida']).addTo(map);
    L.control.layers(layers, null, { position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    map.on('baselayerchange', e => { try { localStorage.setItem('hp_maplayer', e.name); } catch (x) { } });
    map.on('click', () => map.scrollWheelZoom.enable());
    b.el.addEventListener('mouseleave', () => map.scrollWheelZoom.disable());
    L.marker([HQ.lat, HQ.lng], { icon: hqIcon(), zIndexOffset: -1000, keyboard: true, title: HQ.name })
      .bindPopup(`<b>${escH(HQ.name)}</b><br>${escH(HQ.addr)}<br><a href="https://www.google.com/maps/dir/?api=1&destination=${HQ.lat},${HQ.lng}" target="_blank" rel="noopener">Indicazioni</a>`).addTo(map);
    b.layer = L.layerGroup().addTo(map);
    const reset = L.control({ position: 'topleft' });
    reset.onAdd = () => { const d = L.DomUtil.create('a', 'leaflet-bar hp-fit'); d.href = '#'; d.title = 'Mostra tutto'; d.setAttribute('role', 'button'); d.innerHTML = '⤢'; L.DomEvent.on(d, 'click', ev => { L.DomEvent.stop(ev); fit(b, true); }); return d; };
    reset.addTo(map);
    b.map = map;
  }
  function fit(b, force) {
    const pts = b.points || [];
    if (b.single && pts.length) { b.map.setView([pts[0].lat, pts[0].lng], 17); return; }
    if (!pts.length) { b.map.setView([HQ.lat, HQ.lng], 9); return; }
    const bb = L.latLngBounds(pts.map(p => [p.lat, p.lng]).concat([[HQ.lat, HQ.lng]]));
    b.map.fitBounds(bb, { padding: [36, 36], maxZoom: 15 });
  }
  function draw(b, points, sig) {
    if (!b.el.isConnected) { if ((b.tries = (b.tries || 0) + 1) < 40) setTimeout(() => draw(b, points, sig), 50); return; }
    b.tries = 0;
    if (!b.map) build(b);
    b.map.invalidateSize();
    if (sig === b.sig) return;
    const first = b.sig == null;
    const sameSet = b.ids && b.ids === points.map(p => p.lat + ',' + p.lng).sort().join('|');
    b.sig = sig; b.points = points; b.ids = points.map(p => p.lat + ',' + p.lng).sort().join('|');
    b.layer.clearLayers();
    for (const p of points) {
      const mk = L.marker([p.lat, p.lng], { icon: p.kind === 'partner' ? starPin(p.color) : pin(p.color, p.big), title: p.title || '', riseOnHover: true, zIndexOffset: p.kind === 'partner' ? 500 : 0 });
      const html = `<b>${escH(p.title || '')}</b>${p.sub ? '<br><span class="hp-sub">' + escH(p.sub) + '</span>' : ''}<div class="hp-pop">` +
        (p.on && !b.single ? '<a href="#" data-k="open">Apri</a>' : '') +
        `<a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener">Naviga</a>` +
        `<a href="https://www.google.com/maps/@?api=1&map_action=map&center=${p.lat},${p.lng}&zoom=19&basemap=satellite" target="_blank" rel="noopener">Google Maps</a></div>`;
      mk.bindPopup(html);
      mk.on('popupopen', e => { const a = e.popup.getElement().querySelector('[data-k=open]'); if (a) a.onclick = ev => { ev.preventDefault(); p.on(); }; });
      if (p.title) mk.bindTooltip(p.label || p.title, { direction: 'right', opacity: .95, permanent: !!b.single });
      mk.addTo(b.layer);
    }
    if (first || !sameSet) fit(b);
  }

  window.mapSvg = function (points, opts = {}) {
    if (!window.L) return origMap(points, opts);
    points = (points || []).filter(p => p && isFinite(p.lat) && isFinite(p.lng));
    const single = points.length === 1 && !!points[0].big;
    const key = opts.key || (single ? 'one' : (S.view || 'x'));
    let b = boxes.get(key);
    if (!b) { const el = document.createElement('div'); el.className = 'lmap' + (single ? ' one' : ''); el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Mappa'); b = { el, single }; boxes.set(key, b); }
    b.single = single;
    const sig = JSON.stringify(points.map(p => [p.lat, p.lng, p.title, p.color, p.sub, p.kind]));
    requestAnimationFrame(() => draw(b, points, sig));
    return b.el;
  };

  /* Commessa: trova la posizione dall'indirizzo */
  window.hpGeoBtn = function (f) {
    const b = btn('Trova dall\'indirizzo', async () => {
      const q = [f.ind.value, f.citta.value].map(x => x.trim()).filter(Boolean).join(', ');
      if (!q) { toast('Scrivi prima indirizzo e città.', 'bad'); f.ind.focus(); return; }
      b.disabled = true;
      try {
        const r = await HIK_CF.call('/api/geocode?q=' + encodeURIComponent(q));
        if (!r.length) { toast('Indirizzo non trovato: prova a scriverlo in modo diverso o incolla le coordinate.', 'bad'); return; }
        f.gps.value = r[0].lat.toFixed(6) + ', ' + r[0].lng.toFixed(6); f.gps.dispatchEvent(new Event('input'));
        toast('Posizione trovata: ' + (r[0].label || q).split(',').slice(0, 4).join(','));
      } catch (e) { toast(e.message || 'Ricerca non riuscita', 'bad'); } finally { b.disabled = false; }
    }, 'sm', 'pin');
    return b;
  };

  /* Calendario: mappa degli appuntamenti del mese visualizzato */
  const calOrig = VIEWS.cal.update;
  VIEWS.cal.update = function () {
    const out = calOrig.apply(this, arguments);
    try {
      const r = this.root; if (!r) return out;
      const m = S.calMonth || new Date();
      const a = new Date(m.getFullYear(), m.getMonth(), 1).getTime(), z = new Date(m.getFullYear(), m.getMonth() + 1, 1).getTime();
      const evs = [...S.eventi.values()].filter(e => e.start >= a && e.start < z && (!this.mine || (e.part || []).includes(S.me) || e.by === S.me));
      const withPos = evs.filter(e => e.lat != null && e.lng != null);
      const pts = withPos.map(e => ({ lat: e.lat, lng: e.lng, color: (window.evColor ? evColor(e.tipo) : ETCOL[e.tipo]) || 'var(--accent)', title: e.titolo, sub: (window.evWhen ? evWhen(e) : fDT(e.start)) + (e.luogo ? ' · ' + e.luogo : ''), on: () => eventDetail(e) }));
      const noPos = evs.length - withPos.length;
      const panel = el('section', { class: 'panel', id: 'calMap' },
        el('div', { class: 'panel-h' }, el('h3', { text: 'Mappa appuntamenti · ' + m.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) }),
          el('span', { class: 'hint' }, withPos.length + (withPos.length === 1 ? ' evento sulla mappa' : ' eventi sulla mappa') + (noPos ? ' · ' + noPos + ' senza luogo riconosciuto' : ''))),
        mapSvg(pts, { key: 'cal' }),
        el('p', { class: 'hint', style: 'margin-top:8px' }, 'La posizione si ricava in automatico dal campo «Luogo» dell\'evento (indirizzo e città). Il segnaposto rosso è la sede Hikvision di Viale Lazio.'));
      r.querySelector('#calMap')?.remove();
      r.appendChild(panel);
    } catch (e) { console.error(e); }
    return out;
  };
})();
