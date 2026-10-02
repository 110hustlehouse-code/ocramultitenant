# Piano: messa online di OCRA (gruppo Masini)

Stato: **in corso — Fase 1 chiusa, Fase 2 in corso**.

Lavoro lungo e autonomo su richiesta esplicita: si procede senza chiedere conferme sulle scelte
tecniche (già prese), ci si ferma solo per azioni fisiche dell'utente (creare un account, fare
login a un servizio, incollare un segreto). Questo file si aggiorna dopo ogni fase per sopravvivere
a compattazioni e riavvii — è la fonte di verità sullo stato di avanzamento, non la chat.

**Segreti**: mai stampati qui, in chat o nei log. Dove serve una chiave, la inserisce l'utente con
`vercel env add` (o equivalente, a tastiera) — mai incollata in conversazione.

## Decisioni di infrastruttura (prese dall'utente, non rinegoziare)

- Postgres: **Neon**, regione EU (Frankfurt)
- Vercel: progetto nuovo per `ocramultitenant`, regione funzioni **fra1**
- R2 (Cloudflare): bucket documenti di produzione + bucket backup separato, giurisdizione EU
- Dominio: **app.ocrapigmento.com** per la piattaforma (`ocrapigmento.com` resta libero per una
  futura landing page)
- Email transazionali (reset password, inviti): mittente **noreply@ocrapigmento.com**, con SPF,
  DKIM e DMARC configurati

## Avanzamento per fase

### Fase 1 — Chiusura E2E — ✅ completata (2026-10-02)

8 scenari Playwright per gli accessi collaboratori, tutti verdi su 2 run consecutivi. Un bug reale
trovato e corretto nel percorso (redirect al cambio password non immediato — vedi
`docs/test/E2E-ACCESSI.md`). PR #15 mergeata (squash) su `main`, commit `a576095`.

Dettagli completi, tabella scenario/esito, e il secondo comportamento trovato e lasciato
volutamente non corretto (status 200 invece di 404 su `notFound()`, non bloccante): vedi
`docs/test/E2E-ACCESSI.md`.

### Fase 2 — Preparazione produzione (codice) — 🔄 in corso

Lavoro di solo codice, nessuna azione richiesta all'utente. Checklist:

