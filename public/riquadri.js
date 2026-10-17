/* HIK PALERMO — riquadri trascinabili: l'utente li riordina col mouse/dito (maniglia) o con le frecce della tastiera.
   L'ordine è personale e si salva nello stato utente (data/users/<me>/state), quindi vale su tutti i dispositivi. */
(function () {
  'use strict';
  const GRIP = '<svg viewBox="0 0 20 8" width="20" height="8" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="2" r="1.3"/><circle cx="8" cy="2" r="1.3"/><circle cx="13" cy="2" r="1.3"/><circle cx="18" cy="2" r="1.3"/><circle cx="3" cy="6" r="1.3"/><circle cx="8" cy="6" r="1.3"/><circle cx="13" cy="6" r="1.3"/><circle cx="18" cy="6" r="1.3"/></g></svg>';
  // durante il trascinamento non ridisegnare la pagina (aggiornamenti in tempo reale): si recupera al rilascio
  let dragging = false, pending = null;
  for (const v of ['dash', 'fatt']) {
    const V = VIEWS[v]; if (!V) continue; const orig = V.update;
    V.update = function () { if (dragging) { pending = v; return; } return orig.apply(this, arguments); };
  }
  const flush = () => { const v = pending; pending = null; if (v && S.view === v) VIEWS[v].update(); };
  const saved = key => { const a = S.state && S.state[key]; return Array.isArray(a) ? a : null; };
  async function save(key, order) {
    S.state = { ...(S.state || {}), [key]: order };
    try { if (db && S.me) await db.doc('data/users/' + S.me + '/state').set(S.state); } catch (e) { toast(errMsg(e), 'bad'); }
  }
  // ordine: quello salvato, con i riquadri nuovi inseriti nella loro posizione predefinita
  function arrange(key, items) {
    const def = items.map(x => x.k), sv = saved(key);
    if (!sv) return items;
    const ord = sv.filter(k => def.includes(k));
    def.forEach((k, i) => { if (!ord.includes(k)) { const prev = def.slice(0, i).reverse().find(x => ord.includes(x)); ord.splice(prev ? ord.indexOf(prev) + 1 : 0, 0, k); } });
    return ord.map(k => items.find(x => x.k === k));
  }
  /* items: [{k, node, full, label}] → griglia a due colonne; full = a tutta larghezza */
  window.hpDragGrid = function (key, items, opt = {}) {
    items = items.filter(x => x && x.node);
    const grid = el('div', { class: 'hp-fgrid' + (opt.cls ? ' ' + opt.cls : '') });
    const custom = !!saved(key);
    const reset = el('div', { class: 'hp-fgrid-bar full' }, custom ? el('span', { class: 'hint' }, 'Ordine dei riquadri personalizzato') : el('span', { class: 'hint' }, '⠿ Trascina la maniglia in cima a un riquadro per spostarlo'), custom ? el('a', { href: '#', class: 'hint', onclick: async e => { e.preventDefault(); const st = { ...(S.state || {}) }; delete st[key]; S.state = st; try { if (db && S.me) await db.doc('data/users/' + S.me + '/state').set(st); } catch (x) { } opt.rerender && opt.rerender(); toast('Ordine dei riquadri ripristinato'); } }, 'Ripristina ordine') : null);
    const commit = () => save(key, [...grid.children].filter(n => n.dataset.k).map(n => n.dataset.k));
    for (const it of arrange(key, items)) {
      const h = el('button', { type: 'button', class: 'hp-grip', title: 'Trascina per spostare · frecce ↑ ↓ da tastiera', 'aria-label': 'Sposta il riquadro ' + (it.label || it.k) });
      h.innerHTML = GRIP;
      const w = el('div', { class: 'hp-fitem' + (it.full ? ' full' : ''), 'data-k': it.k }, h, it.node);
      grid.append(w);
      h.addEventListener('keydown', e => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const sib = e.key === 'ArrowUp' ? w.previousElementSibling : w.nextElementSibling;
        if (!sib || !sib.dataset.k) return;
        if (e.key === 'ArrowUp') sib.before(w); else sib.after(w);
        h.focus(); commit();
      });
      h.addEventListener('pointerdown', e => {
        if (e.button > 0) return;
        e.preventDefault();
        const start = [...grid.children].map(n => n.dataset.k).join();
        w.classList.add('dragging'); document.body.classList.add('hp-dragging'); dragging = true;
        let raf = 0, lastY = e.clientY, lastX = e.clientX;
        const scroller = document.scrollingElement;
        const tick = () => { // scorrimento automatico vicino ai bordi
          const H = window.innerHeight, edge = 70;
          const v = lastY < edge ? -(edge - lastY) / 3 : lastY > H - edge ? (lastY - (H - edge)) / 3 : 0;
          if (v) { scroller.scrollTop += v; place(); }
          raf = requestAnimationFrame(tick);
        };
        const place = () => {
          for (const n of grid.children) {
            if (n === w || !n.dataset.k) continue;
            const r = n.getBoundingClientRect();
            if (lastY < r.top || lastY > r.bottom || lastX < r.left || lastX > r.right) continue;
            const sameRow = !n.classList.contains('full') && !w.classList.contains('full');
            const before = sameRow && r.width < grid.clientWidth * 0.8 ? lastX < r.left + r.width / 2 : lastY < r.top + r.height / 2;
            if (before) { if (n.previousElementSibling !== w) n.before(w); } else if (n.nextElementSibling !== w) n.after(w);
            break;
          }
        };
        const move = ev => { lastY = ev.clientY; lastX = ev.clientX; place(); };
        const up = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
          w.classList.remove('dragging'); document.body.classList.remove('hp-dragging'); dragging = false;
          if ([...grid.children].map(n => n.dataset.k).join() !== start) { commit().then(flush); if (!custom && opt.rerender) setTimeout(opt.rerender, 50); } else flush();
        };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
        raf = requestAnimationFrame(tick);
      });
    }
    grid.prepend(reset);
    return grid;
  };
})();
