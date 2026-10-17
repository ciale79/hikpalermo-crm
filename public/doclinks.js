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
  window.hpDlBox = function (code) {
    const a = window.hpDl(code); if (!a.length) return null;
    return el('section', { class: 'panel stack', style: 'background:var(--surface-2)' }, el('h4', { class: 'row', style: 'gap:6px' }, el('span', { class: 'hp-flag-it', role: 'img', 'aria-label': 'Documentazione in italiano' }), 'Datasheet e altro'),
      el('div', { class: 'linkrow' }, a.map(x => el('a', { class: 'btn', href: x.u, target: '_blank', rel: 'noopener', title: x.t || x.u }, ic('dl', 16), x.l || 'Download'))));
  };
})();
