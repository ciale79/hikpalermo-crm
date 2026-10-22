/* HIK PALERMO — riquadri del cruscotto: scorciatoia all'analisi capitolato e «pillola del giorno» (un articolo NEW dei listini) */
(function () {
  'use strict';
  // ——— Capitolato: ultima analisi salvata + nuova analisi
  window.hpCapTile = function () {
    const V = VIEWS.cap || {}; const last = (S.capitolati || [])[0];
    const open = c => { S.capRes = c; go('cap'); window.scrollTo(0, 0); };
    const nuova = e => { e.stopPropagation(); if (!V.busy) S.capRes = null; go('cap'); window.scrollTo(0, 0); };
    const t = last ? offTot(last.righe) : null;
    return el('div', { class: 'kpi hp-captile', role: 'button', tabindex: '0', title: last ? 'Apri l\'ultima analisi: ' + (last.nome || 'Capitolato') : 'Analizza un capitolato', onclick: () => last ? open(last) : go('cap'), onkeydown: e => { if (e.key === 'Enter') last ? open(last) : go('cap'); } },
      el('div', { class: 'row between', style: 'gap:6px;flex-wrap:nowrap' }, el('span', { class: 'eyebrow' }, 'Ultimo capitolato'), el('button', { type: 'button', class: 'hp-capnew', title: 'Nuova analisi di un capitolato', onclick: nuova }, ic('plus', 12), 'Nuova')),
      V.busy ? el('span', { class: 'hp-capn' }, el('span', { class: 'spin' }), ' Analisi in corso…') : last ? el('span', { class: 'hp-capn', title: last.nome || '' }, last.nome || 'Capitolato') : el('span', { class: 'hp-capn muted' }, 'Nessuna analisi ancora'),
      last ? el('span', { class: 's' }, fD(last.at) + ' · ' + (last.righe || []).length + ((last.righe || []).length === 1 ? ' articolo' : ' articoli') + (t && t.N ? ' · ' + eur0(t.N) : '')) : el('span', { class: 's' }, 'Dal capitolato ai dispositivi conformi'),
      last && last.by ? el('span', { class: 's', style: 'font-size:.72rem' }, 'di ' + (last.by === S.me ? 'te' : nm(last.by))) : null);
  };

  // ——— Pillola del giorno: un articolo contrassegnato NEW, scelto in base alla data (uguale per tutti nella giornata)
  let shift = 0;
  const hash = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  // su proav.hikpalermo.com: prodotti audio video del listino Pro T&D (display, LED, monitor interattivi, audio…)
  const AV = new Set(['LCD WALL', 'DISPLAY', 'DIGITAL SIGNAGE', 'INTERACTIVE MONITOR', 'LEDWALL', 'WEBCAM', 'AUDIO', 'CONTROLLER']);
  const isPav = () => typeof HP_PAV !== 'undefined' && HP_PAV;
  function pick() {
    const seen = new Set(), news = [];
    const ok = isPav() ? (it => it.L === 'td' && AV.has(String(it.sz || '').toUpperCase()) && !/accessor|staff|bracket|support|mount|kit\b|cavo|cable|telecomando|remote/i.test((it.b || '') + ' ' + (it.fm || ''))) : (it => it.inf === 'NEW');
    for (const it of S.cat || []) if (ok(it) && !seen.has(it.cn)) { seen.add(it.cn); news.push(it); }
    if (!news.length) return null;
    news.sort((a, b) => a.cn < b.cn ? -1 : 1);
    const d = new Date(), key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    return { it: news[(hash(key) + shift) % news.length], n: news.length };
  }
  // marchio dell'articolo: logo ufficiale in /brand-<marchio>.png; se il file non c'è, il nome del marchio in piccolo
  const BRAND = { hikvision: 'Hikvision', hiwatch: 'HiWatch', hikmicro: 'HIKMICRO', hilook: 'HiLook', hikauto: 'Hikauto', ezviz: 'EZVIZ' };
  // prima il codice (DS- Hikvision, HW HiWatch, IPC-/NVR-/THC- HiLook…), poi il listino da cui viene l'articolo
  const brandOf = it => { const c = String(it.c || '').toUpperCase();
    if (/^DS-|^IDS-|^AE-/.test(c)) return 'hikvision';
    if (/^CS-|^EZVIZ|^BC\d|^CB\d/.test(c)) return 'ezviz';
    if (/^HW[A-Z]-|^HWI|^HWN|^HWT|^HWP|^HWD|^HWK/.test(c)) return 'hiwatch';
    if (/^(IPC|NVR|DVR|THC|TVI|PTZ|HL|HBS)-/.test(c) || /^HILOOK/.test(c)) return 'hilook';
    if (/^HM-|^HIKMICRO|^SP\d|^HM\d/.test(c)) return 'hikmicro';
    return it.L === 'hw' ? 'hiwatch' : it.L === 'hm' ? 'hikmicro' : it.L === 'hl' ? 'hilook' : (it.L === 'vt' && SRC[it.s] && SRC[it.s].tag === 'HIKAUTO') ? 'hikauto' : 'hikvision'; };
  function brandMark(it) {
    const b = brandOf(it), name = BRAND[b];
    const txt = () => el('span', { class: 'hp-brand-t' }, name);
    return el('span', { class: 'hp-brand', title: 'Marchio: ' + name }, el('img', { src: '/brand-' + b + '.png', alt: name, onerror: e => e.currentTarget.replaceWith(txt()) }));
  }
  window.hpPillTile = function () {
    const d = new Date(); const P = pick();
    const date = el('div', { class: 'hp-pill-d' }, el('b', {}, d.getDate() + ' ' + d.toLocaleDateString('it-IT', { month: 'long' })), el('small', {}, d.toLocaleDateString('it-IT', { weekday: 'long' })));
    if (!P) return el('div', { class: 'kpi hp-pill' }, el('span', { class: 'eyebrow' }, 'Pillola del giorno'), date, el('div', {}, el('span', { class: 's' }, S.cat && S.cat.length ? (isPav() ? 'Nessun prodotto audio video nel listino Pro T&D' : 'Nessun articolo NEW nei listini') : 'Caricamento listini…')));
    const it = P.it;
    const again = el('button', { type: 'button', class: 'hp-capnew', title: isPav() ? 'Mostra un altro prodotto audio video' : 'Mostra un altro articolo NEW', 'aria-label': isPav() ? 'Un altro prodotto audio video' : 'Un altro articolo NEW', onclick: e => { e.stopPropagation(); shift += 1 + Math.floor(Math.random() * (P.n - 1)); const n = window.hpPillTile(); tile.replaceWith(n); } }, '↻');
    const tile = el('div', { class: 'kpi hp-pill', role: 'button', tabindex: '0', title: 'Apri la scheda di ' + it.c, onclick: () => artDetail(it), onkeydown: e => { if (e.key === 'Enter') artDetail(it); } },
      el('div', { class: 'row between', style: 'gap:6px;flex-wrap:nowrap' }, el('span', { class: 'eyebrow' }, 'Pillola del giorno'), el('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' }, brandMark(it), again)),
      date,
      el('div', { class: 'hp-pill-b' }, thumb(it.im, 48),
        el('div', { class: 'hp-pill-t' }, el('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap;min-width:0' }, isPav() ? el('span', { class: 'tag new hp-avtag', title: 'Categoria nel listino Pro T&D' }, String(it.sz || 'AV')) : el('span', { class: 'tag new' }, 'NEW'), el('b', { class: 'mono hp-pill-c', title: it.c }, it.c)), el('span', { class: 'hp-pill-x', title: it.b }, it.b), el('span', { class: 's num' }, 'Listino ' + eur(it.p) + (isPav() ? ' · Pro T&D' : ' · ' + (SRC[it.s] ? SRC[it.s].name : it.L === 'sol' ? 'Solution' : 'Pro'))))));
    return tile;
  };
})();
/* ——— Cruscotto: tasti rapidi in alto */
(function () {
  'use strict';
  window.hpQuickBar = function () {
    const n = (x, s, p) => x + ' ' + (x === 1 ? s : p);
    const has = v => typeof VIEWS !== 'undefined' && VIEWS[v];
    const mag = S.mag ? S.mag.size : 0, demo = S.demo ? [...S.demo.values()].filter(d => d.stato !== 'chiusa').length : 0;
    const now = Date.now(), up = [...S.eventi.values()].filter(e => e.end >= now && e.start <= now + 7 * 864e5).length;
    const today = [...S.eventi.values()].filter(e => new Date(e.start).toDateString() === new Date().toDateString()).length;
    const part = [...S.clienti.values()].filter(c => c.partner).length;
    const att = [...S.commesse.values()].filter(c => !['chiusa', 'persa'].includes(c.stato)).length;
    const B = (icon, lab, sub, on, cls) => el('button', { type: 'button', class: 'hp-qb' + (cls ? ' ' + cls : ''), onclick: on }, el('span', { class: 'hp-qi' }, ic(icon, 22)), el('span', { class: 'hp-qt' }, el('b', {}, lab), el('small', {}, sub)));
    return el('nav', { class: 'hp-qbar', 'aria-label': 'Accesso rapido' },
      B('plus', 'Nuova commessa', att + (att === 1 ? ' attiva' : ' attive'), () => commessaForm({}), 'pri'),
      B('brief', 'Commesse', n(S.commesse.size, 'commessa', 'commesse'), () => go('commesse')),
      has('magazzino') ? B('whs', 'Magazzino', demo ? demo + ' in demo' : n(mag, 'articolo', 'articoli'), () => go('magazzino')) : null,
      B('cal', 'Calendario', today ? today + ' oggi' : up + ' in 7 giorni', () => go('cal')),
      B('box', 'Articoli', (S.cat ? S.cat.length.toLocaleString('it-IT') : '…') + ' a listino', () => go('art')),
      has('partner') ? B('medal', 'Partner', part ? part + ' partner' : 'Programmi', () => go('partner')) : null);
  };
})();
