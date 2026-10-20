/* HIK PALERMO — documenti scaricabili per articolo (A&E spec, drawing, datasheet, manuali…) salvati nella raccolta «links» (campo dl) */
(function () {
  'use strict';
  const KIND = [[/a\s*&\s*e|a&e|aes|capitolato|specific/i, 'A&E spec', 'doc'], [/draw|disegn|dwg|cad|dimension/i, 'Drawing', 'doc'], [/data\s*sheet|datasheet|scheda tecnica/i, 'Datasheet', 'doc'], [/manual|guida|guide|quick/i, 'Manuale', 'doc'], [/bim|revit|ifc/i, 'BIM', 'doc'], [/cert|ce\b|dichiar|doc\b/i, 'Certificazioni', 'doc'], [/firmware|fw\b/i, 'Firmware', 'dl']];
  const kindOf = l => { for (const [rx, lab] of KIND) if (rx.test(l || '')) return lab; return l || 'Download'; };
  window.hpDlKind = kindOf;
  // indice per «codice base» (senza ottica/varianti tra parentesi): così il link vale per tutte le varianti del modello
  const nrm = x => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const base = x => nrm(String(x || '').replace(/\([^()]*\)/g, ''));
  let idxFor = null, idx = null;
  function index() {
    if (idxFor === S.links && idx) return idx;
    idx = new Map(); idxFor = S.links;
    for (const l of S.links.values()) {
      if (!Array.isArray(l.dl) || !l.dl.length) continue;
      const ks = new Set([...(l.keys || []), base(l.code), nrm(l.code)]);
      for (const k of ks) { if (!k) continue; const a = idx.get(k) || []; for (const d of l.dl) if (!a.some(x => x.u === d.u)) a.push(d); idx.set(k, a); }
    }
    return idx;
  }
  window.hpDl = function (code) {
    if (!code) return [];
    const own = S.links.get(lkey(code)); const out = own && Array.isArray(own.dl) ? own.dl.slice() : [];
    const I = index();
    for (const k of [nrm(code), base(code)]) for (const d of I.get(k) || []) if (!out.some(x => x.u === d.u)) out.push(d);
    return out;
  };
  function dlModal(code) {
    const a = window.hpDl(code);
    const m = modal('Datasheet e altro · ' + code, el('div', { class: 'stack' }, ...a.map(x => el('a', { class: 'hp-dlrow', href: x.u, target: '_blank', rel: 'noopener' }, ic('dl', 16), el('b', {}, x.l || kindOf(x.t)), x.t && x.t !== x.l ? el('span', { class: 'hint' }, x.t) : null)),
      el('p', { class: 'hint' }, 'I link aprono la cartella dei documenti su Google Drive di Hikvision Italia (schede tecniche, A&E, disegni…).')), [el('span', { class: 'grow' }), btn('Chiudi', () => m.close())]);
  }
  window.hpDlChip = function (code) {
    const a = window.hpDl(code); if (!a.length) return null;
    return el('button', { type: 'button', class: 'tag hp-dltag', title: 'Datasheet e documentazione in italiano: ' + a.map(x => x.l).join(', '), onclick: e => { e.stopPropagation(); dlModal(code); } }, el('span', { class: 'hp-flag-it', role: 'img', 'aria-label': 'Documentazione in italiano', title: 'Documentazione in italiano' }), 'Datasheet e altro');
  };
  // pagina ufficiale su hikvision.com (inglese): manuali, firmware, documentazione globale
  const UK = '<svg viewBox="0 0 60 30" width="15" height="10" aria-hidden="true"><clipPath id="hpuk"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath><path d="M0,0 v30 h60 v-30 z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#hpuk)" stroke="#C8102E" stroke-width="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></svg>';
  const isModel = c => /^[A-Za-z]{1,8}-[A-Za-z0-9]/.test(String(c || '').trim());
  window.hpGlobalChip = function (code, cls) {
    if (!isModel(code)) return null;
    // «Cerca Datasheet»: lo stesso link della scheda articolo (salvato dal gruppo o ricerca su hikvision.com), senza usare l'AI
    const dl = typeof docLinks === 'function' ? docLinks(code) : { ds: 'https://www.google.com/search?q=' + encodeURIComponent('site:hikvision.com ' + code + ' datasheet') };
    const a = el('a', { class: cls || 'tag hp-gltag', href: dl.ds, target: '_blank', rel: 'noopener', title: dl.dsSaved ? 'Datasheet ufficiale (link salvato)' : 'Cerca il datasheet su hikvision.com (in inglese)', onclick: e => e.stopPropagation() });
    const f = el('span', { class: 'hp-flag-uk', role: 'img', 'aria-label': 'Documentazione in inglese' }); f.innerHTML = UK;
    a.append(f, 'Cerca Datasheet'); return a;
  };
  // AcuSeek: dal listino (descrizione) o dalla pagina ufficiale trovata dal server
  S.hikpage = new Map();
  claude.use('db').then(db => { if (db) db.collection('hikpage').onSnapshot(sn => { const m = new Map(); sn.docs.forEach(d => { const x = d.data(); if (x && x.model) m.set(nrm(x.model), x); }); S.hikpage = m; if (['art'].includes(S.view) && VIEWS[S.view]) VIEWS[S.view].update(); }, () => { }); });
  window.hpAcuSeek = function (it) {
    if (!it) return false; const c = typeof it === 'string' ? (findCode(it) || { c: it }) : it;
    if (c.hay ? /acu\s*seek/i.test(c.hay + ' ' + (c.d || '')) : /acu\s*seek/i.test(c.d || '')) return true;
    const h = S.hikpage.get(base(c.c)); return !!(h && h.acuseek);
  };
  window.hpAcuSeekBadge = function (it, big) {
    if (!window.hpAcuSeek(it)) return null;
    return el('img', { src: '/acuseek.png', alt: 'AcuSeek', title: 'Supporta AcuSeek (ricerca intelligente in linguaggio naturale)', class: 'hp-acuseek' + (big ? ' big' : '') });
  };
  window.hpDlBox = function (code) {
    const a = window.hpDl(code); if (!a.length) return null;
    return el('section', { class: 'panel stack', style: 'background:var(--surface-2)' }, el('h4', { class: 'row', style: 'gap:6px' }, el('span', { class: 'hp-flag-it', role: 'img', 'aria-label': 'Documentazione in italiano' }), 'Datasheet e altro'),
      el('div', { class: 'linkrow' }, a.map(x => el('a', { class: 'btn', href: x.u, target: '_blank', rel: 'noopener', title: x.t || x.u }, ic('dl', 16), x.l || 'Download'))));
  };
})();
