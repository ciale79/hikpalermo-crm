/* HIK PALERMO — area riservata ProAV (proav.hikpalermo.com).
   Solo sul dominio proav: tema dedicato, listini ProAV privati (caricati dall'Excel, file su R2 letti tramite il Worker),
   Sales Analysis ProAV separata da quella del gruppo (con storico e confronto), cruscotto con l'area ProAV in testa.
   Chi entra lo decide il proprietario del CRM (config/proav.emails); il Worker blocca tutti gli altri. */
(function () {
  'use strict';
  if (typeof HP_PAV === 'undefined' || !HP_PAV) return;
  const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const H = { 'x-hp': '1' };
  S.pavList = null; S.pavRows = new Map(); S.pavQ = S.pavQ || ''; S.pavL = S.pavL || ''; S.pavCfg = null;

  /* ---------- aspetto ---------- */
  document.title = 'HIK Palermo · ProAV';
  ICONS.av = 'M3 5h18v11H3zM8 20h8M12 16v4M10 8.5v4l3.5-2z';
  document.querySelectorAll('.brand b').forEach(b => b.replaceWith(el('img', { class: 'hp-pavlogo-img', src: '/proav-logo.png', alt: 'ProAV Hikvision' })));
  const sub = document.querySelector('.brand .sub'); if (sub) sub.textContent = 'Area riservata ProAV';
  if (!NAV.some(n => n[0] === 'pav')) NAV.splice(1, 0, ['pav', 'Listini ProAV', 'av']);

  /* ---------- dati ---------- */
  const fmtP = p => { const m = /^(\d{4})-(\d{2})$/.exec(p || ''); return m ? ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'][+m[2] - 1] + ' ' + m[1] : (p || ''); };
  const num = v => { if (typeof v === 'number') return isFinite(v) ? v : null; let s = String(v == null ? '' : v).replace(/[€\s]/g, '').replace(/eur/i, ''); if (!s) return null; if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); const n = parseFloat(s); return isFinite(n) ? n : null; };
  const members = () => { const d = S.pavCfg; return (d && Array.isArray(d.emails) ? d.emails : ['antonino.pumilia@hikvision.com']); };
  const whoTxt = () => { const em = members(); const names = em.map(e => { const t = [...S.team.entries()].find(([, x]) => String(x.email || '').toLowerCase() === e.toLowerCase()); return t ? nm(t[0]) : e; }); return names.concat(['il proprietario del CRM']).join(', '); };
  async function loadRows(meta) {
    if (S.pavRows.has(meta.id)) return S.pavRows.get(meta.id);
    const r = await fetch('/api/proav/blob?id=' + encodeURIComponent(meta.blob || meta.id), { credentials: 'same-origin', headers: H });
    if (!r.ok) throw new Error('Listino «' + meta.nome + '» non leggibile (' + r.status + ')');
    const d = await r.json(); S.pavRows.set(meta.id, d); return d;
  }
  let loadingAll = null;
  function loadAll() {
    if (!S.pavList) return Promise.resolve();
    const miss = S.pavList.filter(m => !S.pavRows.has(m.id));
    if (!miss.length) return Promise.resolve();
    if (loadingAll) return loadingAll;
    loadingAll = Promise.all(miss.map(m => loadRows(m).catch(e => { toast(e.message, 'bad'); }))).finally(() => { loadingAll = null; if (S.view === 'pav') VIEWS.pav.update(); });
    return loadingAll;
  }
  const t0 = setInterval(() => {
    if (typeof db === 'undefined' || !db || !S.me) return; clearInterval(t0);
    db.collection('proavListini').onSnapshot(s => { S.pavList = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.periodo || '').localeCompare(a.periodo || '') || (b.at || 0) - (a.at || 0)); for (const id of [...S.pavRows.keys()]) { const m = S.pavList.find(x => x.id === id); if (!m || m.at !== (S.pavRows.get(id).at)) S.pavRows.delete(id); } changed(); }, () => { S.pavList = []; changed(); });
    ref('config', 'proav').onSnapshot(s => { S.pavCfg = s.exists ? s.data() : null; changed(); }, () => { });
  }, 500);

  /* ---------- ricerca ---------- */
  function search(q, onlyId, limit = 300) {
    const toks = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    for (const m of S.pavList || []) {
      if (onlyId && m.id !== onlyId) continue;
      const d = S.pavRows.get(m.id); if (!d) continue; const M = m.map || {};
      for (const r of d.rows) {
        const c = String(r[M.c] ?? ''); if (!c) continue;
        const hay = (c + ' ' + (r[M.d] ?? '') + ' ' + (M.k != null ? r[M.k] ?? '' : '')).toLowerCase();
        if (toks.length && !toks.every(t => hay.includes(t))) continue;
        const cl = c.toLowerCase(), q0 = toks.join(' ');
        out.push({ m, r, c, rank: cl === q0 ? 0 : cl.startsWith(q0) ? 1 : 2 });
      }
    }
    out.sort((a, b) => a.rank - b.rank || a.c.localeCompare(b.c));
    return { tot: out.length, list: out.slice(0, limit) };
  }
  const netsOf = (m, r) => ((m.map || {}).n || []).map(i => [m.cols[i], num(r[i])]).filter(x => x[1] != null);

  function rowDetail(m, r) {
    const M = m.map || {}; const code = String(r[M.c] ?? '');
    const body = el('div', { class: 'stack' },
      el('div', { class: 'row', style: 'gap:8px' }, el('span', { class: 'pill hp-pavpill' }, m.nome + (m.periodo ? ' (' + fmtP(m.periodo) + ')' : '')), el('b', { class: 'mono' }, code)),
      M.d != null ? el('p', { style: 'margin:0' }, String(r[M.d] ?? '')) : null,
      el('div', { class: 'row', style: 'gap:18px;flex-wrap:wrap' }, M.p != null && num(r[M.p]) != null ? el('div', { class: 'stack', style: 'gap:0' }, el('span', { class: 'eyebrow' }, 'Prezzo di listino'), el('b', { class: 'num', style: 'font-size:1.4rem' }, eur(num(r[M.p])))) : null,
        netsOf(m, r).map(([h, v]) => el('div', { class: 'stack', style: 'gap:0' }, el('span', { class: 'eyebrow' }, h), el('b', { class: 'num hp-net', style: 'font-size:1.2rem' }, eur(v)), el('small', { class: 'hp-net' }, 'PREZZO NETTO')))),
      el('dl', { class: 'dl' }, m.cols.map((h, i) => (r[i] === '' || r[i] == null) ? null : [el('dt', {}, h || 'Colonna ' + (i + 1)), el('dd', { style: 'white-space:pre-wrap' }, typeof r[i] === 'number' ? (/prez|price|list|nett|net|eur|€|cost|msrp|dealer|partner|distrib|install/i.test(h) ? eur(r[i]) : r[i].toLocaleString('it-IT', { maximumFractionDigits: 2 })) : String(r[i]))])));
    const md = modal(code, body, [btn('Copia codice', () => copy(code), '', 'copy'), el('a', { class: 'btn', href: '/go/hik?code=' + encodeURIComponent(code), target: '_blank', rel: 'noopener' }, 'Pagina Hikvision'), el('span', { class: 'grow' }), btn('Chiudi', () => md.close())], { wide: true });
  }

  // ricerca globale in alto: anche nei listini ProAV
  window.hpGsExtra = (q, grp) => {
    if (!S.pavList || !S.pavList.length) return [];
    if (S.pavList.some(m => !S.pavRows.has(m.id))) { loadAll(); return []; }
    const { list } = search(q, '', 5);
    return grp('Listini ProAV', list.map(({ m, r }) => { const M = m.map || {}; const p = M.p != null ? num(r[M.p]) : null; return el('div', { class: 'gs-item', onclick: () => { const g = document.querySelector('#gsearch input'); if (g) g.value = ''; closeGs(); rowDetail(m, r); } }, ic('av', 16), el('span', { class: 't' }, el('span', { class: 'mono' }, String(r[M.c])), ' ', el('span', { class: 'muted' }, String(M.d != null ? r[M.d] ?? '' : ''))), el('span', { class: 'num' }, p != null ? eur(p) : '')); }));
  };

  /* ---------- caricamento di un listino Excel ---------- */
  const loadLib = () => window.XLSX ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = LIB; s.onload = res; s.onerror = () => rej(new Error('Libreria Excel non disponibile')); document.head.append(s); });
  const fileIn = el('input', { type: 'file', accept: '.xlsx,.xls,.xlsm,.xlsb,.csv', hidden: true }); document.body.append(fileIn);
  let replaceMeta = null;
  fileIn.addEventListener('change', () => { const f = fileIn.files[0]; fileIn.value = ''; if (f) readFile(f, replaceMeta); });
  window.hpPavUpload = (meta) => { replaceMeta = meta || null; fileIn.click(); };
  const RX = { c: /(^|\b)(cod|codice|model|modello|articolo|sku|part ?(n|no|num|number)\b|p\/n|item)/i, d: /desc/i, p: /(listino|list ?price|msrp|prezzo( di)? (listino|pubblico)|^prezzo$|^price$|retail|eu ?price|end ?user)/i, n: /(nett|net\b|net price|dealer|distribut|install|rivend|\bsi\b|system integrator|partner|acquisto|cost)/i, k: /(categ|famigl|family|gruppo|linea|line|serie|series|tipolog)/i };
  function headerRow(rows) {
    let best = -1, bi = 0;
    for (let i = 0; i < Math.min(40, rows.length); i++) {
      const cells = rows[i].map(x => String(x ?? '').trim()).filter(Boolean); if (cells.length < 2) continue;
      const sc = (cells.some(x => RX.c.test(x)) ? 2 : 0) + (cells.some(x => RX.d.test(x)) ? 2 : 0) + (cells.some(x => RX.p.test(x) || RX.n.test(x)) ? 1 : 0) + Math.min(cells.length, 8) / 10 - (cells.filter(x => num(x) != null).length > cells.length / 2 ? 3 : 0);
      if (sc > best) { best = sc; bi = i; }
    }
    return bi;
  }
  async function readFile(file, replace) {
    if (file.size > 60 * 1048576) { toast('File troppo grande.', 'bad'); return; }
    let wb;
    try { await loadLib(); wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false }); } catch (e) { toast('File non leggibile: ' + e.message, 'bad'); return; }
    const sheets = wb.SheetNames.map(n => ({ n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '', blankrows: false }) })).filter(x => x.rows.length);
    if (!sheets.length) { toast('Il file non contiene dati.', 'bad'); return; }
    let sh = sheets.slice().sort((a, b) => b.rows.length - a.rows.length)[0];
    const now = new Date();
    const nome = inp('pavNome', replace ? replace.nome : file.name.replace(/\.(xlsx|xls|xlsm|xlsb|csv)$/i, '').replace(/[_]+/g, ' ').trim());
    const per = inp('pavPer', replace ? replace.periodo : now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'), { type: 'month' });
    const shSel = selectEl('pavSh', sheets.map(x => [x.n, x.n + ' · ' + x.rows.length + ' righe']), sh.n);
    const hrSel = el('input', { type: 'number', min: '1', style: 'width:90px' });
    const mapBox = el('div', { class: 'stack' }); const prev = el('div', { class: 'tbl-wrap', style: 'max-height:260px' });
    let H0 = [], hi = 0, map = {};
    const cols = () => H0.map((h, i) => [String(i), (h || 'Colonna ' + (i + 1)) + ' · ' + String.fromCharCode(65 + (i % 26))]);
    const guess = () => {
      const f = rx => H0.findIndex(h => rx.test(String(h)));
      const c = f(RX.c), d = f(RX.d), k = f(RX.k);
      let p = H0.findIndex(h => RX.p.test(String(h)) && !RX.n.test(String(h)));
      const n = H0.map((h, i) => i).filter(i => i !== p && RX.n.test(String(H0[i])) && !RX.c.test(String(H0[i])) && !RX.d.test(String(H0[i])));
      map = { c: c < 0 ? 0 : c, d: d < 0 ? null : d, p: p < 0 ? null : p, n, k: k < 0 ? null : k };
    };
    const drawMap = () => {
      const sel = (key, lab, opt) => { const s = selectEl('pm_' + key, (opt ? [['', '—']] : []).concat(cols()), map[key] == null ? '' : map[key]); s.onchange = () => { map[key] = s.value === '' ? null : +s.value; drawPrev(); }; return fld(lab, s); };
      const nets = el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, H0.map((h, i) => el('label', { class: 'person' + (map.n.includes(i) ? ' on' : ''), style: 'cursor:pointer' }, el('input', { type: 'checkbox', checked: map.n.includes(i), onchange: e => { map.n = e.target.checked ? [...map.n, i] : map.n.filter(x => x !== i); drawMap(); drawPrev(); } }), h || 'Colonna ' + (i + 1))));
      mapBox.replaceChildren(el('div', { class: 'grid2' }, sel('c', 'Codice *'), sel('d', 'Descrizione', true), sel('p', 'Prezzo di listino', true), sel('k', 'Categoria / famiglia', true)),
        el('div', { class: 'fld full' }, el('span', {}, 'Prezzi netti (distributore, installatore, dealer…): in offerta non si applica lo sconto cliente'), nets));
    };
    const dataRows = () => sh.rows.slice(hi + 1).filter(r => String(r[map.c] ?? '').trim());
    const drawPrev = () => {
      const R = dataRows();
      prev.replaceChildren(el('table', {}, el('thead', {}, el('tr', {}, ['Codice', 'Descrizione', 'Listino', 'Netti', 'Categoria'].map(h => el('th', {}, h)))),
        el('tbody', {}, R.slice(0, 6).map(r => el('tr', {}, el('td', { class: 'mono' }, String(r[map.c] ?? '')), el('td', {}, String(map.d != null ? r[map.d] ?? '' : '').slice(0, 80)), el('td', { class: 'r num' }, map.p != null && num(r[map.p]) != null ? eur(num(r[map.p])) : '—'), el('td', { class: 'r num hp-net' }, map.n.map(i => num(r[i])).filter(x => x != null).map(eur).join(' · ') || '—'), el('td', {}, String(map.k != null ? r[map.k] ?? '' : '')))))),
        el('p', { class: 'hint' }, R.length + ' articoli trovati'));
    };
    const setSheet = () => { sh = sheets.find(x => x.n === shSel.value) || sh; hi = headerRow(sh.rows); hrSel.value = hi + 1; H0 = (sh.rows[hi] || []).map(x => String(x ?? '').trim()); const w = Math.max(...sh.rows.slice(hi, hi + 50).map(r => r.length)); while (H0.length < w) H0.push(''); guess(); drawMap(); drawPrev(); };
    shSel.onchange = setSheet;
    hrSel.onchange = () => { hi = Math.max(0, Math.min(sh.rows.length - 1, (+hrSel.value || 1) - 1)); H0 = (sh.rows[hi] || []).map(x => String(x ?? '').trim()); guess(); drawMap(); drawPrev(); };
    setSheet();
    const body = el('div', { class: 'stack' },
      el('div', { class: 'banner hp-pavban' }, 'Listino riservato ProAV: lo vedono solo ' + whoTxt() + '. Il file resta privato, non entra nei listini del gruppo né nei capitolati.'),
      el('div', { class: 'grid2' }, fld('Nome del listino', nome), fld('Mese e anno del listino', per)),
      el('div', { class: 'grid2' }, fld('Foglio', shSel), fld('Riga delle intestazioni', hrSel)),
      mapBox, el('h4', { style: 'margin:4px 0 0' }, 'Anteprima'), prev);
    const m = modal(replace ? 'Aggiorna listino ProAV' : 'Carica listino ProAV', body, [el('span', { class: 'grow' }), btn('Annulla', () => m.close()), btn(replace ? 'Sostituisci' : 'Carica', async () => {
      const n = nome.value.trim(); if (!n) { toast('Dai un nome al listino.', 'bad'); nome.focus(); return; }
      if (map.c == null) { toast('Scegli la colonna del codice.', 'bad'); return; }
      const R = dataRows().map(r => H0.map((_, i) => { const v = r[i]; return typeof v === 'string' ? v.trim() : v; }));
      if (!R.length) { toast('Nessun articolo trovato con questa colonna codice.', 'bad'); return; }
      const id = replace ? replace.id : newId('proavListini');
      const at = Date.now(); const blob = id + '_' + at.toString(36);
      const payload = JSON.stringify({ cols: H0, rows: R, at });
      try {
        const r = await fetch('/api/proav/blob?id=' + encodeURIComponent(blob), { method: 'PUT', credentials: 'same-origin', headers: { ...H, 'content-type': 'application/json' }, body: payload });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error?.message || ('errore ' + r.status));
      } catch (e) { toast('Caricamento non riuscito: ' + e.message, 'bad'); return; }
      const meta = { nome: n, periodo: per.value || '', righe: R.length, cols: H0, map, file: file.name, size: payload.length, sheet: sh.n, blob, by: S.me, at };
      if (await put('proavListini', id, meta)) {
        if (replace && replace.blob && replace.blob !== blob) fetch('/api/proav/blob?id=' + encodeURIComponent(replace.blob), { method: 'DELETE', credentials: 'same-origin', headers: H }).catch(() => { });
        S.pavRows.set(id, { cols: H0, rows: R, at }); m.close(); toast('Listino «' + n + '» caricato: ' + R.length + ' articoli'); if (S.view !== 'pav') go('pav');
      }
    }, 'pri', 'up')], { wide: true });
  }

  /* ---------- chi accede (solo il proprietario) ---------- */
  function accessForm() {
    const ta = el('textarea', { rows: 4, value: members().join('\n'), placeholder: 'nome.cognome@hikvision.com' });
    const m = modal('Accesso all\'area ProAV', el('div', { class: 'stack' }, el('p', { class: 'hint' }, 'Email delle persone che possono entrare su proav.hikpalermo.com e vedere listini e Sales Analysis ProAV, una per riga. Tu, come proprietario del CRM, sei sempre incluso. Devono avere già un accesso al CRM.'), ta),
      [el('span', { class: 'grow' }), btn('Annulla', () => m.close()), btn('Salva', async () => {
        const emails = [...new Set(ta.value.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(x => /@/.test(x)))];
        if (await put('config', 'proav', { emails, by: S.me, at: Date.now() })) { m.close(); toast('Accessi ProAV aggiornati'); }
      }, 'pri', 'check')]);
  }

  /* ---------- obiettivi della Sales Analysis ProAV ---------- */
  function targetForm() {
    const sa = S.salesP || {};
    const row = (lab, y, q) => { const iy = el('input', { type: 'number', step: '1000', min: '0', value: y || '' }); const iq = [0, 1, 2, 3].map(i => el('input', { type: 'number', step: '1000', min: '0', value: (q || [])[i] || '', placeholder: 'Q' + (i + 1) })); return { iy, iq, node: el('div', { class: 'stack', style: 'gap:6px' }, el('b', {}, lab), fld('Obiettivo annuale (€)', iy), el('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, iq.map((x, i) => fld('Q' + (i + 1), x, 'grow')))) }; };
    const si = row('Sicilia', sa.targetSicilia, sa.targetSiciliaQ), it = row('Italia', sa.targetItalia, sa.targetItaliaQ);
    const read = r => { let q = r.iq.map(x => +x.value || 0); let y = +r.iy.value || 0; if (!y && q.some(Boolean)) y = q.reduce((a, b) => a + b, 0); if (y && !q.some(Boolean)) q = [0, 1, 2, 3].map(() => Math.round(y / 4)); return { y: y || null, q: y ? q : null }; };
    const m = modal('Obiettivi ProAV', el('div', { class: 'stack' }, el('p', { class: 'hint' }, 'Servono per le percentuali di raggiungimento nel cruscotto e in Fatturato ProAV. Se lasci vuoti i trimestri, l\'obiettivo annuale viene diviso in quattro.'), el('div', { class: 'grid2' }, si.node, it.node)),
      [el('span', { class: 'grow' }), btn('Annulla', () => m.close()), btn('Salva', async () => {
        const a = read(si), b = read(it);
        if (await patch('proavDoc', 'sales', { targetSicilia: a.y, targetSiciliaQ: a.q, targetItalia: b.y, targetItaliaQ: b.q })) { m.close(); toast('Obiettivi ProAV salvati'); }
      }, 'pri', 'check')]);
  }
  window.hpPavTargets = targetForm;

  /* ---------- selettore della fonte (ProAV / gruppo) ---------- */
  function srcSeg(onChange) {
    const b = (k, l) => el('button', { type: 'button', class: S.salesSrc === k ? 'on' : '', 'aria-pressed': String(S.salesSrc === k), onclick: () => { setSalesSrc(k); window.hpCmpEnsure && window.hpCmpEnsure(); onChange && onChange(); } }, l);
    return el('div', { class: 'seg hp-pavseg', title: 'Quale Sales Analysis mostrare' }, b('pav', 'ProAV'), b('grp', 'Gruppo'));
  }

  /* ---------- pagina Listini ProAV ---------- */
  VIEWS.pav = {
    title: () => 'Listini ProAV',
    mount() { this.root = $('#view'); this.update(); loadAll(); },
    update() {
      const r = this.root; if (!r) return;
      const L = S.pavList;
      const own = !!S.isOwner;
      const head = el('div', { class: 'row between' }, el('div', { class: 'stack', style: 'gap:2px' }, el('span', { class: 'eyebrow' }, 'Area riservata · visibile solo a ' + whoTxt()), el('h2', { style: 'margin:0' }, 'Listini ProAV')),
        el('div', { class: 'row' }, own ? btn('Chi accede', accessForm, 'ghost', 'users') : null, btn('Carica listino', () => window.hpPavUpload(), 'pri', 'up')));
      if (!L) { r.replaceChildren(head, loading()); return; }
      if (!L.length) { r.replaceChildren(head, el('section', { class: 'panel' }, emptyBox('Nessun listino ProAV', 'Carica l\'Excel di un listino: scegli le colonne di codice, descrizione, prezzo di listino ed eventuali netti. Lo vedrete solo voi.', btn('Carica listino', () => window.hpPavUpload(), 'pri sm', 'up')))); return; }
      const ready = L.every(m => S.pavRows.has(m.id));
      const cards = el('div', { class: 'hp-pavcards' }, L.map(m => el('div', { class: 'hp-pavcard' + (S.pavL === m.id ? ' on' : ''), role: 'button', tabindex: '0', onclick: () => { S.pavL = S.pavL === m.id ? '' : m.id; this.update(); }, onkeydown: e => { if (e.key === 'Enter') { S.pavL = S.pavL === m.id ? '' : m.id; this.update(); } } },
        el('div', { class: 'row between', style: 'gap:6px;flex-wrap:nowrap' }, el('b', { title: m.nome }, m.nome), el('span', { class: 'row', style: 'gap:2px;flex-wrap:nowrap' },
          el('button', { type: 'button', class: 'icon-btn', title: 'Sostituisci con un file aggiornato', 'aria-label': 'Aggiorna ' + m.nome, onclick: e => { e.stopPropagation(); window.hpPavUpload(m); } }, ic('up', 15)),
          el('button', { type: 'button', class: 'icon-btn', title: 'Elimina listino', 'aria-label': 'Elimina ' + m.nome, onclick: async e => { e.stopPropagation(); if (!await ask('Eliminare il listino «' + m.nome + '»?', 'Elimina')) return; if (await remove('proavListini', m.id)) { fetch('/api/proav/blob?id=' + encodeURIComponent(m.blob || m.id), { method: 'DELETE', credentials: 'same-origin', headers: H }).catch(() => { }); S.pavRows.delete(m.id); if (S.pavL === m.id) S.pavL = ''; toast('Listino eliminato'); } } }, ic('trash', 15)))),
        el('span', { class: 'hint' }, (m.periodo ? fmtP(m.periodo) + ' · ' : '') + (m.righe || 0).toLocaleString('it-IT') + ' articoli' + ((m.map || {}).n && m.map.n.length ? ' · netti' : '')),
        el('span', { class: 'hint', style: 'font-size:.72rem' }, 'Caricato ' + fD(m.at) + (m.by ? ' da ' + (m.by === S.me ? 'te' : nm(m.by)) : '')))));
      const qIn = el('input', { type: 'search', value: S.pavQ, placeholder: 'Cerca codice o descrizione nei listini ProAV…', 'aria-label': 'Cerca nei listini ProAV', style: 'flex:1;min-width:220px' });
      const res = el('div', {});
      const draw = () => {
        if (!ready) { res.replaceChildren(el('p', { class: 'hint' }, el('span', { class: 'spin' }), ' Carico i listini…')); return; }
        const { tot, list } = search(S.pavQ, S.pavL);
        if (!S.pavQ && !S.pavL) { res.replaceChildren(el('p', { class: 'hint' }, 'Scrivi un codice o una parola, oppure scegli un listino qui sopra per sfogliarlo.')); return; }
        if (!list.length) { res.replaceChildren(el('p', { class: 'hint' }, 'Nessun articolo trovato.')); return; }
        res.replaceChildren(el('div', { class: 'tbl-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ['Codice', 'Descrizione', 'Categoria', 'Listino', 'Netti', 'Fonte'].map((h, i) => el('th', { class: i === 3 || i === 4 ? 'r' : '' }, h)))),
          el('tbody', {}, list.map(({ m, r }) => { const M = m.map || {}; const p = M.p != null ? num(r[M.p]) : null; const nets = netsOf(m, r);
            return el('tr', { class: 'hp-click', onclick: () => rowDetail(m, r) }, el('td', { class: 'mono', style: 'white-space:nowrap' }, el('b', {}, String(r[M.c]))), el('td', {}, el('div', { class: 'hp-pavdesc', title: String(M.d != null ? r[M.d] ?? '' : '') }, String(M.d != null ? r[M.d] ?? '' : ''))), el('td', { class: 'muted' }, String(M.k != null ? r[M.k] ?? '' : '')), el('td', { class: 'r num' }, p != null ? el('b', {}, eur(p)) : el('span', { class: 'muted' }, '—')),
              el('td', { class: 'r num' }, nets.length ? nets.map(([h, v]) => el('div', { class: 'hp-net', title: h + ' · prezzo netto' }, eur(v), el('small', {}, ' ' + h))) : el('span', { class: 'muted' }, '—')),
              el('td', {}, el('span', { class: 'pill hp-pavpill' }, m.nome + (m.periodo ? ' (' + fmtP(m.periodo) + ')' : ''))));
          })))), el('p', { class: 'hint' }, tot > list.length ? 'Primi ' + list.length + ' risultati su ' + tot.toLocaleString('it-IT') + ': affina la ricerca.' : tot + (tot === 1 ? ' articolo' : ' articoli') + '. Clic su una riga per tutte le colonne. In rosso i prezzi netti.'));
      };
      let tm = 0; qIn.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { S.pavQ = qIn.value; draw(); }, 160); });
      draw();
      r.replaceChildren(head, el('section', { class: 'panel stack' }, el('div', { class: 'panel-h' }, el('h3', {}, L.length + (L.length === 1 ? ' listino' : ' listini')), S.pavL ? el('a', { href: '#', class: 'hint', onclick: e => { e.preventDefault(); S.pavL = ''; this.update(); } }, 'Mostra tutti') : el('span', { class: 'hint' }, 'Clic su un listino per filtrare')), cards),
        el('section', { class: 'panel stack' }, el('div', { class: 'row', style: 'gap:8px' }, qIn, S.pavL ? el('span', { class: 'pill hp-pavpill' }, 'Solo: ' + (L.find(x => x.id === S.pavL) || {}).nome) : null), res));
      if (document.activeElement === document.body && S.pavQ) qIn.focus();
      loadAll();
    }
  };

  /* ---------- cruscotto: area ProAV in testa ---------- */
  function strip() {
    const L = S.pavList || [];
    const last = L.reduce((a, m) => Math.max(a, m.at || 0), 0);
    const sp = S.salesP;
    const qIn = el('input', { type: 'search', placeholder: 'Cerca nei listini ProAV…', 'aria-label': 'Cerca nei listini ProAV', onkeydown: e => { if (e.key === 'Enter') { S.pavQ = e.target.value; S.pavL = ''; go('pav'); } } });
    return el('section', { class: 'panel hp-pavstrip' },
      el('div', { class: 'hp-pavhero' }, el('span', { class: 'hp-pavlogo', 'aria-hidden': 'true' }, ic('av', 26)), el('div', { class: 'stack', style: 'gap:2px' }, el('b', {}, 'Area ProAV'), el('span', { class: 'hint' }, 'Riservata a ' + whoTxt()))),
      el('div', { class: 'hp-pavcell' }, el('span', { class: 'eyebrow' }, 'Sales Analysis'), srcSeg(() => VIEWS.dash.update()),
        el('span', { class: 'hint' }, S.salesSrc === 'grp' ? 'Stai vedendo i dati del gruppo' : sp && sp.dataLabel ? 'ProAV al ' + sp.dataLabel : 'ProAV non ancora caricata', ' · ', el('a', { href: '#', onclick: e => { e.preventDefault(); go('fatt'); } }, S.salesSrc !== 'grp' && !(sp && sp.dataLabel) ? 'caricala' : 'dettaglio'))),
      el('div', { class: 'hp-pavcell', role: 'button', tabindex: '0', style: 'cursor:pointer', onclick: e => { if (e.target.tagName !== 'INPUT') go('pav'); } }, el('span', { class: 'eyebrow' }, 'Listini ProAV'), el('b', { class: 'hp-pavn' }, String(L.length)), el('span', { class: 'hint' }, L.length ? L.reduce((a, m) => a + (m.righe || 0), 0).toLocaleString('it-IT') + ' articoli · agg. ' + fD(last) : 'Nessun listino caricato')),
      el('div', { class: 'hp-pavcell grow' }, el('span', { class: 'eyebrow' }, 'Ricerca rapida'), qIn));
  }
  const dOrig = VIEWS.dash.update;
  VIEWS.dash.update = function () {
    const out = dOrig.apply(this, arguments);
    try { const r = this.root; if (r) { r.querySelector('.hp-pavstrip')?.remove(); const qb = r.querySelector('.hp-qbar'); const s = strip(); if (qb) qb.before(s); else r.prepend(s); } } catch (e) { console.error(e); }
    return out;
  };
  /* ---------- Fatturato: fonte e obiettivi ---------- */
  const fOrig = VIEWS.fatt.update;
  VIEWS.fatt.update = function () {
    const out = fOrig.apply(this, arguments);
    try {
      const r = this.root; if (!r) return out;
      r.querySelector('.hp-pavfbar')?.remove();
      const pav = S.salesSrc !== 'grp';
      const bar = el('div', { class: 'row between hp-pavfbar' }, el('div', { class: 'row', style: 'gap:10px' }, el('span', { class: 'eyebrow' }, 'Sales Analysis'), srcSeg(() => this.update()), el('span', { class: 'hint' }, pav ? 'Riservata ProAV: la vede solo ' + whoTxt() : 'Dati del gruppo, visibili a tutti')),
        pav ? btn('Obiettivi ProAV', targetForm, 'sm ghost', 'edit') : null);
      r.prepend(bar);
    } catch (e) { console.error(e); }
    return out;
  };
  if (S.view === 'dash' || S.view === 'fatt') VIEWS[S.view].update();
  renderNav && renderNav();
})();
