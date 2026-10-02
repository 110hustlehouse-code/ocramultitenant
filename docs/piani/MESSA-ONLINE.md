# Piano: messa online di OCRA (gruppo Masini)

Stato: **in corso — Fase 1 e 2 chiuse, Fase 3 pronta a iniziare (serve l'utente)**.

Lavoro lungo e autonomo su richiesta esplicita: si procede senza chiedere conferme sulle scelte
tecniche (già prese), ci si ferma solo per azioni fisiche dell'utente (creare un account, fare
login a un servizio, incollare un segreto). Questo file si aggiorna dopo ogni fase per sopravvivere
a compattazioni e riavvii — è la fonte di verità sullo stato di avanzamento, non la chat.

**Segreti**: mai stampati qui, in chat o nei log. Dove serve una chiave, la inserisce l'utente con
`vercel env add` (o equivalente, a tastiera) — mai incollata in conversazione.

## Decisioni di infrastruttura (prese dall'utente, non rinegoziare)

- Postgres: **Supabase**, regione Central EU (Frankfurt) — *cambiato da Neon il 2026-10-02,
  progetto Supabase già creato dall'utente*
- Vercel: progetto nuovo per `ocramultitenant`, regione funzioni **fra1**
- R2 (Cloudflare): bucket documenti di produzione + bucket backup separato, giurisdizione EU
- Struttura domini (decisa il 2026-10-02): **www.ocrapigmento.com** è il sito di presentazione,
  già online — non toccare i suoi record DNS. **app.ocrapigmento.com** è questo progetto
  (produzione multi-tenant). **demo.ocrapigmento.com** sarà un'istanza demo separata (progetto
  Vercel a parte, database Supabase a parte, seed demo, reset dati notturno) — **fase
  successiva alla messa online, non ora**.
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

### Fase 2 — Preparazione produzione (codice) — ✅ completata (2026-10-02)

Lavoro di solo codice, nessuna azione richiesta all'utente. Checklist:

- [x] Seed di produzione separato dal seed di sviluppo: solo tenant Fulcro (società, listino),
      nessun tenant demo, nessun utente `@ocra.local` — clienti/fornitori reali restano a
      `scripts/import-anagrafiche-reali.ts` (già esistente, richiede i file locali dell'utente)
- [x] Verifica che `dev-login` sia irraggiungibile con `NODE_ENV=production`
- [ ] ~~Sentry~~ **rimandato** — vedi nota sotto
- [x] GitHub Action di backup: `pg_dump` notturno del DB di produzione su bucket R2 dedicato,
      conservazione 30 giorni, script di ripristino documentato (`docs/BACKUP.md`)
- [x] `npm run check` e `npm run build` verdi
- [x] PR dedicata, merge su main — PR #16, commit `c407d6c`

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

### Fase 3 — Infrastruttura — ⏳ pronta a iniziare (richiede l'utente)

Si procede un servizio alla volta, fermandosi a ogni passo che richiede un'azione fisica (creare
account, login CLI, incollare un valore). Elenco completo di cosa serve, prima di iniziare:

**Variabili d'ambiente Vercel** (progetto `ocramultitenant`, regione funzioni `fra1`):

| Variabile | Da dove viene | Note |
|---|---|---|
| `DATABASE_URL` | Supabase → Connect → **Transaction pooler**, porta 6543 | usata a runtime dall'app (`@prisma/adapter-pg`) |
| `DIRECT_URL` | Supabase → Connect → **Session pooler**, porta 5432 | solo per le migrazioni (`prisma.config.ts`). *Non* la vera Direct connection: sul piano free è solo IPv6, incompatibile con Vercel/Codespaces (IPv4). Il Session pooler, a differenza del Transaction pooler, tiene una connessione dedicata per sessione: supporta DDL e lock di avviso come una connessione diretta |
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
| `PROD_DATABASE_URL` | secret | connection string Supabase di produzione, **Session pooler** (porta 5432) — stesso motivo IPv4 di `DIRECT_URL`, `pg_dump` ha bisogno di una sessione stabile che il Transaction pooler non garantisce |
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
1. ✅ Progetto Supabase (Central EU, Frankfurt)
2. ✅ Progetto Vercel `ocramultitenant` (org `ocra`), collegato al repo, regione funzioni `fra1`.
   12 variabili inserite in Production come Secret (vedi sotto). **Primo deploy di produzione
   riuscito** (redeploy manuale dopo aver completato le variabili — i deploy automatici
   precedenti erano falliti perché le variabili non erano ancora tutte presenti): online su
   `https://ocramultitenant.vercel.app`
3. ✅ Due bucket Cloudflare R2 (`ocra-documenti` + `ocra-backup`), giurisdizione EU, con due
   token scoped separati. Bug trovato e corretto: endpoint `.eu.r2.cloudflarestorage.com`
   (vedi sopra). Variabili app inserite su Vercel; i secret GitHub del backup restano da
   fare (vedi punto 7)
