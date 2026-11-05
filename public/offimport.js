/* HIK PALERMO — import di offerte PDF (preventivi del gestionale) in commesse e offerte, ed esportazione offerta con o senza sconto */
(function () {
  'use strict';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFW = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const money = s => { const m = /-?[\d.]+(?:,\d+)?/.exec(String(s || '').replace(/\s/g, '')); if (!m) return null; const v = parseFloat(m[0].replace(/\./g, '').replace(',', '.')); return isFinite(v) ? v : null; };
  const pct = s => { const t = String(s || '').trim(); if (!t || t === '-' || /netto/i.test(t)) return null; const v = parseFloat(t.replace('%', '').replace(/\./g, '').replace(',', '.')); return isFinite(v) ? v : null; };
  const isMoney = s => /€|\d+,\d{2}$/.test(s);
  const r2 = v => Math.round(v * 100) / 100;

  /* ---------------- lettura testo con posizioni (pdf.js) ---------------- */
  async function pdfPages(buf) {
    if (!window.pdfjsLib) await loadScript(PDFJS);
    pdfjsLib.GlobalWorkerOptions.workerSrc = window.HP_PDFW || PDFW;
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const pg = await pdf.getPage(p); const tc = await pg.getTextContent();
      pages.push(tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width, f: Math.abs(i.transform[3]) || i.height, p: p - 1 })));
    }
    return pages;
  }
  const lines = items => { const out = []; for (const o of items.slice().sort((a, b) => b.y - a.y || a.x - b.x)) { const l = out.find(z => Math.abs(z.y - o.y) < 2.5); if (l) l.it.push(o); else out.push({ y: o.y, it: [o] }); } out.forEach(l => { l.it.sort((a, b) => a.x - b.x); l.s = l.it.map(o => o.s).join(' ').replace(/\s+,/g, ',').trim(); l.x = l.it[0].x; }); return out; };

  /* ---------------- parser del preventivo (layout del gestionale Hikvision) ---------------- */
  function parseGest(pages) {
    const all = pages.flat();
    const find = re => all.find(o => re.test(o.s));
    const right = o => all.filter(q => q.p === o.p && Math.abs(q.y - o.y) < 2.5 && q.x > o.x + 1).sort((a, b) => a.x - b.x);
    const R = { meta: {}, cliente: {}, righe: [], cond: {}, tot: {} };
    // intestazione
    const nl = find(/^Offerta numero/i);
    if (nl) { const v = right(nl).map(o => o.s); R.meta.numero = v.find(s => s !== 'del' && /\d/.test(s) && !/\d{2}\/\d{2}\/\d{4}/.test(s)) || ''; R.meta.data = (v.join(' ').match(/\d{2}\/\d{2}\/\d{4}/) || [''])[0]; }
    const rd = find(/^Redatta da/i), rf = all.find(o => /^Riferimento:?$/i.test(o.s) && (!rd || o.p === rd.p));
    if (rd) { const r0 = right(rd)[0]; if (r0) { const col = all.filter(q => q.p === rd.p && Math.abs(q.x - r0.x) < 3 && q.y <= r0.y + 1 && (!rf || q.y > rf.y + 1)).sort((a, b) => b.y - a.y).map(o => o.s); R.meta.redatto = col[0] || ''; R.meta.redattoEmail = (col.find(s => /@/.test(s)) || '').trim(); R.meta.redattoTel = (col.find(s => /^tel/i.test(s)) || '').replace(/^tel\.?\s*/i, ''); } }
    if (rf) { const r0 = right(rf)[0]; R.meta.riferimento = r0 ? r0.s : ''; }
    if (!R.meta.riferimento) { const c = all.find(o => o.p === 0 && /^Riferimento$/i.test(o.s)); if (c) { const b = all.filter(q => q.p === 0 && q.y < c.y && q.y > c.y - 40).sort((a, b) => b.y - a.y)[0]; if (b) R.meta.riferimento = b.s; } }
    const pc = find(/^Partner contrattuale/i); if (pc) { const b = all.filter(q => q.p === pc.p && Math.abs(q.x - pc.x) < 3 && q.y < pc.y && q.y > pc.y - 20).sort((a, b) => b.y - a.y)[0]; if (b) R.meta.partner = b.s; }
    // cliente
    const sp = find(/^Spett/i);
    if (sp) {
      const blk = lines(all.filter(q => q.p === sp.p && q.x >= sp.x - 4 && q.y < sp.y - 1 && q.y > sp.y - 160));
      const L = []; for (const l of blk) { if (/^Come da|^Codice\b/i.test(l.s)) break; L.push(l.s); }
      R.cliente.nome = L[0] || '';
      const addr = []; const extra = {};
      for (const s of L.slice(1)) {
        let m;
        if ((m = /^Referente:?\s*(.*)$/i.exec(s))) extra.referente = m[1].trim();
        else if ((m = /^P\.?\s?IVA:?\s*([A-Z]{0,2}\d{8,13})/i.exec(s))) extra.piva = m[1];
        else if ((m = /^(C\.?F\.?|Cod(?:ice)?\.? ?fisc(?:ale)?):?\s*(\S+)/i.exec(s))) extra.cf = m[2];
        else if ((m = /^Tel(?:efono)?\.?:?\s*(.+)$/i.exec(s))) extra.tel = m[1];
        else if ((m = /^(?:E-?mail|PEC):?\s*(\S+@\S+)/i.exec(s))) extra[/pec/i.test(s) ? 'pec' : 'email'] = m[1];
        else if ((m = /^(?:SDI|Codice destinatario):?\s*(\S+)/i.exec(s))) extra.sdi = m[1];
        else if (!/^italia$/i.test(s.replace(/[,.\s]+$/, ''))) addr.push(s);
      }
      let a = addr.join(' ').replace(/\s*,\s*,/g, ',').replace(/\s+,/g, ',').replace(/,\s*$/, '').trim();
      let sede = ''; const col = /^([^:]{3,40}):\s*(.+)$/.exec(a); if (col && !/\d{5}/.test(col[1])) { sede = col[1].trim(); a = col[2].trim(); }
      const cm = /(?:^|[\s,])(\d{5})\s+([^,(]+?)\s*(?:\(\s*([A-Za-z]{2})\s*\))?\s*(?:,|$)/.exec(a);
      if (cm) { R.cliente.cap = cm[1]; R.cliente.citta = cm[2].trim().replace(/\b\w/g, c => c.toUpperCase()); R.cliente.prov = (cm[3] || '').toUpperCase(); R.cliente.indirizzo = a.slice(0, cm.index).replace(/[,\s]+$/, '').trim(); }
      else R.cliente.indirizzo = a;
      if (sede) R.cliente.sede = sede;
      Object.assign(R.cliente, extra);
    }
    // tabella righe
    const hd = all.find(o => /^Codice$/i.test(o.s) && right(o).some(q => /^Q\.?\s*t[aà]/i.test(q.s)));
    if (hd) {
      const H = [['codice', /^Codice$/i], ['desc', /^Descrizione/i], ['qta', /^Q\.?\s*t[aà]/i], ['listino', /^Listino/i], ['sc', /^Sc/i], ['ex', /^Ex/i], ['cad', /^Prezzo\s*Cad/i], ['tot', /^(Prezzo\s*)?Tot/i]]
        .map(([k, re]) => { const o = [hd, ...right(hd)].find(q => re.test(q.s)); return o ? { k, c: o.x + o.w / 2 } : null; }).filter(Boolean);
      const near = o => { const c = o.x + o.w / 2; let b = null; for (const h of H) if (!b || Math.abs(h.c - c) < Math.abs(b.c - c)) b = h; return b.k; };
      // codice e descrizione: colonne allineate a sinistra, separate dal secondo allineamento più a sinistra
      const descH = H.find(h => h.k === 'desc'), qH0 = H.find(h => h.k === 'qta');
      const leftXs = [...new Set(all.filter(o => o.p === hd.p && o.y < hd.y - 2 && o.y > 35 && qH0 && o.x + o.w / 2 < qH0.c - 12 && o.f < 10.5).map(o => Math.round(o.x)))].sort((a, b) => a - b);
      const c1 = leftXs[0], c2 = leftXs.find(x => x > c1 + 20);
      const cut = c1 != null && c2 != null ? (c1 + c2) / 2 : null;
      const near0 = near;
      const nearCD = o => { const k = near0(o); if (cut != null && (k === 'codice' || k === 'desc')) return o.x < cut ? 'codice' : 'desc'; return k; };
      const qC = (H.find(h => h.k === 'qta') || {}).c;
      const sub = all.find(o => /^Subtotale|^Totale\s*(imponibile|merce)/i.test(o.s) && o.p >= hd.p);
      const det = all.find(o => /^Dettaglio$/i.test(o.s));
      const inTab = o => (o.p > hd.p || o.y < hd.y - 2) && (!sub || o.p < sub.p || (o.p === sub.p && o.y > sub.y + 2)) && (!det || o.p < det.p) && o.y > 35 && !/^(Prev\.|Pag\.)$/.test(o.s);
      const T = all.filter(o => o.p >= hd.p && inTab(o));
      const anchors = T.filter(o => /^\d+(?:[.,]\d+)?$/.test(o.s) && qC != null && Math.abs(o.x + o.w / 2 - qC) < 14 && near(o) === 'qta');
      const secs = T.filter(o => o.f >= 10.5 && ['codice', 'desc'].includes(near(o)) && !anchors.some(a => a.p === o.p && Math.abs(a.y - o.y) < 2.5));
      const ev = [...anchors.map(o => ({ t: 'row', o })), ...secs.map(o => ({ t: 'sec', o }))].sort((a, b) => a.o.p - b.o.p || b.o.y - a.o.y);
      let sez = '';
      ev.forEach((e, i) => {
        if (e.t === 'sec') { sez = e.o.s; return; }
        const a = e.o; const nx = ev.slice(i + 1).find(z => z.o.p === a.p);
        const lo = nx ? nx.o.y + (nx.t === 'row' ? 3 : 2) : 35;
        const mine = T.filter(o => o.p === a.p && o.y <= a.y + 3 && o.y > lo && o !== a && !secs.includes(o));
        const col = k => mine.filter(o => nearCD(o) === k).sort((p, q) => q.y - p.y || p.x - q.x);
        const same = k => mine.filter(o => near(o) === k && Math.abs(o.y - a.y) < 3).map(o => o.s).join(' ');
        const codice = col('codice').map(o => o.s).join('').replace(/\s+/g, '');
        const lst = same('listino'), sc = same('sc'), ex = same('ex');
        const row = { sez, codice, desc: col('desc').map(o => o.s).join(' ').replace(/\s+/g, ' ').trim(), q: money(a.s) || 0,
          listino: isMoney(lst) ? money(lst) : null, netto: /netto/i.test(lst + ' ' + sc + ' ' + ex), sc: pct(sc), ex: pct(ex), cad: money(same('cad')), tot: money(same('tot')) };
        if (row.codice || row.desc) R.righe.push(row);
      });
      // dettaglio: codice SAP e descrizione estesa (stesso ordine delle righe)
      if (det) {
        const D = all.filter(o => o.p >= det.p);
        const saps = D.filter(o => /^\d{8,10}$/.test(o.s) && o.x < 90).sort((a, b) => a.p - b.p || b.y - a.y);
        const dets = saps.map((s, i) => { const c = right(s)[0]; const nx = saps[i + 1]; const desc = c ? D.filter(o => o.p === s.p && Math.abs(o.x - c.x) < 3 && o.y < s.y - 1 && (!nx || nx.p !== s.p || o.y > nx.y + 2) && o.f < 9).sort((a, b) => b.y - a.y).map(o => o.s).join(' ') : ''; return { sap: s.s, codice: c ? c.s : '', descLunga: desc }; });
        const nn = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        let j = 0;
        for (const r of R.righe) { const k = dets.findIndex((d, i) => i >= j && nn(d.codice) === nn(r.codice)); if (k >= 0) { Object.assign(r, { sap: dets[k].sap, codice: dets[k].codice || r.codice, descLunga: dets[k].descLunga }); j = k + 1; } }
      }
      // totali
      const val = re => { const o = all.find(q => re.test(q.s)); if (!o) return null; const v = right(o).find(q => isMoney(q.s)); return v ? money(v.s) : null; };
      R.tot.subtotale = val(/^Subtotale|^Totale\s*(imponibile|merce)/i); R.tot.iva = val(/^IVA/i); R.tot.totale = val(/^Totale\s*offerta|^Totale\s*documento|^Totale$/i);
      const ivo = find(/^IVA\s*\(/i); if (ivo) R.tot.ivaPct = pct((/\(([\d.,]+)\s*%?\)/.exec(ivo.s) || [])[1]);
    }
    // condizioni (titoli in maiuscolo nelle ultime pagine)
    const heads = all.filter(o => /^[A-ZÀ-Ü'’ ]{6,}$/.test(o.s) && o.x < 60 && /CONSEGNA|VALIDIT|PAGAMENTO|BANCARI|NOTE|GARANZIA|TRASPORTO|RESA|SPEDIZIONE/.test(o.s));
    heads.forEach((h, i) => { const nx = heads[i + 1]; const t = lines(all.filter(o => o.p === h.p && o.y < h.y - 1 && (!nx || nx.p !== h.p || o.y > nx.y + 1) && o.y > 35 && !/^(Prev\.|Pag\.)/.test(o.s) && o.x < 300 + 300)).map(l => l.s).filter(s => !/^(Banca|IBAN|Beneficiario):?$/i.test(s)).join('\n').trim(); if (t) R.cond[h.s] = t; });
    return R;
  }

  /* ---------------- ripiego: lettura con 800AI per layout diversi ---------------- */
  async function parseWithClaude(buf) {
    let bin = ''; const u8 = new Uint8Array(buf); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    const prompt = 'Estrai dal preventivo PDF tutti i dati utili e rispondi SOLO con JSON valido con questa forma: {"meta":{"numero":"","data":"gg/mm/aaaa","riferimento":"","redatto":"","redattoEmail":"","redattoTel":"","partner":""},"cliente":{"nome":"","indirizzo":"","cap":"","citta":"","prov":"","sede":"","piva":"","cf":"","referente":"","tel":"","email":"","pec":"","sdi":""},"righe":[{"sez":"titolo del gruppo/sezione o vuoto","codice":"","sap":"","desc":"descrizione breve","descLunga":"","q":1,"listino":null,"netto":false,"sc":null,"ex":null,"cad":0,"tot":0}],"tot":{"subtotale":0,"ivaPct":22,"iva":0,"totale":0},"cond":{"TITOLO SEZIONE":"testo"}}. listino = prezzo di listino unitario se indicato (numero) altrimenti null; netto = true se la riga riporta "NETTO" invece di uno sconto; sc ed ex = percentuali di sconto e di extra sconto se indicate; cad = prezzo unitario finale; tot = totale riga. Numeri senza simbolo €, decimali con il punto.';
    const r = await fetch('/api/claude', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-hp': '1' }, body: JSON.stringify({ max_tokens: 16000, feat: 'Import offerta PDF', messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: btoa(bin) } }, { type: 'text', text: prompt }] }] }) });
    const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'Lettura non riuscita');
    const t = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n'); const a = t.indexOf('{'), b = t.lastIndexOf('}');
    return JSON.parse(t.slice(a, b + 1));
  }

  /* ---------------- abbinamenti con CRM e listini ---------------- */
  const nrm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const nName = s => String(s || '').toLowerCase().replace(/\b(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|unipersonale|soc\.?)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  function catFor(r) {
    if (r.sap) { const it = S.cat.find(i => String(i.sap).trim() === String(r.sap)); if (it) return it; }
    return findCode(r.codice) || (() => { const b = nrm(String(r.codice).replace(/\([^()]*\)/g, '')); return b.length >= 6 ? S.cat.find(i => nrm(String(i.c).replace(/\([^()]*\)/g, '')) === b) : null; })() || null;
  }
  function cliFor(c) {
    const pv = nrm(c.piva).replace(/^IT/, '');
    if (pv) { const x = [...S.clienti.values()].find(k => nrm(k.piva).replace(/^IT/, '') === pv); if (x) return x; }
    const n = nName(c.nome); if (!n) return null;
    return [...S.clienti.values()].find(k => nName(k.nome) === n) || [...S.clienti.values()].find(k => { const a = nName(k.nome); return a.length > 4 && n.length > 4 && (a.startsWith(n) || n.startsWith(a)); }) || null;
  }
  function lineFor(r) {
    const it = catFor(r);
    const net = r.cad != null ? r.cad : (r.tot && r.q ? r.tot / r.q : null);
    const lst = r.listino != null ? r.listino : (it ? it.p : null);
    let sc = null;
    if (lst && net != null) sc = Math.round((1 - net / lst) * 1e6) / 1e4;
    else if (r.sc != null) sc = r2((1 - (1 - r.sc / 100) * (1 - (r.ex || 0) / 100)) * 100);
    const base = it ? lineFrom(it, r.q || 1, null) : { s: -1, c: r.codice || '', b: r.desc || '', L: '', p: 0, q: r.q || 1, sc: 0, man: true, im: -1 };
    if (lst != null) { base.p = lst; base.sc = sc != null ? sc : 0; } else { base.p = net || 0; base.sc = 0; base.noList = true; }
    base.man = true; base.sez = r.sez || ''; if (r.sap) base.sap = r.sap; if (!it && r.desc) base.b = r.desc;
    base.pdf = { netto: !!r.netto, cad: net, tot: r.tot, listinoPdf: r.listino, sc: r.sc, ex: r.ex, descLunga: r.descLunga || '' };
    return { it, lst, net, sc, line: base };
  }
  const dateKey = s => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || ''); return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : dayKey(Date.now()); };

  /* ---------------- flusso di import ---------------- */
  const fileIn = el('input', { type: 'file', accept: 'application/pdf,.pdf', hidden: true }); document.body.appendChild(fileIn);
  let ctx = null;
  fileIn.addEventListener('change', async () => { const f = fileIn.files[0]; fileIn.value = ''; if (f) run(f, ctx); });
  window.hpOfferPdf = c => { ctx = c || null; fileIn.click(); };

  async function run(file, comCtx) {
    const wait = modal('Leggo l\'offerta', el('div', { class: 'stack' }, el('p', {}, el('b', {}, file.name)), el('p', { class: 'hint', id: 'opWait' }, 'Lettura del PDF…')), [], { sticky: true });
    const buf = await file.arrayBuffer(); let R = null, via = 'pdf';
    try { const pages = await pdfPages(buf.slice(0)); R = parseGest(pages); } catch (e) { console.warn(e); }
    if (!R || !R.righe.length) {
      try { const w = document.getElementById('opWait'); if (w) w.textContent = 'Layout non riconosciuto: lo faccio leggere a 800AI…'; R = await parseWithClaude(buf.slice(0)); via = 'claude'; }
      catch (e) { wait.close(); toast('Non riesco a leggere l\'offerta: ' + (e.message || e), 'bad'); return; }
    }
    wait.close();
    if (!R.righe || !R.righe.length) { toast('Nel PDF non ho trovato righe di prodotto.', 'bad'); return; }
    preview(R, file, comCtx, via);
  }

  function preview(R, file, comCtx, via) {
    const C = R.cliente || {}, M = R.meta || {};
    const L = R.righe.map(lineFor);
    let cli = (comCtx && S.clienti.get(comCtx.clienteId)) || cliFor(C);
    const cliSel = selectEl('opCli', [['__new', '+ Nuovo cliente: ' + (C.nome || '—')], ...[...S.clienti.values()].sort(byName).map(c => [c.id, c.nome])], cli ? cli.id : '__new');
    const upd = el('input', { type: 'checkbox', id: 'opUpd', checked: true });
    const comOpts = () => [['__new', '+ Nuova commessa: ' + (M.riferimento || M.numero || 'da offerta')], ...[...S.commesse.values()].filter(c => cliSel.value === '__new' || c.clienteId === cliSel.value).sort(byName).map(c => [c.id, c.nome + (c.codice ? ' · ' + c.codice : '')])];
    const comSel = el('select', { id: 'opCom' });
    const fillCom = () => { const v = comCtx ? comCtx.id : (comSel.value || '__new'); comSel.replaceChildren(...comOpts().map(([k, l]) => el('option', { value: k, selected: k === v }, l))); };
    cliSel.addEventListener('change', fillCom); fillCom(); if (comCtx) comSel.disabled = true;
    const team = [...S.team.entries()].find(([id, t]) => M.redattoEmail && String(t.email || '').toLowerCase() === M.redattoEmail.toLowerCase());
    const resp = selectEl('opResp', [...new Set([...S.team.keys()])].map(id => [id, nm(id)]), team ? team[0] : S.me);
    const st = selectEl('opSt', OST.map(x => [x, x]), 'Inviata');
    const sum = L.reduce((a, x) => a + (x.net || 0) * (x.line.q || 0), 0);
    const totL = L.reduce((a, x) => a + (x.lst || 0) * (x.line.q || 0), 0);
    const miss = L.filter(x => x.lst == null).length;
    const dd = (l, v) => v ? [el('dt', {}, l), el('dd', {}, v)] : null;
    const rows = L.map((x, i) => {
      const r = R.righe[i];
      return el('tr', {}, el('td', {}, x.it ? thumb(x.it.im, 34) : el('span', { class: 'thumb none', style: 'width:34px;height:34px' })),
        el('td', {}, el('div', { class: 'cell-t' }, el('b', { class: 'mono' }, r.codice || '—'), el('small', { class: 'muted' }, [r.sez, r.sap ? 'SAP ' + r.sap : ''].filter(Boolean).join(' · ')))),
        el('td', { style: 'max-width:280px' }, el('div', { class: 'cell-t' }, el('span', {}, r.desc || (x.it && x.it.b) || ''), x.it ? null : el('small', { style: 'color:var(--warn)' }, 'Non trovato a listino: riga libera'))),
        el('td', { class: 'r num' }, String(r.q)),
        el('td', { class: 'r num' }, x.lst != null ? eur(x.lst) : el('span', { class: 'muted' }, '—'), r.listino == null && x.lst != null ? el('div', {}, el('small', { class: 'muted' }, 'dal listino')) : null),
        el('td', { class: 'r num' }, el('b', {}, x.net != null ? eur(x.net) : '—'), r.netto ? el('div', {}, el('small', { class: 'muted' }, 'NETTO')) : null),
        el('td', { class: 'r num' }, x.sc != null ? el('b', { style: { color: x.sc < 0 ? 'var(--warn)' : 'var(--accent)' } }, fN.format(x.sc) + '%') : el('span', { class: 'muted' }, '—')),
        el('td', { class: 'r num' }, r.tot != null ? eur(r.tot) : eur((x.net || 0) * r.q)));
    });
    const T = R.tot || {};
    const okTot = T.subtotale == null || Math.abs(T.subtotale - sum) < 1;
    const body = el('div', { class: 'stack' },
      via === 'claude' ? el('div', { class: 'banner' }, 'Il PDF non ha il layout del gestionale: i dati sono stati letti da 800AI, controllali prima di salvare.') : null,
      el('div', { class: 'grid2' },
        el('section', { class: 'panel' }, el('h4', {}, 'Offerta'), el('dl', { class: 'dl' }, dd('Numero', M.numero), dd('Data', M.data), dd('Riferimento', M.riferimento), dd('Redatta da', [M.redatto, M.redattoEmail, M.redattoTel].filter(Boolean).join(' · ')), dd('Partner', M.partner),
          ...Object.entries(R.cond || {}).slice(0, 4).map(([k, v]) => dd(k.charAt(0) + k.slice(1).toLowerCase(), v.split('\n')[0])))),
        el('section', { class: 'panel' }, el('h4', {}, 'Cliente'), el('dl', { class: 'dl' }, dd('Ragione sociale', C.nome), dd('Sede', C.sede), dd('Indirizzo', [C.indirizzo, [C.cap, C.citta].filter(Boolean).join(' '), C.prov].filter(Boolean).join(', ')), dd('P. IVA', C.piva), dd('Referente', C.referente), dd('Telefono', C.tel), dd('Email', C.email || C.pec)),
          el('div', { class: 'stack', style: 'gap:6px;margin-top:8px' }, fld('Cliente nel CRM', cliSel), el('label', { class: 'row', style: 'gap:6px' }, upd, el('span', { class: 'hint' }, 'Completa la scheda cliente con i dati mancanti (indirizzo, P.IVA, referente…)'))))),
      el('div', { class: 'fgrid' }, fld('Commessa', comSel, 'full'), fld('Responsabile', resp), fld('Stato offerta', st)),
      el('div', { class: 'tbl-wrap', style: 'max-height:46vh;overflow:auto' }, el('table', { 'data-nosort': '' }, el('thead', {}, el('tr', {}, ['', 'Codice', 'Descrizione', 'Q.tà', 'Listino', 'Prezzo offerto', 'Sconto', 'Totale'].map((h, k) => el('th', { class: k >= 3 ? 'r' : '' }, h)))), el('tbody', {}, rows))),
      el('div', { class: 'row', style: 'gap:18px' }, el('span', {}, 'Totale offerto ', el('b', { class: 'num' }, eur(sum))), totL ? el('span', {}, 'Valore a listino ', el('b', { class: 'num' }, eur(totL))) : null, totL ? el('span', {}, 'Sconto medio ', el('b', { class: 'num', style: 'color:var(--accent)' }, fN.format(r2((1 - L.filter(x => x.lst != null).reduce((a, x) => a + (x.net || 0) * x.line.q, 0) / totL) * 100)) + '%')) : null,
        T.subtotale != null ? el('span', { class: okTot ? 'hint' : '', style: okTot ? '' : 'color:var(--accent)' }, 'Subtotale nel PDF ' + eur(T.subtotale) + (okTot ? ' ✓' : ' (non coincide)')) : null),
      miss ? el('p', { class: 'hint' }, miss + (miss === 1 ? ' riga non trovata' : ' righe non trovate') + ' a listino: entrano come righe libere al prezzo offerto, senza sconto calcolato.') : null,
      el('p', { class: 'hint' }, 'Lo sconto è calcolato confrontando il prezzo offerto (anche quando è indicato «NETTO») con il prezzo di listino. Il PDF originale viene allegato alla commessa.'));
    const m = modal('Importa offerta ' + (M.numero || ''), body, [el('span', { class: 'grow' }), btn('Annulla', () => m.close()), btn('Crea offerta', async () => {
      const now = Date.now();
      // cliente
      let cid = cliSel.value;
      if (cid === '__new') {
        cid = newId('clienti');
        const d = { nome: C.nome || 'Cliente da offerta', categoria: '', note: C.sede ? 'Sede: ' + C.sede : '', sconti: {}, fonte: 'Offerta PDF ' + (M.numero || ''), at: now, upd: now, by: S.me };
        for (const k of ['indirizzo', 'cap', 'citta', 'prov', 'piva', 'cf', 'referente', 'tel', 'email', 'pec', 'sdi']) if (C[k]) d[k] = C[k];
        if (!(await put('clienti', cid, d))) return;
      } else if (upd.checked) {
        const cur = S.clienti.get(cid) || {}; const up = {};
        for (const k of ['indirizzo', 'cap', 'citta', 'prov', 'piva', 'cf', 'referente', 'tel', 'email', 'pec', 'sdi']) if (C[k] && !cur[k]) up[k] = C[k];
        if (Object.keys(up).length) { up.upd = now; await patch('clienti', cid, up); }
      }
      // commessa
      let comId = comCtx ? comCtx.id : comSel.value;
      if (comId === '__new') {
        comId = newId('commesse');
        const ind = [C.indirizzo, C.cap].filter(Boolean).join(', ');
        const d = { nome: M.riferimento || ('Offerta ' + (M.numero || '')), titolo: M.riferimento || '', clienteId: cid, stato: 'off', resp: resp.value, nPrev: M.numero || '', dataIns: dateKey(M.data), valore: r2(sum), note: 'Creata dall\'offerta PDF ' + (M.numero || '') + ' del ' + (M.data || ''), indirizzo: '', citta: '', tipoCom: 'normale', at: now, upd: now, by: S.me };
        if (!(await put('commesse', comId, d))) return;
        feed('commessa', 'ha creato la commessa «' + d.nome + '» dall\'offerta ' + (M.numero || ''), { k: 'commessa', id: comId });
      } else {
        const cur = S.commesse.get(comId) || {}; const up = { upd: now }; if (!cur.clienteId) up.clienteId = cid; if (!cur.nPrev && M.numero) up.nPrev = M.numero; await patch('commesse', comId, up);
      }
      // offerta
      const righe = L.map(x => x.line); const t = offTot(righe);
      const note = Object.entries(R.cond || {}).map(([k, v]) => k + ': ' + v.replace(/\n/g, ' ')).join('\n');
      const o = { numero: M.numero || '', data: dateKey(M.data), titolo: M.riferimento || '', stato: st.value, valid: +((/validit[^\d]{0,80}(\d+)\s*giorn/i.exec(Object.entries(R.cond || {}).map(([k, v]) => k + ' ' + v).join(' ')) || [])[1] || 30), note, clienteId: cid, commessaId: comId, righe, totL: t.L, totN: t.N,
        pdf: { file: file.name, meta: M, cliente: C, tot: T, cond: R.cond || {}, via }, at: now, upd: now, by: S.me };
      const oid = newId('offerte'); if (!(await put('offerte', oid, o))) return;
      // allega il PDF alla commessa
      try { if (assets) { const r = await assets.upload(file, { type: 'application/pdf' }); await db.collection('commesse/' + comId + '/allegati').doc(r.id).set({ name: file.name, size: r.sizeBytes, type: r.contentType, cat: 'Offerta', by: S.me, at: now }); } } catch (e) { console.warn(e); }
      feed('offerta', 'ha importato l\'offerta ' + (o.numero || '') + ' · netto ' + eur0(o.totN), { k: 'offerta', id: oid });
      m.close(); toast('Offerta ' + (o.numero || '') + ' importata'); go('commesse', comId, 'off');
    }, 'pri', 'check')], { full: true, sticky: true });
  }

  /* ---------- opzioni comuni della finestra «Esporta»: cosa mostrare, data, validità, pagamento, tempi ---------- */
  const lsG = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }, lsS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
  /* voci dei menu a tendina delle condizioni: condivise da tutto il gruppo (raccolta «offopt»: {cat, text, ord}), si creano, modificano e cancellano */
  const OCAT = {
    consegna: { t: 'Tempi di consegna', d: ['Merce disponibile a magazzino, salvo venduto', '1-2 settimane dalla conferma d\'ordine', '2-3 settimane dalla conferma d\'ordine', '4-6 settimane dalla conferma d\'ordine', '6-8 settimane dalla conferma d\'ordine', 'Da confermare all\'ordine'] },
    valid: { t: 'Validità dell\'offerta', d: ['15 giorni', '30 giorni', '60 giorni', '90 giorni'], h: 'Scrivi i giorni (es. «30 giorni»): la scadenza si calcola dalla data dell\'offerta' },
    sped: { t: 'Costi di spedizione', d: ['Sono esclusi i costi di spedizione se non indicati.', 'Spedizione inclusa nel prezzo.', 'Porto franco per ordini superiori a € 500,00 netti.', 'Ritiro a cura del cliente presso il magazzino del distributore.'] },
    pag: { t: 'Condizioni di pagamento', d: ['Bonifico bancario anticipato', 'Bonifico bancario 30 gg d.f.', 'Bonifico bancario 60 gg d.f.f.m.', 'Ri.Ba. 30 gg d.f.f.m.', 'Ri.Ba. 60 gg d.f.f.m.', 'Ri.Ba. 30/60 gg d.f.f.m.', 'Come da accordi commerciali in essere'] },
    note: { t: 'Note aggiuntive', d: ['Installazione, configurazione e cablaggio esclusi.', 'I prezzi si intendono IVA esclusa, franco magazzino del distributore.', 'Garanzia 3 anni sui prodotti Hikvision.'], h: 'Scegliendo una nota la si aggiunge al testo; il testo resta modificabile' }
  };
  let OPTS = null; const optSubs = new Set();
  try { claude.use('db').then(db => { if (db) db.collection('offopt').onSnapshot(sn => { OPTS = sn.docs.map(d => ({ id: d.id, ...d.data() })); optSubs.forEach(f => { try { f(); } catch (e) { } }); }, () => { }); }); } catch (e) { }
  const optsOf = cat => (OPTS || []).filter(x => x.cat === cat).sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0) || (a.at || 0) - (b.at || 0));
  // la prima volta che si usa, ogni menu parte con le voci più comuni (salvate, quindi poi modificabili e cancellabili)
  let seeding = false; const seedOpts = async () => { if (seeding || !OPTS || typeof newId !== 'function') return; seeding = true;
    for (const [cat, c] of Object.entries(OCAT)) if (!OPTS.some(x => x.cat === cat) && !lsG('hp_optSeed_' + cat)) { lsS('hp_optSeed_' + cat, '1'); let k = 0; for (const text of c.d) await put('offopt', newId('offopt'), { cat, text, ord: k++, at: Date.now(), by: S.me }); } };
  window.hpOptManage = function (cat, onDone) {
    const c = OCAT[cat]; const list = el('div', { class: 'stack', style: 'gap:8px' });
    const draw = () => { const it = optsOf(cat); list.replaceChildren(...(it.length ? it.map((x, i) => {
      const ta = el('textarea', { rows: Math.min(4, Math.max(1, Math.ceil((x.text || '').length / 70))), style: 'min-height:0;flex:1', value: x.text || '', 'aria-label': 'Testo della voce' });
      ta.addEventListener('change', async () => { const v = ta.value.trim(); if (!v) { ta.value = x.text; return; } if (v !== x.text && await put('offopt', x.id, { ...x, text: v, id: undefined })) toast('Voce aggiornata'); });
      return el('div', { class: 'row', style: 'gap:6px;align-items:flex-start;flex-wrap:nowrap' }, ta,
        el('button', { type: 'button', class: 'icon-btn', title: 'Sposta su', 'aria-label': 'Sposta su', disabled: i === 0, onclick: async () => { const p = it[i - 1]; await put('offopt', x.id, { ...x, id: undefined, ord: i - 1 }); await put('offopt', p.id, { ...p, id: undefined, ord: i }); it.forEach(async (y, k) => { if (k !== i && k !== i - 1 && y.ord !== k) await put('offopt', y.id, { ...y, id: undefined, ord: k }); }); } }, '↑'),
        el('button', { type: 'button', class: 'icon-btn', title: 'Elimina la voce', 'aria-label': 'Elimina la voce', onclick: async () => { if (!await ask('Eliminare la voce «' + String(x.text).slice(0, 80) + '»?', 'Elimina')) return; await remove('offopt', x.id); } }, ic('trash', 16)));
    }) : [el('p', { class: 'hint', style: 'margin:0' }, 'Nessuna voce: aggiungine una.')])); };
    const nt = el('textarea', { rows: 2, placeholder: 'Nuova voce…', style: 'min-height:0' });
    const add = async () => { const v = nt.value.trim(); if (!v) { nt.focus(); return; } if (await put('offopt', newId('offopt'), { cat, text: v, ord: optsOf(cat).length, at: Date.now(), by: S.me })) { nt.value = ''; nt.focus(); } };
    optSubs.add(draw); draw();
    const m = modal('Voci di «' + c.t + '»', el('div', { class: 'stack' }, c.h ? el('p', { class: 'hint', style: 'margin:0' }, c.h) : null, list, el('h4', { style: 'margin:6px 0 0' }, 'Aggiungi'), nt),
      [el('span', { class: 'grow' }), btn('Aggiungi voce', add, '', 'plus'), btn('Fatto', () => { optSubs.delete(draw); m.close(); onDone && onDone(); }, 'pri', 'check')]);
  };
  window.hpExportOpts = function (o, extraShow) {
    const cond = (o.pdf && o.pdf.cond) || {}; const pick = rx => { for (const [k, v] of Object.entries(cond)) if (rx.test(k)) return String(v).trim(); return ''; };
    const ck = (on, t, h) => { const i = el('input', { type: 'checkbox', checked: on }); return { i, n: el('label', { class: 'row', style: 'gap:8px;align-items:flex-start' }, i, el('span', {}, el('b', {}, t), h ? el('div', { class: 'hint' }, h) : null)) }; };
    const anyNc = (o.righe || []).some(r => r.nc);
    const cL = ck(S.state.exL !== false, 'Prezzo di listino', 'Togliendolo, il cliente vede solo i prezzi netti');
    const cS = ck(S.state.exSc !== false, 'Sconto %', anyNc ? 'Le righe con «netto cliente» mostrano comunque solo il netto' : 'Le colonne di sconto vuote non compaiono comunque');
    const fData = el('input', { type: 'date', value: o.data || new Date().toISOString().slice(0, 10) });
    seedOpts();
    // un campo per sezione: menu a tendina delle voci salvate + testo modificabile per questo documento + «Gestisci voci»
    const field = (cat, init) => {
      const c = OCAT[cat]; const sel = el('select', { 'aria-label': c.t, style: 'flex:1;min-width:0' });
      const ta = el('textarea', { rows: cat === 'note' ? 3 : 1, style: 'min-height:0', value: init || '', 'aria-label': c.t + ' (testo nel documento)' });
      const fill = () => { const it = optsOf(cat); const cur = sel.value; sel.replaceChildren(el('option', { value: '' }, cat === 'note' ? '+ Aggiungi una nota salvata…' : it.length ? 'Scegli una voce…' : (OPTS ? 'Nessuna voce salvata' : 'Carico le voci…')), ...it.map(x => el('option', { value: x.id, selected: x.id === cur || (!cur && cat !== 'note' && x.text === ta.value.trim()) }, String(x.text).length > 90 ? String(x.text).slice(0, 88) + '…' : x.text))); if (cat !== 'note' && !ta.value.trim() && it.length && OPTS) { const last = lsG('hp_ex_' + cat); const d = it.find(x => x.text === last) || it[0]; ta.value = d.text; sel.value = d.id; ta.dispatchEvent(new Event('input')); } };
      sel.addEventListener('change', () => { const x = optsOf(cat).find(y => y.id === sel.value); if (!x) return; if (cat === 'note') { ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + x.text; sel.value = ''; } else ta.value = x.text; ta.dispatchEvent(new Event('input')); });
      optSubs.add(fill); fill();
      const node = el('div', { class: 'fld', style: 'grid-column:1/-1' }, el('span', {}, c.t),
        el('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, sel, btn('Gestisci voci', () => hpOptManage(cat, fill), 'sm ghost', 'edit')), ta);
      return { node, ta, done: () => optSubs.delete(fill) };
    };
    const fC = field('consegna', o.consegna || pick(/consegn/i));
    const fV = field('valid', o.valid ? o.valid + ' giorni' : '');
    const fS = field('sped', o.spedizione || '');
    const fP = field('pag', o.pagamento || pick(/pagament/i));
    const fN2 = field('note', o.note || '');
    const days = () => parseInt((fV.ta.value.match(/\d+/) || [])[0], 10) || 0;
    const scad = el('span', { class: 'hint' }); const upd = () => { const d = new Date(fData.value + 'T12:00'); d.setDate(d.getDate() + (days() || 30)); scad.textContent = isNaN(d) ? '' : 'Valida fino al ' + d.toLocaleDateString('it-IT') + (days() ? '' : ' (nessun numero di giorni: uso 30)'); };
    fData.addEventListener('input', upd); fV.ta.addEventListener('input', upd); upd();
    const node = el('div', { class: 'stack' },
      el('h4', { style: 'margin:0' }, 'Cosa mostrare'), el('div', { class: 'stack', style: 'gap:6px' }, cL.n, cS.n, ...(extraShow || [])),
      el('h4', { style: 'margin:6px 0 0' }, 'Condizioni dell\'offerta'),
      el('div', { class: 'fgrid', style: 'grid-template-columns:repeat(auto-fit,minmax(180px,1fr))' }, el('label', { class: 'fld' }, el('span', {}, 'Data dell\'offerta'), fData), el('div', { class: 'fld', style: 'align-self:end' }, scad),
        fC.node, fV.node, fS.node, fP.node, fN2.node));
    const read = () => {
      [fC, fV, fS, fP, fN2].forEach(f => f.done());
      S.state.exSc = cS.i.checked; S.state.exL = cL.i.checked; lsS('hp_ex_consegna', fC.ta.value.trim()); lsS('hp_ex_valid', fV.ta.value.trim()); lsS('hp_ex_sped', fS.ta.value.trim()); lsS('hp_ex_pag', fP.ta.value.trim());
      // righe «netto cliente»: nel documento solo il netto, senza listino e senza sconto
      const righe = (o.righe || []).map(r => r.nc ? { ...r, noList: true, ncHide: true } : r);
      return { o: { ...o, righe, data: fData.value || o.data, valid: days() || 30, validTxt: fV.ta.value.trim(), spedizione: fS.ta.value.trim(), pagamento: fP.ta.value.trim(), consegna: fC.ta.value.trim(), note: fN2.ta.value.trim() }, sc: cS.i.checked, lst: cL.i.checked };
    };
    return { node, read };
  };
  /* file dell'offerta pronto: il download parte dal clic su «Scarica» (un download avviato dopo un'attesa lunga, senza clic, il browser può bloccarlo in silenzio) */
  window.hpDlReady = function (blob, name) {
    const u = URL.createObjectURL(blob); const isPdf = /\.pdf$/i.test(name); const kb = blob.size / 1024;
    const m = modal(isPdf ? 'Offerta PDF pronta' : 'Offerta pronta', el('div', { class: 'stack' }, el('p', { style: 'margin:0' }, el('b', { class: 'mono' }, name), el('span', { class: 'hint' }, ' · ' + (kb > 1024 ? (kb / 1024).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB' : Math.round(kb) + ' KB')))),
      [el('span', { class: 'grow' }), isPdf ? el('a', { class: 'btn', href: u, target: '_blank', rel: 'noopener' }, ic('ext', 16), 'Apri in una scheda') : null,
        el('a', { class: 'btn pri', href: u, download: name, onclick: () => setTimeout(() => m.close(), 400) }, ic('dl', 16), 'Scarica')].filter(Boolean));
    setTimeout(() => URL.revokeObjectURL(u), 30 * 60000);
  };
  window.hpValidTxt = o => { let t = 'La presente Offerta ha validità ' + (o.valid || 30) + ' giorni'; if (o.data) { const d = new Date(o.data + 'T12:00'); d.setDate(d.getDate() + (+o.valid || 30)); if (!isNaN(d)) t += ' (fino al ' + d.toLocaleDateString('it-IT') + ')'; } return t + '.'; };

  /* ---------------- esportazione offerta: con o senza sconto ---------------- */
  const origExport = window.exportOffer;
  window.exportOffer = function (o) {
    const X = window.hpExportOpts(o);
    // allegati dell'offerta (immagini e PDF) con la loro posizione nel documento
    const U = window.hpAttUI ? hpAttUI(o, [['cov', 'Copertina'], ['ord', 'Offerta commerciale e dettaglio'], ['cond', 'Condizioni e note']], { empty: 'Nessun allegato: carica immagini o PDF nella scheda offerta o qui sotto.' }) : null;
    let nx = 0; const unO = U ? hpOffAtts(o, fs => { for (const f of fs) if (!U.has('of:' + f.id)) U.set('of:' + f.id, { label: f.name, icon: hpAttIsImg(f.type, f.name) ? '🖼️' : '📄', on: true, src: () => ({ url: '/_blob/' + f.id, type: f.type, name: f.name }) }); }) : null;
    const add = el('input', { type: 'file', accept: '.pdf,image/*', multiple: true, hidden: true, onchange: e => { for (const f of e.target.files) U.set('tmp:' + (++nx), { label: f.name, icon: hpAttIsImg(f.type, f.name) ? '🖼️' : '📄', on: true, src: () => ({ file: f, type: f.type, name: f.name }) }); e.target.value = ''; } });
    const prog = el('div', { class: 'row hp-prog', style: 'gap:8px', hidden: true }, el('span', { class: 'spin' }), el('span', {})); const say = t => { prog.hidden = false; prog.lastChild.textContent = t; };
    const stop = () => { try { unO && unO(); } catch (e) { } };
    const pages = async () => { if (!U) return {}; const list = U.read(); U.save(); return list.length ? await hpAttRender(list, say) : {}; };
    const m = modal('Esporta offerta ' + (o.numero || ''), el('div', { class: 'stack' }, X.node, el('p', { class: 'hint', style: 'margin:0' }, 'Le voci scelte e i testi modificati valgono per questo documento; le ultime scelte si ripropongono alla prossima esportazione. «Gestisci voci» crea, modifica e cancella le voci dei menu per tutto il gruppo.'),
      U ? el('h4', { style: 'margin:6px 0 0' }, 'Allegati e ordine dell\'offerta') : null, U ? el('p', { class: 'hint', style: 'margin:0' }, 'Spunta gli allegati da includere e spostali con ↑ ↓ prima o dopo le parti dell\'offerta: ogni allegato va dopo la parte che lo precede nell\'elenco.') : null,
      U ? U.node : null, U ? el('div', { class: 'row', style: 'gap:8px' }, btn('Aggiungi PDF o immagine', () => add.click(), 'sm ghost', 'up'), add) : null, prog),
      [el('span', { class: 'grow' }), btn('Annulla', () => { stop(); m.close(); }),
        btn('Excel', () => { const R = X.read(); stop(); m.close(); xlsxOut(R.o, R.sc, R.lst); }, '', 'dl'),
        btn('Word', async () => { const R = X.read(); try { const ap = await pages(); stop(); m.close(); if (window.hpOffDocx) await hpOffDocx(R.o, R.sc, R.lst, false, ap); } catch (e) { console.error(e); toast('Word non creato: ' + (e.message || e), 'bad'); prog.hidden = true; } }, '', 'doc'),
        btn('PDF', async () => { const R = X.read(); try { const ap = await pages(); stop(); m.close(); await pdfOut(R.o, R.sc, R.lst, ap); } catch (e) { console.error(e); toast('PDF non creato: ' + (e.message || e), 'bad'); prog.hidden = true; } }, 'pri', 'doc')], { wide: true });
  };
  async function xlsxOut(o, sc, lst) {
    // Excel con le immagini dei prodotti, nel formato dei listini Pro e Solution
    if (window.hpOffXlsxImg) { try { return await hpOffXlsxImg(o, sc, lst, typeof HP_PAV !== 'undefined' && !!HP_PAV); } catch (e) { console.warn(e); toast('Excel con immagini non riuscito, esporto senza immagini', 'bad'); } }
    if (sc && lst && !(o.righe || []).some(r => r.noList || r.sez)) return origExport(o);
    const X = await xlsxLib(); const com = S.commesse.get(o.commessaId); const cli = S.clienti.get(o.clienteId);
    const head = [['Offerta', o.numero || ''], ['Titolo', o.titolo || ''], ['Data', o.data || ''], ['Cliente', cli?.nome || ''], ['Commessa', com?.nome || ''], []];
    const H = ['Sezione', 'Codice', 'Descrizione', 'Q.tà', ...(lst ? ['Prezzo listino'] : []), ...(sc ? ['Sconto %'] : []), 'Prezzo netto', 'Totale netto'];
    const aoa = [...head, H];
    for (const r of o.righe || []) { const t = lineTot(r); aoa.push([r.sez || '', window.hpKitCode ? hpKitCode(r.c) : r.c, (r.b || ''), +r.q || 0, ...(lst ? [r.noList ? '' : +r.p || 0] : []), ...(sc ? [r.noList ? '' : (+r.sc2 ? (typeof scTxt === 'function' ? scTxt(r) : r2(+r.sc || 0)) : r2(+r.sc || 0))] : []), t.unit, t.netto]); }
    const T = offTot(o.righe), TL = offTot((o.righe || []).filter(r => !r.noList)); aoa.push([]); aoa.push(['', '', 'TOTALE', '', ...(lst ? [TL.L] : []), ...(sc ? [TL.sc] : []), '', T.N]);
    if (o.note) aoa.push([], ['Note', o.note]);
    const ws = X.utils.aoa_to_sheet(aoa); ws['!cols'] = H.map((h, i) => ({ wch: i === 2 ? 60 : i === 1 ? 24 : 14 }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Offerta'); await saveXlsx(wb, (o.numero || 'Offerta') + (com ? ' ' + com.nome : ''));
  }
  /* ---------- caratteri sicuri per il PDF: i font standard di jsPDF hanno solo il set Windows-1252;
     un carattere fuori set (≤, ≥, ≈, ⌀, frecce…) fa uscire la riga dalla cella con le lettere spaziate, quindi si sostituisce ---------- */
  const CP = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
  const MAPC = { '≤': '<=', '≥': '>=', '≈': '~', '≠': '!=', '⌀': 'Ø', '∅': 'Ø', '→': '->', '←': '<-', '↔': '<->', '↑': '^', '↓': 'v', '√': 'rad.', '∞': 'inf.', 'Ω': 'Ohm', 'μ': 'µ', '∙': '·', '‧': '·', '⋅': '·', '′': "'", '″': '"', '‐': '-', '‑': '-', '‒': '-', '−': '-', '﹣': '-', '：': ':', '（': '(', '）': ')', '，': ',', '；': ';', '　': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '\u00a0': ' ', '℃': '°C', '℉': '°F', '㎡': 'm²', '㎜': 'mm', '㎝': 'cm', '㎏': 'kg', '³': '³', '✓': 'v', '✔': 'v', '•': '•' };
  const safeCh = c => { const k = c.charCodeAt(0); if ((k >= 32 && k <= 126) || (k >= 160 && k <= 255) || c === '\n' || CP.has(c)) return c; if (MAPC[c] != null) return MAPC[c]; const n = c.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); return [...n].every(x => { const q = x.charCodeAt(0); return (q >= 32 && q <= 126) || (q >= 160 && q <= 255); }) ? n : ''; };
  const pdfSafe = t => typeof t === 'string' ? [...t].map(safeCh).join('') : Array.isArray(t) ? t.map(pdfSafe) : t;
  window.hpPdfSafe = pdfSafe;
  // immagini nei PDF: la stessa immagine si incorpora una sola volta (alias) e i PNG si comprimono (senza perdita di qualità)
  const imgAlias = d => { const t = typeof d === 'string' ? d : ''; if (!t) return undefined; let h = 0; for (let i = 0; i < t.length; i += Math.max(1, Math.floor(t.length / 4000))) h = (h * 31 + t.charCodeAt(i)) | 0; return 'im' + t.length + '_' + (h >>> 0).toString(36); };
  const wrapImg = doc => { if (doc._hpImg) return doc; doc._hpImg = true; const a0 = doc.addImage.bind(doc);
    doc.addImage = function (data, fmt, x, y, w, h, alias, comp, rot) { if (typeof fmt === 'string' && arguments.length >= 6) { const png = /png/i.test(fmt) || (typeof data === 'string' && /^data:image\/png/i.test(data)); return a0(data, fmt, x, y, w, h, alias || imgAlias(data), comp || (png ? 'SLOW' : undefined), rot); } return a0.apply(doc, arguments); }; return doc; };
  window.hpPdfImgDoc = wrapImg;
  window.hpPdfSafeDoc = doc => { wrapImg(doc); const t0 = doc.text.bind(doc), s0 = doc.splitTextToSize.bind(doc), w0 = doc.getTextWidth.bind(doc); doc.text = (t, ...a) => t0(pdfSafe(t), ...a); doc.splitTextToSize = (t, ...a) => s0(pdfSafe(t), ...a); doc.getTextWidth = t => w0(pdfSafe(t)); return doc; };

  /* immagine del prodotto per i documenti: quella dell'articolo nel listino (o della riga), quadrata su fondo bianco */
  window.hpProdThumb = async function (r, px = 240) {
    const it = (typeof findCode === 'function' ? findCode(r.c, r.L) : null) || {}; const im = r.im != null ? r.im : it.im;
    const sq = src => new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => { try { const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, px, px); const k = Math.min(px / i.naturalWidth, px / i.naturalHeight) * 0.92; const w = i.naturalWidth * k, h = i.naturalHeight * k; g.drawImage(i, (px - w) / 2, (px - h) / 2, w, h); res(c.toDataURL('image/jpeg', 0.88)); } catch (e) { res(null); } }; i.onerror = () => res(null); i.src = src; });
    if (typeof im === 'string' && im[0] === '/') return sq(im);
    try { const n = window.artThumbC ? artThumbC(r.c, im, 96) : thumb(im, 96); if (n && !n.classList.contains('none') && window.hpImgData) { let tmp = false; if (!n.isConnected && !(n.tagName === 'IMG') && !n.style.backgroundImage) { tmp = true; n.style.cssText += ';position:fixed;left:-9999px;top:0'; document.body.append(n); await new Promise(z => setTimeout(z, 300)); } const d = await window.hpImgData(n, px); if (tmp) n.remove(); return d; } } catch (e) { }
    return null;
  };

  /* ---------- PDF dell'offerta: modello standard Hikvision (copertina, offerta commerciale, dettaglio SAP, condizioni) ---------- */
  const HQ = 'HIKVISION ITALY Srl - Viale Fulvio Testi, 113 - 20092 Cinisello Balsamo (MI) - P.IVA 07757250969';
  const imgData = (src, w) => new Promise(res => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * i.naturalHeight / i.naturalWidth); c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); res({ d: c.toDataURL('image/png'), r: i.naturalHeight / i.naturalWidth }); }; i.onerror = () => res(null); i.src = src; });
  async function pdfOut(o, sc, lst, attPages) {
    const eur = v => '€ ' + (window.hpGrpX ? hpGrpX(v) : window.hpGrp ? hpGrp(v, 2) : (+v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })); // come nel modello: «€ 1.200,00»
    try {
      if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      if (!window.jspdf.jsPDF.API.autoTable) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    } catch (e) { toast('Non riesco a caricare il generatore PDF.', 'bad'); return; }
    const doc = window.hpPdfSafeDoc(new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' })); if (window.hpPdfFont) await hpPdfFont(doc); const W = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    const RED = [200, 16, 46], INK = [64, 64, 64], GREY = [128, 128, 128];
    const com = S.commesse.get(o.commessaId), cli = S.clienti.get(o.clienteId) || {}; const P = o.pdf || {}; const M = P.meta || {}; const C = P.cliente || {};
    const logo = await imgData('/brand-hikvision.png', 1200) || await imgData('/hik-logo.png', 1200);
    const num = o.numero || '—'; const dt = o.data ? o.data.split('-').reverse().join('/') : new Date().toLocaleDateString('it-IT');
    const cliName = cli.nome || C.nome || 'Cliente'; const rif = o.titolo || M.riferimento || (com ? com.nome : '');
    const me = (S.team && S.team.get(o.by || S.me)) || {}; const red = { n: M.redatto || nm(o.by || S.me), e: M.redattoEmail || me.email || (typeof mailOf === 'function' ? mailOf(o.by || S.me) : '') || '', t: M.redattoTel || me.tel || '' };
    const T = (txt, x, y, opt = {}) => { doc.setFont('helvetica', opt.b ? 'bold' : opt.i ? 'italic' : 'normal'); doc.setFontSize(opt.s || 9); doc.setTextColor(...(opt.c || INK)); doc.text(String(txt ?? ''), x, y, opt.a ? { align: opt.a } : undefined); };
    // 1 · copertina
    if (logo) { const w = 120; doc.addImage(logo.d, 'PNG', (W - w) / 2, 22, w, w * logo.r); }
    { const parts = ['TVCC', 'INTRUSIONE', 'INTERCOM', 'CONTROLLO ACCESSI']; doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); const sep = ' | '; const tw = doc.getTextWidth(parts.join(sep)); let x = (W - tw) / 2; const y = 22 + 120 * (logo ? logo.r : .14) + 7;
      parts.forEach((p, k) => { doc.setTextColor(...GREY); doc.text(p, x, y); x += doc.getTextWidth(p); if (k < parts.length - 1) { doc.setTextColor(...RED); doc.text(sep, x, y); x += doc.getTextWidth(sep); } }); }
    T('Offerta riservata per', W / 2, 75, { a: 'center', s: 8.5 });
    T(cliName.toUpperCase(), W / 2, 86, { a: 'center', s: 19, b: true, c: [85, 85, 85] });
    if (rif) { T('Riferimento', W / 2, 101, { a: 'center', s: 8 }); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(85, 85, 85); doc.text(doc.splitTextToSize(rif, W - 50), W / 2, 109, { align: 'center' }); }
    T(num + ' del ' + dt, W / 2, rif ? 124 : 104, { a: 'center', s: 8 });
    // allegati (immagini e PDF) nelle posizioni scelte: pagine intere, senza piè di pagina dell'offerta
    const AP = attPages || {}; const attP = new Set();
    const ins = pos => { for (const pg of AP[pos] || []) { const land = pg.w > pg.h; doc.addPage('a4', land ? 'l' : 'p'); attP.add(doc.internal.getNumberOfPages()); const PW = land ? 297 : 210, PHh = land ? 210 : 297, m = 6; const k = Math.min((PW - 2 * m) / pg.w, (PHh - 2 * m) / pg.h); const iw = pg.w * k, ih = pg.h * k; doc.addImage(pg.d, 'JPEG', (PW - iw) / 2, (PHh - ih) / 2, iw, ih, undefined, 'FAST'); } };
    ins('cov');
    // 2 · offerta commerciale
    doc.addPage('a4', 'p');
    if (logo) doc.addImage(logo.d, 'PNG', 14, 12, 80, 80 * logo.r);
    let y = 38;
    T('Partner contrattuale:', 16, y, { i: true, s: 8 }); T('HIKVISION ITALY Srl', 16, y + 5.5, { s: 8.5 }); T('Sede legale:', 16, y + 11, { s: 8 }); T('Viale Fulvio Testi, 113', 16, y + 16, { s: 8 }); T('20092 Cinisello Balsamo (MI)', 16, y + 21, { s: 8 });
    T('Spett.Le', 125, y, { s: 8 });
    const cl = [cliName, [cli.indirizzo || C.indirizzo, [cli.cap || C.cap, cli.citta || C.citta].filter(Boolean).join(' '), cli.prov || C.prov].filter(Boolean).join(', '), (cli.piva || C.piva) ? 'P.IVA ' + (cli.piva || C.piva) : '', cli.referente ? 'Alla c.a. ' + cli.referente : ''].filter(Boolean);
    cl.forEach((t, k) => T(doc.splitTextToSize(t, W - 140)[0], 125, y + 5.5 + k * 5, { s: 8.5 }));
    y = 78; T('Offerta commerciale', 14, y, { s: 12, c: RED });
    y += 10; T('Offerta numero:', 14, y, { s: 7.5 }); T(num + ' del ' + dt, 40, y, { s: 7.5 });
    y += 6.5; T('Redatta da:', 14, y, { s: 7.5 }); [red.n, red.e, red.t ? 'Tel. ' + red.t : ''].filter(Boolean).forEach((t, k) => T(t, 40, y + k * 5, { s: 7.5 })); y += 5 * Math.max(1, [red.n, red.e, red.t].filter(Boolean).length) + 1.5;
    if (rif) { T('Riferimento:', 14, y, { s: 7.5 }); T(doc.splitTextToSize(rif, W - 60)[0], 40, y, { s: 7.5 }); y += 6; }
    y += 8; T('Come da vostra gentile richiesta siamo a sottoporre alla vostra attenzione la nostra migliore offerta per la fornitura dei materiali di seguito elencati.', 14, y, { s: 7.5 });
    const longD = r => { if (r.dx) return r.dx; const it = typeof findCode === 'function' ? findCode(r.c, r.L) : null; return it && it.d && (!r.b || r.b === it.b) ? it.d : (r.b || (it && it.d) || ''); };
    const head = ['Codice', 'Descrizione', 'Q.tà', ...(lst ? ['Listino Cad.'] : []), ...(sc ? ['Sc %', 'Ex %'] : []), 'Prezzo Cad.', 'Prezzo Tot.'];
    const body = []; let sez = null;
    for (const r of o.righe || []) {
      if ((r.sez || '') !== sez) { sez = r.sez || ''; if (sez) body.push([{ content: sez, colSpan: head.length, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]); }
      const t = lineTot(r); const net = r.net || r.noList || r.noSc && !(+r.sc);
      const s1 = r.sc1 ?? r.sc, s2 = +r.sc2 || 0;
      body.push([r.c, longD(r), String(r.q), ...(lst ? [r.noList || net ? '' : eur(r.p)] : []), ...(sc ? [r.ncHide ? '' : net ? 'NETTO' : fN.format(round2(+(s2 ? s1 : r.sc) || 0)), r.ncHide ? '' : net ? '-' : s2 ? fN.format(round2(s2)) : '-'] : []), eur(t.unit), eur(t.netto)]);
    }
    const nC = head.length; const cs = { 0: { cellWidth: 22 }, 2: { cellWidth: 9, halign: 'center' } };
    let k = 3; if (lst) cs[k++] = { cellWidth: 18, halign: 'right' }; if (sc) { cs[k++] = { cellWidth: 13, halign: 'center' }; cs[k++] = { cellWidth: 11, halign: 'center' }; } cs[k++] = { cellWidth: 19, halign: 'right' }; cs[k] = { cellWidth: 21, halign: 'right', textColor: RED };
    const foot = () => { };
    doc.autoTable({ startY: y + 8, head: [head], body, margin: { left: 14, right: 14, bottom: 22, top: 18 }, theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.6, textColor: [60, 60, 60], lineColor: [90, 90, 90], lineWidth: .15, valign: 'top' },
      headStyles: { fillColor: GREY, textColor: 255, fontStyle: 'normal', halign: 'center', lineColor: [255, 255, 255], lineWidth: .4 }, columnStyles: cs, didDrawPage: foot });
    const Tt = offTot(o.righe); const iva = exact(Tt.N * 0.22);
    y = doc.lastAutoTable.finalY + 9; if (y > PH - 75) { doc.addPage(); y = 25; }
    const tot = (l, v, b, vr) => { T(l, W - 48, y, { a: 'right', s: b ? 10.5 : 9.5, c: [80, 80, 80] }); T(v, W - 16, y, { a: 'right', s: b ? 10.5 : 9.5, b: true, c: vr ? RED : [64, 64, 64] }); y += 8; };
    tot('Subtotale', eur(Tt.N), false, true); tot('IVA (22%)', eur(iva)); tot('Totale offerta', eur(exact(Tt.N + iva)), true);
    y += 8; if (y > PH - 40) { doc.addPage(); y = 30; }
    if (logo) doc.addImage(logo.d, 'PNG', 32, y, 40, 40 * logo.r); y += 40 * (logo ? logo.r : .14) + 6;
    T('HIKVISION ITALY SRL', 52, y, { a: 'center', s: 7 });
    doc.setLineDashPattern([0.6, 0.8], 0); doc.setDrawColor(150, 150, 150); doc.setLineWidth(.2); doc.line(85, y - 4, 128, y - 4); doc.line(130, y - 4, 196, y - 4); doc.setLineDashPattern([], 0);
    T('Luogo e data', 106, y, { a: 'center', s: 7 }); T('Il committente (timbro/firma)', 163, y, { a: 'center', s: 7 });
    // 3 · dettaglio con i codici SAP
    doc.addPage('a4', 'p'); T('Dettaglio', 14, 22, { s: 11, c: RED });
    // dettaglio con l'immagine del prodotto, il codice SAP, il codice e la descrizione
    const LL = o.righe || []; const ths = await Promise.all(LL.map(r => window.hpProdThumb ? hpProdThumb(r).catch(() => null) : null));
    const dBody = []; LL.forEach((r, i) => { const it = typeof findCode === 'function' ? findCode(r.c, r.L) : null; const t = lineTot(r); dBody.push(['', (it && it.sap) || r.sap || '', { content: r.c + '\n' + String(r.b || (it && it.b) || '').slice(0, 220), _c: r.c }, String(r.q), eur(t.unit), eur(t.netto)]); });
    doc.autoTable({ startY: 27, head: [['', 'SAP', 'Codice / Descrizione', 'Q.tà', 'Prezzo Cad.', 'Totale']], body: dBody, margin: { left: 14, right: 14, bottom: 22, top: 18 }, theme: 'grid', rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.8, textColor: [60, 60, 60], lineColor: [90, 90, 90], lineWidth: .15, valign: 'middle' },
      headStyles: { fillColor: GREY, textColor: 255, fontStyle: 'normal', halign: 'center', lineColor: [255, 255, 255], lineWidth: .4 },
      columnStyles: { 0: { cellWidth: 20, minCellHeight: 20 }, 1: { cellWidth: 22 }, 3: { cellWidth: 10, halign: 'center' }, 4: { cellWidth: 22, halign: 'right' }, 5: { cellWidth: 24, halign: 'right', textColor: RED } },
      didParseCell: d => { if (d.section === 'body' && d.column.index === 2 && d.cell.raw && d.cell.raw._c) d.cell._c = d.cell.raw._c; },
      willDrawCell: d => { if (d.section === 'body' && d.column.index === 2 && d.cell._c) { d.cell._t = d.cell.text; d.cell.text = []; } },
      didDrawCell: d => {
        if (d.section !== 'body') return; const c = d.cell;
        if (d.column.index === 0 && ths[d.row.index]) { const sz = Math.min(c.width, c.height) - 2; doc.addImage(ths[d.row.index], 'JPEG', c.x + (c.width - sz) / 2, c.y + (c.height - sz) / 2, sz, sz); }
        if (d.column.index === 2 && c._t) { // codice in grassetto, descrizione sotto
          const fs = c.styles.fontSize, lh = fs / doc.internal.scaleFactor * 1.15; const n = c._t.length; let yy = c.y + (c.height - n * lh) / 2 + lh / 2; const codeN = doc.splitTextToSize(c._c, c.width - c.padding('horizontal')).length;
          c._t.forEach((l, k) => { doc.setFont('helvetica', k < codeN ? 'bold' : 'normal'); doc.setFontSize(fs); doc.setTextColor(...(k < codeN ? [40, 40, 40] : [90, 90, 90])); doc.text(l, c.x + c.padding('left'), yy, { baseline: 'middle' }); yy += lh; });
          doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60); }
      } });
    ins('ord');
    // 4 · condizioni
    doc.addPage('a4', 'p'); y = 22;
    const cond = P.cond || {}; const cf = (typeof cfg === 'function' ? cfg() : {}) || {};
    const pick = rx => { for (const [kk, v] of Object.entries(cond)) if (rx.test(kk)) return String(v).trim(); return ''; };
    const block = (title, lines) => { T(title, 14, y, { s: 7.5, b: true, c: RED }); y += 8; lines.forEach(l => { const ls = doc.splitTextToSize(String(l), W - 28); ls.forEach(z => { T(z, 14, y, { s: 7.5 }); y += 4.8; }); }); y += 9; };
    block('TEMPI DI CONSEGNA', [o.consegna || pick(/consegn/i) || '---']);
    block('VALIDITÀ DELL\'OFFERTA', [window.hpValidTxt(o)]);
    block('COSTI DI SPEDIZIONE', [o.spedizione || 'Sono esclusi i costi di spedizione se non indicati.']);
    block('CONDIZIONI DI PAGAMENTO', [o.pagamento || pick(/pagament/i) || '-', 'Tutti i prezzi indicati si intendono IVA esclusa.']);
    block('COORDINATE BANCARIE', ['Banca: ' + (cf.banca || pick(/^banca/i) || ''), 'IBAN: ' + (cf.iban || pick(/iban/i) || ''), 'Beneficiario: ' + (cf.beneficiario || pick(/benefic/i) || '')]);
    T('NOTE AGGIUNTIVE', 14, y, { s: 7.5, b: true, c: RED }); y += 6;
    const note = String(o.note || '').replace(/^(tempi di consegna|validit[aà][^:]*|condizioni di pagamento|banca|iban|beneficiario)\s*:.*$/gim, '').trim();
    if (note) { doc.splitTextToSize(note, W - 28).forEach(z => { T(z, 14, y, { s: 7.5 }); y += 4.8; }); y += 3; }
    else { doc.setDrawColor(60, 60, 60); doc.setLineDashPattern([1.2, 0.6], 0); for (let q = 0; q < 5; q++) { doc.line(14, y, W - 14, y); y += 3.4; } doc.setLineDashPattern([], 0); y += 3; }
    ['Immagini e descrizioni dei prodotti presenti nell\'offerta sono indicativi e potrebbero contenere inesattezze.', 'Per maggiori dettagli, vi preghiamo di consultare le schede tecniche dei prodotti sui siti web ufficiali o di contattare il personale Hikvision e i partner di distribuzione autorizzati.'].forEach(l => doc.splitTextToSize(l, W - 28).forEach(z => { T(z, 14, y, { s: 7.5 }); y += 4.8; }));
    // piè di pagina (tranne la copertina)
    const nAll = doc.internal.getNumberOfPages(); const offP = []; for (let q = 1; q <= nAll; q++) if (!attP.has(q)) offP.push(q); const n = offP.length;
    for (let p = 2; p <= n; p++) {
      doc.setPage(offP[p - 1]); const fy = PH - 10;
      T('Prev. ', 4, fy, { s: 6.5 }); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RED); doc.text(num, 4 + doc.getTextWidth('Prev. '), fy);
      T(HQ, W / 2, fy - 1.5, { a: 'center', s: 6 });
      const pg = p + '/' + n; doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); const wPg = doc.getTextWidth(pg); T('Pag. ', W - 4 - wPg, fy, { a: 'right', s: 6.5 }); doc.setFont('helvetica', 'bold'); doc.setTextColor(...RED); doc.text(String(p), W - 4 - wPg, fy); doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK); doc.text('/' + n, W - 4 - wPg + doc.getTextWidth(String(p)), fy);
    }
    ins('cond');
    window.hpDlReady(doc.output('blob'), ('Prev_' + num + '_' + cliName).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').toLowerCase() + '_hikvision.pdf');
  }
  window.hpOffXlsx = xlsxOut; window.hpOffPdfStd = pdfOut;
  window.hpParseOfferPdf = async buf => parseGest(await pdfPages(buf));
})();
