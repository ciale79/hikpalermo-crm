/* HIK PALERMO — Buoni pasto (gruppo e ProAV).
   Ogni utente carica il PDF dell'estratto conto della carta; il CRM esclude dal mese weekend, festivi, chiusure aziendali,
   ferie/malattia/fiere/trasferte a calendario e i giorni con un pasto pagato con la carta (ristoranti, Glovo, delivery…).
   L'utente rivede voci e giorni e scarica il file .xls nel formato richiesto (codice fiscale · BP · data · 1).
   I dati (codice fiscale, voci dell'estratto, scelte) restano nel documento privato dell'utente: data/users/<id>/bp. */
(function () {
  'use strict';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFW = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const XLSXLIB = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  ICONS.meal = 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5v5h3M17 3v18';
  if (!NAV.some(n => n[0] === 'bp')) { const i = NAV.findIndex(n => n[0] === 'set'); NAV.splice(i < 0 ? NAV.length : i, 0, ['bp', 'Buoni pasto', 'meal']); }

  const pad = n => String(n).padStart(2, '0');
  const key = (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d);
  const r2 = v => Math.round(v * 100) / 100;
  const money = s => { const t = String(s).replace(/\s/g, ''); if (!/^-?\d{1,3}(\.\d{3})*,\d{2}$|^-?\d+,\d{2}$/.test(t)) return null; return parseFloat(t.replace(/\./g, '').replace(',', '.')); };

  /* ---------- dati privati dell'utente ---------- */
  let D = null, loaded = false, saveT = 0;
  const docRef = () => db.doc('data/users/' + S.me + '/bp');
  function load() {
    if (loaded || typeof db === 'undefined' || !db || !S.me) return; loaded = true;
    docRef().onSnapshot(s => { if (!saveT) { D = s.exists ? s.data() : {}; if (S.view === 'bp') VIEWS.bp.update(); } }, () => { D = {}; });
  }
  const save = () => { clearTimeout(saveT); saveT = setTimeout(async () => { try { await docRef().set(D); } catch (e) { toast(errMsg(e), 'bad'); } saveT = 0; }, 500); };
  const month = k => { D.months = D.months || {}; return D.months[k] || (D.months[k] = { voci: [], over: {} }); };

  /* ---------- eventi del calendario: gruppo e (se abilitati) ProAV ---------- */
  let EV = { g: new Map(), p: new Map() }, evSub = false;
  function evLoad() {
    if (evSub || typeof db === 'undefined' || !db) return; evSub = true;
    db.collection('!eventi').onSnapshot(s => { const m = new Map(); s.docs.forEach(d => m.set(d.id, { id: d.id, ...d.data() })); EV.g = m; if (S.view === 'bp') VIEWS.bp.update(); }, () => { });
    db.collection('!proavEventi').onSnapshot(s => { const m = new Map(); s.docs.forEach(d => m.set(d.id, { id: d.id, ...d.data() })); EV.p = m; if (S.view === 'bp') VIEWS.bp.update(); }, () => { });
  }
  const evKind = e => {
    const t = (e.titolo || '') + ' ' + (e.note || '') + ' ' + (((typeof ETIPI !== 'undefined' && ETIPI.find(x => x[0] === e.tipo)) || [])[1] || e.tipo || '');
    if (/chiusura\s+aziendal/i.test(t)) return { k: 'chiusura', l: 'Chiusura aziendale', all: true };
    if (/\bferie\b|vacanz/i.test(t)) return { k: 'ferie', l: 'Ferie' };
    if (/malatti/i.test(t)) return { k: 'malattia', l: 'Malattia' };
    if (/\bfiera\b|\bfiere\b|\bexpo\b/i.test(t)) return { k: 'fiera', l: 'Fiera' };
    if (/trasfert/i.test(t)) return { k: 'trasferta', l: 'Trasferta' };
    return null;
  };
  // mappa giorno → motivi dal calendario
  function calReasons() {
    const out = new Map();
    for (const e of [...EV.g.values(), ...EV.p.values()]) {
      const k = evKind(e); if (!k || !e.start) continue;
      if (!k.all && !((e.part || []).includes(S.me) || e.by === S.me)) continue;
      const last = typeof evLast === 'function' ? evLast(e) : new Date((e.end || e.start) - 1);
      for (let d = new Date(dayKey(e.start) + 'T12:00'), i = 0; i < 120; d.setDate(d.getDate() + 1), i++) {
        const dk = dayKey(d); if (!out.has(dk)) out.set(dk, []);
        const arr = out.get(dk); if (!arr.some(x => x.l === k.l)) arr.push({ k: k.k, l: k.l, t: e.titolo || '' });
        if (dk >= dayKey(last)) break;
      }
    }
    return out;
  }

  /* ---------- lettura dell'estratto conto (PDF) ---------- */
  const MEAL = /glovo|deliveroo|just ?eat|uber ?eats|ristor|trattor|pizz|osteria|bistr|sushi|burger|mc ?donald|kfc|autogrill|\bbar\b|caff[eè]|\bcafe\b|panific|panin|rosticc|tavola calda|kebab|pok[eè]|food|bakery|gelat|pasticc|\bpub\b|enoteca|braceria|steak|ramen|roadhouse|old wild west|spizzico|cucina|mensa|eataly|risto|pranzo|cena|delivery|takeaway|take away|dispensa|forno|focacc|arancin|wok|china|gastronom|salumer|macelleria|chiosco|lounge|grill/i;
  const NOMEAL = /carburant|\beni\b|eni ?station|\bq8\b|esso|tamoil|\bip\b|agip|\bapi\b|autostrad|telepass|parchegg|parking|hotel|booking|airbnb|trenitalia|\bitalo\b|ryanair|easyjet|ita airways|alitalia|amazon|\btaxi\b|\buber\b(?! ?eats)|noleggio|hertz|avis|europcar|sixt|farmacia|tabacch|commission|canone|imposta|bollo|ricarica/i;
  const classify = desc => MEAL.test(desc) ? 'pasto' : NOMEAL.test(desc) ? 'altro' : 'verifica';
  async function pdfLines(buf) {
    await loadScript(PDFJS); pdfjsLib.GlobalWorkerOptions.workerSrc = window.HP_PDFW || PDFW;
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise; const out = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const tc = await (await pdf.getPage(p)).getTextContent();
      const L = [];
      for (const i of tc.items.filter(i => i.str && i.str.trim()).sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
        const y = i.transform[5]; const l = L.find(z => Math.abs(z.y - y) < 3); if (l) l.it.push(i); else L.push({ y, it: [i] });
      }
      for (const l of L) out.push(l.it.sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str.trim()).join('  '));
    }
    return out;
  }
  function parseStatement(lines) {
    const voci = [];
    for (const ln of lines) {
      const m = /^(\d{2})[.\/-](\d{2})[.\/-](\d{2,4})\s+(.+)$/.exec(ln.trim()); if (!m) continue;
      if (/^totale/i.test(m[4])) continue;
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      const toks = m[4].split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
      const amts = toks.map(money).filter(v => v != null);
      if (!amts.length) continue;
      const desc = toks.filter(t => money(t) == null && !/^\d{2}[.\/-]\d{2}[.\/-]\d{2,4}$/.test(t) && !/^(EUR|USD|GBP|CHF)$/i.test(t)).join(' ').replace(/\s+/g, ' ').trim();
      if (!desc) continue;
      const imp = amts[amts.length - 1];
      const cat = classify(desc);
      voci.push({ id: Math.random().toString(36).slice(2, 10), d: y + '-' + m[2] + '-' + m[1], desc, imp: r2(imp), cat, inc: cat !== 'altro' });
    }
    return voci;
  }
  const fileIn = el('input', { type: 'file', accept: '.pdf,application/pdf', multiple: true, hidden: true }); document.body.append(fileIn);
  fileIn.addEventListener('change', async () => {
    const files = [...fileIn.files]; fileIn.value = ''; if (!files.length) return;
    let add = [], months = new Set();
    const busy = el('div', { class: 'toast live', role: 'status' }, el('span', { class: 'spin' }), ' Leggo l\'estratto conto…'); ($('#toasts') || document.body).append(busy);
    try {
    for (const f of files) {
      try { const v = parseStatement(await pdfLines(await f.arrayBuffer())); if (!v.length) toast('«' + f.name + '»: nessun movimento riconosciuto.', 'bad'); add = add.concat(v); }
      catch (e) { toast('«' + f.name + '» non leggibile: ' + e.message, 'bad'); }
    }
    } finally { busy.remove(); }
    if (!add.length) return;
    let n = 0;
    for (const v of add) {
      const mk = v.d.slice(0, 7); const M = month(mk); months.add(mk);
      if (M.voci.some(x => x.d === v.d && x.desc === v.desc && x.imp === v.imp)) continue; // già caricata
      M.voci.push(v); n++;
    }
    save();
    const mk = [...months].sort().pop(); if (mk) S.bpMonth = mk;
    toast(n ? n + (n === 1 ? ' movimento importato' : ' movimenti importati') + ' dall\'estratto conto' : 'Movimenti già presenti');
    VIEWS.bp.update();
  });

  /* ---------- calcolo del mese ---------- */
  function compute(mk) {
    const [y, m1] = mk.split('-').map(Number); const m = m1 - 1;
    const F = festivi(y), CAL = calReasons(), M = month(mk);
    const days = [];
    for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) {
      const dt = new Date(y, m, d), dk = key(y, m, d), wd = dt.getDay();
      const why = [];
      if (wd === 0 || wd === 6) why.push({ k: 'we', l: wd === 6 ? 'Sabato' : 'Domenica' });
      const fe = F.get(m + '-' + d); if (fe) why.push({ k: 'festivo', l: fe });
      for (const r of CAL.get(dk) || []) why.push(r);
      const pasti = M.voci.filter(v => v.d === dk && v.inc);
      if (pasti.length) why.push({ k: 'pasto', l: pasti.map(v => v.desc + ' ' + eur(v.imp)).join(' · ') });
      const auto = !why.length;
      const o = M.over ? M.over[dk] : undefined;
      days.push({ d, dk, wd, why, auto, bp: o === undefined ? auto : !!o, man: o !== undefined });
    }
    return days;
  }

  /* ---------- file .xls ---------- */
  async function exportXls(mk, days) {
    const cf = String(D.cf || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{16}$/.test(cf)) { toast('Inserisci il tuo codice fiscale (16 caratteri) per generare il file.', 'bad'); document.getElementById('bpCf')?.focus(); return; }
    await loadScript(XLSXLIB);
    const [y, m1] = mk.split('-').map(Number);
    // data come numero seriale di Excel (giorno intero, senza ore), formato gg/mm/aaaa
    const serial = d => Math.round((Date.UTC(y, m1 - 1, d) - Date.UTC(1899, 11, 30)) / 864e5);
    const rows = days.filter(x => x.bp).map(x => [cf, 'BP', serial(x.d), 1]);
    if (!rows.length) { toast('Nessun giorno con diritto al buono pasto in questo mese.', 'bad'); return; }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    for (let r = 0; r < rows.length; r++) { const c = ws[XLSX.utils.encode_cell({ r, c: 2 })]; if (c) { c.t = 'n'; c.z = 'dd/mm/yyyy'; } }
    ws['!cols'] = [{ wch: 22 }, { wch: 5 }, { wch: 11 }, { wch: 5 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Foglio1');
    const cogn = String(D.cognome || nm(S.me).split(' ').pop() || 'Utente').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ');
    // carattere Arial 10: SheetJS scrive un solo FONT (Arial 12) nel file BIFF8; ne correggiamo l'altezza (in ventesimi di punto)
    const u8 = new Uint8Array(XLSX.write(wb, { bookType: 'xls', type: 'array' }));
    for (let i = 0; i < u8.length - 12; i++) if (u8[i] === 0x31 && u8[i + 1] === 0 && u8[i + 4] === 0xF0 && u8[i + 5] === 0 && u8[i + 10] === 0x90 && u8[i + 11] === 0x01) { u8[i + 4] = 200; u8[i + 5] = 0; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: 'application/vnd.ms-excel' }));
    a.download = 'Buoni Pasto ' + y + ' ' + MESI[m1 - 1] + ' ' + cogn + '.xls'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('File con ' + rows.length + ' buoni pasto scaricato');
  }

  /* ---------- pagina ---------- */
  const defMonth = () => { const t = new Date(); const d = t.getDate() <= 10 ? new Date(t.getFullYear(), t.getMonth() - 1, 1) : t; return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  const CHIP = { we: 'var(--ink-3)', festivo: 'var(--violet)', chiusura: '#C8102E', ferie: 'var(--info)', malattia: 'var(--info)', fiera: 'var(--warn)', trasferta: 'var(--warn)', pasto: 'var(--bad)' };
  const CATL = { pasto: ['Pasto', 'var(--bad)'], verifica: ['Da verificare', 'var(--warn)'], altro: ['Non è un pasto', 'var(--ink-3)'] };
  VIEWS.bp = {
    title: () => 'Buoni pasto',
    mount() { this.root = $('#view'); load(); evLoad(); this.update(); },
    update() {
      const r = this.root; if (!r) return; load(); evLoad();
      if (!D) { r.replaceChildren(loading()); return; }
      const mk = S.bpMonth || (S.bpMonth = defMonth());
      const [y, m1] = mk.split('-').map(Number);
      const M = month(mk); const days = compute(mk);
      const nBP = days.filter(x => x.bp).length, nLav = days.filter(x => x.wd !== 0 && x.wd !== 6 && !x.why.some(w => w.k === 'festivo')).length;
      const mIn = el('input', { type: 'month', value: mk, 'aria-label': 'Mese', onchange: e => { if (e.target.value) { S.bpMonth = e.target.value; this.update(); } } });
      const shift = k => { const d = new Date(y, m1 - 1 + k, 1); S.bpMonth = d.getFullYear() + '-' + pad(d.getMonth() + 1); this.update(); };
      const head = el('div', { class: 'row between' }, el('div', { class: 'stack', style: 'gap:2px' }, el('span', { class: 'eyebrow' }, 'Riepilogo mensile · i dati sono visibili solo a te'), el('h2', { style: 'margin:0' }, 'Buoni pasto · ' + MESI[m1 - 1] + ' ' + y)),
        el('div', { class: 'row', style: 'gap:6px' }, btn('‹', () => shift(-1), 'sm'), mIn, btn('›', () => shift(1), 'sm'), btn('Scarica file XLS (' + nBP + ')', () => exportXls(mk, days), 'pri', 'dl')));
      // dati per il file
      const cf = el('input', { id: 'bpCf', type: 'text', value: D.cf || '', maxlength: 16, placeholder: 'Codice fiscale', style: 'text-transform:uppercase;width:100%;max-width:220px', autocomplete: 'off', onchange: e => { D.cf = e.target.value.trim().toUpperCase(); save(); } });
      const cg = el('input', { type: 'text', value: D.cognome || nm(S.me).split(' ').pop() || '', placeholder: 'Cognome', style: 'width:100%;max-width:220px', onchange: e => { D.cognome = e.target.value.trim(); save(); this.update(); } });
      const kpi = el('div', { class: 'kpis' },
        el('div', { class: 'kpi' }, el('span', { class: 'eyebrow' }, 'Buoni pasto'), el('span', { class: 'v', style: 'color:var(--ok)' }, String(nBP)), el('span', { class: 's' }, 'su ' + nLav + ' giorni lavorativi')),
        el('div', { class: 'kpi' }, el('span', { class: 'eyebrow' }, 'Pasti con la carta'), el('span', { class: 'v' }, String(new Set(M.voci.filter(v => v.inc).map(v => v.d)).size)), el('span', { class: 's' }, M.voci.filter(v => v.inc).length + ' voci · ' + eur(M.voci.filter(v => v.inc).reduce((a, v) => a + v.imp, 0)))),
        el('div', { class: 'kpi' }, el('span', { class: 'eyebrow' }, 'Ferie, fiere e chiusure'), el('span', { class: 'v' }, String(days.filter(x => x.wd !== 0 && x.wd !== 6 && x.why.some(w => ['ferie', 'malattia', 'fiera', 'trasferta', 'chiusura'].includes(w.k))).length)), el('span', { class: 's' }, 'giorni lavorativi dal calendario')),
        el('div', { class: 'kpi' }, el('span', { class: 'eyebrow' }, 'Dati per il file'), el('div', { class: 'stack', style: 'gap:6px' }, cf, cg), el('span', { class: 's', style: 'font-size:.72rem;overflow-wrap:anywhere' }, 'Buoni Pasto ' + y + ' ' + MESI[m1 - 1] + ' ' + (D.cognome || nm(S.me).split(' ').pop()) + '.xls')));
      // voci dell'estratto
      const vRows = M.voci.slice().sort((a, b) => a.d.localeCompare(b.d));
      const voci = el('section', { class: 'panel stack' }, el('div', { class: 'panel-h' }, el('div', { class: 'stack', style: 'gap:2px' }, el('h3', {}, 'Estratto conto della carta'), el('span', { class: 'hint' }, 'Carica il PDF dei movimenti: le spese per pasti (ristoranti, Glovo, delivery…) tolgono il buono di quel giorno. Togli la spunta alle voci che non sono pasti.')),
        el('div', { class: 'row' }, vRows.length ? el('a', { href: '#', class: 'hint', onclick: async e => { e.preventDefault(); if (!await ask('Togliere tutte le voci dell\'estratto conto di ' + MESI[m1 - 1] + '?', 'Togli')) return; M.voci = []; save(); this.update(); } }, 'Svuota') : null, btn('Carica estratto conto (PDF)', () => fileIn.click(), vRows.length ? '' : 'pri', 'up'))),
        vRows.length ? el('div', { class: 'tbl-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ['Conta', 'Data', 'Descrizione', 'Importo', 'Tipo'].map((h, i) => el('th', { class: i === 3 ? 'r' : '' }, h)))),
          el('tbody', {}, vRows.map(v => { const [cl, cc] = CATL[v.cat] || CATL.verifica; const dd = new Date(v.d + 'T12:00');
            return el('tr', { class: v.inc ? '' : 'hp-bpoff' }, el('td', {}, el('input', { type: 'checkbox', checked: v.inc, 'aria-label': 'Conta ' + v.desc + ' come pasto', onchange: e => { v.inc = e.target.checked; save(); this.update(); } })),
              el('td', { class: 'num', style: 'white-space:nowrap' }, dd.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' })), el('td', {}, el('b', {}, v.desc)), el('td', { class: 'r num' }, eur(v.imp)),
              el('td', {}, el('span', { class: 'pill', style: '--c:' + cc }, cl), ' ', el('button', { type: 'button', class: 'icon-btn', title: 'Elimina la voce', 'aria-label': 'Elimina ' + v.desc, onclick: () => { M.voci = M.voci.filter(x => x !== v); save(); this.update(); } }, ic('trash', 14))));
          })))) : emptyBox('Nessun movimento per ' + MESI[m1 - 1], 'Carica il PDF dell\'estratto conto della carta di credito: puoi caricarne più di uno se il mese è diviso in due estratti.'));
      // calendario del mese
      const grid = el('div', { class: 'hp-bpcal' }, ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(d => el('div', { class: 'dh' }, d)));
      const lead = (new Date(y, m1 - 1, 1).getDay() + 6) % 7; for (let i = 0; i < lead; i++) grid.append(el('div', { class: 'hp-bpday out' }));
      for (const x of days) {
        const no = !x.bp;
        grid.append(el('label', { class: 'hp-bpday' + (no ? ' no' : ' ok') + (x.wd === 0 || x.wd === 6 ? ' we' : '') + (x.man ? ' man' : ''), title: x.why.map(w => w.l + (w.t ? ' (' + w.t + ')' : '')).join(' · ') || 'Giorno lavorativo' },
          el('div', { class: 'row between', style: 'flex-wrap:nowrap;gap:4px' }, el('b', {}, String(x.d)),
            el('span', { class: 'hp-bpck' }, el('input', { type: 'checkbox', checked: no, 'aria-label': 'Niente buono pasto il ' + x.d, onchange: e => { M.over = M.over || {}; const v = !e.target.checked; if (v === x.auto) delete M.over[x.dk]; else M.over[x.dk] = v; save(); this.update(); } }), 'No BP')),
          el('div', { class: 'hp-bpwhy' }, x.why.map(w => el('span', { class: 'hp-bpchip', style: '--c:' + (CHIP[w.k] || 'var(--ink-3)'), title: w.t || w.l }, w.k === 'pasto' ? 'Pasto: ' + w.l : w.l))),
          el('div', { class: 'hp-bpst' }, x.bp ? el('span', { class: 'hp-bpyes' }, '✓ Buono pasto') : null, x.man ? el('a', { href: '#', class: 'hint', title: 'Torna alla scelta automatica', onclick: e => { e.preventDefault(); e.stopPropagation(); delete M.over[x.dk]; save(); this.update(); } }, 'modificato · ripristina') : null)));
      }
      const cal = el('section', { class: 'panel stack' }, el('div', { class: 'panel-h' }, el('div', { class: 'stack', style: 'gap:2px' }, el('h3', {}, 'Revisione del mese'), el('span', { class: 'hint' }, 'Spuntato «No BP» = niente buono pasto. Già spuntati: weekend, festivi, chiusure aziendali, ferie, malattia, fiere e trasferte a calendario e i giorni con un pasto in carta. Cambia la spunta per correggere.')),
        el('span', { class: 'pill', style: '--c:var(--ok)' }, nBP + ' buoni')), grid,
        el('p', { class: 'hint' }, 'Ferie, malattia, fiere e trasferte vengono dagli appuntamenti del calendario in cui sei tra i partecipanti (o che hai creato tu), anche a giornata intera su più giorni; le chiusure aziendali valgono per tutti.'));
      r.replaceChildren(head, kpi, voci, cal);
    }
  };
  if (location.hash === '#bp' && S.view !== 'bp') setTimeout(() => go('bp'), 0);
  if (S.view === 'bp') VIEWS.bp.mount();
  if (typeof renderNav === 'function') renderNav();
})();