4. 🔄 Dominio `app.ocrapigmento.com` aggiunto al progetto Vercel. **Record DNS da aggiungere
   su Cloudflare** (solo questo, non tocca `www`): `A  app  76.76.21.21`, **DNS only** (non
   proxato) — altrimenti Vercel non riesce a emettere il certificato TLS. DNS `ocrapigmento.com`
   già verificato in Cloudflare in precedenza, `www` resta com'è
5. ✅ Google Cloud OAuth: progetto dedicato **"ocrapigmento"**, client **"ocra-produzione"**,
   redirect su `app.ocrapigmento.com`, app in modalità **Testing** (l'utente aggiunge a mano
   gli utenti di test — nessuna pubblicazione pubblica del client OAuth per ora)
6. ⏳ Provider email per `noreply@ocrapigmento.com` — **proposta sotto**
7. ⏳ I 6 secret + 1 variabile GitHub Actions per il backup — `gh secret set` dà 403
   (permessi del token CLI), l'utente li inserisce dal sito GitHub
8. ⏳ `DEEPGRAM_API_KEY` (trascrizione audio, opzionale) — rimandato
9. ⚠️ **Da sistemare prima di aprire il sito al pubblico**: le 12 variabili sono impostate
   solo per l'ambiente Production — i deployment di Preview (ogni PR ne genera uno)
   falliscono in build con "AUTH_SECRET è obbligatoria in produzione", perché Vercel imposta
   `NODE_ENV=production` anche lì. Non blocca Production (che ora funziona), da estendere a
   Preview quando si vorranno Preview funzionanti per le PR.

**Proposta provider email — Resend.** Piano gratuito adatto (3.000 email/mese, 100/giorno —
di più di quanto serva per reset password e inviti). Si collega con **zero modifiche al
codice**: l'app invia già via SMTP generico (`nodemailer`, `src/server/notify/email.ts`), e
Resend espone un relay SMTP compatibile — basta puntarci le variabili già esistenti:
- `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend` (letterale), `SMTP_PASS=`
  la API key di Resend, `SMTP_FROM=noreply@ocrapigmento.com`
- Resend chiede di verificare il dominio `ocrapigmento.com` con record DNS (SPF, DKIM, un
  record di verifica) da aggiungere su Cloudflare — stesso tipo di passo già fatto per il
  dominio Vercel, additivo, non tocca `www`
Alternative valutate: Postmark (ottima deliverability, piano gratuito solo 100 email **totali**
di prova, poi a pagamento) e SES (più economico su volumi alti, ma setup più macchinoso — serve
uscire dal sandbox mode AWS con una richiesta). Per i volumi di questo progetto, Resend è il
più semplice da collegare e il piano gratuito basta avanzare.

**Promemoria per dopo la messa online**: `demo.ocrapigmento.com`, istanza demo separata
(Vercel + Supabase a parte, seed demo, reset notturno) — non ora.

### Fase 4 — Deploy e verifica — ⏳ non iniziata

- [ ] Migrazioni su Supabase (`npm run db:deploy` con `DIRECT_URL` di produzione), poi
      `npm run db:seed:prod`
- [ ] `scripts/import-anagrafiche-reali.ts` con i file reali dell'utente, contro il DB di
      produzione
- [ ] `scripts/create-ceo.ts <email> "<nome>"` per il primo utente CEO
- [ ] Deploy su Vercel, dominio `app.ocrapigmento.com` collegato, HTTPS attivo
- [ ] Smoke test in produzione: login Google, login password, creazione collaboratore,
      generazione preventivo e PDF, upload documento su R2, invio email di reset reale
- [ ] Prova di ripristino: backup reale, ripristino su un **progetto/database Supabase di
      test separato** (niente branching come in Neon — vedi `docs/BACKUP.md`), verifica dati,
      poi eliminazione del progetto di test
- [ ] Rilancio completo della suite E2E (8 scenari) a fine fase, come verifica finale

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

### 2026-10-02 — Cambio Postgres: Neon → Supabase

Decisione dell'utente: Supabase invece di Neon, stessa regione (Central EU, Frankfurt),
progetto già creato. Serve una connessione diretta separata dal pooler per le migrazioni
(il pooler Supavisor di Supabase, come PgBouncer, è in transaction mode: non supporta il
DDL delle migrazioni né i lock di avviso che usa).

