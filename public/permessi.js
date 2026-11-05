/* HIK PALERMO — permessi e menu.
   · Ogni utente può riordinare le voci del menu (Gruppo e impostazioni → Ordine del menu); l'ordine vale per il sito in cui è fatto (hikpalermo.com o ProAV).
   · Gli amministratori (su hikpalermo.com) e gli amministratori ProAV (su proav.hikpalermo.com) decidono per ogni utente
     quali sezioni vede e quali può modificare: le sezioni nascoste spariscono dal menu, quelle in sola lettura non accettano modifiche (controllo anche sul server). */
(function () {
  'use strict';
  const SITE = (typeof HP_PAV !== 'undefined' && HP_PAV) ? 'pav' : 'hik';
  S.perm = S.perm || { hide: [], ro: [] };
  // ordine di base del menu ProAV (ognuno può poi cambiarlo per sé dalle impostazioni)
  if (SITE === 'pav') { const ORD = ['dash', 'offerte', 'commesse', 'art', 'clienti', 'cal', 'magazzino', 'cap', 'bp', 'pav', 'fatt', 'set']; const ix = k => { const i = ORD.indexOf(k); return i < 0 ? ORD.length - 1.5 : i; }; const L = NAV.slice().sort((a, b) => ix(a[0]) - ix(b[0])); NAV.length = 0; NAV.push(...L); }
  const own = () => !!S.isOwner;
  HIK_CF.me().then(m => { S.perm = m.perm || { hide: [], ro: [] }; S.pavAdmin = !!m.pavAdmin; changed(); }).catch(() => { });
  // aggiornamento in tempo reale quando un amministratore cambia i permessi
  try { claude.use('db').then(db => { if (db) db.doc('config/perm').onSnapshot(s => { if (own() || !S.me) return; const x = ((s.exists ? s.data() : {}).users || {})[S.me] || {}; const p = x[SITE] || {}; S.perm = { hide: p.hide || [], ro: p.ro || [] }; if (S.perm.hide.includes(S.view)) go('dash'); else changed(); }, () => { }); }); } catch (e) { }

  const hidden = k => k !== 'dash' && k !== 'set' && (S.perm.hide || []).includes(k);
  const readOnly = k => (S.perm.ro || []).includes(k);
  window.hpCanEdit = k => !readOnly(k) && !hidden(k);
  // ordine del menu salvato nelle preferenze personali (data/users/<id>/state.navOrd[sito])
  const ordOf = () => ((S.state && S.state.navOrd) || {})[SITE] || null;
  const sorted = list => { const o = ordOf(); if (!o) return list.slice(); const ix = k => { const i = o.indexOf(k); return i < 0 ? 999 + list.findIndex(x => x[0] === k) : i; }; return list.slice().sort((a, b) => ix(a[0]) - ix(b[0])); };
  const rn0 = window.renderNav;
  window.renderNav = function () { const full = NAV.slice(); const vis = sorted(full).filter(n => !hidden(n[0])); NAV.length = 0; NAV.push(...vis); try { return rn0.apply(this, arguments); } finally { NAV.length = 0; NAV.push(...full); } };
  const go0 = window.go;
  window.go = function (v) { if (hidden(v)) { toast('Questa sezione non è disponibile per il tuo utente.', 'bad'); v = 'dash'; return go0.call(this, 'dash'); } return go0.apply(this, arguments); };
  // avviso «sola lettura» in cima alle sezioni non modificabili
  const view = document.getElementById('view');
  const ensureBanner = () => { if (!view) return; const ro = readOnly(S.view) && !hidden(S.view); const b = view.querySelector(':scope > .hp-robanner'); if (ro && !b) view.prepend(el('div', { class: 'banner hp-robanner' }, ic('lock', 16), ' Sezione in sola lettura per il tuo utente: puoi consultare i dati ma non modificarli.')); else if (!ro && b) b.remove(); };
  if (view) new MutationObserver(() => ensureBanner()).observe(view, { childList: true });

  /* ---------- Gruppo e impostazioni: ordine del menu (per tutti) ---------- */
  async function saveOrd(list) { const st = { ...(S.state || {}) }; st.navOrd = { ...(st.navOrd || {}), [SITE]: list }; S.state = st; try { await db.doc('data/users/' + S.me + '/state').set(st); } catch (e) { toast(errMsg(e), 'bad'); } changed(); }
  function navPanel() {
    const items = sorted(NAV).filter(n => !hidden(n[0]));
    const list = el('div', { class: 'stack', style: 'gap:4px' }, items.map((n, i) => el('div', { class: 'row hp-navit', style: 'gap:8px;flex-wrap:nowrap' }, ic(n[2], 16), el('span', { class: 'grow' }, n[1]),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Sposta su ' + n[1], disabled: i === 0, onclick: () => { const k = items.map(x => x[0]); [k[i - 1], k[i]] = [k[i], k[i - 1]]; saveOrd(k); } }, '↑'),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Sposta giù ' + n[1], disabled: i === items.length - 1, onclick: () => { const k = items.map(x => x[0]); [k[i + 1], k[i]] = [k[i], k[i + 1]]; saveOrd(k); } }, '↓'))));
    return el('section', { class: 'panel stack', id: 'hpNavOrd' }, el('div', { class: 'panel-h' }, el('h3', { text: 'Ordine del menu' }), ordOf() ? btn('Ripristina', () => saveOrd(null), 'sm ghost') : null),
      el('p', { class: 'hint', style: 'margin:0' }, 'Sposta le voci con le frecce: l\'ordine vale solo per te' + (SITE === 'pav' ? ', nell\'area ProAV.' : ', su hikpalermo.com.')), list);
  }
  const su0 = VIEWS.set.update;
  VIEWS.set.update = function () { const r = su0.apply(this, arguments); try { if (!this.editing && this.root) { this.root.querySelector('#hpNavOrd')?.remove(); const p = navPanel(); const first = this.root.querySelector('section.panel'); if (first) first.after(p); else this.root.append(p); } } catch (e) { console.warn(e); } return r; };

  /* ---------- permessi di un utente (pannello Accessi al CRM) ---------- */
  const sections = () => NAV.filter(n => n[0] !== 'dash' && n[0] !== 'set');
  const canPermSite = () => SITE === 'pav' ? !!S.pavAdmin || own() : isAdmin();
  window.hpPermBadge = u => { const p = (u.perm || {})[SITE] || {}; const n = (p.hide || []).length, r = (p.ro || []).length; return n || r ? el('span', { class: 'hp-utag lim', title: [n ? 'Sezioni nascoste: ' + p.hide.join(', ') : '', r ? 'Sola lettura: ' + p.ro.join(', ') : ''].filter(Boolean).join('\n') }, 'Limitato') : null; };
  function permEditor(cur) {
    const st = new Map(sections().map(n => [n[0], { see: !(cur.hide || []).includes(n[0]), edit: !(cur.hide || []).includes(n[0]) && !(cur.ro || []).includes(n[0]) }]));
    const rows = sections().map(n => { const x = st.get(n[0]);
      const ce = el('input', { type: 'checkbox', checked: x.edit, disabled: !x.see, onchange: e => { x.edit = e.target.checked; } });
      const cs = el('input', { type: 'checkbox', checked: x.see, onchange: e => { x.see = e.target.checked; ce.disabled = !x.see; if (!x.see) { ce.checked = false; x.edit = false; } else { ce.checked = true; x.edit = true; } } });
      return el('tr', {}, el('td', {}, el('span', { class: 'row', style: 'gap:6px' }, ic(n[2], 16), n[1])), el('td', { class: 'c' }, cs), el('td', { class: 'c' }, ce)); });
    const all = (see, edit) => { st.forEach(x => { x.see = see; x.edit = edit; }); tb.querySelectorAll('tr').forEach(tr => { const [a, b] = tr.querySelectorAll('input'); a.checked = see; b.checked = edit; b.disabled = !see; }); };
    const tb = el('tbody', {}, rows);
    const node = el('div', { class: 'stack', style: 'gap:6px' }, el('div', { class: 'row', style: 'gap:12px' }, el('a', { href: '#', class: 'hint', onclick: e => { e.preventDefault(); all(true, true); } }, 'Tutto modificabile'), el('a', { href: '#', class: 'hint', onclick: e => { e.preventDefault(); all(true, false); } }, 'Tutto in sola lettura')),
      el('div', { class: 'tbl-wrap' }, el('table', { class: 'hp-permt' }, el('thead', {}, el('tr', {}, el('th', {}, 'Sezione'), el('th', { class: 'c' }, 'Vede'), el('th', { class: 'c' }, 'Modifica'))), tb)),
      el('p', { class: 'hint', style: 'margin:0' }, 'Cruscotto e Gruppo e impostazioni restano sempre visibili. I permessi valgono per ' + (SITE === 'pav' ? 'l\'area ProAV (proav.hikpalermo.com).' : 'hikpalermo.com.')));
    const read = () => ({ hide: [...st].filter(([, x]) => !x.see).map(([k]) => k), ro: [...st].filter(([, x]) => x.see && !x.edit).map(([k]) => k) });
    return { node, read };
  }
  const ck = (label, on, hint, dis) => { const i = el('input', { type: 'checkbox', checked: !!on, disabled: !!dis }); return { i, node: el('label', { class: 'row', style: 'gap:8px;align-items:flex-start' }, i, el('span', {}, el('b', {}, label), hint ? el('div', { class: 'hint' }, hint) : null)) }; };
  window.hpUserPerm = function (u, reload) {
    const cur = (u.perm || {})[SITE] || {};
    const pe = canPermSite() ? permEditor(cur) : null;
    const pav = S.pavAdmin || own() ? ck('Accesso all\'area ProAV', u.proav, 'Può entrare in proav.hikpalermo.com') : null;
    const padm = own() ? ck('Amministratore ProAV', u.pavAdmin, 'Può aggiungere utenti e decidere i permessi dell\'area ProAV') : null;
    const m = modal('Permessi · ' + (u.name || u.email), el('div', { class: 'stack' }, el('p', { class: 'hint', style: 'margin:0' }, u.email), pav ? pav.node : null, padm ? padm.node : null, pe ? el('h4', { style: 'margin:6px 0 0' }, 'Cosa vede e cosa modifica') : null, pe ? pe.node : el('p', { class: 'hint' }, 'Per i permessi delle sezioni apri questa finestra dal sito dell\'area che amministri.')),
      [el('span', { class: 'grow' }), btn('Annulla', () => m.close()), btn('Salva', async () => {
        try {
          if (pav && pav.i.checked !== !!u.proav) await HIK_CF.postJ('/api/users', { id: u.id, action: 'setpav', on: pav.i.checked });
          if (padm && padm.i.checked !== !!u.pavAdmin) await HIK_CF.postJ('/api/users', { id: u.id, action: 'setpavadmin', on: padm.i.checked });
          if (pe) await HIK_CF.postJ('/api/users', { id: u.id, action: 'setperm', site: SITE, ...pe.read() });
          toast('Permessi di ' + (u.name || u.email) + ' salvati'); m.close(); reload && reload();
        } catch (e) { toast(e.message, 'bad'); }
      }, 'pri', 'check')], { wide: true });
  };
  window.hpUserNew = function (reload) {
    const nm = el('input', { type: 'text', placeholder: 'Nome e cognome' }), em = el('input', { type: 'email', placeholder: 'nome.cognome@hikvision.com' });
    const onlyPav = !isAdmin(); // l'amministratore ProAV crea utenti dell'area ProAV
    const pav = S.pavAdmin || own() ? ck('Accesso all\'area ProAV', SITE === 'pav' || onlyPav, onlyPav ? 'Gli utenti creati da un amministratore ProAV entrano nell\'area ProAV' : 'Può entrare in proav.hikpalermo.com', onlyPav) : null;
    const pe = canPermSite() ? permEditor({}) : null;
    const m = modal('Aggiungi utente', el('div', { class: 'stack' }, el('div', { class: 'fgrid' }, el('label', { class: 'fld' }, el('span', {}, 'Nome'), nm), el('label', { class: 'fld' }, el('span', {}, 'Email'), em)), pav ? pav.node : null,
      pe ? el('h4', { style: 'margin:6px 0 0' }, 'Cosa vede e cosa modifica') : null, pe ? pe.node : null, el('p', { class: 'hint', style: 'margin:0' }, 'L\'utente riceve un\'email con il link per creare la sua password.')),
      [el('span', { class: 'grow' }), btn('Annulla', () => m.close()), btn('Crea utente', async () => {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em.value.trim())) { toast('Scrivi un\'email valida.', 'bad'); em.focus(); return; }
        try { const r = await HIK_CF.postJ('/api/users', { action: 'create', name: nm.value.trim(), email: em.value.trim(), proav: pav ? pav.i.checked : false });
          if (pe && r && r.id) { const x = pe.read(); if (x.hide.length || x.ro.length) await HIK_CF.postJ('/api/users', { id: r.id, action: 'setperm', site: SITE, ...x }); }
          toast('Utente creato: ' + em.value.trim() + ' riceverà l\'email per la password'); m.close(); reload && reload();
        } catch (e) { toast(e.message, 'bad'); }
      }, 'pri', 'plus')], { wide: true });
    setTimeout(() => nm.focus(), 50);
  };
  if (!document.getElementById('hpPermCss')) document.head.append(el('style', { id: 'hpPermCss' }, '.hp-utag{font-size:.62rem;font-weight:700;letter-spacing:.03em;padding:1px 6px;border-radius:8px;border:1px solid;white-space:nowrap}.hp-utag.pav{color:#6741d9;border-color:#b197fc;background:#f3f0ff}.hp-utag.hik{color:#c8102e;border-color:#f1a7b1;background:#fff0f2}.hp-utag.adm,.hp-utag.padm{color:#495057;border-color:#ced4da;background:#f8f9fa}.hp-utag.lim{color:#e67700;border-color:#ffc078;background:#fff4e6}.hp-permt td.c,.hp-permt th.c{text-align:center;width:90px}.hp-navit{padding:4px 6px;border:1px solid var(--line);border-radius:8px}.hp-robanner{display:flex;align-items:center;gap:6px}'));
})();
