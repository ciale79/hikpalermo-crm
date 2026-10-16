/* HIK PALERMO — documenti scaricabili per articolo (A&E spec, drawing, datasheet, manuali…) salvati nella raccolta «links» (campo dl) */
(function () {
  'use strict';
  const KIND = [[/a\s*&\s*e|a&e|aes|capitolato|specific/i, 'A&E spec', 'doc'], [/draw|disegn|dwg|cad|dimension/i, 'Drawing', 'doc'], [/data\s*sheet|datasheet|scheda tecnica/i, 'Datasheet', 'doc'], [/manual|guida|guide|quick/i, 'Manuale', 'doc'], [/bim|revit|ifc/i, 'BIM', 'doc'], [/cert|ce\b|dichiar|doc\b/i, 'Certificazioni', 'doc'], [/firmware|fw\b/i, 'Firmware', 'dl']];
  const kindOf = l => { for (const [rx, lab] of KIND) if (rx.test(l || '')) return lab; return l || 'Download'; };
  window.hpDlKind = kindOf;
  window.hpDl = function (code) {
    if (!code) return [];
    const l = S.links.get(lkey(code)) || (typeof findCode === 'function' && findCode(code) ? S.links.get(lkey(findCode(code).c)) : null);
    return l && Array.isArray(l.dl) ? l.dl : [];
  };
  function dlModal(code) {
    const a = window.hpDl(code);
    const m = modal('Download · ' + code, el('div', { class: 'stack' }, ...a.map(x => el('a', { class: 'hp-dlrow', href: x.u, target: '_blank', rel: 'noopener' }, ic('dl', 16), el('b', {}, x.l || kindOf(x.t)), x.t && x.t !== x.l ? el('span', { class: 'hint' }, x.t) : null)),
      el('p', { class: 'hint' }, 'I link aprono la cartella o il file su OneDrive di Hikvision.')), [el('span', { class: 'grow' }), btn('Chiudi', () => m.close())]);
  }
  window.hpDlChip = function (code) {
    const a = window.hpDl(code); if (!a.length) return null;
    return el('button', { type: 'button', class: 'tag hp-dltag', title: 'Download: ' + a.map(x => x.l).join(', '), onclick: e => { e.stopPropagation(); dlModal(code); } }, '⤓ DOWNLOAD ' + a.length);
  };
  window.hpDlBox = function (code) {
    const a = window.hpDl(code); if (!a.length) return null;
    return el('section', { class: 'panel stack', style: 'background:var(--surface-2)' }, el('h4', {}, 'Download'),
      el('div', { class: 'linkrow' }, a.map(x => el('a', { class: 'btn', href: x.u, target: '_blank', rel: 'noopener', title: x.t || x.u }, ic('dl', 16), x.l || 'Download'))));
  };
})();
