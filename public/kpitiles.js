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
  function pick() {
    const seen = new Set(), news = [];
    for (const it of S.cat || []) if (it.inf === 'NEW' && !seen.has(it.cn)) { seen.add(it.cn); news.push(it); }
    if (!news.length) return null;
    news.sort((a, b) => a.cn < b.cn ? -1 : 1);
    const d = new Date(), key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    return { it: news[(hash(key) + shift) % news.length], n: news.length };
  }
  window.hpPillTile = function () {
    const d = new Date(); const P = pick();
    const date = el('div', { class: 'hp-pill-d' }, el('b', {}, d.getDate() + ' ' + d.toLocaleDateString('it-IT', { month: 'long' })), el('small', {}, d.toLocaleDateString('it-IT', { weekday: 'long' })));
    if (!P) return el('div', { class: 'kpi hp-pill' }, el('span', { class: 'eyebrow' }, 'Pillola del giorno'), date, el('div', {}, el('span', { class: 's' }, S.cat ? 'Nessun articolo NEW nei listini' : 'Caricamento listini…')));
    const it = P.it;
    const again = el('button', { type: 'button', class: 'hp-capnew', title: 'Mostra un altro articolo NEW', 'aria-label': 'Un altro articolo NEW', onclick: e => { e.stopPropagation(); shift += 1 + Math.floor(Math.random() * (P.n - 1)); const n = window.hpPillTile(); tile.replaceWith(n); } }, '↻');
    const tile = el('div', { class: 'kpi hp-pill', role: 'button', tabindex: '0', title: 'Apri la scheda di ' + it.c, onclick: () => artDetail(it), onkeydown: e => { if (e.key === 'Enter') artDetail(it); } },
      el('div', { class: 'row between', style: 'gap:6px;flex-wrap:nowrap' }, el('span', { class: 'eyebrow' }, 'Pillola del giorno'), again),
      date,
      el('div', { class: 'hp-pill-b' }, thumb(it.im, 48),
        el('div', { class: 'hp-pill-t' }, el('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap;min-width:0' }, el('span', { class: 'tag new' }, 'NEW'), el('b', { class: 'mono hp-pill-c', title: it.c }, it.c)), el('span', { class: 'hp-pill-x', title: it.b }, it.b), el('span', { class: 's num' }, 'Listino ' + eur(it.p) + (it.L === 'sol' ? ' · Solution' : ' · Pro')))));
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
