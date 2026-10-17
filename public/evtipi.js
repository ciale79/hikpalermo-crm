/* HIK PALERMO — gestione dei tipi di appuntamento: aggiungi, rinomina, colore, ordina, elimina (spostando gli appuntamenti) */
(function () {
  'use strict';
  const PAL = [['var(--t-platinum)', 'Petrolio'], ['var(--info)', 'Blu'], ['var(--ok)', 'Verde'], ['var(--violet)', 'Viola'], ['var(--warn)', 'Ambra'], ['var(--accent)', 'Rosso'], ['var(--t-gold)', 'Oro'], ['var(--t-diamond)', 'Azzurro'], ['var(--bad)', 'Bordeaux'], ['var(--ink-3)', 'Grigio']];
  const slug = l => (String(l).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'tipo') + '_' + Date.now().toString(36).slice(-4);

  window.hpEvTypes = function (onSaved) {
    const adm = isAdmin();
    const cnt = new Map(); for (const e of S.eventi.values()) cnt.set(e.tipo, (cnt.get(e.tipo) || 0) + 1);
    const rows = ETIPI.map(([k, l]) => ({ k, l, c: evColor(k), del: false, to: '' }));
    const list = el('div', { class: 'stack', style: 'gap:6px' });
    const newIn = el('input', { type: 'text', placeholder: 'Nuovo tipo (es. Formazione, Webinar…)', 'aria-label': 'Nuovo tipo di appuntamento', style: 'max-width:300px' });
    const add = () => { const v = newIn.value.trim(); if (!v) return; if (rows.some(r => !r.del && r.l.toLowerCase() === v.toLowerCase())) { toast('Tipo già presente.', 'bad'); return; } const used = new Set(rows.map(r => r.c)); rows.push({ k: null, l: v, c: (PAL.find(p => !used.has(p[0])) || PAL[rows.length % PAL.length])[0], del: false, to: '', nuovo: true }); newIn.value = ''; draw(); newIn.focus(); };
    newIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const swatch = r => {
      const b = el('button', { type: 'button', class: 'hp-evsw', style: '--c:' + r.c, title: 'Colore', 'aria-label': 'Colore di ' + r.l, disabled: !adm });
      b.onclick = () => {
        const pop = el('div', { class: 'hp-evpal' }, PAL.map(([c, n]) => el('button', { type: 'button', class: 'hp-evsw' + (c === r.c ? ' on' : ''), style: '--c:' + c, title: n, 'aria-label': n, onclick: () => { r.c = c; draw(); } })));
        b.after(pop); setTimeout(() => document.addEventListener('click', function cl(ev) { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('click', cl, true); } }, true), 0);
      };
      return b;
    };
    const draw = () => {
      const live = rows.filter(r => !r.del);
      list.replaceChildren(...rows.map((r, i) => {
        const n = r.k ? (cnt.get(r.k) || 0) : 0;
        if (r.del) {
          const opts = live.map(x => [x.k || ('new:' + x.l), x.l]);
          return el('div', { class: 'hp-catrow del' },
            el('span', { class: 'grow' }, el('s', {}, r.l), n ? el('span', { class: 'hint' }, ' · ' + n + (n === 1 ? ' appuntamento' : ' appuntamenti') + ' da spostare in ') : el('span', { class: 'hint' }, ' · verrà eliminato')),
            n ? el('select', { 'aria-label': 'Sposta gli appuntamenti di ' + r.l, onchange: e => { r.to = e.target.value; } }, opts.map(([v, l], j) => el('option', { value: v, selected: r.to ? v === r.to : j === 0 }, l))) : null,
            btn('Annulla', () => { r.del = false; draw(); }, 'sm ghost'));
        }
        return el('div', { class: 'hp-catrow' },
          el('div', { class: 'row', style: 'gap:2px;flex-wrap:nowrap' },
            el('button', { type: 'button', class: 'icon-btn', title: 'Sposta su', 'aria-label': 'Sposta su ' + r.l, disabled: i === 0 || !adm, onclick: () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; draw(); } }, '↑'),
            el('button', { type: 'button', class: 'icon-btn', title: 'Sposta giù', 'aria-label': 'Sposta giù ' + r.l, disabled: i === rows.length - 1 || !adm, onclick: () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; draw(); } }, '↓')),
          el('span', { style: 'position:relative' }, swatch(r)),
          el('input', { type: 'text', value: r.l, disabled: !adm, 'aria-label': 'Nome del tipo', class: 'grow', oninput: e => { r.l = e.target.value; } }),
          el('span', { class: 'pill', style: '--c:' + r.c }, r.l || '—'),
          el('span', { class: 'hint', style: 'white-space:nowrap;min-width:96px;text-align:right' }, r.nuovo ? 'nuovo' : n + (n === 1 ? ' appuntamento' : ' appuntamenti')),
          adm ? el('button', { type: 'button', class: 'icon-btn', title: 'Elimina', 'aria-label': 'Elimina ' + r.l, disabled: live.length <= 1 && !r.del, onclick: () => { if (live.length <= 1) return; if (r.nuovo) rows.splice(i, 1); else { r.del = true; r.to = ''; } draw(); } }, ic('trash', 16)) : null);
      }));
    };
    draw();
    const body = el('div', { class: 'stack' },
      el('p', { class: 'hint' }, adm ? 'Rinomina, scegli il colore, riordina o elimina i tipi di appuntamento. Se elimini un tipo già usato, i suoi appuntamenti passano al tipo che scegli.' : 'Solo un amministratore può modificare i tipi di appuntamento.'),
      list, adm ? el('div', { class: 'row' }, newIn, btn('Aggiungi', add, 'sm', 'plus')) : null);
    const m = modal('Tipi di appuntamento', body, [adm ? el('a', { href: '#', class: 'hint', onclick: async e => { e.preventDefault(); if (!await ask('Ripristinare i tipi predefiniti? Gli appuntamenti con tipi non più presenti passano a «Appuntamento».', 'Ripristina')) return; const keep = new Set(ETIPI_DEF.map(x => x[0])); for (const ev of S.eventi.values()) if (!keep.has(ev.tipo)) await patch('eventi', ev.id, { tipo: 'appuntamento' }); if (await put('config', 'app', { ...S.config, tipiEvento: null })) { S.config = { ...S.config, tipiEvento: null }; applyEvTypes(); m.close(); toast('Tipi predefiniti ripristinati'); onSaved && setTimeout(onSaved, 300); } } }, 'Ripristina predefiniti') : null, el('span', { class: 'grow' }), btn(adm ? 'Annulla' : 'Chiudi', () => m.close()), adm ? btn('Salva', async () => {
      const live = rows.filter(r => !r.del).map(r => ({ ...r, l: r.l.trim() }));
      if (live.some(r => !r.l)) { toast('Un tipo non ha il nome.', 'bad'); return; }
      const low = live.map(r => r.l.toLowerCase()); if (new Set(low).size !== low.length) { toast('Due tipi hanno lo stesso nome.', 'bad'); return; }
      for (const r of live) if (!r.k) r.k = slug(r.l);
      const keyOf = v => v && v.startsWith('new:') ? (live.find(x => x.nuovo && x.l === v.slice(4).trim()) || live[0]).k : (v || live[0].k);
      const moves = new Map(); for (const r of rows.filter(x => x.del && x.k)) moves.set(r.k, keyOf(r.to || (live[0].k)));
      const touched = [...S.eventi.values()].filter(e => moves.has(e.tipo));
      if (touched.length && !await ask('Salvo i tipi e sposto ' + touched.length + (touched.length === 1 ? ' appuntamento' : ' appuntamenti') + '?', 'Salva', 'pri')) return;
      const tipi = live.map(r => ({ k: r.k, l: r.l, c: r.c }));
      if (!await put('config', 'app', { ...S.config, tipiEvento: tipi })) return;
      S.config = { ...S.config, tipiEvento: tipi }; applyEvTypes();
      let ok = 0; for (const e of touched) if (await patch('eventi', e.id, { tipo: moves.get(e.tipo) })) ok++;
      m.close(); toast('Tipi di appuntamento salvati' + (ok ? ' · ' + ok + (ok === 1 ? ' appuntamento spostato' : ' appuntamenti spostati') : ''));
      onSaved && onSaved(); if (S.view === 'cal' && VIEWS.cal) VIEWS.cal.update();
    }, 'pri', 'check') : null], { wide: true });
  };
})();
