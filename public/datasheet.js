/* HIK PALERMO — «Traduci Datasheet» 🇮🇹: traduce in italiano il datasheet di un articolo.
   Fonte: il PDF trovato nella scheda prodotto del listino (o la scheda stessa se è un PDF), oppure un PDF / link scelto dall'utente.
   Traduzione «sul posto»: ogni pagina del PDF viene disegnata così com'è (logo, foto, tabelle, colori) e ogni riga di testo viene coperta
   e riscritta in italiano nella stessa posizione, con lo stesso colore e una dimensione adattata allo spazio. Le righe le traduce 800AI (Sonnet)
   una sola volta: il PDF italiano resta salvato tra i file del sito per tutto il gruppo (raccolta «dstrad», id = codice normalizzato). */
(function () {
  'use strict';
  S.dsTrad = new Map();
  claude.use('db').then(db => { if (db) db.collection('dstrad').onSnapshot(sn => { const m = new Map(); sn.docs.forEach(d => m.set(d.id, { id: d.id, ...d.data() })); S.dsTrad = m; }, () => { }); });
  const nk = c => 'ds_' + String(c || '').toUpperCase().replace(/\([^()]*\)/g, '').replace(/[^A-Z0-9]/g, '').slice(0, 100);
  const flag = () => el('span', { class: 'hp-flag-it', role: 'img', 'aria-label': 'Italiano' });

  // pulsante (lista: etichetta piccola; scheda: pulsante)
  window.hpTradChip = function (code, url, big) {
    if (!code || !/^[A-Za-z]{1,8}-[A-Za-z0-9]/.test(String(code).trim())) return null;
    const done = S.dsTrad.has(nk(code));
    return el('button', { type: 'button', class: big ? 'btn hp-trbtn' : 'tag hp-trtag', title: done ? 'Datasheet già tradotto in italiano: aprilo' : 'Traduci in italiano il datasheet di ' + code, onclick: e => { e.stopPropagation(); open(code, url); } }, flag(), done ? 'Datasheet in italiano' : 'Traduci Datasheet');
  };

  const N = x => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  async function fetchRaw(u) {
    const r = await fetch('/api/fetch?u=' + encodeURIComponent(u), { credentials: 'same-origin' });
    if (!r.ok) { let m = 'errore ' + r.status; try { const j = await r.json(); m = j.error && j.error.message || m; } catch (e) { } throw new Error(m); }
    let fin = u; try { fin = decodeURIComponent(r.headers.get('x-final-url') || u); } catch (e) { }
    return { ct: (r.headers.get('content-type') || '').toLowerCase(), blob: await r.blob(), fin };
  }
  // nella pagina prodotto cerca i PDF del datasheet (prima quelli con «datasheet» e il codice)
  async function findPdf(code, url, say) {
    if (!url) return [];
    url = String(url).replace(/&amp;/g, '&');
    if (/\.pdf(\?|#|$)/i.test(url)) return [url];
    say('Leggo la scheda prodotto…');
    const { ct, blob, fin } = await fetchRaw(url);
    if (/pdf/.test(ct)) return [url];
    const html = await blob.text(); const d = new DOMParser().parseFromString(html, 'text/html');
    const k = N(String(code).replace(/\([^()]*\)/g, '').split('/')[0]);
    const links = [...d.querySelectorAll('a[href]')].map(a => { let h = a.getAttribute('href'); try { h = new URL(h, fin).href; } catch (e) { return null; } return { h, t: (a.textContent || '') + ' ' + (a.getAttribute('title') || '') }; }).filter(Boolean);
    for (const m of html.matchAll(/https?:[^"'\s<>]+?\.pdf[^"'\s<>]*/gi)) links.push({ h: m[0].replace(/\\\//g, '/'), t: '' });
    const pdf = links.filter(x => /\.pdf(\?|#|$)/i.test(x.h) || /datasheet/i.test(x.t + x.h) && /download|\/doc\//i.test(x.h));
    const rank = x => (/datasheet|data ?sheet|specific/i.test(x.t + x.h) ? 0 : 2) + (N(x.h).includes(k) ? 0 : 1) + (/manual|guide|quick|install|certif|declaration/i.test(x.t + x.h) ? 3 : 0);
    return [...new Set(pdf.sort((a, b) => rank(a) - rank(b)).map(x => x.h))].slice(0, 3);
  }
  async function pdfBytes(u) { const { ct, blob } = await fetchRaw(u); if (!/pdf/.test(ct) && !/\.pdf/i.test(u)) throw new Error('il link non è un PDF'); return await blob.arrayBuffer(); }
  const DOCX = 'https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js', PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', PDFW = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

  // righe di testo di una pagina: pezzi sulla stessa linea e vicini si uniscono in un segmento con posizione e dimensioni (in pixel del canvas)
  function segments(tc, vp) {
    const it = [];
    for (const x of tc.items) {
      if (!x.str || !x.str.trim()) continue;
      const t = pdfjsLib.Util.transform(vp.transform, x.transform); const h = Math.hypot(t[2], t[3]); if (h < 3) continue;
      const st = tc.styles[x.fontName] || {}; const bold = /bold|black|heavy|semibold|demi/i.test(x.fontName + ' ' + (st.fontFamily || ''));
      it.push({ x: t[4], y: t[5] - h * 0.82, w: x.width * vp.scale, h, s: x.str, bold, rot: Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01 && Math.abs(t[0]) < 0.01 });
    }
    it.sort((a, b) => Math.abs(a.y - b.y) < Math.min(a.h, b.h) * 0.35 ? a.x - b.x : a.y - b.y);
    const out = [];
    for (const x of it) {
      if (x.rot) continue;
      const L = out[out.length - 1];
      if (L && Math.abs(L.y - x.y) < Math.min(L.h, x.h) * 0.35 && x.x - (L.x + L.w) < Math.max(L.h, x.h) * 0.9 && x.x >= L.x + L.w - L.h * 0.5 && Math.abs(L.h - x.h) < L.h * 0.25) {
        const gap = x.x - (L.x + L.w); L.s += (gap > L.h * 0.15 && !/\s$/.test(L.s) && !/^\s/.test(x.s) ? ' ' : '') + x.s; L.w = x.x + x.w - L.x; L.bold = L.bold && x.bold;
      } else out.push({ ...x });
    }
    return out.map(x => ({ ...x, s: x.s.replace(/\s+/g, ' ').trim() })).filter(x => x.s);
  }
  // serve tradurre? (parole vere, non solo codici, numeri, unità o sigle)
  const needs = s => { const w = s.match(/[A-Za-zÀ-ÿ]{3,}/g) || []; if (!w.length) return false; if (/^[A-Z0-9][A-Z0-9\-\/().,+ ]*$/.test(s) && !/\b(AND|WITH|FOR|THE|OF)\b/.test(s)) return false; return true; };

  async function translateLines(code, lines, say) {
    const out = new Array(lines.length).fill(null);
    const idx = lines.map((s, i) => [i, s]).filter(([, s]) => needs(s));
    const uniq = [...new Set(idx.map(x => x[1]))];
    const map = new Map(); const CH = 180; let done = 0;
    const call = async part => {
      const prompt = `Traduci in italiano le righe di testo del datasheet Hikvision «${code}». Sono righe di un PDF impaginato (titoli, voci e valori di tabelle, note): traduci ogni riga da sola, in italiano tecnico professionale e conciso (la traduzione deve stare nello stesso spazio: preferisci termini brevi, es. "Risoluzione max", "Alimentazione", "Temp. di esercizio").
Lascia invariati codici, modelli, sigle, numeri, unità di misura, standard (IP67, IK10, H.265+, PoE, ONVIF, Wi-Fi…) e nomi registrati (AcuSense, ColorVu, DarkFighter, Hik-Connect…). Se una riga non va tradotta, ripetila uguale.
Rispondi SOLO con un array JSON di stringhe, stesso numero e stesso ordine delle righe ricevute.
RIGHE (${part.length}):
${JSON.stringify(part)}`;
      const r = await fetch('/api/claude', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-hp': '1' }, body: JSON.stringify({ max_tokens: 16000, model: 'claude-sonnet-5-5', feat: 'Traduzione datasheet', messages: [{ role: 'user', content: prompt }] }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { const msg = (j && j.error && j.error.message) || ''; if (/usage limits/i.test(msg)) throw new Error('limite di spesa mensile dell\'API raggiunto'); if (/credit balance/i.test(msg)) throw new Error('credito dell\'API esaurito'); throw new Error(msg || 'traduzione non riuscita'); }
      const t = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n'); const a = t.indexOf('['), b = t.lastIndexOf(']');
      const arr = JSON.parse(t.slice(a, b + 1)); if (!Array.isArray(arr)) throw new Error('risposta non valida');
      part.forEach((s, k) => { if (typeof arr[k] === 'string' && arr[k].trim()) map.set(s, arr[k].trim()); });
      done += part.length; say('800AI sta traducendo: ' + Math.min(done, uniq.length) + ' di ' + uniq.length + ' righe…');
    };
    const parts = []; for (let i = 0; i < uniq.length; i += CH) parts.push(uniq.slice(i, i + CH));
    say('800AI sta traducendo ' + uniq.length + ' righe…');
    for (let i = 0; i < parts.length; i += 3) await Promise.all(parts.slice(i, i + 3).map(call));
    for (const [i, s] of idx) out[i] = map.get(s) || null;
    return out;
  }

  // colore di sfondo e del testo di un riquadro, letti dai pixel della pagina disegnata
  function colors(g, x, y, w, h, W, H) {
    const X0 = Math.max(0, Math.floor(x - 2)), Y0 = Math.max(0, Math.floor(y - 1)), X1 = Math.min(W - 1, Math.ceil(x + w + 2)), Y1 = Math.min(H - 1, Math.ceil(y + h + 2));
    if (X1 <= X0 || Y1 <= Y0) return { bg: '#fff', fg: '#222' };
    const d = g.getImageData(X0, Y0, X1 - X0 + 1, Y1 - Y0 + 1).data; const n = d.length / 4;
    const cnt = new Map(); let dk = null, dl = 1e9, lt = null, ll = -1;
    for (let k = 0; k < n; k++) { const r = d[k * 4], gg = d[k * 4 + 1], b = d[k * 4 + 2]; const q = (r >> 4) + ',' + (gg >> 4) + ',' + (b >> 4); cnt.set(q, (cnt.get(q) || 0) + 1); const L = r * 0.3 + gg * 0.59 + b * 0.11; if (L < dl) { dl = L; dk = [r, gg, b]; } if (L > ll) { ll = L; lt = [r, gg, b]; } }
    let best = null, bn = 0; for (const [q, c] of cnt) if (c > bn) { bn = c; best = q; }
    const acc = [0, 0, 0]; let an = 0; for (let k = 0; k < n; k++) { const r = d[k * 4], gg = d[k * 4 + 1], b = d[k * 4 + 2]; if ((r >> 4) + ',' + (gg >> 4) + ',' + (b >> 4) === best) { acc[0] += r; acc[1] += gg; acc[2] += b; an++; } }
    const bg = acc.map(v => Math.round(v / an)); const bgL = bg[0] * 0.3 + bg[1] * 0.59 + bg[2] * 0.11;
    const fg = bgL > 128 ? dk : lt; // testo scuro su fondo chiaro, chiaro su fondo scuro
    return { bg: 'rgb(' + bg.join(',') + ')', fg: 'rgb(' + fg.join(',') + ')' };
  }

  async function layoutTranslate(code, buf, say) {
    await loadScript(PDFJS); await loadScript(PDFW); pdfjsLib.GlobalWorkerOptions.workerSrc = window.HP_PDFW || PDFW;
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    if (pdf.numPages > 12) throw new Error('il PDF ha ' + pdf.numPages + ' pagine: troppo lungo per un datasheet');
    const pages = []; const all = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      say('Leggo la pagina ' + p + ' di ' + pdf.numPages + '…');
      const pg = await pdf.getPage(p); const base = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: 2.2 });
      const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const g = cv.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      await pg.render({ canvasContext: g, viewport: vp }).promise;
      const segs = segments(await pg.getTextContent(), vp);
      pages.push({ cv, g, segs, wPt: base.width, hPt: base.height }); segs.forEach(x => all.push(x));
    }
    if (all.filter(x => needs(x.s)).length < 5) throw new Error('nel PDF non c\'è testo leggibile (forse è una scansione)');
    const tr = await translateLines(code, all.map(x => x.s), say);
    all.forEach((x, i) => { x.t = tr[i]; });
    say('Ricompongo le pagine in italiano…');
    for (const P of pages) {
      const { g, cv } = P; const W = cv.width, H = cv.height;
      const todo = P.segs.filter(x => x.t && x.t !== x.s).map(x => ({ ...x, c: colors(g, x.x, x.y, x.w, x.h, W, H) }));
      for (const x of todo) { g.fillStyle = x.c.bg; g.fillRect(x.x - 1.5, x.y - x.h * 0.12, x.w + 3, x.h * 1.3); }
      P.bg = cv.toDataURL('image/jpeg', 0.9); P.runs = []; // sfondo senza il testo tradotto: per il file Word, dove il testo resta modificabile
      for (const x of todo) {
        const FF = 'px Helvetica, Arial, sans-serif'; const s0 = x.h;
        // grassetto: il nome del font lo dice di rado, quindi si confronta la larghezza originale con quella normale e grassetto
        g.font = s0.toFixed(1) + FF; const wn = g.measureText(x.s).width; g.font = 'bold ' + s0.toFixed(1) + FF; const wb = g.measureText(x.s).width;
        const bold = x.bold || Math.abs(wb - x.w) < Math.abs(wn - x.w);
        // altezza del carattere stimata dalla larghezza originale (più precisa dell'altezza del box)
        let size = Math.min(s0 * 1.1, Math.max(s0 * 0.85, s0 * x.w / (bold ? wb : wn)));
        const font = sz => (bold ? 'bold ' : '') + sz.toFixed(1) + FF;
        // spazio disponibile: fino al testo successivo sulla stessa riga, o al margine della pagina
        const next = P.segs.filter(o => o !== x && o.x > x.x + x.w * 0.5 && Math.abs(o.y - x.y) < x.h * 0.5).reduce((a, o) => Math.min(a, o.x), W * 0.965);
        const room = Math.max(x.w, next - x.x - x.h * 0.45);
        g.font = font(size); let tw = g.measureText(x.t).width;
        if (tw > room) { size = Math.max(x.h * 0.55, size * room / tw); g.font = font(size); tw = g.measureText(x.t).width; }
        g.fillStyle = x.c.fg; g.textBaseline = 'alphabetic'; g.fillText(x.t, x.x, x.y + x.h * 0.82, tw > room ? room : undefined);
        P.runs.push({ t: x.t, x: x.x, y: x.y, size, bold, fg: x.c.fg, room: Math.max(room, tw) });
      }
    }
    await loadScript(JSPDF);
    const { jsPDF } = window.jspdf; let doc = null;
    for (const P of pages) {
      const o = P.wPt > P.hPt ? 'l' : 'p';
      if (!doc) doc = new jsPDF({ orientation: o, unit: 'pt', format: [P.wPt, P.hPt], compress: true }); else doc.addPage([P.wPt, P.hPt], o);
      doc.addImage(P.cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, P.wPt, P.hPt, undefined, 'FAST');
    }
    let docx = null; try { docx = await buildDocx(pages, 2.2); } catch (e) { console.warn('word', e); }
    return { blob: doc.output('blob'), docx, pages: pages.length, righe: all.filter(x => x.t && x.t !== x.s).length };
  }
  // file Word modificabile: ogni pagina ha la grafica originale come sfondo e il testo italiano in cornici nella stessa posizione
  async function buildDocx(pages, k) {
    await loadScript(DOCX);
    const X = window.docx; const tw = px => Math.round(px / k * 20); // pixel del canvas → twip
    const hex = c => { const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(c || ''); return m ? [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('') : '222222'; };
    const b64 = u => Uint8Array.from(atob(u.split(',')[1]), c => c.charCodeAt(0));
    const sections = pages.map(P => {
      const wPx = P.wPt * 96 / 72, hPx = P.hPt * 96 / 72;
      const bg = new X.Paragraph({ children: [new X.ImageRun({ type: 'jpg', data: b64(P.bg), transformation: { width: wPx, height: hPx }, floating: { horizontalPosition: { relative: 'page', offset: 0 }, verticalPosition: { relative: 'page', offset: 0 }, behindDocument: true, allowOverlap: true } })] });
      const frames = (P.runs || []).map(r => new X.Paragraph({
        frame: { type: 'absolute', position: { x: tw(r.x), y: tw(r.y - r.size * 0.1) }, width: tw(r.room + r.size * 0.6), height: tw(r.size * 1.25), anchor: { horizontal: 'page', vertical: 'page' }, wrap: 'none', rule: 'atLeast' },
        spacing: { before: 0, after: 0, line: 240 },
        children: [new X.TextRun({ text: r.t, bold: r.bold, size: Math.max(8, Math.round(r.size / k * 2)), color: hex(r.fg), font: 'Arial' })]
      }));
      return { properties: { page: { size: { width: Math.round(P.wPt * 20), height: Math.round(P.hPt * 20) }, margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 } } }, children: [bg, ...frames] };
    });
    return await X.Packer.toBlob(new X.Document({ sections }));
  }

  async function run(code, src, getBytes, box, m) {
    const say = t => box.replaceChildren(el('div', { class: 'row', style: 'gap:8px' }, el('span', { class: 'spin' }), el('span', {}, t)));
    try {
      const buf = await getBytes(say);
      const res = await layoutTranslate(code, buf, say);
      say('Salvo il PDF in italiano…');
      const up = await fetch('/api/blob', { method: 'POST', credentials: 'same-origin', headers: { 'x-hp': '1', 'content-type': 'application/pdf', 'x-name': encodeURIComponent('Datasheet ' + code + ' IT.pdf') }, body: res.blob });
      if (!up.ok) throw new Error('salvataggio non riuscito (' + up.status + ')');
      const id = (await up.json()).id; const old = S.dsTrad.get(nk(code));
      let wid = null;
      if (res.docx) { const uw = await fetch('/api/blob', { method: 'POST', credentials: 'same-origin', headers: { 'x-hp': '1', 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x-name': encodeURIComponent('Datasheet ' + code + ' IT.docx') }, body: res.docx }); if (uw.ok) wid = (await uw.json()).id; }
      const D = { code, pdf: id, docx: wid, pages: res.pages, righe: res.righe, size: res.blob.size, src: src || '', at: Date.now(), by: S.me };
      await put('dstrad', nk(code), D); S.dsTrad.set(nk(code), D);
      for (const b of [old && old.pdf, old && old.docx]) if (b && b !== id && b !== wid) fetch('/api/blob/' + b, { method: 'DELETE', credentials: 'same-origin', headers: { 'x-hp': '1' } }).catch(() => { });
      m.close(); open(code, src);
    } catch (e) { box.replaceChildren(el('div', { class: 'banner', style: 'border-color:var(--accent)' }, 'Traduzione non riuscita: ' + (e.message || e)), chooser(code, src, box, m)); }
  }

  function view(D) {
    return el('div', { class: 'stack hp-dsit' },
      el('div', { class: 'row', style: 'gap:8px' }, flag(), el('b', { class: 'mono' }, D.code), D.src ? el('a', { class: 'hint', href: D.src, target: '_blank', rel: 'noopener' }, 'originale in inglese ↗') : null),
      el('h2', { style: 'margin:0' }, D.titolo || D.code), D.sintesi ? el('p', { style: 'margin:0' }, D.sintesi) : null,
      (D.punti || []).length ? el('ul', { style: 'margin:0;padding-left:18px' }, D.punti.map(p => el('li', {}, p))) : null,
      ...(D.sezioni || []).map(s => el('section', { class: 'stack', style: 'gap:4px' }, el('h4', { style: 'margin:6px 0 0' }, s.titolo || ''),
        el('table', { class: 'hp-dstbl' }, el('tbody', {}, (s.righe || []).map(r => el('tr', {}, el('th', {}, String(r[0] ?? '')), el('td', {}, String(r[1] ?? '')))))))),
      el('p', { class: 'hint' }, 'Traduzione automatica di 800AI del ' + new Date(D.at || Date.now()).toLocaleDateString('it-IT') + (D.by ? ' (richiesta da ' + nm(D.by) + ')' : '') + ': in caso di dubbio fa fede il datasheet originale.'));
  }
  function printIt(D) {
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const h = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Datasheet ${esc(D.code)} (italiano)</title><style>body{font-family:Arial,Helvetica,sans-serif;color:#1c2430;margin:28px;font-size:11pt}h1{font-size:18pt;margin:0 0 4px}.c{font-family:Consolas,monospace;color:#C8102E;font-weight:700}h2{font-size:12pt;margin:16px 0 4px;border-bottom:2px solid #C8102E;padding-bottom:2px}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:4px 6px;border-bottom:1px solid #e1e5ea;font-size:10pt}th{width:34%;color:#45576A;font-weight:600}.n{color:#6e7a8a;font-size:8.5pt;margin-top:18px}ul{margin:6px 0;padding-left:18px}@media print{body{margin:12mm}}</style></head><body>
<div class="c">${esc(D.code)}</div><h1>${esc(D.titolo || D.code)}</h1><p>${esc(D.sintesi || '')}</p>${(D.punti || []).length ? '<ul>' + D.punti.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>' : ''}
${(D.sezioni || []).map(s => '<h2>' + esc(s.titolo) + '</h2><table>' + (s.righe || []).map(r => '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>').join('') + '</table>').join('')}
<p class="n">Traduzione automatica dal datasheet originale in inglese${D.src ? ' (' + esc(D.src) + ')' : ''}. In caso di dubbio fa fede il documento originale.</p><script>setTimeout(()=>print(),300)<\/script></body></html>`;
    const w = window.open('', '_blank'); if (!w) { toast('Il browser ha bloccato la finestra: consenti i popup per stampare.', 'bad'); return; } w.document.write(h); w.document.close();
  }

  // scelta manuale della fonte: un PDF dal computer o un link
  function chooser(code, url, box, m) {
    const fIn = el('input', { type: 'file', accept: '.pdf', hidden: true });
    fIn.addEventListener('change', () => { const f = fIn.files[0]; fIn.value = ''; if (f) run(code, '', async say => { say('Leggo il PDF…'); return f.arrayBuffer(); }, box, m); });
    const lIn = el('input', { type: 'url', placeholder: 'Link al PDF del datasheet (https://…)', style: 'flex:1;min-width:240px' });
    const go = () => { const u = lIn.value.trim(); if (!/^https?:\/\//i.test(u)) { toast('Incolla un link che inizia con https://', 'bad'); return; } run(code, u, async say => { const pd = await findPdf(code, u, say); if (!pd.length) throw new Error('nel link non ho trovato un PDF'); say('Scarico il PDF…'); return pdfBytes(pd[0]); }, box, m); };
    lIn.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    const g = 'https://www.google.com/search?q=' + encodeURIComponent('site:hikvision.com ' + code + ' datasheet filetype:pdf');
    return el('div', { class: 'stack', style: 'gap:8px' }, el('p', { class: 'hint', style: 'margin:0' }, 'Scegli il datasheet da tradurre: carica il PDF o incolla il link. ', el('a', { href: g, target: '_blank', rel: 'noopener' }, 'Cercalo su Google ↗')),
      el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, btn('Carica PDF', () => fIn.click(), 'pri', 'up'), lIn, btn('Traduci dal link', go, '', 'ext')), fIn);
  }

  function open(code, url) {
    const D = S.dsTrad.get(nk(code));
    const box = el('div', { class: 'stack' });
    let acts = [];
    if (D && D.pdf) {
      const href = '/_blob/' + D.pdf; const name = 'Datasheet ' + code.replace(/[\\/:*?"<>|]+/g, '-') + ' IT.pdf';
      acts = [btn('Traduci di nuovo', () => { m.close(); fresh(code, url); }, 'ghost'), el('a', { class: 'btn', href, target: '_blank', rel: 'noopener' }, ic('ext', 16), 'Apri in una scheda'), D.docx ? el('a', { class: 'btn', href: '/_blob/' + D.docx, download: name.replace(/\.pdf$/, '.docx'), title: 'File Word con la grafica originale come sfondo e il testo italiano modificabile' }, ic('doc', 16), 'Scarica Word') : null, el('a', { class: 'btn pri', href, download: name }, ic('dl', 16), 'Scarica PDF')].filter(Boolean);
      box.append(el('div', { class: 'row', style: 'gap:8px' }, flag(), el('b', { class: 'mono' }, code), el('span', { class: 'hint' }, D.pages + (D.pages === 1 ? ' pagina' : ' pagine') + ' · ' + (D.righe || 0) + ' righe tradotte · ' + new Date(D.at).toLocaleDateString('it-IT') + (D.by ? ' · ' + nm(D.by) : '')), D.src ? el('a', { class: 'hint', href: D.src, target: '_blank', rel: 'noopener' }, 'originale ↗') : null),
        el('iframe', { src: href + '#view=FitH', title: 'Datasheet in italiano', class: 'hp-dsframe' }),
        el('p', { class: 'hint', style: 'margin:0' }, 'Grafica del PDF originale con il testo tradotto da 800AI: in caso di dubbio fa fede il datasheet originale.'));
    } else if (D) {
      acts = [btn('Rifai con la grafica originale', () => { m.close(); fresh(code, url); }, 'pri'), btn('Stampa / PDF', () => printIt(D), '', 'dl')];
      box.append(view(D));
    }
    const m = modal('Datasheet in italiano · ' + code, box, [el('span', { class: 'grow' }), ...acts, btn('Chiudi', () => m.close())], { wide: true });
    if (!D) fresh(code, url, box, m);
  }
  function fresh(code, url, box, m) {
    if (!box) { box = el('div', { class: 'stack' }); m = modal('Datasheet in italiano · ' + code, box, [el('span', { class: 'grow' }), btn('Chiudi', () => m.close())], { wide: true }); }
    if (url) run(code, url, async say => { const pd = await findPdf(code, url, say); if (!pd.length) throw new Error('nella scheda prodotto del listino non ho trovato il PDF del datasheet'); let last; for (const u of pd) { try { say('Scarico il PDF…'); return await pdfBytes(u); } catch (e) { last = e; } } throw last; }, box, m);
    else box.replaceChildren(el('p', { style: 'margin:0' }, 'Per ' + code + ' il listino non ha il link alla scheda prodotto.'), chooser(code, '', box, m));
  }
  window.hpTradOpen = open;
  window.hpTradBytes = (code, buf) => { const box = el('div', { class: 'stack' }); const m = modal('Datasheet in italiano · ' + code, box, [el('span', { class: 'grow' }), btn('Chiudi', () => m.close())], { wide: true }); run(code, '', async () => buf, box, m); };
})();
