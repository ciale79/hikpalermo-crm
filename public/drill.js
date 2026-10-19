/* HIK PALERMO — statistiche cliccabili (portano all'elenco filtrato) e condivisione degli eventi */
(function () {
  'use strict';
  const norm = s => String(s || '').toLowerCase().replace(/\b(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|unipersonale|semplificata)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  /* ================= Commesse: filtro da statistica ================= */
  function drill(label, pred, extra) {
    const ids = new Set([...S.commesse.values()].filter(pred).map(c => c.id));
    S.fCom = { ...S.fCom, q: '', st: '', cli: '', resp: '', tipo: '', stp: '', mode: 'list', ...(extra || {}), drill: { label, ids } };
    go('commesse');
  }
  window.hpDrill = drill;
  const origCom = VIEWS.commesse.update;
  VIEWS.commesse.update = function () {
    const out = origCom.apply(this, arguments);
    try {
      const f = S.fCom;
      if (!S.sel && f && f.drill && this.body) {
        this.body.querySelector('.hp-drill')?.remove();
        const n = [...S.commesse.values()].filter(c => f.drill.ids.has(c.id)).length;
        const b = el('div', { class: 'banner hp-drill' }, el('span', {}, 'Filtro: ', el('b', {}, f.drill.label), ' · ' + n + (n === 1 ? ' commessa' : ' commesse')),
          btn('Rimuovi filtro', () => { delete S.fCom.drill; S.fCom.st = 'attive'; go('commesse'); }, 'sm ghost', 'x'));
        this.body.prepend(b);
      }
    } catch (e) { console.error(e); }
    return out;
  };

  const inPeriod = (c, y, q, kind) => {
    const st = c.stato || 'opp';
    const closed = WON.has(st) || st === 'persa';
    const k = qOf(closed ? (c.chiusaAt || c.upd || c.at) : (c.apertura || c.at));
    if (!k || k.y !== y || (q && k.q !== q)) return false;
    if (kind === 'PERSE') return st === 'persa';
    if (kind === 'CHIUSE') return WON.has(st);
    return !closed;
  };

  /* ================= Fatturato: vai alla sezione ================= */
  function goFatt(target, q) {
    if (VIEWS.fatt) VIEWS.fatt.q = q != null ? q : (VIEWS.fatt.q || 0);
    if (S.view !== 'fatt') go('fatt'); else VIEWS.fatt.update();
    setTimeout(() => {
      const secs = [...document.querySelectorAll('#view section, #view details')];
      const find = rx => secs.find(s => rx.test((s.querySelector('h3, summary') || {}).textContent || ''));
      const map = { italia: /^Italia ·/i, sicilia: /^Sicilia · fatturato/i, clienti: /Clienti Sicilia/i, PRO: /^ProExpert$/i, SOLUTION: /^Solution$/i, oo: /Clienti Sicilia/i, kam: /region|KAM/i };
      const s = find(map[target] || /^$/) || (target === 'kam' ? find(/Italia ·/i) : null);
      if (s) { s.scrollIntoView({ behavior: 'smooth', block: 'start' }); s.classList.remove('hp-flash'); void s.offsetWidth; s.classList.add('hp-flash'); }
    }, 60);
  }
  window.hpGoFatt = goFatt;
  function clientDrill(name) {
    const n = norm(name);
    const c = [...S.clienti.values()].find(x => norm(x.nome) === n) || [...S.clienti.values()].find(x => n && (norm(x.nome).startsWith(n) || n.startsWith(norm(x.nome))) && norm(x.nome).length > 3);
    if (!c) { toast('«' + name + '» non è tra i clienti del CRM.', 'bad'); return; }
    drill('Cliente ' + c.nome, x => x.clienteId === c.id, { st: '' });
  }

  /* ================= rende cliccabili gli elementi ================= */
  function clickable(node, fn, title) {
    if (node._hpc) return; node._hpc = true;
    node.classList.add('hp-click'); node.setAttribute('role', 'button'); node.tabIndex = 0; if (title) node.title = title;
    node.addEventListener('click', ev => { if (ev.target.closest('a, button:not(.hp-click)') && ev.target.closest('a, button') !== node) return; ev.stopPropagation(); fn(); });
    node.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fn(); } });
  }
  const txt = n => (n && n.textContent || '').replace(/\s+/g, ' ').trim();

  function decorate() {
    // pannello laterale: ATTIVE / CHIUSE / PERSE del periodo
    document.querySelectorAll('.sidewid .lcd').forEach(n => {
      const kind = txt(n.querySelector('span'));
      clickable(n, () => {
        const { y, q } = S.qsel;
        drill((kind === 'ATTIVE' ? 'Attive' : kind === 'CHIUSE' ? 'Chiuse' : 'Perse') + ' · ' + (q ? 'Q' + q + ' ' + y : 'anno ' + y), c => inPeriod(c, y, q, kind));
      }, 'Apri l\'elenco delle commesse ' + kind.toLowerCase() + ' del periodo');
    });
    // pannello laterale: fatturato Sicilia / Italia / canali
    document.querySelectorAll('.sidewid .srow').forEach(n => {
      const t = txt(n.querySelector('span')).replace('↳', '').trim().toUpperCase();
      const target = t === 'ITALIA' ? 'italia' : t === 'SICILIA' ? 'sicilia' : t === 'PRO' ? 'PRO' : t === 'SOLUTION' ? 'SOLUTION' : 'sicilia';
      clickable(n, () => { const { y, q } = S.qsel; goFatt(target, S.sales && y === S.sales.anno ? q : 0); }, 'Apri il dettaglio nella pagina Fatturato');
    });
    if (S.view === 'dash') {
      document.querySelectorAll('#view .kpis .kpi').forEach(n => {
        const t = txt(n.querySelector('.eyebrow'));
        if (/^Commesse attive/i.test(t) || /^Pipeline/i.test(t)) clickable(n, () => { S.fCom = { ...S.fCom, q: '', st: 'attive', cli: '', resp: '', tipo: '', stp: '', mode: 'list' }; delete S.fCom.drill; go('commesse'); }, 'Apri l\'elenco delle commesse attive');
        else if (/^Offerte in attesa/i.test(t)) clickable(n, () => { const ids = new Set([...S.offerte.values()].filter(o => o.stato === 'Inviata').map(o => o.commessaId)); drill('Con offerte in attesa di risposta', c => ids.has(c.id)); }, 'Commesse con offerte inviate in attesa');
        else if (/^Appuntamenti/i.test(t)) clickable(n, () => go('cal'), 'Apri il calendario');
      });
      document.querySelectorAll('#view .bars .bar-r').forEach(n => {
        const lab = txt(n.querySelector('span'));
        const st = (CST.find(([k, l]) => l === lab) || [])[0];
        if (st) clickable(n, () => { S.fCom = { ...S.fCom, q: '', st, cli: '', resp: '', tipo: '', stp: '', mode: 'list' }; delete S.fCom.drill; go('commesse'); }, 'Apri le commesse in stato ' + lab);
      });
    }
    if (S.view === 'fatt') {
      document.querySelectorAll('#view .kpis .kpi').forEach(n => {
        const t = txt(n.querySelector('.eyebrow'));
        const target = /^Italia/i.test(t) ? 'italia' : /^Sicilia/i.test(t) ? 'sicilia' : /^Ordini/i.test(t) ? 'oo' : /^KAM/i.test(t) ? 'clienti' : null;
        if (target) clickable(n, () => goFatt(target), 'Vai al dettaglio');
      });
      document.querySelectorAll('#view .splitp .bigv').forEach(n => {
        const h = txt(n.closest('.splitp').querySelector('h3'));
        clickable(n, () => goFatt('clienti'), 'Vai ai clienti Sicilia (' + h + ')');
      });
      // clienti nei grafici "Per cliente" e nella tabella Clienti Sicilia → commesse del cliente nel CRM
      document.querySelectorAll('#view .hb').forEach(hb => { const h = hb.previousElementSibling; if (!h || !/cliente/i.test(txt(h))) return; hb.querySelectorAll('.hr').forEach(n => { const name = txt(n.querySelector('.hn')); if (name) clickable(n, () => clientDrill(name), 'Commesse di ' + name + ' nel CRM'); }); });
      document.querySelectorAll('#view section').forEach(sec => {
        if (!/Clienti Sicilia/i.test(txt(sec.querySelector('h3')))) return;
        sec.querySelectorAll('tbody tr').forEach(tr => { const name = txt(tr.cells[0]); if (name) clickable(tr, () => clientDrill(name), 'Commesse di ' + name + ' nel CRM'); });
      });
    }
  }
  let raf = 0;
  new MutationObserver(() => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; try { decorate(); } catch (e) { console.error(e); } }); })
    .observe(document.body, { childList: true, subtree: true });
  decorate();

  /* ================= Eventi: condivisione WhatsApp / Telegram / .ics ================= */
  const pad = n => String(n).padStart(2, '0');
  const icsDate = t => { const d = new Date(t); return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z'; };
  const icsTxt = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const fold = l => { const o = []; while (l.length > 74) { o.push(l.slice(0, 74)); l = ' ' + l.slice(74); } o.push(l); return o.join('\r\n'); };
  function icsOf(e) {
    const loc = [e.luogo, e.teams].filter(Boolean).join(' · ');
    const desc = inviteText(e);
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HIK PALERMO//CRM//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + e.id + '@hikpalermo.com', 'DTSTAMP:' + icsDate(Date.now()), ...(e.allDay ? ['DTSTART;VALUE=DATE:' + dayKey(e.start).replace(/-/g, ''), 'DTEND;VALUE=DATE:' + dayKey(evLast(e).getTime() + 864e5).replace(/-/g, ''), 'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE', 'TRANSP:TRANSPARENT'] : ['DTSTART:' + icsDate(e.start), 'DTEND:' + icsDate(e.end || e.start + 36e5)]),
      'SUMMARY:' + icsTxt(e.titolo), loc ? 'LOCATION:' + icsTxt(loc) : '', 'DESCRIPTION:' + icsTxt(desc), e.teams ? 'URL:' + e.teams : '',
      e.lat != null ? 'GEO:' + e.lat + ';' + e.lng : '',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsTxt(e.titolo), 'TRIGGER:-PT30M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).map(fold).join('\r\n');
  }
  const icsName = e => (e.titolo || 'evento').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60) + '.ics';
  async function link(e) { try { return (await HIK_CF.call('/api/ics-link?id=' + encodeURIComponent(e.id))).url; } catch (x) { return null; } }
  async function shareText(e) {
    const u = await link(e);
    const maps = e.lat != null ? 'https://www.google.com/maps/search/?api=1&query=' + e.lat + ',' + e.lng : (e.luogo ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(e.luogo) : '');
    return { text: inviteText(e) + (maps ? '\nMappa: ' + maps : '') + (u ? '\n\n📅 Aggiungi al calendario: ' + u : ''), url: u };
  }
  window.hpShareRow = function (e) {
    const open = async (kind, w) => {
      const { text, url } = await shareText(e);
      const href = kind === 'wa' ? 'https://wa.me/?text=' + encodeURIComponent(text)
        : 'https://t.me/share/url?url=' + encodeURIComponent(url || location.origin) + '&text=' + encodeURIComponent(text.replace(/\n\n📅 Aggiungi al calendario: .*$/, '\n\n📅 Aggiungi al calendario:'));
      if (w && !w.closed) w.location.href = href; else window.open(href, '_blank', 'noopener');
    };
    const wa = btn('WhatsApp', () => { const w = window.open('about:blank', '_blank'); open('wa', w); }, 'hp-wa', 'ext');
    const tg = btn('Telegram', () => { const w = window.open('about:blank', '_blank'); open('tg', w); }, 'hp-tg', 'ext');
    const dl = btn('File calendario (.ics)', () => { const b = new Blob([icsOf(e)], { type: 'text/calendar;charset=utf-8' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = icsName(e); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }, '', 'dl');
    const file = new File([icsOf(e)], icsName(e), { type: 'text/calendar' });
    const canFile = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    const sh = canFile ? btn('Invia il file…', async () => { try { const { text } = await shareText(e); await navigator.share({ files: [file], title: e.titolo, text }); } catch (x) { if (x && x.name !== 'AbortError') toast('Condivisione non riuscita', 'bad'); } }, '', 'ext') : null;
    const cp = btn('Copia link calendario', async () => { const u = await link(e); if (u) { copy(u); } else toast('Link non disponibile', 'bad'); }, 'ghost', 'copy');
    return el('div', { class: 'panel', style: 'background:var(--surface-2)' }, el('h4', { style: 'margin-bottom:8px' }, 'Condividi l\'evento'),
      el('div', { class: 'linkrow' }, wa, tg, dl, sh, cp),
      el('p', { class: 'hint', style: 'margin-top:8px' }, 'Il messaggio contiene data, ora, luogo, mappa e il link «Aggiungi al calendario» che apre il file .ics anche per chi non ha accesso al CRM.' + (canFile ? ' «Invia il file…» condivide direttamente il file .ics con WhatsApp, Telegram o altre app del telefono.' : '')));
  };
})();
