/* HIK PALERMO — esportazione Excel dell'offerta con le immagini dei prodotti, nel formato dei listini Pro e Solution
   (immagine, codice SAP, codice, sezione, famiglia, descrizione breve ed estesa, prezzi).
   Il file .xlsx si scrive qui senza librerie: XML di Office Open e uno ZIP senza compressione, immagini JPEG ancorate alle celle. */
(function () {
  'use strict';
  /* ---------- ZIP (solo archiviazione) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = new TextEncoder();
  function zip(files) { // files: [{ name, data: Uint8Array|string }]
    const parts = [], cen = []; let off = 0;
    const d = new Date(); const dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, tm, true); h.setUint16(12, dt, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, tm, true); c.setUint16(14, dt, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      cen.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
    }
    const csz = cen.reduce((a, b) => a + b.length, 0);
    const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const esc = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colL = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const b64u8 = d => { const b = atob(String(d).split(',')[1] || ''); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

  /* stili: 0 normale · 1 intestazione (scuro, bianco, grassetto) · 2 testo a capo · 3 euro · 4 numero · 5 sezione · 6 titolo · 7 etichetta · 8 euro grassetto (totale) · 9 codice grassetto · 10 percentuale · 11 euro rosso grassetto */
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;€&quot;\\ #,##0.00####"/><numFmt numFmtId="165" formatCode="#,##0.####"/><numFmt numFmtId="166" formatCode="0.##&quot;%&quot;"/></numFmts>
<fonts count="6"><font><sz val="10"/><color rgb="FF404040"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="10"/><color rgb="FF333333"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="14"/><color rgb="FFC8102E"/><name val="Calibri"/><family val="2"/></font><font><sz val="9"/><color rgb="FF808080"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="10"/><color rgb="FFC8102E"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF3C3C3C"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEEFF1"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFC8CBD0"/></left><right style="thin"><color rgb="FFC8CBD0"/></right><top style="thin"><color rgb="FFC8CBD0"/></top><bottom style="thin"><color rgb="FFC8CBD0"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="5" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  /* rows: [{ h?: altezza in punti, cells: [{ v, s, t:'n'|'s' } | null], img?: dataURL (colonna A) }], merges: ['A1:C1'] */
  function xlsx(sheetName, cols, rows, merges) {
    const media = []; const anchors = [];
    const sd = rows.map((r, ri) => {
      const cs = (r.cells || []).map((c, ci) => { if (c == null) return ''; const ref = colL(ci) + (ri + 1); const s = c.s ? ` s="${c.s}"` : '';
        if (c.v === '' || c.v == null) return `<c r="${ref}"${s}/>`;
        if (typeof c.v === 'number' && isFinite(c.v)) return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
        return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`; }).join('');
      if (r.img) { const id = media.length + 1; media.push(b64u8(r.img)); const px = r.imgPx || 64; const emu = Math.round(px * 9525); const off = 4 * 9525;
        anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>${off}</xdr:colOff><xdr:row>${ri}</xdr:row><xdr:rowOff>${off}</xdr:rowOff></xdr:from><xdr:ext cx="${emu}" cy="${emu}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id + 1}" name="Immagine ${id}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId${id}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu}" cy="${emu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`); }
      return `<row r="${ri + 1}"${r.h ? ` ht="${r.h}" customHeight="1"` : ''}>${cs}</row>`;
    }).join('');
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0" zoomScale="100"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>
<cols>${cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${sd}</sheetData>${merges && merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>${media.length ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${media.length ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(sheetName)}</dc:title><dc:creator>HIK PALERMO</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: STYLES },
      { name: 'xl/worksheets/sheet1.xml', data: sheet }];
    if (media.length) {
      files.push({ name: 'xl/worksheets/_rels/sheet1.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>` });
      files.push({ name: 'xl/drawings/drawing1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors.join('')}</xdr:wsDr>` });
      files.push({ name: 'xl/drawings/_rels/drawing1.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${media.map((m, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${i + 1}.jpeg"/>`).join('')}</Relationships>` });
      media.forEach((m, i) => files.push({ name: 'xl/media/image' + (i + 1) + '.jpeg', data: m }));
    }
    return zip(files);
  }
  window.hpXlsxWrite = xlsx;

  /* ---------- offerta → Excel con le immagini ---------- */
  window.hpOffXlsxImg = async function (o, sc, lst, pav) {
    const fc = (c, L) => { try { return typeof findCode === 'function' ? findCode(c, L) : null; } catch (e) { return null; } };
    const L0 = o.righe || []; const com = S.commesse.get(o.commessaId), cli = S.clienti.get(o.clienteId) || {};
    if (window.toast) toast('Preparo l\'Excel con le immagini…');
    const imgOf = r => (pav && window.hpPavProdImg ? hpPavProdImg({ ...r, c: window.hpPavMainC ? hpPavMainC(r.c) : r.c }, false) : window.hpProdThumb ? hpProdThumb(r, 200) : Promise.resolve(null)).catch(() => null);
    const ths = await Promise.all(L0.map(imgOf));
    const showSc = sc && L0.some(r => !(r.net || r.noList) && +r.sc > 0), showL = lst && L0.some(r => !r.noList && +r.p > 0);
    const H = ['Immagine', 'Codice SAP', 'Codice', 'Sezione', 'Famiglia', 'Descrizione', 'Descrizione estesa', 'Q.tà', ...(showL ? ['Prezzo listino'] : []), ...(showSc ? ['Sconto %'] : []), 'Prezzo netto', 'Totale netto'];
    const W = [12, 13, 24, 18, 22, 38, 60, 8, ...(showL ? [14] : []), ...(showSc ? [10] : []), 14, 15];
    const nC = H.length; const last = colL(nC - 1);
    const dt = o.data ? o.data.split('-').reverse().join('/') : new Date().toLocaleDateString('it-IT');
    const rows = [
      { h: 24, cells: [{ v: 'Offerta ' + (o.numero || ''), s: 6 }] },
      { cells: [{ v: [cli.nome, o.titolo || (com && com.nome)].filter(Boolean).join(' · '), s: 0 }] },
      { cells: [{ v: 'del ' + dt + (o.by && typeof nm === 'function' ? ' · redatta da ' + nm(o.by) : ''), s: 7 }] },
      { cells: [] },
      { h: 30, cells: H.map(h => ({ v: h, s: 1 })) }];
    const merges = ['A1:' + last + '1', 'A2:' + last + '2', 'A3:' + last + '3'];
    let sez = null;
    L0.forEach((r, i) => {
      if ((r.sez || '') !== sez) { sez = r.sez || ''; if (sez) { rows.push({ h: 20, cells: [{ v: sez, s: 5 }, ...Array(nC - 1).fill({ v: '', s: 5 })] }); merges.push('A' + rows.length + ':' + last + rows.length); } }
      const it = fc(r.c, r.L) || {}; const t = lineTot(r); const net = r.net || r.noList;
      const sap = window.hpSapList ? hpSapList(r).join(' / ') : (it.sap || r.sap || '');
      const longD = window.hpPavLongD && pav ? hpPavLongD(r) : (r.dx != null ? r.dx : it.d && it.d !== (r.b || it.b) ? it.d : '');
      const LQ = pav && window.hpLedQ ? hpLedQ(r) : null;
      rows.push({ h: 54, img: ths[i], imgPx: 64, cells: [{ v: '', s: 2 }, { v: sap, s: 2 }, { v: window.hpKitCode ? hpKitCode(r.c) : r.c, s: 9 }, { v: r.sz || it.sz || '', s: 2 }, { v: r.fm || it.fm || '', s: 2 }, { v: r.b || it.b || '', s: 2 }, { v: String(longD || '').slice(0, 1500), s: 2 },
        { v: +r.q || 0, s: 4 }, ...(showL ? [{ v: net ? '' : +r.p || 0, s: 3 }] : []), ...(showSc ? [{ v: net || r.ncHide ? '' : exact(+r.sc || 0), s: 10 }] : []), { v: t.unit, s: 3 }, { v: t.netto, s: 11 }] });
      if (LQ && LQ.kit) rows[rows.length - 1].cells[7] = { v: (Math.round(LQ.mq * 100) / 100).toLocaleString('it-IT') + ' m²', s: 4 };
    });
    const T = offTot(L0), iva = (window.hpExact ? hpExact : exact)(T.N * 0.22);
    const lab = (l, v, s) => { const cs = Array(nC).fill(null); cs[nC - 2] = { v: l, s: s === 8 ? 5 : 2 }; cs[nC - 1] = { v, s }; rows.push({ h: 20, cells: cs }); };
    rows.push({ cells: [] }); lab('Subtotale', T.N, 11); lab('IVA (22%)', iva, 3); lab('Totale offerta', T.N + iva, 8);
    if (o.note) { rows.push({ cells: [] }, { cells: [{ v: 'Note', s: 7 }] }, { h: 60, cells: [{ v: o.note, s: 2 }] }); merges.push('A' + rows.length + ':' + last + rows.length); }
    const blob = xlsx('Offerta', W, rows, merges);
    const name = ('Offerta_' + (o.numero || '') + '_' + (cli.nome || '')).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').toLowerCase() + '.xlsx';
    if (window.hpDlReady) hpDlReady(blob, name); else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000); }
  };
})();
