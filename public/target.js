/* HIK PALERMO — stima della probabilità di chiudere l'anno a target in Sicilia (prodotti propri, Sales Analysis).
   Modello: fatturato da inizio anno + resto dell'anno stimato sulla stagionalità dell'anno scorso × crescita attuale;
   incertezza dalla variabilità mensile 2026/2025, ridotta dagli ordini aperti (già acquisiti) → probabilità normale. */
(function () {
  'use strict';
  const erf = x => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; };
  const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
  const sum = a => a.reduce((t, v) => t + (+v || 0), 0);

  const AREA = { si: { n: 'Sicilia', m: 'si', own: 'siciliaOwn', t: 'targetSicilia', sp: 'siSp25', oo: 'sicilia', go: 'sicilia', pat: true }, it: { n: 'Italia', m: 'it', own: 'italiaOwn', t: 'targetItalia', sp: 'itSp25', oo: 'italia', go: 'italia', pat: false } };
  window.hpTargetModel = function (area) {
    const A = AREA[area || 'si']; const F = S.fatt, sa = S.sales; if (!F || !sa || !F.m || !sa[A.t]) return null;
    const m26 = F.m[A.m + '_m26'] || [], m25 = F.m[A.m + '_m25'] || [];
    const Y = +sa.anno || new Date().getFullYear();
    const cut = new Date((F.cut || sa.data || '') + 'T12:00'); if (isNaN(cut)) return null;
    const mo = cut.getMonth(); // mese in corso (parziale)
    const X = area === 'it' && sa.itExtra ? sa.itExtra : null; // altri canali/BU indicati a mano (non nel file)
    const ytd = +sa[A.own] || sum(m26); const ytdF = ytd - (X ? X.tot : 0);
    const sp25 = +F[A.sp] || sum(m25.slice(0, mo)) + (m25[mo] || 0) * cut.getDate() / new Date(Y, mo + 1, 0).getDate();
    const rest25 = Math.max(0, sum(m25) - sp25); // quanto fatturato l'anno scorso dopo questa data
    // crescita: media tra quella da inizio anno e quella degli ultimi 3 mesi chiusi
    const gY = sp25 > 0 ? ytdF / sp25 : 1;
    const l3a = sum(m26.slice(Math.max(0, mo - 3), mo)), l3b = sum(m25.slice(Math.max(0, mo - 3), mo));
    const g3 = l3b > 0 ? l3a / l3b : gY;
    const g = Math.max(0.5, Math.min(2, (gY + g3) / 2));
    const rest0 = rest25 * g;
    // paternità Team Sicilia (se inclusa nei totali)
    const pat = A.pat && window.hpPatTot && window.hpPatOn && window.hpPatOn() ? window.hpPatTot(Y) : 0;
    const target = +sa[A.t];
    
    // incertezza: variabilità dei rapporti mensili 2026/2025 sui mesi chiusi, scalata sui mesi che mancano
    const r = []; for (let i = 0; i < mo; i++) if (m25[i] > 0 && m26[i] > 0) r.push(m26[i] / m25[i]);
    const mean = r.length ? sum(r) / r.length : 1;
    const cv = r.length > 2 ? Math.sqrt(sum(r.map(x => (x - mean) ** 2)) / (r.length - 1)) / mean : 0.35;
    const left = (new Date(Y, 11, 31, 23) - cut) / 864e5, monthsLeft = Math.max(0.25, left / 30.4);
    const oo = +(F.oo && F.oo[A.oo]) || 0;
    // gli ordini aperti sono fatturato quasi certo entro fine anno: il resto dell'anno non può stimarsi sotto di essi
    // altri canali/BU: proseguono allo stesso ritmo medio del periodo indicato
    const xDays = X ? (new Date(Y, X.finoQ * 3, 0) - new Date(Y, 0, 0)) / 864e5 : 0, xRest = X && xDays > 0 ? X.tot / xDays * Math.max(0, (new Date(Y, 11, 31, 23) - cut) / 864e5) : 0;
    const restF = Math.max(rest0, 0.9 * oo), rest = restF + xRest, committed = Math.min(restF, 0.9 * oo), proj = ytd + pat + rest;
    const uncertain = Math.max(restF - committed, 0.3 * restF) + xRest * 0.6;
    const sigma = Math.max(1, Math.max(0.12, cv) / Math.sqrt(monthsLeft) * uncertain);
    let p = left <= 0 ? (ytd + pat >= target ? 1 : 0) : Phi((proj - target) / sigma);
    if (ytd + pat >= target) p = 1;
    const pNo = pat ? (ytd >= target ? 1 : left <= 0 ? 0 : Phi((proj - pat - target) / sigma)) : null;
    return { area: area || 'si', A, rest0, X, xRest, restF, ytdF, p: Math.max(0.01, Math.min(0.99, p)), pNo: pNo == null ? null : Math.max(0.01, Math.min(0.99, pNo)), done: ytd + pat >= target, proj, target, ytd, pat, rest, rest25, g, gY, g3, oo, committed, sigma, cv, left: Math.max(0, Math.round(left)), gap: Math.max(0, target - ytd - pat), Y, dataLabel: sa.dataLabel };
  };

  const col0 = p => p >= 0.65 ? 'var(--ok)' : p >= 0.35 ? 'var(--warn)' : 'var(--bad)';
  // Italia in blu (intensità in base alla probabilità), Sicilia a semaforo
  const colOf = (area, p) => area === 'it' ? (p >= 0.65 ? 'var(--info)' : p >= 0.35 ? 'color-mix(in srgb, var(--info) 75%, var(--violet))' : 'var(--violet)') : col0(p);
  function gauge(p, area) { const col = () => colOf(area, p);
    const W = 120, R = 50, cx = 60, cy = 56, a = Math.PI * (1 - p);
    const x = cx + R * Math.cos(a), y = cy - R * Math.sin(a);
    const svg = `<svg viewBox="0 0 ${W} 64" width="120" height="64" aria-hidden="true">
      <path d="M10 56 A50 50 0 0 1 110 56" fill="none" stroke="var(--line)" stroke-width="10" stroke-linecap="round"/>
      ${p > 0.005 ? `<path d="M10 56 A50 50 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}" fill="none" stroke="${col()}" stroke-width="10" stroke-linecap="round"/>` : ''}
      ${[0.35, 0.65].map(t => { const b = Math.PI * (1 - t); return `<line x1="${(cx + 41 * Math.cos(b)).toFixed(1)}" y1="${(cy - 41 * Math.sin(b)).toFixed(1)}" x2="${(cx + 45 * Math.cos(b)).toFixed(1)}" y2="${(cy - 45 * Math.sin(b)).toFixed(1)}" stroke="var(--ink-3)" stroke-width="1.5"/>`; }).join('')}
    </svg>`;
    const s = el('span', { class: 'hp-tg-g' }); s.innerHTML = svg; return s;
  }
  const M = v => (v / 1e6).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M€';

  // riquadro del cruscotto: percentuale di raggiungimento del target annuo (la tacca indica dove si dovrebbe essere oggi)
  const achCol = (area, r, exp) => area === 'it' ? (r >= exp ? 'var(--info)' : r >= exp * 0.85 ? 'color-mix(in srgb, var(--info) 70%, var(--violet))' : 'var(--violet)') : (r >= exp ? 'var(--ok)' : r >= exp * 0.85 ? 'var(--warn)' : 'var(--bad)');
  function gaugeAch(r, exp, color, r2) {
    const arc = (f0, f1, st, w, extra) => { f0 = Math.max(0, Math.min(1, f0)); f1 = Math.max(0, Math.min(1, f1)); if (f1 - f0 < 0.004) return ''; const P = f => [60 + 50 * Math.cos(Math.PI * (1 - f)), 56 - 50 * Math.sin(Math.PI * (1 - f))]; const [x0, y0] = P(f0), [x1, y1] = P(f1); return `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} A50 50 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}" fill="none" stroke="${st}" stroke-width="${w}" ${extra || ''}/>`; };
    const cx = 60, cy = 56, b = Math.PI * (1 - Math.min(1, exp));
    const s = el('span', { class: 'hp-tg-g' });
    s.innerHTML = `<svg viewBox="0 0 120 64" width="120" height="64" aria-hidden="true">
      <path d="M10 56 A50 50 0 0 1 110 56" fill="none" stroke="var(--line)" stroke-width="10" stroke-linecap="round"/>
      ${r2 != null ? arc(r, r2, color, 10, 'stroke-opacity=".38"') : ''}
      ${arc(0, r, color, 10, 'stroke-linecap="round"')}
      <line x1="${(cx + 39 * Math.cos(b)).toFixed(1)}" y1="${(cy - 39 * Math.sin(b)).toFixed(1)}" x2="${(cx + 59 * Math.cos(b)).toFixed(1)}" y2="${(cy - 59 * Math.sin(b)).toFixed(1)}" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
    return s;
  }
  const expOf = m => { const cut = new Date((S.fatt.cut || S.sales.data) + 'T12:00'); return (cut - new Date(m.Y, 0, 1)) / (new Date(m.Y + 1, 0, 1) - new Date(m.Y, 0, 1)); };
  const pc = v => (v * 100).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  // open order inclusi o esclusi dall'indicatore (scelta di chi guarda, per area, ricordata nel browser)
  const ooOn = area => { try { return localStorage.getItem('hp_tgOO_' + area) !== '0'; } catch (e) { return true; } };
  const setOO = (area, v) => { try { localStorage.setItem('hp_tgOO_' + area, v ? '1' : '0'); } catch (e) { } };
  // scostamento dal caricamento di confronto (fatturato e, se inclusi, open order) in euro e in punti di target
  function cmpLine(m, withOO) {
    const C = window.hpCmp && window.hpCmp(); if (!C) return null;
    const pv = +C.sales[m.A.own] || 0, po = +((C.F.oo || {})[m.A.oo]) || 0;
    const now = m.ytd + (withOO ? m.oo : 0), was = pv + (withOO ? po : 0);
    const pt = (now - was) / m.target * 100;
    return el('span', { class: 's', style: 'font-size:.72rem', title: (withOO ? 'Fatturato + open order' : 'Fatturato') + ' ' + m.A.n + ': ' + eur0(was) + ' al ' + C.dataLabel + ' → ' + eur0(now) }, window.hpDelta(now, was, { noLab: true, what: m.A.n }), ' ', el('span', { class: 'hint', style: 'font-size:.7rem' }, (pt >= 0 ? '+' : '−') + Math.abs(pt).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' pt ' + C.lab));
  }
  window.hpTargetTile = function (area) {
    const m = window.hpTargetModel(area); if (!m) return null; const N = m.A.n; const withOO = ooOn(m.area);
    const v = m.ytd + m.pat, r = v / m.target, vo = v + (withOO ? m.oo : 0), ro = vo / m.target;
    const exp = expOf(m);
    const color = achCol(m.area, ro, exp);
    const note = m.area === 'si' && m.pat ? el('span', { class: 's', style: 'color:var(--violet);font-size:.72rem' }, 'incl. paternità ' + M(m.pat) + ' · senza: ' + pc(m.ytd / m.target))
      : m.area === 'it' && m.X ? el('span', { class: 's', style: 'color:var(--warn);font-size:.72rem', title: 'Q1–Q' + m.X.finoQ + ' allineato al totale indicato da ' + m.X.fonte + '; la parte oltre la Sales Analysis non è riscontrata' }, 'Q1–Q' + m.X.finoQ + ' ' + M(m.ytd - (S.sales.italiaOwnQ || []).slice(m.X.finoQ).reduce((a, b) => a + (+b || 0), 0)) + ' come da ' + m.X.fonte + ' · non riscontrato') : null;
    const tog = el('button', { type: 'button', class: 'hp-capnew hp-ootog' + (withOO ? ' on' : ''), 'aria-pressed': String(withOO), title: withOO ? 'Togli gli open order (' + M(m.oo) + ') dall\'indicatore' : 'Aggiungi gli open order (' + M(m.oo) + ') all\'indicatore', onclick: e => { e.stopPropagation(); setOO(m.area, !withOO); const n = window.hpTargetTile(area); if (n) tile.replaceWith(n); } }, withOO ? '✓ Open order' : '+ Open order');
    const tile = el('div', { class: 'kpi hp-tg hp-tg-' + m.area, role: 'button', tabindex: '0', title: 'Raggiungimento del target ' + N + ' ' + m.Y + (withOO ? ' contando fatturato e ordini aperti (parte chiara dell\'arco)' : ' sul solo fatturato') + '. La tacca nera indica il ritmo atteso a oggi (' + pc(exp) + ' dell\'anno trascorso). Clic per il dettaglio e la proiezione a fine anno.', onclick: () => detail(m), onkeydown: e => { if (e.key === 'Enter') detail(m); } },
      el('div', { class: 'row between', style: 'gap:6px;flex-wrap:nowrap' }, el('span', { class: 'eyebrow' }, 'Target ' + N + ' ' + m.Y), tog),
      el('div', { class: 'hp-tg-row' }, gaugeAch(r, exp, color, withOO ? ro : null), el('div', { class: 'stack', style: 'gap:0' }, el('div', { class: 'hp-tg-num', style: { color } }, pc(ro)), el('small', { class: 'hint', style: 'font-size:.68rem;white-space:nowrap' }, withOO ? 'incl. open order' : 'solo fatturato'))),
      el('span', { class: 's' }, M(vo) + ' di ' + M(m.target)), el('span', { class: 's', style: 'font-size:.72rem' }, withOO ? 'Fatturato ' + pc(r) + ' + open order ' + M(m.oo) : 'Con open order sarebbe ' + pc((v + m.oo) / m.target)), note, cmpLine(m, withOO));
    return tile;
  };

  window.hpItExtraForm = function () {
    const x = (S.config || {}).italiaExtra || {};
    const imp = el('input', { type: 'number', step: '1000', min: '0', value: x.totale || '' }), fino = selectEl('itxQ', [['1', 'Q1'], ['2', 'Q1–Q2'], ['3', 'Q1–Q3'], ['4', 'Q1–Q4']], String(x.finoQ || 3));
    const fonte = el('input', { type: 'text', value: x.fonte || 'Max' }), nota = el('input', { type: 'text', value: x.nota || 'Altri canali e BU non presenti nella Sales Analysis (non ne abbiamo riscontro)' });
    const m = modal('Italia · altri canali e BU', el('div', { class: 'stack' }, el('p', { class: 'hint' }, 'Totale Italia del periodo indicato da chi ha i dati completi (es. Max). La differenza rispetto alla Sales Analysis (altri canali e BU: distribuzione IT, HikRobot…) viene sommata al totale Italia e ripartita sui trimestri in proporzione al fatturato del file. Lascia vuoto per toglierlo.'),
      el('div', { class: 'grid2' }, fld('Totale Italia del periodo (€)', imp), fld('Periodo', fino)), el('div', { class: 'grid2' }, fld('Indicato da', fonte), fld('Nota', nota))), [el('span', { class: 'grow' }), btn('Annulla', () => m.close()), btn('Salva', async () => {
        const v = +imp.value || 0;
        if (await put('config', 'app', { ...S.config, italiaExtra: v ? { totale: v, finoQ: +fino.value, fonte: fonte.value.trim() || 'Max', nota: nota.value.trim(), at: Date.now(), by: S.me } : null })) { m.close(); toast(v ? 'Totale Italia aggiornato' : 'Totale indicato rimosso'); }
      }, 'pri', 'check')]);
  };
  function detail(m) {
    const row = (l, v, h) => el('div', { class: 'hp-tg-dl' }, el('span', {}, l, h ? el('small', { class: 'hint' }, ' ' + h) : null), el('b', { class: 'num' }, v));
    const pct = Math.round(m.p * 100);
    const box = el('div', { class: 'stack' },
      el('div', { class: 'row', style: 'gap:16px;align-items:center' }, gaugeAch((m.ytd + m.pat) / m.target, expOf(m), achCol(m.area, (m.ytd + m.pat + m.oo) / m.target, expOf(m)), (m.ytd + m.pat + m.oo) / m.target), el('div', { class: 'stack', style: 'gap:2px' }, el('b', { style: { fontSize: '1.8rem', color: achCol(m.area, (m.ytd + m.pat + m.oo) / m.target, expOf(m)), fontFamily: 'var(--font-mono)' } }, pc((m.ytd + m.pat + m.oo) / m.target) + ' del target'), el('span', { class: 'hint' }, 'con gli open order · solo fatturato ' + pc((m.ytd + m.pat) / m.target)), el('span', { class: 'hint' }, m.done ? 'Target raggiunto' : 'Probabilità stimata di chiudere il ' + m.Y + ' a target: ' + (m.p <= 0.01 ? 'meno dell\'1%' : m.p >= 0.99 ? 'oltre il 99%' : pct + '%') + ' (proiezione ' + M(m.proj) + ')'))),
      el('div', { class: 'stack', style: 'gap:0' },
        row('Target ' + m.A.n + ' ' + m.Y, eur0(m.target)),
        m.X ? row('Fatturato da Sales Analysis', eur0(m.ytdF), 'al ' + (m.dataLabel || '')) : row('Fatturato da inizio anno', eur0(m.ytd), 'al ' + (m.dataLabel || '')),
        m.X ? el('div', { class: 'hp-tg-dl', style: 'background:color-mix(in srgb,var(--warn) 8%,transparent);padding:7px 8px;border-radius:6px' }, el('span', {}, 'Altri canali e BU fino al Q' + m.X.finoQ, el('small', { class: 'hint' }, (m.X.totale ? ' per arrivare al totale Q1–Q' + m.X.finoQ + ' di ' + eur0(m.X.totale) : '') + ' indicato da ' + m.X.fonte + ' · non ne abbiamo riscontro nella Sales Analysis'), isAdmin() ? el('a', { href: '#', class: 'hint', style: 'margin-left:6px', onclick: e => { e.preventDefault(); md.close(); window.hpItExtraForm(); } }, 'modifica') : null), el('b', { class: 'num', style: 'color:var(--warn)' }, eur0(m.X.tot))) : (m.area === 'it' && isAdmin() ? el('a', { href: '#', class: 'hint', onclick: e => { e.preventDefault(); md.close(); window.hpItExtraForm(); } }, '+ Aggiungi fatturato di altri canali/BU non presenti nel file') : null),
        m.X ? row('Fatturato da inizio anno', eur0(m.ytd), 'compresi gli altri canali/BU') : null,
        m.pat ? row('Paternità Team Sicilia', eur0(m.pat), 'inclusa · senza paternità la probabilità è ' + Math.round(m.pNo * 100) + '%') : null,
        row('Fatturato + open order', eur0(m.ytd + m.pat + m.oo), 'open order ' + eur0(m.oo)),
        row('Mancano al target', eur0(m.gap), 'solo fatturato · con gli open order ' + eur0(Math.max(0, m.gap - m.oo)) + ' · ' + m.left + ' giorni a fine anno'),
        m.X ? row('Altri canali/BU nel resto dell\'anno', eur0(m.xRest), 'stesso ritmo medio di Q1–Q' + m.X.finoQ) : null,
        row('Resto dell\'anno stimato' + (m.X ? ' (Sales Analysis)' : ''), eur0(m.restF), m.restF > m.rest0 + 1 ? 'coperto dagli ordini aperti (la stagionalità darebbe ' + eur0(m.rest0) + ')' : 'stesso periodo ' + (m.Y - 1) + ' ' + eur0(m.rest25) + ' × crescita ' + (m.g >= 1 ? '+' : '') + Math.round((m.g - 1) * 100) + '%'),
        row('Proiezione a fine anno', eur0(m.proj)),
        row('Ordini aperti ' + m.A.n, eur0(m.oo), 'inclusi: considerati fatturati al 90% entro fine anno')),
      el('p', { class: 'hint' }, 'Come si calcola: il resto dell\'anno segue la stagionalità del ' + (m.Y - 1) + ' moltiplicata per la crescita attuale (media tra quella da inizio anno, ' + (m.gY >= 1 ? '+' : '') + Math.round((m.gY - 1) * 100) + '%, e quella degli ultimi 3 mesi, ' + (m.g3 >= 1 ? '+' : '') + Math.round((m.g3 - 1) * 100) + '%). L\'incertezza viene dalla variabilità dei mesi ' + m.Y + ' rispetto al ' + (m.Y - 1) + ' ed è più bassa sulla parte già coperta dagli ordini aperti, che contano come fatturato quasi certo (il resto dell\'anno non viene mai stimato sotto il 90% degli open order). È una stima statistica, non una previsione commerciale: si aggiorna a ogni caricamento della Sales Analysis.'));
    const md = modal('Target ' + m.A.n + ' ' + m.Y, box, [btn('Vai al fatturato', () => { md.close(); window.hpGoFatt ? hpGoFatt(m.A.go) : go('fatt'); }, 'ghost', 'chart'), el('span', { class: 'grow' }), btn('Chiudi', () => md.close())]);
  }
})();
