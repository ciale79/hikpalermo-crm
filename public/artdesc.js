/* HIK PALERMO — descrizioni degli articoli modificate per tutti (dalla scheda offerta: «Salva per tutti»).
   Raccolta «artdesc»: id = ad_<listino>_<codice normalizzato> · { code, cn, L, b, d, by, upd }.
   Le descrizioni si applicano al catalogo caricato (S.cat) ogni volta che cambia; l'originale resta in it._b0 / it._d0. */
(function () {
  'use strict';
  S.artDesc = new Map();
  const keyOf = (cn, L) => 'ad_' + String(L || 'x').slice(0, 12) + '_' + String(cn || '').slice(0, 120);
  let sig = '';
  function apply(force) {
    if (!S.cat || !S.cat.length) return;
    const s = S.cat.length + ':' + (S.cat[0] && S.cat[0].i) + ':' + S.artDesc.size + ':' + (S.cat[S.cat.length - 1] || {}).L;
    if (!force && s === sig && S.cat._hpDesc) return; sig = s; S.cat._hpDesc = true;
    for (const it of S.cat) {
      const ov = S.artDesc.get(keyOf(it.cn || norm(it.c), it.L));
      if (it._b0 === undefined) { it._b0 = it.b; it._d0 = it.d; it._h0 = it.hay; }
      if (ov) { if (ov.b != null) it.b = ov.b; if (ov.d != null) it.d = ov.d; it.hay = (it._h0 || '') + ' | ' + String((ov.b || '') + ' ' + (ov.d || '')).toLowerCase(); }
      else { it.b = it._b0; it.d = it._d0; it.hay = it._h0; }
    }
  }
  claude.use('db').then(db => { if (db) db.collection('artdesc').onSnapshot(sn => { const m = new Map(); sn.docs.forEach(d => m.set(d.id, { id: d.id, ...d.data() })); S.artDesc = m; apply(true); }, () => { }); });
  setInterval(() => apply(false), 1500);
  // salva la descrizione breve ed estesa dell'articolo per tutto il gruppo
  window.hpSaveArtDesc = async function (it, b, d) {
    const cn = it.cn || norm(it.c); const id = keyOf(cn, it.L);
    const data = { code: it.c, cn, L: it.L || '', b: b ?? null, d: d ?? null, by: S.me, upd: Date.now() };
    const ok = await put('artdesc', id, data); if (ok) { S.artDesc.set(id, { id, ...data }); apply(true); }
    return ok;
  };
  window.hpArtDescOrig = it => ({ b: it._b0 !== undefined ? it._b0 : it.b, d: it._d0 !== undefined ? it._d0 : it.d });
})();
