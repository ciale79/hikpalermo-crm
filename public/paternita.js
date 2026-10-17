/* HIK PALERMO — «Paternità Team Sicilia»: progetti fatturati fuori area ma riconosciuti alla Sicilia.
   Raccolta «paternita»: { rif, cliente, importo, anno, periodo, commessaId?, note } — totali calcolabili con o senza. */
(function () {
  'use strict';
  S.pat = new Map();
  claude.use('db').then(db => { if (db) db.collection('paternita').onSnapshot(s => { const m = new Map(); s.docs.forEach(d => m.set(d.id, { id: d.id, ...d.data() })); S.pat = m; if (['dash', 'fatt'].includes(S.view) && VIEWS[S.view]) VIEWS[S.view].update(); }, () => { }); });

  // includi / escludi dai totali (preferenza di chi guarda, ricordata nel browser)
  let on = true; try { on = localStorage.getItem('hp_patOn') !== '0'; } catch (e) { }
  window.hpPatOn = () => on;
  window.hpPatToggle = function (rerender) {
    const cb = el('input', { type: 'checkbox', checked: on, onchange: e => { on = e.target.checked; try { localStorage.setItem('hp_patOn', on ? '1' : '0'); } catch (x) { } rerender && rerender(); } });
    return el('label', { class: 'hp-pattog', title: 'Somma ai totali i progetti con Paternità Team Sicilia' }, cb, 'Includi Paternità Team Sicilia nei totali');
  };

  // abbinamento alle commesse: parole significative del riferimento + cliente
  const STOP = new Set('regione sicilia sicily system integrator integratore spa srl srls snc sas lotto isola istituto tratta per del della delle dei di da con the and rfq progetto fornitura impianto'.split(' '));
  const words = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
  const comp = x => String(x || '').toLowerCase().replace(/\b(s\.?\s?r\.?\s?l\.?s?|s\.?\s?p\.?\s?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|unipersonale)\s*$/g, '').replace(/[^a-z0-9]/g, '');
  const sameCli = (a, b) => { const x = comp(a), y = comp(b); return !!x && !!y && x.length > 3 && y.length > 3 && (x === y || x.startsWith(y) || y.startsWith(x)); };
  const cliOf = name => [...S.clienti.values()].find(c => sameCli(c.nome, name)) || null;
  function comFor(p) {
    if (p.commessaId === '-') return null;
    if (p.commessaId) return S.commesse.get(p.commessaId) || null;
    const ws = [...new Set(words(p.rif))]; if (!ws.length) return null;
    let best = null, bs = 0;
    for (const c of S.commesse.values()) {
      const hay = ' ' + [c.nome, c.titolo, c.codice, c.rifGara, c.citta].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ') + ' ';
      const n = ws.filter(w => hay.includes(' ' + w + ' ') || (w.length >= 5 && hay.includes(w))).length;
      const cl = S.clienti.get(c.clienteId); const cc = cl ? comp(cl.nome) : '';
      const cm = !!cl && (sameCli(cl.nome, p.cliente) || (cc.length > 4 && comp(p.rif).includes(cc))); // cliente fatturato o system integrator citato nel riferimento
      const val = +c.valore || 0, imp = +p.importo || 0, near = val > 0 && imp > 0 && Math.abs(val - imp) / imp < 0.02;
      const sc = n + (cm ? 1.5 : 0) + (near ? 2 : 0) + (/^(acq|exec|chiusa)$/.test(c.stato || '') ? 0.3 : 0);
      if ((n >= 2 || (n >= 1 && cm)) && (sc > bs || (sc === bs && (c.at || 0) > (best.at || 0)))) { best = c; bs = sc; }
    }
    return best;
  }
  window.hpPatRows = function (anno) {
    return [...S.pat.values()].filter(p => !anno || !p.anno || +p.anno === +anno)
      .sort((a, b) => (+a.anno || 0) - (+b.anno || 0) || String(a.periodo || '').localeCompare(String(b.periodo || '')) || (a.ord || 0) - (b.ord || 0) || (a.at || 0) - (b.at || 0))
      .map(p => ({ ...p, v: +p.importo || 0, com: comFor(p), cli: cliOf(p.cliente) }));
  };
  window.hpPatTot = anno => window.hpPatRows(anno).reduce((t, p) => t + p.v, 0);
  const openP = p => { if (p.com) go('commesse', p.com.id); else if (p.cli) go('clienti', p.cli.id); else patForm(p); };

  // riquadro collassabile, chiuso di default (lo stato aperto/chiuso resta finché non ricarichi la pagina)
  const openSt = { dash: false, fatt: false };
  function wrap(ctx, h, ...body) {
    const b = el('div', { class: 'stack hp-patbody', style: 'gap:6px' }, ...body); b.hidden = !openSt[ctx];
    const box = el('div', { class: 'hp-pat stack' + (openSt[ctx] ? ' open' : '') }, h, b);
    const tog = () => { openSt[ctx] = !openSt[ctx]; b.hidden = !openSt[ctx]; box.classList.toggle('open', openSt[ctx]); h.setAttribute('aria-expanded', String(openSt[ctx])); };
    h.addEventListener('click', tog); h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } });
    return box;
  }
  // elenco (cruscotto: compatto · fatturato: tabella con modifica)
  window.hpPatBlock = function (anno, opt = {}) {
    const rows = window.hpPatRows(anno); const tot = rows.reduce((t, p) => t + p.v, 0);
    const per = [...new Set(rows.map(p => p.periodo).filter(Boolean))];
    const ctx = opt.edit ? 'fatt' : 'dash';
    const chev = el('span', { class: 'hp-patchev', 'aria-hidden': 'true' }); chev.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const lab = el('span', { class: 'hp-patlab' }, el('span', { class: 'show' }, 'Mostra progetti'), el('span', { class: 'hide' }, 'Nascondi'), el('span', { class: 'ar', 'aria-hidden': 'true' }, '▾'));
    const h = el('div', { class: 'row hp-pathead', role: 'button', tabindex: '0', 'aria-expanded': String(!!openSt[ctx]), title: 'Mostra / nascondi i progetti', style: 'gap:8px;flex-wrap:wrap;align-items:center' },
      chev, el('h4', { class: 'hp-path' }, el('span', { class: 'hp-patdot' }), 'Paternità Team Sicilia'), rows.length ? el('b', { class: 'num hp-pattot' }, eur0(tot)) : null,
      el('span', { class: 'hint' }, rows.length ? rows.length + (rows.length === 1 ? ' progetto' : ' progetti') + (per.length ? ' · ' + per.join(', ') + (anno ? ' ' + anno : '') : '') + (opt.edit ? ' · fatturati fuori area, riconosciuti alla Sicilia' : '') : 'Nessun progetto per il ' + (anno || 'periodo')),
      el('span', { class: 'grow' }), rows.length ? lab : null, opt.edit ? btn('Aggiungi progetto', e => { e.stopPropagation(); patForm({ anno: anno || new Date().getFullYear(), periodo: '', area: 'SICILIA' }); }, 'sm ghost', 'plus') : null);
    if (!rows.length) return wrap(ctx, h);
    const link = p => p.com ? el('span', { class: 'pill', style: '--c:var(--info)', title: 'Apri la commessa «' + p.com.nome + '»' }, ic('brief', 12), ' Commessa') : null;
    if (!opt.edit) {
      const list = el('div', { class: 'hp-patlist' }, rows.map(p => el('div', { class: 'hp-patrow hp-click', title: p.com ? 'Apri la commessa «' + p.com.nome + '»' : p.cli ? 'Apri la scheda cliente' : 'Modifica', onclick: () => openP(p) },
        el('span', { class: 'n' }, el('b', {}, p.rif), el('small', { class: 'hint' }, p.cliente + (p.periodo ? ' · ' + p.periodo : ''))), link(p), el('b', { class: 'num' }, eur0(p.v)))));
      return wrap(ctx, h, list, el('div', { class: 'hp-patrow tot' }, el('span', { class: 'n' }, el('b', {}, 'Totale Paternità Team Sicilia')), el('b', { class: 'num', style: 'color:var(--violet)' }, eur(tot))));
    }
    const tb = el('tbody', {}, rows.map(p => el('tr', { class: 'hp-click', onclick: () => openP(p) },
      el('td', {}, el('b', {}, p.rif), p.note ? el('div', { class: 'hint' }, p.note) : null),
      el('td', {}, p.cli ? el('a', { href: '#', onclick: e => { e.preventDefault(); e.stopPropagation(); go('clienti', p.cli.id); } }, p.cliente) : p.cliente),
      el('td', { class: 'muted', style: 'white-space:nowrap' }, [p.periodo, p.anno].filter(Boolean).join(' ')),
      el('td', {}, p.com ? el('a', { href: '#', onclick: e => { e.preventDefault(); e.stopPropagation(); go('commesse', p.com.id); } }, ic('brief', 14), ' ', p.com.nome) : el('span', { class: 'muted' }, '—')),
      el('td', { class: 'r num', 'data-sort': String(p.v) }, el('b', {}, eur(p.v))),
      el('td', { class: 'r' }, el('button', { type: 'button', class: 'icon-btn', title: 'Modifica', 'aria-label': 'Modifica ' + p.rif, onclick: e => { e.stopPropagation(); patForm(p); } }, ic('edit', 16))))));
    const tf = el('tfoot', {}, el('tr', { class: 'hp-totrow' }, el('td', {}, el('b', {}, 'Totale')), el('td', {}), el('td', {}), el('td', { class: 'muted' }, rows.length + ' progetti'), el('td', { class: 'r num' }, el('b', { style: 'color:var(--violet)' }, eur(tot))), el('td', {})));
    return wrap(ctx, h, el('div', { class: 'tbl-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ['Riferimento progetto', 'Cliente', 'Periodo', 'Commessa', 'Netto fatturato', ''].map((x, i) => el('th', { class: i === 4 ? 'r' : '' }, x)))), tb, tf)),
      el('p', { class: 'hint' }, 'Clic su una riga per aprire la commessa collegata (o la scheda cliente). La commessa viene riconosciuta in automatico dal riferimento progetto; puoi sceglierla tu dalla matita.'));
  };

  function patForm(p) {
    const isNew = !p.id;
    const i = (k, a = {}) => el('input', { type: 'text', value: p[k] == null ? '' : p[k], ...a });
    const rif = i('rif', { required: true }), cli = i('cliente'), imp = el('input', { type: 'number', step: '0.01', min: '0', value: p.importo == null ? '' : p.importo, inputmode: 'decimal' });
    const anno = el('input', { type: 'number', value: p.anno || new Date().getFullYear(), min: 2000, max: 2100 }), per = i('periodo', { placeholder: 'es. Q3' }), note = i('note');
    const auto = p.id ? comFor({ ...p, commessaId: '' }) : null;
    const coms = [...S.commesse.values()].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it'));
    const sel = el('select', {}, el('option', { value: '', selected: !p.commessaId }, 'Automatica' + (auto ? ' (' + auto.nome + ')' : ' (nessuna trovata)')), el('option', { value: '-', selected: p.commessaId === '-' }, 'Nessuna commessa'),
      coms.map(c => el('option', { value: c.id, selected: p.commessaId === c.id }, c.nome + (S.clienti.get(c.clienteId) ? ' · ' + S.clienti.get(c.clienteId).nome : ''))));
    const body = el('div', { class: 'stack' }, fld('Riferimento progetto', rif), el('div', { class: 'grid2' }, fld('Cliente (fatturato a)', cli), fld('Netto fatturato (€)', imp)),
      el('div', { class: 'grid2' }, fld('Anno', anno), fld('Periodo', per)), fld('Commessa collegata', sel), fld('Note', note));
    const m = modal((isNew ? 'Nuovo progetto' : 'Modifica progetto') + ' · Paternità Team Sicilia', body, [
      !isNew ? btn('Elimina', async () => { if (!await ask('Eliminare «' + p.rif + '» dalla Paternità Team Sicilia?')) return; if (await remove('paternita', p.id)) { m.close(); toast('Progetto eliminato'); } }, 'ghost', 'trash') : null,
      el('span', { class: 'grow' }), btn('Annulla', () => m.close()),
      btn('Salva', async () => {
        const v = parseFloat(String(imp.value).replace(',', '.'));
        if (!rif.value.trim()) { toast('Indica il riferimento progetto.', 'bad'); rif.focus(); return; }
        if (!(v >= 0)) { toast('Indica l\'importo.', 'bad'); imp.focus(); return; }
        const o = { rif: rif.value.trim(), cliente: cli.value.trim(), importo: Math.round(v * 100) / 100, anno: +anno.value || new Date().getFullYear(), periodo: per.value.trim(), note: note.value.trim(), commessaId: sel.value, area: 'SICILIA', upd: Date.now(), by: S.me || '' };
        const id = p.id || ('pat_' + Date.now().toString(36));
        if (await put('paternita', id, { ...(isNew ? { at: Date.now(), ord: 1e9 } : { at: p.at || Date.now(), ord: p.ord || 0 }), ...o })) { m.close(); toast(isNew ? 'Progetto aggiunto' : 'Progetto aggiornato'); }
      }, 'pri', 'check')], { wide: true });
    setTimeout(() => rif.focus(), 30);
  }
  window.hpPatForm = patForm;
})();
