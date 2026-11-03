/* Offerta in Word (.docx): stessi contenuti del PDF (copertina, offerta commerciale, condizioni, note), tutto testo modificabile.
   Usato dalla finestra «Esporta» del modello standard e di quello ProAV. */
(function () {
  const DOCX = 'https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js';
  const RED = 'C8102E', INK = '404040', GREY = '808080', DARK = '333333', LINE = 'AAAEB6';
  const eur = v => '€ ' + (+v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const r2 = v => Math.round((+v || 0) * 100) / 100;
  const fc = (c, L) => { try { return typeof findCode === 'function' ? findCode(c, L) : null; } catch (e) { return null; } };
  const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  async function png(src, w, dark) {
    const i = await loadImg(src); if (!i) return null;
    const c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * i.naturalHeight / i.naturalWidth); const g = c.getContext('2d'); g.drawImage(i, 0, 0, c.width, c.height);
    if (dark) { g.globalCompositeOperation = 'source-in'; g.fillStyle = '#333'; g.fillRect(0, 0, c.width, c.height); }
    const b = await new Promise(r => c.toBlob(r, 'image/png')); return { data: new Uint8Array(await b.arrayBuffer()), r: c.height / c.width };
  }

  window.hpOffDocx = async function (o, sc, lst, pav) {
    try { if (!window.docx) await loadScript(DOCX); } catch (e) { toast('Non riesco a caricare il generatore Word.', 'bad'); return; }
    const X = window.docx; const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType, PageBreak, TableLayoutType } = X;
    const com = S.commesse.get(o.commessaId), cli = S.clienti.get(o.clienteId) || {}; const P = o.pdf || {}; const M = P.meta || {}; const C = P.cliente || {};
    const num = o.numero || '—'; const dt = o.data ? o.data.split('-').reverse().join('/') : new Date().toLocaleDateString('it-IT');
    const cliName = cli.nome || C.nome || 'Cliente'; const rif = o.titolo || M.riferimento || (com ? com.nome : '');
    const me = (S.team && S.team.get(o.by || S.me)) || {}; const red = { n: M.redatto || (typeof nm === 'function' ? nm(o.by || S.me) : ''), e: M.redattoEmail || me.email || (typeof mailOf === 'function' ? mailOf(o.by || S.me) : '') || '', t: M.redattoTel || me.tel || '' };
    const hik = await png('/brand-hikvision.png', 900) || await png('/hik-logo.png', 900); const mark = pav ? await png('/proav-mark.png', 900, true) : null;

    const R = (t, op = {}) => new TextRun({ text: String(t ?? ''), font: 'Arial', size: Math.round((op.s || 9) * 2), bold: !!op.b, italics: !!op.i, color: op.c || INK, allCaps: !!op.caps });
    const Pp = (runs, op = {}) => new Paragraph({ children: Array.isArray(runs) ? runs : [runs], alignment: op.a === 'c' ? AlignmentType.CENTER : op.a === 'r' ? AlignmentType.RIGHT : AlignmentType.LEFT, spacing: { before: Math.round((op.before || 0) * 20), after: Math.round((op.after ?? 4) * 20), ...(op.img ? {} : { line: op.line || 276 }) } });
    const img = (im, wMm, a) => im ? Pp(new ImageRun({ type: 'png', data: im.data, transformation: { width: Math.round(wMm * 3.78), height: Math.round(wMm * im.r * 3.78) } }), { a: a || 'c', after: 2, img: true }) : null;
    const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, thin = { style: BorderStyle.SINGLE, size: 4, color: LINE };
    const cell = (content, op = {}) => new TableCell({ children: (Array.isArray(content) ? content : [content]).map(c => c instanceof Paragraph ? c : Pp(R(c, { s: op.s || 7.5, b: op.b, c: op.c || (op.head ? 'FFFFFF' : INK) }), { a: op.a, after: 0, line: 240 })), columnSpan: op.span, width: op.w ? { size: op.w, type: WidthType.DXA } : undefined,
      shading: op.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: op.fill } : undefined, margins: { top: 50, bottom: 50, left: 80, right: 80 }, borders: op.noB ? { top: none, bottom: none, left: none, right: none } : { top: thin, bottom: thin, left: thin, right: thin } });

    const body = [];
    /* 1 · copertina */
    body.push(img(hik, pav ? 56 : 100, pav ? 'l' : 'c'), mark ? new Paragraph({ children: [new ImageRun({ type: 'png', data: mark.data, transformation: { width: Math.round(56 * (0.693 - 0.228) * 3.78), height: Math.round(56 * (0.693 - 0.228) * mark.r * 3.78) } })], indent: { left: Math.round(56 * 0.228 * 56.7) }, spacing: { after: 300 } }) : null,
      pav ? null : Pp(R('TVCC  |  INTRUSIONE  |  INTERCOM  |  CONTROLLO ACCESSI', { s: 10, c: GREY }), { a: 'c', after: 0 }),
      Pp(R('Offerta riservata per', { s: 8, c: GREY }), { a: 'c', before: 40, after: 6 }),
      Pp(R(cliName.toUpperCase(), { s: 17, b: true, c: DARK }), { a: 'c', after: 22 }),
      rif ? Pp(R('Riferimento', { s: 8, c: GREY }), { a: 'c', after: 4 }) : null, rif ? Pp(R(rif, { s: 13, c: DARK, b: !pav }), { a: 'c', after: 14 }) : null,
      Pp(R(num + ' del ' + dt, { s: 8, c: GREY }), { a: 'c', after: 26 }));
    const intro = String(o.intro || '').trim();
    if (pav && intro) intro.split(/\n\s*\n|\n/).map(x => x.trim()).filter(Boolean).forEach(par => body.push(Pp(R(par, { s: 10 }), { after: 8, line: 330 })));
    body.push(new Paragraph({ children: [new PageBreak()] }));

    /* 2 · offerta commerciale */
    body.push(img(hik, 60, 'l'), mark ? new Paragraph({ children: [new ImageRun({ type: 'png', data: mark.data, transformation: { width: Math.round(60 * (0.693 - 0.228) * 3.78), height: Math.round(60 * (0.693 - 0.228) * mark.r * 3.78) } })], indent: { left: Math.round(60 * 0.228 * 56.7) }, spacing: { after: 160 } }) : null);
    const cl = [cliName, [cli.indirizzo || C.indirizzo, [cli.cap || C.cap, cli.citta || C.citta].filter(Boolean).join(' '), cli.prov || C.prov].filter(Boolean).join(', '), (cli.piva || C.piva) ? 'P.IVA ' + (cli.piva || C.piva) : '', cli.referente ? 'Alla c.a. ' + cli.referente : ''].filter(Boolean);
    body.push(new Table({ width: { size: 9906, type: WidthType.DXA }, layout: TableLayoutType.FIXED, rows: [new TableRow({ children: [
      cell([Pp(R('Partner contrattuale:', { s: 8, i: true }), { after: 1 }), Pp(R('HIKVISION ITALY Srl', { s: 8.5 }), { after: 1 }), Pp(R('Sede legale: Viale Fulvio Testi, 113', { s: 8 }), { after: 1 }), Pp(R('20092 Cinisello Balsamo (MI)', { s: 8 }), { after: 0 })], { noB: true, w: 5400 }),
      cell([Pp(R('Spett.le', { s: 8 }), { after: 1 }), ...cl.map(t => Pp(R(t, { s: 8.5 }), { after: 1 }))], { noB: true, w: 4506 })] })] }));
    body.push(Pp(R('Offerta commerciale', { s: 13, c: RED }), { before: 14, after: 6 }));
    const kv = (k, v) => Pp([R(k + '  ', { s: 8, b: true }), R(v, { s: 8 })], { after: 2 });
    body.push(kv('Offerta numero:', num + ' del ' + dt), kv('Redatta da:', [red.n, red.e, red.t ? 'Tel. ' + red.t : ''].filter(Boolean).join(' · ')), rif ? kv('Riferimento:', rif) : null);
    body.push(Pp(R('Come da vostra gentile richiesta siamo a sottoporre alla vostra attenzione la nostra migliore offerta per la fornitura dei materiali di seguito elencati.', { s: 8 }), { before: 8, after: 2 }));
    if (pav) body.push(Pp(R('Resta escluso quanto non esplicitamente descritto.', { s: 8, b: true }), { after: 6 }));

    // tabella righe: le colonne di sconto vuote non compaiono; le righe «netto cliente» mostrano solo il netto
    const lines = o.righe || [];
    const anySc = lines.some(r => !(r.net || r.noList) && +(r.sc1 ?? r.sc) > 0), anyEx = lines.some(r => !(r.net || r.noList) && +r.sc2 > 0);
    const sL = lst && lines.some(r => !r.noList && +r.p > 0), sS = sc && anySc, sE = sc && anyEx;
    const cols = [['Codice', 1750], ['Descrizione', 0], ['Q.tà', 560, 'c'], ...(sL ? [['Listino Cad.', 1150, 'r']] : []), ...(sS ? [['Sc %', 640, 'c']] : []), ...(sE ? [['Ex %', 600, 'c']] : []), ['Prezzo Cad.', 1150, 'r'], ['Prezzo Tot.', 1250, 'r']];
    cols[1][1] = 9906 - cols.reduce((a, c) => a + c[1], 0);
    const longD = r => { if (r.dx && !pav) return r.dx; if (pav) return String(r.b || (fc(r.c, r.L) || {}).b || ''); const it = fc(r.c, r.L); return it && it.d && (!r.b || r.b === it.b) ? it.d : (r.b || (it && it.d) || ''); };
    const rows = [new TableRow({ tableHeader: true, children: cols.map(([h, w, a]) => cell(h, { head: true, fill: '808080', w, a: a || 'c' })) })];
    let sez = null;
    for (const r of lines) {
      if ((r.sez || '') !== sez) { sez = r.sez || ''; if (sez) rows.push(new TableRow({ children: [cell(sez, { b: true, fill: 'F0F0F0', span: cols.length })] })); }
      const t = lineTot(r); const net = r.net || r.noList; const s2 = +r.sc2 || 0, s1 = s2 ? (r.sc1 ?? r.sc) : r.sc;
      const v = [r.c, longD(r) + (r.net ? ' (prezzo netto)' : ''), String(r.q), ...(sL ? [net ? '' : eur(r.p)] : []), ...(sS ? [r.ncHide ? '' : net ? 'NETTO' : (+s1 ? fN.format(r2(s1)) : '-')] : []), ...(sE ? [r.ncHide ? '' : net ? '-' : s2 ? fN.format(r2(s2)) : '-'] : []), eur(t.unit), eur(t.netto)];
      rows.push(new TableRow({ cantSplit: true, children: v.map((x, k) => cell(x, { w: cols[k][1], a: cols[k][2], b: k === 0, c: k === v.length - 1 ? RED : undefined })) }));
    }
    const T = offTot(lines), iva = r2(T.N * 0.22);
    const tot = (l, v, op = {}) => new TableRow({ children: [cell(l, { span: cols.length - 1, a: 'r', b: op.b, fill: op.fill, s: op.b ? 9 : 8 }), cell(v, { a: 'r', b: true, c: op.c, fill: op.fill, s: op.b ? 9 : 8 })] });
    rows.push(tot('Subtotale', eur(T.N), { c: RED }), tot('IVA (22%)', eur(iva)), tot('Totale offerta', eur(T.N + iva), { b: true, fill: 'E8E8E8' }));
    body.push(new Table({ width: { size: 9906, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: cols.map(c => c[1]), rows }));
    // firme
    body.push(Pp(R(''), { before: 20 }), new Table({ width: { size: 9906, type: WidthType.DXA }, layout: TableLayoutType.FIXED, rows: [new TableRow({ children: [
      cell([img(hik, 36), mark ? img(mark, 36 * (0.693 - 0.228)) : null, Pp(R('HIKVISION ITALY SRL', { s: 7 }), { a: 'c', after: 0 })].filter(Boolean), { noB: true, w: 3600 }),
      cell([Pp(R('______________________', { s: 8, c: GREY }), { a: 'c', before: 30, after: 0 }), Pp(R('Luogo e data', { s: 7 }), { a: 'c', after: 0 })], { noB: true, w: 2600 }),
      cell([Pp(R('________________________________', { s: 8, c: GREY }), { a: 'c', before: 30, after: 0 }), Pp(R('Il committente (timbro/firma)', { s: 7 }), { a: 'c', after: 0 })], { noB: true, w: 3706 })] })] }));

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

    const docx = new Document({ creator: 'HIK PALERMO', title: 'Offerta ' + num, styles: { default: { document: { run: { font: 'Arial' } } } },
      sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
        footers: { default: new X.Footer({ children: [Pp(R('HIKVISION ITALY Srl - Viale Fulvio Testi, 113 - 20092 Cinisello Balsamo (MI) - P.IVA 07757250969', { s: 6.5, c: GREY }), { a: 'c', after: 0 })] }) },
        children: body.filter(Boolean) }] });
    const blob = await Packer.toBlob(docx);
    const name = ('Prev_' + num + '_' + cliName).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').toLowerCase() + (pav ? '_hikvision_proav' : '_hikvision') + '.docx';
    if (window.hpDlReady) hpDlReady(blob, name);
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
  };
})();
