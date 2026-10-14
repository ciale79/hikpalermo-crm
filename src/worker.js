// HIK PALERMO CRM — Cloudflare Worker
// Auth con codice via email (Resend), dati in D1, file in R2, tempo reale con Durable Object,
// promemoria giornalieri con Cron, proxy verso Claude per l'analisi dei capitolati.
import seed from '../seed/data.json';

const SESSION_DAYS = 60;
const OTP_MIN = 10;
const MAX_UPLOAD = 20 * 1024 * 1024;
const PUBLIC_PATHS = new Set(['/login', '/login.html', '/favicon.svg', '/robots.txt']);
const TZ = 'Europe/Rome';

/* ---------------- utility ---------------- */
const enc = new TextEncoder();
const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...h } });
const err = (code, msg, s = 400) => json({ error: { code, message: msg } }, s);
const now = () => Date.now();
async function sha256(s) { const b = await crypto.subtle.digest('SHA-256', enc.encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
function rnd(n = 32) { const a = new Uint8Array(n); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function rndHex(n = 16) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); }
function rndId(p = 'u_') { return p + rnd(16); }
const normEmail = e => String(e || '').trim().toLowerCase();
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 200;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function cookie(req, name) { const c = req.headers.get('cookie') || ''; for (const p of c.split(/;\s*/)) { const i = p.indexOf('='); if (i > 0 && p.slice(0, i) === name) return decodeURIComponent(p.slice(i + 1)); } return null; }
function parse(s) { try { return JSON.parse(s); } catch { return null; } }

/* ---------------- dati ---------------- */
async function getDoc(env, col, id) {
  const r = await env.DB.prepare('SELECT data, version FROM docs WHERE col=? AND id=?').bind(col, id).first();
  return r ? { data: parse(r.data), v: r.version } : null;
}
async function teamByEmail(env, email) {
  const r = await env.DB.prepare("SELECT id, data FROM docs WHERE col='team' AND lower(json_extract(data,'$.email'))=?").bind(email).first();
  return r ? { id: r.id, data: parse(r.data) } : null;
}
async function ruoli(env) { return (await getDoc(env, 'config', 'ruoli'))?.data || {}; }
async function isAdmin(env, u) {
  if (!u) return false;
  if (u.email === normEmail(env.OWNER_EMAIL)) return true;
  const r = await ruoli(env);
  return r.owner === u.id || (r.ruoli || {})[u.id] === 'admin' || (r.ruoli || {})[u.id] === 'owner';
}
async function emailOf(env, id) {
  const t = await getDoc(env, 'team', id);
  if (t?.data?.email) return normEmail(t.data.email);
  const u = await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(id).first();
  return u?.email || null;
}
async function nameOf(env, id) {
  const t = await getDoc(env, 'team', id);
  if (t?.data) return t.data.nomeVis || t.data.nome || null;
  const u = await env.DB.prepare('SELECT name FROM users WHERE id=?').bind(id).first();
  return u?.name || null;
}

/* ---------------- sessioni ---------------- */
async function currentUser(req, env) {
  const tok = cookie(req, 'hp_s');
  if (!tok) return null;
  const h = await sha256(tok);
  const r = await env.DB.prepare("SELECT u.id, u.email, u.name, u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?").bind(h, now()).first();
  if (!r || r.status !== 'active') return null;
  return r;
}
async function newSession(env, uid) {
  const tok = rnd(32);
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires,created) VALUES(?,?,?,?)').bind(await sha256(tok), uid, now() + SESSION_DAYS * 864e5, now()).run();
  return `hp_s=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

/* ---------------- email (Resend) ---------------- */
function mailShell(title, body, cta) {
  return `<!doctype html><html><body style="margin:0;background:#F2F4F6;font-family:Segoe UI,Arial,sans-serif;color:#14212C">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F6;padding:24px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #D3DAE1">
<tr><td style="background:#14212C;padding:16px 24px;font-size:20px;font-weight:800;font-style:italic;color:#fff;letter-spacing:.5px"><span style="color:#E8384F">HIK</span> PALERMO</td></tr>
<tr><td style="height:4px;background:#C8102E"></td></tr>
<tr><td style="padding:24px"><h2 style="margin:0 0 12px;font-size:18px">${title}</h2>${body}
${cta ? `<p style="margin:24px 0 0"><a href="${cta[1]}" style="background:#C8102E;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;display:inline-block">${esc(cta[0])}</a></p>` : ''}
</td></tr><tr><td style="padding:12px 24px;font-size:12px;color:#768797;border-top:1px solid #E3E8ED">Messaggio automatico del CRM HIK PALERMO · hikpalermo.com</td></tr>
</table></td></tr></table></body></html>`;
}
async function sendMail(env, { to, subject, html, text, attachments, kind = 'info' }) {
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!list.length) return false;
  let ok = 0, e = null;
  try {
    if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY mancante');
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM || 'HIK PALERMO <notifiche@hikpalermo.com>', to: list, subject, html, text, attachments })
    });
    if (r.ok) ok = 1; else e = r.status + ' ' + (await r.text()).slice(0, 300);
  } catch (x) { e = String(x && x.message || x); }
  try { await env.DB.prepare('INSERT INTO mail_log(id,at,kind,to_addr,subject,ok,err) VALUES(?,?,?,?,?,?,?)').bind(rndHex(8), now(), kind, list.join(','), subject, ok, e).run(); } catch { }
  return !!ok;
}

/* ---------------- calendario / ICS ---------------- */
const icsDate = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsTxt = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
function fold(l) { const out = []; while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); }
async function buildIcs(env, id, e, method) {
  const att = [];
  for (const p of e.part || []) { const m = await emailOf(env, p); if (m) att.push(`ATTENDEE;CN=${icsTxt(await nameOf(env, p) || m)};RSVP=FALSE:mailto:${m}`); }
  const loc = [e.luogo, e.teams].filter(Boolean).join(' · ');
  const desc = [e.note, e.teams ? 'Riunione Teams: ' + e.teams : '', (env.APP_URL || '') + '/'].filter(Boolean).join('\n');
  const seq = Math.floor((e.upd || e.at || 0) / 1000) - 1700000000;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HIK PALERMO//CRM//IT', 'CALSCALE:GREGORIAN', 'METHOD:' + method, 'BEGIN:VEVENT',
    'UID:' + id + '@hikpalermo.com', 'SEQUENCE:' + Math.max(0, seq), 'DTSTAMP:' + icsDate(now()), 'DTSTART:' + icsDate(e.start), 'DTEND:' + icsDate(e.end || e.start + 3600e3),
    'SUMMARY:' + icsTxt(e.titolo || 'Evento'), loc ? 'LOCATION:' + icsTxt(loc) : '', desc ? 'DESCRIPTION:' + icsTxt(desc) : '',
    e.teams ? 'URL:' + e.teams : '', 'ORGANIZER;CN=HIK PALERMO:mailto:notifiche@hikpalermo.com', ...att,
    method === 'CANCEL' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean);
  return lines.map(fold).join('\r\n');
}
const fmtDT = t => new Intl.DateTimeFormat('it-IT', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
const romeDay = t => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const b64 = s => { const b = enc.encode(s); let o = ''; for (let i = 0; i < b.length; i++) o += String.fromCharCode(b[i]); return btoa(o); };

/* ---------------- hook dopo le scritture ---------------- */
async function afterWrite(env, u, op, col, id, prev, data) {
  // Notifiche: ogni voce del feed con destinatari diventa una email
  if (col === 'feed' && op === 'set' && !prev && data && Array.isArray(data.to) && data.to.length) {
    if (data.t === 'evento' && !data.ref && /^ha annullato/.test(data.msg || '')) return; // gestito dalla cancellazione dell'evento
    const by = await nameOf(env, data.by) || u.name || 'Un collega';
    let ics = null, ev = null;
    if (data.t === 'evento' && data.ref && data.ref.k === 'evento') {
      ev = (await getDoc(env, 'eventi', data.ref.id))?.data;
      if (ev) ics = await buildIcs(env, data.ref.id, ev, 'REQUEST');
    }
    for (const rid of data.to) {
      if (rid === data.by) continue;
      const to = await emailOf(env, rid);
      if (!to) continue;
      let body = `<p style="margin:0 0 8px"><b>${esc(by)}</b> ${esc(data.msg)}</p>`;
      if (ev) body += `<table cellpadding="0" cellspacing="0" style="margin-top:12px;font-size:14px">
<tr><td style="color:#768797;padding:2px 12px 2px 0">Quando</td><td>${esc(fmtDT(ev.start))}${ev.end ? ' – ' + esc(fmtDT(ev.end)) : ''}</td></tr>
${ev.luogo ? `<tr><td style="color:#768797;padding:2px 12px 2px 0">Dove</td><td>${esc(ev.luogo)}</td></tr>` : ''}
${ev.teams ? `<tr><td style="color:#768797;padding:2px 12px 2px 0">Teams</td><td><a href="${esc(ev.teams)}">Partecipa alla riunione</a></td></tr>` : ''}
${ev.note ? `<tr><td style="color:#768797;padding:2px 12px 2px 0;vertical-align:top">Note</td><td>${esc(ev.note)}</td></tr>` : ''}</table>
<p style="font-size:13px;color:#45576A;margin-top:12px">In allegato l'invito: aprilo per aggiungerlo al tuo calendario Outlook.</p>`;
      if (data.t === 'team') body += `<p style="font-size:14px;color:#45576A">Per entrare registrati su <a href="${env.APP_URL}">hikpalermo.com</a> con questo indirizzo email: riceverai un codice di accesso.</p>`;
      const subj = (data.t === 'evento' && ev ? 'Calendario · ' : 'HIK PALERMO · ') + by + ' ' + (data.msg || '').slice(0, 120);
      await sendMail(env, {
        to, subject: subj, kind: 'feed:' + data.t,
        html: mailShell(data.t === 'evento' ? 'Aggiornamento del calendario' : 'Novità nel CRM', body, ['Apri il CRM', env.APP_URL + '/']),
        text: by + ' ' + data.msg + '\n' + env.APP_URL,
        attachments: ics ? [{ filename: 'invito.ics', content: b64(ics), content_type: 'text/calendar; method=REQUEST' }] : undefined
      });
    }
  }
  // Evento cancellato: invia l'annullamento ai partecipanti
  if (col === 'eventi' && op === 'delete' && prev) {
    const ics = await buildIcs(env, id, { ...prev, upd: now() }, 'CANCEL');
    const by = await nameOf(env, u.id) || u.name || 'Un collega';
    for (const p of prev.part || []) {
      if (p === u.id) continue;
      const to = await emailOf(env, p); if (!to) continue;
      await sendMail(env, {
        to, kind: 'evento:annullato', subject: 'Annullato · ' + (prev.titolo || 'evento') + ' · ' + fmtDT(prev.start),
        html: mailShell('Evento annullato', `<p><b>${esc(by)}</b> ha annullato «${esc(prev.titolo)}» del ${esc(fmtDT(prev.start))}.</p>`, ['Apri il calendario', env.APP_URL + '/']),
        attachments: [{ filename: 'annullamento.ics', content: b64(ics), content_type: 'text/calendar; method=CANCEL' }]
      });
    }
  }
  // Membro rimosso dal gruppo: revoca l'accesso
  if (col === 'team' && op === 'delete' && id !== u.id) {
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET status='disabled' WHERE id=? AND lower(email)<>?").bind(id, normEmail(env.OWNER_EMAIL)),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id)
    ]);
  }
}

