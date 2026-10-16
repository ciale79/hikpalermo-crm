/* HIK PALERMO — gestione categorie clienti: aggiungi, rinomina, ordina, unisci ed elimina (aggiornando i clienti) */
(function () {
  'use strict';
  const count = () => { const m = new Map(); for (const c of S.clienti.values()) { const k = c.categoria || ''; m.set(k, (m.get(k) || 0) + 1); } return m; };

  window.hpCatManager = function () {
    const adm = isAdmin();
    const cnt = count();
    // righe: categorie in elenco + categorie usate dai clienti ma non in elenco
    const rows = cfg().categorie.map(n => ({ orig: n, name: n, del: false, to: '' }));
    const extra = [...cnt.keys()].filter(k => k && !rows.some(r => r.orig === k)).sort((a, b) => a.localeCompare(b, 'it'));
    for (const k of extra) rows.push({ orig: k, name: k, del: false, to: '', fuori: true });
    const list = el('div', { class: 'stack', style: 'gap:6px' });
    const newIn = el('input', { type: 'text', placeholder: 'Nuova categoria', 'aria-label': 'Nuova categoria', style: 'max-width:280px' });
    const add = () => { const v = newIn.value.trim(); if (!v) return; if (rows.some(r => !r.del && r.name.toLowerCase() === v.toLowerCase())) { toast('Categoria già presente.', 'bad'); return; } rows.push({ orig: null, name: v, del: false, to: '' }); newIn.value = ''; draw(); newIn.focus(); };
    newIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    const draw = () => {
      const live = rows.filter(r => !r.del);
      list.replaceChildren(...rows.map((r, i) => {
        const n = r.orig != null ? (cnt.get(r.orig) || 0) : 0;
        if (r.del) {
          const opts = [['', '— Nessuna categoria —'], ...live.map(x => [x.name, x.name])];
          return el('div', { class: 'hp-catrow del' },
            el('span', { class: 'grow' }, el('s', {}, r.orig), n ? el('span', { class: 'hint' }, ' · ' + n + (n === 1 ? ' cliente' : ' clienti') + ' da spostare in ') : el('span', { class: 'hint' }, ' · verrà eliminata')),
            n ? el('select', { 'aria-label': 'Sposta i clienti di ' + r.orig, onchange: e => { r.to = e.target.value; } }, opts.map(([v, l]) => el('option', { value: v, selected: v === r.to }, l))) : null,
            btn('Annulla', () => { r.del = false; draw(); }, 'sm ghost'));
        }
        return el('div', { class: 'hp-catrow' },
          el('div', { class: 'row', style: 'gap:2px;flex-wrap:nowrap' },
            el('button', { type: 'button', class: 'icon-btn', title: 'Sposta su', 'aria-label': 'Sposta su ' + r.name, disabled: i === 0 || !adm, onclick: () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; draw(); } }, '↑'),
            el('button', { type: 'button', class: 'icon-btn', title: 'Sposta giù', 'aria-label': 'Sposta giù ' + r.name, disabled: i === rows.length - 1 || !adm, onclick: () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; draw(); } }, '↓')),
          el('input', { type: 'text', value: r.name, disabled: !adm, 'aria-label': 'Nome categoria', class: 'grow', oninput: e => { r.name = e.target.value; } }),
          r.fuori ? el('span', { class: 'pill', style: '--c:var(--warn)', title: 'Usata dai clienti ma non presente nell\'elenco: salvando viene aggiunta' }, 'non in elenco') : null,
          el('a', { href: '#', class: 'hint', style: 'white-space:nowrap;min-width:72px;text-align:right', title: 'Mostra questi clienti', onclick: e => { e.preventDefault(); if (r.orig == null) return; m.close(); S.fCli.cat = r.orig; go('clienti'); } }, n + (n === 1 ? ' cliente' : ' clienti')),
          adm ? el('button', { type: 'button', class: 'icon-btn', title: 'Elimina', 'aria-label': 'Elimina ' + r.name, onclick: () => { if (r.orig == null) { rows.splice(i, 1); } else { r.del = true; r.to = ''; } draw(); } }, ic('trash', 16)) : null);
      }));
    };
    draw();
    const none = cnt.get('') || 0;
    const body = el('div', { class: 'stack' },
      el('p', { class: 'hint' }, adm ? 'Rinomina, riordina o elimina le categorie: i clienti vengono aggiornati di conseguenza. Per unire due categorie, elimina una delle due e sposta i suoi clienti nell\'altra.' : 'Solo un amministratore può modificare le categorie.'),
      list,
      adm ? el('div', { class: 'row' }, newIn, btn('Aggiungi', add, 'sm', 'plus')) : null,
      none ? el('p', { class: 'hint' }, el('a', { href: '#', onclick: e => { e.preventDefault(); m.close(); S.fCli.cat = '__none'; go('clienti'); } }, none + (none === 1 ? ' cliente' : ' clienti') + ' senza categoria')) : null);
    const m = modal('Categorie clienti', body, [el('span', { class: 'grow' }), btn(adm ? 'Annulla' : 'Chiudi', () => m.close()), adm ? btn('Salva', async () => {
      const live = rows.filter(r => !r.del).map(r => ({ ...r, name: r.name.trim() }));
      if (live.some(r => !r.name)) { toast('Una categoria non ha il nome.', 'bad'); return; }
      const low = live.map(r => r.name.toLowerCase()); if (new Set(low).size !== low.length) { toast('Ci sono due categorie con lo stesso nome: per unirle eliminane una e sposta i clienti.', 'bad'); return; }
      // cosa cambia per i clienti
      const map = new Map();
      for (const r of live) if (r.orig != null && r.orig !== r.name) map.set(r.orig, r.name);
      for (const r of rows.filter(x => x.del && x.orig != null)) map.set(r.orig, live.find(x => x.orig === r.to || x.name === r.to)?.name ?? (r.to || ''));
      const touched = [...S.clienti.values()].filter(c => map.has(c.categoria || '') && (c.categoria || ''));
      if (touched.length && !await ask('Salvo le categorie e aggiorno ' + touched.length + (touched.length === 1 ? ' cliente' : ' clienti') + '?', 'Salva', 'pri')) return;
      if (!await put('config', 'app', { ...S.config, categorie: live.map(r => r.name) })) return;
      let ok = 0; for (const c of touched) { if (await patch('clienti', c.id, { categoria: map.get(c.categoria), upd: Date.now() })) ok++; }
      m.close(); toast('Categorie salvate' + (ok ? ' · ' + ok + (ok === 1 ? ' cliente aggiornato' : ' clienti aggiornati') : ''));
      if (S.fCli.cat && map.has(S.fCli.cat)) S.fCli.cat = map.get(S.fCli.cat) || '';
      if (S.view === 'clienti') VIEWS.clienti.update();
    }, 'pri', 'check') : null], { wide: true });
  };
})();
