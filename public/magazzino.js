/* HIK PALERMO — MAGAZZINO di filiale: carico articoli con scansione (fotocamera o lettore barcode), foto, demo / POC con promemoria e documenti di consegna */
(function () {
  'use strict';
  ICONS.whs = 'M3 9l9-5 9 5v11H3zM7 20v-7h10v7M7 16h10';
  ICONS.scan = 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 9v6M10 9v6M13 9v6M17 9v6';
  ICONS.cam = 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7';
  ICONS.ret = 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3';
  ICONS.pdf = 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6';
  const i = NAV.findIndex(n => n[0] === 'art');
  NAV.splice(i >= 0 ? i : NAV.length - 1, 0, ['magazzino', 'Magazzino', 'whs']);

  S.mag = new Map(); S.demo = new Map();
  S.fMag = S.fMag || { q: '', st: '', tab: 'art', dst: 'aperte' };
  const rerender = () => { if (['magazzino', 'commesse', 'clienti'].includes(S.view) && VIEWS[S.view]) VIEWS[S.view].update(); renderNav(); };
  claude.use('db').then(db => {
    if (!db) return;
    db.collection('magazzino').onSnapshot(s => { const m = new Map(); s.docs.forEach(d => m.set(d.id, { id: d.id, ...d.data() })); S.mag = m; rerender(); }, () => { });
    db.collection('demo').onSnapshot(s => { const m = new Map(); s.docs.forEach(d => m.set(d.id, { id: d.id, ...d.data() })); S.demo = m; rerender(); }, () => { });
  });

  /* ---------------- utilità ---------------- */
  const today = () => dayKey(Date.now());
  const addDays = (k, n) => { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return dayKey(d.getTime()); };
  const fK = k => k ? fD(new Date(k + 'T12:00:00').getTime()) : '—';
  const fKs = k => k ? new Date(k + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  const ST = { sede: ['In filiale', 'var(--ok)'], demo: ['In demo', 'var(--warn)'], venduto: ['Venduto / lasciato', 'var(--info)'], mancante: ['Mancante', 'var(--accent)'], dismesso: ['Dismesso', 'var(--ink-3)'] };
  const stChip = s => { const x = ST[s] || ST.sede; return el('span', { class: 'pill', style: '--c:' + x[1] }, x[0]); };
  const INVF = [['pz', 'Pz a sistema'], ['qRil', 'Q.tà rilevata'], ['qManc', 'Q.tà mancante'], ['qUtile', 'Q.tà utile'], ['qNonServe', 'Q.tà che non servono']];
  const FILTRI = [['i:manc', 'Con pezzi mancanti', x => (x.qManc || 0) > 0], ['i:util', 'Con pezzi utili', x => (x.qUtile || 0) > 0], ['i:nons', 'Con pezzi che non servono', x => (x.qNonServe || 0) > 0], ['i:td', 'Note T&D', x => /T&D/i.test(x.note || '')], ['i:noimg', 'Senza immagine', x => imOf(x) < 0 && !x.imgWeb && !(x.foto || []).length]];
  const passSt = (x, st) => { if (!st) return true; const f = FILTRI.find(y => y[0] === st); return f ? f[2](x) : (x.stato || 'sede') === st; };
  // immagine dal web (cercata e salvata dal server, con cache per modello)
  async function webImg(model, desc, force) {
    try { const r = await HIK_CF.postJ('/api/prodimg', { model, desc, force: !!force }); return r && r.blob || null; } catch (e) { return null; }
  }
  async function webImgAll() {
    const todo = [...S.mag.values()].filter(x => imOf(x) < 0 && !x.imgWeb && !(x.foto || []).length && !x.noWebImg);
    const models = [...new Map(todo.map(x => [norm(x.code), x])).values()];
    if (!models.length) { toast('Tutti gli articoli hanno già un\'immagine.'); return; }
    if (!await ask('Cerco sul web le immagini di ' + models.length + (models.length === 1 ? ' modello' : ' modelli') + ' non presenti nei listini. Ci vuole qualche secondo per modello: puoi continuare a lavorare, la pagina si aggiorna da sola.', 'Avvia', 'pri')) return;
    let stop = false, ok = 0, n = 0;
    const bar = el('i', { style: 'display:block;height:100%;width:0;background:var(--accent);border-radius:4px;transition:width .3s' });
    const lab = el('span', { class: 'hint' }, '0 / ' + models.length);
    const m = modal('Immagini dal web', el('div', { class: 'stack' }, el('div', { style: 'height:8px;background:var(--surface-2);border-radius:4px;overflow:hidden' }, bar), lab, el('p', { class: 'hint' }, 'Per ogni modello cerco la pagina del prodotto (prima su hikvision.com) e ne salvo la foto. Le immagini trovate restano anche per i prossimi caricamenti.')), [el('span', { class: 'grow' }), btn('Interrompi', () => { stop = true; m.close(); })], { sticky: true });
    const q = models.slice(); const worker = async () => {
      while (q.length && !stop) {
        const x = q.shift(); const b = await webImg(/^SAP /.test(x.code) ? (x.descSap || x.desc) : x.code, x.descSap || x.desc); n++;
        if (b) { ok++; for (const y of [...S.mag.values()].filter(y => norm(y.code) === norm(x.code) && !y.imgWeb)) await patch('magazzino', y.id, { imgWeb: b }); }
        bar.style.width = (n / models.length * 100) + '%'; lab.textContent = n + ' / ' + models.length + ' · trovate ' + ok + (x.code ? ' · ' + x.code : '');
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (!stop) { m.close(); toast('Immagini trovate per ' + ok + ' modelli su ' + models.length + '.'); }
  }

  /* ---------------- import inventario Excel (SAP) ---------------- */
  function invClean(d) { return String(d || '').replace(/（/g, '(').replace(/）/g, ')').trim(); }
  function invMatch(sap, desc) {
    sap = String(sap || '').trim();
    if (sap && !S.catSap) { S.catSap = new Map(); for (const it of S.cat) if (it.sap) { const k = String(it.sap).trim(); if (!S.catSap.has(k) || (S.catSap.get(k).im < 0 && it.im >= 0)) S.catSap.set(k, it); } }
    if (sap && S.catSap.get(sap)) return S.catSap.get(sap);
    const d = invClean(desc); const cands = [d]; let x = d;
    for (let i = 0; i < 6; i++) { const y = x.replace(/\([^()]*\)\s*$/, '').trim(); if (y === x) break; x = y; cands.push(x); }
    cands.push(d.replace(/\((O-STD|STD|O-NEU|NEU|Europe BV|Italy Srl)\)/gi, '').trim()); cands.push(d.split('/')[0]);
    for (const c of cands) { const a = S.byCode && S.byCode.get(norm(c)); if (a && a.length) return a.find(y => y.im >= 0) || a[0]; }
    return null;
  }
  function invCode(desc, sap) {
    const d = invClean(desc);
    if (/^[A-Za-z]{1,8}-[A-Za-z0-9]/.test(d)) return d.replace(/\s*\((O-STD|STD|O-NEU|NEU|Europe BV|Italy Srl|STOCK|EU)\)/gi, '').replace(/\/(EU|ITA)(\/ITA)?$/i, '').replace(/\/EU\/ITA$/i, '').trim();
    const t = d.split(/[,，]/)[0].trim(); return /\d/.test(t) && t.length >= 4 ? t : (sap ? 'SAP ' + sap : d.slice(0, 40));
  }
  function invDoc(r, old, now, fname) {
    const code0 = invCode(r.desc, r.sap);
    const it = invMatch(r.sap, r.desc) || findCode(code0);
    const qRil = r.qRil ?? r.pz ?? 0;
    const d = { sap: r.sap, descSap: r.desc, divisione: r.div || '', magSap: r.mag || '', pz: r.pz, qRil: r.qRil, qManc: r.qManc, qUtile: r.qUtile, qNonServe: r.qNonServe, note: r.note || (old && old.note) || '',
      code: it ? it.c : code0, desc: it ? (it.d || r.desc) : r.desc, im: it ? it.im : -1, L: it ? it.L : null, qty: qRil, inventario: fname, invAt: now, upd: now };
    if (!old || old.stato !== 'demo') d.stato = qRil > 0 ? (old && ['venduto', 'dismesso'].includes(old.stato) ? old.stato : 'sede') : 'mancante';
    if (!old) Object.assign(d, { seriale: '', ean: '', foto: [], ubicazione: 'Magazzino ' + (r.mag || ''), demoId: null, at: now, by: S.me });
    return d;
  }
  const invIn = el('input', { type: 'file', accept: '.xlsx,.xls,.xlsm,.csv', hidden: true }); document.body.appendChild(invIn);
  invIn.addEventListener('change', async () => {
    const f = invIn.files[0]; invIn.value = ''; if (!f) return;
    let rows;
    try {
      const X = await xlsxLib(); const wb = X.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' });
      const a = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false });
      const hi = a.findIndex(r => r && r.some(v => /^sap$/i.test(String(v || '').trim())));
      if (hi < 0) throw new Error('non trovo la colonna «SAP»');
      const H = a[hi].map(v => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim());
      const col = re => H.findIndex(h => re.test(h));
      const C = { sap: col(/^sap$/), desc: col(/descrizione/), div: col(/divisione/), mag: col(/^magazzino/), pz: col(/^pz/), qRil: col(/rilevat/), qManc: col(/mancant/), qUtile: col(/utile/), qNonServe: col(/non servono|non serve/), note: col(/^note/) };
      const num = v => v == null || v === '' ? null : +v || 0;
      rows = a.slice(hi + 1).map(r => ({ sap: String(r[C.sap] ?? '').trim(), desc: String(r[C.desc] ?? '').trim(), div: C.div >= 0 ? String(r[C.div] ?? '') : '', mag: C.mag >= 0 ? String(r[C.mag] ?? '') : '', pz: num(r[C.pz]), qRil: C.qRil >= 0 ? num(r[C.qRil]) : null, qManc: C.qManc >= 0 ? num(r[C.qManc]) : null, qUtile: C.qUtile >= 0 ? num(r[C.qUtile]) : null, qNonServe: C.qNonServe >= 0 ? num(r[C.qNonServe]) : null, note: C.note >= 0 ? String(r[C.note] ?? '').trim() : '' })).filter(r => r.sap && r.desc);
    } catch (e) { toast('File non leggibile: ' + (e.message || e), 'bad'); return; }
    const ex = [...S.mag.values()].filter(x => x.sap).length;
    const nm = rows.filter(r => invMatch(r.sap, r.desc)).length;
    if (!await ask(rows.length + ' righe nel file «' + f.name + '» (' + nm + ' riconosciute nei listini).' + (ex ? ' Le righe già importate vengono aggiornate con le nuove quantità.' : '') + ' Importo?', 'Importa', 'pri')) return;
    const now = Date.now(); let ok = 0;
    const wait = modal('Importazione inventario', el('p', { class: 'hint', id: 'mgImpLab' }, '0 / ' + rows.length), [], { sticky: true });
    for (const r of rows) {
      const id = 'inv_' + r.sap.replace(/[^A-Za-z0-9_-]/g, ''); const old = S.mag.get(id);
      const d = invDoc(r, old, now, f.name);
      if (await (old ? patch('magazzino', id, d) : put('magazzino', id, d))) ok++;
      if (ok % 10 === 0) { const l = document.getElementById('mgImpLab'); if (l) l.textContent = ok + ' / ' + rows.length; }
    }
    wait.close(); toast(ok + ' righe di inventario importate');
    feed('magazzino', 'ha importato l\'inventario «' + f.name + '» (' + ok + ' articoli)', { k: 'magazzino' }, []);
  });
  window.hpInvImport = () => invIn.click();

  const TIPI = [['demo', 'Demo'], ['poc', 'POC'], ['visione', 'Conto visione']];
  const TIPL = Object.fromEntries(TIPI);
  const isOpen = d => d && d.stato !== 'chiusa';
  const overdue = d => isOpen(d) && d.rientro && d.rientro < today();
  const nextRem = d => { if (!isOpen(d)) return null; const t = today(); return [...(d.promemoria || []), d.rientro].filter(Boolean).filter(x => x >= t).sort()[0] || null; };
  const dueNow = d => isOpen(d) && ((d.promemoria || []).includes(today()) || overdue(d) || d.rientro === today());
  const catOf = it => (it.code && findCode(it.code, it.L)) || null;
  const imOf = it => { const c = catOf(it); return c ? c.im : (it.im ?? -1); };
  const descOf = it => it.desc || (catOf(it) || {}).d || '';
  const openDemos = () => [...S.demo.values()].filter(isOpen);
  const demoOf = it => it.demoId ? S.demo.get(it.demoId) : null;
  const cliName = id => (S.clienti.get(id) || {}).nome || '';
  const snNorm = s => norm(s);
  window.hpDemoOpen = cid => openDemos().filter(d => d.commessaId === cid);

  /* ---------------- lettura codici ---------------- */
  // Le etichette Hikvision hanno: modello (Code 128), seriale breve, a volte il seriale completo (modello + data + seriale) e l'EAN.
  function prefixCode(t) {
    const n = norm(t); if (n.length < 7) return null;
    for (let k = n.length; k >= 6; k--) { const a = S.byCode && S.byCode.get(n.slice(0, k)); if (a && a.length) return { it: a[0], rest: n.slice(k) }; }
    return null;
  }
  function shortSn(rest) { const m = /\d{8}([A-Z]{4})([A-Z0-9]{8,})$/.exec(rest); return m ? m[2] : rest; }
  function eanMap() { const m = new Map(); for (const it of S.mag.values()) if (it.ean && it.code) m.set(it.ean, it); return m; }
  function parseScan(raw) {
    const out = { raw: String(raw || '').trim() };
    const toks = out.raw.split(/[\r\n\t|;]+/).map(x => x.trim()).filter(Boolean);
    for (const t0 of toks) {
      const t = t0.toUpperCase().replace(/\s+/g, '');
      if (!t) continue;
      if (/^\d{8}$|^\d{12,14}$/.test(t)) { out.ean = out.ean || t; continue; }
      const it = findCode(t); if (it) { out.item = out.item || it; continue; }
      const p = prefixCode(t);
      if (p && p.rest.length >= 6) { out.item = out.item || p.it; out.full = t; out.serial = out.serial || shortSn(p.rest); continue; }
      if (/^[A-Z]{1,4}-[A-Z0-9-]{3,}$/.test(t)) { out.model = out.model || t; continue; }
      if (/^[A-Z0-9]{5,}$/.test(t)) { out.serial = out.serial || t; continue; }
      if (t.length >= 5) out.serial = out.serial || t.replace(/[^A-Z0-9-]/g, '');
    }
    return out;
  }
  const findBySn = s => { const n = snNorm(s); if (!n) return null; for (const it of S.mag.values()) if (it.seriale && (snNorm(it.seriale) === n || (it.snFull && snNorm(it.snFull) === n))) return it; return null; };

  /* ---------------- fotocamera ---------------- */
  const ZX = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
  const WANT = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'qr_code', 'data_matrix', 'codabar', 'pdf417'];
  function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(); const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 1400; g.gain.value = .08; o.connect(g); g.connect(a.destination); o.start(); setTimeout(() => { o.stop(); a.close(); }, 90); } catch (e) { } }
  async function openCam(onCode, title) {
    const video = el('video', { playsinline: '', muted: '', autoplay: '' }); video.muted = true; video.setAttribute('playsinline', '');
    const info = el('div', { class: 'hp-cam-info' }, 'Inquadra il codice a barre o il QR dell\'etichetta. Puoi leggere più etichette di seguito.');
    const list = el('div', { class: 'hp-cam-list' });
    let stream = null, stop = false, reader = null;
    const close = () => { stop = true; try { reader && reader.reset(); } catch (e) { } if (stream) stream.getTracks().forEach(t => t.stop()); ov.remove(); document.removeEventListener('keydown', esc, true); };
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const ov = el('div', { class: 'hp-cam', role: 'dialog', 'aria-label': 'Scansione' },
      el('div', { class: 'hp-cam-top' }, el('b', {}, title || 'Scansione'), el('button', { type: 'button', class: 'btn sm', onclick: close }, 'Fine')),
      el('div', { class: 'hp-cam-v' }, video, el('div', { class: 'hp-cam-frame' })), info, list);
    document.body.appendChild(ov); document.addEventListener('keydown', esc, true);
    const last = new Map();
    const hit = vals => {
      const t = Date.now();
      const fresh = vals.filter(v => v && !(last.get(v) > t - 3000)); vals.forEach(v => last.set(v, t));
      if (!fresh.length) return;
      // prima i codici modello, poi seriali ed EAN
      fresh.sort((a, b) => (parseScan(b).item ? 1 : 0) - (parseScan(a).item ? 1 : 0));
      navigator.vibrate && navigator.vibrate(60); beep();
      for (const v of fresh) { const msg = onCode(v); list.prepend(el('div', {}, el('span', { class: 'mono' }, v), msg ? el('span', { class: 'hint' }, ' · ' + msg) : null)); }
      while (list.children.length > 6) list.lastChild.remove();
    };
    const cons = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false };
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('il browser non permette l\'uso della fotocamera');
      let det = null;
      if ('BarcodeDetector' in window) { try { const fm = (await BarcodeDetector.getSupportedFormats()).filter(f => WANT.includes(f)); if (fm.length) det = new BarcodeDetector({ formats: fm }); } catch (e) { det = null; } }
      if (det) {
        stream = await navigator.mediaDevices.getUserMedia(cons); if (stop) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream; await video.play().catch(() => { });
        const loop = async () => { if (stop) return; try { if (video.readyState >= 2) { const r = await det.detect(video); if (r.length) hit(r.map(x => x.rawValue)); } } catch (e) { } setTimeout(loop, 160); };
        loop();
      } else {
        await loadScript(ZX); if (stop) return;
        const hints = new Map(); hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        reader = new ZXing.BrowserMultiFormatReader(hints, 200);
        await reader.decodeFromConstraints(cons, video, (res) => { if (res && !stop) hit([res.getText()]); });
      }
    } catch (e) {
      close();
      const m = String(e && (e.name || e.message) || e);
      toast(/NotAllowed|Permission/i.test(m) ? 'Accesso alla fotocamera negato: consentilo nelle impostazioni del browser.' : 'Fotocamera non disponibile' + (/Impossibile caricare/.test(m + (e.message || '')) ? ': non riesco a caricare il lettore di codici, controlla la connessione' : ' (' + (e.message || m) + ')') + '. Puoi usare un lettore barcode o scrivere il codice.', 'bad');
    }
    return close;
  }
  window.hpScan = openCam;

  /* ---------------- foto ---------------- */
  async function shrink(file, max = 1600) {
    const bmp = await createImageBitmap(file); const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('conversione non riuscita')), 'image/jpeg', .85));
  }
  function photoPicker(onBlobId) {
    const inp = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, multiple: true });
    inp.addEventListener('change', async () => {
      const fs = [...inp.files]; inp.value = ''; if (!fs.length) return;
      if (!assets) { toast('Caricamento foto non disponibile.', 'bad'); return; }
      toast(fs.length > 1 ? 'Caricamento di ' + fs.length + ' foto…' : 'Caricamento foto…');
      for (const f of fs) { try { const b = await shrink(f); const r = await assets.upload(b, { type: 'image/jpeg' }); onBlobId(r.id); } catch (e) { toast('Foto non caricata (' + (e.code || e.message || 'errore') + ').', 'bad'); } }
    });
    return inp;
  }
  const blobOf = it => imOf(it) >= 0 ? null : (it.imgWeb || (it.foto && it.foto[0]) || null);
  function itemThumb(it, size = 44) {
    const b = blobOf(it);
    if (b) { const im = el('img', { src: '/_blob/' + b, alt: '', class: 'mg-uimg', loading: 'lazy' }); im.style.width = im.style.height = size + 'px'; return im; }
    return thumb(imOf(it), size);
  }

  /* ---------------- ricerca a listino ---------------- */
  function catPicker(onPick, ph) {
    const q = el('input', { type: 'search', placeholder: ph || 'Cerca a listino: codice o descrizione…', autocomplete: 'off' });
    const drop = el('div', { class: 'gs-drop', hidden: true });
    let res = [], hl = 0;
    const draw = () => {
      drop.replaceChildren(...res.map((it, k) => el('div', { class: 'gs-item' + (k === hl ? ' hl' : ''), onmousedown: e => { e.preventDefault(); pick(it); } }, thumb(it.im, 34), el('div', { class: 't' }, el('b', { class: 'mono' }, it.c), el('div', { class: 'hint', style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, it.d || '')))));
      drop.hidden = !res.length;
    };
    const pick = it => { q.value = ''; res = []; draw(); onPick(it); };
    q.addEventListener('input', () => { const v = q.value.trim(); res = v.length >= 2 ? searchCat(v).slice(0, 8) : []; hl = 0; draw(); });
    q.addEventListener('keydown', e => { if (drop.hidden) return; if (e.key === 'ArrowDown') { hl = Math.min(res.length - 1, hl + 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { hl = Math.max(0, hl - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (res[hl]) pick(res[hl]); } else if (e.key === 'Escape') { res = []; draw(); e.stopPropagation(); } });
    q.addEventListener('blur', () => setTimeout(() => { res = []; draw(); }, 150));
    return el('div', { class: 'picker' }, q, drop);
  }

  /* ---------------- carico articoli con scansione ---------------- */
  function loadForm() {
    let cur = null;        // modello corrente {code, desc, im, L, ean}
    let pend = [];         // articoli da salvare
    const ub = inp('mgUb', S.state.mgUb || '', { placeholder: 'Es. Scaffale A2, Showroom, Furgone' });
    const scan = el('input', { type: 'text', class: 'mg-scan', id: 'mgScan', placeholder: 'Scansiona qui con il lettore oppure scrivi e premi Invio', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false });
    const curBox = el('div', { class: 'mg-cur' });
    const listBox = el('div', { class: 'stack', style: 'gap:6px' });
    const qty = inp('mgQty', 1, { type: 'number', min: 1, step: 1, style: 'width:80px' });
    const em = eanMap();
    let pendingEan = null;
    const setModel = (it, ean) => {
      ean = ean || pendingEan; pendingEan = null;
      cur = { code: it.c, desc: it.d || '', im: it.im, L: it.L, ean: ean || (cur && cur.code === it.c ? cur.ean : '') || '' };
      if (ean) em.set(ean, { code: it.c, L: it.L });
      drawCur();
    };
    const drawCur = () => {
      curBox.replaceChildren(cur ? el('div', { class: 'row', style: 'flex-wrap:nowrap;gap:12px' }, thumb(cur.im, 56), el('div', { class: 'grow', style: 'min-width:0' }, el('span', { class: 'eyebrow' }, 'Modello in carico'), el('div', {}, el('b', { class: 'mono' }, cur.code)), el('div', { class: 'hint mg-clamp' }, cur.desc), cur.ean ? el('small', { class: 'mono muted' }, 'EAN ' + cur.ean) : null), btn('Cambia', () => { cur = null; drawCur(); }, 'sm ghost'))
        : el('div', { class: 'stack', style: 'gap:6px' }, el('span', { class: 'eyebrow' }, 'Modello'), el('p', { class: 'hint', style: 'margin:0' }, 'Scansiona il codice modello o l\'EAN della scatola, oppure cercalo a listino. Poi scansiona i seriali uno dopo l\'altro.'), catPicker(it => { setModel(it); scan.focus(); })));
    };
    const addPend = (sn, full, q) => {
      if (!cur) { toast('Prima indica il modello (scansiona il codice o cercalo a listino).', 'bad'); return 'manca il modello'; }
      if (sn) {
        const ex = findBySn(sn); if (ex) { toast('Seriale ' + sn + ' già in magazzino (' + ex.code + ').', 'bad'); return 'già presente'; }
        if (pend.some(p => p.seriale && snNorm(p.seriale) === snNorm(sn))) return 'già in lista';
      }
      pend.unshift({ code: cur.code, desc: cur.desc, im: cur.im, L: cur.L, ean: cur.ean || '', seriale: sn || '', snFull: full || '', qty: sn ? 1 : Math.max(1, +q || 1) });
      drawList(); return sn ? 'aggiunto' : 'aggiunto ×' + (+q || 1);
    };
    const handle = raw => {
      const p = parseScan(raw); if (!p.raw) return '';
      if (p.item) { setModel(p.item, p.ean); if (p.serial) return addPend(p.serial, p.full); return 'modello ' + p.item.c; }
      if (p.ean && !p.serial) {
        const k = em.get(p.ean); const it = k && findCode(k.code, k.L);
        if (it) { setModel(it, p.ean); return 'modello ' + it.c; }
        if (cur) { cur.ean = p.ean; em.set(p.ean, { code: cur.code, L: cur.L }); drawCur(); return 'EAN associato a ' + cur.code; }
        toast('EAN ' + p.ean + ' non ancora associato: cerca il modello a listino, lo ricorderò per le prossime scansioni.', 'bad'); pendingEan = p.ean; return 'EAN sconosciuto';
      }
      if (p.model && !p.serial) { cur = { code: p.model, desc: '', im: -1, L: null, ean: '' }; drawCur(); toast('Modello ' + p.model + ' non presente a listino: lo carico comunque.'); return 'modello fuori listino'; }
      if (p.serial) return addPend(p.serial, p.full);
      return '';
    };
    scan.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const v = scan.value; scan.value = ''; handle(v); } });
    const drawList = () => {
      listBox.replaceChildren(...(pend.length ? [el('div', { class: 'row between' }, el('b', {}, pend.reduce((a, p) => a + p.qty, 0) + ' articoli da caricare'), btn('Svuota', () => { pend = []; drawList(); }, 'sm ghost'))] : []),
        ...pend.map((p, k) => el('div', { class: 'mg-pr' }, thumb(p.im, 32), el('div', { class: 'grow', style: 'min-width:0' }, el('b', { class: 'mono' }, p.code), el('div', { class: 'hint' }, p.seriale ? 'S/N ' + p.seriale : 'Senza seriale · quantità ' + p.qty)),
          el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Togli', onclick: () => { pend.splice(k, 1); drawList(); } }, ic('x', 16)))));
    };
    drawCur(); drawList();
    const body = el('div', { class: 'stack' },
      curBox,
      el('div', { class: 'fld' }, el('span', {}, 'Scansione (lettore USB / Bluetooth o tastiera)'), el('div', { class: 'row', style: 'flex-wrap:nowrap;gap:8px' }, scan, btn('Fotocamera', () => openCam(v => { const r = handle(v); return r; }, 'Carico articoli'), 'pri', 'cam'))),
      el('div', { class: 'row', style: 'gap:8px;align-items:flex-end' }, el('label', { class: 'fld' }, el('span', {}, 'Quantità senza seriale'), qty), btn('Aggiungi senza seriale', () => { const r = addPend('', '', qty.value); if (r) toast(r); }, 'sm', 'plus'), el('label', { class: 'fld grow' }, el('span', {}, 'Ubicazione in filiale'), ub)),
      listBox);
    const m = modal('Carica articoli in magazzino', body, [el('span', { class: 'grow' }), btn('Chiudi', () => m.close()), btn('Salva in magazzino', async () => {
      if (!pend.length) { toast('Nessun articolo da salvare.', 'bad'); return; }
      const now = Date.now(); let ok = 0; S.state.mgUb = ub.value.trim();
      for (const p of pend.slice().reverse()) {
        const d = { code: p.code, desc: p.desc, im: p.im, L: p.L, ean: p.ean, seriale: p.seriale, snFull: p.snFull, qty: p.qty, foto: [], stato: 'sede', ubicazione: ub.value.trim(), note: '', demoId: null, at: now, by: S.me, upd: now };
        if (await put('magazzino', newId('magazzino'), d)) ok++;
      }
      toast(ok === 1 ? '1 articolo caricato' : ok + ' articoli caricati'); feed('magazzino', 'ha caricato ' + ok + (ok === 1 ? ' articolo' : ' articoli') + ' in magazzino', { k: 'magazzino' }, []);
      pend = []; drawList();
    }, 'pri', 'check')], { wide: true });
    setTimeout(() => scan.focus(), 60);
  }

  /* ---------------- scheda articolo ---------------- */
  function itemForm(it) {
    const d = JSON.parse(JSON.stringify(it));
    const code = inp('miCode', d.code || ''), sn = inp('miSn', d.seriale || '', { class: 'mono' }), ean = inp('miEan', d.ean || ''), q = inp('miQty', d.qty ?? 1, { type: 'number', min: 1 });
    const st = selectEl('miSt', Object.entries(ST).map(([k, v]) => [k, v[0]]), d.stato || 'sede', { disabled: d.stato === 'demo' });
    const ub = inp('miUb', d.ubicazione || ''), note = el('textarea', { id: 'miNote', value: d.note || '', style: 'min-height:60px' });
    const inv = d.sap || d.pz != null ? Object.fromEntries(INVF.map(([k]) => [k, inp('mi_' + k, d[k] ?? '', { type: 'number', min: 0, step: 1 })])) : null;
    const gal = el('div', { class: 'mg-gal' });
    const pick = photoPicker(id => { d.foto = [...(d.foto || []), id]; drawGal(); });
    const drawGal = () => {
      const c = findCode(code.value.trim()) || null; const im = c ? c.im : -1;
      gal.replaceChildren(
        im >= 0 ? el('figure', {}, thumb(im, 120), el('figcaption', {}, 'Listino')) : null,
        im < 0 && d.imgWeb ? el('figure', {}, el('a', { href: '/_blob/' + d.imgWeb, target: '_blank', rel: 'noopener' }, el('img', { src: '/_blob/' + d.imgWeb, alt: 'Immagine dal web', style: 'object-fit:contain;background:#fff' })), el('figcaption', {}, 'Dal web · ', el('button', { type: 'button', class: 'linkish', onclick: () => { d.imgWeb = null; drawGal(); } }, 'Rimuovi'))) : null,
        im < 0 && !d.imgWeb ? el('button', { type: 'button', class: 'mg-add', onclick: async e => { const b = e.currentTarget; b.disabled = true; b.textContent = 'Cerco sul web…'; const r = await webImg(/^SAP /.test(code.value) ? (d.descSap || d.desc) : code.value, d.descSap || d.desc, true); if (r) { d.imgWeb = r; } else toast('Nessuna immagine trovata per ' + (code.value || d.code) + '.', 'bad'); drawGal(); } }, ic('search', 22), 'Cerca immagine sul web') : null,
        ...(d.foto || []).map((f, k) => el('figure', {}, el('a', { href: '/_blob/' + f, target: '_blank', rel: 'noopener' }, el('img', { src: '/_blob/' + f, alt: 'Foto ' + (k + 1), loading: 'lazy' })), el('figcaption', {}, el('button', { type: 'button', class: 'linkish', onclick: () => { d.foto.splice(k, 1); drawGal(); } }, 'Rimuovi')))),
        el('button', { type: 'button', class: 'mg-add', onclick: () => pick.click() }, ic('cam', 22), 'Aggiungi foto'), pick);
    };
    code.addEventListener('change', drawGal); drawGal();
    const dm = demoOf(it);
    const hist = [...S.demo.values()].filter(x => (x.items || []).some(y => y.id === it.id || y.parentId === it.id)).sort((a, b) => (b.consegna || '').localeCompare(a.consegna || ''));
    const body = el('div', { class: 'stack' },
      gal,
      el('div', { class: 'fgrid' }, fld('Codice modello', code), fld('Seriale', sn), fld('EAN', ean), inv ? null : fld('Quantità', q), fld('Stato', st), fld('Ubicazione', ub), fld('Note', note, 'full')),
      inv ? el('div', { class: 'stack', style: 'gap:6px' }, el('span', { class: 'eyebrow' }, 'Inventario' + (d.magSap ? ' · magazzino ' + d.magSap : '') + (d.divisione ? ' · divisione ' + d.divisione : '')), el('dl', { class: 'dl' }, el('dt', {}, 'Codice SAP'), el('dd', { class: 'mono' }, d.sap || '—'), el('dt', {}, 'Descrizione SAP'), el('dd', {}, d.descSap || '—')), el('div', { class: 'mg-inv' }, ...INVF.map(([k, l]) => el('label', { class: 'fld' }, el('span', {}, l), inv[k])))) : null,
      dm ? el('div', { class: 'banner' }, 'In ' + (TIPL[dm.tipo] || 'demo').toLowerCase() + ' presso ', el('b', {}, cliName(dm.clienteId) || '—'), ' dal ' + fK(dm.consegna) + (dm.rientro ? ', rientro previsto ' + fK(dm.rientro) : '') + '. ', el('a', { href: '#', onclick: e => { e.preventDefault(); m.close(); demoDetail(dm); } }, 'Apri la consegna')) : null,
      hist.length ? el('div', { class: 'stack', style: 'gap:4px' }, el('span', { class: 'eyebrow' }, 'Storico consegne'), ...hist.map(x => el('a', { href: '#', class: 'hint', onclick: e => { e.preventDefault(); m.close(); demoDetail(x); } }, (x.n || '') + ' · ' + (cliName(x.clienteId) || '—') + ' · ' + fK(x.consegna) + (isOpen(x) ? ' (aperta)' : ' → rientro ' + fK(x.chiusa || x.rientro))))) : null,
      el('p', { class: 'hint' }, 'Caricato da ' + nm(it.by) + ' il ' + fD(it.at) + '.'));
    const m = modal('Articolo · ' + (it.code || ''), body, [
      btn('Elimina', async () => { if (it.stato === 'demo') { toast('L\'articolo è in demo: registra prima il rientro.', 'bad'); return; } if (await ask('Eliminare ' + it.code + (it.seriale ? ' (S/N ' + it.seriale + ')' : '') + ' dal magazzino?')) { if (await remove('magazzino', it.id)) m.close(); } }, 'danger', 'trash'),
      it.stato === 'sede' ? btn('Consegna in demo', () => { m.close(); demoForm(null, { items: [it.id] }); }, '', 'ext') : null,
      el('span', { class: 'grow' }), btn('Annulla', () => m.close()),
      btn('Salva', async () => {
        const c = findCode(code.value.trim());
        if (sn.value.trim()) { const ex = findBySn(sn.value.trim()); if (ex && ex.id !== it.id) { toast('Seriale già presente su un altro articolo (' + ex.code + ').', 'bad'); return; } }
        const up = { code: c ? c.c : code.value.trim().toUpperCase(), desc: c ? (c.d || '') : d.desc || '', im: c ? c.im : -1, L: c ? c.L : null, seriale: sn.value.trim().toUpperCase(), ean: ean.value.trim(), qty: Math.max(1, +q.value || 1), ubicazione: ub.value.trim(), note: note.value.trim(), foto: d.foto || [], imgWeb: d.imgWeb || null, upd: Date.now() };
        if (inv) {
          Object.assign(up, Object.fromEntries(INVF.map(([k]) => [k, inv[k].value === '' ? null : +inv[k].value])));
          up.qty = up.qRil ?? up.pz ?? 0;
          const sv = it.stato === 'demo' ? 'demo' : (up.stato || it.stato);
          if (sv === 'sede' && !(up.qty > 0)) up.stato = 'mancante'; else if (sv === 'mancante' && up.qty > 0) up.stato = 'sede';
        }
        if (it.stato !== 'demo') up.stato = st.value;
        if (await patch('magazzino', it.id, up)) { m.close(); toast('Articolo salvato'); }
      }, 'pri', 'check')], { wide: true });
  }

  /* ---------------- consegna in demo / POC ---------------- */
  function nextNum() {
    const y = new Date().getFullYear(); let mx = 0;
    for (const d of S.demo.values()) { const m = /^D(\d{4})-(\d+)$/.exec(d.n || ''); if (m && +m[1] === y) mx = Math.max(mx, +m[2]); }
    return 'D' + y + '-' + String(mx + 1).padStart(3, '0');
  }
  function demoForm(dm, preset) {
    const d = dm ? JSON.parse(JSON.stringify(dm)) : { tipo: 'demo', clienteId: '', commessaId: '', referente: '', luogo: '', consegna: today(), rientro: addDays(today(), 15), promemoria: [addDays(today(), 13)], resp: S.me, note: '', items: [], ...(preset || {}) };
    let sel = (d.items || []).map(x => typeof x === 'string' ? x : x.id).filter(id => S.mag.has(id));
    const pcs = new Map(); // pezzi da consegnare per le righe senza seriale con più pezzi
    const isPrev = sid => dm && (dm.items || []).some(y => y.id === sid);
    const cli = selectEl('dmCli', [['', '— Scegli il cliente —'], ...[...S.clienti.values()].sort(byName).map(c => [c.id, c.nome])], d.clienteId || '');
    const com = el('select', { id: 'dmCom' });
    const fillCom = () => { const v = com.value || d.commessaId || ''; const cs = [...S.commesse.values()].filter(c => !cli.value || c.clienteId === cli.value).sort(byName); com.replaceChildren(el('option', { value: '' }, '— Nessuna commessa —'), ...cs.map(c => el('option', { value: c.id, selected: c.id === v }, c.nome + (c.codice ? ' · ' + c.codice : '')))); };
    cli.addEventListener('change', () => { d.commessaId = ''; com.value = ''; fillCom(); const c = S.clienti.get(cli.value); if (c && !luogo.value) luogo.value = [c.indirizzo, c.citta].filter(Boolean).join(', '); if (c && !ref.value && c.referente) ref.value = c.referente; });
    com.addEventListener('change', () => { const c = S.commesse.get(com.value); if (c && !cli.value) { cli.value = c.clienteId || ''; fillCom(); com.value = c.id; } if (c && c.citta && !luogo.value) luogo.value = [c.indirizzo, c.citta].filter(Boolean).join(', '); });
    fillCom();
    const tipo = selectEl('dmTipo', TIPI, d.tipo || 'demo');
    const ref = inp('dmRef', d.referente || '', { placeholder: 'Chi riceve il materiale' }), luogo = inp('dmLuogo', d.luogo || '', { placeholder: 'Dove viene installato / provato' });
    const cons = inp('dmCons', d.consegna || today(), { type: 'date' }), rien = inp('dmRien', d.rientro || '', { type: 'date' });
    const resp = selectEl('dmResp', [...new Set([...S.team.keys(), ...(d.resp ? [d.resp] : [])])].map(id => [id, nm(id)]), d.resp || S.me);
    const note = el('textarea', { id: 'dmNote', value: d.note || '', style: 'min-height:60px', placeholder: 'Condizioni, accessori consegnati, obiettivi del POC…' });
    // promemoria
    let rem = (d.promemoria || []).slice();
    const remBox = el('div', { class: 'row', style: 'gap:6px' });
    const remIn = inp('dmRem', '', { type: 'date', style: 'width:auto' });
    const drawRem = () => remBox.replaceChildren(...rem.sort().map((k, j) => el('span', { class: 'pill', style: '--c:var(--info)' }, ic('bell', 13), fKs(k), el('button', { type: 'button', class: 'linkish', 'aria-label': 'Togli promemoria', onclick: () => { rem.splice(j, 1); drawRem(); } }, '×'))),
      rem.length ? null : el('span', { class: 'hint' }, 'Nessun promemoria: riceverai comunque un avviso il giorno del rientro.'));
    const addRem = k => { if (k && !rem.includes(k)) { rem.push(k); drawRem(); } };
    drawRem();
    const quick = el('div', { class: 'row', style: 'gap:6px' },
      remIn, btn('Aggiungi', () => { addRem(remIn.value); remIn.value = ''; }, 'sm', 'plus'),
      ...[[7, '+1 settimana'], [14, '+2 settimane'], [30, '+1 mese']].map(([n, l]) => btn(l, () => addRem(addDays(cons.value || today(), n)), 'sm ghost')),
      btn('2 giorni prima del rientro', () => { if (!rien.value) { toast('Imposta prima la data di rientro.', 'bad'); return; } addRem(addDays(rien.value, -2)); }, 'sm ghost'));
    // articoli
    const itBox = el('div', { class: 'stack', style: 'gap:6px' });
    const avail = () => [...S.mag.values()].filter(x => (x.stato || 'sede') === 'sede' || sel.includes(x.id));
    const addItem = raw => {
      const p = parseScan(raw); const v = String(raw || '').trim(); if (!v) return '';
      let it = (p.serial && findBySn(p.serial)) || findBySn(v);
      if (!it) { const code = p.item ? p.item.c : (p.model || ''); if (code) it = avail().find(x => x.code === code && !sel.includes(x.id) && !x.seriale) || avail().find(x => x.code === code && !sel.includes(x.id)); }
      if (!it && p.ean) it = avail().find(x => x.ean === p.ean && !sel.includes(x.id));
      if (!it) { toast('Nessun articolo in magazzino per «' + v + '».', 'bad'); return 'non trovato'; }
      if (sel.includes(it.id)) return 'già in lista';
      if ((it.stato || 'sede') !== 'sede' && !(dm && (dm.items || []).some(y => y.id === it.id))) { toast(it.code + ' non è in filiale (' + (ST[it.stato] || ST.sede)[0].toLowerCase() + ').', 'bad'); return 'non disponibile'; }
      sel.push(it.id); drawItems(); return 'aggiunto ' + it.code;
    };
    const srch = el('input', { type: 'search', placeholder: 'Scansiona il seriale o cerca tra gli articoli in filiale…', autocomplete: 'off' });
    const drop = el('div', { class: 'gs-drop', hidden: true });
    const drawDrop = () => {
      const v = srch.value.trim().toLowerCase(); if (v.length < 2) { drop.hidden = true; return; }
      const res = avail().filter(x => !sel.includes(x.id) && (x.code + ' ' + (x.seriale || '') + ' ' + descOf(x)).toLowerCase().includes(v)).slice(0, 8);
      drop.replaceChildren(...res.map(x => el('div', { class: 'gs-item', onmousedown: e => { e.preventDefault(); sel.push(x.id); srch.value = ''; drop.hidden = true; drawItems(); } }, itemThumb(x, 32), el('div', { class: 't' }, el('b', { class: 'mono' }, x.code), el('div', { class: 'hint' }, x.seriale ? 'S/N ' + x.seriale : 'Senza seriale' + (x.qty > 1 ? ' · ×' + x.qty : ''))))));
      drop.hidden = !res.length;
    };
    srch.addEventListener('input', drawDrop);
    srch.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const v = srch.value; srch.value = ''; drop.hidden = true; const r = addItem(v); if (r && r !== 'non trovato') toast(r); } });
    srch.addEventListener('blur', () => setTimeout(() => { drop.hidden = true; }, 150));
    const drawItems = () => itBox.replaceChildren(
      el('div', { class: 'row', style: 'flex-wrap:nowrap;gap:8px' }, el('div', { class: 'picker grow' }, srch, drop), btn('Fotocamera', () => openCam(v => addItem(v), 'Articoli da consegnare'), '', 'cam')),
      sel.length ? el('b', {}, sel.length + (sel.length === 1 ? ' articolo' : ' articoli')) : el('p', { class: 'hint' }, 'Aggiungi gli articoli da consegnare: scansiona il seriale o cercali per codice.'),
      ...sel.map((id, k) => { const x = S.mag.get(id); if (!x) return null; return el('div', { class: 'mg-pr' }, itemThumb(x, 32), el('div', { class: 'grow', style: 'min-width:0' }, el('b', { class: 'mono' }, x.code), el('div', { class: 'hint' }, (x.seriale ? 'S/N ' + x.seriale : 'Senza seriale') + (x.qty > 1 ? ' · ' + x.qty + ' pz disponibili' : '') + ' · ' + descOf(x))),
        !x.seriale && x.qty > 1 && !isPrev(id) ? el('label', { class: 'row', style: 'gap:6px;flex-wrap:nowrap;font-size:.8rem' }, 'Pezzi', el('input', { type: 'number', min: 1, max: x.qty, value: pcs.get(id) || 1, style: 'width:70px', oninput: e => pcs.set(id, Math.max(1, Math.min(x.qty, +e.target.value || 1))) })) : null,
        el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Togli', onclick: () => { sel.splice(k, 1); drawItems(); } }, ic('x', 16))); }));
    drawItems();
    const body = el('div', { class: 'stack' },
      el('div', { class: 'fgrid' }, fld('Tipo', tipo), fld('Responsabile', resp), fld('Cliente *', cli, 'full'), fld('Commessa collegata', com, 'full'), fld('Ricevuto da (referente)', ref), fld('Luogo', luogo), fld('Data consegna', cons), fld('Rientro previsto', rien)),
      el('div', { class: 'fld' }, el('span', {}, 'Promemoria'), remBox, quick),
      el('div', { class: 'fld' }, el('span', {}, 'Articoli'), itBox),
      fld('Note', note));
    const m = modal(dm ? 'Modifica ' + (TIPL[dm.tipo] || 'demo') + ' ' + (dm.n || '') : 'Nuova consegna in demo / POC', body, [el('span', { class: 'grow' }), btn('Annulla', () => m.close()), btn('Salva', async () => {
      if (!cli.value) { toast('Scegli il cliente.', 'bad'); cli.focus(); return; }
      if (!sel.length) { toast('Aggiungi almeno un articolo.', 'bad'); srch.focus(); return; }
      if (rien.value && cons.value && rien.value < cons.value) { toast('Il rientro è prima della consegna.', 'bad'); return; }
      const id = dm ? dm.id : newId('demo'); const now = Date.now();
      const prevItems = dm ? (dm.items || []) : [];
      // righe con più pezzi: consegno solo i pezzi indicati creando una riga figlia, che al rientro torna nella riga madre
      for (let k = 0; k < sel.length; k++) {
        const sid = sel[k], x = S.mag.get(sid); if (!x || x.seriale || isPrev(sid) || !(x.qty > 1)) continue;
        const n = pcs.get(sid) || 1; if (n >= x.qty) continue;
        const cid = newId('magazzino'); const c = { ...x }; delete c.id;
        Object.assign(c, { qty: n, pz: null, qRil: n, qManc: null, qUtile: null, qNonServe: null, parentId: sid, stato: 'demo', demoId: id, at: now, by: S.me, upd: now });
        if (!(await put('magazzino', cid, c))) return;
        await patch('magazzino', sid, { qty: x.qty - n, qRil: (x.qRil ?? x.qty) - n, upd: now });
        sel[k] = cid;
      }
      const items = sel.map(sid => { const x = S.mag.get(sid); const old = prevItems.find(y => y.id === sid); return old ? { ...old, code: x.code, seriale: x.seriale || '', desc: descOf(x), qty: x.qty || 1 } : { id: sid, parentId: x.parentId || null, sap: x.sap || '', code: x.code, seriale: x.seriale || '', desc: descOf(x), qty: x.qty || 1 }; });
      const o = { ...d, n: d.n || nextNum(), tipo: tipo.value, clienteId: cli.value, commessaId: com.value || '', referente: ref.value.trim(), luogo: luogo.value.trim(), consegna: cons.value || today(), rientro: rien.value || '', promemoria: rem.slice().sort(), resp: resp.value, note: note.value.trim(), items, stato: d.stato || 'aperta', upd: now };
      delete o.id; if (!dm) { o.at = now; o.by = S.me; }
      if (!(await put('demo', id, o))) return;
      const open = isOpen(o);
      for (const x of items) if (open && !x.rientratoAt && !x.esito) await patch('magazzino', x.id, { stato: 'demo', demoId: id, upd: now });
      for (const x of prevItems) if (!sel.includes(x.id) && S.mag.get(x.id) && S.mag.get(x.id).demoId === id) await backHome(x.id);
      m.close();
      if (!dm) {
        const to = [o.resp].filter(x => x && x !== S.me);
        feed('demo', 'ha consegnato in ' + (TIPL[o.tipo] || 'demo').toLowerCase() + ' ' + items.length + (items.length === 1 ? ' articolo' : ' articoli') + ' a ' + cliName(o.clienteId) + (o.rientro ? ' (rientro previsto ' + fKs(o.rientro) + ')' : ''), { k: 'demo', id }, to);
        toast('Consegna ' + o.n + ' registrata');
      } else toast('Consegna aggiornata');
      demoDetail({ id, ...o });
    }, 'pri', 'check')], { wide: true });
  }

  // rientro in filiale: una riga figlia (parte dei pezzi di una riga di inventario) si riunisce alla riga madre
  async function backHome(id) {
    const x = S.mag.get(id); if (!x) return; const now = Date.now();
    const par = x.parentId && S.mag.get(x.parentId);
    if (par) { const up = { qty: (par.qty || 0) + (x.qty || 1), qRil: (par.qRil ?? par.qty ?? 0) + (x.qty || 1), stato: par.stato === 'mancante' ? 'sede' : par.stato, upd: now }; if (par.qManc > 0) up.qManc = Math.max(0, par.qManc - (x.qty || 1)); await patch('magazzino', par.id, up); await remove('magazzino', id); }
    else await patch('magazzino', id, { stato: 'sede', demoId: null, upd: now });
  }
  async function returnItems(dm, ids, esito) {
    const now = Date.now(); const k = today();
    const items = (dm.items || []).map(x => ids.includes(x.id) && !x.rientratoAt && !x.esito ? (esito === 'venduto' ? { ...x, esito: 'venduto', esitoAt: k } : { ...x, rientratoAt: k }) : x);
    const allDone = items.every(x => x.rientratoAt || x.esito);
    const up = { items, upd: now }; if (allDone) { up.stato = 'chiusa'; up.chiusa = k; }
    if (!(await patch('demo', dm.id, up))) return null;
    for (const id of ids) if (S.mag.has(id)) { if (esito === 'venduto') await patch('magazzino', id, { stato: 'venduto', demoId: null, upd: now }); else await backHome(id); }
    feed('demo', (esito === 'venduto' ? 'ha lasciato al cliente ' : 'ha registrato il rientro di ') + ids.length + (ids.length === 1 ? ' articolo' : ' articoli') + ' da ' + cliName(dm.clienteId) + (allDone ? ' (consegna ' + dm.n + ' chiusa)' : ''), { k: 'demo', id: dm.id }, []);
    return { ...dm, ...up };
  }

  function demoDetail(dm0) {
    const dm = S.demo.get(dm0.id) || dm0;
    const c = S.clienti.get(dm.clienteId), cm = dm.commessaId ? S.commesse.get(dm.commessaId) : null;
    const pend = (dm.items || []).filter(x => !x.rientratoAt && !x.esito);
    const dd = (l, v) => [el('dt', {}, l), el('dd', {}, v == null || v === '' ? '—' : v)];
    const rows = (dm.items || []).map(x => {
      const it = S.mag.get(x.id) || x; const done = x.rientratoAt || x.esito;
      return el('tr', {}, el('td', {}, itemThumb(it, 40)), el('td', {}, el('b', { class: 'mono' }, x.code), el('div', { class: 'hint mg-clamp', style: 'max-width:420px' }, x.desc || descOf(it))), el('td', { class: 'mono' }, x.seriale || '—'), el('td', { class: 'r num' }, String(x.qty || 1)),
        el('td', {}, x.rientratoAt ? el('span', { class: 'pill', style: '--c:var(--ok)' }, 'Rientrato ' + fKs(x.rientratoAt)) : x.esito ? el('span', { class: 'pill', style: '--c:var(--info)' }, 'Lasciato al cliente') : el('span', { class: 'pill', style: '--c:var(--warn)' }, 'Fuori')),
        el('td', {}, done ? null : el('div', { class: 'row', style: 'gap:4px;justify-content:flex-end;flex-wrap:nowrap' }, btn('Rientrato', async () => { const n = await returnItems(dm, [x.id], 'rientro'); if (n) { m.close(); demoDetail(n); } }, 'sm', 'ret'), btn('Lasciato', async () => { if (!await ask('Segnare ' + x.code + ' come venduto / lasciato al cliente?', 'Conferma', 'pri')) return; const n = await returnItems(dm, [x.id], 'venduto'); if (n) { m.close(); demoDetail(n); } }, 'sm ghost'))));
    });
    const body = el('div', { class: 'stack' },
      overdue(dm) ? el('div', { class: 'banner', style: '--c:var(--accent)' }, 'Rientro scaduto il ' + fK(dm.rientro) + ': contatta il cliente o aggiorna la data.') : null,
      el('dl', { class: 'dl' },
        dd('Tipo', TIPL[dm.tipo] || 'Demo'), dd('Stato', isOpen(dm) ? el('span', { class: 'pill', style: '--c:var(--warn)' }, 'Aperta') : el('span', { class: 'pill', style: '--c:var(--ok)' }, 'Chiusa il ' + fKs(dm.chiusa))),
        dd('Cliente', c ? el('a', { href: '#', onclick: e => { e.preventDefault(); m.close(); go('clienti', c.id); } }, c.nome) : '—'),
        dd('Commessa', cm ? el('a', { href: '#', onclick: e => { e.preventDefault(); m.close(); go('commesse', cm.id); } }, cm.nome) : '—'),
        dd('Ricevuto da', dm.referente), dd('Luogo', dm.luogo), dd('Consegna', fK(dm.consegna)), dd('Rientro previsto', dm.rientro ? el('span', { style: overdue(dm) ? 'color:var(--accent);font-weight:600' : '' }, fK(dm.rientro)) : '—'),
        dd('Promemoria', (dm.promemoria || []).length ? el('span', { class: 'row', style: 'gap:4px' }, ...(dm.promemoria || []).map(k => el('span', { class: 'pill', style: '--c:' + (k < today() ? 'var(--ink-3)' : 'var(--info)') }, fKs(k)))) : null),
        dd('Responsabile', nm(dm.resp)), dd('Note', dm.note), dd('Registrata da', nm(dm.by) + (dm.at ? ' · ' + fD(dm.at) : ''))),
      el('div', { class: 'tbl-wrap' }, el('table', { 'data-nosort': '' }, el('thead', {}, el('tr', {}, ['', 'Articolo', 'Seriale', 'Q.tà', 'Stato', ''].map((h, k) => el('th', { class: k === 3 ? 'r' : '' }, h)))), el('tbody', {}, rows))),
      el('p', { class: 'hint' }, 'I promemoria arrivano per email al responsabile e a chi ha registrato la consegna, alle 8 del giorno indicato e il giorno del rientro.'));
    const m = modal((TIPL[dm.tipo] || 'Demo') + ' ' + (dm.n || '') + (c ? ' · ' + c.nome : ''), body, [
      btn('Elimina', async () => {
        if (!await ask('Eliminare la consegna ' + (dm.n || '') + '? Gli articoli ancora fuori tornano «in filiale».')) return;
        for (const x of pend) if (S.mag.get(x.id) && S.mag.get(x.id).demoId === dm.id) await backHome(x.id);
        if (await remove('demo', dm.id)) m.close();
      }, 'danger', 'trash'),
      btn('Documento PDF', () => demoPdf(dm), '', 'pdf'),
      isOpen(dm) ? btn('Modifica', () => { m.close(); demoForm(dm); }, '', 'edit') : null,
      el('span', { class: 'grow' }), btn('Chiudi', () => m.close()),
      pend.length ? btn(pend.length === 1 ? 'Registra rientro' : 'Rientro di tutto', async () => { if (pend.length > 1 && !await ask('Registrare il rientro di ' + pend.length + ' articoli oggi?', 'Conferma', 'pri')) return; const n = await returnItems(dm, pend.map(x => x.id), 'rientro'); if (n) { m.close(); toast('Rientro registrato'); demoDetail(n); } }, 'pri', 'ret') : null], { wide: true });
  }
  window.hpDemoDetail = id => { const d = S.demo.get(id); if (d) demoDetail(d); };
  window.hpDemoNew = preset => demoForm(null, preset);

  /* ---------------- PDF ---------------- */
  async function pdfLibs() {
    if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    if (!window.jspdf.jsPDF.API.autoTable) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    await logo();
    return window.jspdf.jsPDF;
  }
  const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('img')); im.src = src; });
  async function catImg(im) {
    const sp = S.sprite; if (im == null || im < 0 || !sp) return null;
    try {
      const per = sp.cols * sp.rows, s = Math.floor(im / per), k = im % per; const img = await loadImg('sp' + s + '.jpg');
      const c = document.createElement('canvas'); c.width = c.height = sp.cell; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, sp.cell, sp.cell);
      g.drawImage(img, (k % sp.cols) * sp.cell, Math.floor(k / sp.cols) * sp.cell, sp.cell, sp.cell, 0, 0, sp.cell, sp.cell); return c.toDataURL('image/jpeg', .9);
    } catch (e) { return null; }
  }
  async function blobImg(id) {
    try {
      const img = await loadImg('/_blob/' + id); const k = Math.min(1, 300 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .85);
    } catch (e) { return null; }
  }
  const RED = [200, 16, 46], INK = [28, 36, 48], SOFT = [110, 122, 138];
  // Logo ufficiale: file /hik-logo.svg o /hik-logo.png nella cartella public (convertito in PNG ad alta risoluzione)
  let LOGO;
  async function logo() {
    if (LOGO !== undefined) return LOGO;
    for (const src of ['/hik-logo.svg', '/hik-logo.png']) {
      try {
        const r = await fetch(src, { method: 'HEAD' }); if (!r.ok) continue;
        const img = await loadImg(src); const w = img.naturalWidth || 800, h = img.naturalHeight || 160; const k = 900 / w;
        const c = document.createElement('canvas'); c.width = 900; c.height = Math.round(h * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return (LOGO = { url: c.toDataURL('image/png'), ar: w / h });
      } catch (e) { }
    }
    return (LOGO = null);
  }
  function header(doc, title, n, date) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(...RED); doc.rect(0, 0, W, 4, 'F');
    if (LOGO) { const h = Math.min(10, 52 / LOGO.ar); doc.addImage(LOGO.url, 'PNG', 14, 19.5 - h, h * LOGO.ar, h, 'hiklogo', 'FAST'); }
    else { doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...RED); doc.text('HIKVISION', 14, 18); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...SOFT); doc.text('Filiale di Palermo - Viale Lazio 30/B - Palermo', 14, 25);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(...INK); doc.text(title, W - 14, 15, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text('N. ' + (n || '____________'), W - 14, 21, { align: 'right' }); doc.text('Data ' + (date || '____ / ____ / ________'), W - 14, 26, { align: 'right' });
    doc.setDrawColor(220, 224, 230); doc.line(14, 30, W - 14, 30);
  }
  function box(doc, x, y, w, title, rows, blank) {
    const lh = blank ? 8.2 : 5.6; const h = 8 + rows.length * lh + 2;
    doc.setDrawColor(205, 210, 218); doc.roundedRect(x, y, w, h, 1.5, 1.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...RED); doc.text(title.toUpperCase(), x + 3, y + 5);
    let yy = y + 10.5;
    for (const [l, v] of rows) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...SOFT); doc.text(l, x + 3, yy);
      if (blank) { doc.setDrawColor(190, 196, 205); doc.line(x + 30, yy + .8, x + w - 3, yy + .8); }
      else { doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); const t = doc.splitTextToSize(String(v || '—'), w - 34); doc.text(t[0] + (t.length > 1 ? '…' : ''), x + 30, yy); }
      yy += lh;
    }
    return h;
  }
  function conditions(doc, y, tipo) {
    const W = doc.internal.pageSize.getWidth();
    const txt = 'Il materiale sopra elencato, di proprietà di Hikvision Italy S.r.l., viene consegnato ' + (tipo === 'poc' ? 'per una prova di funzionamento (POC)' : tipo === 'visione' ? 'in conto visione' : 'in demo') + ' a titolo gratuito e temporaneo e non può essere ceduto a terzi. Il ricevente ne cura la custodia e si impegna a restituirlo integro, completo di accessori e imballi, entro la data di rientro indicata o su richiesta. Eventuali danni, smarrimenti o mancata restituzione potranno essere addebitati a prezzo di listino.';
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor(...SOFT);
    const lines = doc.splitTextToSize(txt, W - 28); doc.text(lines, 14, y); return lines.length * 3.4;
  }
  function signatures(doc, y) {
    const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight();
    if (y > H - 72) { doc.addPage(); y = 20; }
    const cw = (W - 28 - 10) / 2;
    const sig = (x, yy, t, s) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...INK); doc.text(t, x, yy); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...SOFT); doc.text(s, x, yy + 4); doc.setDrawColor(150, 156, 166); doc.line(x, yy + 18, x + cw, yy + 18); };
    sig(14, y, 'Consegnato da (Hikvision)', 'Nome e firma'); sig(14 + cw + 10, y, 'Ricevuto da (cliente)', 'Timbro, nome e firma');
    y += 26;
    doc.setDrawColor(220, 224, 230); doc.setLineDashPattern([1, 1], 0); doc.line(14, y, W - 14, y); doc.setLineDashPattern([], 0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...RED); doc.text('RIENTRO DEL MATERIALE', 14, y + 6);
    sig(14, y + 12, 'Data rientro e verifica', 'Materiale completo e funzionante  [  ] sì   [  ] no'); sig(14 + cw + 10, y + 12, 'Ritirato da (Hikvision)', 'Nome e firma');
  }
  function footer(doc) {
    const n = doc.internal.getNumberOfPages(); const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    for (let p = 1; p <= n; p++) { doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...SOFT); doc.text('HIK PALERMO - documento di consegna materiale', 14, H - 8); doc.text('Pagina ' + p + ' di ' + n, W - 14, H - 8, { align: 'right' }); }
  }
  async function demoPdf(dm) {
    let jsPDF; try { jsPDF = await pdfLibs(); } catch (e) { toast('Non riesco a caricare il generatore PDF: controlla la connessione.', 'bad'); return; }
    toast('Preparo il PDF…');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' }); const W = doc.internal.pageSize.getWidth();
    const c = S.clienti.get(dm.clienteId) || {}, cm = dm.commessaId ? S.commesse.get(dm.commessaId) : null;
    header(doc, 'CONSEGNA MATERIALE IN ' + (dm.tipo === 'poc' ? 'POC' : dm.tipo === 'visione' ? 'CONTO VISIONE' : 'DEMO'), dm.n, fKs(dm.consegna));
    const bw = (W - 28 - 6) / 2;
    const h1 = box(doc, 14, 35, bw, 'Destinatario', [['Ragione sociale', c.nome], ['Indirizzo', [c.indirizzo, c.citta, c.prov].filter(Boolean).join(', ')], ['P. IVA', c.piva], ['Ricevuto da', dm.referente], ['Telefono', c.tel]]);
    const h2 = box(doc, 14 + bw + 6, 35, bw, 'Riferimento', [['Commessa', cm ? cm.nome + (cm.codice ? ' (' + cm.codice + ')' : '') : ''], ['Luogo', dm.luogo], ['Consegna', fKs(dm.consegna)], ['Rientro previsto', fKs(dm.rientro)], ['Referente HIK', nm(dm.resp)]]);
    const items = dm.items || [];
    const imgs = await Promise.all(items.map(async x => { const it = S.mag.get(x.id) || x; const ci = await catImg(imOf(it)); if (ci) return ci; const b = blobOf(it); return b ? await blobImg(b) : null; }));
    doc.autoTable({
      startY: 35 + Math.max(h1, h2) + 6, margin: { left: 14, right: 14 },
      head: [['#', 'Foto', 'Codice', 'Descrizione', 'Seriale', 'Q.tà']],
      body: items.map((x, k) => [String(k + 1), '', x.code, (x.desc || descOf(S.mag.get(x.id) || x) || '').slice(0, 140), x.seriale || '—', String(x.qty || 1)]),
      styles: { fontSize: 8.5, cellPadding: 2, valign: 'middle', textColor: INK, lineColor: [225, 228, 234], lineWidth: .1 },
      headStyles: { fillColor: [245, 246, 248], textColor: INK, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 18, minCellHeight: 16 }, 2: { cellWidth: 40, fontStyle: 'bold' }, 4: { cellWidth: 34, font: 'courier' }, 5: { cellWidth: 12, halign: 'center' } },
      didDrawCell: h => { if (h.section === 'body' && h.column.index === 1) { const im = imgs[h.row.index]; if (im) { try { doc.addImage(im, 'JPEG', h.cell.x + 1.5, h.cell.y + 1, 14, 14); } catch (e) { } } } }
    });
    let y = doc.lastAutoTable.finalY + 6;
    if (dm.note) { doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...INK); doc.text('Note', 14, y); doc.setFont('helvetica', 'normal'); const t = doc.splitTextToSize(dm.note, W - 28); doc.text(t, 14, y + 4.5); y += 6 + t.length * 3.8; }
    y += conditions(doc, y, dm.tipo) + 8;
    signatures(doc, y); footer(doc);
    doc.save((dm.n || 'demo') + ' ' + (c.nome || '').replace(/[\\/:*?"<>|]+/g, '').slice(0, 40) + '.pdf');
  }
  async function blankPdf() {
    let jsPDF; try { jsPDF = await pdfLibs(); } catch (e) { toast('Non riesco a caricare il generatore PDF: controlla la connessione.', 'bad'); return; }
    const doc = new jsPDF({ unit: 'mm', format: 'a4' }); const W = doc.internal.pageSize.getWidth();
    header(doc, 'CONSEGNA MATERIALE IN DEMO / POC', '', '');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...INK);
    doc.text('[   ] Demo        [   ] POC (prova di funzionamento)        [   ] Conto visione', 14, 36);
    const bw = (W - 28 - 6) / 2;
    const h1 = box(doc, 14, 40, bw, 'Destinatario', [['Ragione sociale', ''], ['', ''], ['Indirizzo', ''], ['P. IVA', ''], ['Ricevuto da', ''], ['Telefono', '']], true);
    box(doc, 14 + bw + 6, 40, bw, 'Riferimento', [['Commessa', ''], ['Luogo', ''], ['', ''], ['Consegna', ''], ['Rientro previsto', ''], ['Referente HIK', '']], true);
    doc.autoTable({
      startY: 40 + h1 + 6, margin: { left: 14, right: 14 },
      head: [['#', 'Codice', 'Descrizione', 'Seriale', 'Q.tà']],
      body: Array.from({ length: 10 }, (_, k) => [String(k + 1), '', '', '', '']),
      styles: { fontSize: 9, cellPadding: 2, minCellHeight: 8, valign: 'middle', textColor: INK, lineColor: [205, 210, 218], lineWidth: .15 },
      headStyles: { fillColor: [245, 246, 248], textColor: INK, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 8, halign: 'center', textColor: SOFT }, 1: { cellWidth: 44 }, 3: { cellWidth: 42 }, 4: { cellWidth: 14 } }
    });
    let y = doc.lastAutoTable.finalY + 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...INK); doc.text('Note', 14, y);
    doc.setDrawColor(190, 196, 205); doc.line(24, y + .8, W - 14, y + .8); doc.line(14, y + 8, W - 14, y + 8);
    y += 14; y += conditions(doc, y, 'demo') + 8;
    signatures(doc, y); footer(doc);
    doc.save('Modulo consegna demo (da compilare).pdf');
  }
  window.hpDemoPdf = id => { const d = S.demo.get(id); if (d) demoPdf(d); };
  window.hpBlankPdf = blankPdf;

  /* ---------------- vista Magazzino ---------------- */
  S.mgSel = S.mgSel || new Set();
  VIEWS.magazzino = {
    title: () => 'Magazzino', mount() { this.root = $('#view'); this.update(); },
    update() {
      const r = this.root; if (!r) return; const f = S.fMag;
      const items = [...S.mag.values()];
      const inSede = items.filter(x => (x.stato || 'sede') === 'sede'), inDemo = items.filter(x => x.stato === 'demo');
      const od = openDemos(); const late = od.filter(overdue);
      const soon = od.filter(d => { const n = nextRem(d); return n && n <= addDays(today(), 7); });
      const sum = a => a.reduce((s, x) => s + (x.qty || 1), 0);
      const tile = (t, v, s, on, cls) => el('div', { class: 'kpi' + (on ? ' hp-click' : ''), onclick: on || null }, el('span', { class: 'eyebrow' }, t), el('span', { class: 'v', style: cls || '' }, v), s ? el('span', { class: 's' }, s) : null);
      const kpis = el('div', { class: 'kpis' },
        tile('In filiale', String(sum(inSede)), new Set(inSede.map(x => x.code)).size + ' modelli', () => { f.tab = 'art'; f.st = 'sede'; this.update(); }),
        tile('Fuori in demo / POC', String(sum(inDemo)), od.length + (od.length === 1 ? ' consegna aperta' : ' consegne aperte') + ' · ' + new Set(od.map(d => d.clienteId)).size + ' clienti', () => { f.tab = 'demo'; f.dst = 'aperte'; this.update(); }),
        tile('Rientri scaduti', String(late.length), late.length ? late.map(d => cliName(d.clienteId)).slice(0, 3).join(', ') : 'nessuno', () => { f.tab = 'demo'; f.dst = 'scadute'; this.update(); }, late.length ? 'color:var(--accent)' : ''),
        tile('Promemoria entro 7 giorni', String(soon.length), soon.length ? 'il primo ' + fKs(soon.map(nextRem).sort()[0]) : '—', () => { f.tab = 'demo'; f.dst = 'aperte'; this.update(); }));
      const seg = el('div', { class: 'seg' }, el('button', { type: 'button', class: f.tab === 'art' ? 'on' : '', onclick: () => { f.tab = 'art'; this.update(); } }, ic('box', 16), 'Articoli'), el('button', { type: 'button', class: f.tab === 'demo' ? 'on' : '', onclick: () => { f.tab = 'demo'; this.update(); } }, ic('ext', 16), 'Demo e POC', od.length ? el('span', { class: 'n' }, String(od.length)) : null));
      const acts = el('div', { class: 'row' }, btn('Importa inventario', () => window.hpInvImport(), 'ghost', 'up'), btn('Modulo vuoto PDF', blankPdf, 'ghost', 'pdf'), btn('Nuova demo / POC', () => demoForm(null), '', 'ext'), btn('Carica articoli', loadForm, 'pri', 'scan'));
      let filters, body;
      if (f.tab === 'art') {
        const ql = f.q.trim().toLowerCase(); const qn = norm(f.q);
        const rows = items.filter(x => passSt(x, f.st) && (!ql || (x.code + ' ' + (x.seriale || '') + ' ' + (x.ean || '') + ' ' + (x.sap || '') + ' ' + (x.descSap || '') + ' ' + (x.note || '') + ' ' + descOf(x) + ' ' + (x.ubicazione || '') + ' ' + (demoOf(x) ? cliName(demoOf(x).clienteId) : '')).toLowerCase().includes(ql) || (qn.length >= 4 && snNorm(x.seriale || '').includes(qn))))
          .sort((a, b) => a.code.localeCompare(b.code) || String(a.seriale || '').localeCompare(String(b.seriale || '')));
        const vis = new Set(rows.map(x => x.id)); [...S.mgSel].forEach(id => { if (!vis.has(id) || (S.mag.get(id) || {}).stato !== 'sede') S.mgSel.delete(id); });
        const scanQ = el('input', { type: 'search', placeholder: 'Cerca o scansiona codice, seriale, cliente…', value: f.q, oninput: e => { f.q = e.target.value; this.update(); } });
        filters = el('div', { class: 'filters' }, scanQ, el('button', { type: 'button', class: 'icon-btn', title: 'Cerca con la fotocamera', 'aria-label': 'Cerca con la fotocamera', onclick: () => { let closeCam; openCam(v => { const p = parseScan(v); f.q = p.serial || (p.item && p.item.c) || p.ean || v; this.update(); const it = (p.serial && findBySn(p.serial)) || findBySn(v); if (it) { closeCam && closeCam(); itemForm(it); } return it ? 'trovato' : 'filtro applicato'; }, 'Cerca in magazzino').then(c => closeCam = c); } }, ic('cam', 18)),
          (() => { const sl = el('select', { id: 'mgSt', 'aria-label': 'Filtra per stato', onchange: e => { f.st = e.target.value; this.update(); } }, el('option', { value: '' }, 'Tutti gli stati (' + items.length + ')'),
            el('optgroup', { label: 'Stato articolo' }, ...Object.entries(ST).map(([k, v]) => el('option', { value: k }, v[0] + ' (' + items.filter(x => (x.stato || 'sede') === k).length + ')'))),
            el('optgroup', { label: 'Inventario' }, ...FILTRI.map(([k, l, fn]) => el('option', { value: k }, l + ' (' + items.filter(fn).length + ')')))); sl.value = f.st; return sl; })(),
          (() => { const noImg = items.filter(FILTRI[4][2]).length; return noImg ? btn('Immagini dal web (' + new Set(items.filter(FILTRI[4][2]).map(x => norm(x.code))).size + ')', webImgAll, 'ghost', 'search') : null; })());
        const sel = [...S.mgSel];
        const bar = sel.length ? el('div', { class: 'banner row between' }, el('span', {}, sel.length + (sel.length === 1 ? ' articolo selezionato' : ' articoli selezionati')), el('div', { class: 'row' }, btn('Deseleziona', () => { S.mgSel.clear(); this.update(); }, 'sm ghost'), btn('Consegna in demo', () => demoForm(null, { items: sel }), 'sm pri', 'ext'))) : null;
        const sedeRows = rows.filter(x => (x.stato || 'sede') === 'sede');
        const ckAll = el('input', { type: 'checkbox', 'aria-label': 'Seleziona tutti in filiale', checked: sedeRows.length > 0 && sedeRows.every(x => S.mgSel.has(x.id)), onchange: e => { sedeRows.forEach(x => e.target.checked ? S.mgSel.add(x.id) : S.mgSel.delete(x.id)); this.update(); } });
        body = rows.length ? el('section', { class: 'panel stack' }, bar, el('div', { class: 'tbl-wrap' }, el('table', {},
          el('thead', {}, el('tr', {}, el('th', { class: 'ck' }, ckAll), ...['Articolo', 'SAP', 'Seriale', 'Pz', 'Rilevati', 'Mancanti', 'Utili', 'Non servono', 'Stato', 'Presso / ubicazione', 'Note', 'Caricato'].map((h, k) => el('th', { class: k >= 3 && k <= 7 ? 'r' : '' }, h)))),
          el('tbody', {}, rows.map(x => { const dm = demoOf(x); const free = (x.stato || 'sede') === 'sede';
            return el('tr', { class: 'click' + (S.mgSel.has(x.id) ? ' sel' : ''), onclick: () => itemForm(x) },
              el('td', { class: 'ck', onclick: e => e.stopPropagation() }, free ? el('input', { type: 'checkbox', 'aria-label': 'Seleziona ' + x.code, checked: S.mgSel.has(x.id), onchange: e => { e.target.checked ? S.mgSel.add(x.id) : S.mgSel.delete(x.id); this.update(); } }) : null),
              el('td', {}, el('div', { class: 'row', style: 'flex-wrap:nowrap;gap:10px' }, itemThumb(x, 40), el('div', { class: 'cell-t' }, el('b', { class: 'mono' }, x.code), el('small', { class: 'muted', style: 'max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block' }, descOf(x))))),
              el('td', { class: 'mono' }, x.sap || el('span', { class: 'muted' }, '—')),
              el('td', { class: 'mono' }, x.seriale || el('span', { class: 'muted' }, '—')),
              ...[x.pz ?? x.qty ?? 1, x.qRil ?? x.qty ?? 1, x.qManc, x.qUtile, x.qNonServe].map((v, k) => el('td', { class: 'r num', 'data-sort': String(v ?? -1), style: k === 2 && v > 0 ? 'color:var(--accent);font-weight:600' : '' }, v == null ? el('span', { class: 'muted' }, '—') : String(v))),
              el('td', { 'data-sort': String(Object.keys(ST).indexOf(x.stato || 'sede')) }, stChip(x.stato || 'sede'), dm && overdue(dm) ? el('div', {}, el('small', { style: 'color:var(--accent)' }, 'rientro scaduto')) : null),
              el('td', {}, dm ? el('a', { href: '#', onclick: e => { e.preventDefault(); e.stopPropagation(); demoDetail(dm); } }, cliName(dm.clienteId) || '—', el('small', { class: 'muted' }, ' · ' + (dm.n || ''))) : (x.ubicazione || el('span', { class: 'muted' }, '—'))),
              el('td', {}, x.note ? el('span', { class: 'pill', style: '--c:var(--info)' }, x.note) : el('span', { class: 'muted' }, '—')),
              el('td', { 'data-sort': String(x.at || 0) }, el('span', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, av(x.by), fD(x.at))));
          }))))) : emptyBox(items.length ? 'Nessun articolo trovato' : 'Magazzino vuoto', items.length ? 'Cambia la ricerca o il filtro sullo stato.' : 'Carica gli articoli presenti in filiale scansionando modello e seriale con il cellulare o con un lettore di codici a barre.', items.length ? null : btn('Carica articoli', loadForm, 'pri', 'scan'));
      } else {
        const ql = f.q.trim().toLowerCase();
        const all = [...S.demo.values()].filter(d => (f.dst === 'tutte' || (f.dst === 'chiuse' ? !isOpen(d) : f.dst === 'scadute' ? overdue(d) : isOpen(d))) && (!ql || ((d.n || '') + ' ' + cliName(d.clienteId) + ' ' + ((S.commesse.get(d.commessaId) || {}).nome || '') + ' ' + (d.items || []).map(x => x.code + ' ' + (x.seriale || '')).join(' ') + ' ' + (d.referente || '')).toLowerCase().includes(ql)))
          .sort((a, b) => (isOpen(b) - isOpen(a)) || String(a.rientro || '9999').localeCompare(String(b.rientro || '9999')) || String(b.consegna).localeCompare(String(a.consegna)));
        filters = el('div', { class: 'filters' }, el('input', { type: 'search', placeholder: 'Cerca cliente, commessa, seriale…', value: f.q, oninput: e => { f.q = e.target.value; this.update(); } }),
          selectEl('mgDst', [['aperte', 'Aperte'], ['scadute', 'Rientro scaduto'], ['chiuse', 'Chiuse'], ['tutte', 'Tutte']], f.dst, { onchange: e => { f.dst = e.target.value; this.update(); } }));
        body = all.length ? el('section', { class: 'panel' }, el('div', { class: 'tbl-wrap' }, el('table', {},
          el('thead', {}, el('tr', {}, ['N.', 'Cliente', 'Commessa', 'Tipo', 'Articoli', 'Consegna', 'Rientro previsto', 'Prossimo promemoria', 'Responsabile', 'Stato', ''].map((h, k) => el('th', { class: k === 4 ? 'r' : '' }, h)))),
          el('tbody', {}, all.map(d => { const cm = S.commesse.get(d.commessaId); const out = (d.items || []).filter(x => !x.rientratoAt && !x.esito).length; const nr = nextRem(d);
            return el('tr', { class: 'click', onclick: () => demoDetail(d) },
              el('td', { class: 'mono' }, d.n || '—'), el('td', {}, el('b', {}, cliName(d.clienteId) || '—'), d.referente ? el('div', { class: 'hint' }, d.referente) : null),
              el('td', {}, cm ? el('a', { href: '#', onclick: e => { e.preventDefault(); e.stopPropagation(); go('commesse', cm.id); } }, cm.nome) : el('span', { class: 'muted' }, '—')),
              el('td', {}, TIPL[d.tipo] || 'Demo'),
              el('td', { class: 'r num', 'data-sort': String((d.items || []).length), title: (d.items || []).map(x => x.code + (x.seriale ? ' ' + x.seriale : '')).join('\n') }, isOpen(d) && out !== (d.items || []).length ? out + ' / ' + (d.items || []).length : String((d.items || []).length)),
              el('td', { 'data-sort': d.consegna || '' }, fKs(d.consegna)),
              el('td', { 'data-sort': d.rientro || '' }, d.rientro ? el('span', { style: overdue(d) ? 'color:var(--accent);font-weight:600' : '' }, fKs(d.rientro)) : '—'),
              el('td', { 'data-sort': nr || '' }, nr ? el('span', { class: 'row', style: 'gap:4px;flex-wrap:nowrap' }, ic('bell', 14), fKs(nr)) : '—'),
              el('td', {}, d.resp ? el('span', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, av(d.resp), nm(d.resp)) : '—'),
              el('td', {}, !isOpen(d) ? el('span', { class: 'pill', style: '--c:var(--ok)' }, 'Chiusa') : overdue(d) ? el('span', { class: 'pill', style: '--c:var(--accent)' }, 'Scaduta') : el('span', { class: 'pill', style: '--c:var(--warn)' }, 'Aperta')),
              el('td', { onclick: e => e.stopPropagation() }, el('button', { type: 'button', class: 'icon-btn', title: 'Documento PDF', 'aria-label': 'Documento PDF', onclick: () => demoPdf(d) }, ic('pdf', 16))));
          }))))) : emptyBox('Nessuna consegna', f.dst === 'aperte' ? 'Non ci sono prodotti fuori in demo o POC.' : 'Nessuna consegna con questo filtro.', btn('Nuova demo / POC', () => demoForm(null), 'pri', 'ext'));
      }
      r.replaceChildren(...[dbGate(), el('div', { class: 'row between' }, seg, acts), kpis, filters, body].filter(Boolean));
    }
  };

  /* ---------------- riferimenti in commesse, clienti, avvisi e menu ---------------- */
  window.hpDemoChip = function (cid) {
    const ds = window.hpDemoOpen(cid); if (!ds.length) return null;
    const n = ds.reduce((a, d) => a + (d.items || []).filter(x => !x.rientratoAt && !x.esito).length, 0);
    const late = ds.some(overdue);
    return el('span', { class: 'pill mg-chip', style: '--c:' + (late ? 'var(--accent)' : 'var(--warn)'), title: ds.map(d => (d.n || '') + ': ' + (d.items || []).map(x => x.code).join(', ') + (d.rientro ? ' · rientro ' + fKs(d.rientro) : '')).join('\n'), onclick: e => { e.stopPropagation(); demoDetail(ds[0]); } }, ic('ext', 12), (late ? 'Demo scaduta' : 'In demo') + ' · ' + n);
  };
  function demoPanel(list, preset) {
    const out = list.flatMap(d => (d.items || []).filter(x => !x.rientratoAt && !x.esito).map(x => ({ d, x })));
    return el('section', { class: 'panel', id: 'hpDemoBox' },
      el('div', { class: 'panel-h' }, el('h3', {}, 'Prodotti fuori in demo ', el('span', { class: 'pill', style: '--c:var(--warn)' }, String(out.length))), btn('Nuova demo', () => demoForm(null, preset), 'sm', 'plus')),
      el('div', { class: 'stack', style: 'gap:6px' }, out.map(({ d, x }) => el('div', { class: 'mg-pr hp-click', onclick: () => demoDetail(d) }, itemThumb(S.mag.get(x.id) || x, 32), el('div', { class: 'grow', style: 'min-width:0' }, el('b', { class: 'mono' }, x.code), el('div', { class: 'hint' }, (x.seriale ? 'S/N ' + x.seriale + ' · ' : '') + (d.n || '') + ' · dal ' + fKs(d.consegna) + (d.rientro ? ' · rientro ' + fKs(d.rientro) : ''))), overdue(d) ? el('span', { class: 'pill', style: '--c:var(--accent)' }, 'Scaduta') : null))));
  }
  const cdo = comDetail.update;
  comDetail.update = function () {
    const out = cdo.apply(this, arguments);
    try {
      const r = this.root; const c = S.commesse.get(S.sel); if (!r || !c || S.view !== 'commesse') return out;
      r.querySelector('#hpDemoBox')?.remove();
      const ds = window.hpDemoOpen(c.id);
      const head = r.firstElementChild;
      if (head && !head.querySelector('.mg-dbtn')) { const acts = head.querySelector('.dhead > .row:last-child'); if (acts) acts.prepend(btn('Consegna in demo', () => demoForm(null, { clienteId: c.clienteId || '', commessaId: c.id }), 'mg-dbtn', 'ext')); }
      if (ds.length) { const p = demoPanel(ds, { clienteId: c.clienteId || '', commessaId: c.id }); if (head && head.nextSibling) r.insertBefore(p, head.nextSibling); else r.appendChild(p); }
    } catch (e) { console.error(e); }
    return out;
  };
  const cli0 = cliDetail.update;
  cliDetail.update = function () {
    const out = cli0.apply(this, arguments);
    try {
      const r = this.root; const c = S.clienti.get(S.sel); if (!r || !c) return out;
      r.querySelector('#hpDemoBox')?.remove();
      const ds = openDemos().filter(d => d.clienteId === c.id); if (!ds.length) return out;
      const p = demoPanel(ds, { clienteId: c.id }); const head = r.firstElementChild;
      if (head && head.nextSibling) r.insertBefore(p, head.nextSibling); else r.appendChild(p);
    } catch (e) { console.error(e); }
    return out;
  };
  const or0 = window.openRef;
  window.openRef = function (ref) {
    if (ref && ref.k === 'demo') { go('magazzino'); S.fMag.tab = 'demo'; VIEWS.magazzino.update(); const d = S.demo.get(ref.id); if (d) demoDetail(d); return; }
    if (ref && ref.k === 'magazzino') { go('magazzino'); return; }
    return or0(ref);
  };
  const rn0 = window.renderNav;
  window.renderNav = function () {
    const out = rn0.apply(this, arguments);
    try {
      const n = openDemos().filter(dueNow).length;
      const b = [...document.querySelectorAll('#nav button')].find(x => x.title === 'Magazzino');
      if (b && n && !b.querySelector('.cnt')) b.appendChild(el('span', { class: 'cnt', title: 'Demo con promemoria oggi o rientro scaduto' }, String(n)));
    } catch (e) { }
    return out;
  };
  renderNav();
  if ((location.hash || '').slice(1) === 'magazzino') go('magazzino');
})();
