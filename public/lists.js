/* HIK PALERMO — elenchi: ordinamento per colonna (crescente/decrescente) ed esportazione CSV, Excel, PDF.
   Si aggancia a ogni tabella-elenco mostrata nelle pagine, senza toccare il codice delle singole viste. */
(function () {
  'use strict';
  const KEY = 'hp_sort_v1';
  let state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { state = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { } };
  const MESI = { gen: 0, feb: 1, mar: 2, apr: 3, mag: 4, giu: 5, lug: 6, ago: 7, set: 8, ott: 9, nov: 10, dic: 11 };

  /* ---------- lettura del valore di una cella ---------- */
  // testo leggibile della cella: salta avatar e icone, va a capo sui blocchi
  function lines(td) {
    if (!td) return [];
    const selTxt = [...td.querySelectorAll('select')].map(x => (x.options[x.selectedIndex] || {}).text || '');
    const c = td.cloneNode(true);
    c.querySelectorAll('select').forEach((x, i) => x.replaceWith(document.createTextNode((selTxt[i] || '') + '\n')));
    c.querySelectorAll('input[type=checkbox], input[type=radio]').forEach(x => x.remove());
    c.querySelectorAll('.avatar, .ini, svg, img, [aria-hidden="true"], .hp-sa').forEach(x => x.remove());
    c.querySelectorAll('div, small, p, li, br, b, strong, .pill, .tag, .cell-t > *, .stack > *, .row > *').forEach(x => x.after(document.createTextNode('\n')));
    return (c.textContent || '').replace(/ /g, ' ').split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }
  const cellText = td => lines(td).join(' · ');
  const firstLine = td => lines(td)[0] || '';
  function num(s) {
    let t = String(s).trim();
    if (!t || t === '—' || t === '-') return null;
    let mult = 1;
    if (/\bM€|\bmln\b/i.test(t)) mult = 1e6; else if (/\bk€/i.test(t)) mult = 1e3;
    t = t.replace(/€|%|M€|k€|mln/gi, '').replace(/\s/g, '');
    if (!/^[-+]?[\d.]*\d(,\d+)?$/.test(t)) return null;
    const v = parseFloat(t.replace(/\./g, '').replace(',', '.'));
    return isFinite(v) ? v * mult : null;
  }
  function date(s) {
    const t = String(s).trim().toLowerCase();
    let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t);
    if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(y, +m[2] - 1, +m[1]).getTime(); }
    m = /^(?:\w{3}\s+)?(\d{1,2})\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)\w*\.?\s+(\d{4})/.exec(t);
    if (m) return new Date(+m[3], MESI[m[2]], +m[1]).getTime();
    return null;
  }
  function sortVal(td) {
    if (!td) return { t: 3, v: '' };
    if (td.dataset && td.dataset.sort != null) { const n = Number(td.dataset.sort); return isFinite(n) ? { t: 0, v: n } : { t: 2, v: td.dataset.sort }; }
    const f = firstLine(td);
    if (!f || f === '—') return { t: 3, v: '' };
    const n = num(f); if (n != null) return { t: 0, v: n };
    const d = date(f); if (d != null) return { t: 1, v: d };
    return { t: 2, v: cellText(td).toLowerCase() };
  }
  const coll = new Intl.Collator('it', { numeric: true, sensitivity: 'base' });
  function cmp(a, b) {
    if (a.t === 3 || b.t === 3) return a.t === b.t ? 0 : a.t === 3 ? 1 : -1; // vuoti sempre in fondo
    if (a.t !== b.t) return a.t - b.t;
    return a.t === 2 ? coll.compare(a.v, b.v) : a.v - b.v;
  }

  /* ---------- quali tabelle ---------- */
  function eligible(tbl) {
    if (tbl.classList.contains('cmp') || tbl.classList.contains('disc-tbl') || tbl.dataset.nosort != null) return false;
    if (tbl.closest('.modal, dialog, .lmap, .ov')) return false;
    const th = tbl.tHead && tbl.tHead.rows[0];
    if (!th || th.cells.length < 2) return false;
    const body = tbl.tBodies[0];
    if (!body || body.rows.length < 1) return false;
    if (body.querySelector('textarea, input:not([type=checkbox]):not([type=radio])')) return false; // tabelle di modifica (righe offerta)
    return true;
  }
  const headers = tbl => [...tbl.tHead.rows[0].cells].map(c => (c.dataset.h || c.textContent || '').replace(/[▲▼↕]/g, '').replace(/\s+/g, ' ').trim());
  const keyOf = tbl => ((typeof S !== 'undefined' && S.view) || 'x') + '|' + headers(tbl).join('|');

  /* ---------- ordinamento ---------- */
  function apply(tbl) {
    const st = state[tbl._hpKey];
    const ths = [...tbl.tHead.rows[0].cells];
    ths.forEach((c, i) => {
      const on = st && st.c === i;
      c.setAttribute('aria-sort', on ? (st.d > 0 ? 'ascending' : 'descending') : 'none');
      const a = c.querySelector('.hp-sa'); if (a) a.textContent = on ? (st.d > 0 ? '▲' : '▼') : '↕';
      c.classList.toggle('hp-on', !!on);
    });
    const body = tbl.tBodies[0];
    if (!body._hpOrig) body._hpOrig = [...body.rows];
    let rows = body._hpOrig;
    if (st && st.c < ths.length) {
      // le righe di intestazione di gruppo (una cella con colspan) dividono l'elenco in blocchi: si ordina dentro ogni blocco
      const blocks = []; let cur = { head: null, rows: [] };
      for (const r of rows) {
        if (r.cells.length === 1 && r.cells[0].colSpan > 1) { if (cur.head || cur.rows.length) blocks.push(cur); cur = { head: r, rows: [] }; }
        else cur.rows.push(r);
      }
      blocks.push(cur);
      const out = [];
      for (const b of blocks) {
        const keyed = b.rows.map((r, i) => ({ r, i, k: sortVal(r.cells[st.c]) }));
        keyed.sort((x, y) => { const c = cmp(x.k, y.k); return (x.k.t === 3 || y.k.t === 3) ? c : c * st.d || x.i - y.i; });
        if (b.head) out.push(b.head);
        keyed.forEach(x => out.push(x.r));
      }
      rows = out;
    }
    tbl._hpBusy = true;
    body.append(...rows);
    tbl._hpBusy = false;
  }
  function clickHead(tbl, i) {
    const st = state[tbl._hpKey];
    if (!st || st.c !== i) state[tbl._hpKey] = { c: i, d: 1 };
    else if (st.d === 1) state[tbl._hpKey] = { c: i, d: -1 };
    else delete state[tbl._hpKey]; // terzo clic: ordine originale
    save(); apply(tbl);
  }

  /* ---------- esportazione ---------- */
  function matrix(tbl) {
    const H = headers(tbl);
    const keep = H.map((h, i) => h !== '' || [...tbl.tBodies[0].rows].some(r => r.cells[i] && cellText(r.cells[i])));
    const rows = [];
    for (const r of tbl.tBodies[0].rows) {
      if (r.hidden || r.style.display === 'none') continue;
      if (r.cells.length === 1 && r.cells[0].colSpan > 1) { rows.push({ group: cellText(r.cells[0]) }); continue; }
      const im = r.querySelector('img.hp-afimg, img.mg-uimg, img.thumbimg, .thumb:not(.none)');
      rows.push({ img: im || null, cells: [...r.cells].map(c => { const L = lines(c); const f = L[0] || ''; const n = num(f); const d = n == null && L.length === 1 ? date(f) : null; const full = L.join(' · '); return { text: n != null && L.length > 1 ? f : full, n, d, extra: n != null && L.length > 1 ? L.slice(1).join(' · ') : '' }; }) });
    }
    return { H: H.map((h, i) => h || 'Colonna ' + (i + 1)).filter((h, i) => keep[i]), rows: rows.map(x => x.group != null ? x : { img: x.img, cells: x.cells.filter((c, i) => keep[i]) }) };
  }
  function title(tbl) {
    const v = (typeof VIEWS !== 'undefined' && typeof S !== 'undefined' && VIEWS[S.view] && VIEWS[S.view].title && VIEWS[S.view].title()) || 'Elenco';
    const p = tbl.closest('section.panel, details');
    const h = p && p.querySelector('h3, summary b');
    const t = h && h.textContent.trim();
    return t && t.length < 70 ? t : v;
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  const fname = (t, ext) => ('Hikvision - ' + t + ' - ' + stamp()).replace(/[\\/:*?"<>|]/g, '-') + '.' + ext;
  async function saveBlob(name, blob) {
    try { const d = await claude.use('downloads'); if (d) { await d.save({ filename: name, data: blob }); return; } } catch (e) { }
    const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  }
  async function exportCsv(tbl) {
    const { H, rows } = matrix(tbl);
    const q = v => { const s = String(v ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const out = [H.map(q).join(';')];
    for (const r of rows) {
      if (r.group != null) { out.push(q(r.group)); continue; }
      out.push(r.cells.map(c => q(c.n != null ? String(c.n).replace('.', ',') : c.d != null ? new Date(c.d).toLocaleDateString('it-IT') : c.text)).join(';'));
    }
    await saveBlob(fname(title(tbl), 'csv'), new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  }
  async function exportXlsx(tbl) {
    const X = await xlsxLib();
    const { H, rows } = matrix(tbl);
    const aoa = [H];
    for (const r of rows) aoa.push(r.group != null ? [r.group] : r.cells.map(c => c.n != null ? c.n : c.d != null ? new Date(c.d) : c.text));
    const ws = X.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: 'dd/mm/yyyy' });
    ws['!cols'] = H.map((h, i) => ({ wch: Math.min(60, Math.max(h.length, ...aoa.slice(1).map(r => String(r[i] ?? '').length)) + 2) }));
    ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: H.length - 1 } }) };
    // formato euro sulle colonne con importi
    H.forEach((h, i) => {
      const money = /valore|importo|netto|listino|utile|fatturato|prezzo|totale|target|€/i.test(h);
      if (!money) return;
      for (let r = 1; r < aoa.length; r++) { const c = ws[X.utils.encode_cell({ r, c: i })]; if (c && c.t === 'n') c.z = '#,##0 "€"'; }
    });
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, title(tbl).slice(0, 31).replace(/[\\/?*[\]:]/g, ' ') || 'Elenco');
    const buf = X.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true });
    await saveBlob(fname(title(tbl), 'xlsx'), new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  /* anteprime: <img> (foto caricate) o miniature del listino (sprite CSS) → immagine JPEG per il PDF */
  const sprites = new Map();
  const loadImg = src => { if (!sprites.has(src)) sprites.set(src, new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; })); return sprites.get(src); };
  async function imgData(node, px = 160) {
    try {
      const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, px, px);
      if (node.tagName === 'IMG') {
        const im = await loadImg(node.currentSrc || node.src); const k = Math.min(px / im.naturalWidth, px / im.naturalHeight);
        const w = im.naturalWidth * k, h = im.naturalHeight * k; g.drawImage(im, (px - w) / 2, (px - h) / 2, w, h);
      } else {
        const cs = node.style.backgroundImage ? node.style : getComputedStyle(node); const m = /url\(["']?([^"')]+)["']?\)/.exec(cs.backgroundImage); if (!m) return null;
        const im = await loadImg(m[1]); const [bw] = cs.backgroundSize.split(' ').map(parseFloat); const [px0, py0] = cs.backgroundPosition.split(' ').map(parseFloat);
        const el = node.getBoundingClientRect(); const size = parseFloat(node.style.width) || el.width || 48; const r = im.naturalWidth / bw;
        g.drawImage(im, -px0 * r, -py0 * r, size * r, size * r, 0, 0, px, px);
      }
      return c.toDataURL('image/jpeg', .85);
    } catch (e) { return null; }
  }
  window.hpImgData = imgData;
  async function exportPdf(tbl) {
    if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    if (!window.jspdf.jsPDF.API.autoTable) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    const { jsPDF } = window.jspdf;
    const { H: H0, rows } = matrix(tbl);
    const withImg = rows.some(r => r.img);
    const imgs = withImg ? await Promise.all(rows.map(r => r.img ? imgData(r.img) : null)) : [];
    const H = withImg ? ['', ...H0] : H0;
    if (withImg) rows.forEach(r => { if (r.cells) r.cells = [{ text: '' }, ...r.cells]; });
    const doc = new jsPDF({ orientation: H.length > 5 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const t = title(tbl);
    // intestazione con il logo ufficiale Hikvision
    try { const lg = await loadImg('/hik-logo.png'); const c = document.createElement('canvas'); c.width = 1000; c.height = Math.round(1000 * lg.naturalHeight / lg.naturalWidth); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(lg, 0, 0, c.width, c.height); doc.addImage(c.toDataURL('image/png'), 'PNG', 10, 5, 46, 46 * c.height / c.width); } catch (e) { doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(15); doc.setTextColor(215, 25, 32); doc.text('HIKVISION', 10, 11); }
    doc.setFillColor(215, 25, 32); doc.rect(0, 15, W, .8, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110, 112, 116); doc.text(new Date().toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' }), W - 10, 10.5, { align: 'right' });
    doc.setTextColor(20, 33, 44); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(t, 10, 25);
    const n = rows.filter(r => r.group == null).length;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(118, 135, 151); doc.text(n + (n === 1 ? ' riga' : ' righe'), 10, 30);
    const numCols = H.map((h, i) => rows.filter(r => r.cells).every(r => !r.cells[i] || r.cells[i].n != null || !r.cells[i].text || r.cells[i].text === '—'));
    const bodyRows = rows.map((r, i) => i);
    const body = rows.map(r => r.group != null ? [{ content: r.group, colSpan: H.length, styles: { fontStyle: 'bold', fillColor: [233, 237, 241] } }] : r.cells.map(c => (c.n != null ? c.text.replace(/^0+(\d)/, '$1') : c.text) + (c.extra ? '\n' + c.extra : '')));
    doc.autoTable({
      head: [H], body, startY: 34, margin: { left: 10, right: 10 },
      styles: { fontSize: 8, cellPadding: 1.8, overflow: 'linebreak', textColor: [20, 33, 44], lineColor: [211, 218, 225], lineWidth: .1 },
      headStyles: { fillColor: [20, 33, 44], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [246, 248, 250] },
      columnStyles: Object.fromEntries(numCols.map((v, i) => [i, withImg && i === 0 ? { cellWidth: 18, minCellHeight: 16 } : v ? { halign: 'right' } : {}])),
      didDrawCell: d => { if (!withImg || d.section !== 'body' || d.column.index !== 0) return; const r = bodyRows[d.row.index]; const im = r != null ? imgs[r] : null; if (!im) return; const sz = Math.min(d.cell.width - 2, d.cell.height - 2, 15); try { doc.addImage(im, 'JPEG', d.cell.x + (d.cell.width - sz) / 2, d.cell.y + (d.cell.height - sz) / 2, sz, sz); } catch (e) { } },
      didDrawPage: d => { doc.setFontSize(8); doc.setTextColor(118, 135, 151); doc.text('Hikvision Italy · Filiale di Palermo · pagina ' + doc.internal.getNumberOfPages(), W - 10, doc.internal.pageSize.getHeight() - 6, { align: 'right' }); }
    });
    await saveBlob(fname(t, 'pdf'), doc.output('blob'));
  }

  /* ---------- interfaccia ---------- */
  function enhance(tbl) {
    tbl._hp = true;
    tbl._hpKey = keyOf(tbl);
    tbl.classList.add('hp-sortable');
    [...tbl.tHead.rows[0].cells].forEach((c, i) => {
      if (!c.dataset.h) c.dataset.h = (c.textContent || '').replace(/\s+/g, ' ').trim();
      if (!c.dataset.h) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hp-sb';
      b.innerHTML = '<span></span><span class="hp-sa" aria-hidden="true">↕</span>';
      b.firstChild.textContent = c.dataset.h;
      b.title = 'Ordina per ' + c.dataset.h + ' (clic: crescente, poi decrescente, poi originale)';
      b.addEventListener('click', ev => { ev.stopPropagation(); clickHead(tbl, i); });
      c.replaceChildren(b);
    });
    // barra esportazione sopra la tabella
    const host = tbl.closest('.tbl-wrap') || tbl;
    let bar = host.previousElementSibling;
    if (!(bar && bar.classList.contains('hp-xbar'))) {
      bar = document.createElement('div'); bar.className = 'hp-xbar';
      const lab = document.createElement('span'); lab.className = 'hint'; lab.textContent = 'Esporta elenco:';
      bar.append(lab);
      for (const [l, fn] of [['CSV', exportCsv], ['Excel', exportXlsx], ['PDF', exportPdf]]) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm ghost hp-xb'; b.textContent = l;
        b.addEventListener('click', async () => {
          b.disabled = true;
          try { await fn(bar._tbl); toast('File ' + l + ' pronto'); }
          catch (e) { console.error(e); toast('Esportazione non riuscita: ' + (e.message || e), 'bad'); }
          finally { b.disabled = false; }
        });
        bar.append(b);
      }
      host.parentNode.insertBefore(bar, host);
    }
    bar._tbl = tbl;
    apply(tbl);
  }
  function scan() {
    const root = document.getElementById('view'); if (!root) return;
    if (typeof S !== 'undefined' && (S.view === 'art' || S.view === 'naming')) return; // catalogo: ha già paginazione e ordinamenti propri
    for (const tbl of root.querySelectorAll('table')) {
      if (tbl._hp) continue;
      if (eligible(tbl)) enhance(tbl);
    }
    // rimuove barre rimaste orfane
    for (const bar of root.querySelectorAll('.hp-xbar')) { const n = bar.nextElementSibling; if (!n || !(n.tagName === 'TABLE' || n.querySelector && n.querySelector('table'))) bar.remove(); }
  }
  let raf = 0;
  const mo = new MutationObserver(() => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; scan(); }); });
  const start = () => { const v = document.getElementById('view'); if (v) { mo.observe(v, { childList: true, subtree: true }); scan(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
