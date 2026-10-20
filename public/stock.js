/* HIK PALERMO — disponibilità di magazzino dal file «analisi stock» (caricato dal Magazzino).
   Per ogni codice SAP: stock 1100 (interno), 1006 (esterno), 1003 (non lavorati), totale, PO, OC, disponibilità futura, stock AMS.
   Il file viene letto nel browser; i dati estratti vanno su R2 (JSON) e il riferimento in stockInfo/current, comune a gruppo e ProAV. */
(function () {
  'use strict';
  const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const LAB = { i1100: 'Stock 1100 · magazzino interno', e1006: 'Stock 1006 · magazzino esterno', n1003: 'Stock 1003 · non lavorati', tot: 'Stock totale (1100+1006+1003)', po: 'PO · ordini acquisti', oc: 'OC · ordini vendita', fut: 'Disponibilità futura', ams: 'Stock AMS (Amsterdam)' };
  const NL = '<svg viewBox="0 0 9 6" width="14" height="10" aria-hidden="true"><rect width="9" height="2" fill="#AE1C28"/><rect y="2" width="9" height="2" fill="#fff"/><rect y="4" width="9" height="2" fill="#21468B"/></svg>';
  // bandiera della Sicilia con la trinacria: articoli presenti nel magazzino 1009 (filiale di Palermo)
  const SIC = '<svg viewBox="0 0 30 20" width="15" height="10" aria-hidden="true"><path d="M0 0H30L0 20Z" fill="#D21034"/><path d="M30 0V20H0Z" fill="#FCDD09"/><g transform="translate(15 10)" fill="none" stroke="#3b2a1a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M0 -1.8 L0 -6 L3 -7.5"/><path d="M1.6 0.9 L5.2 3 L5 6.4"/><path d="M-1.6 0.9 L-5.2 3 L-8 1.4"/></g><circle cx="15" cy="10" r="2.4" fill="#F2C19B" stroke="#3b2a1a" stroke-width=".8"/></svg>';
  S.stock = null; S.stockInfo = null; let loadedBlob = null; S.mag1009 = null;
  const fmt = v => (+v || 0).toLocaleString('it-IT', { maximumFractionDigits: 2 });

  async function loadBlob(info) {
    if (!info || !info.blob || info.blob === loadedBlob) return; loadedBlob = info.blob;
    try {
      const r = await fetch('/_blob/' + info.blob, { credentials: 'same-origin' }); if (!r.ok) throw new Error(r.status);
      const d = await r.json(); const m = new Map(); const K = d.cols;
      for (const row of d.rows) { const o = {}; K.forEach((k, i) => o[k] = row[i + 1]); m.set(String(row[0]), o); }
      S.stock = m; changed();
    } catch (e) { loadedBlob = null; console.warn('stock', e); }
  }
  const t0 = setInterval(() => {
    if (typeof db === 'undefined' || !db || !S.me) return; clearInterval(t0);
    ref('stockInfo', 'current').onSnapshot(s => { S.stockInfo = s.exists ? s.data() : null; loadBlob(S.stockInfo); changed(); }, () => { });
    // magazzino di filiale (1009) del gruppo, anche su ProAV: indice per SAP e per codice
    db.collection('!magazzino').onSnapshot(sn => {
      const m = new Map(); const add = (k, x) => { if (!k) return; const o = m.get(k) || { sede: 0, demo: 0, n: 0 }; const q = +x.qty || 0; if ((x.stato || 'sede') === 'sede') o.sede += q; else if (x.stato === 'demo') o.demo += q || 1; o.n++; m.set(k, o); };
      sn.docs.forEach(d => { const x = d.data(); if (!x) return; if (x.magSap && String(x.magSap) !== '1009') return; add('s:' + String(x.sap || '').trim(), x); if (x.code && !/^SAP /.test(x.code)) add('c:' + (typeof norm === 'function' ? norm(x.code) : x.code), x); });
      S.mag1009 = m; changed();
    }, () => { });
  }, 500);
  window.hpMag1009 = function (it) {
    if (!S.mag1009 || !it) return null; if (typeof it === 'string') { const f = typeof findCode === 'function' ? findCode(it) : null; it = f || { c: it }; }
    return S.mag1009.get('s:' + String(it.sap || '').trim()) || (it.cn ? S.mag1009.get('c:' + it.cn) : null) || (it.c && typeof norm === 'function' ? S.mag1009.get('c:' + norm(it.c)) : null) || null;
  };
  const sicFlag = () => { const f = el('span', { class: 'hp-flag-nl', role: 'img', 'aria-label': 'Sicilia · magazzino 1009' }); f.innerHTML = SIC; return f; };

  // record di stock di un articolo (dal SAP del listino; per un codice cerca l'articolo nel catalogo)
  window.hpStock = function (it) {
    if (!S.stock || !it) return null;
    if (typeof it === 'string') { const f = typeof findCode === 'function' ? findCode(it) : null; it = f || { sap: '' }; }
    const sap = String(it.sap || '').trim(); if (sap && S.stock.has(sap)) return S.stock.get(sap);
    // stesso codice in un altro listino con SAP diverso
    const alt = (S.byCode && S.byCode.get(it.cn || '')) || []; for (const x of alt) { const k = String(x.sap || '').trim(); if (k && S.stock.has(k)) return S.stock.get(k); }
    return sap || alt.length ? { i1100: 0, e1006: 0, n1003: 0, tot: 0, po: 0, oc: 0, fut: 0, ams: 0, none: true } : null;
  };
  const tip = s => Object.keys(LAB).map(k => LAB[k] + ': ' + fmt(s[k])).join('\n') + (S.stockInfo ? '\n— ' + (S.stockInfo.label || 'analisi stock') + ' del ' + fD(S.stockInfo.at) : '');
  // nelle liste: bandiera italiana = magazzini italiani (stock totale, con la disponibilità futura), bandiera olandese = AMS
  window.hpStockChip = function (it) {
    const s = window.hpStock(it), g = window.hpMag1009(it); if (!s && !g) return null;
    const sic = g ? el('span', { class: 'hp-stk-i', title: 'Magazzino 1009 (filiale Palermo): ' + fmt(g.sede) + ' in sede' + (g.demo ? ' · ' + fmt(g.demo) + ' in demo' : '') }, sicFlag(), el('b', { class: g.sede > 0 ? 'ok' : '' }, fmt(g.sede)), g.demo ? el('small', {}, '+' + fmt(g.demo) + ' demo') : null) : null;
    if (!s) return el('span', { class: 'hp-stk', onclick: e => e.stopPropagation() }, sic);
    const nl = el('span', { class: 'hp-flag-nl', role: 'img', 'aria-label': 'Amsterdam' }); nl.innerHTML = NL;
    return el('span', { class: 'hp-stk' + (s.tot > 0 || s.ams > 0 ? '' : ' zero'), title: tip(s), onclick: e => e.stopPropagation() },
      el('span', { class: 'hp-stk-i' }, el('span', { class: 'hp-flag-it', role: 'img', 'aria-label': 'Italia' }), el('b', { class: s.tot > 0 ? 'ok' : '' }, fmt(s.tot)), s.fut !== s.tot ? el('small', {}, '→ ' + fmt(s.fut)) : null),
      el('span', { class: 'hp-stk-i' }, nl, el('b', { class: s.ams > 0 ? 'ok' : '' }, fmt(s.ams))), sic);
  };
  // nella scheda prodotto: tutte le colonne
  window.hpStockBox = function (it) {
    const s0 = window.hpStock(it), g = window.hpMag1009(it); if (!s0 && !g) return null;
    const s = s0 || { i1100: 0, e1006: 0, n1003: 0, tot: 0, po: 0, oc: 0, fut: 0, ams: 0, none: true };
    const sicRow = g ? el('div', { class: 'hp-stkams' }, sicFlag(), el('span', {}, 'Magazzino 1009 · filiale Palermo', g.demo ? el('small', { class: 'hint' }, ' · ' + fmt(g.demo) + ' in demo') : null), el('b', { class: 'num' + (g.sede > 0 ? ' pos' : '') }, fmt(g.sede))) : null;
    const nl = el('span', { class: 'hp-flag-nl', role: 'img', 'aria-label': 'Amsterdam' }); nl.innerHTML = NL;
    const cell = (k, cls) => el('div', { class: 'hp-stkc' + (cls ? ' ' + cls : '') }, el('span', { class: 'eyebrow' }, LAB[k]), el('b', { class: 'num' + ((+s[k]) < 0 ? ' neg' : (+s[k]) > 0 ? ' pos' : '') }, fmt(s[k])));
    return el('section', { class: 'panel stack hp-stkbox' },
      el('div', { class: 'panel-h' }, el('h4', { class: 'row', style: 'gap:6px;margin:0' }, el('span', { class: 'hp-flag-it', role: 'img', 'aria-label': 'Italia' }), 'Disponibilità', s.none ? el('span', { class: 'hint' }, ' · codice non presente nell\'analisi stock') : null),
        el('span', { class: 'hint' }, S.stockInfo ? (S.stockInfo.label || 'Analisi stock') + ' · caricata il ' + fD(S.stockInfo.at) : '')),
      el('div', { class: 'hp-stkgrid' }, cell('i1100'), cell('e1006'), cell('n1003'), cell('tot', 'tot'), cell('po'), cell('oc'), cell('fut', 'tot')),
      el('div', { class: 'hp-stkams' }, nl, el('span', {}, LAB.ams), el('b', { class: 'num' + (s.ams > 0 ? ' pos' : s.ams < 0 ? ' neg' : '') }, fmt(s.ams))), sicRow);
  };

  /* ---------- caricamento del file ---------- */
  const fileIn = el('input', { type: 'file', accept: '.xlsb,.xlsx,.xlsm', hidden: true }); document.body.append(fileIn);
  fileIn.addEventListener('change', () => { const f = fileIn.files[0]; fileIn.value = ''; if (f) run(f); });
  window.hpStockUpload = () => fileIn.click();
  function run(file) {
    const bar = el('i', { style: { width: '3%' } }), txt = el('p', { class: 'hint' }, 'Preparo la lettura…');
    let w = null;
    const m = modal('Carico l\'analisi stock', el('div', { class: 'stack' }, el('p', {}, el('b', {}, file.name), ' · ' + (file.size / 1048576).toFixed(1) + ' MB'), el('div', { class: 'hp-prog' }, bar), txt, el('p', { class: 'hint' }, 'Il file viene letto qui nel browser: si salvano solo le quantità per codice SAP.')), [btn('Annulla', () => { w && w.terminate(); m.close(); })], { sticky: true });
    file.arrayBuffer().then(buf => {
      w = new Worker('/stock-worker.js');
      w.onmessage = async ev => {
        const d = ev.data; if (d.progress != null) { bar.style.width = d.progress + '%'; txt.textContent = d.text; return; }
        w.terminate();
        if (d.error) { m.close(); toast('Lettura non riuscita: ' + d.error, 'bad'); return; }
        try {
          txt.textContent = 'Salvo i dati…'; bar.style.width = '92%';
          const R = d.result; const wk = /WK\s*(\d{1,2})[_\s-]*(\d{4})?/i.exec(file.name);
          const blobF = new File([JSON.stringify({ cols: R.cols, rows: R.rows })], 'analisi-stock.json', { type: 'application/json' });
          const up = await assets.upload(blobF, { type: 'application/json' });
          const info = { blob: up.id, file: file.name, label: wk ? 'Settimana ' + wk[1] + (wk[2] ? ' ' + wk[2] : '') : 'Analisi stock', n: R.rows.length, righe: R.righe, at: Date.now(), by: S.me };
          const set = new Set(R.rows.map(r => r[0])); const match = S.cat ? S.cat.filter(it => it.sap && set.has(String(it.sap).trim())).length : 0;
          if (await put('stockInfo', 'current', info)) { m.close(); toast('Analisi stock caricata: ' + R.rows.length.toLocaleString('it-IT') + ' codici SAP con disponibilità' + (match ? ' · ' + match.toLocaleString('it-IT') + ' articoli dei listini' : '')); }
          else m.close();
        } catch (e) { m.close(); toast('Salvataggio non riuscito: ' + (e.message || e), 'bad'); }
      };
      w.onerror = e => { m.close(); toast('Lettura non riuscita: ' + (e.message || 'errore nel file'), 'bad'); };
      w.postMessage({ buf, lib: LIB }, [buf]);
    }).catch(e => { m.close(); toast('File non leggibile: ' + e.message, 'bad'); });
  }
})();
