/* HIK PALERMO — area riservata ProAV (proav.hikpalermo.com).
   Solo sul dominio proav: tema dedicato, listini ProAV privati (caricati dall'Excel, file su R2 letti tramite il Worker),
   Sales Analysis ProAV separata da quella del gruppo (con storico e confronto), cruscotto con l'area ProAV in testa.
   Chi entra lo decide il proprietario del CRM (config/proav.emails); il Worker blocca tutti gli altri. */
(function () {
  'use strict';
  if (typeof HP_PAV === 'undefined' || !HP_PAV) return;
  const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const H = { 'x-hp': '1' };
  S.pavList = null; S.pavRows = new Map(); S.pavQ = S.pavQ || ''; S.pavL = S.pavL ?? (() => { try { const v = localStorage.getItem('hp_pavL'); return v == null ? null : v; } catch (e) { return null; } })(); S.pavCfg = null;

  /* ---------- aspetto ---------- */
  document.title = 'HIK Palermo · ProAV';
  ICONS.av = 'M3 5h18v11H3zM8 20h8M12 16v4M10 8.5v4l3.5-2z';
  document.querySelectorAll('.brand .hp-brandimg, .brand b').forEach(b => b.replaceWith(el('img', { class: 'hp-pavlogo-img', src: '/proav-logo.png', alt: 'ProAV Hikvision' })));
  const sub = document.querySelector('.brand .sub'); if (sub) sub.textContent = 'Area riservata ProAV';
  if (!NAV.some(n => n[0] === 'pav')) NAV.splice(1, 0, ['pav', 'Listini ProAV', 'av']);
  { const i = NAV.findIndex(n => n[0] === 'naming'); if (i >= 0) NAV.splice(i, 1); } // la naming rule non serve in ProAV
  if (S.view === 'naming') S.view = 'dash';
  document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]').forEach(l => l.remove());
  document.head.append(el('link', { rel: 'icon', type: 'image/png', href: '/proav-favicon.png' }), el('link', { rel: 'apple-touch-icon', href: '/proav-touch.png' }));

  /* ---------- archivio: privato ProAV o del gruppo (commesse, offerte, calendario, magazzino, attività) ---------- */
  const space = (() => { try { return localStorage.getItem('hp_pavSpace') === 'grp' ? 'grp' : 'pav'; } catch (e) { return 'pav'; } })();
  S.pavSpace = space;
  const setSpace = v => { if (v === space) return; try { localStorage.setItem('hp_pavSpace', v); } catch (e) { } if (NAV.some(n => n[0] === S.view)) location.hash = S.view; location.reload(); };
  function spaceSeg(cls) {
    const b = (k, l, t) => el('button', { type: 'button', class: space === k ? 'on' : '', 'aria-pressed': String(space === k), title: t, onclick: () => setSpace(k) }, l);
    return el('div', { class: 'seg hp-spaceseg' + (cls ? ' ' + cls : ''), role: 'group', 'aria-label': 'Archivio di commesse, calendario e magazzino' },
      b('pav', ['ProAV', el('span', { class: 'hp-long' }, ' privato')], 'Commesse, offerte, calendario e magazzino riservati ProAV'), b('grp', [el('span', { class: 'hp-long' }, 'Tutto il gruppo'), el('span', { class: 'hp-short' }, 'Gruppo')], 'Commesse, offerte, calendario e magazzino di tutto il gruppo, come su hikpalermo.com'));
  }
  window.hpSpaceSeg = spaceSeg;
  const top = document.querySelector('header.top #vtitle');
  if (top) top.after(el('div', { class: 'hp-spacebox' + (space === 'grp' ? ' grp' : '') }, spaceSeg()));
  if (space === 'grp') document.documentElement.classList.add('pav-grp');

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
    loadingAll = Promise.all(miss.map(m => loadRows(m).catch(e => { toast(e.message, 'bad'); }))).finally(() => { loadingAll = null; try { injectPav(); } catch (e) { console.error(e); } if (S.view === 'pav') VIEWS.pav.update(); });
    return loadingAll;
  }
  const t0 = setInterval(() => {
    if (typeof db === 'undefined' || !db || !S.me) return; clearInterval(t0);
    db.collection('proavListini').onSnapshot(s => { S.pavList = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.periodo || '').localeCompare(a.periodo || '') || (b.at || 0) - (a.at || 0)); for (const id of [...S.pavRows.keys()]) { const m = S.pavList.find(x => x.id === id); if (!m || m.at !== (S.pavRows.get(id).at)) S.pavRows.delete(id); } changed(); }, () => { S.pavList = []; changed(); });
    // le chiusure aziendali del calendario del gruppo valgono anche qui (giorni lavorativi e caselle rosse)
    db.collection('!eventi').onSnapshot(s => { const m = new Map(); s.docs.forEach(d => { const e = d.data(); if (/chiusura\s+aziendal/i.test((e.titolo || '') + ' ' + (e.note || '') + ' ' + ((ETIPI.find(x => x[0] === e.tipo) || [])[1] || e.tipo || ''))) m.set(d.id, { id: d.id, ...e }); }); S.eventiGrp = m; changed(); }, () => { });
    ref('config', 'proav').onSnapshot(s => { S.pavCfg = s.exists ? s.data() : null; changed(); }, () => { });
  }, 500);

  /* ---------- ricerca ---------- */
  /* ---------- articoli normalizzati: listini v2 (importazione libera) e vecchi listini a colonne ---------- */
  const itemCache = new Map();
  function itemsOf(m) {
    const d = S.pavRows.get(m.id); if (!d) return [];
    const ck = m.id + ':' + (d.at || 0); if (itemCache.has(ck)) return itemCache.get(ck);
    let items;
    if (d.v === 2) items = d.items || [];
    else { const M = m.map || {}; items = (d.rows || []).map(r => { const c = String(r[M.c] ?? '').trim(); if (!c) return null; const o = { c, x: m.cols.map((h, i) => [h, r[i]]).filter(z => z[1] !== '' && z[1] != null) };
      if (M.d != null && r[M.d] !== '') o.d = String(r[M.d]); if (M.p != null && num(r[M.p]) != null) o.p = num(r[M.p]); if (M.k != null && r[M.k] !== '') o.cat = String(r[M.k]);
      const n = (M.n || []).map(i => [m.cols[i], num(r[i])]).filter(z => z[1] != null); if (n.length) o.n = n; return o; }).filter(Boolean); }
    for (const it of items) it._h = [it.c, it.sap, it.ean, it.d, it.d2, it.cat, it.tip, ...(it.kit || []).flatMap(k => [k.c, k.sap, k.ean, k.d])].filter(Boolean).join(' ').toLowerCase();
    itemCache.set(ck, items); return items;
  }
  const mainCode = it => it.kit ? it.kit[0].c : it.c;
  const descOf = it => it.d || (it.kit && it.kit[0].d) || it.d2 || '';

  /* ---------- ricerca ---------- */
  function search(q, onlyId, limit = 300) {
    const toks = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    for (const m of S.pavList || []) {
      if (onlyId && m.id !== onlyId) continue;
      for (const r of itemsOf(m)) {
        if (toks.length && !toks.every(t => r._h.includes(t))) continue;
        const cl = r.c.toLowerCase(), q0 = toks.join(' ');
        out.push({ m, r, c: r.c, rank: cl === q0 || (r.kit && r.kit.some(k => k.c.toLowerCase() === q0)) ? 0 : cl.startsWith(q0) ? 1 : 2 });
      }
    }
    out.sort((a, b) => a.rank - b.rank || a.c.localeCompare(b.c));
    return { tot: out.length, list: out.slice(0, limit) };
  }
  const netsOf = (m, r) => (r.n || []).filter(x => x[1] != null);
  const pimg = (id, size) => id ? el('img', { class: 'hp-pavimg', src: String(id).startsWith('/') ? id : '/_blob/' + id, alt: '', loading: 'lazy', style: { width: size + 'px', height: size + 'px' } }) : el('span', { class: 'hp-pavimg none', style: { width: size + 'px', height: size + 'px' } });
  const FL = { sap: 'Codice SAP', ean: 'EAN', cat: 'Categoria', tip: 'Tipologia / serie', gar: 'Garanzia', moq: 'MOQ', var: 'Variazione di prezzo', note: 'Note', d2: 'Descrizione tecnica / breve' };

  function rowDetail(m, r) {
    const code = mainCode(r);
    const priceBox = (x, big) => el('div', { class: 'row', style: 'gap:18px;flex-wrap:wrap' }, x.p != null ? el('div', { class: 'stack', style: 'gap:0' }, el('span', { class: 'eyebrow' }, 'Prezzo di listino'), el('b', { class: 'num', style: 'font-size:' + (big ? '1.4rem' : '1rem') }, eur(x.p))) : null,
      netsOf(m, x).map(([h, v]) => el('div', { class: 'stack', style: 'gap:0' }, el('span', { class: 'eyebrow' }, h), el('b', { class: 'num hp-net', style: 'font-size:' + (big ? '1.2rem' : '.95rem') }, eur(v)), el('small', { class: 'hp-net' }, 'PREZZO NETTO'))));
    const dl = x => el('dl', { class: 'dl' }, Object.entries(FL).map(([k, l]) => x[k] == null || x[k] === '' ? null : [el('dt', {}, l), el('dd', { class: /sap|ean/.test(k) ? 'mono' : '', style: 'white-space:pre-wrap' }, String(x[k]))]),
      x.url ? [el('dt', {}, 'Scheda prodotto'), el('dd', {}, el('a', { href: x.url, target: '_blank', rel: 'noopener' }, 'Apri la scheda ↗'))] : null,
      (x.x || []).map(([h, v]) => [el('dt', {}, h || '—'), el('dd', { style: 'white-space:pre-wrap' }, typeof v === 'number' ? (/prez|price|list|nett|net|eur|€|cost|msrp|dealer|partner|distrib|install/i.test(h) ? eur(v) : v.toLocaleString('it-IT')) : String(v))]));
    const body = el('div', { class: 'stack' },
      el('div', { class: 'row', style: 'gap:16px;align-items:flex-start' }, r.img || (r.kit && r.kit.some(k => k.img)) ? pimg(r.img || r.kit.find(k => k.img).img, 140) : null,
        el('div', { class: 'stack grow', style: 'min-width:240px' },
          el('div', { class: 'row', style: 'gap:8px' }, el('span', { class: 'pill hp-pavpill' }, m.nome + (m.periodo ? ' (' + fmtP(m.periodo) + ')' : '')), r.kit ? el('span', { class: 'tag new hp-kittag' }, 'KIT · ' + r.kit.length + ' articoli') : null, el('b', { class: 'mono' }, code)),
          descOf(r) ? el('p', { style: 'margin:0' }, descOf(r)) : null, priceBox(r, true), dl(r))),
      r.kit ? el('section', { class: 'panel stack', style: 'background:var(--surface-2)' }, el('h4', { style: 'margin:0' }, 'Composizione del kit'),
        el('div', { class: 'tbl-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ['', 'Q.tà', 'Codice', 'SAP', 'EAN', 'Descrizione', 'Prezzi al pezzo'].map((h, i) => el('th', { class: i === 1 || i === 6 ? 'r' : '' }, h)))),
          el('tbody', {}, r.kit.map(k => el('tr', {}, el('td', {}, pimg(k.img, 40)), el('td', { class: 'r num' }, el('b', {}, k.q + '×')), el('td', { class: 'mono' }, k.c, window.hpGlobalChip ? el('div', { style: 'margin-top:3px' }, hpGlobalChip(k.c, undefined, k.url || '')) : null), el('td', { class: 'mono' }, k.sap || '—'), el('td', { class: 'mono' }, k.ean || '—'),
            el('td', {}, el('div', { class: 'hp-pavdesc', title: k.d || '' }, k.d || k.d2 || '')), el('td', { class: 'r num hp-net', style: 'font-size:.82rem' }, (k.p != null ? 'Listino ' + eur(k.p) + ' ' : '') + (k.n || []).map(([h, v]) => h + ' ' + eur(v)).join(' · ') || '—'))))))) : null);
    const md = modal(code, body, [btn('Copia codice', () => copy(code), '', 'copy'), (window.hpGlobalChip && window.hpGlobalChip(code, 'btn hp-glbtn', r.url || (r.kit && r.kit[0].url) || '')) || el('a', { class: 'btn', href: 'https://www.google.com/search?q=' + encodeURIComponent('site:hikvision.com ' + code + ' datasheet'), target: '_blank', rel: 'noopener' }, 'Cerca datasheet'), window.hpTradChip ? hpTradChip(code, r.url || (r.kit && r.kit[0].url) || '', true) : null, el('span', { class: 'grow' }), btn('Chiudi', () => md.close())], { wide: true });
  }

  /* ---------- listini ProAV anche in «Articoli» (e quindi in ricerca, offerte e capitolati di questa area) ---------- */
  LIST.pav = 'Listino ProAV · riservato';
  const SRC0 = SRC.filter(x => x.L !== 'pav').length;
  window.hpPavDetail = rowDetail;
  let injKey = '';
  /* kit descritto come un unico articolo: «Display LED serie Ultra P0.9 COB da interno, composto da: 4× modulo LED … e 1× struttura cabinet …» */
  const capF = s => s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : '';
  function kitDesc(r) {
    const tp = String(r.tip || '').split(/\s+-\s+/).map(x => x.trim()).filter(x => x && !/^hikvision$/i.test(x));
    const ser = tp[0] ? 'serie ' + tp[0].split(/\s+/).map(capF).join(' ') : '';
    const spec = (tp[1] || '').replace(/\bINDOOR\b/i, 'da interno').replace(/\bOUTDOOR\b/i, 'da esterno').trim();
    const cat = String(r.cat || '').toUpperCase();
    const head = (/LED/.test(cat) ? 'Display LED' : /VIDEOWALL|LCD/.test(cat) ? 'Videowall' : r.cat ? capF(r.cat) : 'Kit') + [ser, spec].filter(Boolean).map(x => ' ' + x).join('');
    const nameOf = k => { const f = String(k.d || '').split(/[.,;]/)[0].trim(); const n = f.split(/\s+(?:per|da|con|in)\s+/i)[0].trim(); return (n || k.d2 || 'componente').replace(/^./, ch => ch.toLowerCase()); };
    // prima i cabinet (la struttura), poi i moduli
    const isCab = k => /cabinet|struttura/i.test(k.d2 || '') || /^\s*(struttura|cabinet)/i.test(k.d || '');
    const mk = kit => { const parts = kit.map(k => k.q + '× ' + nameOf(k) + ' ' + k.c);
      const list = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1] : parts[0] || '';
      return { b: head + ', composto da: ' + list, d: head + ', composto da:\n' + kit.map(k => '• ' + k.q + '× ' + k.c + ' — ' + (k.d || k.d2 || '')).join('\n') }; };
    const old = mk(r.kit), nw = mk([...r.kit.filter(isCab), ...r.kit.filter(k => !isCab(k))]);
    return { ...nw, bOld: old.b, dOld: old.d };
  }
  function injectPav() {
    if (!S.cat || !S.cat.length || !S.pavList) return;
    const ready = S.pavList.filter(m => S.pavRows.has(m.id));
    const key = ready.map(m => m.id + ':' + (S.pavRows.get(m.id).at || 0)).join('|') + '#' + S.cat.length;
    if (key === injKey) return;
    S.cat = S.cat.filter(x => x.L !== 'pav'); SRC.length = SRC0;
    let i0 = S.cat.length ? Math.max(...S.cat.map(x => x.i)) + 1 : 0;
    for (const m of ready) {
      const s = SRC.length; SRC.push({ L: 'pav', tag: 'PROAV', name: m.nome, per: fmtP(m.periodo), key: 'pav:' + m.id });
      for (const r of itemsOf(m)) {
        const nets = {}; for (const [h, v] of r.n || []) { if (/1 ?pz/i.test(h)) continue; if (/distribut/i.test(h) && nets.dist == null) nets.dist = v; else if (/dealer/i.test(h) && nets.dealer == null) nets.dealer = v; else if (/install|\bsi\b|system/i.test(h) && nets.si == null) nets.si = v; }
        const c = r.c, kd = r.kit ? kitDesc(r) : null, b = kd ? kd.b : (r.d2 || r.tip || String(r.d || '').slice(0, 110));
        const d = kd ? kd.d : (r.d || r.d2 || '');
        S.cat.push({ ...(kd && kd.bOld !== kd.b ? { bOld: kd.bOld, dOld: kd.dOld } : {}), i: i0++, s, sap: r.kit ? (r.kit[0].sap || '') : (r.sap || ''), c, sz: r.cat || 'PROAV', fm: r.tip || '', b, d, p: r.p != null ? r.p : 0, noPrice: r.p == null, inf: /new/i.test(r.var || '') ? 'NEW' : '', st: '', m: r.moq || '', n: r.note || '', im: (im => im ? (String(im).startsWith('/') ? im : '/_blob/' + im) : -1)(r.img || (r.kit && (r.kit.find(k => k.img) || {}).img)),
          nets: Object.keys(nets).length ? nets : null, url: r.url || (r.kit && r.kit[0].url) || '', isNet: false, L: 'pav', kitN: r.kit ? r.kit.length : 0, cn: norm(c), hay: [c, r._h].join(' | ').toLowerCase(), pavRef: { m, r } });
      }
    }
    S.byCode = new Map(); for (const it of S.cat) { if (!S.byCode.has(it.cn)) S.byCode.set(it.cn, []); S.byCode.get(it.cn).push(it); }
    S.catSap = null; injKey = key; fixKitB(); changed();
  }
  // offerte già salvate con la vecchia descrizione dei kit (moduli prima dei cabinet): si mostra quella nuova
  function fixKitB() { if (!S.offerte || !S.byCode) return; for (const o of S.offerte.values()) for (const r of o.righe || []) { if (r.L !== 'pav' || !r.b) continue; const it = (S.byCode.get(norm(r.c)) || []).find(x => x.L === 'pav'); if (!it || !it.bOld) continue; if (r.b === it.bOld) r.b = it.b; if (r.dx === it.dOld) r.dx = it.d; } }
  setInterval(() => { try { fixKitB(); } catch (e) { } }, 3000);
  const ad0 = window.artDetail || artDetail;
  window.artDetail = function (it) { if (it && it.pavRef) return rowDetail(it.pavRef.m, it.pavRef.r); return ad0.apply(this, arguments); };
  const tInj = setInterval(() => { if (S.cat && S.cat.length && S.pavList) { if (S.pavList.every(m => S.pavRows.has(m.id))) { injectPav(); } else loadAll().then(injectPav); } }, 1500);

  // ricerca globale in alto: anche nei listini ProAV
  window.hpGsExtra = (q, grp) => {
    if (!S.pavList || !S.pavList.length) return [];
    if (S.pavList.some(m => !S.pavRows.has(m.id))) { loadAll(); return []; }
    const { list } = search(q, '', 5);
    return grp('Listini ProAV', list.map(({ m, r }) => el('div', { class: 'gs-item', onclick: () => { const g = document.querySelector('#gsearch input'); if (g) g.value = ''; closeGs(); rowDetail(m, r); } }, ic('av', 16), el('span', { class: 't' }, el('span', { class: 'mono' }, mainCode(r)), r.kit ? ' (kit)' : '', ' ', el('span', { class: 'muted' }, descOf(r).slice(0, 80))), el('span', { class: 'num' }, r.p != null ? eur(r.p) : ''))));
  };

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
      // listino aperto di default: il Listino TD Nino (se c'è), altrimenti il più recente
      if (S.pavL == null || (S.pavL && !L.some(m => m.id === S.pavL))) { const d = L.find(m => /td\s*nino/i.test(m.nome || '')) || L[0]; S.pavL = d ? d.id : ''; }
      try { localStorage.setItem('hp_pavL', S.pavL || ''); } catch (e) { }
      const ready = L.every(m => S.pavRows.has(m.id));
      const cards = el('div', { class: 'hp-pavcards' }, L.map(m => el('div', { class: 'hp-pavcard' + (S.pavL === m.id ? ' on' : ''), role: 'button', tabindex: '0', onclick: () => { S.pavL = S.pavL === m.id ? '' : m.id; this.update(); }, onkeydown: e => { if (e.key === 'Enter') { S.pavL = S.pavL === m.id ? '' : m.id; this.update(); } } },
        el('div', { class: 'row between', style: 'gap:6px;flex-wrap:nowrap' }, el('b', { title: m.nome }, m.nome), el('span', { class: 'row', style: 'gap:2px;flex-wrap:nowrap' },
          el('button', { type: 'button', class: 'icon-btn', title: 'Sostituisci con un file aggiornato', 'aria-label': 'Aggiorna ' + m.nome, onclick: e => { e.stopPropagation(); window.hpPavUpload(m); } }, ic('up', 15)),
          el('button', { type: 'button', class: 'icon-btn', title: 'Elimina listino', 'aria-label': 'Elimina ' + m.nome, onclick: async e => { e.stopPropagation(); if (!await ask('Eliminare il listino «' + m.nome + '»?', 'Elimina')) return; if (await remove('proavListini', m.id)) { (m.imgs || []).forEach(b => fetch('/api/blob/' + b, { method: 'DELETE', credentials: 'same-origin', headers: H }).catch(() => { })); fetch('/api/proav/blob?id=' + encodeURIComponent(m.blob || m.id), { method: 'DELETE', credentials: 'same-origin', headers: H }).catch(() => { }); S.pavRows.delete(m.id); if (S.pavL === m.id) S.pavL = ''; toast('Listino eliminato'); } } }, ic('trash', 15)))),
        el('span', { class: 'hint' }, (m.periodo ? fmtP(m.periodo) + ' · ' : '') + (m.righe || 0).toLocaleString('it-IT') + ' articoli' + (m.kit ? ' · ' + m.kit + ' kit' : '') + ((m.map || {}).n && m.map.n.length ? ' · netti' : '')),
        el('span', { class: 'hint', style: 'font-size:.72rem' }, 'Caricato ' + fD(m.at) + (m.by ? ' da ' + (m.by === S.me ? 'te' : nm(m.by)) : '')))));
      const qIn = el('input', { type: 'search', value: S.pavQ, placeholder: 'Cerca codice o descrizione nei listini ProAV…', 'aria-label': 'Cerca nei listini ProAV', style: 'flex:1;min-width:220px' });
      const res = el('div', {});
      const draw = () => {
        if (!ready) { res.replaceChildren(el('p', { class: 'hint' }, el('span', { class: 'spin' }), ' Carico i listini…')); return; }
        const { tot, list } = search(S.pavQ, S.pavL);
        if (!S.pavQ && !S.pavL) { res.replaceChildren(el('p', { class: 'hint' }, 'Scrivi un codice o una parola, oppure scegli un listino qui sopra per sfogliarlo.')); return; }
        if (!list.length) { res.replaceChildren(el('p', { class: 'hint' }, 'Nessun articolo trovato.')); return; }
        const anyImg = list.some(({ r }) => r.img || (r.kit && r.kit.some(k => k.img)));
        res.replaceChildren(el('div', { class: 'tbl-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, [anyImg ? '' : null, 'Codice', 'SAP', 'Descrizione', 'Categoria', 'Listino', 'Netti', 'Fonte'].filter(x => x !== null).map(h => el('th', { class: h === 'Listino' || h === 'Netti' ? 'r' : '' }, h)))),
          el('tbody', {}, list.map(({ m, r }) => { const nets = netsOf(m, r); const im = r.img || (r.kit && (r.kit.find(k => k.img) || {}).img);
            return el('tr', { class: 'hp-click', onclick: () => rowDetail(m, r) }, anyImg ? el('td', {}, pimg(im, 44)) : null,
              el('td', { class: 'mono', style: 'white-space:nowrap' }, el('b', {}, mainCode(r)), window.hpGlobalChip ? el('div', { class: 'row', style: 'margin-top:3px;gap:4px' }, hpGlobalChip(mainCode(r), undefined, r.url || (r.kit && r.kit[0].url) || ''), window.hpTradChip ? hpTradChip(mainCode(r), r.url || (r.kit && r.kit[0].url) || '') : null) : null, r.kit ? el('div', { class: 'hint', style: 'font-size:.72rem' }, el('span', { class: 'tag new hp-kittag' }, 'KIT · ' + r.kit.length + ' articoli'), ' ' + r.kit.map(k => k.q + '× ' + k.c).join(' + ')) : null),
              el('td', { class: 'mono', style: 'font-size:.8rem' }, r.kit ? r.kit.map(k => el('div', {}, k.sap || '—')) : (r.sap || el('span', { class: 'muted' }, '—'))),
              el('td', {}, el('div', { class: 'hp-pavdesc', title: descOf(r) }, descOf(r))), el('td', {}, el('div', {}, r.cat || ''), r.tip ? el('small', { class: 'hint', style: 'display:block;max-width:220px' }, r.tip) : null), el('td', { class: 'r num' }, r.p != null ? el('b', {}, eur(r.p)) : el('span', { class: 'muted' }, '—')),
              el('td', { class: 'r num' }, nets.length ? nets.map(([h, v]) => el('div', { class: 'hp-net', title: h + ' · prezzo netto' }, eur(v), el('small', {}, ' ' + h))) : el('span', { class: 'muted' }, '—')),
              el('td', {}, el('span', { class: 'pill hp-pavpill' }, m.nome + (m.periodo ? ' (' + fmtP(m.periodo) + ')' : ''))));
          })))), el('p', { class: 'hint' }, tot > list.length ? 'Primi ' + list.length + ' risultati su ' + tot.toLocaleString('it-IT') + ': affina la ricerca.' : tot + (tot === 1 ? ' articolo' : ' articoli') + '. Clic su una riga per la scheda completa. In rosso i prezzi netti.'));
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
      el('div', { class: 'hp-pavhero' }, el('span', { class: 'hp-pavlogo', 'aria-hidden': 'true' }, ic('av', 26)), el('div', { class: 'stack', style: 'gap:2px' }, el('b', {}, 'Area ProAV'), el('span', { class: 'hint' }, 'Riservata a ' + whoTxt()), el('span', { class: 'hint', style: 'font-size:.72rem' }, space === 'grp' ? 'Stai vedendo commesse, calendario e magazzino di tutto il gruppo' : 'Commesse, calendario e magazzino: archivio privato ProAV'))),
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
