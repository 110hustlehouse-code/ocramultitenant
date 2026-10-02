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

- [ ] Seed di produzione separato dal seed di sviluppo: solo tenant Fulcro (società, listino,
      139 clienti, 450 fornitori reali), nessun tenant demo, nessun utente `@ocra.local`
- [ ] Verifica che `dev-login` sia irraggiungibile con `NODE_ENV=production`
- [ ] Sentry (piano gratuito) per errori lato server e client
- [ ] GitHub Action di backup: `pg_dump` notturno del DB di produzione su bucket R2 dedicato,
      conservazione 30 giorni, script di ripristino documentato
- [ ] `npm run check` e `npm run build` verdi
- [ ] PR dedicata, merge su main

(Il dettaglio di ogni punto si aggiorna qui sotto mano a mano che si completa.)

### Fase 3 — Infrastruttura — ⏳ non iniziata (richiede l'utente)

Elenco completo delle variabili d'ambiente richieste: **da pubblicare qui prima di iniziare la
fase**, come richiesto. Si procederà un servizio alla volta, fermandosi a ogni passo che richiede
un'azione fisica (creare account, login CLI, incollare un valore).

### Fase 4 — Deploy e verifica — ⏳ non iniziata

### Fase 5 — Riepilogo — ⏳ non iniziata

---

## Log dettagliato

### 2026-10-02 — Fase 1 chiusa

- PR #15: fix conflitto peer-dep nodemailer/next-auth, `@playwright/test`, suite E2E 8 scenari,
  fix redirect cambio password. Mergeata su main (squash), commit `a576095`.
- `npm run check`: 230/230 test. `npm run build`: 36 route, invariate.
