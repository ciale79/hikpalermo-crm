/* HIK PALERMO — lettura del file Sales Analysis (xlsb/xlsx) in un Web Worker.
   Riceve il file, calcola i totali per la pagina Fatturato e per il pannello laterale, restituisce solo gli aggregati. */
/* global XLSX */
self.onmessage = async ev => {
  const { buf, name, kam, lib } = ev.data;
  const say = (p, t) => self.postMessage({ progress: p, text: t });
  try {
    say(5, 'Carico il lettore Excel…');
    if (typeof XLSX === 'undefined') importScripts(lib);
    say(15, 'Leggo il file (può richiedere fino a un minuto)…');
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array', dense: true, cellDates: true, cellFormula: false, cellHTML: false, cellText: false, sheets: ['Cover', 'Import Sales Data', 'Open Orders'] });
    say(70, 'Calcolo i totali…');
    self.postMessage({ result: compute(wb, name, kam) });
  } catch (e) {
    self.postMessage({ error: String(e && e.message || e) });
  }
};

function compute(wb, name, kamName) {
  const sh = n => wb.Sheets[n] || null;
  const S = sh('Import Sales Data'), O = sh('Open Orders'), C = sh('Cover');
  if (!S) throw new Error('Nel file manca il foglio «Import Sales Data»: è il file Sales Analysis giusto?');
  const rows = XLSX.utils.sheet_to_json(S, { header: 1, raw: true, defval: null, blankrows: false });
  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
  const H = rows[0].map(norm);
  const col = (...names) => { for (const n of names) { const i = H.indexOf(norm(n)); if (i >= 0) return i; } return -1; };
  const I = {
    ch: col('Channel'), dd: col('Delivery Date'), cust: col('Customer_1'), type: col('Customer Type'), area: col('Area'), am: col('Area Manager'),
    macro: col('Macro Category'), fam: col('Product Family'), y: col('Calendar year'), m: col('Calendar month'), amt: col('Total Amount (€)', 'Total Amount(€)'), um: col('U_Macro Category')
  };
  for (const [k, v] of Object.entries(I)) if (v < 0 && k !== 'um') throw new Error('Colonna mancante nel foglio Import Sales Data: ' + k);

  // data di aggiornamento: foglio Cover (Giorno, Mese, Anno), altrimenti la consegna più recente
  let cut = null;
  if (C) {
    const cr = XLSX.utils.sheet_to_json(C, { header: 1, raw: true, defval: null });
    for (const r of cr) { const i = r.findIndex(x => norm(x) === 'data'); if (i >= 0 && +r[i + 1] && +r[i + 2] && +r[i + 3]) { cut = new Date(Date.UTC(+r[i + 3], +r[i + 2] - 1, +r[i + 1])); break; } }
  }
  const ts = v => v instanceof Date ? v.getTime() : typeof v === 'number' ? Math.round((v - 25569) * 864e5) : v ? Date.parse(v) : NaN;
  if (!cut) { let mx = 0; for (let i = 1; i < rows.length; i++) { const t = ts(rows[i][I.dd]); if (t > mx) mx = t; } cut = new Date(mx); }
  const Y = cut.getUTCFullYear(), PY = Y - 1;
  const cut25 = Date.UTC(PY, cut.getUTCMonth(), cut.getUTCDate(), 23, 59, 59);

  const r2 = v => Math.round(v * 100) / 100;
  const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };
  const z4 = () => [0, 0, 0, 0], z12 = () => Array(12).fill(0);
  const T = { it: z4(), itO: z4(), si: z4(), siO: z4(), itNR: 0, siNR: 0, itSp: 0, siSp: 0,
    siCh: { PRO: z4(), SOLUTION: z4(), COMUNI: z4() },
    m: { it_m26: z12(), it_m25: z12(), si_m26: z12(), si_m25: z12(), si_pro_m26: z12(), si_sol_m26: z12(), si_pro_m25: z12(), si_sol_m25: z12() } };
  const canali = {}, regioni = {}, macro = {}, clienti = {}, tipi = {}, famPro = {}, famSol = {}, kam = {};
  const pair = (o, k) => (o[k] || (o[k] = [0, 0]));

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const y = +r[I.y], mo = +r[I.m], a = +r[I.amt] || 0;
    if (!y || !mo || !a) continue;
    const ch = String(r[I.ch] || '').trim().toUpperCase();
    const area = String(r[I.area] || '').trim().toUpperCase();
    const sic = area === 'SICILIA';
    const nr = ch !== 'REBATE';
    const own = nr && ch !== 'EZVIZ' && String(I.um >= 0 ? r[I.um] : '').trim().toLowerCase() !== 'outdoor';
    const is26 = y === Y;
    const isSp = y === PY && ts(r[I.dd]) <= cut25;
    const q = Math.floor((mo - 1) / 3);
    if (is26) {
      T.itNR += a; if (sic) T.siNR += a;
      if (nr) { T.it[q] += a; if (sic) T.si[q] += a; }
    }
    if (!own) continue;
    if (is26) {
      T.itO[q] += a; T.m.it_m26[mo - 1] += a;
      if (sic) {
        T.siO[q] += a; T.m.si_m26[mo - 1] += a;
        if (T.siCh[ch]) T.siCh[ch][q] += a;
        if (ch === 'PRO') { T.m.si_pro_m26[mo - 1] += a; add(famPro, r[I.fam] || '—', a); }
        if (ch === 'SOLUTION') { T.m.si_sol_m26[mo - 1] += a; add(famSol, r[I.fam] || '—', a); }
        add(tipi, r[I.type] || '—', a);
      }
    } else if (y === PY) {
      T.m.it_m25[mo - 1] += a;
      if (sic) { T.m.si_m25[mo - 1] += a; if (ch === 'PRO') T.m.si_pro_m25[mo - 1] += a; if (ch === 'SOLUTION') T.m.si_sol_m25[mo - 1] += a; }
    }
    if (isSp) { T.itSp += a; if (sic) T.siSp += a; }
    if (!is26 && !isSp) continue;
    const k = is26 ? 0 : 1;
    if (area) pair(regioni, area)[k] += a;
    if (kamName && String(r[I.am] || '').trim().toLowerCase() === kamName.toLowerCase() && area) pair(kam, area)[k] += a;
    if (sic) {
      pair(canali, ch)[k] += a;
      pair(macro, r[I.macro] || '—')[k] += a;
      const cn = String(r[I.cust] || '—').trim();
      const c = clienti[cn] || (clienti[cn] = { t: r[I.type] || '', a: 0, b: 0, p: 0, s: 0 });
      if (is26) { c.a += a; if (ch === 'PRO') c.p += a; if (ch === 'SOLUTION') c.s += a; } else c.b += a;
    }
  }

  // ordini aperti (esclusi EZVIZ e Rebate)
  const oo = { italia: 0, sicilia: 0, siCanali: {}, siClienti: {} };
  if (O) {
    const orows = XLSX.utils.sheet_to_json(O, { header: 1, raw: true, defval: null, blankrows: false });
    const OH = orows[0].map(norm); const oc = n => OH.indexOf(norm(n));
    const J = { ch: oc('Channel'), area: oc('Area'), cust: oc('Customer_1'), amt: OH.findIndex(h => h.startsWith('total amount') && h.includes('€')) };
    for (let i = 1; i < orows.length; i++) {
      const r = orows[i]; const a = +r[J.amt] || 0; if (!a) continue;
      const ch = String(r[J.ch] || '').trim().toUpperCase(); if (ch === 'EZVIZ' || ch === 'REBATE') continue;
      oo.italia += a;
      if (String(r[J.area] || '').trim().toUpperCase() === 'SICILIA') { oo.sicilia += a; add(oo.siCanali, ch, a); add(oo.siClienti, String(r[J.cust] || '—').trim(), a); }
    }
  }

  const sum = a => a.reduce((x, y) => x + y, 0);
  const pairs = o => Object.entries(o).filter(([, v]) => v[0] || v[1]).map(([k, v]) => [k, r2(v[0]), r2(v[1])]).sort((x, y) => y[1] - x[1]);
  const top = (o, n) => Object.entries(o).map(([k, v]) => [k, r2(v)]).sort((x, y) => y[1] - x[1]).slice(0, n);
  const iso = d => new Date(d).toISOString().slice(0, 10);
  const lab = d => { const x = new Date(d); return String(x.getUTCDate()).padStart(2, '0') + '/' + String(x.getUTCMonth() + 1).padStart(2, '0') + '/' + x.getUTCFullYear(); };
  const mapR = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v.map(r2) : r2(v)]));
  const cl = Object.entries(clienti).filter(([, c]) => c.a || c.b).map(([k, c]) => [k, c.t, r2(c.a), r2(c.b), r2(c.p), r2(c.s)]).sort((x, y) => y[2] - x[2]);

  const fatturato = {
    cut: iso(cut), cut25: iso(cut25), m: mapR(T.m), itSp25: r2(T.itSp), siSp25: r2(T.siSp),
    regioni: pairs(regioni), kam: { nome: kamName || '', aree: pairs(kam) }, clienti: cl, nClienti: cl.length,
    macro: pairs(macro), canali: pairs(canali), siQ: mapR(T.siCh), tipiCliente: top(tipi, 20),
    famPro: top(famPro, 8), famSol: top(famSol, 8),
    oo: { italia: r2(oo.italia), sicilia: r2(oo.sicilia), siCanali: mapR(oo.siCanali), siClienti: top(oo.siClienti, 50) }
  };
  const sales = {
    anno: Y, data: iso(cut), dataLabel: lab(cut), file: String(name || '').replace(/\.(xlsb|xlsx|xlsm|xls)$/i, ''),
    italia: r2(sum(T.it)), italiaQ: T.it.map(r2), italiaOwn: r2(sum(T.itO)), italiaOwnQ: T.itO.map(r2), italiaNettoRebate: r2(T.itNR),
    sicilia: r2(sum(T.si)), siciliaQ: T.si.map(r2), siciliaOwn: r2(sum(T.siO)), siciliaOwnQ: T.siO.map(r2), siciliaNettoRebate: r2(T.siNR),
    siciliaCh: { PRO: T.siCh.PRO.map(r2), SOLUTION: T.siCh.SOLUTION.map(r2) },
    nota: 'Fatturato ' + Y + ' da Import Sales Data, escluso canale REBATE (come foglio Customer (Fatturato))',
    notaOwn: 'Prodotti propri: esclusi canale EZVIZ, U_Macro Category Outdoor e Rebate'
  };
  return { sales, fatturato, righe: rows.length - 1 };
}
