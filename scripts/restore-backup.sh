#!/usr/bin/env bash
# Ripristina un backup da R2 su un database Postgres di destinazione.
#
# Pensato per la prova di ripristino periodica (Fase 4 del piano) e per un disaster
# recovery vero: la destinazione dovrebbe essere quasi sempre un progetto/database
# Supabase di test separato da quello di produzione, mai produzione stessa, a meno di
# sapere esattamente cosa si sta facendo. Usa una connessione DIRETTA o il SESSION POOLER
# (porta 5432), non il Transaction pooler: pg_restore ha bisogno di una sessione stabile.
#
# Uso:
#   R2_BACKUP_ACCOUNT_ID=... R2_BACKUP_ACCESS_KEY_ID=... R2_BACKUP_SECRET_ACCESS_KEY=... \
#   R2_BACKUP_BUCKET=... TARGET_DATABASE_URL=postgres://... \
#   ./scripts/restore-backup.sh [chiave-oggetto]
#
# Senza <chiave-oggetto>, ripristina il backup più recente in ocra-backups/.
# Richiede: aws CLI, pg_restore (stessa major version di Postgres o più recente).

set -euo pipefail

: "${R2_BACKUP_ACCOUNT_ID:?serve R2_BACKUP_ACCOUNT_ID}"
: "${R2_BACKUP_ACCESS_KEY_ID:?serve R2_BACKUP_ACCESS_KEY_ID}"
: "${R2_BACKUP_SECRET_ACCESS_KEY:?serve R2_BACKUP_SECRET_ACCESS_KEY}"
: "${R2_BACKUP_BUCKET:?serve R2_BACKUP_BUCKET}"
: "${TARGET_DATABASE_URL:?serve TARGET_DATABASE_URL (il database su cui ripristinare)}"

export AWS_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto
# Bucket con giurisdizione EU: serve il segmento ".eu." nell'endpoint.
ENDPOINT="https://${R2_BACKUP_ACCOUNT_ID}.eu.r2.cloudflarestorage.com"

KEY="${1:-}"
if [ -z "$KEY" ]; then
  echo "Nessuna chiave indicata: cerco il backup più recente in ocra-backups/ ..."
  KEY=$(aws s3api list-objects-v2 --bucket "$R2_BACKUP_BUCKET" --prefix "ocra-backups/" --endpoint-url "$ENDPOINT" \
    --query "sort_by(Contents, &LastModified)[-1].Key" --output text)
  if [ -z "$KEY" ] || [ "$KEY" = "None" ]; then
    echo "Nessun backup trovato in ocra-backups/." >&2
    exit 1
  fi
fi

echo "Backup scelto: $KEY"
echo "Destinazione: ${TARGET_DATABASE_URL%%@*}@... (host nascosto)"
read -r -p "Confermi il ripristino? Scrive sopra i dati eventualmente già presenti [sì/NO]: " CONFIRM
if [ "$CONFIRM" != "sì" ] && [ "$CONFIRM" != "si" ] && [ "$CONFIRM" != "yes" ]; then
  echo "Annullato."
  exit 1
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

aws s3 cp "s3://${R2_BACKUP_BUCKET}/${KEY}" "$TMP" --endpoint-url "$ENDPOINT"
pg_restore --clean --if-exists --no-owner --no-privileges -d "$TARGET_DATABASE_URL" "$TMP"

echo "✓ Ripristino completato da $KEY"
