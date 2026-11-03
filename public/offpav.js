/* HIK PALERMO — offerta PDF in versione ProAV (solo proav.hikpalermo.com).
   Struttura: copertina (logo Hikvision piccolo, logo ProAV scuro, cliente e riferimento in maiuscoletto, testo introduttivo, immagini dei prodotti)
   → offerta con anteprime, SAP/codice/quantità/prezzi su una riga e descrizione estesa su tutta la larghezza
   → copertina «Modulo Conferma d'ordine» → riepilogo da firmare (senza colonne di sconto vuote, totale su fondo grigio)
   → condizioni con riquadro note → schede tecniche dei prodotti → disegni, simulazioni e report HiTools Designer (PDF allegati). */
(function () {
  'use strict';
  if (typeof HP_PAV === 'undefined' || !HP_PAV) return;
  const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', AT = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', PDFW = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const HQ = 'HIKVISION ITALY Srl - Viale Fulvio Testi, 113 - 20092 Cinisello Balsamo (MI) - P.IVA 07757250969';
  const RED = [200, 16, 46], INK = [64, 64, 64], GREY = [128, 128, 128], DARK = [51, 51, 51];
  // celle colorate in grigio chiaro: intestazioni, sezioni, totale
  const HEADF = [222, 224, 228], SECF = [246, 247, 248], TOTF = [240, 241, 243], LINEC = [170, 174, 182];
  const eur = v => '€ ' + (window.hpGrp ? hpGrp(v, 2) : (+v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const fc = (c, L) => { try { return typeof findCode === 'function' ? findCode(c, L) : null; } catch (e) { return null; } };
  const mainC = c => String(c || '').split(' + ')[0];

  /* ---------- immagini ---------- */
  const loadImg = src => new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  // logo come PNG; dark = ricolora in grigio scuro (il logo ProAV caricato è bianco)
  async function logo(src, w, dark) {
    const i = await loadImg(src); if (!i) return null;
    const c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * i.naturalHeight / i.naturalWidth); const g = c.getContext('2d'); g.drawImage(i, 0, 0, c.width, c.height);
    if (dark) { g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgb(51,51,51)'; g.fillRect(0, 0, c.width, c.height); }
    return { d: c.toDataURL('image/png'), r: c.height / c.width };
  }
  async function square(src, px) {
    const i = await loadImg(src); if (!i) return null;
    const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, px, px);
    const k = Math.min(px / i.naturalWidth, px / i.naturalHeight) * 0.92; const w = i.naturalWidth * k, h = i.naturalHeight * k; g.drawImage(i, (px - w) / 2, (px - h) / 2, w, h);
    return c.toDataURL('image/jpeg', 0.88);
  }
  // schede tecniche caricate a mano dall'esportazione: restano salvate per tutto il gruppo (raccolta «dsman», id = codice normalizzato)
  const dsKey = c => (window.hpDsKey ? hpDsKey(c) : String(c || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-'));
  let DSMAN = new Map();
  try { claude.use('db').then(db => { if (db) db.collection('dsman').onSnapshot(sn => { const m = new Map(); sn.docs.forEach(d => m.set(d.id, { id: d.id, ...d.data() })); DSMAN = m; }, () => { }); }); } catch (e) { }
  // codice nel modulo d'ordine: a capo dopo il «+» dei kit e comunque ogni 22 caratteri
  window.hpCodeLines = c => String(c || '').split(/\s*\+\s*/).flatMap((p, i, a) => { const t = p + (i < a.length - 1 ? ' +' : ''); const out = []; for (let k = 0; k < t.length; k += 22) out.push(t.slice(k, k + 22)); return out.length ? out : ['']; });
  const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
  // immagine del prodotto: prima quella della pagina ufficiale ProAV (og:image della scheda prodotto), altrimenti quella del listino
  async function productImage(r, big) {
    const it = fc(r.c, r.L) || {};
    const url = String(it.url || '').replace(/&amp;/g, '&');
    if (big && /^https?:\/\//.test(url)) {
      const d = await withTimeout((async () => {
        const h = await fetch('/api/fetch?u=' + encodeURIComponent(url), { credentials: 'same-origin' }); if (!h.ok) return null;
        const html = await h.text(); const m = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i.exec(html) || /content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i.exec(html); if (!m) return null;
        let src; try { src = new URL(m[1].replace(/&amp;/g, '&'), url).href; } catch (e) { return null; }
        const ir = await fetch('/api/fetch?u=' + encodeURIComponent(src), { credentials: 'same-origin' }); if (!ir.ok || !/image/.test(ir.headers.get('content-type') || '')) return null;
        const b = URL.createObjectURL(await ir.blob()); const out = await square(b, 600); URL.revokeObjectURL(b); return out;
      })(), 8000);
      if (d) return d;
    }
    const im = r.im != null ? r.im : it.im;
    if (typeof im === 'string' && im[0] === '/') return square(im, big ? 600 : 300);
    try { const n = window.artThumbC ? artThumbC(r.c, im, 96) : thumb(im, 96); if (n && !n.classList.contains('none') && window.hpImgData) return await window.hpImgData(n, big ? 400 : 240); } catch (e) { }
    return null;
  }

  /* ---------- testo introduttivo (copertina), generato da 800AI e modificabile ---------- */
  async function genIntro(D) {
    const cli = S.clienti.get(D.clienteId) || {};
    const righe = (D.righe || []).map(r => { const it = fc(r.c, r.L) || {}; return '- ' + r.q + '× ' + r.c + ': ' + String(r.b || it.b || '').slice(0, 140) + (it.sz ? ' [' + it.sz + (it.fm ? ' · ' + it.fm : '') + ']' : ''); }).join('\n');
    const prompt = `Scrivi il testo introduttivo della copertina di un'offerta commerciale Hikvision ProAV (audio e video professionale: LED wall, videowall LCD, monitor interattivi, digital signage, audio, controller, webcam).
Cliente: ${cli.nome || '—'}. Titolo / riferimento dell'offerta: ${D.titolo || '—'}.
Prodotti dell'offerta:
${righe || '(nessuno)'}
Regole: italiano professionale, tono consulenziale, 90-140 parole in 2 paragrafi brevi. Spiega la soluzione proposta (cosa si ottiene, perché questi prodotti, vantaggi per il cliente) basandoti SOLO su titolo e prodotti, senza inventare dati tecnici, prezzi, tempi o garanzie. Niente saluti, niente elenchi puntati, niente titoli. Rispondi solo con il testo.`;
    const r = await fetch('/api/claude', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-hp': '1' }, body: JSON.stringify({ max_tokens: 900, model: 'claude-sonnet-5-5', feat: 'Testo offerta ProAV', messages: [{ role: 'user', content: prompt }] }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) { const msg = (j && j.error && j.error.message) || ''; throw new Error(/usage limits/i.test(msg) ? 'limite di spesa dell\'API raggiunto' : /credit/i.test(msg) ? 'credito dell\'API esaurito' : msg || 'errore ' + r.status); }
    return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
  }
  // riquadro nell'editor dell'offerta
  window.hpOffIntroBox = function (D) {
    const ta = el('textarea', { value: D.intro || '', placeholder: 'Testo che presenta la soluzione al cliente, in copertina. Premi «Genera con 800AI» per una prima bozza, poi modificalo come vuoi.', style: 'min-height:96px', oninput: e => { D.intro = e.target.value; } });
    const b = btn(D.intro ? 'Rigenera con 800AI' : 'Genera con 800AI', async () => {
      if (!(D.righe || []).length && !D.titolo) { toast('Aggiungi prima il titolo o qualche articolo.', 'bad'); return; }
      if (D.intro && !(await ask('Sostituire il testo attuale con una nuova bozza di 800AI?', 'Sostituisci'))) return;
      b.disabled = true; const t0 = b.lastChild.textContent; b.lastChild.textContent = '800AI sta scrivendo…';
      try { const t = await genIntro({ ...D, titolo: (document.getElementById('oTit') || {}).value || D.titolo }); D.intro = t; ta.value = t; toast('Testo introduttivo pronto: puoi modificarlo.'); b.lastChild.textContent = 'Rigenera con 800AI'; }
      catch (e) { toast('Testo non generato: ' + e.message, 'bad'); b.lastChild.textContent = t0; }
      b.disabled = false;
    }, 'sm', 'spark');
    return el('div', { class: 'stack', style: 'grid-column:1/-1' }, el('div', { class: 'fld full' }, el('span', { class: 'row between', style: 'gap:8px' }, el('span', {}, 'Testo introduttivo (copertina dell\'offerta ProAV)'), b), ta), covBox(D));
  };

  /* ---------- immagini di copertina: automatiche (i 4 prodotti principali per valore) o scelte nella scheda offerta ---------- */
  const COVMAX = 6;
  const autoCov = D => [...new Map((D.righe || []).filter(r => r.c).slice().sort((a, b) => lineTot(b).netto - lineTot(a).netto).map(r => [mainC(r.c), r])).values()].slice(0, 4).map(r => ({ k: 'art', c: mainC(r.c), L: r.L }));
  const covImgCache = new Map();
  const covImage = async (x, D) => {
    if (x.k === 'img') return square('/_blob/' + x.id, 600);
    const key = x.c + '|' + (x.L || ''); if (covImgCache.has(key)) return covImgCache.get(key);
    const r = (D.righe || []).find(y => mainC(y.c) === x.c) || { c: x.c, L: x.L };
    const p = productImage({ ...r, c: x.c }, true); covImgCache.set(key, p); return p;
  };
  function covBox(D) {
    const box = el('div', { class: 'hp-covgrid' }); const hint = el('span', { class: 'hint' });
    const fIn = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    const addSel = el('select', { 'aria-label': 'Aggiungi l\'immagine di un articolo', style: 'width:auto;max-width:280px' });
    const list = () => Array.isArray(D.cov) ? D.cov : autoCov(D);
    const own = () => { if (!Array.isArray(D.cov)) D.cov = autoCov(D); return D.cov; };
    const draw = () => {
      const L = list(); hint.textContent = Array.isArray(D.cov) ? 'Scelte a mano · ' + L.length + ' di ' + COVMAX : 'Automatiche: i prodotti principali per valore';
      box.replaceChildren(...(L.length ? L.map((x, i) => {
        const im = el('div', { class: 'hp-covimg' }, el('span', { class: 'spin' }));
        covImage(x, D).then(d => im.replaceChildren(d ? el('img', { src: d, alt: x.k === 'img' ? x.name || 'immagine' : x.c }) : el('span', { class: 'hint' }, 'nessuna immagine')));
        const mv = (dlt) => { const a = own(); const j = i + dlt; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; draw(); };
        return el('div', { class: 'hp-covit' }, im, el('small', { class: 'mono', style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.68rem', title: x.k === 'img' ? x.name : x.c }, x.k === 'img' ? '📎 ' + (x.name || 'immagine') : x.c), el('div', { class: 'row', style: 'gap:2px;justify-content:center;flex-wrap:nowrap' },
          el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Sposta a sinistra', disabled: i === 0, onclick: () => mv(-1) }, '←'),
          el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Sposta a destra', disabled: i === L.length - 1, onclick: () => mv(1) }, '→'),
          el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Togli dalla copertina', title: 'Togli dalla copertina', onclick: () => { own().splice(i, 1); draw(); } }, '✕')));
      }) : [el('p', { class: 'hint', style: 'margin:0' }, 'Nessuna immagine in copertina.')]));
      const used = new Set(L.filter(x => x.k === 'art').map(x => x.c));
      const codes = [...new Map((D.righe || []).filter(r => r.c && !used.has(mainC(r.c))).map(r => [mainC(r.c), r])).values()];
      addSel.replaceChildren(el('option', { value: '' }, codes.length ? '+ Immagine di un articolo…' : 'Tutti gli articoli sono già in copertina'), ...codes.map(r => el('option', { value: mainC(r.c) }, mainC(r.c))));
      addSel.disabled = !codes.length || L.length >= COVMAX;
    };
    addSel.addEventListener('change', () => { const c = addSel.value; if (!c) return; const r = (D.righe || []).find(y => mainC(y.c) === c); const a = own(); if (a.length >= COVMAX) { toast('In copertina ci stanno al massimo ' + COVMAX + ' immagini.', 'bad'); return; } a.push({ k: 'art', c, L: r && r.L }); draw(); });
    fIn.addEventListener('change', async () => { const fs = [...fIn.files]; fIn.value = ''; for (const f of fs) { const a = own(); if (a.length >= COVMAX) { toast('In copertina ci stanno al massimo ' + COVMAX + ' immagini.', 'bad'); break; }
      try { const r = await assets.upload(f, { type: f.type || 'image/jpeg' }); a.push({ k: 'img', id: r.id, name: f.name }); draw(); } catch (e) { toast('Caricamento di «' + f.name + '» non riuscito', 'bad'); } } });
    draw();
    return el('div', { class: 'fld full' }, el('span', { class: 'row between', style: 'gap:8px;flex-wrap:wrap' }, el('span', {}, 'Immagini di copertina ', hint),
      el('span', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, addSel, typeof assets !== 'undefined' && assets ? btn('Carica immagine', () => fIn.click(), 'sm ghost', 'up') : null, btn('Automatiche', () => { D.cov = null; draw(); }, 'sm ghost', 'spark'))), box, fIn);
  }
  if (!document.getElementById('hpCovCss')) document.head.append(el('style', { id: 'hpCovCss' }, '.hp-covgrid{display:flex;gap:10px;flex-wrap:wrap}.hp-covit{width:132px;display:flex;flex-direction:column;gap:4px}.hp-covimg{width:132px;height:132px;border:1px solid var(--line);border-radius:10px;display:grid;place-items:center;overflow:hidden;background:#fff}.hp-covimg img{width:100%;height:100%;object-fit:contain}.hp-covit .icon-btn{width:26px;height:26px;min-width:26px}'));

  /* ---------- PDF allegati (schede tecniche, disegni, report): pagine disegnate in coda all'offerta ---------- */
  async function pdfPagesFrom(buf, say, label) {
    await loadScript(PDFJS); await loadScript(PDFW); pdfjsLib.GlobalWorkerOptions.workerSrc = window.HP_PDFW || PDFW;
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise; const out = [];
    for (let p = 1; p <= Math.min(pdf.numPages, 40); p++) {
      say && say(label + ' · pagina ' + p + ' di ' + pdf.numPages);
      const pg = await pdf.getPage(p); const b = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: 2 });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: g, viewport: vp }).promise; out.push({ d: c.toDataURL('image/jpeg', 0.86), w: b.width, h: b.height });
    }
    return out;
  }
  async function fetchBuf(u) {
    const same = u.startsWith('/');
    const r = await fetch(same ? u : '/api/fetch?u=' + encodeURIComponent(u), { credentials: 'same-origin' });
    if (!r.ok) throw new Error('file non scaricabile (' + r.status + ')'); return await r.arrayBuffer();
  }

  /* ---------- il PDF ---------- */
  async function build(o, opt, say) {
    say('Preparo l\'offerta…');
    if (!window.jspdf) await loadScript(JSPDF); if (!window.jspdf.jsPDF.API.autoTable) await loadScript(AT);
    const doc = window.hpPdfSafeDoc ? hpPdfSafeDoc(new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' })) : new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }); if (window.hpPdfFont) await hpPdfFont(doc); const W = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    const com = S.commesse.get(o.commessaId), cli = S.clienti.get(o.clienteId) || {}; const P0 = o.pdf || {}; const M = P0.meta || {}; const C = P0.cliente || {};
    const hik = await logo('/brand-hikvision.png', 900) || await logo('/hik-logo.png', 900); const pav = await logo('/proav-mark.png', 1200, true) || await logo('/proav-logo.png', 1200, true); const nlg = await logo('/proav-hik-logo.png', 1200);
    const num = o.numero || '—'; const dt = o.data ? o.data.split('-').reverse().join('/') : new Date().toLocaleDateString('it-IT');
    const cliName = cli.nome || C.nome || 'Cliente'; const rif = o.titolo || M.riferimento || (com ? com.nome : '');
    const me = (S.team && S.team.get(o.by || S.me)) || {}; const red = { n: M.redatto || nm(o.by || S.me), e: M.redattoEmail || me.email || (typeof mailOf === 'function' ? mailOf(o.by || S.me) : '') || '', t: M.redattoTel || me.tel || '' };
    const T = (txt, x, y, op = {}) => { doc.setFont('helvetica', op.b ? 'bold' : op.i ? 'italic' : 'normal'); doc.setFontSize(op.s || 9); doc.setTextColor(...(op.c || INK)); doc.text(String(txt ?? ''), x, y, op.a ? { align: op.a } : undefined); };
    // maiuscoletto: maiuscole piene per le iniziali, maiuscole ridotte per il resto
    const smallCaps = (txt, cx, y, size, color, bold, left) => {
      const parts = []; for (const ch of String(txt)) { const low = ch !== ch.toUpperCase(); parts.push([ch.toUpperCase(), low ? size * 0.78 : size]); }
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); let w = 0; for (const [ch, s] of parts) { doc.setFontSize(s); w += doc.getTextWidth(ch); }
      let x = left ? cx : cx - w / 2; doc.setTextColor(...color); for (const [ch, s] of parts) { doc.setFontSize(s); doc.text(ch, x, y); x += doc.getTextWidth(ch); }
    };
    const fitCaps = (txt, cx, y, size, color, bold, maxW, left) => { let s = size; doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(s); while (doc.getTextWidth(String(txt).toUpperCase()) * 0.9 > maxW && s > 8) { s -= 0.5; doc.setFontSize(s); } smallCaps(txt, cx, y, s, color, bold, left); };
    // tabelle con gli angoli esterni arrotondati: dopo autoTable si coprono gli spigoli e si ridisegna il bordo, pagina per pagina
    const RAD = 2.4; let tb = null;
    const tHooks = { willDrawPage: () => { }, didDrawCell: d => { const p = doc.internal.getCurrentPageInfo().pageNumber; const b = tb[p] || (tb[p] = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }); b.x0 = Math.min(b.x0, d.cell.x); b.y0 = Math.min(b.y0, d.cell.y); b.x1 = Math.max(b.x1, d.cell.x + d.cell.width); b.y1 = Math.max(b.y1, d.cell.y + d.cell.height); } };
    const roundTables = () => { const cur = doc.internal.getCurrentPageInfo().pageNumber; for (const [p, b] of Object.entries(tb)) { doc.setPage(+p); const w = b.x1 - b.x0, h = b.y1 - b.y0; doc.setDrawColor(255, 255, 255); doc.setLineWidth(RAD * 1.2); doc.roundedRect(b.x0 - RAD * 0.6, b.y0 - RAD * 0.6, w + RAD * 1.2, h + RAD * 1.2, RAD + RAD * 0.6, RAD + RAD * 0.6, 'S'); doc.setDrawColor(170, 174, 182); doc.setLineWidth(.3); doc.roundedRect(b.x0, b.y0, w, h, RAD, RAD, 'S'); } doc.setPage(cur); };
    const lines = o.righe || [];
    // logo Hikvision con sotto il logo ProAV, largo dalla «K» alla «I» di «sion» (22,8% → 69,3% della larghezza del logo Hikvision)
    const K0 = 0.228, I1 = 0.693;
    const lockup = (x, y0, w) => { if (nlg) { const ww = w * 0.86; doc.addImage(nlg.d, 'PNG', x, y0, ww, ww * nlg.r); return y0 + ww * nlg.r; } let yy = y0; if (hik) { doc.addImage(hik.d, 'PNG', x, yy, w, w * hik.r); yy += w * hik.r + w * 0.045; } if (pav) { const pw = w * (I1 - K0); doc.addImage(pav.d, 'PNG', x + (w - pw) / 2, yy, pw, pw * pav.r); yy += pw * pav.r; } return yy; };

    /* misure prese dal modello Word dell'offerta: margini 17,6 mm, interlinea «multipla» di Word, spaziature in punti */
    const PT = 25.4 / 72, MG = 17.64, CW = W - 2 * MG, LH = 1.362; // LH: altezza riga singola di Open Sans in em
    const PARA = (txt, y0, op = {}) => { // paragrafo: restituisce la y sotto il paragrafo (spazio dopo incluso)
      const s = op.s || 10, mult = op.mult || 1, x = op.x ?? MG, w = op.w ?? CW, lh = s * PT * LH * mult; let yy = y0 + (op.before || 0) * PT;
      doc.setFont('helvetica', op.b ? 'bold' : op.i ? 'italic' : 'normal'); doc.setFontSize(s); doc.setTextColor(...(op.c || INK));
      const pars = String(txt ?? '').split('\n');
      for (const par of pars) { const ls = par ? doc.splitTextToSize(par, w) : ['']; ls.forEach((l, k) => { const base = yy + s * PT * (1.069 + (mult - 1) * LH * 0.5);
        if (op.a === 'j' && k < ls.length - 1 && /\s/.test(l.trim())) { const ws = l.trim().split(/\s+/); const tw = ws.reduce((a, q) => a + doc.getTextWidth(q), 0); const gap = (w - tw) / (ws.length - 1); let xx = x; ws.forEach(q => { doc.text(q, xx, base); xx += doc.getTextWidth(q) + gap; }); }
        else doc.text(l, op.a === 'c' ? x + w / 2 : op.a === 'r' ? x + w : x, base, op.a === 'c' ? { align: 'center' } : op.a === 'r' ? { align: 'right' } : undefined);
        yy += lh; }); }
      return yy + (op.after || 0) * PT; };
    const BLANK = (y0, s = 10, mult = 1, after = 0) => y0 + s * PT * LH * mult + after * PT;
    const logoAt = (x, y0, w) => { if (nlg) { doc.addImage(nlg.d, 'PNG', x, y0, w, w * nlg.r); return y0 + w * nlg.r; } return lockup(x, y0, w / 0.86); };

    /* 1 · copertina */
    let y = MG;
    y = logoAt((W - 69.6) / 2, y, 69.6) + 2 * PT;
    y = BLANK(y, 10, 1.15, 10); y = BLANK(y, 10, 1.15, 10);
    y = PARA('Offerta riservata per', y, { s: 10, c: GREY });
    y = PARA(cliName.toUpperCase(), y, { s: 14, b: true, c: DARK });
    y = BLANK(y, 10);
    if (rif) { y = PARA('Riferimento', y, { s: 10, c: GREY }); y = PARA(rif, y, { s: 12, c: DARK }); }
    y = PARA(num + ' del ' + dt, y, { s: 8, c: GREY });
    y = BLANK(y, 10); y = BLANK(y, 10);
    const intro = String(o.intro || '').trim();
    if (intro) for (const par of intro.split(/\n\s*\n|\n/).map(x => x.trim()).filter(Boolean)) y = PARA(par, y, { s: 10, mult: 1.375, a: 'j', after: 8 });
    y += 4;
    // immagini dei prodotti (fino a 4, i prodotti principali per valore)
    say('Cerco le immagini dei prodotti…');
    const covList = Array.isArray(o.cov) ? o.cov : autoCov(o);
    const covImgs = (await Promise.all(covList.slice(0, COVMAX).map(x => covImage(x, o).catch(() => null)))).filter(Boolean);
    if (covImgs.length) {
      const n = covImgs.length; const gap = 6; const room = Math.max(30, PH - 24 - y); const sz = Math.min(42, (CW - gap * (n - 1)) / n, room);
      let x = (W - (n * sz + (n - 1) * gap)) / 2; const yy = Math.min(PH - 22 - sz, Math.max(y, PH - 30 - sz - 10));
      for (const d of covImgs) { doc.setDrawColor(225, 228, 234); doc.setLineWidth(.2); doc.roundedRect(x, yy, sz, sz, 2, 2); doc.addImage(d, 'JPEG', x + 1, yy + 1, sz - 2, sz - 2); x += sz + gap; }
    }

    /* 2 · offerta con anteprime */
    doc.addPage(); y = MG;
    y = logoAt(MG, y, 52.5) + 2 * PT; y = BLANK(y, 10, 1.15, 6);
    y = PARA('Offerta', y, { s: 11, c: RED, mult: 1.15, after: 2 }); y = PARA(num + ' del ' + dt + (rif ? ' · ' + rif : ''), y, { s: 8, c: GREY, mult: 1.15, after: 6 });
    const y2 = y;
    say('Preparo le anteprime…');
    const thumbs = await Promise.all(lines.map(r => productImage({ ...r, c: mainC(r.c) }, false)));
    const longD = r => { if (r.dx) return r.dx; const it = fc(r.c, r.L); if (r.c.includes(' + ') && it && it.d) return it.d; return it && it.d && (!r.b || r.b === it.b) ? it.d : (r.b || (it && it.d) || ''); };
    const body = [], imgAt = new Map(); let sez = null;
    lines.forEach((r, i) => {
      if ((r.sez || '') !== sez) { sez = r.sez || ''; if (sez) body.push([{ content: sez, colSpan: 6, styles: { fontStyle: 'bold', fillColor: SECF, textColor: DARK } }]); }
      const it = fc(r.c, r.L) || {}; const t = lineTot(r);
      imgAt.set(body.length, thumbs[i]);
      body.push(['', { content: it.sap || r.sap || '', styles: { fontStyle: 'normal' } }, { content: r.c, styles: { fontStyle: 'bold', textColor: DARK } }, { content: String(r.q), styles: { halign: 'center' } }, { content: eur(t.unit), styles: { halign: 'right' } }, { content: eur(t.netto), styles: { halign: 'right', textColor: RED, fontStyle: 'bold' } }]);
      body.push([{ content: longD(r) + (r.net ? ' (prezzo netto)' : ''), colSpan: 6, styles: { fontSize: 7.5, textColor: INK, cellPadding: { top: 0.9, bottom: 2.2, left: 1.4, right: 1.4 } } }]);
    });
    tb = {}; doc.autoTable({ startY: y2, head: [['', 'SAP', 'Codice', 'Q.tà', 'Prezzo Cad.', 'Totale']], body, margin: { left: MG, right: MG, bottom: 22, top: MG }, theme: 'grid', rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: { top: 0.9, bottom: 0.9, left: 1.4, right: 1.4 }, textColor: INK, lineColor: LINEC, lineWidth: 0, valign: 'middle' },
      headStyles: { fillColor: HEADF, textColor: DARK, fontStyle: 'bold', halign: 'center', lineWidth: 0 },
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 24 }, 3: { cellWidth: 13 }, 4: { cellWidth: 26 }, 5: { cellWidth: 28 } },
      didParseCell: d => { if (d.section === 'body' && imgAt.has(d.row.index) && d.column.index === 0) d.cell.styles.minCellHeight = 22; },
      didDrawCell: d => { tHooks.didDrawCell(d); if (d.section === 'head') { doc.setDrawColor(...LINEC); doc.setLineWidth(.2); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); } if (d.section === 'body' && d.column.index === 0 && imgAt.get(d.row.index)) { const s = Math.min(d.cell.width, d.cell.height) - 2; doc.addImage(imgAt.get(d.row.index), 'JPEG', d.cell.x + (d.cell.width - s) / 2, d.cell.y + (d.cell.height - s) / 2, s, s); } } });
    roundTables();
    const Tt = offTot(lines); const iva = Math.round(Tt.N * 22) / 100;
    y = doc.lastAutoTable.finalY + 8; if (y > PH - 40) { doc.addPage(); y = 25; }
    const tot = (l, v, b, vr) => { T(l, W - MG - 34, y, { a: 'right', s: b ? 10 : 8, b, c: b ? DARK : INK }); T(v, W - MG, y, { a: 'right', s: b ? 10 : 8, b: true, c: vr ? RED : DARK }); y += b ? 6.5 : 5.2; };
    tot('Subtotale', eur(Tt.N), false, true); tot('IVA (22%)', eur(iva)); tot('Totale offerta', eur(Tt.N + iva), true);

    /* 3 · copertina «Modulo Conferma d'ordine» */
    doc.addPage(); y = MG;
    logoAt((W - 69.6) / 2, y, 69.6);
    y = 105; y = PARA('Modulo Conferma d\'ordine', y, { s: 24, b: true, c: DARK, after: 6 });
    y = PARA(cliName.toUpperCase(), y, { s: 14, b: true, c: DARK }); y = PARA('Offerta ' + num + ' del ' + dt, y, { s: 8, c: GREY });

    /* 4 · modulo d'ordine (come il modello Word) */
    doc.addPage(); y = MG;
    y = logoAt(MG, y, 52.5) + 2 * PT; y = BLANK(y, 10, 1.15, 6);
    const cl = [cliName, [cli.indirizzo || C.indirizzo, [cli.cap || C.cap, cli.citta || C.citta].filter(Boolean).join(' '), cli.prov || C.prov].filter(Boolean).join(', '), (cli.piva || C.piva) ? 'P.IVA ' + (cli.piva || C.piva) : '', cli.referente ? 'Alla c.a. ' + cli.referente : ''].filter(Boolean);
    { const cx1 = MG + 1.4, cx2 = MG + 95.25 + 1.4, cw2 = CW - 95.25 - 2.8; let ya = y + 0.9, yb = y + 0.9; const o11 = { s: 10, mult: 1.15, after: 1 };
      ya = PARA('Partner contrattuale:', ya, { ...o11, i: true, x: cx1 }); for (const t of ['HIKVISION ITALY Srl', 'Sede legale: Viale Fulvio Testi, 113', '20092 Cinisello Balsamo (MI)']) ya = PARA(t, ya, { ...o11, x: cx1 });
      yb = PARA('Spett.le', yb, { ...o11, x: cx2, w: cw2 }); for (const t of cl) yb = PARA(t, yb, { ...o11, x: cx2, w: cw2 });
      y = Math.max(ya, yb) + 0.9; }
    y = PARA('Offerta commerciale', y, { s: 11, c: RED, mult: 1.15, before: 14, after: 6 });
    const kv = (k, v) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); const kw = doc.getTextWidth(k + '  '); PARA(k, y, { s: 10, b: true, mult: 1.15 }); y = PARA(v, y, { s: 10, mult: 1.15, after: 2, x: MG + kw, w: CW - kw }); };
    kv('Offerta numero:', num + ' del ' + dt); kv('Redatta da:', [red.n, red.e, red.t ? 'Tel. ' + red.t : ''].filter(Boolean).join(' · ')); if (rif) kv('Riferimento:', rif);
    y = PARA('Come da vostra gentile richiesta siamo a sottoporre alla vostra attenzione la nostra migliore offerta per la fornitura dei materiali di seguito elencati.', y, { s: 8, mult: 1.15, before: 8, after: 2 });
    y = PARA('Resta escluso quanto non esplicitamente descritto.', y, { s: 8, b: true, mult: 1.15, after: 6 });
    const anySc = lines.some(r => !(r.net || r.noList) && (+(r.sc1 ?? r.sc) > 0)); const anyEx = lines.some(r => +r.sc2 > 0);
    const showSc = opt.sc && anySc, showEx = opt.sc && anyEx, showL = opt.lst && lines.some(r => !r.noList && +r.p > 0);
    const head = ['Codice', 'Descrizione', 'Q.tà', ...(showL ? ['Listino Cad.'] : []), ...(showSc ? ['Sc %'] : []), ...(showEx ? ['Ex %'] : []), 'Prezzo Cad.', 'Prezzo Tot.'];
    const nC = head.length; const sb = []; sez = null;
    for (const r of lines) {
      if ((r.sez || '') !== sez) { sez = r.sez || ''; if (sez) sb.push([{ content: sez, colSpan: nC, styles: { fontStyle: 'bold', fillColor: SECF } }]); }
      const t = lineTot(r); const net = r.net || r.noList; const s2 = +r.sc2 || 0, s1 = s2 ? (r.sc1 ?? r.sc) : r.sc;
      sb.push([hpCodeLines(r.c).join('\n'), String(r.b || (fc(r.c, r.L) || {}).b || '').slice(0, 160) + (r.net ? ' (prezzo netto)' : ''), String(r.q), ...(showL ? [net ? '' : eur(r.p)] : []), ...(showSc ? [r.ncHide ? '' : net ? 'NETTO' : (+s1 ? fN.format(Math.round(+s1 * 100) / 100) : '-')] : []), ...(showEx ? [r.ncHide ? '' : net ? '-' : s2 ? fN.format(s2) : '-'] : []), eur(t.unit), eur(t.netto)]);
    }
    const lab = (t, extra) => ({ content: t, colSpan: nC - 1, styles: { halign: 'right', fontStyle: 'normal', fontSize: 8, textColor: INK, ...(extra || {}) } });
    const foot = [[lab('Subtotale'), { content: eur(Tt.N), styles: { halign: 'right', textColor: RED, fontStyle: 'bold', fontSize: 8 } }], [lab('IVA (22%)'), { content: eur(iva), styles: { halign: 'right', fontStyle: 'bold', fontSize: 8 } }],
      [lab('Totale offerta', { fillColor: TOTF, fontStyle: 'bold', textColor: DARK, fontSize: 9 }), { content: eur(Tt.N + iva), styles: { halign: 'right', fontStyle: 'bold', fillColor: TOTF, textColor: DARK, fontSize: 9 } }]];
    const cs = { 0: { cellWidth: 37, fontStyle: 'bold', overflow: 'visible' }, 2: { cellWidth: 9.9, halign: 'center' } }; let k = 3; if (showL) cs[k++] = { cellWidth: 20.3, halign: 'right' }; if (showSc) cs[k++] = { cellWidth: 11.3, halign: 'center' }; if (showEx) cs[k++] = { cellWidth: 10.6, halign: 'center' }; cs[k++] = { cellWidth: 20.3, halign: 'right' }; cs[k] = { cellWidth: 22, halign: 'right', textColor: RED };
    tb = {}; doc.autoTable({ didDrawCell: tHooks.didDrawCell, startY: y, head: [head], body: [...sb, ...foot], margin: { left: MG, right: MG, bottom: 22, top: MG }, theme: 'grid', rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: { top: 0.9, bottom: 0.9, left: 1.4, right: 1.4 }, textColor: INK, lineColor: LINEC, lineWidth: .15, valign: 'top' },
      headStyles: { fillColor: HEADF, textColor: DARK, fontStyle: 'bold', halign: 'center', lineColor: LINEC, lineWidth: .2 }, columnStyles: cs });
    roundTables();
    y = doc.lastAutoTable.finalY + 20 * PT + 4 * PT; if (y > PH - 45) { doc.addPage(); y = MG; }
    { const c1 = MG, w1 = 63.5, c2 = MG + 63.5, w2 = 45.9, c3 = MG + 63.5 + 45.9, w3 = CW - 63.5 - 45.9;
      let ys = logoAt(c1 + (w1 - 32) / 2, y + 0.9, 32) + 2 * PT; PARA('HIKVISION ITALY SRL', ys, { s: 7, a: 'c', x: c1, w: w1, mult: 1.15 });
      const yl = y + 0.9 + 30 * PT + 8 * PT * LH * 1.15 - 1.2; doc.setDrawColor(150, 150, 150); doc.setLineWidth(.2); doc.line(c2 + 8, yl, c2 + w2 - 8, yl); doc.line(c3 + 9, yl, c3 + w3 - 9, yl);
      PARA('Luogo e data', yl + 1, { s: 7, a: 'c', x: c2, w: w2, mult: 1.15 }); PARA('Il committente (timbro/firma)', yl + 1, { s: 7, a: 'c', x: c3, w: w3, mult: 1.15 }); }

    /* 5 · condizioni, con il riquadro delle note */
    doc.addPage(); y = MG;
    const cond = P0.cond || {}; const cf = (typeof cfg === 'function' ? cfg() : {}) || {};
    const pick = rx => { for (const [kk, v] of Object.entries(cond)) if (rx.test(kk)) return String(v).trim(); return ''; };
    const block = (title, ls) => { y = PARA(title, y, { s: 8, b: true, c: RED, mult: 1.15, before: 6, after: 4 }); ls.forEach(l => { y = PARA(l, y, { s: 8, mult: 1.15, after: 2 }); }); y = BLANK(y, 9, 1.15, 6); };
    block('TEMPI DI CONSEGNA', [o.consegna || pick(/consegn/i) || '---']);
    block('VALIDITÀ DELL\'OFFERTA', [window.hpValidTxt ? hpValidTxt(o) : 'La presente Offerta ha validità ' + (o.valid || 30) + ' giorni.']);
    block('COSTI DI SPEDIZIONE', [o.spedizione || 'Sono esclusi i costi di spedizione se non indicati.']);
    block('CONDIZIONI DI PAGAMENTO', [o.pagamento || pick(/pagament/i) || '-', 'Tutti i prezzi indicati si intendono IVA esclusa.']);
    y = PARA('NOTE AGGIUNTIVE', y, { s: 8, b: true, c: RED, mult: 1.15, before: 6, after: 4 });
    const note = String(o.note || '').replace(/^(tempi di consegna|validit[aà][^:]*|condizioni di pagamento|banca|iban|beneficiario)\s*:.*$/gim, '').trim();
    { const y0 = y; let ny = y + 1.6; if (note) note.split('\n').forEach(l => { ny = PARA(l, ny, { s: 8, mult: 1.15, after: 2, x: MG + 2.4, w: CW - 4.8 }); }); const bh = Math.max(22, ny - y0 + 1.6);
      doc.setDrawColor(...LINEC); doc.setLineWidth(.3); doc.roundedRect(MG, y0, CW, bh, RAD, RAD); y = y0 + bh + 8; }
    ['Immagini e descrizioni dei prodotti presenti nell\'offerta sono indicativi e potrebbero contenere inesattezze.', 'Per maggiori dettagli, vi preghiamo di consultare le schede tecniche dei prodotti sui siti web ufficiali o di contattare il personale Hikvision e i partner di distribuzione autorizzati.'].forEach(l => { y = PARA(l, y, { s: 7.5, mult: 1.15, after: 2, c: GREY }); });

    // piè di pagina delle pagine dell'offerta (non sulle copertine)
    const nOff = doc.internal.getNumberOfPages(); const covers = new Set([1, 3]);
    for (let p = 1; p <= nOff; p++) {
      if (covers.has(p)) continue; doc.setPage(p); const fy = PH - 10;
      T('Prev. ', 4, fy, { s: 6.5 }); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RED); doc.text(num, 4 + doc.getTextWidth('Prev. '), fy);
      T(HQ, W / 2, fy - 1.5, { a: 'center', s: 6 });
      const pg = p + '/' + nOff; doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); const wPg = doc.getTextWidth(pg); T('Pag. ', W - 4 - wPg, fy, { a: 'right', s: 6.5 }); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RED); doc.text(String(p), W - 4 - wPg, fy); doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK); doc.text('/' + nOff, W - 4 - wPg + doc.getTextWidth(String(p)), fy);
    }

    /* 6 · schede tecniche e allegati (disegni, simulazioni, report HiTools Designer) */
    const extra = [];
    for (const a of opt.attach) {
      try { say('Aggiungo ' + a.label + '…'); const buf = a.file ? await a.file.arrayBuffer() : await fetchBuf(a.url); const pages = await pdfPagesFrom(buf, say, a.label); extra.push(...pages); }
      catch (e) { toast('Non ho potuto aggiungere «' + a.label + '»: ' + e.message, 'bad'); }
    }
    for (const pg of extra) { const land = pg.w > pg.h; doc.addPage('a4', land ? 'l' : 'p'); const PW = land ? 297 : 210, PHh = land ? 210 : 297, m = 6; const k = Math.min((PW - 2 * m) / pg.w, (PHh - 2 * m) / pg.h); const iw = pg.w * k, ih = pg.h * k; doc.addImage(pg.d, 'JPEG', (PW - iw) / 2, (PHh - ih) / 2, iw, ih, undefined, 'FAST'); }
    say('Salvo il PDF…');
    window.hpDlReady(doc.output('blob'), ('Prev_' + num + '_' + cliName).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').toLowerCase() + '_hikvision_proav.pdf');
  }

  /* ---------- finestra di esportazione (ProAV) ---------- */
  window.exportOffer = function (o) {
    const dsBox = el('div', { class: 'stack', style: 'gap:6px' }), atBox = el('div', { class: 'stack', style: 'gap:6px' });
    const prog = el('div', { class: 'row', style: 'gap:8px', hidden: true }, el('span', { class: 'spin' }), el('span', {}));
    const say = t => { prog.hidden = false; prog.lastChild.textContent = t; };
    // schede tecniche: tradotta in italiano se c'è, altrimenti il PDF della scheda prodotto; se manca si può caricare
    const codes = [...new Map((o.righe || []).map(r => [mainC(r.c), r])).values()];
    const ds = codes.map(r => ({ c: mainC(r.c), r, st: 'cerco', url: null, file: null, on: true }));
    const drawDs = () => dsBox.replaceChildren(...(ds.length ? ds.map(x => {
      const fIn = el('input', { type: 'file', accept: '.pdf', hidden: true, onchange: async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; x.file = f; x.st = 'caricato'; x.on = true; x.saving = true; drawDs();
        try { if (typeof assets !== 'undefined' && assets) { const r = await assets.upload(f, { type: 'application/pdf' }); const D = { code: x.c, pdf: r.id, name: f.name, by: S.me, at: Date.now() }; await put('dsman', dsKey(x.c), D); DSMAN.set(dsKey(x.c), D); x.url = '/_blob/' + r.id; x.file = null; x.fname = f.name; } } catch (err) { console.warn(err); toast('Scheda di ' + x.c + ' usata per questa offerta, ma non salvata: ' + (err.message || err), 'bad'); }
        x.saving = false; drawDs(); } });
      const stTxt = { cerco: 'cerco la scheda…', it: '🇮🇹 scheda tradotta in italiano', orig: '🇬🇧 scheda originale (dal sito Hikvision)', caricato: '📎 ' + (x.file ? x.file.name : x.fname || '') + (x.saving ? ' · salvo…' : ''), man: '📎 ' + (x.fname || 'scheda caricata') + ' · salvata', no: 'non trovata' }[x.st];
      return el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, el('label', { class: 'row', style: 'gap:6px' }, el('input', { type: 'checkbox', checked: x.on && x.st !== 'no' && x.st !== 'cerco', disabled: x.st === 'no' || x.st === 'cerco', onchange: e => { x.on = e.target.checked; } }), el('b', { class: 'mono' }, x.c)),
        el('span', { class: 'hint', style: x.st === 'no' ? 'color:var(--accent)' : '' }, stTxt), x.st === 'no' || x.st === 'orig' || x.st === 'man' || x.st === 'caricato' ? btn(x.st === 'no' ? 'Carica PDF' : 'Usa un altro PDF', () => fIn.click(), 'sm ghost', 'up') : null,
        x.st === 'no' ? el('a', { class: 'hint', href: 'https://www.google.com/search?q=' + encodeURIComponent('site:hikvision.com ' + x.c + ' datasheet filetype:pdf'), target: '_blank', rel: 'noopener' }, 'cercala su Google ↗') : null, fIn);
    }) : [el('p', { class: 'hint', style: 'margin:0' }, 'Nessun articolo nell\'offerta.')]));
    drawDs();
    ds.forEach(async x => {
      try {
        const D = S.dsTrad && window.hpDsKey ? S.dsTrad.get(hpDsKey(x.c)) : null;
        const Mn = DSMAN.get(dsKey(x.c));
        if (D && D.pdf) { x.st = 'it'; x.url = '/_blob/' + D.pdf; }
        else if (Mn && Mn.pdf) { x.st = 'man'; x.url = '/_blob/' + Mn.pdf; x.fname = Mn.name; }
        else { const it = fc(x.c, x.r.L) || {}; const u = it.url ? await withTimeout(window.hpFindDsPdf ? hpFindDsPdf(x.c, it.url, () => { }) : Promise.resolve([]), 15000) : null; if (u && u.length) { x.st = 'orig'; x.url = u[0]; } else { x.st = 'no'; x.on = false; } }
      } catch (e) { x.st = 'no'; x.on = false; }
      drawDs();
    });
    // allegati PDF della commessa (disegni, simulazioni, report HiTools Designer) + PDF caricati al momento
    const extra = [];
    const drawAt = files => {
      const pdfs = (files || []).filter(f => /pdf/i.test(f.type || '') || /\.pdf$/i.test(f.name || ''));
      const add = el('input', { type: 'file', accept: '.pdf', multiple: true, hidden: true, onchange: e => { for (const f of e.target.files) extra.push({ label: f.name, file: f, on: true }); e.target.value = ''; drawAt(files); } });
      atBox.replaceChildren(...pdfs.map(f => { f.on = f.on ?? !/offert|prev/i.test((f.cat || '') + ' ' + f.name); return el('label', { class: 'row', style: 'gap:6px' }, el('input', { type: 'checkbox', checked: f.on, onchange: e => { f.on = e.target.checked; } }), el('span', {}, f.name), f.cat ? el('span', { class: 'hint' }, '· ' + f.cat) : null); }),
        ...extra.map(x => el('label', { class: 'row', style: 'gap:6px' }, el('input', { type: 'checkbox', checked: x.on, onchange: e => { x.on = e.target.checked; } }), el('span', {}, '📎 ' + x.label))),
        el('div', { class: 'row', style: 'gap:8px' }, btn('Aggiungi PDF (disegno, simulazione, report HiTools Designer)', () => add.click(), 'sm ghost', 'up'), add),
        !pdfs.length && !extra.length ? el('p', { class: 'hint', style: 'margin:0' }, o.commessaId ? 'Nessun PDF tra gli allegati della commessa.' : 'L\'offerta non è collegata a una commessa: puoi aggiungere i PDF qui.') : null);
      atBox._files = pdfs;
    };
    drawAt([]);
    if (o.commessaId && typeof db !== 'undefined' && db) { try { const un = db.collection('commesse/' + o.commessaId + '/allegati').onSnapshot(s => { drawAt(s.docs.map(d => ({ id: d.id, ...d.data() }))); }, () => { }); setTimeout(() => { try { un && un(); } catch (e) { } }, 4000); } catch (e) { } }
    const X = window.hpExportOpts(o);
    const m = modal('Esporta offerta ' + (o.numero || ''), el('div', { class: 'stack' }, X.node,
      el('h4', { style: 'margin:6px 0 0' }, 'Schede tecniche in coda'), dsBox,
      el('h4', { style: 'margin:6px 0 0' }, 'Disegni, simulazioni e report HiTools Designer'), atBox, prog),
      [el('span', { class: 'grow' }), btn('Annulla', () => m.close()),
        btn('Excel', () => { const R = X.read(); m.close(); window.hpOffXlsx && hpOffXlsx(R.o, R.sc, R.lst); }, '', 'dl'),
        btn('Word', async () => { const R = X.read(); m.close(); if (window.hpOffDocx) await hpOffDocx(R.o, R.sc, R.lst, true); }, '', 'doc'),
        btn('PDF', async () => {
          const R = X.read();
          const attach = [...ds.filter(x => x.on && (x.url || x.file)).map(x => ({ label: 'scheda ' + x.c, url: x.url, file: x.file })), ...(atBox._files || []).filter(f => f.on).map(f => ({ label: f.name, url: '/_blob/' + f.id })), ...extra.filter(x => x.on)];
          try { await build(R.o, { sc: R.sc, lst: R.lst, attach }, say); m.close(); } catch (e) { console.error(e); toast('PDF non creato: ' + (e.message || e), 'bad'); prog.hidden = true; }
        }, 'pri', 'doc')], { wide: true });
  };
  window.hpPavOfferBuild = build; window.hpPavProdImg = productImage;
  // per il Word: immagini di copertina e descrizione estesa come nel PDF
  window.hpPavCovData = async o => (await Promise.all((Array.isArray(o.cov) ? o.cov : autoCov(o)).slice(0, COVMAX).map(x => covImage(x, o).catch(() => null)))).filter(Boolean);
  window.hpPavLongD = r => { if (r.dx) return r.dx; const it = fc(r.c, r.L); if (String(r.c).includes(' + ') && it && it.d) return it.d; return it && it.d && (!r.b || r.b === it.b) ? it.d : (r.b || (it && it.d) || ''); };
  window.hpPavMainC = mainC;
})();
