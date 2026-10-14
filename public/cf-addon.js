/* HIK PALERMO — integrazioni della versione su hikpalermo.com: logout e gestione accessi */
(function () {
  'use strict';
  // Pulsante Esci nella barra in alto
  const me = document.querySelector('.me');
  if (me && !document.getElementById('logoutBtn')) {
    const b = el('button', { class: 'icon-btn', id: 'logoutBtn', 'aria-label': 'Esci', title: 'Esci', onclick: async () => { if (await ask('Vuoi uscire dal CRM su questo dispositivo?', 'Esci')) HIK_CF.logout(); } });
    b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>';
    me.appendChild(b);
  }

  // Pannello «Accessi al CRM» in Gruppo e impostazioni (solo amministratori)
  let users = null, loading = false;
  const ST = { active: ['Attivo', 'ok'], pending: ['In attesa', 'warn'], disabled: ['Disattivato', 'bad'] };
  async function loadUsers() {
    if (loading) return; loading = true;
    try { users = await HIK_CF.call('/api/users'); } catch (e) { users = { err: e.message }; }
    loading = false; if (S.view === 'set') VIEWS.set.update();
  }
  async function act(u, action) {
    const lab = { approve: 'approvare', reject: 'rifiutare', disable: 'disattivare', enable: 'riattivare', delete: 'eliminare' }[action];
    if (action !== 'approve' && action !== 'enable' && !(await ask('Vuoi ' + lab + ' l\'accesso di ' + u.name + ' (' + u.email + ')?', 'Conferma'))) return;
    try { await HIK_CF.postJ('/api/users', { id: u.id, action }); toast(action === 'approve' ? u.name + ' approvato: riceverà un\'email.' : 'Fatto'); }
    catch (e) { toast(e.message, 'bad'); }
    loadUsers();
  }
  function panel() {
    const fmt = t => t ? new Date(t).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    const head = el('div', { class: 'panel-h' }, el('h3', { text: 'Accessi al CRM' }), btn('Aggiorna', () => loadUsers(), 'sm'));
    if (!users) { loadUsers(); return el('section', { class: 'panel stack', id: 'cfAccess' }, head, el('p', { class: 'hint' }, 'Caricamento…')); }
    if (users.err) return el('section', { class: 'panel stack', id: 'cfAccess' }, head, el('p', { class: 'hint' }, users.err));
    const pend = users.filter(u => u.status === 'pending');
    const rows = users.map(u => {
      const st = ST[u.status] || [u.status, ''];
      const acts = u.status === 'pending' ? [btn('Approva', () => act(u, 'approve'), 'sm pri'), btn('Rifiuta', () => act(u, 'reject'), 'sm ghost')]
        : u.status === 'active' ? (u.id === S.me ? [] : [btn('Disattiva', () => act(u, 'disable'), 'sm ghost')])
          : [btn('Riattiva', () => act(u, 'enable'), 'sm'), btn('Elimina', () => act(u, 'delete'), 'sm ghost')];
      return el('tr', {}, el('td', {}, el('b', {}, u.name || '—'), el('div', { class: 'hint' }, u.email)), el('td', {}, el('span', { class: 'pill', style: '--c:var(--' + st[1] + ')' }, st[0])), el('td', { class: 'hint' }, fmt(u.last_login)), el('td', {}, el('div', { class: 'row', style: 'justify-content:flex-end;gap:6px' }, ...acts)));
    });
    return el('section', { class: 'panel stack', id: 'cfAccess' }, head,
      pend.length ? el('div', { class: 'banner' }, pend.length === 1 ? '1 richiesta di accesso da approvare.' : pend.length + ' richieste di accesso da approvare.') : null,
      el('p', { class: 'hint' }, 'Chi si registra su hikpalermo.com con un\'email già presente nel gruppo di lavoro entra subito; gli altri restano in attesa finché non li approvi. Togliendo un collega dal gruppo gli viene revocato anche l\'accesso.'),
      el('div', { class: 'tbl-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Utente'), el('th', {}, 'Stato'), el('th', {}, 'Ultimo accesso'), el('th', {}, ''))), el('tbody', {}, ...rows))));
  }
  const orig = VIEWS.set.update;
  VIEWS.set.update = function () {
    const r = orig.apply(this, arguments);
    try {
      if (!this.editing && isAdmin() && this.root) {
        this.root.querySelector('#cfAccess')?.remove();
        const p = panel();
        const first = this.root.querySelector('section.panel');
        if (first && first.nextSibling) first.parentNode.insertBefore(p, first.nextSibling); else this.root.appendChild(p);
      }
    } catch (e) { console.error(e); }
    return r;
  };
})();