/* ---------------- permessi ---------------- */
function validPath(col, id) {
  if (!col || !id || typeof col !== 'string' || typeof id !== 'string') return false;
  if (col.length > 200 || id.length > 200) return false;
  return /^[A-Za-z0-9_\-]+(\/[A-Za-z0-9_\-.~:@+]+\/[A-Za-z0-9_\-]+)*$/.test(col) && !/[\/]/.test(id);
}
function canRead(u, col) {
  if (col.startsWith('data/')) { const p = col.split('/'); return p[1] === 'users' && p[2] === u.id; }
  return true;
}
async function canWrite(env, u, col, id) {
  if (!canRead(u, col)) return false;
  if (col === 'config') return isAdmin(env, u);
  if (col === 'team') return id === u.id || isAdmin(env, u);
  return true;
}

/* ---------------- scrittura documenti ---------------- */
function applyUpdate(base, patch) {
  const out = structuredClone(base || {});
  for (const [k, v] of Object.entries(patch || {})) {
    const parts = k.split('.');
    let o = out;
    for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== 'object' || o[parts[i]] === null) o[parts[i]] = {}; o = o[parts[i]]; }
    if (v === undefined) delete o[parts.at(-1)]; else o[parts.at(-1)] = v;
  }
  return out;
}
async function broadcast(env, msg, only) {
  try {
    const stub = env.ROOM.get(env.ROOM.idFromName('main'));
    await stub.fetch('https://room/broadcast' + (only ? '?only=' + encodeURIComponent(only) : ''), { method: 'POST', body: JSON.stringify(msg) });
  } catch { }
}
async function writeDoc(env, ctx, u, { op, col, id, data }) {
  if (!validPath(col, id)) return err('invalid_argument', 'Percorso non valido');
  if (!['set', 'update', 'delete'].includes(op)) return err('invalid_argument', 'Operazione non valida');
  if (!(await canWrite(env, u, col, id))) return err('permission_denied', 'Non hai i permessi per modificare questi dati.', 403);
  const prev = await getDoc(env, col, id);
  let next = null;
  if (op === 'set') next = data && typeof data === 'object' ? data : {};
  else if (op === 'update') next = applyUpdate(prev?.data, data);
  const v = Math.max((prev?.v || 0) + 1, now());
  if (op === 'delete') {
    await env.DB.prepare('DELETE FROM docs WHERE col=? AND id=?').bind(col, id).run();
  } else {
    const s = JSON.stringify(next);
    if (s.length > 900000) return err('too_large', 'Documento troppo grande', 413);
    await env.DB.prepare('INSERT INTO docs(col,id,data,version,updated) VALUES(?,?,?,?,?) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, version=excluded.version, updated=excluded.updated').bind(col, id, s, v, now()).run();
  }
  const msg = { col, id, v, data: next, by: u.id };
  const only = col.startsWith('data/') ? u.id : null;
  ctx.waitUntil(broadcast(env, msg, only));
  ctx.waitUntil(afterWrite(env, u, op, col, id, prev?.data || null, next).catch(e => console.log('hook', e)));
  return json({ ok: true, v, data: next });
}

