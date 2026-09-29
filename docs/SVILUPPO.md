# Flusso di sviluppo

## Ciclo di lavoro

1. Crea un branch: `git checkout -b feat/progetti`.
2. Scrivi il codice e i test.
3. Lancia `npm run check`: deve passare tutto.
4. Fai commit con un messaggio convenzionale (`feat:`, `fix:`, `chore:`, `docs:`) e apri una PR. La CI esegue lint, tipi, test, build e il controllo delle migrazioni.
5. Fai il merge su `main`: Vercel pubblica in automatico.

## Modificare lo schema

```bash
# 1. modifica prisma/schema.prisma
npm run db:migrate -- --name aggiungi_progetti   # crea la migrazione e rigenera il client
# 2. se il modello ha tenantId → aggiungilo a TENANT_MODELS (src/server/db/tenant.ts)
# 3. aggiorna prisma/seed.ts se servono dati iniziali
git add prisma/ src/
```

Non modificare mai una migrazione già finita su `main`: crea sempre una migrazione nuova.

## Aggiungere un modulo (checklist)

- [ ] Il valore in `enum ModuleKey` esiste già; altrimenti aggiungilo con una migrazione.
- [ ] `src/lib/modules.ts`: imposta `ready: true` quando il modulo è pronto.
- [ ] Permessi nuovi in `src/server/auth/permissions.ts`, con i test.
- [ ] La pagina in `src/app/(app)/<modulo>/page.tsx` inizia con `await requireModule("KEY")`.
- [ ] Legge e scrive i dati **solo** con `ctx.db`.
- [ ] Le Server Actions richiamano `getContext()` e controllano `ctx.can(...)`: non fidarti mai della UI.
- [ ] La vista cambia con `ctx.view`: una società oppure «tutte» (il consolidato, solo per il CEO).
- [ ] Controlla il principio 1: stai chiedendo a qualcuno di compilare un campo? Trova da dove estrarlo.

## Struttura

```
src/
  app/
    (app)/            pagine autenticate (layout con sidebar e selettore società)
    login/            accesso
    api/auth/         Auth.js
    api/health/       health check (DB)
  auth.ts             Auth.js: provider e callback con accesso al DB
  auth.config.ts      configurazione senza DB (usata anche dal proxy)
  proxy.ts            redirect a /login se manca la sessione
  env.ts              variabili d'ambiente validate
  components/         UI (shell, theme, moduli)
  lib/                funzioni pure: colori, registro moduli
  server/
    context.ts        getContext / requireModule / requirePermission
    auth/             permessi, risoluzione utente, azioni di login
    company/          selettore società
    db/               client Prisma e isolamento fra clienti
  generated/prisma/   client generato (non si committa)
prisma/
  schema.prisma · migrations/ · seed.ts
```

## Note su Codespaces

- Postgres risponde su `localhost:5432` (utente, password e database: `ocra`).
- Le Server Actions e l'HMR accettano gli indirizzi `*.app.github.dev` (vedi `next.config.ts`).
- Per ricreare il DB da zero: `npm run db:reset`.

## Verbali: chiavi e archivio file

Variabili (in `.env` e su Vercel):

| Variabile | A cosa serve | Dove si prende |
|---|---|---|
| `ANTHROPIC_API_KEY` | Verbale e task proposti | console.anthropic.com → API Keys |
| `DEEPGRAM_API_KEY` | Trascrizione audio (italiano, voci distinte) | console.deepgram.com → API Keys |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Audio delle riunioni | Cloudflare → R2 → bucket + API token Object Read & Write |

Senza chiavi la pagina funziona lo stesso: si incolla la trascrizione; registrazione e caricamento
audio restano spenti. Senza `ANTHROPIC_API_KEY` il verbale va in errore con un messaggio chiaro.

**CORS del bucket R2** (Cloudflare → R2 → bucket → Settings → CORS policy): il browser carica
l'audio direttamente su R2, quindi il bucket deve accettare PUT dal dominio dell'app.

```json
[
  {
    "AllowedOrigins": ["https://ocra.fulcrolucem.it", "https://ocragency.shop", "https://*.app.github.dev"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

Flusso: audio su R2 (URL firmato) → Deepgram lo scarica e trascrive → Claude scrive il verbale e
propone i task (strumento con schema, id validati) → il PM conferma → task con origine VERBALE.
L'elaborazione gira dopo la risposta (`after`, `maxDuration = 300` sulla pagina del verbale).
