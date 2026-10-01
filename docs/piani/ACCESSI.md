# Piano: Accessi dedicati per i collaboratori

Stato: **implementato (1 ott)**.

Differenze rispetto al piano: nessuna scorciatoia "disattiva accesso" nella scheda collaboratore —
solo da `/impostazioni/utenti` (`setUserActive`), per non duplicare la UI di gestione account che già
vive lì. L'avviso "esiste già" per CF/P.IVA duplicati in creazione collaboratore riusa `findDuplicate` e
`PartyConflictError` di `src/server/registry/service.ts` (esportati per l'occasione, erano privati).

Decisioni prese: password iniziale mostrata una tantum a schermo al CEO, mai via email · `bcryptjs`
(cost 12) invece di argon2 — problemi già avuti con moduli nativi nel bundle Vercel, zero rischio di build ·
checkbox "Crea anche l'accesso" nel form Collaboratori, opzionale ma spuntata di default.

## Cos'è

Oggi creare un collaboratore in `/collaboratori` crea solo un'anagrafica (`Party`); se gli si vuole dare
accesso all'app si collega un `User` **già esistente** (`linkedUserId`, scelto da una lista). Non esiste un
login via email+password: solo Google OAuth, e solo per email già invitate a mano in `/impostazioni/utenti`.

Richiesta: nello stesso form di creazione collaboratore, il CEO crea **anche** l'account — email, password
iniziale, ruolo, società — in un'unica operazione. Nessun collegamento a un utente che esiste già.

## Cosa già c'è e si riusa (niente da reinventare)

- **`getContext()` rilegge l'utente dal DB a ogni richiesta** (`src/server/context.ts:27`) e richiama
  `hasValidAccess()` (`active`, `accessExpiresAt`) ad ogni pagina/azione. Questo risolve da solo due dei
  requisiti: disattivazione immediata ed esterno scaduto che non entra — **zero codice nuovo per questa
  parte**, vale già oggi per gli utenti OAuth e varrà automaticamente per quelli con password.
- **`ROLE_PERMISSIONS["settings:manage"]`**: solo CEO (`src/server/auth/permissions.ts`). È già il permesso
  che decide chi gestisce `/impostazioni/utenti` — lo riuso tale e quale per "chi può creare/disattivare un
  account", come richiesto.
- **`upsertMember` / `revokeMember`** (`src/server/users/service.ts`): invito per email, ruolo, scadenza per
  gli Esterni. La logica di validazione (Esterno ⇒ `accessExpiresAt` obbligatoria) si riusa identica.
- **Pattern token** (`src/server/meetings/inbound.ts:newToken`): token casuale, solo l'hash SHA-256 salvato
  nel DB, confronto per hash all'uso. Stesso pattern per il link di reset password.
- **`sendEmail`** (`src/server/notify/email.ts`): SMTP Google Workspace già configurato, usato dai Solleciti.
- **Sessione**: `strategy: "jwt"`, nessun adapter DB (`src/auth.config.ts`). Aggiungere un secondo provider
  `Credentials` non cambia nulla della strategia: ogni provider restituisce uno `user`, lo stesso callback
  `jwt()` lo arricchisce con `uid`/`tid` a prescindere da quale provider ha autenticato. La domanda "come si
  combina" ha quindi risposta semplice: si combina senza attriti, perché la validità della sessione non vive
  nel token ma viene ri-decisa ad ogni richiesta da `getContext()` (vedi sopra).

## Decisioni prese

1. **Password iniziale**: mostrata una tantum a schermo al CEO dopo il salvataggio. L'email al collaboratore
   (se inviata) contiene solo un link di benvenuto/login, mai la password.
2. **Libreria hashing**: `bcryptjs`, cost factor 12. Pura JS, zero dipendenze native: niente rischio di build
   rotta su Vercel (già capitato in passato con altri moduli nativi).
3. **Società multiple in un solo salvataggio**: `companyIds: string[]`, stesso ruolo su tutte le società
   selezionate in questo salvataggio. Un ruolo diverso su un'altra società resta un'azione separata in
   `/impostazioni/utenti` (`upsertMember`, invariato).
4. **"Crea anche l'accesso"**: checkbox nel form Collaboratori, **opzionale ma spuntata di default** — chi
   crea un collaboratore di solito vuole anche dargli accesso; resta possibile deselezionarla per la sola
   anagrafica (es. un fornitore pagato ma senza login).

## Risposte alle domande tecniche poste

**Credentials + sessione attuale**: nessun cambio di strategia. Si aggiunge un provider `Credentials`
(`id: "password-login"`) accanto a `dev-login` in `src/auth.ts`. Il suo `authorize()`: trova l'utente per
email+tenant (stesso `resolveLoginUser`, che già gestisce l'ambiguità multi-tenant per host), verifica
lockout (`lockedUntil`), verifica l'hash, su successo azzera `failedLoginAttempts`, su fallimento lo
incrementa ed eventualmente imposta `lockedUntil`. Il resto (jwt, session, controlli ad ogni richiesta) non
cambia di una riga.

**Rate limiting attuale**: `src/server/security/rate-limit.ts` è **esplicitamente in memoria, per processo**
(commento nel file stesso: "non persiste tra deploy o istanze serverless diverse"). Su Vercel ogni invocazione
può finire su un'istanza diversa: un attacco a bassa frequenza distribuito lo scavalca del tutto. Per il login
propongo di **non aggiungere infrastruttura nuova** (niente Redis/Upstash: il progetto non ne ha e le
dipendenze sono pinnate per scelta) e di tenere il contatore **sul record `User` stesso**, che è già l'unico
store condiviso fra tutte le istanze (Postgres):
`failedLoginAttempts Int @default(0)`, `lockedUntil DateTime?`. Il limiter in-memory per IP resta com'è, come
prima barriera economica contro lo scripting banale dalla stessa richiesta; quello per account sul DB è
l'unico a cui affidarsi davvero.

## Schema (Prisma)

```prisma
model User {
  // ...esistenti...
  /// null = nessun login con password configurato (solo OAuth)
  passwordHash         String?
  /// true finché non cambia la password assegnata dal CEO: blocca ogni pagina tranne il cambio password
  mustChangePassword   Boolean   @default(false)
  failedLoginAttempts  Int       @default(0)
  lockedUntil          DateTime?

  passwordResetTokens  PasswordResetToken[]
}

/// Token monouso per "password dimenticata". Hash salvato, mai il token in chiaro.
model PasswordResetToken {
  id        String    @id @default(cuid())
  tenantId  String
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([userId])
}
```

`PasswordResetToken` va in `TENANT_MODELS` (`src/server/db/tenant.ts`), come da regola del progetto.
Migrazione: `npm run db:migrate -- --name accessi-dedicati`.

## Flussi

**Creazione (dal form Collaboratori)**
Visibile solo se `ctx.can("settings:manage")`. Sezione aggiuntiva nel form esistente: email, password
iniziale (il CEO la scrive, minimo 10 caratteri, validata lato server), ruolo (`Role` esistente), società
(checkbox multiple, riuso lo stile di `companyIds` in `PartyForm`), scadenza obbligatoria se ruolo Esterno.
Un'unica funzione `createCollaboratorWithAccess`, in transazione (`ctx.db.$transaction`):
crea `Party` → crea `User` (`passwordHash`, `mustChangePassword: true`) → crea una `Membership` per ogni
società scelta → collega `Party.linkedUserId`. Email duplicata nel tenant → errore chiaro prima di aprire la
transazione. "Solo anagrafica, niente accesso" resta possibile deselezionando la checkbox: il flusso
attuale (`createParty`, senza account) resta quello di sempre.

**Primo accesso**
Login con la password iniziale → `authorize()` ok, token include `mustChangePassword`. In `src/proxy.ts`
(Next 16, non `middleware.ts`) redirect forzato a `/password/nuova` per qualunque altra rotta applicativa
finché `mustChangePassword` è vero. Pagina con form nuova password (≥10 caratteri) + conferma → hash, salva,
azzera il flag, redirect alla home.

**Password dimenticata**
`/password/dimenticata` (email) → se esiste un utente con quella email **e** `passwordHash` non nullo,
genera token (pattern `newToken()`), salva solo l'hash con `expiresAt` (+1h), invia email con link
`{APP_URL}/password/reimposta/{token}`. Risposta identica a schermo in ogni caso ("se l'indirizzo esiste,
hai ricevuto l'email") per non rivelare chi è registrato. `/password/reimposta/[token]`: verifica hash,
scadenza, non già usato → nuova password, invalida gli altri token pendenti dello stesso utente, azzera
lockout.

**Disattivazione**
Nuova azione `setUserActive(ctx, userId, false)` in `src/server/users/service.ts`, dietro `settings:manage`.
Bottone in `/impostazioni/utenti`. Effetto immediato per il motivo
spiegato sopra: nessuna sessione da invalidare esplicitamente, perché ogni richiesta ripassa da
`getContext()`. Nota onesta: il cookie di sessione resta valido fino a scadenza (7 giorni) ma non apre più
nessuna pagina protetta — se in futuro serve invalidare anche la sessione stessa (non il suo effetto) serve
passare a sessioni su database; non necessario per il requisito così com'è scritto.

**Scadenza (Esterno)**
Nessun flusso nuovo: `hasValidAccess()` già nega l'accesso oltre `accessExpiresAt`, controllato ad ogni
richiesta. Il nuovo provider Credentials chiama la stessa `resolveLoginUser`/`hasValidAccess` prima di
accettare la password, quindi un Esterno scaduto non entra nemmeno con la password corretta.

## Pagine toccate o nuove

- `/collaboratori/nuovo`, `/collaboratori/[id]` — sezione "Accesso" nel form (solo con `settings:manage`)
- `/password/nuova` — nuova, cambio obbligatorio al primo accesso
- `/password/dimenticata` — nuova, richiesta reset
- `/password/reimposta/[token]` — nuova, imposta nuova password da email
- `/impostazioni/utenti` — bottone disattiva/riattiva account (oltre al revoke membership già presente)
- `/login` — link "password dimenticata", form password accanto al bottone Google

## Test (service-level, stesso stile di `service.test.ts` esistenti)

- login con password corretta/sbagliata
- lockout dopo N tentativi falliti, e sblocco dopo la finestra
- primo accesso: blocco di ogni altra pagina finché non cambia password
- utente disattivato: richiesta successiva nega l'accesso (già coperto a livello di `hasValidAccess`, test
  aggiuntivo solo per `setUserActive`)
- esterno con `accessExpiresAt` scaduto: password corretta ma accesso negato
- token di reset: valido una sola volta, nega se scaduto o già usato
- creazione atomica: se la `Membership` fallisce (es. società non gestibile), non resta né `Party` né `User`
  orfani
- nessuna password in chiaro: snapshot che verifica che `passwordHash` non contenga mai il valore in input

## Stima (ordine di grandezza)

| Parte | Giorni |
|---|---|
| Schema + migrazione | 0.5 |
| `auth.ts`: provider password, lockout | 1 |
| Rate limiting account (DB-backed) | 0.5 |
| Servizio creazione atomica + form Collaboratori | 1.5 |
| Primo accesso obbligatorio (pagina + redirect) | 0.5 |
| Password dimenticata (token, email, pagina) | 1 |
| Disattivazione account (servizio + UI) | 0.5 |
| Test | 1 |
| **Totale** | **~6-7 giorni** |
