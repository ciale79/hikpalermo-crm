/* HIK PALERMO — ProAV · Ordine Sell In: ordini di forecast per i distributori, nel formato dell'offerta.
   Gli ordini stanno nella raccolta delle offerte con tipo «sellin» (S.sellin) e si aprono con lo stesso editor e la stessa esportazione;
   stati: Forecast → Confermato → Ordinato (o Annullato), con il mese di consegna previsto. Nel cruscotto: riquadro «Sell In distributori». */
(function () {
  'use strict';
  if (typeof HP_PAV === 'undefined' || !HP_PAV) return;
  ICONS.cart = 'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9 20.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2M17 20.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2';
  if (!NAV.some(n => n[0] === 'sellin')) { const i = NAV.findIndex(n => n[0] === 'offerte'); NAV.splice(i < 0 ? 1 : i + 1, 0, ['sellin', 'Ordine Sell In', 'cart']); }
  S.sellin = S.sellin || new Map();
  S.fSI = S.fSI || { q: '', st: '', cli: '', y: new Date().getFullYear() };
  const list = () => [...(S.sellin || new Map()).values()];
  const cliN = id => (S.clienti.get(id) || {}).nome || '—';
  const mLab = m => { if (!m) return '—'; const [y, mm] = m.split('-').map(Number); return new Date(y, mm - 1, 1).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' }); };
  const yOf = o => +(String(o.mese || o.data || '').slice(0, 4)) || new Date(o.at || Date.now()).getFullYear();
  const qOf = o => { const m = +(String(o.mese || o.data || '').slice(5, 7)) || 1; return Math.floor((m - 1) / 3) + 1; };
  const chip = st => el('span', { class: 'hp-sist', style: { '--c': (typeof SISTCOL !== 'undefined' && SISTCOL[st]) || 'var(--ink-3)' } }, st || '—');
  const newOrder = cid => offerEditor({ tipo: 'sellin', righe: [], clienteId: cid || null });
  window.hpNewSellIn = newOrder;

  VIEWS.sellin = {
    title: () => 'Ordine Sell In',
    mount() { this.root = $('#view'); this.update(); },
    update() {
      const r = this.root; if (!r) return; const f = S.fSI;
      const all = list(); const years = [...new Set([new Date().getFullYear(), ...all.map(yOf)])].sort((a, b) => b - a);
      const inY = all.filter(o => !f.y || yOf(o) === +f.y);
      const ql = f.q.toLowerCase();
      const rows = inY.filter(o => (!f.st || o.stato === f.st) && (!f.cli || o.clienteId === f.cli) && (!ql || [o.numero, o.titolo, cliN(o.clienteId)].join(' ').toLowerCase().includes(ql)))
        .sort((a, b) => String(b.mese || '').localeCompare(String(a.mese || '')) || (b.upd || b.at || 0) - (a.upd || a.at || 0));
      const sum = st => inY.filter(o => o.stato === st).reduce((t, o) => t + (+o.totN || 0), 0);
      const kpi = (l, v, st) => el('div', { class: 'kpi hp-click' + (f.st === st ? ' on' : ''), role: 'button', tabindex: '0', title: 'Filtra: ' + l, onclick: () => { f.st = f.st === st ? '' : st; this.update(); } }, el('span', { class: 'eyebrow' }, l), el('span', { class: 'v' }, eur0(v)), el('span', { class: 's' }, (n => n + (n === 1 ? ' ordine · ' : ' ordini · '))(inY.filter(o => o.stato === st).length) + '' + (f.y || 'tutti gli anni')));
      const cliIds = [...new Set(all.map(o => o.clienteId).filter(Boolean))];
      const qIn = el('input', { type: 'search', placeholder: 'Cerca numero, distributore, titolo…', value: f.q, style: 'max-width:260px', oninput: e => { f.q = e.target.value; clearTimeout(qIn._t); qIn._t = setTimeout(() => { this.update(); const n = r.querySelector('input[type=search]'); if (n) { n.focus(); n.setSelectionRange(f.q.length, f.q.length); } }, 200); } });
      const sel = (opts, v, on) => el('select', { style: 'width:auto', onchange: e => on(e.target.value) }, opts.map(([k, l]) => el('option', { value: k, selected: String(k) === String(v) }, l)));
      const tools = el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, qIn,
        sel([['', 'Tutti gli anni'], ...years.map(y => [y, String(y)])], f.y, v => { f.y = v ? +v : ''; this.update(); }),
        sel([['', 'Tutti gli stati'], ...SIST.map(x => [x, x])], f.st, v => { f.st = v; this.update(); }),
        sel([['', 'Tutti i distributori'], ...cliIds.map(id => [id, cliN(id)]).sort((a, b) => a[1].localeCompare(b[1], 'it'))], f.cli, v => { f.cli = v; this.update(); }));
      const head = el('div', { class: 'row between', style: 'flex-wrap:wrap;gap:8px' }, el('div', { class: 'stack', style: 'gap:2px' }, el('h2', { style: 'margin:0' }, 'Ordine Sell In'), el('span', { class: 'hint' }, 'Ordini di forecast per i distributori ProAV, con lo stesso formato dell\'offerta')), btn('Nuovo ordine', () => newOrder(), 'pri', 'plus'));
      const tbl = rows.length ? el('div', { class: 'tbl-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ['Numero', 'Distributore', 'Titolo', 'Consegna prevista', 'Stato', 'Righe', 'Valore netto', 'Aggiornato'].map((h, i) => el('th', { class: i >= 5 && i <= 6 ? 'r' : '' }, h)))),
        el('tbody', {}, rows.map(o => el('tr', { class: 'click', onclick: () => offerEditor(o) },
          el('td', { class: 'mono' }, o.numero || '—'), el('td', {}, el('b', {}, cliN(o.clienteId))), el('td', {}, o.titolo || ''), el('td', {}, mLab(o.mese)), el('td', {}, chip(o.stato)),
          el('td', { class: 'r num' }, String((o.righe || []).length)), el('td', { class: 'r num' }, el('b', {}, eur0(+o.totN || 0))), el('td', { class: 'hint' }, fD(o.upd || o.at)))))))
        : emptyBox(all.length ? 'Nessun ordine con questi filtri' : 'Nessun ordine Sell In', all.length ? 'Cambia i filtri qui sopra.' : 'Crea il primo ordine di forecast per un distributore ProAV.', btn('Nuovo ordine', () => newOrder(), 'pri sm', 'plus'));
      r.replaceChildren(...[dbGate(), loading(), head, el('div', { class: 'kpis' }, kpi('Forecast', sum('Forecast'), 'Forecast'), kpi('Confermato', sum('Confermato'), 'Confermato'), kpi('Ordinato', sum('Ordinato'), 'Ordinato')), el('section', { class: 'panel' }, tools, el('div', { style: 'margin-top:10px' }, tbl))].filter(Boolean));
    }
  };

  /* riquadro del cruscotto: forecast, confermato e ordinato del trimestre in corso (per mese di consegna) e classifica dei distributori */
  window.hpSellInPanel = function () {
    const now = new Date(); const Y = now.getFullYear(), Q = Math.floor(now.getMonth() / 3) + 1; const mode = S.dashSI || 'q';
    const pool = list().filter(o => o.stato !== 'Annullato' && yOf(o) === Y && (mode !== 'q' || qOf(o) === Q));
    const tot = st => pool.filter(o => o.stato === st).reduce((t, o) => t + (+o.totN || 0), 0);
    const F = tot('Forecast'), C = tot('Confermato'), O = tot('Ordinato'), T = F + C + O;
    const by = new Map(); for (const o of pool) { const x = by.get(o.clienteId) || { id: o.clienteId, F: 0, C: 0, O: 0, n: 0 }; x[o.stato === 'Ordinato' ? 'O' : o.stato === 'Confermato' ? 'C' : 'F'] += +o.totN || 0; x.n++; by.set(o.clienteId, x); }
    const rows = [...by.values()].sort((a, b) => (b.F + b.C + b.O) - (a.F + a.C + a.O)).slice(0, 10); const mx = Math.max(1, ...rows.map(x => x.F + x.C + x.O));
    const segB = (k, l) => el('button', { type: 'button', class: mode === k ? 'on' : '', 'aria-pressed': String(mode === k), onclick: () => { S.dashSI = k; VIEWS.dash.update(); } }, l);
    const tile = (l, v, c) => el('div', {}, el('span', { class: 'eyebrow' }, l), el('b', { class: 'num', style: c ? { color: c } : null }, eur0(v)));
    const head = el('div', { class: 'panel-h' }, el('div', { class: 'stack', style: 'gap:2px' }, el('h3', { text: 'Sell In distributori' }), el('span', { class: 'hint' }, (mode === 'q' ? 'Q' + Q + ' ' + Y : 'Anno ' + Y) + ' · per mese di consegna previsto · ' + pool.length + (pool.length === 1 ? ' ordine' : ' ordini'))), el('div', { class: 'row', style: 'gap:6px' }, btn('Nuovo ordine', () => newOrder(), 'sm', 'plus'), btn('Apri', () => go('sellin'), 'sm ghost')));
    if (!list().length) return el('section', { class: 'panel' }, head, emptyBox('Nessun ordine Sell In', 'Crea un ordine di forecast per un distributore ProAV: qui vedrai forecast, confermato e ordinato.', btn('Nuovo ordine', () => newOrder(), 'pri sm', 'plus')));
    return el('section', { class: 'panel' }, head, el('div', { class: 'seg', style: 'margin:2px 0 10px' }, segB('q', 'Trimestre in corso'), segB('y', 'Anno')),
      el('div', { class: 'hp-kamtot', style: 'grid-template-columns:repeat(4,minmax(0,1fr))' }, tile('Forecast', F, 'var(--info)'), tile('Confermato', C, 'var(--warn)'), tile('Ordinato', O, 'var(--ok)'), tile('Totale', T)),
      rows.length ? el('div', { class: 'hb hp-kamhb', style: 'margin-top:10px' }, rows.map((x, k) => { const c = S.clienti.get(x.id) || {}; const t = x.F + x.C + x.O;
        return el('div', { class: 'hr hp-click', title: 'Ordini Sell In di ' + (c.nome || ''), onclick: () => { S.fSI = { ...S.fSI, cli: x.id, st: '', y: Y }; go('sellin'); } },
          el('span', { class: 'hn', title: c.nome || '' }, (k + 1) + '. ' + (c.nome || '—'), ' ', el('small', { class: 'hint' }, x.n + (x.n === 1 ? ' ordine' : ' ordini'))),
          el('div', { class: 'ht hp-sibar', title: 'Ordinato ' + eur0(x.O) + ' · confermato ' + eur0(x.C) + ' · forecast ' + eur0(x.F) }, el('i', { style: { width: (x.O / mx * 100) + '%', background: 'var(--ok)' } }), el('i', { style: { width: (x.C / mx * 100) + '%', background: 'var(--warn)' } }), el('i', { style: { width: (x.F / mx * 100) + '%', background: 'var(--info)' } })),
          el('span', { class: 'num hv', style: 'text-align:right' }, eur0(t))); })) : el('p', { class: 'hint', style: 'margin-top:8px' }, 'Nessun ordine in questo periodo.'),
      el('div', { class: 'row', style: 'gap:12px;margin-top:8px;font-size:.75rem' }, ...[['Ordinato', 'var(--ok)'], ['Confermato', 'var(--warn)'], ['Forecast', 'var(--info)']].map(([l, c]) => el('span', { class: 'row', style: 'gap:4px' }, el('i', { class: 'hp-mdot', style: { background: c } }), l))));
  };
  if (!document.getElementById('hpSiCss')) document.head.append(el('style', { id: 'hpSiCss' }, '.hp-sist{font-size:.72rem;font-weight:600;padding:2px 8px;border-radius:10px;color:var(--c);background:color-mix(in srgb,var(--c) 12%,transparent);border:1px solid color-mix(in srgb,var(--c) 35%,transparent);white-space:nowrap}.hp-sibar{display:flex;overflow:hidden}.hp-sibar i{height:100%;display:block}.kpi.hp-click.on{outline:2px solid var(--accent)}'));
})();
