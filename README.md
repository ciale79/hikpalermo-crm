# HIK PALERMO — CRM su hikpalermo.com

CRM del gruppo di lavoro, ospitato su Cloudflare Workers.

| Parte | Dove |
|---|---|
| Pagine (CRM, login, catalogo, sprite) | `public/` (Workers static assets) |
| API, accesso con codice email, notifiche, promemoria | `src/worker.js` |
| Dati (clienti, commesse, offerte, eventi, feed, configurazione) | D1 `hikpalermo-crm` (`schema.sql`) |
| Allegati e foto | R2 `hikpalermo-files` |
| Aggiornamenti in tempo reale | Durable Object `Room` (WebSocket) |
| Email | Resend (mittente `notifiche@hikpalermo.com`) |
| Analisi capitolati | Anthropic API via `/api/claude` |
| Promemoria eventi del giorno dopo | Cron `0 6 * * *` (08:00 ora italiana) |

## Accesso
- **Registrati / Accedi** su https://hikpalermo.com con l'email: arriva un codice a 6 cifre (valido 10 minuti).
- Chi ha la stessa email di un membro del gruppo di lavoro entra subito; gli altri restano in attesa e gli amministratori ricevono un'email. Si approvano da **Gruppo e impostazioni → Accessi al CRM**.
- Togliere un collega dal gruppo ne revoca l'accesso.

## Email inviate
- Codice di accesso, richiesta di accesso agli admin, approvazione.
- Ogni avviso del feed con destinatari (es. nuovo/spostato/modificato appuntamento, nuovo collega).
- Calendario: invito `.ics` allegato (si aggiunge a Outlook), annullamento `.ics` quando un evento viene eliminato, promemoria del giorno prima con gli `.ics` allegati.

## Segreti (Worker → Impostazioni → Variabili e segreti)
- `RESEND_API_KEY` — chiave Resend con permesso di invio sul dominio hikpalermo.com
- `ANTHROPIC_API_KEY` — per l'analisi dei capitolati

## Primo avvio
Al primo accesso del proprietario (`OWNER_EMAIL`) il database vuoto viene popolato da `seed/data.json` (dati esportati dalla versione precedente: clienti, commesse, gruppo, configurazione, foto profilo).

## Deploy
Collegato a GitHub con Workers Builds: ogni push su `main` esegue `npx wrangler deploy`.
