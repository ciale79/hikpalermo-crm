/* HIK PALERMO — runtime: emula window.claude.use(...) sopra le API del Worker Cloudflare */
(function () {
  'use strict';
  const H = { 'x-hp': '1' };
  let ME = null;
  const meP = fetch('/api/me', { credentials: 'same-origin' }).then(r => { if (r.status === 401) { location.href = '/login'; throw new Error('auth'); } return r.json(); }).then(j => { if (j && j.needPassword) { location.href = '/login?step=pwd'; throw new Error('pwd'); } return (ME = j); });

  function E(code, message) { const e = new Error(message || code); e.code = code; return e; }
  async function call(path, opt = {}) {
    const r = await fetch(path, { credentials: 'same-origin', ...opt, headers: { ...(opt.headers || {}), ...H } });
    if (r.status === 401) { location.href = '/login'; throw E('unauthenticated'); }
    const ct = r.headers.get('content-type') || '';
    const j = ct.includes('json') ? await r.json().catch(() => null) : null;
    if (!r.ok) {
      const c = j && j.error && j.error.code;
      throw E(c === 'permission_denied' ? 'invalid_argument' : (c || 'http_' + r.status), (j && j.error && j.error.message) || ('Errore ' + r.status));
    }
    return j;
  }
  const postJ = (p, b) => call(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const rid = () => { const a = new Uint8Array(15), c = 'abcdefghijklmnopqrstuvwxyz0123456789'; crypto.getRandomValues(a); return [...a].map(x => c[x % 36]).join('').slice(0, 20); };
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));

  /* ---------- cache per collezione ---------- */
  const C = new Map(); // col -> {docs: Map(id -> {data, v}), loaded, loading, subs:Set}
  function coll(col) { let c = C.get(col); if (!c) { c = { docs: new Map(), loaded: false, loading: null, subs: new Set() }; C.set(col, c); } return c; }
  async function load(col, force) {
    const c = coll(col);
    if (c.loaded && !force) return c;
    if (c.loading && !force) return c.loading;
    c.loading = call('/api/db?col=' + encodeURIComponent(col)).then(j => {
      const seen = new Set();
      for (const d of j.docs) { seen.add(d.id); const o = c.docs.get(d.id); if (!o || o.v <= d.v) c.docs.set(d.id, { data: d.data, v: d.v }); }
      for (const id of [...c.docs.keys()]) if (!seen.has(id)) c.docs.delete(id);
      c.loaded = true; c.loading = null; notify(col); return c;
    }).catch(e => { c.loading = null; for (const s of c.subs) s.err && s.err(e); throw e; });
    return c.loading;
  }
  function apply(col, id, data, v) {
    const c = C.get(col); if (!c) return;
    const o = c.docs.get(id);
    if (o && o.v >= v) return;
    if (data == null) { if (!o) return; c.docs.delete(id); }
    else c.docs.set(id, { data, v });
    notify(col);
  }
  function notify(col) { const c = C.get(col); if (!c || !c.loaded) return; for (const s of c.subs) s.run(); }

  function docSnap(id, rec) {
    return { id, exists: !!rec, data: () => rec ? clone(rec.data) : undefined, get: k => rec ? rec.data[k] : undefined, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function qSnap(col, q, prev) {
    const c = coll(col);
    let arr = [...c.docs.entries()].map(([id, r]) => ({ id, r }));
    if (q.order) { const [f, dir] = q.order; const m = dir === 'desc' ? -1 : 1; arr.sort((a, b) => { const x = a.r.data?.[f], y = b.r.data?.[f]; return (x > y ? 1 : x < y ? -1 : 0) * m; }); }
    if (q.lim) arr = arr.slice(0, q.lim);
    const docs = arr.map(x => docSnap(x.id, x.r));
    const cur = new Map(arr.map(x => [x.id, x.r.v]));
    const changes = [];
    arr.forEach((x, i) => { if (!prev.has(x.id)) changes.push({ type: 'added', doc: docs[i], newIndex: i, oldIndex: -1 }); else if (prev.get(x.id) !== x.r.v) changes.push({ type: 'modified', doc: docs[i], newIndex: i }); });
    for (const [id] of prev) if (!cur.has(id)) changes.push({ type: 'removed', doc: docSnap(id, null), oldIndex: 0, newIndex: -1 });
    return { snap: { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f), docChanges: () => changes, metadata: { fromCache: false, hasPendingWrites: false } }, cur, changed: changes.length > 0 };
  }

  /* ---------- riferimenti ---------- */
  function splitPath(p) { const s = String(p).split('/').filter(Boolean); return { col: s.slice(0, -1).join('/'), id: s.at(-1) }; }
  function DocRef(col, id) {
    id = id || rid();
    const self = {
      id, path: col + '/' + id, parent: null,
      collection: sub => CollRef(col + '/' + id + '/' + sub),
      async get() { const c = await load(col); return docSnap(id, c.docs.get(id)); },
      async set(data, opt) { if (opt && opt.merge) return self.update(data); return write('set', col, id, clone(data)); },
      async update(data) { return write('update', col, id, clone(data)); },
      async delete() { return write('delete', col, id); },
      onSnapshot(next, errf) {
        if (typeof next === 'object' && next) { errf = next.error; next = next.next; }
        const c = coll(col); let last;
        const sub = { run() { const r = c.docs.get(id); const v = r ? r.v : 0; if (v === last) return; last = v; try { next(docSnap(id, r)); } catch (e) { console.error(e); } }, err: errf };
        c.subs.add(sub);
        if (c.loaded) sub.run(); else load(col).catch(e => errf && errf(e));
        return () => c.subs.delete(sub);
      }
    };
    return self;
  }
  function CollRef(col, q = {}) {
    const self = {
      id: col.split('/').at(-1), path: col,
      doc: id => DocRef(col, id),
      async add(data) { const r = DocRef(col); await r.set(data); return r; },
      orderBy: (f, dir = 'asc') => CollRef(col, { ...q, order: [f, dir] }),
      limit: n => CollRef(col, { ...q, lim: n }),
      where() { throw E('unimplemented', 'where non supportato'); },
      async get() { await load(col); return qSnap(col, q, new Map()).snap; },
      onSnapshot(next, errf) {
        if (typeof next === 'object' && next) { errf = next.error; next = next.next; }
        const c = coll(col); let prev = new Map(), first = true;
        const sub = { run() { const r = qSnap(col, q, prev); if (!first && !r.changed) return; first = false; prev = r.cur; try { next(r.snap); } catch (e) { console.error(e); } }, err: errf };
        c.subs.add(sub);
        if (c.loaded) sub.run(); else load(col).catch(e => errf && errf(e));
        return () => c.subs.delete(sub);
      }
    };
    return self;
  }
  async function write(op, col, id, data) {
    const j = await postJ('/api/write', { op, col, id, data });
    coll(col);
    apply(col, id, op === 'delete' ? null : j.data, j.v);
    return undefined;
  }
  /* area ProAV (proav.hikpalermo.com): commesse, offerte, calendario, magazzino, demo e attività hanno raccolte proprie
     (proavCommesse, proavEventi…), riservate ai membri ProAV. Un «!» davanti al nome forza la raccolta del gruppo. */
  // archivio scelto da chi usa ProAV: «pav» (privato, predefinito) oppure «grp» (quello di tutto il gruppo)
  const PAV = /^proav\./i.test(location.hostname) && (() => { try { return localStorage.getItem('hp_pavSpace') !== 'grp'; } catch (e) { return true; } })();
  const PAVMAP = { commesse: 'proavCommesse', offerte: 'proavOfferte', eventi: 'proavEventi', magazzino: 'proavMagazzino', demo: 'proavDemo', feed: 'proavFeed' };
  const mapCol = p => { p = String(p).replace(/^\/|\/$/g, ''); if (p.startsWith('!')) return p.slice(1); if (!PAV) return p; const s = p.split('/'); if (PAVMAP[s[0]]) s[0] = PAVMAP[s[0]]; return s.join('/'); };
  const db = { collection: p => CollRef(mapCol(p)), doc: p => { const s = splitPath(mapCol(p)); return DocRef(s.col, s.id); } };

  /* ---------- tempo reale ---------- */
  let ws = null, wsOk = false, retry = 1000, pingT = null;
  function connect() {
    try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/ws'); } catch (e) { return later(); }
    ws.onopen = () => { const was = wsOk; wsOk = true; retry = 1000; if (was === false && C.size) resync(); clearInterval(pingT); pingT = setInterval(() => { try { ws.send('ping'); } catch { } }, 25000); };
    ws.onmessage = ev => { if (ev.data === 'pong') return; let m; try { m = JSON.parse(ev.data); } catch { return; } if (m && m.reload) { const c = C.get(m.reload); if (c && c.loaded) load(m.reload, true).catch(() => { }); return; } if (m && m.col) apply(m.col, m.id, m.data, m.v); };
    ws.onclose = () => { wsOk = false; clearInterval(pingT); later(); };
    ws.onerror = () => { try { ws.close(); } catch { } };
  }
  function later() { setTimeout(connect, retry); retry = Math.min(retry * 2, 30000); }
  function resync() { for (const [col, c] of C) if (c.loaded && c.subs.size) load(col, true).catch(() => { }); }
  setInterval(() => { if (!wsOk) resync(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resync(); });
  meP.then(connect).catch(() => { });

  /* ---------- utente ---------- */
  const user = {
    id: async () => (await meP).id,
    me: async () => { const m = await meP; return { id: m.id, name: m.name, email: m.email, avatarUrl: m.foto ? '/_blob/' + m.foto : null }; },
    can: async () => true,
    isOwner: async () => !!(await meP).owner,
    canEdit: async () => { const m = await meP; return !!(m.admin || m.owner); },
    profiles: async ids => postJ('/api/profiles', { ids }),
    search: async q => call('/api/users/search?q=' + encodeURIComponent(q || ''))
  };

  /* ---------- file ---------- */
  const assets = {
    async upload(file, opt = {}) {
      const type = opt.type || file.type || 'application/octet-stream';
      if (file.size > 20 * 1024 * 1024) throw E('too_large');
      return call('/api/blob', { method: 'POST', headers: { 'content-type': type, 'x-name': encodeURIComponent(file.name || 'file') }, body: file });
    },
    async delete(id) { return call('/api/blob/' + id, { method: 'DELETE' }); },
    url: id => '/_blob/' + id
  };
  const downloads = {
    async save({ filename, data }) {
      const b = data instanceof Blob ? data : new Blob([data]);
      const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = filename || 'file'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 5000); return true;
    }
  };

  /* ---------- 800AI (analisi capitolati) ---------- */
  async function runClaude(prompt, opt = {}) {
    const tools = opt.tools || [];
    const defs = tools.map(t => ({ name: t.name, description: t.description || '', input_schema: t.inputSchema || t.input_schema || { type: 'object', properties: {} } }));
    const messages = [{ role: 'user', content: String(prompt) }];
    const maxRounds = opt.maxRounds || 8;
    for (let round = 0; round <= maxRounds; round++) {
      if (opt.signal && opt.signal.aborted) throw E('aborted', 'Annullato');
      const body = { messages, max_tokens: opt.maxTokens || 16000, feat: opt.feat || '800AI' };
      if (defs.length) { body.tools = defs; if (round === maxRounds) body.tool_choice = { type: 'none' }; }
      const r = await fetch('/api/claude', { method: 'POST', credentials: 'same-origin', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: opt.signal });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = (j && j.error && j.error.message) || '';
        // limite di spesa impostato nella Console Anthropic: messaggio chiaro in italiano
        if (/usage limits/i.test(msg)) { const d = /on (\d{4}-\d{2}-\d{2})/.exec(msg); throw E('limite_api', 'limite di spesa mensile dell\'API raggiunto' + (d ? ', si sblocca il ' + d[1].split('-').reverse().join('/') : '') + ' oppure alzando il limite nella Console Anthropic'); }
        if (/credit balance/i.test(msg)) throw E('credito_api', 'credito dell\'API esaurito: ricarica dalla Console Anthropic');
        throw E((j && j.error && (j.error.code || j.error.type)) || 'http_' + r.status, msg || 'Errore 800AI');
      }
      const content = j.content || [];
      const uses = content.filter(b => b.type === 'tool_use');
      if (j.stop_reason === 'tool_use' && uses.length) {
        // si rimanda indietro solo ciò che l'API accetta: niente blocchi di testo vuoti
        messages.push({ role: 'assistant', content: content.filter(b => !(b.type === 'text' && !String(b.text || '').trim())) });
        const results = [];
        for (const u of uses) {
          const t = tools.find(x => x.name === u.name);
          let out, isErr = false;
          try { out = t ? await t.execute(u.input || {}) : 'Strumento sconosciuto'; } catch (e) { out = 'Errore: ' + (e && e.message || e); isErr = true; }
          let txt = typeof out === 'string' ? out : JSON.stringify(out); if (!txt || !String(txt).trim()) txt = 'Nessun risultato'; if (txt.length > 60000) txt = txt.slice(0, 60000);
          results.push({ type: 'tool_result', tool_use_id: u.id, content: txt, ...(isErr ? { is_error: true } : {}) });
        }
        messages.push({ role: 'user', content: results });
        continue;
      }
      return content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    }
    throw E('too_many_rounds');
  }
  function parseJsonLoose(t) {
    let s = String(t || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(s); } catch { }
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { } }
    throw E('invalid_json', 'Risposta non in formato JSON');
  }
  const sample = Object.assign((p, o) => runClaude(p, o), { text: runClaude, json: async (p, o) => parseJsonLoose(await runClaude(p, o)) });

  const RES = { db, user, assets, downloads, sample };
  window.claude = { use: async name => { if (name in RES) { if (name !== 'downloads' && name !== 'sample') await meP; return RES[name]; } return null; } };
  window.HIK_CF = { me: () => meP, call, postJ, logout: async () => { try { await postJ('/api/auth/logout', {}); } catch { } location.href = '/login'; } };
})();
