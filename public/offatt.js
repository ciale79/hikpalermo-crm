/* HIK PALERMO — allegati nell'esportazione dell'offerta (PDF e Word).
   · Gli allegati caricati nell'offerta (immagini e PDF, raccolta offerte/<id>/allegati) entrano nell'esportazione insieme
     alle schede tecniche e ai PDF della commessa.
   · Nella finestra di esportazione un elenco unico mostra le parti fisse dell'offerta (copertina, offerta, condizioni…)
     e gli allegati: con ↑ ↓ si sposta ogni allegato prima o dopo le parti dell'offerta, cioè si decide dove va messo.
     L'ordine scelto si salva nell'offerta (attSeq) e si ripropone alla prossima esportazione. */
(function () {
  'use strict';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', PDFW = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const isImg = (t, n) => /^image\//i.test(t || '') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(n || '');
  const isPdf = (t, n) => /pdf/i.test(t || '') || /\.pdf$/i.test(n || '');

  async function fetchBuf(u) {
    const same = u.startsWith('/');
    const r = await fetch(same ? u : '/api/fetch?u=' + encodeURIComponent(u), { credentials: 'same-origin' });
    if (!r.ok) throw new Error('file non scaricabile (' + r.status + ')'); return await r.arrayBuffer();
  }
  async function pdfPages(buf, say, label) {
    if (!window.pdfjsLib) await loadScript(PDFJS); pdfjsLib.GlobalWorkerOptions.workerSrc = window.HP_PDFW || PDFW;
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise; const out = [];
    for (let p = 1; p <= Math.min(pdf.numPages, 40); p++) {
      say && say(label + ' · pagina ' + p + ' di ' + pdf.numPages);
      const pg = await pdf.getPage(p); const b = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: 2 });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: g, viewport: vp }).promise; out.push({ d: c.toDataURL('image/jpeg', 0.86), w: b.width, h: b.height });
    }
    return out;
  }
  // immagine → una pagina (JPEG su fondo bianco, al massimo 2400 px di lato)
  async function imgPage(buf, type) {
    const url = URL.createObjectURL(new Blob([buf], { type: type || 'image/jpeg' }));
    try {
      const im = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('immagine non leggibile')); i.src = url; });
      const k = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight)); const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
      return [{ d: c.toDataURL('image/jpeg', 0.88), w, h }];
    } finally { URL.revokeObjectURL(url); }
  }
  // pagine di un allegato: [{ d: dataURL JPEG, w, h }]
  window.hpAttPages = async function (a, say) {
    const buf = a.file ? await a.file.arrayBuffer() : await fetchBuf(a.url);
    const type = a.type || (a.file && a.file.type) || '';
    if (isImg(type, a.name || a.label) && !isPdf(type, a.name || a.label)) { say && say('Aggiungo ' + a.label + '…'); return imgPage(buf, type); }
    return pdfPages(buf, say, a.label);
  };
  // pagine di tutti gli allegati scelti, raggruppate per posizione: { cov: [[pagine], …], img: …, ord: …, cond: … }
  window.hpAttRender = async function (list, say) {
    const by = {};
    for (const a of list || []) {
      try { say && say('Aggiungo ' + a.label + '…'); const pages = await window.hpAttPages(a, say); (by[a.pos || 'cond'] = by[a.pos || 'cond'] || []).push(...pages.map(p => ({ ...p, label: a.label }))); }
      catch (e) { toast('Non ho potuto aggiungere «' + a.label + '»: ' + (e.message || e), 'bad'); }
    }
    return by;
  };
  // allegati dell'offerta (immagini e PDF)
  window.hpOffAtts = function (o, cb) {
    if (!o || !o.id || typeof db === 'undefined' || !db) { cb([]); return () => { }; }
    try { return db.collection('offerte/' + o.id + '/allegati').onSnapshot(sn => cb(sn.docs.map(d => ({ id: d.id, ...d.data() })).filter(f => isImg(f.type, f.name) || isPdf(f.type, f.name)).sort((a, b) => (a.at || 0) - (b.at || 0))), () => cb([])); }
    catch (e) { cb([]); return () => { }; }
  };
  window.hpAttIsImg = isImg;

  /* elenco ordinabile: sezioni fisse dell'offerta e allegati.
     items: [{ k, label, on, dis?, icon?, sub?: () => node, src: () => ({ url, file, type, name }) }] */
  window.hpAttUI = function (o, sections, opts = {}) {
    const items = new Map(); let seq = sections.map(s => 'S:' + s[0]);
    const saved = Array.isArray(o.attSeq) ? o.attSeq : null; const offMap = new Map(Object.entries(o.attOff || {}));
    const box = el('div', { class: 'stack hp-attord' });
    const secLab = Object.fromEntries(sections);
    // posizione iniziale di un allegato nuovo: quella salvata, altrimenti in coda
    const place = k => {
      if (seq.includes(k)) return;
      if (saved && saved.includes(k)) { // dopo l'ultimo elemento che lo precede nell'ordine salvato e che c'è già
        const i = saved.indexOf(k); for (let j = i - 1; j >= 0; j--) { const p = seq.indexOf(saved[j]); if (p >= 0) { seq.splice(p + 1, 0, k); return; } }
        seq.splice(1, 0, k); return; }
      seq.push(k);
    };
    const move = (k, d) => { const i = seq.indexOf(k), j = i + d; if (i < 0 || j < 1 || j >= seq.length) return; [seq[i], seq[j]] = [seq[j], seq[i]]; draw(); };
    const draw = () => {
      seq = seq.filter(k => k.startsWith('S:') || items.has(k));
      const rows = []; let n = 0;
      seq.forEach((k, i) => {
        if (k.startsWith('S:')) { rows.push(el('div', { class: 'hp-attsec' }, el('span', { class: 'hp-attsec-i', 'aria-hidden': 'true' }, '▤'), el('b', {}, secLab[k.slice(2)] || k.slice(2)), el('span', { class: 'hint' }, 'parte dell\'offerta'))); return; }
        const it = items.get(k); n++;
        const ck = el('input', { type: 'checkbox', checked: !!it.on && !it.dis, disabled: !!it.dis, 'aria-label': 'Includi ' + it.label, onchange: e => { it.on = e.target.checked; offMap.set(k, !it.on); row.classList.toggle('off', !it.on); } });
        const row = el('div', { class: 'hp-attit' + (it.on && !it.dis ? '' : ' off') },
          el('label', { class: 'row grow', style: 'gap:6px;min-width:0' }, ck, el('span', { 'aria-hidden': 'true' }, it.icon || '📄'), el('span', { class: 'hp-attlab', title: it.label }, it.label)),
          it.sub ? it.sub() : null,
          el('span', { class: 'row', style: 'gap:2px;flex-wrap:nowrap' },
            el('button', { type: 'button', class: 'icon-btn', title: 'Sposta su (prima nell\'offerta)', 'aria-label': 'Sposta su ' + it.label, disabled: i <= 1, onclick: () => move(k, -1) }, '↑'),
            el('button', { type: 'button', class: 'icon-btn', title: 'Sposta giù (dopo nell\'offerta)', 'aria-label': 'Sposta giù ' + it.label, disabled: i >= seq.length - 1, onclick: () => move(k, 1) }, '↓')));
        rows.push(row);
      });
      box.replaceChildren(...rows, n ? null : el('p', { class: 'hint', style: 'margin:4px 0 0' }, opts.empty || 'Nessun allegato.'));
    };
    const api = {
      node: box,
      set(k, it) { const was = items.get(k); if (was) Object.assign(was, it); else { if (offMap.has(k)) it.on = !offMap.get(k) && it.on !== false; items.set(k, it); place(k); } draw(); },
      del(k) { items.delete(k); draw(); },
      has: k => items.has(k), get: k => items.get(k), redraw: draw,
      // allegati scelti in ordine, con la posizione (sezione dopo cui vanno)
      read() { const out = []; let pos = sections[0][0]; for (const k of seq) { if (k.startsWith('S:')) { pos = k.slice(2); continue; } const it = items.get(k); if (!it || !it.on || it.dis) continue; const s = it.src && it.src(); if (!s || (!s.url && !s.file)) continue; out.push({ label: it.label, ...s, pos }); } return out; },
      save() { if (!o.id || typeof patch !== 'function') return; const attSeq = seq.slice(); const attOff = Object.fromEntries([...offMap].filter(([, v]) => v)); o.attSeq = attSeq; o.attOff = attOff; patch('offerte', o.id, { attSeq, attOff }).catch(() => { }); }
    };
    draw(); return api;
  };
  if (!document.getElementById('hpAttCss')) document.head.append(el('style', { id: 'hpAttCss' }, '.hp-prog[hidden]{display:none!important}.hp-attord{gap:4px!important}.hp-attsec{display:flex;gap:8px;align-items:center;padding:6px 10px;border-radius:8px;background:var(--bg-2,#f1f3f5);font-size:.82rem}.hp-attsec .hint{margin-left:auto;font-size:.7rem}.hp-attsec-i{color:var(--ink-3,#888)}.hp-attit{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:4px 10px 4px 22px;border-left:2px solid var(--line);margin-left:12px}.hp-attit.off .hp-attlab{color:var(--ink-3,#999);text-decoration:line-through}.hp-attlab{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:420px}'));
})();
