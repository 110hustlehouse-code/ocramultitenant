# OCRA

Il gestionale per le agenzie che lavorano a progetto: produzione esecutiva, eventi, agenzie creative.
È un servizio condiviso da più clienti (multi-tenant). Il primo cliente è il gruppo Masini: Fulcro Lucem, Duit e St'Art Factory.

| | |
|---|---|
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind 4 |
| Dati | PostgreSQL 16 · Prisma 7 (driver adapter `pg`) |
| Accesso | Auth.js v5: Google OAuth, più un accesso di sviluppo |
| Test | Vitest (unitari, più l'isolamento fra clienti verificato sul DB) |
| Hosting | Vercel · DNS su Cloudflare · n8n su Hetzner |

---

## Avvio in 3 passi (Codespaces)

1. **Crea la repo** e fai il push di questo codice (vedi sotto).
2. Su GitHub: **Code → Codespaces → Create codespace on main**.
   Il devcontainer avvia Postgres, installa le dipendenze, crea `.env` con un `AUTH_SECRET` nuovo, applica le migrazioni e carica i dati iniziali.
3. Nel terminale lancia:
   ```bash
   npm run dev
   ```
   Si apre la porta 3000. Per entrare scegli un account nel riquadro **Accesso sviluppo**.

| Account di sviluppo | Ruolo |
|---|---|
| daniele@ocra.local | CEO: tutto, vista consolidata, margine |
| erika@ocra.local | Project manager: nessun dato economico |
| creativo@ocra.local | Creativo |
| esterno@ocra.local | Esterno, accesso in scadenza |

### Primo push

```bash
cd ocra-platform
git init -b main
git add .
git commit -m "chore: base del prodotto OCRA (modulo 1: accesso, clienti, ruoli, società)"
gh repo create 110hustlehouse-code/ocra-platform --private --source=. --push
```

Senza `gh`: crea la repo vuota da github.com (senza README), poi usa `git remote add origin …` e `git push -u origin main`.

---

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Server di sviluppo |
| `npm run check` | Lint, controllo dei tipi e test. **Da lanciare prima di ogni commit** |
| `npm run build` | Build di produzione |
| `npm run db:migrate -- --name x` | Crea e applica una migrazione dopo una modifica allo schema |
| `npm run db:deploy` | Applica le migrazioni già committate (CI e produzione) |
| `npm run db:seed` | Carica i dati iniziali; si può rilanciare senza duplicare nulla |
| `npm run db:reset` | Azzera il DB locale e riapplica tutto |
| `npm run db:studio` | Prisma Studio, sulla porta 5555 |
| `npm run db:check` | Controlla che schema e migrazioni coincidano |

## Login con Google (quando serve)

1. In Google Cloud Console apri **Credenziali** e crea un **ID client OAuth** (applicazione web).
2. Come URI di reindirizzamento usa `https://<dominio>/api/auth/callback/google`.
3. Nel `.env` imposta `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` e `SEED_OWNER_EMAIL` (la tua email), poi lancia `npm run db:seed`.

In Codespaces l'indirizzo cambia per ogni codespace, quindi lì conviene usare l'accesso di sviluppo.
Possono entrare **solo le email invitate**, cioè presenti nella tabella `User`: non esiste una registrazione libera.

## Deploy su Vercel

- Variabili d'ambiente: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_TRUST_HOST=true`.
- Comando di build: `npm run db:deploy && npm run build`.
- In produzione l'accesso di sviluppo è **sempre spento**, qualunque sia il valore di `AUTH_DEV_LOGIN`.

## Documentazione

- [`CLAUDE.md`](CLAUDE.md): principi e regole, da leggere prima di scrivere codice
- [`docs/ARCHITETTURA.md`](docs/ARCHITETTURA.md): gestione dei clienti, permessi, flusso di una richiesta
- [`docs/ROADMAP.md`](docs/ROADMAP.md): ordine di costruzione dei moduli e stato
- [`docs/SVILUPPO.md`](docs/SVILUPPO.md): flusso di lavoro, come aggiungere un modulo, convenzioni
