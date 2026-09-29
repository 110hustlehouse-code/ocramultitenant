# Piano: Solleciti ai clienti

Stato: **approvato e implementato** (29 set, branch `feat/solleciti`).

Decisioni prese: richiami interni in pausa durante l'attesa · promemoria ogni 3 giorni lavorativi, al massimo 2,
poi avviso al PM · risposta del cliente segnata a mano (Gmail più avanti) · **voce di menu propria «Solleciti»**,
separata dai Richiami (due concetti distinti per Daniele) · email del referente chiesta all'avvio e salvata
sull'anagrafica · un solo mittente per tutte le società.

Differenze rispetto al piano: il vincolo «un solo sollecito attivo per task» è nel servizio (Prisma non esprime
indici parziali senza creare differenze nel controllo migrazioni); l'email all'avvio si salva sull'anagrafica solo
se chi avvia può modificare le anagrafiche (PM, CEO), altrimenti resta sul sollecito.

## Cos'è, e cosa non è

Un **sollecito** si apre quando un task è fermo perché si aspetta qualcosa da un **cliente esterno**
(approvazione, file, risposta). Lo avvia una persona (il collaboratore assegnato o il PM), con una nota su
cosa si aspetta. OCRA scrive al cliente e, se il cliente tace, lo ricorda dopo N giorni lavorativi.

|  | Richiami (esistenti, invariati) | Solleciti (nuovi) |
|---|---|---|
| Destinatario | Persone interne (`User`) | Referente del cliente (`Party`) |
| Chi lo avvia | Il sistema, alla scadenza del task | Una persona: assegnatario o PM, mai il sistema |
| Seguito automatico | Livelli 1-2 al collaboratore, 3 al PM | Promemoria al cliente dopo N giorni di silenzio, con un tetto |
| Escalation | PM → CEO | Oltre il tetto non si scrive più al cliente: avviso al PM |
| Blocco account | Sì, deciso da PM o CEO | No (non si applica a un cliente) |
| Tono | Coordinamento interno, «messaggio automatico di OCRA» | Prima persona dell'agenzia, firmato dalla persona; nessun riferimento a OCRA |
| Dato che produce | Puntualità del collaboratore | Giorni di attesa per causa esterna, per progetto |

## Modello dati: entità nuova, non estensione di `Reminder`

`Reminder` è un registro di eventi verso un `User` (destinatario obbligatorio) indicizzato per livello; il motore
dei richiami lo usa per non inviare doppioni. Il sollecito ha invece un destinatario esterno e uno **stato con una
durata** (aperto → chiuso), che è il dato per il margine. Estendere `Reminder` vorrebbe dire rendere facoltativo il
destinatario e toccare le query del motore appena unito. Quindi due modelli nuovi (entrambi in `TENANT_MODELS`):

```prisma
enum FollowUpStatus {
  ATTIVO     /// si aspetta il cliente
  RISOLTO    /// il cliente ha risposto / consegnato
  ANNULLATO  /// aperto per errore o non più necessario
}

/// Sollecito: un task è fermo in attesa di un cliente esterno.
model ClientFollowUp {
  id             String         @id @default(cuid())
  tenantId       String
  taskId         String
  projectId      String         /// ridondante con task.projectId: la vista per progetto non fa join
  partyId        String?        /// il cliente (per default quello del progetto)
  /// Referente al momento dell'avvio: se l'anagrafica cambia, il thread resta coerente
  contactName    String?
  contactEmail   String
  /// Cosa si aspetta, scritto da chi lo avvia (entra nel messaggio)
  waitingFor     String
  status         FollowUpStatus @default(ATTIVO)
  startedById    String
  startedAt      DateTime       @default(now())
  /// Promemoria automatici: ogni quanti giorni lavorativi, fino a quanti
  everyWorkdays  Int            @default(3)
  maxReminders   Int            @default(2)
  remindersSent  Int            @default(0)
  nextReminderAt DateTime?      /// null = nessun promemoria in programma
  /// Oltre il tetto: il PM è stato avvisato (una volta sola)
  managerNotifiedAt DateTime?
  resolvedAt     DateTime?
  resolvedById   String?
  resolutionNote String?

  @@index([tenantId, status])
  @@index([projectId, status])
  @@index([taskId])
}

enum ClientMessageKind { PRIMO PROMEMORIA }

/// Ogni messaggio inviato al cliente, con il testo esatto.
model ClientMessage {
  id          String            @id @default(cuid())
  tenantId    String
  followUpId  String
  kind        ClientMessageKind
  channel     ReminderChannel   @default(EMAIL)  /// stesso enum dei richiami: WhatsApp si aggiunge lì
  to          String
  subject     String
  body        String
  /// Message-ID dell'email: i promemoria rispondono nello stesso thread
  messageId   String?
  sentById    String?           /// null = promemoria automatico
  delivered   Boolean           @default(false)
  error       String?
  createdAt   DateTime          @default(now())

  @@index([followUpId])
}
```

Regole di integrità (nel servizio, con test):
- al massimo **un sollecito ATTIVO per task**;
- il task deve essere `DA_FARE`; chiudere il task chiude il sollecito (`RISOLTO`);
- `contactEmail` obbligatoria: se il referente del cliente non ha email, la si chiede all'avvio e la si salva
  anche sull'anagrafica (solo se chi avvia può scrivere le anagrafiche; altrimenti solo sul sollecito).

