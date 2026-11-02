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
  const eur = v => '€ ' + (+v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    return el('div', { class: 'fld full' }, el('span', { class: 'row between', style: 'gap:8px' }, el('span', {}, 'Testo introduttivo (copertina dell\'offerta ProAV)'), b), ta);
  };

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
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }); const W = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    const com = S.commesse.get(o.commessaId), cli = S.clienti.get(o.clienteId) || {}; const P0 = o.pdf || {}; const M = P0.meta || {}; const C = P0.cliente || {};
    const hik = await logo('/brand-hikvision.png', 900) || await logo('/hik-logo.png', 900); const pav = await logo('/proav-mark.png', 1200, true) || await logo('/proav-logo.png', 1200, true);
    const num = o.numero || '—'; const dt = o.data ? o.data.split('-').reverse().join('/') : new Date().toLocaleDateString('it-IT');
    const cliName = cli.nome || C.nome || 'Cliente'; const rif = o.titolo || M.riferimento || (com ? com.nome : '');
    const me = (S.team && S.team.get(o.by || S.me)) || {}; const red = { n: M.redatto || nm(o.by || S.me), e: M.redattoEmail || me.email || (typeof mailOf === 'function' ? mailOf(o.by || S.me) : '') || '', t: M.redattoTel || me.tel || '' };
    const T = (txt, x, y, op = {}) => { doc.setFont('helvetica', op.b ? 'bold' : op.i ? 'italic' : 'normal'); doc.setFontSize(op.s || 9); doc.setTextColor(...(op.c || INK)); doc.text(String(txt ?? ''), x, y, op.a ? { align: op.a } : undefined); };
    // maiuscoletto: maiuscole piene per le iniziali, maiuscole ridotte per il resto
    const smallCaps = (txt, cx, y, size, color, bold) => {
      const parts = []; for (const ch of String(txt)) { const low = ch !== ch.toUpperCase(); parts.push([ch.toUpperCase(), low ? size * 0.78 : size]); }
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); let w = 0; for (const [ch, s] of parts) { doc.setFontSize(s); w += doc.getTextWidth(ch); }
      let x = cx - w / 2; doc.setTextColor(...color); for (const [ch, s] of parts) { doc.setFontSize(s); doc.text(ch, x, y); x += doc.getTextWidth(ch); }
    };
    const fitCaps = (txt, cx, y, size, color, bold, maxW) => { let s = size; doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(s); while (doc.getTextWidth(String(txt).toUpperCase()) * 0.9 > maxW && s > 8) { s -= 0.5; doc.setFontSize(s); } smallCaps(txt, cx, y, s, color, bold); };
    // tabelle con gli angoli esterni arrotondati: dopo autoTable si coprono gli spigoli e si ridisegna il bordo, pagina per pagina
    const RAD = 2.4; let tb = null;
    const tHooks = { willDrawPage: () => { }, didDrawCell: d => { const p = doc.internal.getCurrentPageInfo().pageNumber; const b = tb[p] || (tb[p] = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }); b.x0 = Math.min(b.x0, d.cell.x); b.y0 = Math.min(b.y0, d.cell.y); b.x1 = Math.max(b.x1, d.cell.x + d.cell.width); b.y1 = Math.max(b.y1, d.cell.y + d.cell.height); } };
    const roundTables = () => { const cur = doc.internal.getCurrentPageInfo().pageNumber; for (const [p, b] of Object.entries(tb)) { doc.setPage(+p); const w = b.x1 - b.x0, h = b.y1 - b.y0; doc.setDrawColor(255, 255, 255); doc.setLineWidth(RAD * 1.2); doc.roundedRect(b.x0 - RAD * 0.6, b.y0 - RAD * 0.6, w + RAD * 1.2, h + RAD * 1.2, RAD + RAD * 0.6, RAD + RAD * 0.6, 'S'); doc.setDrawColor(170, 174, 182); doc.setLineWidth(.3); doc.roundedRect(b.x0, b.y0, w, h, RAD, RAD, 'S'); } doc.setPage(cur); };
    const lines = o.righe || [];
    // logo Hikvision con sotto il logo ProAV, largo dalla «K» alla «I» di «sion» (22,8% → 69,3% della larghezza del logo Hikvision)
    const K0 = 0.228, I1 = 0.693;
    const lockup = (x, y0, w) => { let yy = y0; if (hik) { doc.addImage(hik.d, 'PNG', x, yy, w, w * hik.r); yy += w * hik.r + w * 0.045; } if (pav) { const pw = w * (I1 - K0); doc.addImage(pav.d, 'PNG', x + (w - pw) / 2, yy, pw, pw * pav.r); yy += pw * pav.r; } return yy; };

    /* 1 · copertina */
    let y = 16;
    { const w = 96; y = lockup((W - w) / 2, y, w) + 14; }
    T('Offerta riservata per', W / 2, y, { a: 'center', s: 8, c: GREY }); y += 8;
    fitCaps(cliName, W / 2, y, 15, DARK, true, W - 40); y += 11;
    if (rif) { T('Riferimento', W / 2, y, { a: 'center', s: 8, c: GREY }); y += 7; const rl = doc.splitTextToSize(rif, W - 50); rl.slice(0, 2).forEach(l => { fitCaps(l, W / 2, y, 11.5, DARK, false, W - 40); y += 6.5; }); y += 1; }
    T(num + ' del ' + dt, W / 2, y, { a: 'center', s: 8, c: GREY }); y += 12;
    const intro = String(o.intro || '').trim();
    if (intro) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...INK); const lh = 9.5 * 0.3528 * 1.5; for (const par of intro.split(/\n\s*\n|\n/).map(x => x.trim()).filter(Boolean)) { for (const l of doc.splitTextToSize(par, W - 56)) { doc.text(l, 28, y); y += lh; } y += lh * 0.6; } y += 6; }
    // immagini dei prodotti (fino a 4, i prodotti principali per valore)
    say('Cerco le immagini dei prodotti…');
    const top = [...new Map(lines.slice().sort((a, b) => lineTot(b).netto - lineTot(a).netto).map(r => [mainC(r.c), r])).values()].slice(0, 4);
    const covImgs = (await Promise.all(top.map(r => productImage({ ...r, c: mainC(r.c) }, true)))).filter(Boolean);
    if (covImgs.length) {
      const n = covImgs.length; const gap = 6; const room = Math.max(30, PH - 24 - y); const sz = Math.min(42, (W - 40 - gap * (n - 1)) / n, room);
      let x = (W - (n * sz + (n - 1) * gap)) / 2; const yy = Math.min(PH - 22 - sz, Math.max(y, PH - 30 - sz - 10));
      for (const d of covImgs) { doc.setDrawColor(225, 228, 234); doc.setLineWidth(.2); doc.roundedRect(x, yy, sz, sz, 2, 2); doc.addImage(d, 'JPEG', x + 1, yy + 1, sz - 2, sz - 2); x += sz + gap; }
    }

    /* 2 · offerta con anteprime */
    doc.addPage(); y = 16;
    lockup(W - 14 - 52, 10, 52);
    T('Offerta', 14, 34, { s: 13, c: RED }); T(num + ' del ' + dt + (rif ? ' · ' + rif : ''), 14, 40, { s: 8, c: GREY });
    say('Preparo le anteprime…');
    const thumbs = await Promise.all(lines.map(r => productImage({ ...r, c: mainC(r.c) }, false)));
    const longD = r => { const it = fc(r.c, r.L); if (r.c.includes(' + ') && it && it.d) return it.d; return it && it.d && (!r.b || r.b === it.b) ? it.d : (r.b || (it && it.d) || ''); };
    const body = [], imgAt = new Map(); let sez = null;
    lines.forEach((r, i) => {
      if ((r.sez || '') !== sez) { sez = r.sez || ''; if (sez) body.push([{ content: sez, colSpan: 6, styles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: DARK } }]); }
      const it = fc(r.c, r.L) || {}; const t = lineTot(r);
      imgAt.set(body.length, thumbs[i]);
      body.push(['', { content: it.sap || r.sap || '', styles: { fontStyle: 'normal' } }, { content: r.c, styles: { fontStyle: 'bold', textColor: DARK } }, { content: String(r.q), styles: { halign: 'center' } }, { content: eur(t.unit), styles: { halign: 'right' } }, { content: eur(t.netto), styles: { halign: 'right', textColor: RED, fontStyle: 'bold' } }]);
      body.push([{ content: longD(r) + (r.net ? ' (prezzo netto)' : ''), colSpan: 6, styles: { fontSize: 7.3, textColor: [70, 70, 70], cellPadding: { top: 1.6, bottom: 3.2, left: 2, right: 2 } } }]);
    });
    tb = {}; doc.autoTable({ startY: 46, head: [['', 'SAP', 'Codice', 'Q.tà', 'Prezzo Cad.', 'Totale']], body, margin: { left: 14, right: 14, bottom: 22, top: 18 }, theme: 'grid', rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: [60, 60, 60], lineColor: [205, 208, 214], lineWidth: .15, valign: 'middle' },
      headStyles: { fillColor: GREY, textColor: 255, fontStyle: 'normal', halign: 'center', lineColor: [255, 255, 255], lineWidth: .4 },
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 24 }, 3: { cellWidth: 13 }, 4: { cellWidth: 26 }, 5: { cellWidth: 28 } },
      didParseCell: d => { if (d.section === 'body' && imgAt.has(d.row.index) && d.column.index === 0) d.cell.styles.minCellHeight = 22; },
      didDrawCell: d => { tHooks.didDrawCell(d); if (d.section === 'body' && d.column.index === 0 && imgAt.get(d.row.index)) { const s = Math.min(d.cell.width, d.cell.height) - 2; doc.addImage(imgAt.get(d.row.index), 'JPEG', d.cell.x + (d.cell.width - s) / 2, d.cell.y + (d.cell.height - s) / 2, s, s); } } });
    roundTables();
    const Tt = offTot(lines); const iva = Math.round(Tt.N * 22) / 100;
    y = doc.lastAutoTable.finalY + 8; if (y > PH - 40) { doc.addPage(); y = 25; }
    const tot = (l, v, b, vr) => { T(l, W - 50, y, { a: 'right', s: b ? 10.5 : 9.5, c: [80, 80, 80] }); T(v, W - 16, y, { a: 'right', s: b ? 10.5 : 9.5, b: true, c: vr ? RED : INK }); y += 7.5; };
    tot('Subtotale', eur(Tt.N), false, true); tot('IVA (22%)', eur(iva)); tot('Totale offerta', eur(Tt.N + iva), true);

    /* 3 · copertina «Modulo Conferma d'ordine» */
    doc.addPage(); y = 70;
    { const w = 110; y = lockup((W - w) / 2, y, w) + 30; }
    T('Modulo Conferma d\'ordine', W / 2, y, { a: 'center', s: 24, b: true, c: DARK }); y += 12;
    fitCaps(cliName, W / 2, y, 12, GREY, false, W - 40); y += 7; T('Offerta ' + num + ' del ' + dt, W / 2, y, { a: 'center', s: 9, c: GREY });

    /* 4 · modulo d'ordine */
    doc.addPage();
    if (hik) doc.addImage(hik.d, 'PNG', 14, 12, 70, 70 * hik.r);
    y = 38;
    T('Partner contrattuale:', 16, y, { i: true, s: 8 }); T('HIKVISION ITALY Srl', 16, y + 5.5, { s: 8.5 }); T('Sede legale:', 16, y + 11, { s: 8 }); T('Viale Fulvio Testi, 113', 16, y + 16, { s: 8 }); T('20092 Cinisello Balsamo (MI)', 16, y + 21, { s: 8 });
    T('Spett.Le', 125, y, { s: 8 });
    const cl = [cliName, [cli.indirizzo || C.indirizzo, [cli.cap || C.cap, cli.citta || C.citta].filter(Boolean).join(' '), cli.prov || C.prov].filter(Boolean).join(', '), (cli.piva || C.piva) ? 'P.IVA ' + (cli.piva || C.piva) : '', cli.referente ? 'Alla c.a. ' + cli.referente : ''].filter(Boolean);
    cl.forEach((t, k) => T(doc.splitTextToSize(t, W - 140)[0], 125, y + 5.5 + k * 5, { s: 8.5 }));
    y = 78; T('Offerta commerciale', 14, y, { s: 12, c: RED });
    y += 10; T('Offerta numero:', 14, y, { s: 7.5 }); T(num + ' del ' + dt, 40, y, { s: 7.5 });
    y += 6.5; T('Redatta da:', 14, y, { s: 7.5 }); const rr = [red.n, red.e, red.t ? 'Tel. ' + red.t : ''].filter(Boolean); rr.forEach((t, k) => T(t, 40, y + k * 5, { s: 7.5 })); y += 5 * Math.max(1, rr.length) + 1.5;
    if (rif) { T('Riferimento:', 14, y, { s: 7.5 }); T(doc.splitTextToSize(rif, W - 60)[0], 40, y, { s: 7.5 }); y += 6; }
    y += 7; T('Come da vostra gentile richiesta siamo a sottoporre alla vostra attenzione la nostra migliore offerta per la fornitura dei materiali di seguito elencati.', 14, y, { s: 7.5 });
    y += 4.6; T('Resta escluso quanto non esplicitamente descritto.', 14, y, { s: 7.5, b: true });
    const anySc = lines.some(r => !(r.net || r.noList) && (+(r.sc1 ?? r.sc) > 0)); const anyEx = lines.some(r => +r.sc2 > 0);
    const showSc = opt.sc && anySc, showEx = opt.sc && anyEx, showL = opt.lst && lines.some(r => !r.noList && +r.p > 0);
    const head = ['Codice', 'Descrizione', 'Q.tà', ...(showL ? ['Listino Cad.'] : []), ...(showSc ? ['Sc %'] : []), ...(showEx ? ['Ex %'] : []), 'Prezzo Cad.', 'Prezzo Tot.'];
    const nC = head.length; const sb = []; sez = null;
    for (const r of lines) {
      if ((r.sez || '') !== sez) { sez = r.sez || ''; if (sez) sb.push([{ content: sez, colSpan: nC, styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } }]); }
      const t = lineTot(r); const net = r.net || r.noList; const s2 = +r.sc2 || 0, s1 = s2 ? (r.sc1 ?? r.sc) : r.sc;
      sb.push([r.c, String(r.b || (fc(r.c, r.L) || {}).b || '').slice(0, 160) + (r.net ? ' (prezzo netto)' : ''), String(r.q), ...(showL ? [net ? '' : eur(r.p)] : []), ...(showSc ? [net ? 'NETTO' : (+s1 ? fN.format(Math.round(+s1 * 100) / 100) : '-')] : []), ...(showEx ? [net ? '-' : s2 ? fN.format(s2) : '-'] : []), eur(t.unit), eur(t.netto)]);
    }
    const lab = (t, extra) => ({ content: t, colSpan: nC - 1, styles: { halign: 'right', fontStyle: 'normal', textColor: [80, 80, 80], ...(extra || {}) } });
    const foot = [[lab('Subtotale'), { content: eur(Tt.N), styles: { halign: 'right', textColor: RED, fontStyle: 'bold' } }], [lab('IVA (22%)'), { content: eur(iva), styles: { halign: 'right', fontStyle: 'bold' } }],
      [lab('Totale offerta', { fillColor: [232, 232, 232], fontStyle: 'bold', textColor: DARK, fontSize: 9 }), { content: eur(Tt.N + iva), styles: { halign: 'right', fontStyle: 'bold', fillColor: [232, 232, 232], textColor: DARK, fontSize: 9 } }]];
    const cs = { 0: { cellWidth: 26 }, 2: { cellWidth: 9, halign: 'center' } }; let k = 3; if (showL) cs[k++] = { cellWidth: 18, halign: 'right' }; if (showSc) cs[k++] = { cellWidth: 13, halign: 'center' }; if (showEx) cs[k++] = { cellWidth: 11, halign: 'center' }; cs[k++] = { cellWidth: 20, halign: 'right' }; cs[k] = { cellWidth: 22, halign: 'right', textColor: RED };
    tb = {}; doc.autoTable({ didDrawCell: tHooks.didDrawCell, startY: y + 6, head: [head], body: [...sb, ...foot], margin: { left: 14, right: 14, bottom: 22, top: 18 }, theme: 'grid', rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.6, textColor: [60, 60, 60], lineColor: [90, 90, 90], lineWidth: .15, valign: 'top' },
      headStyles: { fillColor: GREY, textColor: 255, fontStyle: 'normal', halign: 'center', lineColor: [255, 255, 255], lineWidth: .4 }, columnStyles: cs });
    roundTables();
    y = doc.lastAutoTable.finalY + 14; if (y > PH - 45) { doc.addPage(); y = 30; }
    if (hik) doc.addImage(hik.d, 'PNG', 32, y, 40, 40 * hik.r); y += 40 * (hik ? hik.r : .14) + 6;
    T('HIKVISION ITALY SRL', 52, y, { a: 'center', s: 7 });
    doc.setLineDashPattern([0.6, 0.8], 0); doc.setDrawColor(150, 150, 150); doc.setLineWidth(.2); doc.line(85, y - 4, 128, y - 4); doc.line(130, y - 4, 196, y - 4); doc.setLineDashPattern([], 0);
    T('Luogo e data', 106, y, { a: 'center', s: 7 }); T('Il committente (timbro/firma)', 163, y, { a: 'center', s: 7 });

    /* 5 · condizioni, con il riquadro delle note */
    doc.addPage(); y = 22;
    const cond = P0.cond || {}; const cf = (typeof cfg === 'function' ? cfg() : {}) || {};
    const pick = rx => { for (const [kk, v] of Object.entries(cond)) if (rx.test(kk)) return String(v).trim(); return ''; };
    const block = (title, ls) => { T(title, 14, y, { s: 7.5, b: true, c: RED }); y += 8; ls.forEach(l => doc.splitTextToSize(String(l), W - 28).forEach(z => { T(z, 14, y, { s: 7.5 }); y += 4.8; })); y += 9; };
    block('TEMPI DI CONSEGNA', [o.consegna || pick(/consegn/i) || '---']);
    block('VALIDITÀ DELL\'OFFERTA', ['La presente Offerta ha validità ' + (o.valid || 30) + ' giorni.', 'Sono esclusi i costi di spedizione se non indicati.']);
    block('CONDIZIONI DI PAGAMENTO', [o.pagamento || pick(/pagament/i) || '-', 'Tutti i prezzi indicati si intendono IVA esclusa.']);
    block('COORDINATE BANCARIE', ['Banca: ' + (cf.banca || pick(/^banca/i) || ''), 'IBAN: ' + (cf.iban || pick(/iban/i) || ''), 'Beneficiario: ' + (cf.beneficiario || pick(/benefic/i) || '')]);
    T('NOTE AGGIUNTIVE', 14, y, { s: 7.5, b: true, c: RED }); y += 4;
    const note = String(o.note || '').replace(/^(tempi di consegna|validit[aà][^:]*|condizioni di pagamento|banca|iban|beneficiario)\s*:.*$/gim, '').trim();
    const nl = note ? doc.splitTextToSize(note, W - 36) : []; const bh = Math.max(32, nl.length * 4.6 + 10);
    doc.setDrawColor(170, 174, 182); doc.setLineWidth(.3); doc.roundedRect(14, y, W - 28, bh, 3, 3);
    let ny = y + 7; nl.forEach(z => { T(z, 18, ny, { s: 7.5 }); ny += 4.6; }); y += bh + 8;
    ['Immagini e descrizioni dei prodotti presenti nell\'offerta sono indicativi e potrebbero contenere inesattezze.', 'Per maggiori dettagli, vi preghiamo di consultare le schede tecniche dei prodotti sui siti web ufficiali o di contattare il personale Hikvision e i partner di distribuzione autorizzati.'].forEach(l => doc.splitTextToSize(l, W - 28).forEach(z => { T(z, 14, y, { s: 7.5 }); y += 4.8; }));

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
    for (const pg of extra) { const o2 = pg.w > pg.h ? 'l' : 'p'; doc.addPage([pg.w * 25.4 / 72, pg.h * 25.4 / 72], o2); doc.addImage(pg.d, 'JPEG', 0, 0, pg.w * 25.4 / 72, pg.h * 25.4 / 72, undefined, 'FAST'); }
    say('Salvo il PDF…');
    doc.save(('Prev_' + num + '_' + cliName).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').toLowerCase() + '_hikvision_proav.pdf');
  }

  /* ---------- finestra di esportazione (ProAV) ---------- */
  window.exportOffer = function (o) {
    const showSc = el('input', { type: 'checkbox', checked: S.state.exSc !== false }); const showL = el('input', { type: 'checkbox', checked: S.state.exL !== false });
    const dsBox = el('div', { class: 'stack', style: 'gap:6px' }), atBox = el('div', { class: 'stack', style: 'gap:6px' });
    const prog = el('div', { class: 'row', style: 'gap:8px', hidden: true }, el('span', { class: 'spin' }), el('span', {}));
    const say = t => { prog.hidden = false; prog.lastChild.textContent = t; };
    // schede tecniche: tradotta in italiano se c'è, altrimenti il PDF della scheda prodotto; se manca si può caricare
    const codes = [...new Map((o.righe || []).map(r => [mainC(r.c), r])).values()];
    const ds = codes.map(r => ({ c: mainC(r.c), r, st: 'cerco', url: null, file: null, on: true }));
    const drawDs = () => dsBox.replaceChildren(...(ds.length ? ds.map(x => {
      const fIn = el('input', { type: 'file', accept: '.pdf', hidden: true, onchange: e => { const f = e.target.files[0]; if (f) { x.file = f; x.st = 'caricato'; x.on = true; drawDs(); } } });
      const stTxt = { cerco: 'cerco la scheda…', it: '🇮🇹 scheda tradotta in italiano', orig: '🇬🇧 scheda originale (dal sito Hikvision)', caricato: '📎 ' + (x.file ? x.file.name : ''), no: 'non trovata' }[x.st];
      return el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, el('label', { class: 'row', style: 'gap:6px' }, el('input', { type: 'checkbox', checked: x.on && x.st !== 'no' && x.st !== 'cerco', disabled: x.st === 'no' || x.st === 'cerco', onchange: e => { x.on = e.target.checked; } }), el('b', { class: 'mono' }, x.c)),
        el('span', { class: 'hint', style: x.st === 'no' ? 'color:var(--accent)' : '' }, stTxt), x.st === 'no' || x.st === 'orig' ? btn(x.st === 'no' ? 'Carica PDF' : 'Usa un altro PDF', () => fIn.click(), 'sm ghost', 'up') : null,
        x.st === 'no' ? el('a', { class: 'hint', href: 'https://www.google.com/search?q=' + encodeURIComponent('site:hikvision.com ' + x.c + ' datasheet filetype:pdf'), target: '_blank', rel: 'noopener' }, 'cercala su Google ↗') : null, fIn);
    }) : [el('p', { class: 'hint', style: 'margin:0' }, 'Nessun articolo nell\'offerta.')]));
    drawDs();
    ds.forEach(async x => {
      try {
        const D = S.dsTrad && window.hpDsKey ? S.dsTrad.get(hpDsKey(x.c)) : null;
        if (D && D.pdf) { x.st = 'it'; x.url = '/_blob/' + D.pdf; }
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
    const m = modal('Esporta offerta ' + (o.numero || ''), el('div', { class: 'stack' },
      el('label', { class: 'row', style: 'gap:8px' }, showSc, el('span', {}, el('b', {}, 'Mostra lo sconto %'), el('div', { class: 'hint' }, 'Nel modulo d\'ordine; le colonne di sconto vuote non compaiono comunque'))),
      el('label', { class: 'row', style: 'gap:8px' }, showL, el('span', {}, el('b', {}, 'Mostra il prezzo di listino'))),
      el('h4', { style: 'margin:6px 0 0' }, 'Schede tecniche in coda'), dsBox,
      el('h4', { style: 'margin:6px 0 0' }, 'Disegni, simulazioni e report HiTools Designer'), atBox, prog),
      [el('span', { class: 'grow' }), btn('Annulla', () => m.close()),
        btn('Excel', () => { S.state.exSc = showSc.checked; S.state.exL = showL.checked; m.close(); window.hpOffXlsx && hpOffXlsx(o, showSc.checked, showL.checked); }, '', 'dl'),
        btn('PDF', async () => {
          S.state.exSc = showSc.checked; S.state.exL = showL.checked;
          const attach = [...ds.filter(x => x.on && (x.url || x.file)).map(x => ({ label: 'scheda ' + x.c, url: x.url, file: x.file })), ...(atBox._files || []).filter(f => f.on).map(f => ({ label: f.name, url: '/_blob/' + f.id })), ...extra.filter(x => x.on)];
          try { await build(o, { sc: showSc.checked, lst: showL.checked, attach }, say); m.close(); toast('Offerta PDF pronta'); } catch (e) { console.error(e); toast('PDF non creato: ' + (e.message || e), 'bad'); prog.hidden = true; }
        }, 'pri', 'doc')], { wide: true });
  };
  window.hpPavOfferBuild = build; window.hpPavProdImg = productImage;
})();