/* ---------------- import iniziale ---------------- */
async function maybeSeed(env) {
  const c = await env.DB.prepare('SELECT count(*) n FROM docs').first();
  if (c && c.n > 0) return;
  const t = now();
  const stmts = seed.docs.map(d => env.DB.prepare('INSERT OR IGNORE INTO docs(col,id,data,version,updated) VALUES(?,?,?,?,?)').bind(d.col, d.id, JSON.stringify(d.data), 1, t));
  for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
  for (const [id, b] of Object.entries(seed.blobs || {})) {
    const bin = Uint8Array.from(atob(b), ch => ch.charCodeAt(0));
    await env.FILES.put(id, bin, { httpMetadata: { contentType: 'image/jpeg' }, customMetadata: { name: 'foto.jpg' } });
  }
}

/* ---------------- autenticazione ---------------- */
async function authRequest(req, env) {
  const b = await req.json().catch(() => ({}));
  const email = normEmail(b.email);
  const mode = b.mode === 'register' ? 'register' : 'login';
  const name = String(b.name || '').trim().slice(0, 80);
  if (!validEmail(email)) return err('invalid_email', 'Indirizzo email non valido.');
  const user = await env.DB.prepare('SELECT id,status FROM users WHERE email=?').bind(email).first();
  const team = user ? null : await teamByEmail(env, email);
  const isOwner = email === normEmail(env.OWNER_EMAIL);
  if (mode === 'login' && !user && !team && !isOwner) return err('not_registered', 'Questo indirizzo non è registrato: usa «Registrati».', 404);
  if (mode === 'register' && !user && !name && !team) return err('name_required', 'Inserisci nome e cognome.');
  if (user && user.status === 'disabled') return err('disabled', 'Accesso disattivato: contatta un amministratore.', 403);
  const o = await env.DB.prepare('SELECT sent FROM otp WHERE email=?').bind(email).first();
  if (o && now() - o.sent < 45000) return err('too_soon', 'Codice già inviato: attendi qualche secondo prima di richiederne un altro.', 429);
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  await env.DB.prepare('INSERT INTO otp(email,code_hash,expires,tries,sent,name) VALUES(?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash, expires=excluded.expires, tries=0, sent=excluded.sent, name=excluded.name')
    .bind(email, await sha256(email + ':' + code), now() + OTP_MIN * 60e3, 0, now(), name || null).run();
  const ok = await sendMail(env, {
    to: email, kind: 'otp', subject: 'Codice di accesso HIK PALERMO: ' + code,
    html: mailShell('Il tuo codice di accesso', `<p>Usa questo codice per entrare nel CRM:</p>
<p style="font-family:Consolas,monospace;font-size:32px;letter-spacing:8px;font-weight:700;color:#C8102E;margin:16px 0">${code}</p>
<p style="font-size:13px;color:#45576A">Scade tra ${OTP_MIN} minuti. Se non l'hai richiesto, ignora questa email.</p>`),
    text: 'Codice di accesso HIK PALERMO: ' + code + ' (scade tra ' + OTP_MIN + ' minuti)'
  });
  if (!ok) return err('mail_failed', 'Invio email non riuscito. Riprova tra poco o contatta l\'amministratore.', 502);
  return json({ ok: true });
}

