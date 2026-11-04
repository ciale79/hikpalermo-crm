/* HIK PALERMO — distributori autorizzati Hikvision Italia nel cruscotto ProAV: tabella e mappa con le sedi,
   colore per categoria di canale (come su hikvision.com/it/Partners/distributori-autorizzati) e scelta a più voci delle categorie da vedere. */
(function () {
  'use strict';
  if (typeof HP_PAV === 'undefined' || !HP_PAV) return;
  const PAVK = 'Distributore ProAV';
  const CATS = [[PAVK, '#C8102E'], ['Sicurezza', '#D9480F'], ['Materiale elettrico', '#2F9E44'], ['IT', '#1971C2'], ['Commercial Display & EDU', '#AE3EC9'], ['Solution', '#E8A100']];
  const COL = Object.fromEntries(CATS);
  window.hpDistCats = CATS; window.hpComColor = '#343A40';
  const ls = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };
  const DEF = [PAVK]; // di base: solo i clienti della categoria «Distributore Pro AV»
  let sel = new Set(ls('hp_distCats3') || DEF); let q = '';
  // categorie del distributore: quelle di hikvision.com più «Distributore ProAV» per i clienti con quella categoria nel CRM
  const isPavCli = c => /pro\s*-?\s*av/i.test(c.categoria || '');
  const catsOf = c => { const a = Array.isArray(c.distCat) ? c.distCat : []; return isPavCli(c) ? [PAVK, ...a.filter(x => x !== PAVK)] : a; };
  const dists = () => [...S.clienti.values()].filter(c => catsOf(c).length);
  const visible = () => dists().filter(c => catsOf(c).some(x => sel.has(x)));
  const colorOf = c => COL[CATS.map(x => x[0]).find(k => sel.has(k) && catsOf(c).includes(k)) || catsOf(c)[0]] || '#868E96';
  const redraw = () => { try { VIEWS.dash.update(); } catch (e) { } };
  // coordinate mancanti: il server le cerca qualche sede per volta
  let geoAsk = 0;
  const askGeo = () => { if (Date.now() - geoAsk < 120000) return; if (!dists().some(c => (c.sedi || []).some(s => s.lat == null && !s.geoTry))) return; geoAsk = Date.now(); fetch('/api/geodist', { method: 'POST', credentials: 'same-origin', headers: { 'x-hp': '1' } }).catch(() => { }); };

  window.hpDistPts = function () {
    askGeo(); const seen = new Map(); const out = [];
    for (const c of visible()) for (const s of (c.sedi && c.sedi.length ? c.sedi : [{ lat: c.lat, lng: c.lng, citta: c.citta }])) {
      if (s.lat == null || s.lng == null) continue;
      const k = s.lat.toFixed(3) + ',' + s.lng.toFixed(3); const n = seen.get(k) || 0; seen.set(k, n + 1); const ang = n * 2.4, rad = n ? 0.03 * Math.sqrt(n) : 0;
      out.push({ lat: s.lat + rad * Math.sin(ang), lng: s.lng + rad * Math.cos(ang), r: 5, color: colorOf(c), title: c.nome + (s.label ? ' · ' + s.label : '') + ' · ' + [s.citta, s.prov].filter(Boolean).join(' ') + '\n' + catsOf(c).join(', '), on: () => go('clienti', c.id) });
    }
    return out;
  };
  // menu a tendina a scelta multipla delle categorie (stesso stile dei listini)
  function catMenu() {
    const all = dists(); const cnt = k => all.filter(c => catsOf(c).includes(k)).length;
    const lab = () => sel.size === CATS.length ? 'Tutte le categorie' : sel.size === 1 ? [...sel][0] : sel.size + ' categorie';
    const b = el('button', { type: 'button', class: 'btn hp-msbtn', 'aria-expanded': 'false' }, ic('list', 16), el('span', {}, lab()), el('span', { class: 'hp-caret', 'aria-hidden': 'true' }, '▾'));
    const pop = el('div', { class: 'hp-mspop', hidden: true, onclick: e => e.stopPropagation() },
      el('div', { class: 'row', style: 'gap:12px;padding:2px 4px 8px;border-bottom:1px solid var(--line)' }, el('a', { href: '#', class: 'hint', onclick: e => { e.preventDefault(); sel = new Set(CATS.map(c => c[0])); ls('hp_distCats3', [...sel]); redraw(); } }, 'Tutte')),
      ...CATS.map(([k, col]) => el('label', { class: 'hp-msit' }, el('input', { type: 'checkbox', checked: sel.has(k), onchange: e => { e.target.checked ? sel.add(k) : sel.delete(k); if (!sel.size) sel.add(k); ls('hp_distCats3', [...sel]); b.children[1].textContent = lab(); redraw(); } }), el('i', { class: 'hp-mdot', style: { background: col } }), el('span', { class: 'grow' }, k), el('small', { class: 'hint' }, String(cnt(k))))));
    b.addEventListener('click', e => { e.stopPropagation(); pop.hidden = !pop.hidden; b.setAttribute('aria-expanded', String(!pop.hidden)); if (!pop.hidden) { const h = ev => { if (!pop.contains(ev.target) && ev.target !== b) { pop.hidden = true; document.removeEventListener('click', h); } }; setTimeout(() => document.addEventListener('click', h), 0); } });
    return el('div', { class: 'hp-ms' }, b, pop);
  }
  window.hpDistPanel = function () {
    const rows = visible().filter(c => !q || (c.nome + ' ' + (c.distArea || '') + ' ' + (c.sedi || []).map(s => s.citta + ' ' + s.prov).join(' ')).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    const qi = el('input', { type: 'search', placeholder: 'Cerca distributore, città, regione…', value: q, style: 'max-width:240px', oninput: e => { q = e.target.value; clearTimeout(qi._t); qi._t = setTimeout(() => { const p = qi.closest('section'); if (p) { const n = window.hpDistPanel(); p.replaceWith(n); const ni = n.querySelector('input[type=search]'); ni.focus(); ni.setSelectionRange(q.length, q.length); } }, 200); } });
    const chip = k => el('span', { class: 'hp-dcat', style: { '--c': COL[k] || '#868E96' } }, k);
    const nSedi = rows.reduce((a, c) => a + ((c.sedi || []).length || 1), 0), noGeo = rows.reduce((a, c) => a + (c.sedi || []).filter(s => s.lat == null && !s.geoTry).length, 0);
    const tb = el('tbody', {}, rows.map(c => el('tr', { class: 'click', onclick: () => go('clienti', c.id) },
      el('td', {}, el('div', { class: 'cell-t' }, el('b', {}, c.nome), el('span', { class: 'row', style: 'gap:4px;flex-wrap:wrap' }, catsOf(c).map(chip)))),
      el('td', {}, el('small', {}, c.distArea || '—')),
      el('td', {}, el('div', { class: 'cell-t' }, el('span', {}, [c.citta, c.prov].filter(Boolean).join(' ') || '—'), (c.sedi || []).length > 1 ? el('small', { class: 'hint', title: c.sedi.map(s => [s.label, s.indirizzo, s.citta, s.prov].filter(Boolean).join(' · ')).join('\n') }, c.sedi.length + ' sedi') : null)),
      el('td', {}, el('div', { class: 'cell-t' }, c.tel ? el('a', { href: 'tel:' + String(c.tel).replace(/[^\d+]/g, ''), onclick: e => e.stopPropagation() }, c.tel) : null, c.email ? el('a', { href: 'mailto:' + c.email, onclick: e => e.stopPropagation() }, c.email) : null)),
      el('td', {}, c.sito ? el('a', { href: /^https?:/.test(c.sito) ? c.sito : 'https://' + c.sito, target: '_blank', rel: 'noopener', onclick: e => e.stopPropagation() }, c.sito.replace(/^https?:\/\/(www\.)?/, '')) : '—'))));
    return el('section', { class: 'panel hp-distp' },
      el('div', { class: 'panel-h', style: 'gap:8px;flex-wrap:wrap' }, el('h3', { text: 'Distributori autorizzati in Italia' }), el('span', { class: 'hint' }, rows.length + ' distributori · ' + nSedi + ' sedi' + (noGeo ? ' · ' + noGeo + ' sedi in attesa di posizione sulla mappa' : ''))),
      el('div', { class: 'row', style: 'gap:8px;margin-bottom:8px;flex-wrap:wrap' }, catMenu(), qi),
      rows.length ? el('div', { class: 'tbl-wrap hp-distw' }, el('table', {}, el('thead', {}, el('tr', {}, ['Distributore', 'Area', 'Sede', 'Contatti', 'Sito'].map(h => el('th', {}, h)))), tb))
        : emptyBox('Nessun distributore', dists().length ? 'Nessun distributore nelle categorie scelte.' : 'L\'elenco dei distributori autorizzati si sta caricando: riprova tra un minuto.'));
  };
  if (!document.getElementById('hpDistCss')) document.head.append(el('style', { id: 'hpDistCss' }, '.hp-dcat{font-size:.64rem;padding:1px 6px;border-radius:10px;color:var(--c);border:1px solid color-mix(in srgb,var(--c) 45%,transparent);background:color-mix(in srgb,var(--c) 9%,transparent);white-space:nowrap}.hp-distw{max-height:460px;overflow:auto}.hp-distp td{vertical-align:top}.hp-distp small a,.hp-distp .cell-t a{font-size:.78rem}'));
})();
