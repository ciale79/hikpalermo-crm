/* HIK PALERMO — LED wall nelle offerte.
   · Kit (moduli + cabinet) del listino ProAV: il prezzo del listino è AL METRO QUADRO e la quantità della riga è in m².
     Dai m² si calcolano i cabinet (m² ÷ superficie del cabinet) e i moduli (cabinet × moduli per cabinet); il prezzo a cabinet = prezzo al m² × superficie.
   · Cabinet o moduli venduti da soli: prezzo e quantità a pezzi; i m² si calcolano dalla superficie del pezzo. */
(function () {
  'use strict';
  const NUM = '(\\d{2,4}(?:[.,]\\d+)?)';
  const DIM = new RegExp(NUM + '\\s*(?:mm)?\\s*[x×*]\\s*' + NUM, 'i');
  const RX = [new RegExp('cabinet[^.;]{0,40}?' + NUM + '\\s*[x×*]\\s*' + NUM, 'i'), new RegExp('dim\\.?\\s*' + NUM + '\\s*[x×*]\\s*' + NUM, 'i'),
    new RegExp(NUM + '\\s*[x×*]\\s*' + NUM + '\\s*mm\\s*/?\\s*(?:cabinet|model|module)', 'i'), new RegExp('modul[oe]\\s*' + NUM + '\\s*[x×*]\\s*' + NUM, 'i')];
  const ar = m => { const x = parseFloat(m[1].replace(',', '.')), y = parseFloat(m[2].replace(',', '.')); return x >= 100 && y >= 100 && x <= 2000 && y <= 2000 ? Math.round(x * y) / 1e6 : null; };
  const cache = new Map();
  function infoOf(it) {
    if (!it) return null; const k = (it.L || '') + '|' + it.c; if (cache.has(k)) return cache.get(k);
    const ref = it.pavRef && it.pavRef.r; const kit = (ref && ref.kit) || [];
    let res = null;
    if (kit.length) { // kit: cabinet + moduli, prezzo al m²
      const cab = kit.find(x => /cabinet|struttura/i.test(x.d2 || '')) || kit.find(x => /^\s*(struttura|cabinet)/i.test(x.d || '')) || kit[kit.length - 1];
      const mods = kit.filter(x => x !== cab);
      let A = null; for (const t of [cab.d2, cab.d]) { const m = t && DIM.exec(t); if (m && (A = ar(m))) break; }
      if (!A) { const txt = kit.map(x => (x.d || '') + ' ' + (x.d2 || '')).join(' '); for (const rx of RX) { const m = rx.exec(txt); if (m && (A = ar(m))) break; } }
      const nMod = mods.reduce((a, x) => a + (+x.q || 0), 0) || null;
      if (A && /led/i.test(kit.map(x => (x.d || '') + (x.d2 || '')).join(' '))) res = { kit: true, A, nMod, cabC: cab.c, modC: mods[0] && mods[0].c };
    } else {
      const txt = [it.d, it.b, ref && ref.d, ref && ref.d2].filter(Boolean).join(' \n ');
      const led = /led/i.test(String(it.sz || '') + ' ' + txt.slice(0, 300)) && !/controller|receiving card|power supply|sensor|bracket|hanger|hanging bar|frame|all-in-one|aio/i.test(String(it.b || '') + ' ' + String(ref && ref.d2 || ''));
      // un solo codice: è il cabinet (moduli già dentro), il prezzo del listino è al m² come per i kit
      if (led) for (const rx of RX) { const m = rx.exec(txt); const A = m && ar(m); if (A) { res = { kit: true, single: true, A, nMod: null, cabC: it.c, modC: null }; break; } }
    }
    cache.set(k, res); return res;
  }
  const fc = r => (typeof findCode === 'function' ? findCode(r.c, r.L) : null);
  window.hpLedInfo = r => r ? infoOf(fc(r)) : null;
  window.hpLedArea = r => { const i = window.hpLedInfo(r); return i ? i.A : null; };
  const n2 = v => (Math.round(v * 100) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n4 = v => (+v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const nq = v => (Math.round(v * 100) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2 });
  window.hpMq = n2; window.hpMqA = n4; window.hpNq = nq;
  // quantità della riga in pezzi e in m² (per i kit la quantità della riga è già in m²)
  window.hpLedQ = function (r) {
    const i = window.hpLedInfo(r); if (!i) return null; const q = +r.q || 0;
    if (i.kit) { const cab = q / i.A; return { ...i, mq: q, cab, mods: i.nMod ? cab * i.nMod : null }; }
    return { ...i, mq: q * i.A, cab: q };
  };
  // prezzi: al m² e al pezzo (cabinet con i suoi moduli, per i kit)
  window.hpLedPrice = function (r, unitNet) { const i = window.hpLedInfo(r); if (!i) return null; return i.kit ? { ...i, perMq: unitNet, perPz: unitNet * i.A } : { ...i, perMq: unitNet / i.A, perPz: unitNet }; };
  window.hpLedPzTxt = function (r) { const x = window.hpLedQ(r); if (!x) return ''; return x.kit ? nq(x.cab) + ' cabinet' + (x.single ? '' : ' ' + (x.cabC || '')) + (x.mods != null ? ' + ' + nq(x.mods) + ' moduli ' + (x.modC || '') : '') + ' (' + n4(x.A) + ' m² a cabinet' + (x.nMod ? ', ' + x.nMod + ' moduli a cabinet' : '') + ')' : nq(x.cab) + ' pz da ' + n4(x.A) + ' m²'; };

  // celle della riga nei documenti: mq=true foglio «a metro quadro», mq=false foglio «a pezzi» (null = riga normale)
  window.hpLedCells = function (r, unit, mq, eur) {
    const x = window.hpLedQ(r); if (!x) return null;
    if (mq) return x.kit ? { q: n2(x.mq) + ' m²', l: eur(r.p) + '/m²', u: eur(unit) + '/m²', d: window.hpLedPzTxt(r) } : { q: n2(x.mq) + ' m²', l: eur(r.p / x.A) + '/m²', u: eur(unit / x.A) + '/m²', d: window.hpLedPzTxt(r) };
    return x.kit ? { q: nq(x.cab) + ' cab.' + (x.mods != null ? '\n' + nq(x.mods) + ' mod.' : ''), l: eur(r.p * x.A), u: eur(unit * x.A), d: window.hpLedPzTxt(r) + ' · ' + n2(x.mq) + ' m²' } : null;
  };
  // riquadro sotto la quantità della riga dell'offerta
  window.hpLedQty = function (r, qIn, onChange) {
    const i = window.hpLedInfo(r); if (!i) return null;
    const info = el('small', { class: 'hint hp-mqinfo' });
    if (i.kit) { // il riferimento è il cabinet: i m² scritti si arrotondano a cabinet interi (m² = cabinet × superficie del cabinet)
      // righe salvate prima, con il LED wall a codice unico contato a pezzi: i pezzi diventano cabinet (m² = pezzi × superficie)
      if (i.single && r.ledV == null) { r.q = Math.round((+r.q || 0) * i.A * 10000) / 10000; }
      r.ledV = 2;
      qIn.step = '0.01'; qIn.title = 'Metri quadri del LED wall: si arrotondano a cabinet interi (' + n4(i.A) + ' m² a cabinet); il prezzo del kit è al m²';
      // composizione di 2 articoli: cabinet e moduli, entrambi visibili e modificabili
      const cabIn = el('input', { type: 'number', min: 0, step: 1, class: 'ln-in hp-mqin', 'aria-label': 'Numero di cabinet ' + (i.cabC || ''), title: 'Cabinet ' + (i.cabC || '') + ': i m² si calcolano dalla superficie del cabinet (' + n4(i.A) + ' m²)' });
      const modIn = i.nMod ? el('input', { type: 'number', min: 0, step: i.nMod, class: 'ln-in hp-mqin', 'aria-label': 'Numero di moduli ' + (i.modC || ''), title: 'Moduli ' + (i.modC || '') + ' (' + i.nMod + ' per cabinet): si arrotondano a cabinet interi' }) : null;
      const setCab = c => { c = Math.max(0, Math.round(c)); r.q = Math.round(c * i.A * 10000) / 10000; qIn.value = r.q; };
      const upd = () => { const x = window.hpLedQ(r); if (document.activeElement !== cabIn) cabIn.value = Math.round(x.cab * 100) / 100; if (modIn && document.activeElement !== modIn) modIn.value = Math.round(x.mods * 100) / 100; info.textContent = r.mqReq != null && Math.abs(r.mqReq - x.mq) > 0.005 ? 'richiesti ' + n2(r.mqReq) + ' m²' : ''; info.title = n4(i.A) + ' m² a cabinet' + (i.nMod ? ' · ' + i.nMod + ' moduli a cabinet' : ''); qIn.title = 'm² totali: si arrotondano a cabinet interi (' + n4(i.A) + ' m² a cabinet' + (i.nMod ? ', ' + i.nMod + ' moduli a cabinet' : '') + '); il prezzo del kit è al m²'; };
      // scrivendo i m², all'uscita dal campo si passa al numero intero di cabinet (per eccesso)
      qIn.addEventListener('input', () => { r.mqReq = +qIn.value || 0; upd(); });
      qIn.addEventListener('change', () => { const v = +qIn.value || 0; r.mqReq = v; setCab(Math.ceil(v / i.A - 1e-9)); upd(); onChange(); });
      cabIn.addEventListener('input', () => { r.mqReq = null; setCab(+cabIn.value || 0); upd(); onChange(); });
      if (modIn) modIn.addEventListener('change', () => { r.mqReq = null; setCab(Math.ceil((+modIn.value || 0) / i.nMod - 1e-9)); upd(); onChange(); });
      if (Math.abs(r.q / i.A - Math.round(r.q / i.A)) > 0.005) { r.mqReq = r.mqReq ?? r.q; setCab(Math.ceil(r.q / i.A - 1e-9)); }
      upd();
      cabIn.title = 'Cabinet ' + (i.cabC || ''); if (modIn) modIn.title = 'Moduli ' + (i.modC || '') + ' (' + i.nMod + ' per cabinet)';
      return { mq: el('div', { class: 'stack', style: 'gap:2px;align-items:flex-end' }, qIn, info), cab: cabIn, pz: modIn };
    }
    const mq = el('input', { type: 'number', min: 0, step: 0.01, class: 'ln-in hp-mqin', 'aria-label': 'Metri quadri', title: 'Scrivi i m²: i pezzi si calcolano arrotondando per eccesso (' + n4(i.A) + ' m² a pezzo)', value: r.mq != null ? r.mq : Math.round((+r.q || 0) * i.A * 100) / 100 });
    const upd = () => { const tot = (+r.q || 0) * i.A; info.textContent = r.mq != null && Math.abs(tot - r.mq) > 0.005 ? 'richiesti ' + n2(r.mq) + ' m²' : n4(i.A) + ' m²/pz'; };
    mq.addEventListener('input', () => { const v = +mq.value || 0; r.mq = v; r.q = Math.ceil(v / i.A - 1e-9); qIn.value = r.q; upd(); onChange(); });
    qIn.addEventListener('input', () => { r.mq = null; mq.value = Math.round((+r.q || 0) * i.A * 100) / 100; upd(); });
    upd();
    return { mq: el('div', { class: 'stack', style: 'gap:2px;align-items:flex-end' }, mq, info), cab: null, pz: qIn };
  };
  if (!document.getElementById('hpLedCss')) document.head.append(el('style', { id: 'hpLedCss' }, '.hp-mqin{width:78px!important;text-align:right}.hp-mqinfo{font-size:.62rem;white-space:normal;max-width:130px;text-align:right;line-height:1.25}.hp-perm2{font-size:.66rem;color:var(--ink-3,#777);white-space:nowrap}'));
})();
