/* HIK PALERMO — «Traduci Datasheet» 🇮🇹: traduce in italiano il datasheet di un articolo.
   Fonte: il PDF trovato nella scheda prodotto del listino (o la scheda stessa se è un PDF), oppure un PDF / link scelto dall'utente.
   Il testo si estrae nel browser (pdf.js), la traduzione la fa 800AI (Sonnet) una sola volta: il risultato resta salvato per tutto il gruppo
   (raccolta «dstrad», id = codice normalizzato), quindi le volte successive si apre subito e non costa nulla. */
(function () {
  'use strict';
  S.dsTrad = new Map();
  claude.use('db').then(db => { if (db) db.collection('dstrad').onSnapshot(sn => { const m = new Map(); sn.docs.forEach(d => m.set(d.id, { id: d.id, ...d.data() })); S.dsTrad = m; }, () => { }); });
  const nk = c => 'ds_' + String(c || '').toUpperCase().replace(/\([^()]*\)/g, '').replace(/[^A-Z0-9]/g, '').slice(0, 100);
  const flag = () => el('span', { class: 'hp-flag-it', role: 'img', 'aria-label': 'Italiano' });

  // pulsante (lista: etichetta piccola; scheda: pulsante)
  window.hpTradChip = function (code, url, big) {
    if (!code || !/^[A-Za-z]{1,8}-[A-Za-z0-9]/.test(String(code).trim())) return null;
    const done = S.dsTrad.has(nk(code));
    return el('button', { type: 'button', class: big ? 'btn hp-trbtn' : 'tag hp-trtag', title: done ? 'Datasheet già tradotto in italiano: aprilo' : 'Traduci in italiano il datasheet di ' + code, onclick: e => { e.stopPropagation(); open(code, url); } }, flag(), done ? 'Datasheet in italiano' : 'Traduci Datasheet');
  };

  const N = x => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  async function fetchRaw(u) {
    const r = await fetch('/api/fetch?u=' + encodeURIComponent(u), { credentials: 'same-origin' });
    if (!r.ok) { let m = 'errore ' + r.status; try { const j = await r.json(); m = j.error && j.error.message || m; } catch (e) { } throw new Error(m); }
    let fin = u; try { fin = decodeURIComponent(r.headers.get('x-final-url') || u); } catch (e) { }
    return { ct: (r.headers.get('content-type') || '').toLowerCase(), blob: await r.blob(), fin };
  }
  // nella pagina prodotto cerca i PDF del datasheet (prima quelli con «datasheet» e il codice)
  async function findPdf(code, url, say) {
    if (!url) return [];
    url = String(url).replace(/&amp;/g, '&');
    if (/\.pdf(\?|#|$)/i.test(url)) return [url];
    say('Leggo la scheda prodotto…');
    const { ct, blob, fin } = await fetchRaw(url);
    if (/pdf/.test(ct)) return [url];
    const html = await blob.text(); const d = new DOMParser().parseFromString(html, 'text/html');
    const k = N(String(code).replace(/\([^()]*\)/g, '').split('/')[0]);
    const links = [...d.querySelectorAll('a[href]')].map(a => { let h = a.getAttribute('href'); try { h = new URL(h, fin).href; } catch (e) { return null; } return { h, t: (a.textContent || '') + ' ' + (a.getAttribute('title') || '') }; }).filter(Boolean);
    for (const m of html.matchAll(/https?:[^"'\s<>]+?\.pdf[^"'\s<>]*/gi)) links.push({ h: m[0].replace(/\\\//g, '/'), t: '' });
    const pdf = links.filter(x => /\.pdf(\?|#|$)/i.test(x.h) || /datasheet/i.test(x.t + x.h) && /download|\/doc\//i.test(x.h));
    const rank = x => (/datasheet|data ?sheet|specific/i.test(x.t + x.h) ? 0 : 2) + (N(x.h).includes(k) ? 0 : 1) + (/manual|guide|quick|install|certif|declaration/i.test(x.t + x.h) ? 3 : 0);
    return [...new Set(pdf.sort((a, b) => rank(a) - rank(b)).map(x => x.h))].slice(0, 3);
  }
  async function pdfText(u) { const { ct, blob } = await fetchRaw(u); if (!/pdf/.test(ct) && !/\.pdf/i.test(u)) throw new Error('il link non è un PDF'); return await extractText(new File([blob], 'datasheet.pdf')); }

  async function translate(code, text, src) {
    const prompt = `Traduci in italiano il datasheet del prodotto Hikvision «${code}». È il testo estratto da un PDF: può essere disordinato (tabelle spezzate, intestazioni ripetute). Ricostruisci la struttura e traduci in italiano tecnico professionale, come un datasheet ufficiale per installatori.
Regole: non inventare nulla e non aggiungere dati che non ci sono; lascia invariati codici, sigle, unità di misura, numeri, standard (IP67, IK10, H.265+, PoE, ONVIF…) e nomi di funzioni registrati (AcuSense, ColorVu, DarkFighterX…); togli note legali, indirizzi e ripetizioni.
Rispondi SOLO con JSON: {"titolo":"nome del prodotto in italiano","sintesi":"2-4 frasi sulle caratteristiche principali","punti":["punti di forza principali"],"sezioni":[{"titolo":"es. Telecamera, Obiettivo, Video, Rete, Generale","righe":[["voce","valore"]]}]}

TESTO DEL DATASHEET:
<<<
${text.slice(0, 60000)}
>>>`;
    const r = await fetch('/api/claude', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-hp': '1' }, body: JSON.stringify({ max_tokens: 12000, model: 'claude-sonnet-5-5', feat: 'Traduzione datasheet', messages: [{ role: 'user', content: prompt }] }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) { const msg = (j && j.error && j.error.message) || ''; if (/usage limits/i.test(msg)) throw new Error('limite di spesa mensile dell\'API raggiunto'); if (/credit balance/i.test(msg)) throw new Error('credito dell\'API esaurito'); throw new Error(msg || 'traduzione non riuscita'); }
    const t = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n'); const a = t.indexOf('{'), b = t.lastIndexOf('}');
    const out = JSON.parse(t.slice(a, b + 1));
    if (!out || !Array.isArray(out.sezioni)) throw new Error('risposta non valida');
    return { code, ...out, src: src || '', at: Date.now(), by: S.me };
  }

  function view(D) {
    return el('div', { class: 'stack hp-dsit' },
      el('div', { class: 'row', style: 'gap:8px' }, flag(), el('b', { class: 'mono' }, D.code), D.src ? el('a', { class: 'hint', href: D.src, target: '_blank', rel: 'noopener' }, 'originale in inglese ↗') : null),
      el('h2', { style: 'margin:0' }, D.titolo || D.code), D.sintesi ? el('p', { style: 'margin:0' }, D.sintesi) : null,
      (D.punti || []).length ? el('ul', { style: 'margin:0;padding-left:18px' }, D.punti.map(p => el('li', {}, p))) : null,
      ...(D.sezioni || []).map(s => el('section', { class: 'stack', style: 'gap:4px' }, el('h4', { style: 'margin:6px 0 0' }, s.titolo || ''),
        el('table', { class: 'hp-dstbl' }, el('tbody', {}, (s.righe || []).map(r => el('tr', {}, el('th', {}, String(r[0] ?? '')), el('td', {}, String(r[1] ?? '')))))))),
      el('p', { class: 'hint' }, 'Traduzione automatica di 800AI del ' + new Date(D.at || Date.now()).toLocaleDateString('it-IT') + (D.by ? ' (richiesta da ' + nm(D.by) + ')' : '') + ': in caso di dubbio fa fede il datasheet originale.'));
  }
  function printIt(D) {
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const h = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Datasheet ${esc(D.code)} (italiano)</title><style>body{font-family:Arial,Helvetica,sans-serif;color:#1c2430;margin:28px;font-size:11pt}h1{font-size:18pt;margin:0 0 4px}.c{font-family:Consolas,monospace;color:#C8102E;font-weight:700}h2{font-size:12pt;margin:16px 0 4px;border-bottom:2px solid #C8102E;padding-bottom:2px}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:4px 6px;border-bottom:1px solid #e1e5ea;font-size:10pt}th{width:34%;color:#45576A;font-weight:600}.n{color:#6e7a8a;font-size:8.5pt;margin-top:18px}ul{margin:6px 0;padding-left:18px}@media print{body{margin:12mm}}</style></head><body>
<div class="c">${esc(D.code)}</div><h1>${esc(D.titolo || D.code)}</h1><p>${esc(D.sintesi || '')}</p>${(D.punti || []).length ? '<ul>' + D.punti.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>' : ''}
${(D.sezioni || []).map(s => '<h2>' + esc(s.titolo) + '</h2><table>' + (s.righe || []).map(r => '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>').join('') + '</table>').join('')}
<p class="n">Traduzione automatica dal datasheet originale in inglese${D.src ? ' (' + esc(D.src) + ')' : ''}. In caso di dubbio fa fede il documento originale.</p><script>setTimeout(()=>print(),300)<\/script></body></html>`;
    const w = window.open('', '_blank'); if (!w) { toast('Il browser ha bloccato la finestra: consenti i popup per stampare.', 'bad'); return; } w.document.write(h); w.document.close();
  }

  async function run(code, src, getText, box, m) {
    const say = t => box.replaceChildren(el('div', { class: 'row', style: 'gap:8px' }, el('span', { class: 'spin' }), el('span', {}, t)));
    try {
      const text = await getText(say);
      if (!text || text.replace(/\s/g, '').length < 200) throw new Error('nel PDF non c\'è testo leggibile (forse è una scansione)');
      say('800AI sta traducendo il datasheet (circa 30-60 secondi)…');
      const D = await translate(code, text, src);
      await put('dstrad', nk(code), D); S.dsTrad.set(nk(code), D);
      m.close(); open(code, src);
    } catch (e) { box.replaceChildren(el('div', { class: 'banner', style: 'border-color:var(--accent)' }, 'Traduzione non riuscita: ' + (e.message || e)), chooser(code, src, box, m)); }
  }
  // scelta manuale della fonte: un PDF dal computer o un link
  function chooser(code, url, box, m) {
    const fIn = el('input', { type: 'file', accept: '.pdf', hidden: true });
    fIn.addEventListener('change', () => { const f = fIn.files[0]; fIn.value = ''; if (f) run(code, '', async say => { say('Leggo il PDF…'); return extractText(f); }, box, m); });
    const lIn = el('input', { type: 'url', placeholder: 'Link al PDF del datasheet (https://…)', style: 'flex:1;min-width:240px' });
    const go = () => { const u = lIn.value.trim(); if (!/^https?:\/\//i.test(u)) { toast('Incolla un link che inizia con https://', 'bad'); return; } run(code, u, async say => { const pd = await findPdf(code, u, say); if (!pd.length) throw new Error('nel link non ho trovato un PDF'); say('Leggo il PDF…'); return pdfText(pd[0]); }, box, m); };
    lIn.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    const g = 'https://www.google.com/search?q=' + encodeURIComponent('site:hikvision.com ' + code + ' datasheet filetype:pdf');
    return el('div', { class: 'stack', style: 'gap:8px' }, el('p', { class: 'hint', style: 'margin:0' }, 'Scegli il datasheet da tradurre: carica il PDF o incolla il link. ', el('a', { href: g, target: '_blank', rel: 'noopener' }, 'Cercalo su Google ↗')),
      el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, btn('Carica PDF', () => fIn.click(), 'pri', 'up'), lIn, btn('Traduci dal link', go, '', 'ext')), fIn);
  }

  function open(code, url) {
    const D = S.dsTrad.get(nk(code));
    const box = el('div', { class: 'stack' });
    const acts = [];
    const m = modal('Datasheet in italiano · ' + code, box, [el('span', { class: 'grow' }), ...(D ? [btn('Traduci di nuovo', () => { m.close(); fresh(code, url); }, 'ghost'), btn('Stampa / PDF', () => printIt(D), '', 'dl'), btn('Copia testo', () => copy([D.titolo, D.sintesi, ...(D.punti || []).map(p => '• ' + p), ...(D.sezioni || []).flatMap(s => ['', s.titolo.toUpperCase(), ...(s.righe || []).map(r => r[0] + ': ' + r[1])])].filter(x => x != null).join('\n')), '', 'copy')] : []), btn('Chiudi', () => m.close())], { wide: true });
    if (D) { box.append(view(D)); return; }
    fresh(code, url, box, m);
  }
  function fresh(code, url, box, m) {
    if (!box) { box = el('div', { class: 'stack' }); m = modal('Datasheet in italiano · ' + code, box, [el('span', { class: 'grow' }), btn('Chiudi', () => m.close())], { wide: true }); }
    if (url) run(code, url, async say => { const pd = await findPdf(code, url, say); if (!pd.length) throw new Error('nella scheda prodotto del listino non ho trovato il PDF del datasheet'); let last; for (const u of pd) { try { say('Leggo il PDF…'); return await pdfText(u); } catch (e) { last = e; } } throw last; }, box, m);
    else box.replaceChildren(el('p', { style: 'margin:0' }, 'Per ' + code + ' il listino non ha il link alla scheda prodotto.'), chooser(code, '', box, m));
  }
  window.hpTradOpen = open;
  window.hpTradText = (code, text) => { const box = el('div', { class: 'stack' }); const m = modal('Datasheet in italiano · ' + code, box, [el('span', { class: 'grow' }), btn('Chiudi', () => m.close())], { wide: true }); run(code, '', async () => text, box, m); };
})();
