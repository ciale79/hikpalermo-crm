/* HIK PALERMO — font Open Sans per tutti i PDF generati (offerte, elenchi, documenti di magazzino).
   Con hpPdfFont(doc) il documento jsPDF usa Open Sans al posto di Helvetica, anche nelle tabelle (autotable).
   Il grassetto: se /fonts/OpenSans-Bold.ttf c'è si usa quello, altrimenti si ottiene dal regular con un leggero contorno del testo. */
(function () {
  'use strict';
  const FILES = { normal: '/fonts/OpenSans-Regular.ttf', bold: '/fonts/OpenSans-Bold.ttf', italic: '/fonts/OpenSans-Italic.ttf', bolditalic: '/fonts/OpenSans-BoldItalic.ttf' };
  const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  let load = null;
  const getFonts = () => load || (load = Promise.all(Object.entries(FILES).map(async ([st, u]) => { try { const r = await fetch(u); if (!r.ok || !/font|octet|ttf/i.test(r.headers.get('content-type') || 'font')) return [st, null]; const buf = await r.arrayBuffer(); if (buf.byteLength < 10000) return [st, null]; return [st, b64(buf)]; } catch (e) { return [st, null]; } })).then(Object.fromEntries));
  window.hpPdfFontData = getFonts;
  window.hpPdfFont = async function (doc) {
    const F = await getFonts(); if (!F.normal) return doc; // senza il file si resta su Helvetica
    const have = {};
    for (const st of ['normal', 'bold', 'italic', 'bolditalic']) { const data = F[st] || (st === 'bolditalic' ? F.bold : null) || F.normal; const fn = 'OpenSans-' + st + '.ttf'; doc.addFileToVFS(fn, data); doc.addFont(fn, 'OpenSans', st); have[st] = !!F[st] || (st === 'bolditalic' && !!F.bold); }
    const sf0 = doc.setFont.bind(doc), tx0 = doc.text.bind(doc);
    let fake = false;
    doc.setFont = (name, style, weight) => {
      const n = String(name || 'helvetica').toLowerCase(); const st = String(style || 'normal').toLowerCase().replace('bold italic', 'bolditalic');
      if (/helvetica|arial|opensans|open sans|sans/.test(n)) { const real = have[st] ? st : /bold/.test(st) ? (have.bold ? 'bold' : 'normal') : 'normal'; fake = /bold/.test(st) && !have[st] && !(st === 'bolditalic' && have.bold); return sf0('OpenSans', real); }
      fake = false; return sf0(name, style, weight);
    };
    // grassetto simulato: riempimento + contorno sottile dello stesso colore del testo
    doc.text = (t, x, y, opt, ...rest) => {
      if (!fake) return tx0(t, x, y, opt, ...rest);
      const lw0 = doc.getLineWidth(), dc0 = doc.getDrawColor(); const tc = doc.getTextColor();
      doc.setLineWidth(doc.getFontSize() * 0.045 / doc.internal.scaleFactor); try { doc.setDrawColor(tc); } catch (e) { }
      const r = tx0(t, x, y, { ...(opt && typeof opt === 'object' ? opt : {}), renderingMode: 'fillThenStroke' }, ...rest);
      doc.setLineWidth(lw0); try { doc.setDrawColor(dc0); } catch (e) { } return r;
    };
    doc.setFont('helvetica', 'normal');
    return doc;
  };
})();
