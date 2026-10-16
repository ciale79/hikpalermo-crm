/* HIK PALERMO — sezione PARTNER: review partner (target, sell-out per trimestre, raggiungimento), nuovi clienti e progetti */
(function () {
  'use strict';
  ICONS.medal = 'M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.4 6.7 19.1l1-5.8L3.5 9.2l5.9-.9z';
  const i = NAV.findIndex(n => n[0] === 'clienti');
  NAV.splice(i + 1, 0, ['partner', 'Partner', 'medal']);
  S.progSO = new Map();
  S.fPar = S.fPar || { q: '', cat: '', tier: '' };
  claude.use('db').then(db => { if (db) db.collection('progettiSO').onSnapshot(s => { const m = new Map(); s.docs.forEach(d => m.set(d.id, { id: d.id, ...d.data() })); S.progSO = m; if (S.view === 'partner') VIEWS.partner.update(); }, () => { }); });

  const ORD = { DIAMOND: 0, PLATINUM: 1, GOLD: 2, SILVER: 3, EXPLORER: 4 };
  const pct = (v, t) => t ? v / t * 100 : null;
  const soTot = p => (p.so || []).reduce((a, b) => a + (+b || 0), 0);
  const hue = r => r == null ? null : r >= 100 ? 125 : r >= 50 ? 32 : 0;
  const achBar = (r) => r == null ? el('span', { class: 'hint' }, '—') :
    el('div', { class: 'pa-ach', 'data-sort': String(Math.round(r * 10) / 10) }, el('div', { class: 'abar' }, el('i', { style: { width: Math.min(100, r) + '%', '--h': String(hue(r)) } })), el('b', { style: { color: 'hsl(' + hue(r) + ' 70% 38%)' } }, fN.format(Math.round(r)) + '%'));
  const ACC = { NUOVO: 'var(--ok)', RINNOVATO: 'var(--info)', SCADUTO: 'var(--accent)', 'NON RINNOVATO': 'var(--ink-3)' };
  const accChip = a => a ? el('span', { class: 'pill', style: '--c:' + (ACC[a] || 'var(--ink-3)') }, a.charAt(0) + a.slice(1).toLowerCase()) : el('span', { class: 'muted' }, '—');
  window.hpAccChip = accChip;
  const euro = v => v == null ? '—' : eur0(v);
  const won = new Set(['acq', 'exec', 'chiusa']);
  function comStats(cid) {
    let n = 0, w = 0, pipe = 0;
    for (const c of S.commesse.values()) { if (c.clienteId !== cid) continue; n++; const v = comVal(c.id).N || c.valore || 0; if (won.has(c.stato)) w += v; else if (c.stato !== 'persa') pipe += v; }
    return { n, w, pipe };
  }

  /* ---------------- modulo partner ---------------- */
  function partnerForm(c) {
    const p = JSON.parse(JSON.stringify(c && c.partner || { anno: new Date().getFullYear(), regione: 'SICILIA', tier: 'SILVER', catalogo: 'PRO', target: 0, so: [null, null, null, null], nota: '' }));
    const cliSel = c ? null : selectEl('paCli', [['', '— Scegli il cliente —'], ...[...S.clienti.values()].filter(x => !x.partner).sort(byName).map(x => [x.id, x.nome])], '');
    const f = {
      tier: selectEl('paTier', TIERS.slice().reverse().map(t => [t, TLAB[t]]), p.tier), cat: selectEl('paCat', [['SOLUTION', 'Solution'], ['PRO', 'Pro'], ['PRO/SOL', 'Pro e Solution']], p.catalogo),
      prog: selectEl('paProg', [['', '—'], ['ProExpert', 'ProExpert'], ['Solution', 'Solution'], ['Privilege', 'Privilege']], p.programma || ''), acc: selectEl('paAcc', [['', '—'], ['NUOVO', 'Nuovo'], ['RINNOVATO', 'Rinnovato'], ['SCADUTO', 'Scaduto'], ['NON RINNOVATO', 'Non rinnovato']], p.accordo || ''), cod: inp('paCod', p.codice || '', { placeholder: 'Codice tessera' }),
      reg: inp('paReg', p.regione || ''), tg: inp('paTg', p.target ?? '', { type: 'number', min: 0, step: 500 }),
      q: [0, 1, 2, 3].map(k => inp('paQ' + k, (p.so || [])[k] ?? '', { type: 'number', step: 500, placeholder: '—' })), nota: el('textarea', { id: 'paNota', value: p.nota || '', style: 'min-height:70px' })
    };
    const body = el('div', { class: 'fgrid' }, cliSel ? fld('Cliente *', cliSel, 'full') : null,
      fld('Stato partnership', f.tier), fld('Catalogo', f.cat), fld('Programma', f.prog), fld('Accordo ' + p.anno, f.acc), fld('Codice partner', f.cod), fld('Regione', f.reg), fld('Target ' + p.anno + ' (€)', f.tg),
      el('div', { class: 'fld full' }, el('span', {}, 'Sell-out per trimestre (€)'), el('div', { class: 'row', style: 'flex-wrap:nowrap;gap:8px' }, f.q.map((x, k) => el('label', { class: 'fld grow' }, el('span', {}, 'Q' + (k + 1)), x)))),
      fld('Note', f.nota, 'full'),
      el('p', { class: 'hint full' }, 'Lo stato partnership aggiorna anche lo status Pro / Solution della scheda cliente, in base al catalogo.'));
    const m = modal(c ? 'Partner · ' + c.nome : 'Nuovo partner', body, [
      c ? btn('Togli dai partner', async () => { if (!await ask('Togliere ' + c.nome + ' dalla review partner? La scheda cliente resta.', 'Togli')) return; const d = { ...c }; delete d.id; delete d.partner; if (await put('clienti', c.id, d)) m.close(); }, 'danger', 'trash') : null,
      c ? btn('Apri cliente', () => { m.close(); go('clienti', c.id); }, 'ghost') : null,
      el('span', { class: 'grow' }), btn('Annulla', () => m.close()),
      btn('Salva', async () => {
        const cid = c ? c.id : cliSel.value; if (!cid) { toast('Scegli il cliente.', 'bad'); return; }
        const cur = S.clienti.get(cid); const num = x => x.value === '' ? null : +x.value;
        const np = { ...p, tier: f.tier.value, catalogo: f.cat.value, programma: f.prog.value, accordo: f.acc.value, codice: f.cod.value.trim(), regione: f.reg.value.trim().toUpperCase(), target: num(f.tg) || 0, so: f.q.map(num), nota: f.nota.value.trim(), upd: Date.now() };
        const up = { partner: np, upd: Date.now() };
        up.statusSol = np.catalogo.includes('SOL') ? np.tier : null; up.statusPro = np.catalogo.includes('PRO') ? np.tier : null;
        if (await patch('clienti', cid, up)) { m.close(); toast('Partner salvato'); if (!c) feed('cliente', 'ha aggiunto «' + cur.nome + '» alla review partner', { k: 'cliente', id: cid }); }
      }, 'pri', 'check')]);
  }
  function prospectForm(c) {
    const p = c && c.prospect || { anno: new Date().getFullYear(), potenziale: 0, fattH1: 0 };
    const cliSel = c ? null : selectEl('prCli', [['', '— Scegli il cliente —'], ...[...S.clienti.values()].filter(x => !x.prospect).sort(byName).map(x => [x.id, x.nome])], '');
    const pot = inp('prPot', p.potenziale ?? '', { type: 'number', min: 0, step: 500 }), h1 = inp('prH1', p.fattH1 ?? '', { type: 'number', step: 500 });
    const m = modal(c ? 'Nuovo cliente · ' + c.nome : 'Aggiungi nuovo cliente (prospect)', el('div', { class: 'fgrid' }, cliSel ? fld('Cliente *', cliSel, 'full') : null, fld('Potenziale ' + p.anno + ' (€)', pot), fld('Fatturato H1 (€)', h1)), [
      c ? btn('Togli', async () => { const d = { ...c }; delete d.id; delete d.prospect; if (await put('clienti', c.id, d)) m.close(); }, 'danger', 'trash') : null,
      el('span', { class: 'grow' }), btn('Annulla', () => m.close()),
      btn('Salva', async () => { const cid = c ? c.id : cliSel.value; if (!cid) { toast('Scegli il cliente.', 'bad'); return; } if (await patch('clienti', cid, { prospect: { ...p, potenziale: +pot.value || 0, fattH1: +h1.value || 0, upd: Date.now() } })) m.close(); }, 'pri', 'check')]);
  }
  function projForm(pr) {
    const d = pr || { endUser: '', siTxt: '', si: [], sellIn: null, semaforo: 'neutro', stato: '', anno: new Date().getFullYear() };
    const f = { eu: inp('psEu', d.endUser), si: inp('psSi', d.siTxt, { placeholder: 'Es. Warm Impianti' }), v: inp('psV', d.sellIn ?? '', { type: 'number', step: 1000 }),
      sem: selectEl('psSem', [['neutro', 'Neutro'], ['verde', 'Verde'], ['rosso', 'Rosso']], d.semaforo), st: selectEl('psSt', [['', 'Attivo'], ['IN PAUSA', 'In pausa'], ['CHIUSO', 'Chiuso'], ['PERSO', 'Perso']], d.stato || '') };
    const m = modal(pr ? 'Progetto' : 'Nuovo progetto', el('div', { class: 'fgrid' }, fld('End user / progettista *', f.eu, 'full'), fld('System integrator', f.si, 'full'), fld('Sell-in (€)', f.v), fld('Evidenza', f.sem), fld('Stato', f.st)), [
      pr ? btn('Elimina', async () => { if (await ask('Eliminare il progetto «' + pr.endUser + '»?')) { if (await remove('progettiSO', pr.id)) m.close(); } }, 'danger', 'trash') : null,
      el('span', { class: 'grow' }), btn('Annulla', () => m.close()),
      btn('Salva', async () => {
        if (!f.eu.value.trim()) { toast('Inserisci l\'end user.', 'bad'); return; }
        const siIds = f.si.value.split(/[-–,/]/).map(x => x.trim().toLowerCase()).filter(x => x.length > 2).map(x => [...S.clienti.values()].find(c => c.nome.toLowerCase().includes(x))).filter(Boolean).map(c => c.id);
        const id = pr ? pr.id : newId('progettiSO');
        const o = { ...d, endUser: f.eu.value.trim(), siTxt: f.si.value.trim(), si: [...new Set(siIds)], sellIn: f.v.value === '' ? null : +f.v.value, semaforo: f.sem.value, stato: f.st.value, upd: Date.now(), ordine: d.ordine || (S.progSO.size + 1) };
        delete o.id; if (!pr) { o.at = Date.now(); o.by = S.me; }
        if (await put('progettiSO', id, o)) m.close();
      }, 'pri', 'check')]);
  }

  /* ---------------- vista ---------------- */
  VIEWS.partner = {
    title: () => 'Partner', mount() { this.root = $('#view'); this.update(); },
    update() {
      const r = this.root; const f = S.fPar;
      const all = [...S.clienti.values()].filter(c => c.partner);
      const ql = f.q.toLowerCase();
      const rows = all.filter(c => (!f.cat || (c.partner.catalogo || '').includes(f.cat)) && (!f.tier || c.partner.tier === f.tier) && (!f.acc || (c.partner.accordo || '') === f.acc) && (!ql || (c.nome + ' ' + (c.partner.nomeReview || '') + ' ' + (c.partner.regione || '')).toLowerCase().includes(ql)))
        .sort((a, b) => (ORD[a.partner.tier] ?? 9) - (ORD[b.partner.tier] ?? 9) || (b.partner.target || 0) - (a.partner.target || 0));
      const anno = (all[0] && all[0].partner.anno) || new Date().getFullYear();
      const T = rows.reduce((a, c) => { const so = soTot(c.partner); a.t += c.partner.target || 0; a.s += so; a.h1 += (+c.partner.so?.[0] || 0) + (+c.partner.so?.[1] || 0); if (c.partner.target) { a.tc += c.partner.target; a.sc += so; a.gap += Math.max(0, c.partner.target - so); } return a; }, { t: 0, s: 0, h1: 0, tc: 0, sc: 0, gap: 0 });
      const lastQ = Math.max(0, ...rows.map(c => (c.partner.so || []).reduce((m, v, k) => v != null && v !== '' ? k + 1 : m, 0)));
      const qLab = lastQ ? (lastQ === 2 ? 'H1' : 'Q1–Q' + lastQ) : '';

      const filters = el('div', { class: 'row between' },
        el('div', { class: 'filters' },
          el('input', { type: 'search', placeholder: 'Cerca partner…', value: f.q, oninput: e => { f.q = e.target.value; this.update(); } }),
          selectEl('fpCat', [['', 'Tutti i cataloghi'], ['SOLUTION', 'Solution'], ['PRO', 'Pro']], f.cat, { onchange: e => { f.cat = e.target.value; this.update(); } }),
          selectEl('fpAcc', [['', 'Tutti gli accordi'], ['NUOVO', 'Nuovi'], ['RINNOVATO', 'Rinnovati'], ['SCADUTO', 'Scaduti'], ['NON RINNOVATO', 'Non rinnovati']], f.acc || '', { onchange: e => { f.acc = e.target.value; this.update(); } }),
          selectEl('fpTier', [['', 'Tutti gli stati'], ...TIERS.slice().reverse().map(t => [t, TLAB[t]])], f.tier, { onchange: e => { f.tier = e.target.value; this.update(); } })),
        el('div', { class: 'row' }, btn('Carica report Excel', () => window.hpPartnerImport && hpPartnerImport(), '', 'up'), btn('Aggiungi partner', () => partnerForm(null), 'pri', 'plus')));

      const tile = (t, v, s, x) => el('div', { class: 'kpi' }, el('span', { class: 'eyebrow' }, t), el('span', { class: 'v' }, v), s ? el('span', { class: 's' }, s) : null, x || null);
      const rTot = pct(T.sc, T.tc);
      const kpis = el('div', { class: 'kpis' },
        tile('Partner', String(rows.length), TIERS.slice().reverse().map(t => { const n = rows.filter(c => c.partner.tier === t).length; return n ? n + ' ' + TLAB[t] : null; }).filter(Boolean).join(' · '), el('span', { class: 's' }, ['NUOVO', 'RINNOVATO', 'SCADUTO'].map(a => { const n = rows.filter(c => c.partner.accordo === a).length; const L = { NUOVO: ['nuovo', 'nuovi'], RINNOVATO: ['rinnovato', 'rinnovati'], SCADUTO: ['scaduto', 'scaduti'] }[a]; return n ? n + ' ' + L[n === 1 ? 0 : 1] : null; }).filter(Boolean).join(' · '))),
        tile('Target ' + anno, eur0(T.t), 'Sell-out ' + anno + ' ' + eur0(T.s) + (lastQ && lastQ < 4 ? ' (dati fino a Q' + lastQ + ')' : '')),
        tile('Raggiungimento', rTot == null ? '—' : fN.format(Math.round(rTot)) + '%', 'sui partner con target', achBar(rTot)),
        tile('Gap verso target', eur0(T.gap), 'da recuperare in ' + (lastQ ? 'Q' + (lastQ + 1) + '–Q4' : 'corso d\'anno')));

      // per stato partnership
      const tiers = TIERS.slice().reverse().map(t => { const a = rows.filter(c => c.partner.tier === t); const tg = a.reduce((x, c) => x + (c.partner.target || 0), 0), so = a.reduce((x, c) => x + soTot(c.partner), 0); return [t, a.length, tg, so]; }).filter(x => x[1]);
      const mx = Math.max(1, ...tiers.map(x => Math.max(x[2], x[3])));
      const byTier = el('section', { class: 'panel' }, el('div', { class: 'panel-h' }, el('h3', { text: 'Per stato partnership' }), legendRow()),
        el('div', { class: 'pa-tiers' }, tiers.map(([t, n, tg, so]) => el('div', { class: 'pa-tr hp-click', onclick: () => { f.tier = f.tier === t ? '' : t; this.update(); }, title: 'Filtra ' + TLAB[t] },
          el('div', { class: 'pa-tl' }, tierChip(t), el('small', { class: 'muted' }, n + (n === 1 ? ' partner' : ' partner'))),
          el('div', { class: 'pa-tb' }, el('i', { class: 'tg', style: { width: (tg / mx * 100) + '%' } }), el('i', { class: 'so', style: { width: (so / mx * 100) + '%', '--h': String(hue(pct(so, tg)) ?? 200) } })),
          el('div', { class: 'pa-tv' }, el('b', {}, eurShort(so)), el('small', { class: 'muted' }, ' / ' + eurShort(tg) + (tg ? ' · ' + Math.round(so / tg * 100) + '%' : '')))))));
      // classifica raggiungimento
      const rkBy = f.rk || 'fatt';
      const rkData = rows.map(c => { const cs = comStats(c.id); return { c, so: soTot(c.partner), n: cs.n, val: cs.w + cs.pipe }; })
        .sort((a, b) => rkBy === 'com' ? (b.n - a.n || b.so - a.so) : (b.so - a.so || b.n - a.n));
      const mxSo = Math.max(1, ...rkData.map(x => x.so)), mxN = Math.max(1, ...rkData.map(x => x.n));
      const segB = (k, l) => el('button', { type: 'button', class: rkBy === k ? 'on' : '', 'aria-pressed': String(rkBy === k), onclick: () => { f.rk = k; this.update(); } }, l);
      const rank = el('section', { class: 'panel' },
        el('div', { class: 'panel-h' }, el('div', { class: 'stack', style: 'gap:2px' }, el('h3', { text: 'Fatturato e commesse per cliente' }), el('span', { class: 'hint' }, 'Sell-out totale ' + anno + ' · commesse nel CRM')),
          el('div', { class: 'seg' }, segB('fatt', 'Per fatturato'), segB('com', 'Per commesse'))),
        el('div', { class: 'pa-rank' }, el('div', { class: 'pa-rh' }, el('span', {}, 'Cliente'), el('span', {}, 'Fatturato'), el('span', {}, 'Commesse')),
          rkData.map(x => el('div', { class: 'pa-rr2 hp-click', onclick: () => partnerForm(x.c), title: x.c.nome },
            el('span', { class: 'pa-rn' }, x.c.nome),
            el('div', { class: 'pa-bar' }, el('i', { style: { width: (x.so / mxSo * 100) + '%' } }), el('b', {}, x.so ? eurShort(x.so) : '—')),
            el('div', { class: 'pa-bar n' }, el('i', { style: { width: (x.n / mxN * 100) + '%' } }), el('b', { title: x.n ? 'Valore commesse ' + eur0(x.val) : '' }, x.n ? String(x.n) : '—'))))));

      // tabella partner
      const notes = [];
      const tb = el('tbody', {}, rows.map(c => {
        const p = c.partner; const so = soTot(p); const r = pct(so, p.target); const cs = comStats(c.id);
        const mark = null;
        const q = k => { const v = (p.so || [])[k]; return el('td', { class: 'r num' + (v == null ? ' muted' : '') }, v == null ? '—' : eur0(v)); };
        return el('tr', { class: 'click', onclick: () => partnerForm(c) },
          el('td', { style: 'min-width:150px' }, el('b', {}, c.nome, mark)),
          el('td', { class: 'mono' }, p.codice || '—'), el('td', {}, p.regione || '—'), el('td', { 'data-sort': String(ORD[p.tier] ?? 9) }, tierChip(p.tier)), el('td', {}, p.programma || p.catalogo || '—'), el('td', {}, accChip(p.accordo)),
          el('td', { class: 'r num' }, p.target ? eur0(p.target) : '—'), q(0), q(1), q(2), q(3),
          el('td', { class: 'r num' }, el('b', {}, eur0(so))), el('td', { 'data-sort': r == null ? '-1' : String(r) }, achBar(r)),
          el('td', { class: 'r num' }, p.target ? el('span', { style: { color: so >= p.target ? 'var(--ok)' : '' } }, eur0(p.target - so)) : '—'),
          el('td', { class: 'r num', 'data-sort': String(cs.n) }, cs.n ? el('a', { href: '#', onclick: e => { e.preventDefault(); e.stopPropagation(); hpDrill('Cliente ' + c.nome, x => x.clienteId === c.id); } }, cs.n + ' · ' + eurShort(cs.w + cs.pipe)) : '—'));
      }));
      const table = el('section', { class: 'panel stack' }, el('div', { class: 'panel-h' }, el('h3', { text: 'Review partner ' + anno }), el('span', { class: 'hint' }, 'Clic su una riga per aggiornare target e sell-out')),
        rows.length ? el('div', { class: 'tbl-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ['Partner', 'Codice', 'Regione', 'Stato', 'Programma', 'Accordo', 'Target ' + anno, 'Q1', 'Q2', 'Q3', 'Q4', 'Sell-out ' + anno, 'Ach % vs target', 'Gap vs target', 'Commesse CRM'].map((h, k) => el('th', { class: k >= 6 && k !== 12 ? 'r' : '' }, h)))), tb))
          : emptyBox('Nessun partner', 'Aggiungi i partner dalla lista clienti con target e sell-out per trimestre.', btn('Aggiungi partner', () => partnerForm(null), 'pri', 'plus')));

      // nuovi clienti
      const pros = [...S.clienti.values()].filter(c => c.prospect).sort((a, b) => (b.prospect.potenziale || 0) - (a.prospect.potenziale || 0));
      const PT = pros.reduce((a, c) => (a.p += c.prospect.potenziale || 0, a.h += c.prospect.fattH1 || 0, a), { p: 0, h: 0 });
      const prosP = el('section', { class: 'panel stack' }, el('div', { class: 'panel-h' }, el('div', { class: 'stack', style: 'gap:2px' }, el('h3', { text: 'Nuovi clienti' }), el('span', { class: 'hint' }, 'Potenziale ' + eur0(PT.p) + ' · fatturato H1 ' + eur0(PT.h) + (PT.p ? ' (' + Math.round(PT.h / PT.p * 100) + '%)' : ''))), btn('Aggiungi', () => prospectForm(null), 'sm', 'plus')),
        pros.length ? el('div', { class: 'tbl-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ['Prospect', 'Potenziale ' + anno, 'Fatturato H1', '% sul potenziale'].map((h, k) => el('th', { class: k && k < 3 ? 'r' : '' }, h)))),
          el('tbody', {}, pros.map(c => el('tr', { class: 'click', onclick: () => prospectForm(c) }, el('td', {}, el('b', {}, c.nome)), el('td', { class: 'r num' }, eur0(c.prospect.potenziale)), el('td', { class: 'r num' }, eur0(c.prospect.fattH1)), el('td', { 'data-sort': String(pct(c.prospect.fattH1, c.prospect.potenziale) ?? -1) }, achBar(pct(c.prospect.fattH1, c.prospect.potenziale)))))))) : emptyBox('Nessun nuovo cliente', 'Aggiungi i prospect con potenziale e fatturato.'));

      // progetti
      const pj = [...S.progSO.values()].sort((a, b) => (a.ordine || 0) - (b.ordine || 0));
      const pjTot = pj.reduce((a, x) => a + (x.stato ? 0 : +x.sellIn || 0), 0);
      const semC = { verde: 'var(--ok)', rosso: 'var(--accent)', neutro: 'var(--ink)' };
      const projP = el('section', { class: 'panel stack' }, el('div', { class: 'panel-h' }, el('div', { class: 'stack', style: 'gap:2px' }, el('h3', { text: 'Progetti' }), el('span', { class: 'hint' }, 'Sell-in totale ' + eur0(pjTot) + ' · ' + pj.length + ' progetti')), btn('Nuovo progetto', () => projForm(null), 'sm', 'plus')),
        pj.length ? el('div', { class: 'tbl-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ['End user / progettista', 'System integrator', 'Sell-in'].map((h, k) => el('th', { class: k === 2 ? 'r' : '' }, h)))),
          el('tbody', {}, pj.map(x => el('tr', { class: 'click', onclick: () => projForm(x) }, el('td', {}, x.endUser),
            el('td', {}, (x.si || []).length ? (x.si || []).map(id => S.clienti.get(id)).filter(Boolean).map((c, k) => [k ? ' · ' : '', el('a', { href: '#', onclick: e => { e.preventDefault(); e.stopPropagation(); go('clienti', c.id); } }, c.nome)]).flat().concat(x.siTxt && x.siTxt !== '—' && /TIM|W\b/.test(x.siTxt) ? [el('small', { class: 'muted' }, ' (' + x.siTxt + ')')] : []) : (x.siTxt || '—')),
            el('td', { class: 'r num', 'data-sort': String(x.sellIn ?? -1) }, x.stato ? el('span', { class: 'pill', style: '--c:var(--ink-3)' }, x.stato) : el('b', { style: { color: semC[x.semaforo] || '' } }, euro(x.sellIn)))))))) : emptyBox('Nessun progetto', 'Aggiungi i progetti seguiti con end user, system integrator e sell-in.'));

      r.replaceChildren(...[dbGate(), loading(), filters, kpis, el('div', { class: 'grid2' }, byTier, rank), table, el('div', { class: 'grid2' }, prosP, projP)].filter(Boolean));
    }
  };
  function legendRow() { return el('span', { class: 'row', style: 'gap:10px;font-size:.75rem' }, el('span', { class: 'row', style: 'gap:4px' }, el('i', { class: 'pa-lg tg' }), 'Target'), el('span', { class: 'row', style: 'gap:4px' }, el('i', { class: 'pa-lg so' }), 'Sell-out')); }

  // la scheda cliente mostra il riquadro partner e i dati anagrafici aggiuntivi
  const EXTRA = [['regione', 'Regione'], ['provincia', 'Provincia'], ['tipologia', 'Tipologia'], ['fatturatoAnno', 'Fatturato annuo'], ['fatturatoHik', 'Fatturato Hikvision'], ['cosaInstalla', 'Cosa installa'], ['distributore', 'Distributore'], ['titolare', 'Referente è titolare'], ['dataAdesione', 'Adesione programma']];
  function extraForm(c) {
    const f = Object.fromEntries(EXTRA.map(([k]) => [k, inp('x_' + k, c[k] || '')]));
    const m = modal('Anagrafica partner · ' + c.nome, el('div', { class: 'fgrid' }, EXTRA.map(([k, l]) => fld(l, f[k]))), [el('span', { class: 'grow' }), btn('Annulla', () => m.close()),
      btn('Salva', async () => { const up = { upd: Date.now() }; EXTRA.forEach(([k]) => { up[k] = f[k].value.trim(); }); if (await patch('clienti', c.id, up)) m.close(); }, 'pri', 'check')]);
  }
  const cdOrig = cliDetail.update;
  cliDetail.update = function () {
    const out = cdOrig.apply(this, arguments);
    try {
      const c = S.clienti.get(S.sel); const r = this.root;
      if (!c || !r) return out;
      r.querySelector('#hpPartnerBox')?.remove();
      const p = c.partner; const has = p || EXTRA.some(([k]) => c[k]);
      if (!has) return out;
      const dd = (l, v) => v == null || v === '' ? null : [el('dt', {}, l), el('dd', {}, v)];
      const so = p ? (p.so || []).reduce((a, b) => a + (+b || 0), 0) : 0;
      const box = el('section', { class: 'panel', id: 'hpPartnerBox' },
        el('div', { class: 'panel-h' }, el('h3', { text: p ? 'Partner ' + (p.anno || '') : 'Anagrafica aggiuntiva' }), el('div', { class: 'row' }, btn('Anagrafica', () => extraForm(c), 'sm', 'edit'), p ? btn('Target e sell-out', () => partnerForm(c), 'sm', 'edit') : null)),
        el('dl', { class: 'dl' },
          p ? [dd('Codice partner', p.codice ? el('b', { class: 'mono' }, p.codice) : null), dd('Programma', p.programma || p.catalogo), dd('Livello', tierChip(p.tier)), dd('Accordo ' + (p.anno || ''), accChip(p.accordo)), dd('Contratto', p.statoContratto), dd('Target', p.target ? eur0(p.target) : null), dd('Sell-out', eur0(so) + (p.target ? ' · ' + Math.round(so / p.target * 100) + '%' : ''))] : null,
          EXTRA.map(([k, l]) => dd(l, c[k])).filter(Boolean)));
      const head = r.firstElementChild;
      if (head && head.nextSibling) r.insertBefore(box, head.nextSibling); else r.appendChild(box);
    } catch (e) { console.error(e); }
    return out;
  };
  // la scheda cliente mostra il riquadro partner
  try { renderNav(); } catch (e) { }
})();
