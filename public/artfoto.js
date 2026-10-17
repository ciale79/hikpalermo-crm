/* HIK PALERMO — foto degli articoli: carica foto proprie (o usa quelle del magazzino) e scegli quale è la principale al posto di quella del listino.
   Raccolta «artfoto»: id = af_<codice normalizzato> · { code, foto:[blobId], main: blobId|null, by, at } */
(function () {
  'use strict';
  S.artFoto = new Map();
  const idOf = cn => 'af_' + String(cn || '').slice(0, 120);
  claude.use('db').then(db => { if (db) db.collection('artfoto').onSnapshot(sn => { const m = new Map(); sn.docs.forEach(d => { const x = d.data(); if (x && x.cn) m.set(x.cn, { id: d.id, ...x }); }); S.artFoto = m; if (['art', 'dash', 'commesse', 'magazzino'].includes(S.view) && VIEWS[S.view]) VIEWS[S.view].update(); }, () => { }); });
  const mainOf = cn => { const x = S.artFoto.get(cn); return x && x.main ? x.main : null; };
  window.hpArtMain = mainOf;
  const imgEl = (b, size, cls) => { const im = el('img', { src: '/_blob/' + b, alt: '', loading: 'lazy', class: 'hp-afimg' + (cls ? ' ' + cls : '') }); im.style.width = im.style.height = size + 'px'; return im; };
  // miniatura dell'articolo: foto principale scelta dal gruppo, altrimenti quella del listino
  window.artThumb = function (it, size) { const b = it && mainOf(it.cn || norm(it.c)); return b ? imgEl(b, size) : thumb(it ? it.im : -1, size); };
  window.artThumbC = function (code, im, size) { const b = code && mainOf(norm(code)); return b ? imgEl(b, size) : thumb(im, size); };

  async function shrink(file, max = 1600) {
    const bmp = await createImageBitmap(file); const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('conversione non riuscita')), 'image/jpeg', .85));
  }
  async function save(it, patchFn) {
    const cn = it.cn || norm(it.c); const cur = S.artFoto.get(cn) || { cn, code: it.c, foto: [], main: null };
    const next = patchFn({ ...cur, foto: [...(cur.foto || [])] });
    const { id, ...data } = next;
    const ok = await put('artfoto', idOf(cn), { ...data, cn, code: it.c, by: S.me, upd: Date.now() });
    if (ok) S.artFoto.set(cn, { id: idOf(cn), ...data, cn, code: it.c });
    return ok;
  }

  // riquadro «Foto» nella scheda articolo
  window.hpArtFotoBox = function (it, refresh) {
    const cn = it.cn || norm(it.c); const af = S.artFoto.get(cn) || { foto: [], main: null };
    const own = af.foto || [];
    const magF = []; for (const x of (S.mag ? S.mag.values() : [])) { if (norm(x.code) !== cn) continue; for (const f of [...(x.foto || []), x.imgWeb].filter(Boolean)) if (!magF.includes(f) && !own.includes(f)) magF.push(f); }
    const main = af.main;
    const card = (src, lab, isMain, acts) => el('figure', { class: 'hp-affig' + (isMain ? ' main' : '') }, src, el('figcaption', {}, isMain ? el('span', { class: 'pill', style: '--c:var(--ok)' }, '★ Principale') : el('span', { class: 'hint' }, lab), ...acts));
    const setMain = async b => { if (await save(it, d => ({ ...d, main: b }))) { toast(b ? 'Foto principale aggiornata' : 'Torna la foto del listino'); refresh && refresh(); } };
    const inp = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    inp.addEventListener('change', async () => {
      const fs = [...inp.files]; inp.value = ''; if (!fs.length) return;
      if (!assets) { toast('Caricamento foto non disponibile.', 'bad'); return; }
      toast(fs.length > 1 ? 'Caricamento di ' + fs.length + ' foto…' : 'Caricamento foto…');
      const ids = []; for (const f of fs) { try { const r = await assets.upload(await shrink(f), { type: 'image/jpeg' }); ids.push(r.id); } catch (e) { toast('Foto non caricata (' + (e.code || e.message || 'errore') + ').', 'bad'); } }
      if (!ids.length) return;
      const noPhoto = it.im == null || it.im < 0;
      if (await save(it, d => ({ ...d, foto: [...d.foto, ...ids], main: d.main || (noPhoto ? ids[0] : d.main) }))) { toast(ids.length === 1 ? 'Foto caricata' : ids.length + ' foto caricate'); refresh && refresh(); }
    });
    const tiles = [];
    const hasCat = it.im != null && it.im !== -1 && !(typeof it.im === 'number' && it.im < 0);
    if (hasCat) tiles.push(card(thumb(it.im, 120), 'Foto del listino', !main, main ? [btn('Rendi principale', () => setMain(null), 'sm ghost')] : []));
    own.forEach(b => tiles.push(card(el('a', { href: '/_blob/' + b, target: '_blank', rel: 'noopener' }, imgEl(b, 120)), 'Caricata', main === b, [main === b ? null : btn('Rendi principale', () => setMain(b), 'sm ghost'),
      el('button', { type: 'button', class: 'icon-btn', title: 'Elimina la foto', 'aria-label': 'Elimina la foto', onclick: async () => { if (!await ask('Eliminare questa foto dell\'articolo?')) return; if (await save(it, d => ({ ...d, foto: d.foto.filter(x => x !== b), main: d.main === b ? null : d.main }))) { try { await assets.delete(b); } catch (e) { } toast('Foto eliminata'); refresh && refresh(); } } }, ic('trash', 14))])));
    magF.forEach(b => tiles.push(card(el('a', { href: '/_blob/' + b, target: '_blank', rel: 'noopener' }, imgEl(b, 120)), 'Dal magazzino', main === b, [main === b ? null : btn('Rendi principale', () => setMain(b), 'sm ghost')])));
    tiles.push(el('button', { type: 'button', class: 'hp-afadd', onclick: () => inp.click() }, ic('plus', 20), 'Carica foto'));
    return el('section', { class: 'stack', style: 'gap:8px' },
      el('div', { class: 'row between' }, el('h4', { style: 'margin:0' }, 'Foto'), el('span', { class: 'hint' }, main ? 'La foto principale sostituisce quella del listino in elenchi, offerte e schede, per tutto il gruppo.' : 'Carica una foto e rendila principale per mostrarla al posto di quella del listino.')),
      el('div', { class: 'hp-afgal' }, ...tiles), inp);
  };
})();