**Scoperto facendo la prova in locale** (non si può indovinare con Prisma 7, è cambiato):
`url`/`directUrl` nello `schema.prisma` **non sono più supportati** — Prisma 7 li rifiuta
con errore (`P1012`, vedi https://pris.ly/d/config-datasource). Tutto il routing delle
connessioni per i comandi CLI passa da `prisma.config.ts`, che però ha un solo slot
`datasource.url` (nessun `directUrl` nel tipo `Datasource`).

Soluzione verificata (generate, check, deploy, seed, build — tutti testati in locale):
- `prisma.config.ts`: `datasource.url` ora legge `DIRECT_URL`, non più `DATABASE_URL` — i
  comandi CLI (migrate, `db:check`) usano sempre la connessione diretta.
- `src/server/db/client.ts` (runtime dell'app) resta invariato: legge `DATABASE_URL` (il
  pooler) direttamente da `env()`, indipendente da `prisma.config.ts`.
- `schema.prisma`: tornato a `datasource db { provider = "postgresql" }`, nient'altro.
- `@prisma/adapter-pg` non passa mai un nome al prepared statement (verificato nel sorgente
  installato, `pgOptions?.statementNameGenerator` è l'unica fonte del nome ed è sempre
  `undefined` qui) → compatibile col pooler in transaction mode senza bisogno di
  `?pgbouncer=true` in query string (quel parametro serve solo al query engine Rust, non
  usato in questo progetto).
- `.env.example`, `.env` locale, CI (`ci.yml`): aggiunta `DIRECT_URL`, uguale a
  `DATABASE_URL` dove non c'è un pooler (locale, CI).
- `docs/BACKUP.md`, `scripts/restore-backup.sh`: `PROD_DATABASE_URL`/`TARGET_DATABASE_URL`
  devono essere la connessione **diretta** (`pg_dump`/`pg_restore` non sono affidabili
  attraverso un pooler in transaction mode); "branch Neon" → "progetto/database Supabase di
  test separato" (Supabase non ha il branching di Neon).
- `npm run check` e `npm run build`: verdi.

### 2026-10-02 — Fase 3: Vercel collegato, DNS attivo, Session pooler per le migrazioni

- Progetto Vercel `ocramultitenant` (org `ocra`) creato e collegato, regione `fra1`.
  `DATABASE_URL`/`DIRECT_URL` di produzione inserite come Secret su Vercel.
- **Scelta dell'utente**: `DIRECT_URL` usa il **Session pooler** di Supabase (porta 5432), non
  la vera Direct connection — sul piano free quest'ultima è solo IPv6, incompatibile con
  Vercel/Codespaces (IPv4). Il Session pooler tiene una connessione dedicata per l'intera
  sessione (a differenza del Transaction pooler, che la ricicla tra una transazione e
  l'altra): supporta DDL e lock di avviso come una connessione diretta, quindi va bene per
  `prisma migrate` allo stesso modo. Lo stesso vale per `PROD_DATABASE_URL` del backup
  (`pg_dump` ha bisogno della stessa stabilità di sessione). Aggiornata la documentazione
  sopra e in `docs/BACKUP.md`/`scripts/restore-backup.sh` di conseguenza (nessun cambio di
  codice: è solo quale stringa di connessione viene usata in produzione).
- DNS `ocrapigmento.com` attivo su Cloudflare, verificato. Struttura domini decisa:
  `www` (sito esistente, non toccare), `app` (questo progetto), `demo` (fase successiva).
- Trovata (dall'utente) una build Vercel Preview fallita per `AUTH_SECRET` mancante — non
  legata a questo lavoro, ma alle variabili impostate solo per l'ambiente Production. Non
  bloccante, segnato in checklist, da sistemare prima del deploy vero.

### 2026-10-02 — Bucket R2 creati, bug endpoint EU trovato e corretto

- Bucket `ocra-documenti` e `ocra-backup` creati su Cloudflare R2, giurisdizione EU, con due
  token scoped separati.
- **Trovato dall'utente**: un bucket R2 con giurisdizione EU richiede l'endpoint
  `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com` (col segmento `.eu.`) — il codice e gli
  script usavano `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (senza), che Cloudflare
  avrebbe rifiutato. Corretto in `src/server/integrations/storage.ts` (app),
  `.github/workflows/backup.yml` e `scripts/restore-backup.sh` (entrambi i passi R2).
  `npm run check`/`npm run build` verdi dopo la correzione.
- Prossimo passo: inserire le variabili Vercel (app) e i secret GitHub Actions (backup).

### 2026-10-02 — 12 variabili Vercel, primo deploy riuscito, dominio collegato

- 12 variabili inserite in Production su Vercel: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`,
  `CRON_SECRET`, `APP_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET`, `ANTHROPIC_API_KEY`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. Verificato con
  `vercel env ls production`: tutte presenti, scope Production, valori nascosti.
- Google OAuth: progetto Google Cloud dedicato "ocrapigmento", client "ocra-produzione",
  redirect su `app.ocrapigmento.com`, modalità Testing (utenti di test aggiunti a mano).
- **Trovato**: tutti i deployment (Production e Preview) risultavano in errore
  (`vercel ls`) — i deploy automatici erano partiti prima che tutte le 12 variabili fossero
  presenti. Con `vercel redeploy` sull'ultimo deployment di produzione, ora che le variabili
  ci sono tutte, il build è andato a buon fine: online su `https://ocramultitenant.vercel.app`.
- Dominio `app.ocrapigmento.com` aggiunto al progetto Vercel (`vercel domains add`). Record
  DNS richiesto (ancora da aggiungere su Cloudflare dall'utente): `A app 76.76.21.21`, DNS
  only (non proxato, altrimenti Vercel non emette il certificato TLS). Non tocca `www`.
- Rimandati a domani: `DEEPGRAM_API_KEY`, provider email (proposto Resend, vedi sopra), i
  secret GitHub del backup (`gh secret set` dà 403 con l'autenticazione CLI corrente —
  l'utente li inserisce dal sito).
