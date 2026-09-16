#!/usr/bin/env bash
# Eseguito una volta alla creazione del Codespace.
set -euo pipefail

if [ ! -f .env ]; then
  cp .env.example .env
  secret="$(openssl rand -base64 32)"
  sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=\"${secret}\"|" .env
  echo "✓ .env creato con AUTH_SECRET generato"
fi

npm ci            # esegue anche `prisma generate` (postinstall)
npm run db:wait
npm run db:deploy # applica le migrazioni committate
npm run db:seed   # dati iniziali (idempotente)

echo ""
echo "✓ Pronto. Avvia con:  npm run dev"
