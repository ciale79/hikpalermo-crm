/* HIK PALERMO — importazione libera dei listini ProAV (proav.hikpalermo.com).
   - più fogli di lavoro insieme (si scelgono quali; «note», «legenda»… esclusi in automatico)
   - ogni colonna si associa a un campo univoco del database (codice, SAP, EAN, descrizioni, categoria, prezzi…):
     una colonna va in un solo campo e ogni valore viene controllato (un EAN deve essere di cifre, un prezzo un numero, un link un indirizzo web…):
     i valori che non combaciano con il campo vengono scartati e contati nell'anteprima, così nel database non finiscono dati fuori posto
   - articoli composti (kit): righe unite nelle colonne del prezzo o della categoria (celle unite in Excel) diventano un solo articolo
     con i componenti e le loro quantità; in alternativa le righe senza prezzo sotto un articolo
   - foto incorporate nel foglio: vengono estratte, ridotte e salvate, una per articolo
   Formato salvato (v2): { v: 2, items: [{ c, sap, ean, d, d2, cat, tip, gar, moq, p, n: [[etichetta, prezzo]], var, note, url, img, sh, kit: [{ c, sap, ean, d, d2, q, p, n, url, img }] }] } */
(function () {
  'use strict';
  const isPavHost = typeof HP_PAV !== 'undefined' && HP_PAV;

  /* ---------- campi del database ---------- */
  const FIELDS = [
    { k: 'c', lab: 'Codice articolo', req: true, t: 'code', rx: /^(cod(ice)?|model(lo)?|articolo|sku|part ?(n|no|number)|p\/n|item|product ?code)\b/i },
    { k: 'sap', lab: 'Codice SAP', t: 'digits', min: 5, max: 12, rx: /\bsap\b/i },
    { k: 'ean', lab: 'EAN / barcode', t: 'digits', min: 8, max: 14, rx: /\b(ean|barcode|gtin|upc)\b/i },
    { k: 'd', lab: 'Descrizione', t: 'text', rx: /desc/i },
    { k: 'd2', lab: 'Descrizione tecnica / breve', t: 'text', rx: /desc|spec|tecnic|caratterist/i },
    { k: 'cat', lab: 'Categoria', t: 'short', rx: /categ|famigl|family|gruppo|sezione/i },
    { k: 'tip', lab: 'Tipologia / serie', t: 'short', rx: /tipolog|serie|series|sottocat|subcat|^tipo\b|^type\b/i },
    { k: 'gar', lab: 'Garanzia', t: 'short', rx: /garanz|warrant/i },
    { k: 'moq', lab: 'MOQ / quantità nel kit', t: 'int', rx: /\b(moq|q\.?t[aà]|quantit|qty)\b/i },
    { k: 'p', lab: 'Prezzo di listino (end user)', t: 'price', rx: /end ?user|list ?price|msrp|prezzo (di )?listino|pubblico|retail|^listino$|^prezzo$/i },
    { k: 'n', lab: 'Prezzi netti / per canale', t: 'price', multi: true, rx: /distribut|dealer|install|rivend|\bsi\b|system integr|partner|nett|\bnet\b|acquisto|\b1 ?pz\b/i },
    { k: 'var', lab: 'Variazione di prezzo', t: 'short', rx: /∆|δ|delta|variaz|trend/i },
    { k: 'note', lab: 'Note / stato', t: 'text', rx: /^note?\b|stato|status|disponib/i },
    { k: 'url', lab: 'Link scheda prodotto', t: 'url', rx: /scheda|link|url|datasheet|sito/i }
  ];
  const FK = Object.fromEntries(FIELDS.map(f => [f.k, f]));
  const SKIP_SHEET = /note|legenda|istruz|readme|leggimi|indice|cover|copertina|info\b|changelog|modifiche/i;

  /* ---------- controllo dei valori: un valore che non è del tipo del campo viene scartato ---------- */
  const num = v => {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v == null ? '' : v).replace(/[€\s]/g, '').replace(/eur(o)?/i, ''); if (!s) return null;
    if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
    const n = +s; return isFinite(n) && /\d/.test(s) ? n : null;
  };
  const str = v => v == null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? v.toFixed(0) : String(v)) : String(v).trim();
  function check(f, v, link) {
    if (f.t === 'url') { const u = link || str(v); if (!u) return [null, false]; return /^https?:\/\/\S+$/i.test(u) ? [u, true] : [null, true]; }
    const s = str(v); if (!s) return [null, false];
    switch (f.t) {
      case 'code': return s.length >= 2 && s.length <= 80 && !/\n/.test(s) && /[A-Za-z0-9]/.test(s) && !/^\d+([.,]\d+)?\s*€?$/.test(s) ? [s.replace(/\s+/g, ' '), true] : [null, true];
      case 'digits': { const d = s.replace(/[\s.-]/g, ''); return new RegExp('^\\d{' + f.min + ',' + f.max + '}$').test(d) ? [d, true] : [null, true]; }
      case 'int': { const m = /^(\d{1,6})(\s*(pz|pcs|pezzi|x))?$/i.exec(s); return m ? [+m[1], true] : [null, true]; }
      case 'price': { const n = num(v); return n != null && n >= 0 && n < 1e8 ? [Math.round(n * 100) / 100, true] : [null, true]; }
      case 'short': return s.length <= 60 ? [s, true] : [s.slice(0, 60), true];
      default: return [s.slice(0, 4000), true];
    }
  }

  /* ---------- lettura dei fogli ---------- */
  const hkey = h => String(h == null ? '' : h).replace(/\s+/g, ' ').trim().toLowerCase();
  const hlab = h => String(h == null ? '' : h).replace(/\s+/g, ' ').trim();
  function headerRow(rows) {
    let best = -1, bi = 0;
    for (let i = 0; i < Math.min(40, rows.length); i++) {
      const cells = rows[i].map(x => String(x ?? '').trim()).filter(Boolean); if (cells.length < 2) continue;
      const sc = (cells.some(x => FK.c.rx.test(x)) ? 3 : 0) + (cells.some(x => /desc/i.test(x)) ? 2 : 0) + (cells.some(x => FK.p.rx.test(x) || FK.n.rx.test(x)) ? 1 : 0) + Math.min(cells.length, 10) / 10 - (cells.filter(x => num(x) != null).length > cells.length / 2 ? 4 : 0);
      if (sc > best) { best = sc; bi = i; }
    }
    return best < 2 ? -1 : bi;
  }
  // un foglio: intestazioni, righe, celle unite, link
  function readSheet(X, ws, name) {
    const rows = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
    const hi = headerRow(rows);
    const heads = hi < 0 ? [] : (rows[hi] || []).map(hlab);
    const links = {}; for (const a in ws) { if (a[0] === '!') continue; const c = ws[a]; if (c && c.l && c.l.Target) { const p = X.utils.decode_cell(a); links[p.r + ':' + p.c] = c.l.Target; } }
    return { name, rows, hi, heads, merges: ws['!merges'] || [], links };
  }
  // proposta automatica: per ogni campo la prima colonna con intestazione compatibile e non ancora usata
  function guess(headsAll) {
    const used = new Set(), map = { n: [] };
    const take = (k, pred) => { const h = headsAll.find(x => !used.has(x.k) && pred(x)); if (h) { used.add(h.k); map[k] = h.k; } };
    take('c', h => FK.c.rx.test(h.l) && !/sap|ean/i.test(h.l));
    take('sap', h => FK.sap.rx.test(h.l)); take('ean', h => FK.ean.rx.test(h.l));
    take('p', h => FK.p.rx.test(h.l) && !/1 ?pz/i.test(h.l));
    for (const h of headsAll) if (!used.has(h.k) && FK.n.rx.test(h.l) && !/desc|cod|sap|ean/i.test(h.l)) { used.add(h.k); map.n.push(h.k); }
    take('d', h => /desc/i.test(h.l)); take('d2', h => /desc|spec|tecnic/i.test(h.l));
    for (const k of ['cat', 'tip', 'gar', 'moq', 'var', 'note', 'url']) take(k, h => FK[k].rx.test(h.l));
    return map;
  }

  /* ---------- da righe a articoli (con kit) ---------- */
  function parse(sheets, map, opt) {
    const st = { righe: 0, kit: 0, scarti: {}, esempi: {}, vuoti: 0, fogli: [] };
    const items = [];
    const bad = (k, v) => { st.scarti[k] = (st.scarti[k] || 0) + 1; const e = st.esempi[k] || (st.esempi[k] = []); if (e.length < 3) e.push(str(v).slice(0, 40)); };
    for (const sh of sheets) {
      if (sh.hi < 0) continue;
      const idx = {}; const hk = sh.heads.map(hkey);
      for (const f of FIELDS) { if (f.multi) idx[f.k] = (map.n || []).map(k => [k, hk.indexOf(k)]).filter(x => x[1] >= 0); else if (map[f.k] != null) { const i = hk.indexOf(map[f.k]); if (i >= 0) idx[f.k] = i; } }
      if (idx.c == null) { st.fogli.push({ n: sh.name, art: 0, kit: 0, err: 'manca la colonna del codice' }); continue; }
      const netLab = k => hlab(sh.heads[hk.indexOf(k)]).replace(/\s*\((prezzo )?suggerito\)\s*/i, ' ').replace(/\s+/g, ' ').trim();
      const rowObj = (r, keep) => {
        const R = sh.rows[r] || []; const o = {}; keep = keep || (() => true);
        for (const f of FIELDS) {
          if (f.multi) { const n = []; for (const [k, i] of idx.n || []) { if (!keep(i)) continue; const [v, had] = check(f, R[i]); if (v != null) n.push([netLab(k), v]); else if (had) bad('n', R[i]); } if (n.length) o.n = n; continue; }
          const i = idx[f.k]; if (i == null || (f.k !== 'c' && !keep(i))) continue;
          const [v, had] = check(f, R[i], f.t === 'url' ? sh.links[r + ':' + i] : null);
          if (v != null) o[f.k] = v; else if (had) bad(f.k, f.t === 'url' ? R[i] : R[i]);
        }
        return o;
      };
      // gruppi di righe dei kit: celle unite che attraversano più righe nelle colonne mappate (prezzi, categoria, tipologia, garanzia…)
      const groupCols = new Set([idx.p, idx.cat, idx.tip, idx.gar, idx.var, idx.note, ...(idx.n || []).map(x => x[1])].filter(x => x != null));
      const groupOf = new Map();
      if (opt.kitMerge) for (const m of sh.merges) {
        if (m.e.r <= m.s.r || m.s.r <= sh.hi) continue;
        let hit = false; for (let c = m.s.c; c <= m.e.c; c++) if (groupCols.has(c)) hit = true; if (!hit) continue;
        const g = groupOf.get(m.s.r) || { s: m.s.r, e: m.s.r, cols: new Set() }; g.e = Math.max(g.e, m.e.r); for (let c = m.s.c; c <= m.e.c; c++) g.cols.add(c);
        for (let r = g.s; r <= g.e; r++) groupOf.set(r, g);
      }
      let nArt = 0, nKit = 0, last = null;
      for (let r = sh.hi + 1; r < sh.rows.length; r++) {
        const R = sh.rows[r]; if (!R || !R.some(x => str(x))) continue;
        const g = groupOf.get(r);
        if (g && g.s !== r) continue; // righe successive del kit: gestite con la prima
        const o = rowObj(r);
        if (!o.c) { st.vuoti++; continue; }
        st.righe++;
        if (g && g.e > g.s) {
          // colonne unite sul gruppo = dati del kit (prezzi, categoria…); le altre = dati di ogni componente (codice, SAP, quantità, prezzo al pezzo…)
          const inKit = i => g.cols.has(i), inComp = i => !g.cols.has(i);
          const comps = [];
          for (let rr = g.s; rr <= g.e; rr++) { const x = rowObj(rr, inComp); if (!x.c) continue; if (rr !== r) st.righe++; comps.push(compOf(x, rr, sh.name)); }
          if (comps.length > 1) { items.push(kitOf(rowObj(r, inKit), comps, sh.name, r)); nKit++; st.kit++; last = null; continue; }
        }
        // in alternativa: righe senza prezzi sotto un articolo = componenti del kit precedente
        if (opt.kitBelow && last && o.p == null && !o.n && !o.cat) {
          if (!last.kit) { const head = { ...last }; delete head.sh; delete head.r; last.kit = [compOf(head, last.r, sh.name)]; last.c = head.c; nKit++; st.kit++; }
          last.kit.push(compOf(o, r, sh.name)); last.c = last.kit.map(x => x.c).join(' + '); continue;
        }
        if (!o.cat && opt.sheetCat) o.cat = sh.name.trim();
        const it = { ...o, sh: sh.name, r }; items.push(it); nArt++; last = it;
      }
      st.fogli.push({ n: sh.name, art: nArt, kit: nKit });
    }
    return { items, st };
  }
  function compOf(x, r, shn) { const c = { c: x.c, q: x.moq || 1, r }; for (const k of ['sap', 'ean', 'd', 'd2', 'p', 'n', 'url', 'gar', 'note']) if (x[k] != null) c[k] = x[k]; return c; }
  function kitOf(o, comps, shn, r) {
    const it = { c: comps.map(x => x.c).join(' + '), sh: shn, r, kit: comps };
    for (const k of ['d', 'd2', 'cat', 'tip', 'gar', 'p', 'n', 'var', 'note', 'url']) if (o[k] != null) it[k] = o[k];
    if (!it.cat) it.cat = shn.trim();
    return it;
  }
  window.hpPavParse = { FIELDS, readSheet, guess, parse, check, headerRow, SKIP_SHEET };

  /* ---------- foto incorporate nel file (xlsx): foglio → riga → immagine ---------- */
  const JSZIPLIB = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  async function sheetImages(buf, names) {
    const out = {};
    try {
      await loadScript(JSZIPLIB);
      const z = await JSZip.loadAsync(buf);
      const xml = async p => { const f = z.file(p.replace(/^\//, '')); return f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null; };
      const rels = async p => { const i = p.lastIndexOf('/'); const d = await xml(p.slice(0, i) + '/_rels/' + p.slice(i + 1) + '.rels'); const m = {}; if (d) for (const r of d.getElementsByTagName('Relationship')) m[r.getAttribute('Id')] = { t: r.getAttribute('Target'), ty: r.getAttribute('Type') || '' }; return m; };
      const abs = (base, t) => { if (t.startsWith('/')) return t.slice(1); const parts = base.split('/').slice(0, -1); for (const s of t.split('/')) { if (s === '..') parts.pop(); else if (s !== '.') parts.push(s); } return parts.join('/'); };
      const wb = await xml('xl/workbook.xml'); const wbr = await rels('xl/workbook.xml'); if (!wb) return out;
      for (const s of wb.getElementsByTagName('sheet')) {
        const name = s.getAttribute('name'); if (!names.includes(name)) continue;
        const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        const sp = wbr[rid] && abs('xl/workbook.xml', wbr[rid].t); if (!sp) continue;
        const sr = await rels(sp);
        for (const id in sr) {
          if (!/\/drawing$/.test(sr[id].ty)) continue;
          const dp = abs(sp, sr[id].t); const d = await xml(dp); if (!d) continue; const dr = await rels(dp);
          const byRow = out[name] || (out[name] = {});
          const anchors = [...d.getElementsByTagNameNS('*', 'twoCellAnchor'), ...d.getElementsByTagNameNS('*', 'oneCellAnchor')];
          for (const a of anchors) {
            const from = a.getElementsByTagNameNS('*', 'from')[0]; const blip = a.getElementsByTagNameNS('*', 'blip')[0]; if (!from || !blip) continue;
            const row = +(from.getElementsByTagNameNS('*', 'row')[0] || {}).textContent;
            const emb = blip.getAttribute('r:embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
            const tg = dr[emb]; if (!tg || isNaN(row)) continue;
            const mp = abs(dp, tg.t); if (!byRow[row]) byRow[row] = mp;
          }
        }
      }
      out._zip = z;
    } catch (e) { console.warn('foto', e); }
    return out;
  }
  // riduce la foto (max 480 px) e la salva tra i file del sito; le foto uguali si salvano una volta sola
  async function shrink(blob) {
    try {
      const bmp = await createImageBitmap(blob); const k = Math.min(1, 480 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
      return await new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.85));
    } catch (e) { return null; }
  }
  async function uploadImg(b, name) {
    const r = await fetch('/api/blob', { method: 'POST', credentials: 'same-origin', headers: { 'x-hp': '1', 'content-type': 'image/jpeg', 'x-name': encodeURIComponent(name) }, body: b });
    if (!r.ok) throw new Error('foto ' + r.status); return (await r.json()).id;
  }

  /* ---------- finestra di importazione ---------- */
  if (!isPavHost) return;
  const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const H = { 'x-hp': '1' };
  const fileIn = el('input', { type: 'file', accept: '.xlsx,.xls,.xlsm,.xlsb,.csv', hidden: true }); document.body.append(fileIn);
  let replaceMeta = null;
  fileIn.addEventListener('change', () => { const f = fileIn.files[0]; fileIn.value = ''; if (f) openImport(f, replaceMeta); });
  window.hpPavUpload = meta => { replaceMeta = meta || null; fileIn.click(); };
  const fmtN = n => (n || 0).toLocaleString('it-IT');

  async function openImport(file, replace) {
    if (file.size > 80 * 1048576) { toast('File troppo grande (oltre 80 MB).', 'bad'); return; }
    let wb, buf;
    try { await loadScript(LIB); buf = await file.arrayBuffer(); wb = XLSX.read(buf, { type: 'array', cellDates: false }); } catch (e) { toast('File non leggibile: ' + e.message, 'bad'); return; }
    const sheets = wb.SheetNames.map(n => readSheet(XLSX, wb.Sheets[n], n)).filter(s => s.rows.some(r => r.some(x => str(x))));
    if (!sheets.length) { toast('Il file non contiene dati.', 'bad'); return; }
    const sel = new Set(sheets.filter(s => s.hi >= 0 && !SKIP_SHEET.test(s.name)).map(s => s.name));
    const prevMeta = replace || null;
    let map = prevMeta && prevMeta.v === 2 && prevMeta.mapK ? JSON.parse(JSON.stringify(prevMeta.mapK)) : null;
    const opt = { kitMerge: true, kitBelow: false, sheetCat: true, foto: /\.xls[xm]$/i.test(file.name) };
    const now = new Date();
    const nome = inp('pavNome', replace ? replace.nome : file.name.replace(/\.(xlsx|xls|xlsm|xlsb|csv)$/i, '').replace(/[_]+/g, ' ').trim());
    const per = inp('pavPer', replace ? replace.periodo : now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'), { type: 'month' });
    const shBox = el('div', { class: 'hp-capsrc' }), mapBox = el('div', { class: 'hp-pimap' }), optBox = el('div', { class: 'stack', style: 'gap:4px' }), prev = el('div', { class: 'stack' });
    let imgs = null, res = null;
    const heads = () => { const seen = new Map(); for (const s of sheets) if (sel.has(s.name)) s.heads.forEach(h => { const k = hkey(h); if (k && !seen.has(k)) seen.set(k, { k, l: h, n: 0 }); if (k) seen.get(k).n++; }); return [...seen.values()]; };
    const drawSheets = () => shBox.replaceChildren(...sheets.map(s => el('label', { class: 'hp-capck', title: s.hi < 0 ? 'Intestazioni non trovate: il foglio non sembra un listino' : (s.rows.length - s.hi - 1) + ' righe sotto le intestazioni (riga ' + (s.hi + 1) + ')' },
      el('input', { type: 'checkbox', checked: sel.has(s.name), disabled: s.hi < 0, onchange: e => { e.target.checked ? sel.add(s.name) : sel.delete(s.name); if (!map) map = guess(heads()); drawMap(); run(); } }),
      el('b', {}, s.name), el('span', { class: 'hint' }, s.hi < 0 ? 'non è un listino' : fmtN(s.rows.length - s.hi - 1) + ' righe'))));
    const drawMap = () => {
      const HS = heads(); if (!map) map = guess(HS);
      const usedBy = k => { for (const f of FIELDS) { if (f.multi ? (map.n || []).includes(k) : map[f.k] === k) return f.k; } return null; };
      const opts = cur => [['', '— non importare —']].concat(HS.map(h => { const u = usedBy(h.k); return [h.k, h.l + (u && u !== cur ? '  (già in «' + FK[u].lab + '»)' : '')]; }));
      const rows = FIELDS.filter(f => !f.multi).map(f => {
        const s = selectEl('pf_' + f.k, opts(f.k), map[f.k] || ''); s.onchange = () => {
          const v = s.value || null; if (v) { const u = usedBy(v); if (u && u !== f.k) { if (u === 'n') map.n = map.n.filter(x => x !== v); else map[u] = null; toast('La colonna «' + (HS.find(h => h.k === v) || {}).l + '» era in «' + FK[u].lab + '»: ora va in «' + f.lab + '».'); } }
          map[f.k] = v; drawMap(); run();
        };
        return el('label', { class: 'fld' }, el('span', {}, f.lab + (f.req ? ' *' : '')), s, el('small', { class: 'hint hp-pierr', 'data-k': f.k }));
      });
      const nets = el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, HS.map(h => { const u = usedBy(h.k); const on = (map.n || []).includes(h.k);
        return el('label', { class: 'person' + (on ? ' on' : ''), style: 'cursor:pointer' + (u && u !== 'n' ? ';opacity:.45' : ''), title: u && u !== 'n' ? 'Già in «' + FK[u].lab + '»' : '' },
          el('input', { type: 'checkbox', checked: on, disabled: !!(u && u !== 'n'), onchange: e => { map.n = e.target.checked ? [...(map.n || []), h.k] : (map.n || []).filter(x => x !== h.k); drawMap(); run(); } }), h.l); }));
      mapBox.replaceChildren(el('div', { class: 'grid2' }, ...rows), el('div', { class: 'fld full' }, el('span', {}, 'Prezzi netti / per canale (distributore, dealer, installatore, prezzo al pezzo dei componenti…): una o più colonne'), nets, el('small', { class: 'hint hp-pierr', 'data-k': 'n' })));
    };
    const ck = (k, lab, hint) => el('label', { class: 'row', style: 'gap:8px;align-items:flex-start' }, el('input', { type: 'checkbox', checked: opt[k], onchange: e => { opt[k] = e.target.checked; run(); } }), el('span', {}, lab, hint ? el('small', { class: 'hint', style: 'display:block' }, hint) : null));
    optBox.append(
      ck('kitMerge', 'Articoli composti da celle unite', 'Se in Excel il prezzo (o la categoria) è unito su più righe, quelle righe diventano un solo articolo con i suoi componenti e la quantità di ciascuno (colonna MOQ / quantità).'),
      ck('kitBelow', 'Righe senza prezzo sotto un articolo = componenti', 'Per listini senza celle unite: una riga con codice ma senza prezzi e categoria si aggiunge all\'articolo sopra.'),
      ck('sheetCat', 'Se manca la categoria usa il nome del foglio'),
      ck('foto', 'Importa le foto incorporate nel foglio', 'Una foto per articolo, ridotta per il web. Solo file .xlsx/.xlsm.'));
    const run = () => {
      const S2 = sheets.filter(s => sel.has(s.name));
      res = parse(S2, map || {}, opt);
      const { items, st } = res;
      mapBox.querySelectorAll('.hp-pierr').forEach(n => { const k = n.dataset.k; const c = st.scarti[k]; n.textContent = c ? fmtN(c) + ' valori scartati perché non sono «' + FK[k].lab.toLowerCase() + '» (es. ' + st.esempi[k].map(x => '«' + x + '»').join(', ') + ')' : ''; n.style.color = c ? 'var(--accent)' : ''; });
      const sample = items.slice(0, 5).concat(items.filter(x => x.kit).slice(0, 2)).filter((x, i, a) => a.indexOf(x) === i);
      const nets = it => (it.n || []).map(([l, v]) => l + ' ' + eur(v)).join(' · ');
      prev.replaceChildren(
        el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, el('span', { class: 'pill', style: '--c:var(--ok)' }, fmtN(items.length) + ' articoli'), st.kit ? el('span', { class: 'pill', style: '--c:var(--info)' }, fmtN(st.kit) + ' composti (kit)') : null,
          Object.keys(st.scarti).length ? el('span', { class: 'pill', style: '--c:var(--accent)' }, fmtN(Object.values(st.scarti).reduce((a, b) => a + b, 0)) + ' valori scartati') : el('span', { class: 'pill', style: '--c:var(--ok)' }, 'nessun valore fuori posto'),
          st.vuoti ? el('span', { class: 'hint' }, fmtN(st.vuoti) + ' righe senza codice saltate') : null),
        el('div', { class: 'hint' }, st.fogli.map(f => f.n + ': ' + (f.err ? '⚠ ' + f.err : fmtN(f.art + f.kit) + (f.kit ? ' (' + f.kit + ' kit)' : ''))).join(' · ')),
        el('div', { class: 'tbl-wrap', style: 'max-height:280px' }, el('table', {}, el('thead', {}, el('tr', {}, ['Codice', 'SAP', 'Descrizione', 'Categoria', 'Listino', 'Netti'].map((h, i) => el('th', { class: i >= 4 ? 'r' : '' }, h)))),
          el('tbody', {}, sample.map(it => el('tr', {}, el('td', { class: 'mono' }, el('b', {}, it.kit ? it.kit[0].c : it.c), it.kit ? el('div', { class: 'hint' }, 'KIT: ' + it.kit.map(x => x.q + '× ' + x.c).join(' + ')) : null),
            el('td', { class: 'mono' }, it.kit ? it.kit.map(x => x.sap || '—').join(' / ') : it.sap || '—'), el('td', {}, String(it.d || (it.kit && it.kit[0].d) || '').slice(0, 90)), el('td', {}, [it.cat, it.tip].filter(Boolean).join(' · ')),
            el('td', { class: 'r num' }, it.p != null ? eur(it.p) : '—'), el('td', { class: 'r num hp-net', style: 'font-size:.8rem' }, nets(it) || '—'))))))
      );
      okB.disabled = !items.length || !(map && map.c);
    };
    const body = el('div', { class: 'stack' },
      el('div', { class: 'banner hp-pavban' }, 'Listino riservato ProAV: resta privato e non entra nei listini del gruppo né nei capitolati.'),
      el('div', { class: 'grid2' }, fld('Nome del listino', nome), fld('Mese e anno del listino', per)),
      el('h4', { style: 'margin:4px 0 0' }, 'Fogli da importare'), shBox,
      el('h4', { style: 'margin:4px 0 0' }, 'A quale campo va ogni colonna'), el('p', { class: 'hint', style: 'margin:0' }, 'Una colonna va in un solo campo. Ogni valore viene controllato: se non è del tipo giusto (un EAN che non è di cifre, un prezzo che non è un numero…) viene scartato e contato qui sotto.'), mapBox,
      el('h4', { style: 'margin:4px 0 0' }, 'Opzioni'), optBox,
      el('h4', { style: 'margin:4px 0 0' }, 'Anteprima'), prev);
    const okB = btn(replace ? 'Sostituisci' : 'Importa', () => save(), 'pri', 'up');
    const m = modal(replace ? 'Aggiorna listino ProAV' : 'Importa listino ProAV', body, [el('span', { class: 'grow' }), btn('Annulla', () => m.close()), okB], { wide: true });
    drawSheets(); drawMap(); run();

    async function save() {
      const n = nome.value.trim(); if (!n) { toast('Dai un nome al listino.', 'bad'); nome.focus(); return; }
      if (!map || !map.c) { toast('Scegli la colonna del codice articolo.', 'bad'); return; }
      const items = res.items; if (!items.length) { toast('Nessun articolo da importare.', 'bad'); return; }
      okB.disabled = true; const lab = okB.lastChild; const say = t => { lab.textContent = t; };
      const imgIds = [];
      if (opt.foto) {
        say('Leggo le foto…'); imgs = await sheetImages(buf, [...sel]);
        const z = imgs._zip; const cache = new Map(); let done = 0;
        const jobs = []; const want = (shn, r) => imgs[shn] && imgs[shn][r];
        for (const it of items) { if (it.kit) for (const k of it.kit) { const p = want(it.sh, k.r); if (p) jobs.push([k, p]); } const p = want(it.sh, it.r); if (p) jobs.push([it, p]); else if (it.kit) { const f = it.kit.find(k => want(it.sh, k.r)); if (f) jobs.push([it, want(it.sh, f.r)]); } }
        const q = jobs.slice(); const worker = async () => { while (q.length) { const [obj, p] = q.shift(); try { if (!cache.has(p)) cache.set(p, (async () => { const f = z.file(p); if (!f) return null; const b = await shrink(new Blob([await f.async('arraybuffer')])); if (!b) return null; const id = await uploadImg(b, (obj.c || 'foto') + '.jpg'); imgIds.push(id); return id; })()); const id = await cache.get(p); if (id) obj.img = id; } catch (e) { } done++; say('Foto ' + done + ' di ' + jobs.length + '…'); } };
        if (z && jobs.length) await Promise.all([worker(), worker(), worker(), worker()]);
      }
      say('Salvo il listino…');
      const clean = items.map(it => { const o = { ...it }; delete o.r; if (o.kit) o.kit = o.kit.map(k => { const x = { ...k }; delete x.r; return x; }); return o; });
      const id = replace ? replace.id : newId('proavListini');
      const at = Date.now(); const blob = id + '_' + at.toString(36);
      const payload = JSON.stringify({ v: 2, items: clean, at });
      try {
        const r = await fetch('/api/proav/blob?id=' + encodeURIComponent(blob), { method: 'PUT', credentials: 'same-origin', headers: { ...H, 'content-type': 'application/json' }, body: payload });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error?.message || ('errore ' + r.status));
      } catch (e) { toast('Caricamento non riuscito: ' + e.message, 'bad'); okB.disabled = false; say(replace ? 'Sostituisci' : 'Importa'); return; }
      const HS = heads(); const labOf = k => (HS.find(h => h.k === k) || {}).l || k;
      const fields = {}; for (const f of FIELDS) { if (f.multi) { if ((map.n || []).length) fields.n = map.n.map(labOf); } else if (map[f.k]) fields[f.k] = labOf(map[f.k]); }
      // il file originale del listino resta scaricabile dalla pagina dei listini
      let orig = null; try { const ro = await fetch('/api/proav/blob?id=' + encodeURIComponent(blob + '_f'), { method: 'PUT', credentials: 'same-origin', headers: { ...H, 'content-type': file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, body: file }); if (ro.ok) orig = blob + '_f'; } catch (e) { }
      const meta = { v: 2, orig, nome: n, periodo: per.value || '', righe: clean.length, kit: res.st.kit, fogli: res.st.fogli.map(f => f.n), fields, mapK: map, file: file.name, size: payload.length, blob, imgs: imgIds, by: S.me, at, map: { n: (map.n || []).length ? [0] : [] } };
      if (await put('proavListini', id, meta)) {
        if (replace && replace.blob && replace.blob !== blob) fetch('/api/proav/blob?id=' + encodeURIComponent(replace.blob), { method: 'DELETE', credentials: 'same-origin', headers: H }).catch(() => { }); if (replace && replace.orig && replace.orig !== orig) fetch('/api/proav/blob?id=' + encodeURIComponent(replace.orig), { method: 'DELETE', credentials: 'same-origin', headers: H }).catch(() => { });
        if (replace && Array.isArray(replace.imgs)) for (const b of replace.imgs) fetch('/api/blob/' + b, { method: 'DELETE', credentials: 'same-origin', headers: H }).catch(() => { });
        S.pavRows.set(id, { v: 2, items: clean, at }); m.close();
        toast('Listino «' + n + '» importato: ' + fmtN(clean.length) + ' articoli' + (res.st.kit ? ', di cui ' + res.st.kit + ' kit' : '') + (imgIds.length ? ' · ' + imgIds.length + ' foto' : ''));
        if (S.view !== 'pav') go('pav'); else VIEWS.pav.update();
      } else { okB.disabled = false; say(replace ? 'Sostituisci' : 'Importa'); }
    }
  }
})();
