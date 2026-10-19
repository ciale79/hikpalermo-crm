/* HIK PALERMO — caricamento del file Sales Analysis dalla pagina Fatturato (per tutti gli utenti del gruppo) */
(function () {
  'use strict';
  const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const fileIn = el('input', { type: 'file', accept: '.xlsb,.xlsx,.xlsm', hidden: true });
  document.body.appendChild(fileIn);
  fileIn.addEventListener('change', () => { const f = fileIn.files[0]; fileIn.value = ''; if (f) run(f); });
  let mode = '';
  const pick = () => { mode = ''; fileIn.click(); };
  window.hpSalesUpload = m => { mode = m === 'hist' ? 'hist' : ''; fileIn.click(); };

  function run(file) {
    if (!/\.(xlsb|xlsx|xlsm)$/i.test(file.name)) { toast('Serve il file Sales Analysis in formato .xlsb o .xlsx.', 'bad'); return; }
    if (file.size > 120 * 1024 * 1024) { toast('File troppo grande.', 'bad'); return; }
    const bar = el('i', { style: { width: '3%' } });
    const txt = el('p', { class: 'hint' }, 'Preparo la lettura…');
    const body = el('div', { class: 'stack' }, el('p', {}, el('b', {}, file.name), ' · ' + (file.size / 1048576).toFixed(1) + ' MB'),
      el('div', { class: 'hp-prog' }, bar), txt,
      el('p', { class: 'hint' }, 'Il file viene letto qui nel tuo browser: non viene caricato sul server, si salvano solo i totali.'));
    let worker = null;
    const m = modal('Carico la Sales Analysis', body, [btn('Annulla', () => { worker && worker.terminate(); m.close(); })], { sticky: true });
    file.arrayBuffer().then(buf => {
      worker = new Worker('/sales-worker.js');
      worker.onmessage = ev => {
        const d = ev.data;
        if (d.progress != null) { bar.style.width = d.progress + '%'; txt.textContent = d.text; return; }
        worker.terminate();
        if (d.error) { m.close(); toast('Lettura non riuscita: ' + d.error, 'bad'); return; }
        m.close(); confirmSave(d.result, file.name, mode);
      };
      worker.onerror = e => { m.close(); toast('Lettura non riuscita: ' + (e.message || 'errore nel file') + '. Su telefono il file potrebbe essere troppo pesante: prova dal PC.', 'bad'); };
      const kam = (S.fatt && S.fatt.kam && S.fatt.kam.nome) || 'Antonino Pumilia';
      worker.postMessage({ buf, name: file.name, kam, lib: LIB }, [buf]);
    }).catch(e => { m.close(); toast('File non leggibile: ' + e.message, 'bad'); });
  }

  function confirmSave(res, fname, mode) {
    const { sales, fatturato } = res;
    const cur = S.salesRaw || S.sales || {};
    const diff = (a, b) => b == null ? '' : ' (' + (a - b >= 0 ? '+' : '') + eurShort(a - b) + ' rispetto ai dati attuali)';
    const older = cur.data && sales.data < cur.data;
    const same = cur.data && sales.data === cur.data;
    const D = salesDst(); // gruppo o area riservata ProAV
    const hist = S.sHist || [];
    const inHist = hist.some(h => h.id === sales.data);
    // storico: l'istantanea dei dati attuali (se manca) e quella del file appena letto
    const saveHist = async solo => {
      try {
        if (cur.data && S.fatt && !hist.some(h => h.id === cur.data) && cur.data !== sales.data) await db.collection(D.hist).doc(cur.data).set(window.hpSalesSnap(S.salesRaw, S.fatt, { caricatoIl: S.fatt.caricatoIl || null, caricatoDa: S.fatt.caricatoDa || null }));
        await db.collection(D.hist).doc(sales.data).set(window.hpSalesSnap({ ...(solo ? {} : cur), ...sales }, { ...fatturato, fileName: fname }, { caricatoIl: Date.now(), caricatoDa: S.me, solo: !!solo }));
        return true;
      } catch (e) { toast(errMsg(e), 'bad'); return false; }
    };
    const yearChange = cur.anno && sales.anno !== cur.anno;
    const rows = [
      ['Dati aggiornati al', sales.dataLabel + (cur.dataLabel ? ' (attuali: ' + cur.dataLabel + ')' : '')],
      ['Italia ' + sales.anno + ' · prodotti propri', eur0(sales.italiaOwn) + diff(sales.italiaOwn, cur.anno === sales.anno ? cur.italiaOwn : null)],
      ['Sicilia ' + sales.anno + ' · prodotti propri', eur0(sales.siciliaOwn) + diff(sales.siciliaOwn, cur.anno === sales.anno ? cur.siciliaOwn : null)],
      ['Sicilia per trimestre', sales.siciliaOwnQ.map((v, i) => 'Q' + (i + 1) + ' ' + eurShort(v)).join(' · ')],
      ['Clienti Sicilia', String(fatturato.nClienti)],
      ['Ordini aperti', 'Italia ' + eur0(fatturato.oo.italia) + ' · Sicilia ' + eur0(fatturato.oo.sicilia)],
      ['Righe lette', res.righe.toLocaleString('it-IT')]
    ];
    const body = el('div', { class: 'stack' },
      mode === 'hist' || older ? el('div', { class: 'banner' }, older ? 'Questo file (dati al ' + sales.dataLabel + ') è più vecchio dei dati attuali (' + cur.dataLabel + '): aggiungilo allo storico per usarlo come confronto, senza cambiare i dati che vedono tutti.' + (inHist ? ' Lo storico ha già un caricamento con questa data: verrà sostituito.' : '') : 'Il file verrà aggiunto allo storico dei caricamenti.' + (same ? ' Ha la stessa data dei dati attuali.' : '')) : null,
      yearChange ? el('div', { class: 'banner' }, 'Il file riguarda il ' + sales.anno + ', i dati attuali il ' + cur.anno + ': gli obiettivi restano quelli già impostati, ricordati di aggiornarli.') : null,
      el('dl', { class: 'dl' }, rows.map(([a, b]) => [el('dt', {}, a), el('dd', {}, b)])),
      D.pav ? el('div', { class: 'banner hp-pavban' }, 'Sales Analysis riservata ProAV: la vedete solo tu e chi è abilitato all\'area ProAV. I dati del gruppo non cambiano.') : el('p', { class: 'hint' }, 'Gli obiettivi (Italia, Sicilia, ProExpert e Solution) restano invariati. Tutti i colleghi vedranno subito i nuovi dati.'));
    const histBtn = older || mode === 'hist' ? btn('Aggiungi solo allo storico', async () => {
      if (await saveHist(true)) { m.close(); toast('Caricamento del ' + sales.dataLabel + ' aggiunto allo storico: lo trovi in «Confronta con»'); if (S.view === 'fatt' || S.view === 'dash') VIEWS[S.view].update(); }
    }, older ? 'pri' : '', 'plus') : null;
    const m = modal((mode === 'hist' ? 'Storico della Sales Analysis' : 'Aggiorna il fatturato') + (D.pav ? ' · ProAV' : ''), body, [el('span', { class: 'grow' }), btn('Annulla', () => m.close()), histBtn, older ? null : btn('Aggiorna i dati', async () => {
      if (!await saveHist(false)) return;
      const ok1 = await put(D.fatt[0], D.fatt[1], { ...fatturato, caricatoDa: S.me, caricatoIl: Date.now(), fileName: fname });
      const ok2 = ok1 && await (D.pav && !S.salesP ? put : patch)(D.sales[0], D.sales[1], { ...sales, caricatoDa: S.me, caricatoIl: Date.now() });
      if (ok1 && ok2) {
        m.close(); toast('Fatturato aggiornato al ' + sales.dataLabel);
        if (!D.pav) feed('fatturato', 'ha aggiornato il fatturato con la Sales Analysis al ' + sales.dataLabel, null, []);
        if (S.view === 'fatt') VIEWS.fatt.update();
      }
    }, 'pri', 'up')]);
  }

  // pulsante nella pagina Fatturato
  const orig = VIEWS.fatt.update;
  VIEWS.fatt.update = function () {
    const out = orig.apply(this, arguments);
    try {
      const r = this.root; if (!r) return out;
      r.querySelector('.hp-salesbar')?.remove();
      const F = S.fatt || {}, sa = S.sales || {};
      const who = F.caricatoDa ? nm(F.caricatoDa) : null;
      const info = sa.dataLabel ? 'Dati al ' + sa.dataLabel + (who ? ' · caricati da ' + who + ' il ' + fD(F.caricatoIl) : '') : 'Nessun file caricato';
      const bar = el('div', { class: 'row between hp-salesbar' }, el('span', { class: 'hint' }, info), btn('Carica Sales Analysis', pick, 'pri sm', 'up'));
      r.prepend(bar);
    } catch (e) { console.error(e); }
    return out;
  };
  if (S.view === 'fatt') VIEWS.fatt.update();
})();
