@AGENTS.md

# OCRA — regole del progetto

Gestionale multi-tenant per agenzie che lavorano **a progetto**. Primo cliente: gruppo Masini
(Fulcro Lucem, Duit, St'Art Factory). Leggi `docs/ARCHITETTURA.md` prima di toccare dati o permessi.

## I tre principi (ogni funzione si valuta contro questi)
1. **Il sistema estrae, non chiede.** Nessun campo obbligatorio a carico di un creativo.
   I task nascono dai verbali; un task si chiude allegando una prova.
2. **Il margine si vede mentre il progetto è aperto.** Ore e costi contro preventivo, in continuo.
3. **Il software insiste, le persone premono.** Il richiamo non blocca; il blocco lo decidono le persone (PM o CEO), mai l'automatismo.

## Regole tecniche non negoziabili
- Dati di dominio SEMPRE tramite `ctx.db` (da `getContext()`), mai `prisma` diretto.
  `prisma` di base solo per auth, risoluzione tenant, health.
- Nuovo modello con `tenantId` → aggiungilo a `TENANT_MODELS` in `src/server/db/tenant.ts`
  (un test fallisce se lo dimentichi). Niente scritture annidate su modelli tenant.
- Permessi: `ctx.can("permesso")`, mai `if (role === "CEO")`. Nuovi permessi in `permissions.ts`.
- Il ruolo sta su `Membership` (utente × società), mai sull'utente. La società guardata è `ctx.view`;
  il ruolo attivo è `ctx.role`. Controlli sempre con `ctx.can()`, che tiene conto della società.
- Branding, listini, modelli di progetto, moduli attivi: nel DB, mai nel codice.
- Colori dal DB solo tramite `safeHex()`. Colori di stato (ok/warn/danger) indipendenti dai brand.
- Ogni modifica allo schema = migrazione (`npm run db:migrate -- --name <nome>`), committata.
- AI (Claude API) dove serve capire o scrivere; regole/n8n dove serve solo eseguire.
- Notifiche: WhatsApp → email → web push. Mai costruire sulle push.

## Design
Guscio neutro freddo; colore = società attiva. Archivo (titoli, numeri), Public Sans (testo),
IBM Plex Mono (etichette, `.label`). Numeri con `.num` (tabular-nums). Tema chiaro e scuro.

## Prima di ogni commit
`npm run check` (lint + typecheck + test). La CI esegue anche build e controllo migrazioni.

## Versioni
Dipendenze pinnate. Prisma resta su 7.x (la 8 è in RC). Next 16: `proxy.ts` al posto di
`middleware.ts`, API di richiesta asincrone (`await cookies()`, `await searchParams`).
