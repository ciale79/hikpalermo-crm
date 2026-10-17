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
    const ytd = +sa[A.own] || sum(m26);
    const sp25 = +F[A.sp] || sum(m25.slice(0, mo)) + (m25[mo] || 0) * cut.getDate() / new Date(Y, mo + 1, 0).getDate();
    const rest25 = Math.max(0, sum(m25) - sp25); // quanto fatturato l'anno scorso dopo questa data
    // crescita: media tra quella da inizio anno e quella degli ultimi 3 mesi chiusi
    const gY = sp25 > 0 ? ytd / sp25 : 1;
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
    const rest = Math.max(rest0, 0.9 * oo), committed = Math.min(rest, 0.9 * oo), proj = ytd + pat + rest;
    const uncertain = Math.max(rest - committed, 0.3 * rest);
    const sigma = Math.max(1, Math.max(0.12, cv) / Math.sqrt(monthsLeft) * uncertain);
    let p = left <= 0 ? (ytd + pat >= target ? 1 : 0) : Phi((proj - target) / sigma);
    if (ytd + pat >= target) p = 1;
    const pNo = pat ? (ytd >= target ? 1 : left <= 0 ? 0 : Phi((proj - pat - target) / sigma)) : null;
    return { area: area || 'si', A, rest0, p: Math.max(0.01, Math.min(0.99, p)), pNo: pNo == null ? null : Math.max(0.01, Math.min(0.99, pNo)), done: ytd + pat >= target, proj, target, ytd, pat, rest, rest25, g, gY, g3, oo, committed, sigma, cv, left: Math.max(0, Math.round(left)), gap: Math.max(0, target - ytd - pat), Y, dataLabel: sa.dataLabel };
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

  window.hpTargetTile = function (area) {
    const m = window.hpTargetModel(area); if (!m) return null; const N = m.A.n;
    const pct = Math.round(m.p * 100);
    const tile = el('button', { type: 'button', class: 'kpi hp-tg hp-tg-' + m.area, title: 'Stima della probabilità di raggiungere il target ' + N + ' ' + m.Y + ': clic per i dettagli del calcolo', onclick: () => detail(m) },
      el('span', { class: 'eyebrow' }, 'Target ' + N + ' ' + m.Y + ' · probabilità'),
      el('div', { class: 'hp-tg-row' }, gauge(m.p, m.area), el('div', { class: 'hp-tg-num', style: { color: colOf(m.area, m.p) } }, m.done ? '✓' : (m.p <= 0.01 ? '<1%' : m.p >= 0.99 ? '>99%' : pct + '%'))),
      el('span', { class: 's' }, m.done ? 'Target raggiunto' : 'Proiezione ' + M(m.proj) + ' su ' + M(m.target)), m.pat ? el('span', { class: 's', style: 'color:var(--violet);font-size:.72rem' }, 'incl. paternità · senza: ' + Math.round(m.pNo * 100) + '%') : m.area === 'it' && m.oo ? el('span', { class: 's', style: 'color:var(--info);font-size:.72rem' }, 'incl. open order ' + M(m.oo)) : null);
    return tile;
  };

  function detail(m) {
    const row = (l, v, h) => el('div', { class: 'hp-tg-dl' }, el('span', {}, l, h ? el('small', { class: 'hint' }, ' ' + h) : null), el('b', { class: 'num' }, v));
    const pct = Math.round(m.p * 100);
    const box = el('div', { class: 'stack' },
      el('div', { class: 'row', style: 'gap:16px;align-items:center' }, gauge(m.p, m.area), el('div', { class: 'stack', style: 'gap:2px' }, el('b', { style: { fontSize: '1.8rem', color: colOf(m.area, m.p), fontFamily: 'var(--font-mono)' } }, m.done ? 'Target raggiunto' : (m.p <= 0.01 ? 'meno dell\'1%' : m.p >= 0.99 ? 'oltre il 99%' : pct + '%')), el('span', { class: 'hint' }, m.done ? '' : 'probabilità stimata di chiudere il ' + m.Y + ' a target'))),
      el('div', { class: 'stack', style: 'gap:0' },
        row('Target ' + m.A.n + ' ' + m.Y, eur0(m.target)),
        row('Fatturato da inizio anno', eur0(m.ytd), 'al ' + (m.dataLabel || '')),
        m.pat ? row('Paternità Team Sicilia', eur0(m.pat), 'inclusa · senza paternità la probabilità è ' + Math.round(m.pNo * 100) + '%') : null,
        row('Mancano al target', eur0(m.gap), m.left + ' giorni a fine anno'),
        row('Resto dell\'anno stimato', eur0(m.rest), m.rest > m.rest0 + 1 ? 'coperto dagli ordini aperti (la stagionalità darebbe ' + eur0(m.rest0) + ')' : 'stesso periodo ' + (m.Y - 1) + ' ' + eur0(m.rest25) + ' × crescita ' + (m.g >= 1 ? '+' : '') + Math.round((m.g - 1) * 100) + '%'),
        row('Proiezione a fine anno', eur0(m.proj)),
        row('Ordini aperti ' + m.A.n, eur0(m.oo), 'inclusi: considerati fatturati al 90% entro fine anno')),
      el('p', { class: 'hint' }, 'Come si calcola: il resto dell\'anno segue la stagionalità del ' + (m.Y - 1) + ' moltiplicata per la crescita attuale (media tra quella da inizio anno, ' + (m.gY >= 1 ? '+' : '') + Math.round((m.gY - 1) * 100) + '%, e quella degli ultimi 3 mesi, ' + (m.g3 >= 1 ? '+' : '') + Math.round((m.g3 - 1) * 100) + '%). L\'incertezza viene dalla variabilità dei mesi ' + m.Y + ' rispetto al ' + (m.Y - 1) + ' ed è più bassa sulla parte già coperta dagli ordini aperti, che contano come fatturato quasi certo (il resto dell\'anno non viene mai stimato sotto il 90% degli open order). È una stima statistica, non una previsione commerciale: si aggiorna a ogni caricamento della Sales Analysis.'));
    const md = modal('Probabilità di chiudere a target · ' + m.A.n, box, [btn('Vai al fatturato', () => { md.close(); window.hpGoFatt ? hpGoFatt(m.A.go) : go('fatt'); }, 'ghost', 'chart'), el('span', { class: 'grow' }), btn('Chiudi', () => md.close())]);
  }
})();
