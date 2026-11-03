/* HIK PALERMO — LED wall: superficie di un pezzo (cabinet, kit cabinet + moduli, modulo) letta dalle descrizioni del listino,
   per passare da pezzi a m² e viceversa e calcolare prezzo per pezzo e prezzo per m². */
(function () {
  'use strict';
  const NUM = '(\\d{2,4}(?:[.,]\\d+)?)';
  const RX = [new RegExp('cabinet[^.;]{0,40}?' + NUM + '\\s*[x×*]\\s*' + NUM, 'i'), new RegExp('dim\\.?\\s*' + NUM + '\\s*[x×*]\\s*' + NUM, 'i'),
    new RegExp(NUM + '\\s*[x×*]\\s*' + NUM + '\\s*mm\\s*/?\\s*(?:cabinet|model|module)', 'i'), new RegExp('modul[oe]\\s*' + NUM + '\\s*[x×*]\\s*' + NUM, 'i')];
  const cache = new Map();
  function areaOf(it) {
    if (!it) return null; const k = (it.L || '') + '|' + it.c; if (cache.has(k)) return cache.get(k);
    const ref = it.pavRef && it.pavRef.r; const kit = (ref && ref.kit) || [];
    const txt = [it.d, it.b, ref && ref.d, ref && ref.d2, ...kit.map(x => (x.d || '') + ' ' + (x.d2 || ''))].filter(Boolean).join(' \n ');
    const led = /led/i.test(String(it.sz || '') + ' ' + txt.slice(0, 300)) && !/controller|receiving card|power supply|sensor|bracket|hanger|hanging bar|frame/i.test(String(it.b || '') + ' ' + String(ref && ref.d2 || ''));
    let a = null;
    if (led) for (const rx of RX) { const m = rx.exec(txt); if (m) { const x = parseFloat(m[1].replace(',', '.')), y = parseFloat(m[2].replace(',', '.')); if (x >= 100 && y >= 100 && x <= 2000 && y <= 2000) { a = Math.round(x * y) / 1e6; break; } } }
    cache.set(k, a); return a;
  }
  window.hpLedArea = r => { if (!r) return null; if (r.ledA) return r.ledA; const it = typeof findCode === 'function' ? findCode(r.c, r.L) : null; return areaOf(it); };
  const n2 = v => (Math.round(v * 100) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  window.hpMq = v => n2(v);
  const n4 = v => (+v).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 }); window.hpMqA = n4;
  // riquadro m² sotto la quantità della riga dell'offerta
  window.hpLedQty = function (r, qIn, onChange) {
    const A = window.hpLedArea(r); if (!A) { delete r.ledA; return null; } r.ledA = A;
    const mq = el('input', { type: 'number', min: 0, step: 0.01, class: 'ln-in hp-mqin', 'aria-label': 'Metri quadri', title: 'Scrivi i m²: i pezzi si calcolano arrotondando per eccesso (' + n4(A) + ' m² a pezzo)', value: r.mq != null ? r.mq : Math.round((+r.q || 0) * A * 100) / 100 });
    const info = el('small', { class: 'hint hp-mqinfo' });
    const upd = () => { const tot = (+r.q || 0) * A; info.textContent = n4(A) + ' m²/pz · ' + n2(tot) + ' m² in offerta' + (r.mq != null && Math.abs(tot - r.mq) > 0.005 ? ' (richiesti ' + n2(r.mq) + ')' : ''); };
    mq.addEventListener('input', () => { const v = +mq.value || 0; r.mq = v; const q = Math.ceil(v / A - 1e-9); r.q = q; qIn.value = q; upd(); onChange(); });
    qIn.addEventListener('input', () => { r.mq = null; mq.value = Math.round((+r.q || 0) * A * 100) / 100; upd(); });
    upd();
    return el('div', { class: 'stack', style: 'gap:2px;align-items:flex-end;margin-top:4px' }, el('label', { class: 'row', style: 'gap:4px;flex-wrap:nowrap' }, mq, el('span', { class: 'hint' }, 'm²')), info);
  };
  // prezzi per pezzo e per m² della riga
  window.hpLedPrice = function (r, unitNet) { const A = window.hpLedArea(r); if (!A) return null; return { A, mqTot: (+r.q || 0) * A, perMq: unitNet / A }; };
  if (!document.getElementById('hpLedCss')) document.head.append(el('style', { id: 'hpLedCss' }, '.hp-mqin{width:78px!important;text-align:right}.hp-mqinfo{font-size:.64rem;white-space:nowrap}.hp-perm2{font-size:.66rem;color:var(--ink-3,#777);white-space:nowrap}'));
})();
