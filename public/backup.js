/* HIK PALERMO — backup completo (solo il proprietario del CRM), in «Gruppo e impostazioni».
   Scarica uno ZIP con tutti i dati (database: commesse, clienti, offerte, calendario, magazzino, ProAV, impostazioni, utenti)
   e tutti i file caricati (allegati, foto, listini ProAV…). Ogni domenica il Worker salva anche una copia dei dati su R2. */
(function () {
  'use strict';
  const JSZIPLIB = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  const H = { 'x-hp': '1' };
  const get = async (u, as) => { const r = await fetch(u, { credentials: 'same-origin', headers: H }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error?.message || ('errore ' + r.status)); return as === 'blob' ? r.blob() : as === 'text' ? r.text() : r.json(); };
  const today = () => new Date().toISOString().slice(0, 10);
  const mb = b => (b / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB';
  const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000); };
  let busy = false, weekly = null;

  async function dataOnly() {
    if (busy) return; busy = true; draw();
    try { const t = await get('/api/backup/db', 'text'); save(new Blob([t], { type: 'application/json' }), 'Backup dati HIK PALERMO ' + today() + '.json'); toast('Backup dei dati scaricato'); }
    catch (e) { toast('Backup non riuscito: ' + e.message, 'bad'); }
    busy = false; draw();
  }
  async function full(prog) {
    if (busy) return; busy = true; draw();
    try {
      await loadScript(JSZIPLIB);
      const zip = new JSZip();
      prog('Copio i dati…', 2);
      const db = await get('/api/backup/db', 'text'); zip.file('dati.json', db);
      const { files } = await get('/api/backup/files');
      const list = files.filter(f => !/^backup\//.test(f.key));
      const tot = list.reduce((a, f) => a + (f.size || 0), 0); let done = 0, i = 0, miss = [];
      const idx = list.map(f => ({ key: f.key, nome: f.name, tipo: f.type, dimensione: f.size, caricato: f.at }));
      for (const f of list) {
        i++; prog('File ' + i + ' di ' + list.length + ' · ' + mb(done) + ' di ' + mb(tot), 5 + 85 * (tot ? done / tot : i / list.length));
        try { const ext = (/\.[A-Za-z0-9]{1,5}$/.exec(f.name || '') || [''])[0]; zip.file('file/' + f.key + (f.key.endsWith(ext) ? '' : ext), await get('/api/backup/file?key=' + encodeURIComponent(f.key), 'blob')); } catch (e) { miss.push(f.key); }
        done += f.size || 0;
      }
      zip.file('file/elenco.json', JSON.stringify(idx, null, 1));
      zip.file('LEGGIMI.txt', [
        'Backup del CRM HIK PALERMO (hikpalermo.com e proav.hikpalermo.com) del ' + new Date().toLocaleString('it-IT'),
        '',
        'dati.json  → tutti i dati del database: commesse, offerte, clienti, partner, calendario, magazzino, demo, listini e Sales Analysis ProAV,',
        '             fatturato, capitolati, impostazioni e utenti (senza password e sessioni). Ogni documento ha raccolta (col), id e contenuto.',
        'file/      → tutti i file caricati (allegati delle commesse, foto, listini ProAV…), con il nome originale in file/elenco.json.',
        '',
        'Il codice del sito è nel repository GitHub privato ciale79/hikpalermo-crm.',
        miss.length ? '\nATTENZIONE: ' + miss.length + ' file non sono stati scaricati: ' + miss.join(', ') : ''
      ].join('\n'));
      prog('Creo il file ZIP…', 93);
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, m => prog('Creo il file ZIP… ' + Math.round(m.percent) + '%', 93 + m.percent * 0.07));
      save(blob, 'Backup HIK PALERMO ' + today() + '.zip');
      toast('Backup completo scaricato: ' + list.length + ' file e ' + JSON.parse(db).counts.docs + ' documenti' + (miss.length ? ' (' + miss.length + ' file mancanti)' : ''), miss.length ? 'bad' : '');
    } catch (e) { toast('Backup non riuscito: ' + e.message, 'bad'); }
    busy = false; draw();
  }
  async function loadWeekly() {
    try { const { files } = await get('/api/backup/files'); weekly = files.filter(f => /^backup\//.test(f.key)).sort((a, b) => b.key.localeCompare(a.key)); }
    catch (e) { weekly = []; }
    draw();
  }

  let box = null;
  function draw() {
    if (!box) return;
    const bar = el('i', { style: { width: '0%' } }), txt = el('span', { class: 'hint' });
    const prog = (t, p) => { txt.textContent = t; bar.style.width = Math.max(0, Math.min(100, p)) + '%'; };
    box.replaceChildren(
      el('div', { class: 'panel-h' }, el('div', { class: 'stack', style: 'gap:2px' }, el('h3', {}, 'Backup'), el('span', { class: 'hint' }, 'Una copia di tutto il CRM da tenere sul tuo computer o su un disco: dati, utenti e file caricati, del gruppo e di ProAV.'))),
      el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
        btn(busy ? 'Backup in corso…' : 'Scarica backup completo (.zip)', () => full(prog), 'pri', 'dl'),
        btn('Solo i dati (.json)', dataOnly, '', 'dl')),
      busy ? el('div', { class: 'stack', style: 'gap:4px' }, el('div', { class: 'hp-prog' }, bar), txt) : null,
      el('p', { class: 'hint' }, 'Il backup completo comprende tutti gli allegati e le foto: può pesare diverse decine di MB e richiedere qualche minuto. Il codice del sito è già salvato su GitHub.'),
      el('h4', { style: 'margin:6px 0 0' }, 'Copie automatiche settimanali'),
      weekly == null ? el('p', { class: 'hint' }, 'Carico…') : weekly.length ? el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, weekly.map(f => btn(f.key.replace(/^backup\/db-|\.json$/g, '').split('-').reverse().join('/') + ' · ' + mb(f.size), async () => { try { save(await get('/api/backup/file?key=' + encodeURIComponent(f.key), 'blob'), 'Backup dati HIK PALERMO ' + f.key.replace(/^backup\/db-/, '')); } catch (e) { toast(e.message, 'bad'); } }, 'sm ghost', 'dl')))
        : el('p', { class: 'hint' }, 'Ogni domenica mattina il CRM salva da solo una copia dei dati nello spazio file del sito (si tengono le ultime 8 settimane). La prima comparirà qui domenica.'));
  }

  const orig = VIEWS.set.update;
  VIEWS.set.update = function () {
    const r = orig.apply(this, arguments);
    try {
      if (!this.editing && this.root && S.isOwner) {
        this.root.querySelector('#hpBackup')?.remove();
        box = el('section', { class: 'panel stack', id: 'hpBackup' });
        const feedP = this.root.querySelector('#cfFeed');
        if (feedP) feedP.before(box); else this.root.append(box);
        draw(); if (weekly == null) loadWeekly();
      }
    } catch (e) { console.error(e); }
    return r;
  };
  if (S.view === 'set') VIEWS.set.update();
})();
