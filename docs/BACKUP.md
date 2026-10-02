# Backup del database di produzione

`pg_dump` notturno (03:15 UTC) del database di produzione, caricato su un bucket R2
dedicato ai backup (separato dal bucket documenti), conservazione 30 giorni.
Workflow: `.github/workflows/backup.yml`.

## Come funziona

1. `pg_dump` gira dentro un container `postgres:17-alpine` (non installato sul runner:
   evita disallineamenti di versione con Supabase), formato custom (`-Fc`), già compresso.
2. Il dump va su `s3://<R2_BACKUP_BUCKET>/ocra-backups/db-YYYY-MM-DD.dump` via AWS CLI
   (R2 è compatibile S3; endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).
3. Un passo successivo elimina gli oggetti in `ocra-backups/` con `LastModified` oltre
   30 giorni fa.

Si può anche lanciare a mano da GitHub (`workflow_dispatch`), ad esempio prima di una
migrazione rischiosa.

Il job si attiva solo con la variabile repository (non segreto) `BACKUP_ENABLED=true`
(GitHub → Settings → Secrets and variables → Actions → tab *Variables*): finché i
segreti sotto non sono configurati, resta spento invece di fallire ogni notte.

## Segreti richiesti (GitHub → Settings → Secrets and variables → Actions)

| Secret | Cos'è |
|---|---|
| `PROD_DATABASE_URL` | Connection string Postgres di produzione (Supabase), **connessione diretta, porta 5432** — non il pooler: `pg_dump` non è affidabile attraverso un pooler in transaction mode |
| `R2_BACKUP_ACCOUNT_ID` | Account ID Cloudflare (lo stesso del bucket documenti, probabilmente) |
| `R2_BACKUP_ACCESS_KEY_ID` | Chiave di accesso **scoped solo al bucket di backup** — non quello documenti |
| `R2_BACKUP_SECRET_ACCESS_KEY` | Segreto della chiave sopra |
| `R2_BACKUP_BUCKET` | Nome del bucket R2 dedicato ai backup |

Credenziali separate da quelle del bucket documenti (`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/...
usate dall'app): se una delle due venisse compromessa, l'altra resta intatta.

## Ripristino

`scripts/restore-backup.sh` scarica un backup (l'ultimo, o una chiave specifica) e lo
ripristina su un database di destinazione con `pg_restore`. Chiede conferma esplicita
prima di scrivere.

```bash
R2_BACKUP_ACCOUNT_ID=... R2_BACKUP_ACCESS_KEY_ID=... R2_BACKUP_SECRET_ACCESS_KEY=... \
R2_BACKUP_BUCKET=... TARGET_DATABASE_URL=postgres://... \
./scripts/restore-backup.sh                       # ultimo backup
# oppure, backup specifico:
./scripts/restore-backup.sh ocra-backups/db-2026-10-01.dump
```

**La destinazione deve essere quasi sempre un progetto/database Supabase di test separato
da produzione**, mai produzione stessa, a meno di un vero disaster recovery. Supabase non
ha il branching di database di Neon: per una prova di ripristino si crea un progetto
Supabase a parte (anche solo per la durata della prova), ci si ripristina sopra, si
verificano i dati, poi lo si elimina. Usare sempre la connessione diretta (porta 5432) come
`TARGET_DATABASE_URL`, mai il pooler.

Richiede in locale: `aws` CLI e `pg_restore` (stessa major version di Postgres di
produzione, o più recente).