async function authVerify(req, env) {
  const b = await req.json().catch(() => ({}));
  const email = normEmail(b.email);
  const code = String(b.code || '').replace(/\D/g, '');
  const o = await env.DB.prepare('SELECT * FROM otp WHERE email=?').bind(email).first();
  if (!o || o.expires < now()) return err('expired', 'Codice scaduto: richiedine uno nuovo.', 400);
  if (o.tries >= 5) return err('locked', 'Troppi tentativi: richiedi un nuovo codice.', 429);
  if (o.code_hash !== await sha256(email + ':' + code)) {
    await env.DB.prepare('UPDATE otp SET tries=tries+1 WHERE email=?').bind(email).run();
    return err('wrong_code', 'Codice non corretto.', 400);
  }
  await env.DB.prepare('DELETE FROM otp WHERE email=?').bind(email).run();
  const isOwner = email === normEmail(env.OWNER_EMAIL);
  if (isOwner) await maybeSeed(env);
  let user = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  if (!user) {
    const team = await teamByEmail(env, email);
    const r = await ruoli(env);
    const id = team ? team.id : (isOwner && r.owner ? r.owner : rndId());
    const name = o.name || team?.data?.nomeVis || team?.data?.nome || email.split('@')[0];
    const status = (isOwner || team) ? 'active' : 'pending';
    await env.DB.prepare('INSERT INTO users(id,email,name,status,created) VALUES(?,?,?,?,?)').bind(id, email, name, status, now()).run();
    user = { id, email, name, status };
    if (status === 'pending') await notifyAdminsPending(env, user);
  }
  if (user.status === 'pending') return json({ ok: true, pending: true });
  if (user.status !== 'active') return err('disabled', 'Accesso disattivato: contatta un amministratore.', 403);
  await env.DB.prepare('UPDATE users SET last_login=? WHERE id=?').bind(now(), user.id).run();
  return json({ ok: true }, 200, { 'set-cookie': await newSession(env, user.id) });
}

