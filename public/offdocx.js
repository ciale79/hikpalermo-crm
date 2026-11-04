/* Offerta in Word (.docx): stessi contenuti del PDF (copertina, offerta commerciale, condizioni, note), tutto testo modificabile.
   Usato dalla finestra «Esporta» del modello standard e di quello ProAV. */
(function () {
  const DOCX = 'https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js';
  const RED = 'C8102E', INK = '404040', GREY = '808080', DARK = '333333', LINE = 'AAAEB6';
  const eur = v => '€ ' + (window.hpGrpX ? hpGrpX(v) : window.hpGrp ? hpGrp(v, 2) : (+v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const r2 = v => Math.round((+v || 0) * 100) / 100;
  const fc = (c, L) => { try { return typeof findCode === 'function' ? findCode(c, L) : null; } catch (e) { return null; } };
  const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  async function png(src, w, dark) {
    const i = await loadImg(src); if (!i) return null;
    const c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * i.naturalHeight / i.naturalWidth); const g = c.getContext('2d'); g.drawImage(i, 0, 0, c.width, c.height);
    if (dark) { g.globalCompositeOperation = 'source-in'; g.fillStyle = '#333'; g.fillRect(0, 0, c.width, c.height); }
    const b = await new Promise(r => c.toBlob(r, 'image/png')); return { data: new Uint8Array(await b.arrayBuffer()), r: c.height / c.width };
  }

  const u8url = async d => new Uint8Array(await (await fetch(d)).arrayBuffer());
  window.hpOffDocx = async function (o, sc, lst, pav, attPages) {
    try { if (!window.docx) await loadScript(DOCX); } catch (e) { toast('Non riesco a caricare il generatore Word.', 'bad'); return; }
    const X = window.docx; const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType, PageBreak, TableLayoutType } = X;
    const com = S.commesse.get(o.commessaId), cli = S.clienti.get(o.clienteId) || {}; const P = o.pdf || {}; const M = P.meta || {}; const C = P.cliente || {};
    const num = o.numero || '—'; const dt = o.data ? o.data.split('-').reverse().join('/') : new Date().toLocaleDateString('it-IT');
    const cliName = cli.nome || C.nome || 'Cliente'; const rif = o.titolo || M.riferimento || (com ? com.nome : '');
    const me = (S.team && S.team.get(o.by || S.me)) || {}; const red = { n: M.redatto || (typeof nm === 'function' ? nm(o.by || S.me) : ''), e: M.redattoEmail || me.email || (typeof mailOf === 'function' ? mailOf(o.by || S.me) : '') || '', t: M.redattoTel || me.tel || '' };
    const hik = await png('/brand-hikvision.png', 900) || await png('/hik-logo.png', 900); const mark = pav ? await png('/proav-mark.png', 900, true) : null; const nl = pav ? await png('/proav-hik-logo.png', 1200) : null;

    const FONT = 'Open Sans';
    const R = (t, op = {}) => new TextRun({ text: String(t ?? ''), font: FONT, size: Math.round((op.s || 9) * 2), bold: !!op.b, italics: !!op.i, color: op.c || INK, allCaps: !!op.caps });
    const Pp = (runs, op = {}) => new Paragraph({ keepNext: !!op.keep, children: Array.isArray(runs) ? runs : [runs], alignment: op.a === 'c' ? AlignmentType.CENTER : op.a === 'r' ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { before: Math.round((op.before || 0) * 20), after: Math.round((op.after ?? 4) * 20), ...(op.img ? {} : { line: op.line || 276 }) } });
    // allegati (immagini e PDF già trasformati in pagine) nelle posizioni scelte, una pagina ciascuno
    const AP = attPages || {};
    const ins = async pos => { for (const pg of AP[pos] || []) { const k = Math.min(174 / pg.w, 248 / pg.h); body.push(new Paragraph({ children: [new PageBreak()] }), new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new ImageRun({ type: 'jpg', data: await u8url(pg.d), transformation: { width: Math.round(pg.w * k * 3.78), height: Math.round(pg.h * k * 3.78) } })] })); } };
    const img = (im, wMm, a) => im ? Pp(new ImageRun({ type: 'png', data: im.data, transformation: { width: Math.round(wMm * 3.78), height: Math.round(wMm * im.r * 3.78) } }), { a: a || 'c', after: 2, img: true }) : null;
    const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, thin = { style: BorderStyle.SINGLE, size: 4, color: LINE };
    const cell = (content, op = {}) => new TableCell({ children: (Array.isArray(content) ? content : [content]).map(c => c instanceof Paragraph ? c : Pp(R(c, { s: op.s || 7.5, b: op.b, c: op.c || (op.head ? 'FFFFFF' : INK) }), { a: op.a, after: 0, line: 240, keep: op.keep })), columnSpan: op.span, width: op.w ? { size: op.w, type: WidthType.DXA } : undefined,
      shading: op.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: op.fill } : undefined, verticalAlign: X.VerticalAlign ? X.VerticalAlign.CENTER : undefined, margins: { top: 50, bottom: 50, left: 80, right: 80 }, borders: op.bord !== undefined ? op.bord : op.noB ? { top: none, bottom: none, left: none, right: none } : { top: thin, bottom: thin, left: thin, right: thin } });

    const body = [];
    /* 1 · copertina */
    if (pav) { // copertina ProAV come il modello Word di riferimento
      const P1 = (t, op) => Pp(R(t, op), { after: 0, img: true }); const E = () => Pp(R('', { s: 10 }), { after: 0, img: true });
      body.push(nl ? img(nl, 69.6, 'c') : img(hik, 100), Pp(R('', { s: 10 }), { after: 10 }), Pp(R('', { s: 10 }), { after: 10 }),
        P1('Offerta riservata per', { s: 10, c: GREY }), P1(cliName.toUpperCase(), { s: 14, b: true, c: DARK }), E(),
        rif ? P1('Riferimento', { s: 10, c: GREY }) : null, rif ? P1(rif, { s: 12, c: DARK }) : null, P1(num + ' del ' + dt, { s: 8, c: GREY }), E(), E());
      String(o.intro || '').trim().split(/\n\s*\n|\n/).map(x => x.trim()).filter(Boolean).forEach(par => body.push(new Paragraph({ children: [R(par, { s: 10 })], alignment: AlignmentType.JUSTIFIED, spacing: { after: 160, line: 330 } })));
      // immagini dei prodotti in copertina, come nel PDF
      const cov = window.hpPavCovData ? await hpPavCovData(o) : [];
      if (cov.length) { const im = cov[0]; let h = 70, w = h / (im.r || 1); if (w > 174) { w = 174; h = w * (im.r || 1); }
        body.push(Pp(R('', { s: 10 }), { after: 30 }), new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'jpg', data: await u8url(im.d), transformation: { width: Math.round(w * 3.78), height: Math.round(h * 3.78) } })] })); }
      await ins('cov');
      /* pagina «Offerta» con le anteprime dei prodotti */
      body.push(new Paragraph({ children: [new PageBreak()] }), nl ? img(nl, 52.5, 'l') : null, Pp(R('', { s: 10 }), { after: 6 }), Pp(R('Offerta', { s: 11, c: RED }), { after: 2 }), Pp(R(num + ' del ' + dt + (rif ? ' · ' + rif : ''), { s: 8, c: GREY }), { after: 6 }));
      { const L0 = o.righe || []; const cellB = (c, op = {}) => cell(c, { ...op, bord: op.head ? { top: none, left: none, right: none, bottom: thin } : { top: none, bottom: none, left: none, right: none } }); const thumbs = await Promise.all(L0.map(r => window.hpPavProdImg ? hpPavProdImg({ ...r, c: hpPavMainC(r.c) }, false).catch(() => null) : null));
        const cw = [1360, 1360, 0, 1000, 1470, 1590]; cw[2] = 9906 - cw.reduce((a, b) => a + b, 0);
        const rows = [new TableRow({ tableHeader: true, children: ['', 'SAP', 'Codice', 'Q.tà', 'Prezzo Cad.', 'Totale'].map((h, k) => cellB(h, { head: true, fill: 'DEE0E4', c: DARK, b: true, w: cw[k], a: 'c' })) })]; let sz0 = null;
        for (let i = 0; i < L0.length; i++) { const r = L0[i]; if ((r.sez || '') !== sz0) { sz0 = r.sez || ''; if (sz0) rows.push(new TableRow({ children: [cellB(sz0, { b: true, fill: 'F6F7F8', span: 6 })] })); }
          const it = fc(r.c, r.L) || {}; const t = lineTot(r); const th = thumbs[i]; const LQ = window.hpLedQ ? hpLedQ(r) : null;
          rows.push(new TableRow({ cantSplit: true, children: [cellB(th ? new Paragraph({ keepNext: true, alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'jpg', data: await u8url(th), transformation: { width: 64, height: 64 } })] }) : '', { keep: true, w: cw[0] }), cellB(window.hpSapList ? hpSapList(r) : (it.sap || r.sap || ''), { keep: true, w: cw[1] }), cellB(window.hpKitCode ? hpKitCode(r.c) : r.c, { keep: true, w: cw[2], b: true, c: DARK }), cellB(LQ ? hpMq(LQ.mq) + ' m²' : String(r.q), { keep: true, w: cw[3], a: 'c' }), cellB(eur(LQ && !LQ.kit ? t.unit / LQ.A : t.unit), { keep: true, w: cw[4], a: 'r' }), cellB(eur(t.netto), { keep: true, w: cw[5], a: 'r', b: true, c: RED })] }));
          rows.push(new TableRow({ cantSplit: true, children: [cellB(String(window.hpPavLongD ? hpPavLongD(r) : r.b || ''), { span: 6 })] })); }
        // solo la cornice esterna (tabella contenitore) e la riga sotto l'intestazione
        const inner = new Table({ width: { size: 9906 - 40, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: cw.map((w, k) => k === 2 ? w - 40 : w), rows, borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none } });
        body.push(new Table({ width: { size: 9906, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [9906], rows: [new TableRow({ children: [new TableCell({ children: [inner, new Paragraph({ children: [], spacing: { after: 0, line: 20, lineRule: 'exact' } })], width: { size: 9906, type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 }, borders: { top: thin, bottom: thin, left: thin, right: thin } })] })] }));
        const T0 = offTot(L0), iva0 = hpExact(T0.N * 0.22); const tl = (l, v, b, c) => Pp([R(l + '   ', { s: b ? 10 : 8, b, c: b ? DARK : INK }), R(v, { s: b ? 10 : 8, b: true, c: c || DARK })], { a: 'r', after: 2 });
        body.push(Pp(R(''), { after: 4 }), tl('Subtotale', eur(T0.N), false, RED), tl('IVA (22%)', eur(iva0)), tl('Totale offerta', eur(T0.N + iva0), true)); }
      await ins('img');
      /* copertina «Modulo Conferma d'ordine» */
      body.push(new Paragraph({ children: [new PageBreak()] }), nl ? img(nl, 69.6, 'c') : null, Pp(R(''), { after: 0, before: 160 }),
        Pp(R('Modulo Conferma d\'ordine', { s: 24, b: true, c: DARK }), { after: 6, img: true }), Pp(R(cliName.toUpperCase(), { s: 14, b: true, c: DARK }), { after: 0, img: true }), Pp(R('Offerta ' + num + ' del ' + dt, { s: 8, c: GREY }), { after: 0, img: true }));
    } else body.push(img(hik, 100),
      Pp(R('TVCC  |  INTRUSIONE  |  INTERCOM  |  CONTROLLO ACCESSI', { s: 10, c: GREY }), { a: 'c', after: 0 }),
      Pp(R('Offerta riservata per', { s: 8, c: GREY }), { a: 'c', before: 40, after: 6 }),
      Pp(R(cliName.toUpperCase(), { s: 17, b: true, c: DARK }), { a: 'c', after: 22 }),
      rif ? Pp(R('Riferimento', { s: 8, c: GREY }), { a: 'c', after: 4 }) : null, rif ? Pp(R(rif, { s: 13, c: DARK, b: true }), { a: 'c', after: 14 }) : null,
      Pp(R(num + ' del ' + dt, { s: 8, c: GREY }), { a: 'c', after: 26 }));
    if (!pav) await ins('cov');
    body.push(new Paragraph({ children: [new PageBreak()] }));

    /* 2 · offerta commerciale */
    const lines = o.righe || []; const anyLed = pav && !!window.hpLedInfo && lines.some(r => hpLedInfo(r));
    // con un LED wall: due fogli di offerta commerciale, a pezzi e con il LED wall a m²
    const orderW = mq => {
    body.push(nl ? img(nl, 52.5, 'l') : img(hik, 60, 'l'), Pp(R('', { s: 10 }), { after: 6 }));
    const cl = [cliName, [cli.indirizzo || C.indirizzo, [cli.cap || C.cap, cli.citta || C.citta].filter(Boolean).join(' '), cli.prov || C.prov].filter(Boolean).join(', '), (cli.piva || C.piva) ? 'P.IVA ' + (cli.piva || C.piva) : '', cli.referente ? 'Alla c.a. ' + cli.referente : ''].filter(Boolean);
    body.push(new Table({ width: { size: 9906, type: WidthType.DXA }, layout: TableLayoutType.FIXED, rows: [new TableRow({ children: [
      cell([Pp(R('Partner contrattuale:', { s: pav ? 10 : 8, i: true }), { after: 1 }), Pp(R('HIKVISION ITALY Srl', { s: pav ? 10 : 8.5 }), { after: 1 }), Pp(R('Sede legale: Viale Fulvio Testi, 113', { s: pav ? 10 : 8 }), { after: 1 }), Pp(R('20092 Cinisello Balsamo (MI)', { s: pav ? 10 : 8 }), { after: 0 })], { noB: true, w: 5400 }),
      cell([Pp(R('Spett.le', { s: pav ? 10 : 8 }), { after: 1 }), ...cl.map(t => Pp(R(t, { s: pav ? 10 : 8.5 }), { after: 1 }))], { noB: true, w: 4506 })] })] }));
    body.push(Pp(R('Offerta commerciale' + (anyLed ? (mq ? ' · LED wall a metro quadro' : ' · a pezzi') : ''), { s: pav ? 11 : 13, c: RED }), { before: 14, after: 6 }));
    const kv = (k, v) => Pp([R(k + '  ', { s: pav ? 10 : 8, b: true }), R(v, { s: pav ? 10 : 8 })], { after: 2 });
    body.push(kv('Offerta numero:', num + ' del ' + dt), kv('Redatta da:', [red.n, red.e, red.t ? 'Tel. ' + red.t : ''].filter(Boolean).join(' · ')), rif ? kv('Riferimento:', rif) : null);
    body.push(Pp(R('Come da vostra gentile richiesta siamo a sottoporre alla vostra attenzione la nostra migliore offerta per la fornitura dei materiali di seguito elencati.', { s: 8 }), { before: 8, after: 2 }));
    if (pav) body.push(Pp(R('Resta escluso quanto non esplicitamente descritto.', { s: 8, b: true }), { after: 6 }));

    // tabella righe: le colonne di sconto vuote non compaiono; le righe «netto cliente» mostrano solo il netto
    const anySc = lines.some(r => !(r.net || r.noList) && +(r.sc1 ?? r.sc) > 0), anyEx = lines.some(r => !(r.net || r.noList) && +r.sc2 > 0);
    const sL = lst && lines.some(r => !r.noList && +r.p > 0), sS = sc && anySc, sE = sc && anyEx;
    const cols = [['Codice', pav ? 2100 : 1750], ['Descrizione', 0], [mq ? 'Q.tà / m²' : 'Q.tà', anyLed ? 900 : 560, 'c'], ...(sL ? [[mq ? 'Listino' : 'Listino Cad.', mq ? 1400 : 1150, 'r']] : []), ...(sS ? [['Sc %', 640, 'c']] : []), ...(sE ? [['Ex %', 600, 'c']] : []), [mq ? 'Prezzo unit.' : 'Prezzo Cad.', mq ? 1400 : 1150, 'r'], ['Prezzo Tot.', 1250, 'r']];
    cols[1][1] = 9906 - cols.reduce((a, c) => a + c[1], 0);
    const longD = r => { if (r.dx && !pav) return r.dx; if (pav) return String(r.b || (fc(r.c, r.L) || {}).b || ''); const it = fc(r.c, r.L); return it && it.d && (!r.b || r.b === it.b) ? it.d : (r.b || (it && it.d) || ''); };
    const rows = [new TableRow({ tableHeader: true, children: cols.map(([h, w, a]) => cell(h, { head: true, fill: pav ? 'DEE0E4' : '808080', c: pav ? DARK : undefined, b: pav, w, a: a || 'c' })) })];
    let sez = null;
    for (const r of lines) {
      if ((r.sez || '') !== sez) { sez = r.sez || ''; if (sez) rows.push(new TableRow({ children: [cell(sez, { b: true, fill: pav ? 'F6F7F8' : 'F0F0F0', span: cols.length })] })); }
      const t = lineTot(r); const net = r.net || r.noList; const s2 = +r.sc2 || 0, s1 = s2 ? (r.sc1 ?? r.sc) : r.sc;
      const LC = pav && window.hpLedCells ? hpLedCells(r, t.unit, mq, eur) : null;
      const v = [r.c, longD(r), LC && LC.q.includes('\n') ? LC.q.split('\n').map((t, i) => Pp(R(t, { s: 7.5, b: !i, c: i ? 'AFAFAF' : DARK }), { a: 'c', after: 0, line: 240 })) : LC ? LC.q : String(r.q), ...(sL ? [net ? '' : LC ? LC.l : eur(r.p)] : []), ...(sS ? [r.ncHide ? '' : net ? 'NETTO' : (+s1 ? fN.format(r2(s1)) : '-')] : []), ...(sE ? [r.ncHide ? '' : net ? '-' : s2 ? fN.format(r2(s2)) : '-'] : []), LC ? LC.u : eur(t.unit), eur(t.netto)];
      rows.push(new TableRow({ cantSplit: true, children: v.map((x, k) => cell(k === 0 && pav && window.hpCodeLines ? hpCodeLines(x) : typeof x === 'string' && x.includes('\n') ? x.split('\n') : x, { w: cols[k][1], a: cols[k][2], b: k === 0, c: k === v.length - 1 ? RED : undefined })) }));
    }
    const T = offTot(lines), iva = hpExact(T.N * 0.22);
    const tot = (l, v, op = {}) => new TableRow({ children: [cell(l, { span: cols.length - 1, a: 'r', b: op.b, fill: op.fill, s: op.b ? 9 : 8 }), cell(v, { a: 'r', b: true, c: op.c, fill: op.fill, s: op.b ? 9 : 8 })] });
    rows.push(tot('Subtotale', eur(T.N), { c: RED }), tot('IVA (22%)', eur(iva)), tot('Totale offerta', eur(T.N + iva), { b: true, fill: pav ? 'F0F1F3' : 'E8E8E8' }));
    body.push(new Table({ width: { size: 9906, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: cols.map(c => c[1]), rows }));
    // timbro e firme (non sul foglio a metro quadro)
    if (!mq) body.push(Pp(R(''), { before: 20 }), new Table({ width: { size: 9906, type: WidthType.DXA }, layout: TableLayoutType.FIXED, rows: [new TableRow({ children: [
      cell([nl ? img(nl, 32) : img(hik, 36), Pp(R('HIKVISION ITALY SRL', { s: 7 }), { a: 'c', after: 0 })].filter(Boolean), { noB: true, w: 3600 }),
      cell([Pp(R('______________________', { s: 8, c: GREY }), { a: 'c', before: 30, after: 0 }), Pp(R('Luogo e data', { s: 7 }), { a: 'c', after: 0 })], { noB: true, w: 2600 }),
      cell([Pp(R('________________________________', { s: 8, c: GREY }), { a: 'c', before: 30, after: 0 }), Pp(R('Il committente (timbro/firma)', { s: 7 }), { a: 'c', after: 0 })], { noB: true, w: 3706 })] })] }));
    };
    if (anyLed) { orderW(true); body.push(new Paragraph({ children: [new PageBreak()] })); } orderW(false); // prima il foglio a m², poi quello a pezzi
    if (!pav) { // dettaglio con l'immagine del prodotto, SAP, codice e descrizione
      body.push(new Paragraph({ children: [new PageBreak()] }), Pp(R('Dettaglio', { s: 11, c: RED }), { after: 6 }));
      const L1 = o.righe || []; const ths = await Promise.all(L1.map(r => window.hpProdThumb ? hpProdThumb(r).catch(() => null) : null));
      const cw = [1150, 1250, 0, 650, 1350, 1450]; cw[2] = 9906 - cw.reduce((x, y) => x + y, 0);
      const rows = [new TableRow({ tableHeader: true, children: ['', 'SAP', 'Codice / Descrizione', 'Q.tà', 'Prezzo Cad.', 'Totale'].map((h, k) => cell(h, { head: true, fill: '808080', w: cw[k], a: 'c' })) })];
      for (let i = 0; i < L1.length; i++) { const r = L1[i]; const it = fc(r.c, r.L) || {}; const t = lineTot(r); const th = ths[i];
        rows.push(new TableRow({ cantSplit: true, children: [
          cell(th ? new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'jpg', data: await u8url(th), transformation: { width: 56, height: 56 } })] }) : '', { w: cw[0] }),
          cell(it.sap || r.sap || '', { w: cw[1] }),
          cell([Pp(R(r.c, { s: 7.5, b: true, c: DARK }), { after: 0, line: 240 }), Pp(R(String(r.b || it.b || '').slice(0, 220), { s: 7.5 }), { after: 0, line: 240 })], { w: cw[2] }),
          cell(String(r.q), { w: cw[3], a: 'c' }), cell(eur(t.unit), { w: cw[4], a: 'r' }), cell(eur(t.netto), { w: cw[5], a: 'r', c: RED })] })); }
      body.push(new Table({ width: { size: 9906, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: cw, rows }));
    }
    await ins('ord');

    /* 3 · condizioni */
    body.push(new Paragraph({ children: [new PageBreak()] }));
    const cond = P.cond || {}; const cf = (typeof cfg === 'function' ? cfg() : {}) || {};
    const pick = rx => { for (const [k, v] of Object.entries(cond)) if (rx.test(k)) return String(v).trim(); return ''; };
    const block = (title, ls) => { body.push(Pp(R(title, { s: 8, b: true, c: RED }), { before: 6, after: 4 })); ls.forEach(l => body.push(Pp(R(l, { s: 8 }), { after: 2 }))); body.push(Pp(R(''), { after: 6 })); };
    block('TEMPI DI CONSEGNA', [o.consegna || pick(/consegn/i) || '---']);
    block('VALIDITÀ DELL\'OFFERTA', [window.hpValidTxt ? hpValidTxt(o) : 'La presente Offerta ha validità ' + (o.valid || 30) + ' giorni.']);
    block('COSTI DI SPEDIZIONE', [o.spedizione || 'Sono esclusi i costi di spedizione se non indicati.']);
    block('CONDIZIONI DI PAGAMENTO', [o.pagamento || pick(/pagament/i) || '-', 'Tutti i prezzi indicati si intendono IVA esclusa.']);
    if (!pav) block('COORDINATE BANCARIE', ['Banca: ' + (cf.banca || pick(/^banca/i) || ''), 'IBAN: ' + (cf.iban || pick(/iban/i) || ''), 'Beneficiario: ' + (cf.beneficiario || pick(/benefic/i) || '')]);
    const note = String(o.note || '').replace(/^(tempi di consegna|validit[aà][^:]*|condizioni di pagamento|banca|iban|beneficiario)\s*:.*$/gim, '').trim();
    body.push(Pp(R('NOTE AGGIUNTIVE', { s: 8, b: true, c: RED }), { before: 6, after: 4 }));
    body.push(new Table({ width: { size: 9906, type: WidthType.DXA }, rows: [new TableRow({ children: [cell((note ? note.split('\n') : ['', '', '']).map(l => Pp(R(l, { s: 8 }), { after: 2 })), { w: 9906 })] })] }));

    await ins('cond');

    // Open Sans incorporato nel file: il documento si vede uguale anche dove il font non è installato
    const FD = window.hpPdfFontData ? await hpPdfFontData() : {}; const fonts = [];
    const u8 = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
    if (FD.normal) fonts.push({ name: 'Open Sans', data: u8(FD.normal), characterSet: X.CharacterSet ? X.CharacterSet.ANSI : undefined });
    const docx = new Document({ creator: 'HIK PALERMO', title: 'Offerta ' + num, fonts, styles: { default: { document: { run: { font: FONT } } } },
      sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
        footers: { default: new X.Footer({ children: [Pp(R('HIKVISION ITALY Srl - Viale Fulvio Testi, 113 - 20092 Cinisello Balsamo (MI) - P.IVA 07757250969', { s: 6.5, c: GREY }), { a: 'c', after: 0 })] }) },
        children: body.filter(Boolean) }] });
    const blob = await Packer.toBlob(docx);
    const name = ('Prev_' + num + '_' + cliName).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').toLowerCase() + (pav ? '_hikvision_proav' : '_hikvision') + '.docx';
    if (window.hpDlReady) hpDlReady(blob, name);
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
  };
})();