## Flusso

```
Task DA_FARE ──«In attesa del cliente»──→ modulo: cosa aspetti? a chi? (testo precompilato, modificabile)
      │                                            │ Invia
      │                                            ▼
      │                               ClientFollowUp ATTIVO + ClientMessage PRIMO (email al cliente)
      │                                            │
      │                     N giorni lavorativi senza «Il cliente ha risposto»
      │                                            ▼
      │                               ClientMessage PROMEMORIA (stesso thread) … fino a maxReminders
      │                                            │ tetto raggiunto
      │                                            ▼
      │                               nessun altro messaggio al cliente · email al PM (una volta)
      ▼
«Il cliente ha risposto» / task chiuso ──→ RISOLTO (resolvedAt) · «Annulla» ──→ ANNULLATO
```

- **Avvio**: dal task (dove oggi c'è «Non posso»), bottone «In attesa del cliente». Solo l'assegnatario o chi ha
  `projects:write` sulla società (il PM). Il messaggio parte subito; chi lo avvia vede e può correggere il testo.
- **Promemoria automatici**: nell'endpoint orario già esistente (`/api/cron/richiami`), dopo `runReminders`,
  una nuova `runClientFollowUps(now)`. Parte solo nei giorni lavorativi tra le 9 e le 17 di Roma; idempotente come
  i richiami (avanza `remindersSent` e ricalcola `nextReminderAt` nella stessa transazione del registro).
- **Silenzio del cliente**: OCRA non legge la posta. La risposta arriva a una persona, che preme «Il cliente ha
  risposto». Il testo lo ricorda a chi avvia; la vista mostra da quanto è aperto, così i dimenticati si notano.
  (Riconoscere le risposte da solo richiede l'accesso a Gmail: fase successiva.)
- **Richiami interni in pausa**: mentre un sollecito è ATTIVO il motore dei richiami salta il task, come fa già
  con `blockerNote` (una condizione in più nella query di `runReminders`). Il ritardo non è del collaboratore.
  Alla chiusura del sollecito il task torna nei richiami normali. Unica modifica all'area Richiami, con test.

## Email al cliente

Stessa infrastruttura (`sendEmail`, SMTP Google Workspace), template diverso in `src/server/followups/templates.ts`:

- **Da**: l'indirizzo della società (`SMTP_FROM` oggi; per società quando servirà). **Rispondi a**: la persona
  che l'ha avviato, così la risposta arriva a lei e non a una casella di sistema.
- **Niente** «OCRA», «messaggio automatico», bottoni o link all'app: il cliente non ha accesso.
- Testo semplice (e HTML minimo equivalente), prima persona dell'agenzia, firma della persona:

> Oggetto: Nora Vale · Videoclip — materiale per procedere
>
> Buongiorno Nora,
>
> per andare avanti con il videoclip ci servirebbe **l'approvazione del montaggio v1**.
> Appena possibile ci fa sapere? Se serve qualche chiarimento sono a disposizione.
>
> Grazie, buona giornata
> Marco Villa · Duit

- **Promemoria**: stesso thread (`In-Reply-To`/`References` col `messageId` del primo), testo breve e diverso
  per il primo e il secondo («Le riscrivo per…», «Torno a disturbarla perché…»), sempre firmato dalla stessa
  persona. Se chi l'ha avviato non è più attivo, firma il PM del progetto.
- **WhatsApp**: `channel` è già sul registro; si aggiungerà come per i richiami.

## Visibilità per PM e CEO

- **Pagina «In attesa del cliente»** (sezione di Richiami o voce propria): un gruppo per progetto con cliente,
  cosa si aspetta, da quanti giorni lavorativi, promemoria inviati, chi l'ha avviato, ultimo messaggio;
  in cima i progetti fermi da più tempo e quelli oltre il tetto.
- **Segnale** su progetto e task: «In attesa di Nora Vale da 4 giorni».
- **Dato per il margine**: giorni di attesa per causa esterna per progetto (solleciti chiusi + aperti),
  calcolati da `startedAt`/`resolvedAt`. Il modulo Margine li legge da qui, senza campi in più.

## Permessi e moduli

- Modulo nuovo `SOLLECITI` in `ModuleKey` (attivabile per cliente, nel DB).
- Permesso nuovo `followups:manage` (PM, CEO): vedere la pagina, annullare, cambiare frequenza, risolvere
  solleciti di altri. Avvio e «il cliente ha risposto» sul proprio task: anche il collaboratore assegnato
  (regola sull'assegnatario, come per «Non posso»). Esterni: no.

## Omonimia da sistemare

Oggi «Sollecito» è l'etichetta di `ReminderKind.SOLLECITO` (il PM scrive al collaboratore). Proposta: l'etichetta
in UI diventa «Richiamo del PM»; l'enum resta com'è, nessuna migrazione. «Sollecito» indicherà solo il cliente.

## Consegna

Un branch `feat/solleciti`, dopo l'unione della PR #7:
1. migrazione + `TENANT_MODELS` + permessi e modulo;
2. servizio (`start`, `resolve`, `cancel`, `runClientFollowUps`) e template, con test sul DB (un sollecito
   attivo per task, pausa dei richiami, tetto e avviso al PM una volta, giorni lavorativi, thread);
3. UI: bottone e modulo sul task, pagina per PM/CEO, segnale sul progetto;
4. docs (ARCHITETTURA, ROADMAP).