async function adminEmails(env) {
  const r = await ruoli(env);
  const ids = new Set(Object.entries(r.ruoli || {}).filter(([, v]) => v === 'admin' || v === 'owner').map(([k]) => k));
  if (r.owner) ids.add(r.owner);
  const out = new Set([normEmail(env.OWNER_EMAIL)]);
  for (const id of ids) { const m = await emailOf(env, id); if (m) out.add(m); }
  return [...out];
}
async function notifyAdminsPending(env, u) {
  await sendMail(env, {
    to: await adminEmails(env), kind: 'pending', subject: 'Richiesta di accesso al CRM: ' + u.name,
    html: mailShell('Nuova richiesta di accesso', `<p><b>${esc(u.name)}</b> (${esc(u.email)}) si è registrato e attende la tua approvazione.</p>
<p style="font-size:13px;color:#45576A">Approva o rifiuta da <b>Gruppo e impostazioni → Richieste di accesso</b>.</p>`, ['Apri il CRM', env.APP_URL + '/'])
  });
}

/* ---------------- Claude ---------------- */
async function claudeProxy(req, env) {
  if (!env.ANTHROPIC_API_KEY) return err('not_configured', 'Chiave Anthropic non configurata sul server.', 503);
  const b = await req.json().catch(() => null);
  if (!b || !Array.isArray(b.messages)) return err('invalid_argument', 'Richiesta non valida');
  const body = { model: env.CLAUDE_MODEL || 'claude-opus-5-5', max_tokens: Math.min(+b.max_tokens || 16000, 32000), messages: b.messages };
  if (b.system) body.system = b.system;
  if (Array.isArray(b.tools) && b.tools.length) body.tools = b.tools;
  if (b.tool_choice) body.tool_choice = b.tool_choice;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json' } });
}

