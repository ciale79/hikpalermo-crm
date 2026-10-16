/* HIK PALERMO — import del report partner (Excel "Report Partner ProExpert e Solution") nella pagina Partner */
(function () {
  'use strict';
  const fileIn = el('input', { type: 'file', accept: '.xlsx,.xlsm,.xls', hidden: true });
  document.body.appendChild(fileIn);
  fileIn.addEventListener('change', () => { const f = fileIn.files[0]; fileIn.value = ''; if (f) run(f); });
  window.hpPartnerImport = () => fileIn.click();

  const N = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const H = s => N(s).toLowerCase();
  const piva = v => { const d = String(v == null ? '' : v).replace(/\D/g, ''); return d ? d.padStart(11, '0') : ''; };
  const normName = s => H(s).replace(/\b(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|unipersonale|semplificata|soc\.?|societa|cooperativa)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const title = s => N(s).toLowerCase().replace(/(^|[\s'-])\S/g, m => m.toUpperCase());
  function tel(v) { let s = String(v == null ? '' : v).replace(/\D/g, ''); if (!s) return ''; if (s.startsWith('3') && s.length === 10) return s.slice(0, 3) + ' ' + s.slice(3, 6) + ' ' + s.slice(6); if (s.length >= 8 && !/^[03]/.test(s)) s = '0' + s; return s; }
  function addr(a, provName) {
    a = N(a).replace(/,\s*Italia$/i, ''); let citta = '', prov = '';
    let m = /,\s*(?:\d{5}\s+)?([^,]+?),?\s+([A-Z]{2})\b/.exec(a);
    if (m) { citta = m[1].trim(); prov = m[2]; } else if ((m = /(\d{5})\s+([^,]+)/.exec(a))) citta = m[2].trim();
    if (!citta && provName) citta = N(provName);
    return { indirizzo: a, citta: citta.replace(/^\d{5}\s+/, ''), prov };
  }
  const dateStr = v => v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'number' ? new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10) : N(v).slice(0, 10);

  function table(wb, name) {
    const ws = wb.Sheets[name]; if (!ws) return null;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
    const hi = rows.findIndex(r => r && r.some(x => H(x) === 'azienda'));
    if (hi < 0) return null;
    const head = rows[hi].map(H);
    return rows.slice(hi + 1).filter(r => r && r.some(x => x != null && x !== '')).map(r => { const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i]; }); return o; });
  }

  async function run(file) {
    const wait = modal('Leggo il report partner', el('div', { class: 'stack' }, el('p', {}, el('b', {}, file.name)), el('p', { class: 'hint' }, 'Lettura del file in corso…')), [], { sticky: true });
    let wb;
    try {
      const X = await xlsxLib();
      const buf = await file.arrayBuffer();
      await new Promise(r => setTimeout(r, 30));
      wb = X.read(new Uint8Array(buf), { type: 'array', dense: true, cellDates: true, sheets: ['DB', 'Help Desk', 'CODICI PARTNER'] });
    } catch (e) { wait.close(); toast('File non leggibile: ' + (e.message || e), 'bad'); return; }
    wait.close();
    const db = table(wb, 'DB') || table(wb, 'Help Desk');
    if (!db) { toast('Nel file non trovo il foglio «DB» (o «Help Desk») con la colonna Azienda: è il report partner giusto?', 'bad'); return; }
    const codes = new Map();
    for (const r of table(wb, 'CODICI PARTNER') || []) { const p = piva(r['partita iva']); const c = r['codice tessera']; if (p && c) codes.set(p, String(c)); }
    for (const r of table(wb, 'Help Desk') || []) { const p = piva(r['partita iva']); const c = r['codice tessera']; if (p && c && !codes.has(p)) codes.set(p, String(c)); }

    // clienti del CRM indicizzati per P.IVA e per nome
    const byPiva = new Map(), byName = new Map();
    for (const c of S.clienti.values()) { if (c.piva) byPiva.set(piva(c.piva), c); byName.set(normName(c.nome), c); if (c.partner && c.partner.nomeReview) byName.set(normName(c.partner.nomeReview), c); }
      const toks = x => new Set(normName(x).split(' ').filter(w => w.length > 1 && !['di', 'e', 'c', 'la', 'il', 'de'].includes(w)));
    const sim = (x, y) => { const A = toks(x), B = toks(y); if (!A.size || !B.size) return 0; let n = 0; A.forEach(w => { if (B.has(w)) n++; }); return n / Math.min(A.size, B.size); };
    const findCli = (p, name) => byPiva.get(p) || byName.get(normName(name)) || [...S.clienti.values()].find(c => { const a = normName(c.nome), b = normName(name); return a.length > 4 && b.length > 4 && (a.startsWith(b) || b.startsWith(a)); })
      || [...S.clienti.values()].map(c => [c, Math.max(sim(c.nome, name), c.partner && c.partner.nomeReview ? sim(c.partner.nomeReview, name) : 0)]).filter(x => x[1] >= 0.75 && toks(x[0].nome).values().next().value === toks(name).values().next().value).sort((a, b) => b[1] - a[1]).map(x => x[0])[0];

    // righe da importare: partner con distributore CDA + partner già presenti nel CRM
    const seen = new Set(); const items = [];
    for (const r of db) {
      const az = N(r['azienda']); if (!az) continue;
      const p = piva(r['partita iva']); const key = p || normName(az);
      const cli = findCli(p, az);
      const cda = /cda/i.test(N(r['distributore']));
      if (!cda && !(cli && cli.partner)) continue;
      if (seen.has(key)) continue; seen.add(key);
      const piano = N(r['piano']); const liv = N(r['livello']).toUpperCase();
      const acc = N(r['accordo 2026'] || r['accordo']).toUpperCase(); const stato = N(r['stato']);
      const accordo = acc === 'RINNOVATO' || acc === 'NUOVO' ? acc : (/lost|perso/i.test(stato) ? 'SCADUTO' : acc);
      const catalogo = /proexpert/i.test(piano) ? 'PRO' : 'SOLUTION';
      const a = addr(r['indirizzo sede legate'] || r['indirizzo sede legale'], r['provincia']);
      const ana = { referente: [title(r['nome']), title(r['cognome'])].filter(Boolean).join(' '), tel: tel(r['telefono']), email: N(r['mail']).toLowerCase(), piva: p, ...a,
        regione: N(r['regione']), provincia: N(r['provincia']), tipologia: N(r['sei un']), fatturatoAnno: N(r['fatturato anno p']), fatturatoHik: N(r['fatturato hik']),
        cosaInstalla: N(r['cosa installi']), distributore: N(r['distributore']), titolare: N(r['titolare']), dataAdesione: r['data'] ? dateStr(r['data']) : '' };
      Object.keys(ana).forEach(k => { if (!ana[k]) delete ana[k]; });
      const part = { tier: liv, catalogo, programma: piano, accordo, codice: codes.get(p) || '', statoContratto: N(r['fase di lavorazione']), esito: stato, partner2025: N(r['partner 2025']) };
      items.push({ az, cli, ana, part, cda });
    }
    if (!items.length) { toast('Nessun partner CDA trovato nel file.', 'bad'); return; }
    preview(items, file.name);
  }

  function preview(items, fname) {
    const ACC = { NUOVO: 'var(--ok)', RINNOVATO: 'var(--info)', SCADUTO: 'var(--accent)' };
    const chg = it => { if (!it.cli) return 'Nuovo cliente'; const o = it.cli.partner || {}; const d = []; if (o.tier !== it.part.tier) d.push((o.tier || '—') + ' → ' + it.part.tier); if ((o.programma || o.catalogo) !== it.part.programma) d.push((o.programma || o.catalogo || '—') + ' → ' + it.part.programma); if ((o.accordo || '') !== it.part.accordo) d.push('accordo ' + (o.accordo || '—') + ' → ' + it.part.accordo); if (!o.codice && it.part.codice) d.push('codice ' + it.part.codice); return d.length ? d.join(' · ') : (it.cli.partner ? 'Dati anagrafici' : 'Diventa partner'); };
    const pick = new Set(items.map((_, i) => i));
    const rows = items.map((it, i) => el('tr', {},
      el('td', {}, el('input', { type: 'checkbox', checked: true, onchange: e => e.target.checked ? pick.add(i) : pick.delete(i) })),
      el('td', {}, el('b', {}, it.cli ? it.cli.nome : it.az), it.cli && normName(it.cli.nome) !== normName(it.az) ? el('div', { class: 'hint' }, 'nel file: ' + it.az) : null),
      el('td', {}, it.part.programma), el('td', {}, tierChip(it.part.tier)), el('td', {}, el('span', { class: 'pill', style: '--c:' + (ACC[it.part.accordo] || 'var(--ink-3)') }, it.part.accordo || '—')),
      el('td', { class: 'mono' }, it.part.codice || '—'), el('td', { class: 'hint' }, chg(it))));
    const nNew = items.filter(x => !x.cli).length;
    const body = el('div', { class: 'stack' },
      el('p', {}, items.length + ' partner nel file (' + items.filter(x => x.cda).length + ' con distributore CDA)' + (nNew ? ', ' + nNew + ' da creare come nuovi clienti' : '') + '.'),
      el('div', { class: 'tbl-wrap', style: 'max-height:55vh;overflow:auto' }, el('table', { 'data-nosort': '' }, el('thead', {}, el('tr', {}, ['', 'Partner', 'Programma', 'Livello', 'Accordo', 'Codice', 'Cosa cambia'].map(h => el('th', {}, h)))), el('tbody', {}, rows))),
      el('p', { class: 'hint' }, 'Per ogni partner aggiorno programma, livello, accordo (nuovo / rinnovato / scaduto), codice e i dati anagrafici (referente, telefono, email, indirizzo…). Lo status Pro / Solution della scheda cliente segue il programma. Target, sell-out e note restano come sono.'));
    const m = modal('Importa report partner', body, [el('span', { class: 'grow' }), btn('Annulla', () => m.close()), btn('Importa', async () => {
      const sel = items.filter((_, i) => pick.has(i)); if (!sel.length) { toast('Nessun partner selezionato.', 'bad'); return; }
      m.close(); let ok = 0, created = 0; const now = Date.now();
      for (const it of sel) {
        const statusSol = it.part.catalogo === 'SOLUTION' ? it.part.tier : null, statusPro = it.part.catalogo === 'PRO' ? it.part.tier : null;
        if (it.cli) {
          const prev = it.cli.partner || { anno: new Date().getFullYear(), regione: 'SICILIA', target: 0, so: [null, null, null, null], nota: '' };
          if (await patch('clienti', it.cli.id, { ...it.ana, partner: { ...prev, ...it.part, upd: now }, statusSol, statusPro, upd: now })) ok++;
        } else {
          const id = newId('clienti');
          const d = { nome: it.az, categoria: '', note: '', sconti: {}, fonte: 'Report partner', at: now, upd: now, by: S.me, ...it.ana, statusSol, statusPro, partner: { anno: new Date().getFullYear(), regione: 'SICILIA', target: 0, so: [null, null, null, null], nota: '', ...it.part, upd: now } };
          if (await put('clienti', id, d)) { ok++; created++; }
        }
      }
      toast(ok + ' partner aggiornati' + (created ? ' (' + created + ' nuovi clienti)' : ''));
      feed('cliente', 'ha importato il report partner «' + fname + '» (' + ok + ' partner)', null, []);
    }, 'pri', 'up')], { wide: true });
  }

})();
