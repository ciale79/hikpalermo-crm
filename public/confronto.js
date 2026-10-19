/* HIK PALERMO — confronto con un caricamento precedente della Sales Analysis.
   Ogni caricamento viene conservato nella collezione salesHist (id = data dei dati, AAAA-MM-GG): totali, trimestri, canali,
   clienti, open order. Fatturato e Cruscotto mostrano gli scostamenti rispetto al caricamento scelto
   (di base il precedente, cioè di solito la settimana prima). La scelta è personale e resta nel browser. */
(function () {
  'use strict';
  const KEY = 'hp_cmpSel';
  // uno storico per ogni fonte: salesHist (gruppo) e proavHist (area riservata ProAV)
  const subs = new Map(), backfilled = new Set();
  const hcol = () => (typeof salesDst === 'function' ? salesDst().hist : 'salesHist');
  S.sHist = null;
  const getSel = () => { try { return localStorage.getItem(KEY) || 'prev'; } catch (e) { return 'prev'; } };
  const setSel = v => { try { localStorage.setItem(KEY, v); } catch (e) { } };
  const lab2 = d => { const p = String(d || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : String(d || ''); };
  const labF = d => { const p = String(d || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(d || ''); };
  const days = (a, b) => Math.round((new Date(a + 'T12:00') - new Date(b + 'T12:00')) / 864e5);

  function ensure() {
    if (typeof db === 'undefined' || !db) return;
    const col = hcol();
    if (subs.has(col)) { if (S.sHist !== subs.get(col)) { S.sHist = subs.get(col); cache.clear(); } return; }
    subs.set(col, null); S.sHist = null;
    db.collection(col).onSnapshot(s => {
      const arr = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(h => h.data && h.sales).sort((a, b) => a.data < b.data ? 1 : a.data > b.data ? -1 : 0);
      subs.set(col, arr);
      if (hcol() === col) { S.sHist = arr; cache.clear(); backfill(); changed(); }
    }, () => { subs.set(col, []); if (hcol() === col) S.sHist = []; });
  }
  // istantanea dei dati attuali: si salva una volta sola (serve da base per i confronti futuri)
  const snap = (sales, fatt, extra) => ({ data: sales.data, dataLabel: sales.dataLabel || labF(sales.data), anno: sales.anno, file: sales.file || fatt.fileName || '', sales, fatt, at: Date.now(), by: S.me || null, ...(extra || {}) });
  window.hpSalesSnap = snap;
  async function backfill() {
    const r = S.salesRaw, F = S.fatt;
    const col = hcol();
    if (backfilled.has(col) || !r || !F || !r.data || !S.sHist || !S.me) return;
    if (F.cut && F.cut !== r.data) return; // dati in aggiornamento: fatturato e totali non ancora allineati
    backfilled.add(col);
    if (S.sHist.some(h => h.id === r.data)) return;
    try { await db.collection(col).doc(r.data).set(snap(r, F, { caricatoIl: F.caricatoIl || r.caricatoIl || null, caricatoDa: F.caricatoDa || r.caricatoDa || null })); } catch (e) { }
  }

  // caricamenti confrontabili: stesso anno, con dati anteriori a quelli attuali
  const pool = () => { const cur = S.salesRaw; if (!cur || !S.sHist) return []; return S.sHist.filter(h => +h.anno === +cur.anno && h.data < cur.data); };
  const cache = new Map();
  window.hpCmp = function () {
    ensure();
    const cur = S.salesRaw; if (!cur || !S.sHist) return null;
    const sel = getSel(); if (sel === 'none') return null;
    const P = pool(); if (!P.length) return null;
    const h = sel === 'prev' ? P[0] : (P.find(x => x.id === sel) || P[0]);
    const ck = hcol() + '|' + h.id + '|' + h.at + '|' + JSON.stringify((S.config || {}).italiaExtra || null);
    if (cache.has(ck)) return cache.get(ck);
    const C = { id: h.id, h, sales: typeof adjSales === 'function' ? adjSales(h.sales) : h.sales, F: h.fatt || {}, lab: 'dal ' + lab2(h.data), dataLabel: h.dataLabel || labF(h.data), gg: days(cur.data, h.data), prev: h === P[0] };
    cache.set(ck, C); return C;
  };
  window.hpCmpOn = () => !!window.hpCmp();

  /* chip di scostamento: ▲ +12,3 k€ dal 12/10 — o.neutral per i valori che possono scendere per buone ragioni (open order) */
  window.hpDelta = function (cur, prev, o = {}) {
    const C = window.hpCmp(); if (!C || prev == null || !isFinite(+prev)) return null;
    const d = (+cur || 0) - (+prev || 0), up = d >= 0.5, dn = d <= -0.5;
    if (!up && !dn && o.hideZero) return null;
    const cls = 'hp-dlt ' + (o.neutral ? 'nt' : up ? 'up' : dn ? 'dn' : 'eq') + (o.cls ? ' ' + o.cls : '');
    const txt = up ? '▲ +' + eurShort(d) : dn ? '▼ −' + eurShort(-d) : '= invariato';
    return el('span', { class: cls, title: (o.what ? o.what + ': ' : '') + eur0(+prev || 0) + ' al ' + C.dataLabel + ' → ' + eur0(+cur || 0) + ' oggi (' + (d >= 0 ? '+' : '−') + eur0(Math.abs(d)) + (+prev ? ', ' + (d >= 0 ? '+' : '') + fN.format(round2(d / Math.abs(+prev) * 100)) + '%' : '') + ')' }, txt, o.noLab ? null : el('small', {}, ' ' + C.lab));
  };
  // scostamenti per trimestre: «Dal 12/10: Q3 +1,2 k€ · Q4 +85 k€»
  window.hpDeltaQ = function (cur, prev, what) {
    const C = window.hpCmp(); if (!C || !Array.isArray(cur) || !Array.isArray(prev)) return null;
    const items = [0, 1, 2, 3].map(i => [i, (+cur[i] || 0) - (+prev[i] || 0)]).filter(x => Math.abs(x[1]) >= 0.5);
    return el('p', { class: 'hint hp-dltq' }, el('b', {}, 'Rispetto al ' + C.dataLabel + ' '), items.length ? items.map(([i, d], k) => [k ? ' · ' : '', 'Q' + (i + 1) + ' ', el('span', { class: 'hp-dlt ' + (d > 0 ? 'up' : 'dn'), title: (what || '') + ' Q' + (i + 1) + ': ' + eur0(+prev[i] || 0) + ' → ' + eur0(+cur[i] || 0) }, (d > 0 ? '+' : '−') + eurShort(Math.abs(d)))]) : 'nessuna variazione');
  };
  // valore precedente di un cliente (per nome e area)
  window.hpCmpCli = function () {
    const C = window.hpCmp(); if (!C) return null; const F = C.F; const m = new Map();
    if (F.kamClienti) for (const c of F.kamClienti) m.set(c[1] + '|' + c[0], { a: c[3], p: c[5], s: c[6], o: 0 });
    else for (const c of F.clienti || []) m.set('SICILIA|' + c[0], { a: c[2], p: c[4], s: c[5], o: 0 });
    for (const [n, ar, v] of (F.ooKam || ((F.oo || {}).siClienti || []).map(x => [x[0], 'SICILIA', x[1]]))) { const k = ar + '|' + n; const c = m.get(k); if (c) c.o += v; else m.set(k, { a: 0, p: 0, s: 0, o: v }); }
    return { get: (n, ar) => m.get(ar + '|' + n) || { a: 0, p: 0, s: 0, o: 0, nuovo: true } };
  };
  // mappa nome → valore precedente da una lista [[nome, valore, ...]]
  window.hpCmpMap = (arr, i = 1) => { const m = new Map(); for (const x of arr || []) m.set(x[0], +x[i] || 0); return m; };

  /* barra di scelta del confronto (Fatturato e Cruscotto) */
  window.hpCmpBar = function (rerender, o = {}) {
    ensure();
    const cur = S.salesRaw; if (!cur || !cur.data) return null;
    const P = pool(); const sel = getSel(); const C = window.hpCmp();
    const addPast = el('a', { href: '#', class: 'hint', title: 'Carica una Sales Analysis di una data passata: va solo nello storico e non cambia i dati attuali', onclick: e => { e.preventDefault(); window.hpSalesUpload && window.hpSalesUpload('hist'); } }, '+ file di una data passata');
    if (!S.sHist) return el('div', { class: 'hp-cmpbar' }, el('span', { class: 'eyebrow' }, 'Confronto'), el('span', { class: 'hint' }, 'Carico lo storico…'));
    if (!P.length) return el('div', { class: 'hp-cmpbar' }, el('span', { class: 'eyebrow' }, 'Confronto'), el('span', { class: 'hint' }, 'Nessun caricamento precedente al ' + (cur.dataLabel || labF(cur.data)) + ': gli scostamenti compaiono dal prossimo aggiornamento della Sales Analysis.'), addPast);
    const opts = [['prev', 'Caricamento precedente (' + (P[0].dataLabel || labF(P[0].data)) + ')']].concat(P.map(h => [h.id, (h.dataLabel || labF(h.data)) + ' · ' + days(cur.data, h.data) + ' gg prima'])).concat([['none', 'Nessun confronto']]);
    const s = el('select', { 'aria-label': 'Confronta con il caricamento del', onchange: e => { setSel(e.target.value); cache.clear(); rerender ? rerender() : changed(); if (typeof renderSides === 'function') renderSides(); } }, opts.map(([v, l]) => el('option', { value: v, selected: v === sel || (sel !== 'prev' && sel !== 'none' && !P.some(h => h.id === sel) && v === 'prev') }, l)));
    let sum = null;
    if (C) {
      const sa = S.sales, cs = C.sales, F = S.fatt || {}, cf = C.F || {};
      const it = (+sa.italiaOwn || 0) - (+cs.italiaOwn || 0), si = (+sa.siciliaOwn || 0) - (+cs.siciliaOwn || 0);
      const ooS = (+((F.oo || {}).sicilia) || 0) - (+((cf.oo || {}).sicilia) || 0);
      const sg = v => (v >= 0 ? '+' : '−') + eurShort(Math.abs(v));
      sum = el('span', { class: 'hp-cmpsum' }, 'In ' + C.gg + (C.gg === 1 ? ' giorno' : ' giorni') + ': ',
        el('span', {}, 'Sicilia ', el('b', { class: 'hp-dlt ' + (si >= 0 ? 'up' : 'dn') }, sg(si))), ' · ',
        el('span', {}, 'Italia ', el('b', { class: 'hp-dlt ' + (it >= 0 ? 'up' : 'dn') }, sg(it))), ' · ',
        el('span', { title: 'Gli open order scendono anche quando vengono fatturati' }, 'open order Sicilia ', el('b', { class: 'hp-dlt nt' }, sg(ooS))));
    }
    const manage = isAdmin() ? el('a', { href: '#', class: 'hint', onclick: e => { e.preventDefault(); manageHist(rerender); } }, 'storico') : null;
    return el('div', { class: 'hp-cmpbar' + (o.cls ? ' ' + o.cls : '') }, el('span', { class: 'eyebrow' }, 'Confronta con'), s, sum, el('span', { class: 'grow' }), addPast, manage);
  };

  function manageHist(rerender) {
    const list = el('div', { class: 'stack', style: 'gap:6px' });
    const draw = () => list.replaceChildren(...(S.sHist || []).map(h => el('div', { class: 'hp-catrow' },
      el('span', { class: 'grow' }, el('b', {}, h.dataLabel || labF(h.data)), el('span', { class: 'hint' }, ' · ' + (h.file || 'Sales Analysis') + (h.id === (S.salesRaw || {}).data ? ' · dati attuali' : '') + (h.solo ? ' · aggiunto allo storico' : ''))),
      el('span', { class: 'num hint' }, 'Sicilia ' + eurShort((h.sales || {}).siciliaOwn) + ' · Italia ' + eurShort((h.sales || {}).italiaOwn)),
      h.id === (S.salesRaw || {}).data ? null : el('button', { type: 'button', class: 'icon-btn', title: 'Elimina dallo storico', 'aria-label': 'Elimina il caricamento del ' + (h.dataLabel || h.data), onclick: async () => { if (!await ask('Eliminare dallo storico il caricamento del ' + (h.dataLabel || labF(h.data)) + '?', 'Elimina')) return; if (await remove(hcol(), h.id)) { S.sHist = S.sHist.filter(x => x.id !== h.id); draw(); rerender && rerender(); } } }, ic('trash', 16)))));
    draw();
    const m = modal('Storico della Sales Analysis', el('div', { class: 'stack' }, el('p', { class: 'hint' }, 'Ogni caricamento resta nello storico e si può usare come termine di confronto. Quello dei dati attuali non si elimina.'), list), [el('span', { class: 'grow' }), btn('Chiudi', () => m.close())], { wide: true });
  }

  // si aggancia allo stato appena i dati sono disponibili
  const t = setInterval(() => { if (typeof db !== 'undefined' && db && S.me) { clearInterval(t); ensure(); } }, 800);
  window.hpCmpEnsure = ensure;
})();