/* ---------------- router ---------------- */
async function api(req, env, ctx, url, u) {
  const p = url.pathname, m = req.method;
  if (m !== 'GET' && req.headers.get('x-hp') !== '1') return err('csrf', 'Richiesta non valida', 403);

  if (p === '/api/me') {
    const r = await ruoli(env);
    const team = await getDoc(env, 'team', u.id);
    return json({ id: u.id, email: u.email, name: team?.data?.nomeVis || team?.data?.nome || u.name, foto: team?.data?.foto || null, admin: await isAdmin(env, u), owner: u.email === normEmail(env.OWNER_EMAIL) || r.owner === u.id });
  }
  if (p === '/api/db' && m === 'GET') {
    const col = url.searchParams.get('col') || '';
    if (!validPath(col, 'x') || !canRead(u, col)) return err('permission_denied', 'Accesso negato', 403);
    const { results } = await env.DB.prepare('SELECT id,data,version FROM docs WHERE col=?').bind(col).all();
    return json({ docs: results.map(r => ({ id: r.id, data: parse(r.data), v: r.version })) });
  }
  if (p === '/api/write' && m === 'POST') {
    const b = await req.json().catch(() => null);
    if (!b) return err('invalid_argument', 'Richiesta non valida');
    return writeDoc(env, ctx, u, b);
  }
  if (p === '/api/profiles' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    const ids = (b.ids || []).slice(0, 300).map(String);
    const out = {};
    if (ids.length) {
      const q = ids.map(() => '?').join(',');
      const us = (await env.DB.prepare(`SELECT id,email,name FROM users WHERE id IN (${q})`).bind(...ids).all()).results;
      const ts = (await env.DB.prepare(`SELECT id,data FROM docs WHERE col='team' AND id IN (${q})`).bind(...ids).all()).results;
      for (const x of us) out[x.id] = { id: x.id, name: x.name, email: x.email, avatarUrl: null, guest: false };
      for (const t of ts) { const d = parse(t.data) || {}; out[t.id] = { ...(out[t.id] || { id: t.id, guest: false }), name: d.nomeVis || d.nome || out[t.id]?.name || 'Utente', email: d.email || out[t.id]?.email, avatarUrl: d.foto ? '/_blob/' + d.foto : null }; }
    }
    return json(out);
  }
  if (p === '/api/users/search' && m === 'GET') {
    const q = '%' + (url.searchParams.get('q') || '').toLowerCase().replace(/[%_]/g, '') + '%';
    const { results } = await env.DB.prepare("SELECT id,name,email FROM users WHERE status='active' AND (lower(name) LIKE ? OR email LIKE ?) LIMIT 20").bind(q, q).all();
    return json(results.map(x => ({ id: x.id, name: x.name, email: x.email, avatarUrl: null, guest: false })));
  }
  if (p === '/api/users') {
    if (!(await isAdmin(env, u))) return err('permission_denied', 'Solo per amministratori', 403);
    if (m === 'GET') {
      const { results } = await env.DB.prepare('SELECT id,email,name,status,created,last_login FROM users ORDER BY created DESC').all();
      return json(results);
    }
    if (m === 'POST') {
      const b = await req.json().catch(() => ({}));
      const t = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(String(b.id || '')).first();
      if (!t) return err('not_found', 'Utente non trovato', 404);
      if (t.email === normEmail(env.OWNER_EMAIL)) return err('permission_denied', 'Il proprietario non si può modificare', 403);
      if (b.action === 'approve' || b.action === 'enable') {
        await env.DB.prepare("UPDATE users SET status='active' WHERE id=?").bind(t.id).run();
        if (b.action === 'approve') await sendMail(env, { to: t.email, kind: 'approved', subject: 'Accesso al CRM HIK PALERMO approvato', html: mailShell('Benvenuto in HIK PALERMO', `<p>Ciao ${esc(t.name)}, il tuo accesso è stato approvato. Entra con la tua email: ti invieremo un codice.</p>`, ['Entra nel CRM', env.APP_URL + '/login']) });
      } else if (b.action === 'reject' || b.action === 'disable') {
        await env.DB.batch([env.DB.prepare("UPDATE users SET status='disabled' WHERE id=?").bind(t.id), env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(t.id)]);
      } else if (b.action === 'delete') {
        await env.DB.batch([env.DB.prepare('DELETE FROM users WHERE id=?').bind(t.id), env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(t.id)]);
      } else return err('invalid_argument', 'Azione non valida');
      return json({ ok: true });
    }
  }
  if (p === '/api/blob' && m === 'POST') {
    const len = +req.headers.get('content-length') || 0;
    if (len > MAX_UPLOAD) return err('too_large', 'File oltre 20 MB', 413);
    const type = (req.headers.get('content-type') || 'application/octet-stream').slice(0, 100);
    const buf = await req.arrayBuffer();
    if (buf.byteLength > MAX_UPLOAD) return err('too_large', 'File oltre 20 MB', 413);
    const id = rndHex(16);
    await env.FILES.put(id, buf, { httpMetadata: { contentType: type }, customMetadata: { by: u.id, name: decodeURIComponent(req.headers.get('x-name') || '').slice(0, 200) } });
    return json({ id, sizeBytes: buf.byteLength, contentType: type, url: '/_blob/' + id });
  }
  if (p.startsWith('/api/blob/') && m === 'DELETE') {
    const id = p.slice(10);
    if (!/^[0-9a-f]{32}$/.test(id)) return err('invalid_argument', 'Id non valido');
    const o = await env.FILES.head(id);
    if (o && o.customMetadata?.by && o.customMetadata.by !== u.id && !(await isAdmin(env, u))) return err('not_uploader', 'Puoi eliminare solo i file caricati da te', 403);
    await env.FILES.delete(id);
    return json({ ok: true });
  }
  if (p === '/api/claude' && m === 'POST') return claudeProxy(req, env);
  if (p === '/api/auth/logout' && m === 'POST') {
    const tok = cookie(req, 'hp_s');
    if (tok) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(tok)).run();
    return json({ ok: true }, 200, { 'set-cookie': 'hp_s=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
  }
  if (p === '/api/ws') {
    if (req.headers.get('upgrade') !== 'websocket') return err('invalid_argument', 'Serve WebSocket', 426);
    const stub = env.ROOM.get(env.ROOM.idFromName('main'));
    const h = new Headers(req.headers); h.set('x-uid', u.id);
    return stub.fetch('https://room/ws', { headers: h });
  }
  return err('not_found', 'Endpoint inesistente', 404);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.hostname.startsWith('www.')) { url.hostname = url.hostname.slice(4); return Response.redirect(url.toString(), 301); }
    const p = url.pathname;
    try {
      if (p === '/api/auth/request' && req.method === 'POST') return await authRequest(req, env);
      if (p === '/api/auth/verify' && req.method === 'POST') return await authVerify(req, env);
      const u = await currentUser(req, env);
      if (u && (p === '/login' || p === '/login.html')) return Response.redirect(url.origin + '/', 302);
      if (PUBLIC_PATHS.has(p)) return env.ASSETS.fetch(p === '/login.html' ? new Request(url.origin + '/login', req) : req);
      if (p.startsWith('/api/')) {
        if (!u) return err('unauthenticated', 'Sessione scaduta: accedi di nuovo.', 401);
        return await api(req, env, ctx, url, u);
      }
      if (!u) {
        if (req.method === 'GET' && (p === '/' || p.endsWith('.html') || (req.headers.get('accept') || '').includes('text/html'))) return Response.redirect(url.origin + '/login', 302);
        return new Response('Accesso richiesto', { status: 401 });
      }
      if (p.startsWith('/_blob/')) {
        const id = p.slice(7);
        const o = await env.FILES.get(id);
        if (!o) return new Response('File non trovato', { status: 404 });
        const h = new Headers(); o.writeHttpMetadata(h); h.set('etag', o.httpEtag); h.set('cache-control', 'private, max-age=31536000, immutable');
        const n = o.customMetadata?.name; if (n) h.set('content-disposition', 'inline; filename*=UTF-8\'\'' + encodeURIComponent(n));
        h.set('x-content-type-options', 'nosniff');
        return new Response(o.body, { headers: h });
      }
      const res = await env.ASSETS.fetch(req);
      if (p === '/' || p.endsWith('.html')) { const r2 = new Response(res.body, res); r2.headers.set('cache-control', 'no-store'); return r2; }
      return res;
    } catch (e) {
      console.log('errore', e && e.stack || e);
      return err('internal', 'Errore del server: ' + (e && e.message || e), 500);
    }
  },

  // Ogni mattina (06:00 UTC): promemoria degli eventi di domani + pulizia
  async scheduled(ev, env, ctx) {
    const t = now();
    await env.DB.batch([env.DB.prepare('DELETE FROM otp WHERE expires<?').bind(t - 864e5), env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(t)]);
    const tomorrow = romeDay(t + 864e5);
    const { results } = await env.DB.prepare("SELECT id,data FROM docs WHERE col='eventi' AND json_extract(data,'$.start') BETWEEN ? AND ?").bind(t, t + 3 * 864e5).all();
    const per = new Map();
    for (const r of results) {
      const e = parse(r.data); if (!e || romeDay(e.start) !== tomorrow) continue;
      e._id = r.id;
      const key = r.id + ':' + e.start;
      if (await env.DB.prepare('SELECT 1 FROM reminders WHERE key=?').bind(key).first()) continue;
      await env.DB.prepare('INSERT INTO reminders(key,at) VALUES(?,?)').bind(key, t).run();
      for (const p of new Set([...(e.part || []), e.by].filter(Boolean))) { if (!per.has(p)) per.set(p, []); per.get(p).push(e); }
    }
    for (const [pid, evs] of per) {
      const to = await emailOf(env, pid); if (!to) continue;
      evs.sort((a, b) => a.start - b.start);
      const rows = evs.map(e => `<tr><td style="padding:6px 12px 6px 0;font-family:Consolas,monospace;color:#C8102E;vertical-align:top">${esc(new Intl.DateTimeFormat('it-IT', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(e.start)))}</td><td style="padding:6px 0"><b>${esc(e.titolo)}</b>${e.luogo ? '<br><span style="color:#45576A;font-size:13px">' + esc(e.luogo) + '</span>' : ''}${e.teams ? '<br><a href="' + esc(e.teams) + '" style="font-size:13px">Riunione Teams</a>' : ''}</td></tr>`).join('');
      const attachments = [];
      for (const e of evs) attachments.push({ filename: 'evento-' + (attachments.length + 1) + '.ics', content: b64(await buildIcs(env, e._id, e, 'REQUEST')), content_type: 'text/calendar; method=REQUEST' });
      await sendMail(env, {
        to, kind: 'reminder', subject: 'Domani in agenda: ' + evs.length + (evs.length === 1 ? ' evento' : ' eventi'), attachments,
        html: mailShell('Promemoria per domani', `<table cellpadding="0" cellspacing="0">${rows}</table><p style="font-size:13px;color:#45576A;margin-top:12px">In allegato ${evs.length === 1 ? 'l\'invito' : 'gli inviti'} da aprire per aggiungere ${evs.length === 1 ? 'l\'evento' : 'gli eventi'} al calendario Outlook, se non l'hai già fatto.</p>`, ['Apri il calendario', env.APP_URL + '/'])
      });
    }
    await env.DB.prepare('DELETE FROM reminders WHERE at<?').bind(t - 30 * 864e5).run();
  }
};

/* ---------------- Durable Object: tempo reale ---------------- */
export class Room {
  constructor(state, env) { this.state = state; }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1], [req.headers.get('x-uid') || 'anon']);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname === '/broadcast') {
      const msg = await req.text();
      const only = url.searchParams.get('only');
      for (const ws of (only ? this.state.getWebSockets(only) : this.state.getWebSockets())) { try { ws.send(msg); } catch { } }
      return new Response('ok');
    }
    return new Response('?', { status: 404 });
  }
  webSocketMessage(ws, m) { if (m === 'ping') { try { ws.send('pong'); } catch { } } }
  webSocketClose(ws, code) { try { ws.close(code, 'bye'); } catch { } }
  webSocketError(ws) { try { ws.close(1011, 'err'); } catch { } }
}
