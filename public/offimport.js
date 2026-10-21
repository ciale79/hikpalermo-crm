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

  /* ---------------- esportazione offerta: con o senza sconto ---------------- */
  const origExport = window.exportOffer;
  window.exportOffer = function (o) {
    const showSc = el('input', { type: 'checkbox', id: 'exSc', checked: S.state.exSc !== false });
    const showL = el('input', { type: 'checkbox', id: 'exL', checked: S.state.exL !== false });
    const m = modal('Esporta offerta ' + (o.numero || ''), el('div', { class: 'stack' },
      el('label', { class: 'row', style: 'gap:8px' }, showSc, el('span', {}, el('b', {}, 'Mostra lo sconto %'), el('div', { class: 'hint' }, 'Colonna sconto per riga e sconto medio nel totale'))),
      el('label', { class: 'row', style: 'gap:8px' }, showL, el('span', {}, el('b', {}, 'Mostra il prezzo di listino'), el('div', { class: 'hint' }, 'Togliendolo, il cliente vede solo i prezzi netti'))),
      el('p', { class: 'hint' }, 'La scelta viene ricordata per le prossime esportazioni.')),
      [el('span', { class: 'grow' }), btn('Annulla', () => m.close()),
        btn('Excel', () => { S.state.exSc = showSc.checked; S.state.exL = showL.checked; m.close(); xlsxOut(o, showSc.checked, showL.checked); }, '', 'dl'),
        btn('PDF', () => { S.state.exSc = showSc.checked; S.state.exL = showL.checked; m.close(); pdfOut(o, showSc.checked, showL.checked); }, 'pri', 'doc')]);
  };
  async function xlsxOut(o, sc, lst) {
    if (sc && lst && !(o.righe || []).some(r => r.noList || r.sez)) return origExport(o);
    const X = await xlsxLib(); const com = S.commesse.get(o.commessaId); const cli = S.clienti.get(o.clienteId);
    const head = [['Offerta', o.numero || ''], ['Titolo', o.titolo || ''], ['Data', o.data || ''], ['Cliente', cli?.nome || ''], ['Commessa', com?.nome || ''], []];
    const H = ['Sezione', 'Codice', 'Descrizione', 'Q.tà', ...(lst ? ['Prezzo listino'] : []), ...(sc ? ['Sconto %'] : []), 'Prezzo netto', 'Totale netto'];
    const aoa = [...head, H];
    for (const r of o.righe || []) { const t = lineTot(r); aoa.push([r.sez || '', r.c, (r.b || '') + (r.net ? ' (prezzo netto)' : ''), +r.q || 0, ...(lst ? [r.noList ? '' : +r.p || 0] : []), ...(sc ? [r.noList ? '' : (+r.sc2 ? (typeof scTxt === 'function' ? scTxt(r) : r2(+r.sc || 0)) : r2(+r.sc || 0))] : []), t.unit, t.netto]); }
    const T = offTot(o.righe), TL = offTot((o.righe || []).filter(r => !r.noList)); aoa.push([]); aoa.push(['', '', 'TOTALE', '', ...(lst ? [TL.L] : []), ...(sc ? [TL.sc] : []), '', T.N]);
    if (o.note) aoa.push([], ['Note', o.note]);
    const ws = X.utils.aoa_to_sheet(aoa); ws['!cols'] = H.map((h, i) => ({ wch: i === 2 ? 60 : i === 1 ? 24 : 14 }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Offerta'); await saveXlsx(wb, (o.numero || 'Offerta') + (com ? ' ' + com.nome : ''));
  }
  async function pdfOut(o, sc, lst) {
    try {
      if (!window.jspdf) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      if (!window.jspdf.jsPDF.API.autoTable) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    } catch (e) { toast('Non riesco a caricare il generatore PDF.', 'bad'); return; }
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }); const W = doc.internal.pageSize.getWidth();
    const com = S.commesse.get(o.commessaId), cli = S.clienti.get(o.clienteId) || {};
    doc.setFillColor(200, 16, 46); doc.rect(0, 0, W, 4, 'F');
    try { const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = '/hik-logo.png'; }); const c = document.createElement('canvas'); c.width = 900; c.height = Math.round(900 * im.naturalHeight / im.naturalWidth); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); const h = 52 * c.height / c.width; doc.addImage(c.toDataURL('image/png'), 'PNG', 14, 19.5 - h, 52, h, 'logo', 'FAST'); } catch (e) { doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(200, 16, 46); doc.text('HIKVISION', 14, 18); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(110, 122, 138); doc.text('Filiale di Palermo - Viale Lazio 30/B - Palermo', 14, 25);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(28, 36, 48); doc.text('OFFERTA ' + (o.numero || ''), W - 14, 15, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text('Data ' + (o.data ? o.data.split('-').reverse().join('/') : ''), W - 14, 21, { align: 'right' }); if (o.titolo) doc.text(String(o.titolo).slice(0, 60), W - 14, 26, { align: 'right' });
    doc.setFontSize(9); doc.setTextColor(28, 36, 48);
    const cl = [cli.nome, [cli.indirizzo, [cli.cap, cli.citta].filter(Boolean).join(' '), cli.prov].filter(Boolean).join(', '), cli.piva ? 'P. IVA ' + cli.piva : '', cli.referente ? 'Alla c.a. ' + cli.referente : ''].filter(Boolean);
    doc.setFont('helvetica', 'bold'); doc.text('Spett.le', 120, 36); doc.setFont('helvetica', 'normal'); cl.forEach((s, i) => doc.text(doc.splitTextToSize(s, W - 134)[0], 120, 41 + i * 4.6));
    if (com) { doc.setFont('helvetica', 'bold'); doc.text('Commessa', 14, 36); doc.setFont('helvetica', 'normal'); doc.text(doc.splitTextToSize(com.nome, 90)[0], 14, 41); }
    const rimg = window.hpImgData ? await Promise.all((o.righe || []).map(r => { try { const n = window.artThumbC ? artThumbC(r.c, r.im, 48) : thumb(r.im, 48); return n && !n.classList.contains('none') ? window.hpImgData(n) : null; } catch (e) { return null; } })) : [];
    const withImg = rimg.some(Boolean);
    const head = [...(withImg ? [''] : []), 'Codice', 'Descrizione', 'Q.tà', ...(lst ? ['Listino'] : []), ...(sc ? ['Sc. %'] : []), 'Prezzo', 'Totale'];
    const body = [], rowImg = []; let sez = null;
    for (const r of o.righe || []) {
      if ((r.sez || '') !== sez) { sez = r.sez || ''; if (sez) { rowImg.push(null); body.push([{ content: sez, colSpan: head.length, styles: { fontStyle: 'bold', fillColor: [245, 246, 248] } }]); } }
      const t = lineTot(r); rowImg.push(rimg[(o.righe || []).indexOf(r)] || null); body.push([...(withImg ? [''] : []), r.c, (r.b || '').slice(0, r.net ? 104 : 120) + (r.net ? ' (prezzo netto)' : ''), String(r.q), ...(lst ? [r.noList ? '—' : eur(r.p)] : []), ...(sc ? [r.noList ? '—' : (typeof scTxt === 'function' ? scTxt(r) : fN.format(r2(+r.sc || 0)) + '%')] : []), eur(t.unit), eur(t.netto)]);
    }
    const ci = head.length, o0 = withImg ? 1 : 0; const right = {}; for (let i = 2 + o0; i < ci; i++) right[i] = { halign: 'right', cellWidth: i === 2 + o0 ? 10 : 21, overflow: 'visible' };
    doc.autoTable({ startY: 41 + cl.length * 4.6 + 6, head: [head], body, margin: { left: 14, right: 14 }, styles: { fontSize: 8, cellPadding: 1.8, textColor: [28, 36, 48], lineColor: [225, 228, 234], lineWidth: .1 }, headStyles: { fillColor: [28, 36, 48], textColor: 255 }, columnStyles: { ...(withImg ? { 0: { cellWidth: 15, minCellHeight: 13 } } : {}), [o0]: { cellWidth: withImg ? 38 : 44, fontStyle: 'bold', fontSize: 7.5 }, ...right }, didDrawCell: d => { if (!withImg || d.section !== 'body' || d.column.index !== 0) return; const im = rowImg[d.row.index]; if (!im) return; const sz = Math.min(d.cell.width - 2, d.cell.height - 2, 12); try { doc.addImage(im, 'JPEG', d.cell.x + (d.cell.width - sz) / 2, d.cell.y + (d.cell.height - sz) / 2, sz, sz); } catch (e) { } } });
    const T = offTot(o.righe), TL = offTot((o.righe || []).filter(r => !r.noList)); let y = doc.lastAutoTable.finalY + 6;
    const tl = (l, v, b) => { doc.setFont('helvetica', b ? 'bold' : 'normal'); doc.setFontSize(b ? 11 : 9.5); doc.text(l, W - 50, y, { align: 'right' }); doc.text(v, W - 14, y, { align: 'right' }); y += b ? 7 : 5.5; };
    if (lst) tl('Totale a listino' + (TL.L !== T.L ? ' (righe con listino)' : ''), eur(TL.L)); if (sc) tl('Sconto medio' + (TL.L !== T.L ? ' sulle righe a listino' : ''), fN.format(TL.sc) + '%'); tl('Totale offerta (IVA esclusa)', eur(T.N), true);
    if (o.note) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110, 122, 138); const t = doc.splitTextToSize(o.note, W - 28); if (y + t.length * 3.6 > 285) { doc.addPage(); y = 20; } doc.text(t, 14, y + 4); }
    const n = doc.internal.getNumberOfPages(); for (let p = 1; p <= n; p++) { doc.setPage(p); doc.setFontSize(7.5); doc.setTextColor(110, 122, 138); doc.text('Offerta ' + (o.numero || '') + ' - pagina ' + p + ' di ' + n, W / 2, 290, { align: 'center' }); }
    doc.save(((o.numero || 'Offerta') + (com ? ' ' + com.nome : '')).replace(/[\\/:*?"<>|]+/g, '-') + '.pdf');
  }
  window.hpParseOfferPdf = async buf => parseGest(await pdfPages(buf));
})();