- [x] Seed di produzione separato dal seed di sviluppo: solo tenant Fulcro (società, listino),
      nessun tenant demo, nessun utente `@ocra.local` — clienti/fornitori reali restano a
      `scripts/import-anagrafiche-reali.ts` (già esistente, richiede i file locali dell'utente)
- [x] Verifica che `dev-login` sia irraggiungibile con `NODE_ENV=production`
- [ ] ~~Sentry~~ **rimandato** — vedi nota sotto
- [x] GitHub Action di backup: `pg_dump` notturno del DB di produzione su bucket R2 dedicato,
      conservazione 30 giorni, script di ripristino documentato (`docs/BACKUP.md`)
- [ ] `npm run check` e `npm run build` verdi
- [ ] PR dedicata, merge su main

**Sentry rimandato.** Motivo: `@sentry/nextjs@11.3.0` (l'unica versione che dichiara supporto a
Next 16) ha un bug aperto e non risolto con Turbopack — [sentry-javascript#19367](https://github.com/getsentry/sentry-javascript/issues/19367):
`@opentelemetry/api` duplicato tra i chunk Turbopack causa una ricorsione infinita e un crash
fatale (`RangeError: Maximum call stack size exceeded`) in produzione, entro minuti o ore. Le
configurazioni documentate (`tracesSampleRate: 0`, `skipOpenTelemetrySetup: true`) non lo
risolvono. L'unico fix noto è tornare a `@sentry/nextjs@10.8.0`, che non supporta Next 16.
Non bloccante per il collaudo: per ora bastano i log di Vercel. Da riprendere quando Sentry
pubblica un fix per questo issue (nessuna modifica lasciata nel repo: pacchetto disinstallato,
`package.json`/lockfile tornati puliti).

(Il dettaglio di ogni punto si aggiorna qui sotto mano a mano che si completa.)

### Fase 3 — Infrastruttura — ⏳ non iniziata (richiede l'utente)

Si procede un servizio alla volta, fermandosi a ogni passo che richiede un'azione fisica (creare
account, login CLI, incollare un valore). Elenco completo di cosa serve, prima di iniziare:

**Variabili d'ambiente Vercel** (progetto `ocramultitenant`, regione funzioni `fra1`):

| Variabile | Da dove viene | Note |
|---|---|---|
| `DATABASE_URL` | Neon (connection string, pooled) | regione EU Frankfurt |
| `AUTH_SECRET` | generata (`openssl rand -base64 32`) | obbligatoria in produzione |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google Cloud Console → OAuth client | redirect URI: `https://app.ocrapigmento.com/api/auth/callback/google` |
| `AUTH_DEV_LOGIN` | — | **non impostarla affatto** (o `false`) in produzione |
| `ANTHROPIC_API_KEY` | console Anthropic | per i verbali (estrazione task dall'AI) |
| `DEEPGRAM_API_KEY` | Deepgram | trascrizione audio — opzionale, solo se si usa quella funzione |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Cloudflare R2 | bucket **documenti** di produzione, credenziali scoped solo a quello |
| `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | il provider email scelto per noreply@ocrapigmento.com | vedi nota email sotto |
| `CRON_SECRET` | generato | protegge `/api/cron/richiami` |
| `APP_URL` | — | `https://app.ocrapigmento.com` |

**Secret + variabile GitHub Actions** (per il backup, repo → Settings → Secrets and variables):

| Nome | Tipo | Cos'è |
|---|---|---|
| `PROD_DATABASE_URL` | secret | connection string Neon di produzione |
| `R2_BACKUP_ACCOUNT_ID` | secret | account Cloudflare (probabilmente uguale a `R2_ACCOUNT_ID`) |
| `R2_BACKUP_ACCESS_KEY_ID` / `R2_BACKUP_SECRET_ACCESS_KEY` | secret | credenziali scoped **solo** al bucket di backup |
| `R2_BACKUP_BUCKET` | secret | bucket R2 **backup**, separato da quello documenti |
| `BACKUP_ENABLED` | variable (non segreto) | `true` per accendere il workflow notturno |

**Nota email transazionali**: il codice invia via SMTP diretto (`nodemailer`, pensato per Google
Workspace). Per un mittente `noreply@ocrapigmento.com` con SPF/DKIM/DMARC servono o (a) una
casella Google Workspace su quel dominio con password per le app, o (b) un provider
transazionale (Resend, Postmark, SES...) con relay SMTP — da decidere insieme quando si arriva
a questo punto, è l'unica cosa infrastrutturale non già scelta in partenza.

**Account/servizi da creare o configurare** (azioni fisiche, una alla volta quando si arriva lì):
1. Progetto Neon (EU Frankfurt) + database
2. Progetto Vercel nuovo, collegato al repo, regione funzioni `fra1`
3. Due bucket Cloudflare R2 (documenti + backup), giurisdizione EU, con due coppie di
   credenziali scoped separate
4. Dominio `app.ocrapigmento.com`: record DNS verso Vercel (CNAME/A forniti da Vercel dopo aver
   aggiunto il dominio al progetto)
5. Google Cloud OAuth client per `AUTH_GOOGLE_ID`/`SECRET`
6. Provider email per `noreply@ocrapigmento.com` (decisione da prendere al momento, vedi nota sopra)
7. I 6 secret + 1 variabile GitHub Actions per il backup

### Fase 4 — Deploy e verifica — ⏳ non iniziata

### Fase 5 — Riepilogo — ⏳ non iniziata

---

## Log dettagliato

### 2026-10-02 — Fase 1 chiusa

- PR #15: fix conflitto peer-dep nodemailer/next-auth, `@playwright/test`, suite E2E 8 scenari,
  fix redirect cambio password. Mergeata su main (squash), commit `a576095`.
- `npm run check`: 230/230 test. `npm run build`: 36 route, invariate.

### 2026-10-02 — Fase 2, seed produzione + dev-login + Sentry

- `prisma/seed.ts` diviso in `seedMasiniCore()` (tenant/società/listino reali, riusabile) e
  `seedMasiniDevUsers()` (utenti `@ocra.local`, solo sviluppo). Nuovo `prisma/seed-production.ts`
  (`npm run db:seed:prod`) chiama solo la prima. Verificato idempotente, non tocca utenti/demo
  esistenti.
- Nuovo `scripts/create-ceo.ts <email> "<nome>"`: crea il primo utente CEO di produzione
  (nessuna password, login via Google). Da usare in Fase 4.
- `dev-login`: già coperto da `isDevLoginEnabled()` + test unitari esistenti
  (`src/env.test.ts`) — disabilitato sia con `NODE_ENV=production` sia, rete di sicurezza
  aggiuntiva, su qualunque host Vercel indipendentemente da come sono le altre variabili.
  Nessuna modifica necessaria.
- Sentry: installato, poi disinstallato per il bug Turbopack/Next 16 descritto sopra. Repo
  tornato pulito (`package.json`/lockfile invariati rispetto al commit precedente).
- `.github/workflows/backup.yml`: `pg_dump` notturno (container `postgres:17-alpine`, evita
  disallineamenti di versione col runner) → R2 bucket backup dedicato, retention 30 giorni.
  Spento finché la variabile `BACKUP_ENABLED` non è `true` (niente rossi finché i secret non
  ci sono). `scripts/restore-backup.sh` per il ripristino, con conferma esplicita.
  Documentato in `docs/BACKUP.md`. Elenco completo variabili/account per la Fase 3 compilato
  qui sopra.
