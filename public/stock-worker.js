/* HIK PALERMO — lettura del file «analisi stock» (xlsb/xlsx) in un Web Worker.
   Dal foglio «Analysis» estrae, per ogni codice SAP, le colonne di disponibilità; restituisce solo le righe con almeno un valore. */
/* global XLSX */
self.onmessage = async ev => {
  const { buf, lib } = ev.data;
  const say = (p, t) => self.postMessage({ progress: p, text: t });
  try {
    say(5, 'Carico il lettore Excel…');
    if (typeof XLSX === 'undefined') importScripts(lib);
    say(15, 'Leggo il file (può richiedere fino a un minuto)…');
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array', dense: true, cellFormula: false, cellHTML: false, cellText: false, cellStyles: false, sheets: ['Analysis'] });
    say(80, 'Estraggo le disponibilità…');
    self.postMessage({ result: compute(wb) });
  } catch (e) { self.postMessage({ error: String(e && e.message || e) }); }
};
// colonne richieste, riconosciute dall'intestazione
const COLS = [
  ['i1100', /stock\s*1100/i], ['e1006', /stock\s*1006/i], ['n1003', /stock\s*1003/i], ['tot', /stock\s*totale/i],
  ['po', /^\s*po\b|ordini\s*acquist/i], ['oc', /^\s*oc\b|ordini\s*vendit/i], ['fut', /disponibilit/i], ['ams', /stock\s*ams/i]
];
function compute(wb) {
  const ws = wb.Sheets['Analysis'];
  if (!ws) throw new Error('Nel file manca il foglio «Analysis»: è il file di analisi stock giusto?');
  const rows = Array.isArray(ws) ? ws : (ws['!data'] || null);
  const cell = rows ? (r, c) => { const x = rows[r] && rows[r][c]; return x ? x.v : null; } : (r, c) => { const x = ws[XLSX.utils.encode_cell({ r, c })]; return x ? x.v : null; };
  const nRows = rows ? rows.length : XLSX.utils.decode_range(ws['!ref']).e.r + 1;
  // riga d'intestazione: quella con «SAP» in colonna A
  let h = -1; for (let r = 0; r < Math.min(30, nRows); r++) if (/^\s*sap\s*$/i.test(String(cell(r, 0) || ''))) { h = r; break; }
  if (h < 0) throw new Error('Intestazione «SAP» non trovata nel foglio Analysis.');
  const H = []; for (let c = 0; c < 200; c++) H.push(String(cell(h, c) || '').replace(/\s+/g, ' ').trim());
  const idx = {}; for (const [k, re] of COLS) { const i = H.findIndex(x => re.test(x)); if (i < 0) throw new Error('Colonna non trovata: ' + k); idx[k] = i; }
  const keys = COLS.map(c => c[0]); const out = []; let empty = 0, tot = 0;
  for (let r = h + 1; r < nRows && empty < 1000; r++) {
    const sap = cell(r, 0); if (sap == null || sap === '' || sap === 0 || String(sap).trim() === '0') { empty++; continue; } empty = 0; tot++;
    const v = keys.map(k => { const x = +cell(r, idx[k]); return isFinite(x) ? Math.round(x * 100) / 100 : 0; });
    if (v.some(x => x)) out.push([String(sap).trim(), ...v]);
  }
  return { cols: keys, labels: keys.map(k => H[idx[k]]), rows: out, righe: tot };
}
