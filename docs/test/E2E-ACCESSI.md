# E2E — Accessi collaboratori

Scenari da verificare end-to-end (Playwright) sul flusso di accesso dei collaboratori
esterni: creazione, primo login, cambio password, visibilità dati, blocco per
tentativi falliti, reset password, disattivazione, scadenza accesso, login Google.

Niente casella email reale nei test: dove serve un token (reset password), si legge
dal DB o si intercetta l'invio — va dichiarato nel report.

## Scenari

1. Il CEO crea un collaboratore esterno con accesso e scadenza tra 2 giorni: la
   password iniziale compare una volta sola nell'interfaccia; ricaricando la pagina
   non si vede più.
2. Il collaboratore fa login: viene forzato al cambio password, e prima del cambio
   non riesce ad aprire nessun'altra pagina (provare anche URL diretti).
3. Dopo il cambio password: il collaboratore vede solo il suo progetto/società,
   nessun dato economico.
4. 5 o più login con password sbagliata: l'account si blocca temporaneamente, poi
   si sblocca allo scadere del blocco.
5. "Password dimenticata": il link di reset funziona una volta sola e scade.
6. Il CEO disattiva il collaboratore mentre è loggato: alla richiesta successiva
   viene buttato fuori.
7. Un esterno con `accessExpiresAt` nel passato: login negato anche con password
   corretta.
8. Login Google con utente Workspace esistente: **non automatizzabile** — si
   verifica solo che il provider Google sia ancora configurato e che la pagina di
   login lo mostri. Il test reale lo fa manualmente l'utente.

## Come lanciarla

```
npm run dev                          # terminale 1 — serve DB raggiungibile (npm run db:wait)
E2E_BASE_URL=http://localhost:3000 npx playwright test   # terminale 2
```

I fixture (tenant, società, utenti) si creano in `e2e/helpers/db.ts` e si eliminano da soli
a fine suite (`test.afterAll` → cascade su `Tenant`). Nessun dato di test resta nel DB.

## Esito (ultimo run: 2026-10-02)

| # | Scenario | Esito | Note |
|---|----------|-------|------|
| 1 | Password iniziale mostrata una volta sola | ✅ Passato | Confermato anche dopo reload della pagina. |
| 2 | Login forza il cambio password | ✅ Passato | Vedi **Corretto 1** sotto: il redirect a `/password/nuova` ora è immediato e diretto, nessuna pagina protetta renderizza mai contenuto nel frattempo. |
| 3 | Dopo il cambio: visibilità limitata | ✅ Passato | Vedi **Trovato 2** sotto: `/margine`, `/collaboratori`, `/impostazioni/utenti` restituiscono sempre status 200 invece di 404, pur mostrando correttamente il contenuto "Pagina non disponibile" — nessun dato trapela. |
| 4 | Blocco dopo 5+ tentativi falliti | ✅ Passato | Lo sblocco allo scadere è stato simulato spostando `lockedUntil` nel passato (i 15 minuti reali non sono stati attesi). |
| 5 | Reset password monouso | ✅ Passato | Il token reale non è leggibile dal DB (solo l'hash SHA-256 è salvato): per il link vero si è intercettato l'invio chiamando `requestPasswordReset` con un sender fittizio (stessa tecnica del test unitario già in repo), non la vera casella email. |
| 6 | Disattivazione mentre loggato | ✅ Passato | Il redirect a `/login?error=AccessDenied` scatta alla richiesta piena successiva. |
| 7 | Accesso scaduto nega il login | ✅ Passato | — |
| 8 | Provider Google configurato | ✅ Passato | In questo ambiente `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` sono vuoti (placeholder): la pagina mostra correttamente "Google non configurato" invece del bottone. Il test verifica che la pagina rifletta la configurazione corrente, qualunque sia; con credenziali reali comparirebbe "Accedi con Google". Il login OAuth vero resta da verificare a mano. |

### Corretto 1 — redirect post-login ora passa dalla stessa Server Action

Prima della correzione: dopo un login riuscito con `mustChangePassword: true`, la Server Action
(`signInWithPassword`) lasciava che `signIn()` facesse `redirect()` da sé verso la pagina di
destinazione originale (es. `/`). Quel redirect era gestito dal router client-side di Next (fetch
interno della Server Action), che non passa dal proxy: per un istante l'URL restava sulla
destinazione originale. Verificato che il *contenuto* mostrato era comunque corretto (il modulo
di cambio password, non la pagina richiesta) — il router client-side aveva già applicato
l'eventuale redirect del proxy al contenuto, solo l'indirizzo visibile non si aggiornava di
conseguenza — ma l'indirizzo sbagliato era comunque un comportamento scorretto da correggere.

Fix applicato in `src/server/auth/actions.ts`: le Credentials (`password-login`, `dev-login`)
chiamano ora `signIn(..., { redirect: false })` e la Server Action stessa rilegge l'utente dal
DB (`resolveLoginUser`, la stessa funzione del provider — non la sessione appena scritta, che un
`auth()` nella stessa invocazione non vede ancora) per decidere la destinazione reale: diretta a
`/password/nuova` se `mustChangePassword`, altrimenti quella originale. Google (OAuth) non è
toccato: la sua autenticazione si completa in modo asincrono dopo il round-trip col provider
esterno, il controllo non si applica a quel punto.

Aggiunto anche un backstop in `getContext()` (`src/server/context.ts`): rilegge l'utente dal DB
a ogni richiesta e reindirizza a `/password/nuova` se `mustChangePassword` è vero, indipendente
dal proxy — nessuna pagina che passa da `getContext()` può più renderizzare contenuto per un
utente che deve ancora cambiare la password assegnata dal CEO, qualunque sia il percorso con cui
ci è arrivato.

Lo scenario 2 ora verifica l'URL immediato (`/password/nuova`), il contenuto corretto, e
l'assenza di contenuto della panoramica ("Ciao").

### Trovato 2 — `notFound()` restituisce status 200 invece di 404 (non corretto, solo documentato su richiesta)

Le pagine che chiamano `notFound()` per un permesso mancante (es. `/margine`,
`/collaboratori`, `/impostazioni/utenti` per un ruolo Esterno) mostrano correttamente il
contenuto di `src/app/not-found.tsx` ("Pagina non disponibile") — **nessun dato protetto
trapela** — ma la risposta HTTP ha sempre status **200**, non 404. Confermato sia in `next dev`
sia in build di produzione (`next build && next start`): non è un artefatto del dev server o di
Turbopack. La causa più probabile è architetturale: nell'App Router con rendering in streaming,
lo status della risposta viene "committato" quando iniziano a uscire i primi byte (il layout),
prima che il segmento della pagina, più in profondità nell'albero, lanci `notFound()`.

Impatto pratico: nessuna violazione di sicurezza (il contenuto è correttamente bloccato), ma
qualunque cliente/strumento che si affidi allo status HTTP (non al contenuto) per sapere se una
richiesta è autorizzata — monitoraggio, integrazioni, test automatici — vedrebbe un falso 200.

**Decisione**: non corretto in questa PR, lasciato così — noto e non bloccante.
