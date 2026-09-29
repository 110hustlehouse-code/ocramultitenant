# Architettura

## Modello dati (modulo 1)

```
Tenant  (cliente OCRA, es. Gruppo Masini)
 ├─ modules[]         moduli attivi per questo cliente
 ├─ domain            es. ocra.fulcrolucem.it
 ├─ Company[]         società: branding (colori, logo) + dati giuridici (P.IVA, PEC, SDI, REA, legale rapp., prefisso PO)
 ├─ User[]            persone (nessun ruolo qui)
 ├─ Membership[]      (utente, società) → role = CEO | PROJECT_MANAGER | CREATIVE | EXTERNAL
 ├─ Project[]         commesse per società: cliente (Party), PM, PO, date, team (ProjectMember)
 │   └─ Task[]         da fare / fatto; chiusura solo con prova (link o nota); origine manuale o verbale
 └─ Party[]           anagrafiche: kind = CLIENTE | FORNITORE, collegate alle società via PartyCompany
```

**Progetti.** CEO e PM vedono tutti i progetti della società; collaboratori ed esterni solo quelli
in cui sono nel team o hanno un task, e dentro solo i propri task. L'elenco segue la società
selezionata; dettaglio e chiusura task valgono su tutte le società dell'utente (link da «I tuoi task»).

**Anagrafiche.** Un cliente/fornitore è unico nel gruppo (P.IVA, poi CF, poi nome) e si collega
a una o più società. Ognuno vede quelle delle società che guarda; modifiche ed eliminazioni toccano
solo i collegamenti alle società dove l'utente può scrivere. Import CSV: tutto o niente, colonne
riconosciute dal nome (`src/server/registry/csv.ts`).

**Il ruolo vale in una società.** Decisione del 23 settembre: c'è un PM per società
(Erika per Fulcro, Miele per St'Art, Giammarco per Duit) ed Erika è CEOO solo di Fulcro e St'Art.
- Nessuna `Membership` per una società = quella società non compare nel selettore.
- Il team resta condiviso: un collaboratore ha una riga per ogni società in cui lavora.
- La società guardata si sceglie in UI (cookie `ocra_company`); il ruolo attivo è quello che l'utente ha lì.
- Un trigger nel DB impedisce `Membership` fra utente e società di tenant diversi.

## Flusso di una richiesta

```
browser
  → src/proxy.ts            controllo rapido: c'è una sessione? Altrimenti → /login
  → pagina / action
      → getContext()        (src/server/context.ts, calcolato una volta per richiesta)
          • auth()           legge il JWT (id utente, tenant)
          • prisma.user…     rilegge l'utente dal DB: disattivato o scaduto → fuori subito
          • ctx.access       società accessibili, con il ruolo in ognuna
          • cookie società   → ctx.view = { kind: "company", company, role } | { kind: "all", companies }
          • ctx.role         ruolo nella società guardata (null nel consolidato)
          • ctx.db           client Prisma filtrato sul tenant
          • ctx.can(perm)    permessi nella vista corrente
      → requireModule(key)  404 se il modulo è spento per il cliente o manca il permesso
```

## Verbali: tre ingressi, un solo flusso

```
tasto «ascolto» / audio caricato ─→ R2 ─→ Deepgram ─┐
testo incollato o .txt ──────────────────────────────┼─→ Meeting.transcript ─→ Claude ─→ task proposti ─→ conferma PM
servizio esterno (webhook) ──────────────────────────┘
```

- `Meeting.source` (`REGISTRAZIONE | AUDIO | TESTO | WEBHOOK`) dice solo da dove è arrivata; dopo, `runProcessing` è uno.
- **Webhook** `POST /api/webhooks/verbali`: fuori dalla sessione Auth.js. Si autentica con il token di un
  `MeetingIntegration` (creato dal CEO in `/verbali/collegamenti`, mostrato una volta, nel DB solo l'hash SHA-256).
  Il token decide tenant, società e progetto predefinito; il modulo `VERBALI` deve essere attivo.
  Stesso `id` esterno → nessun doppione. Progetto: quello del collegamento, poi il codice PO inviato, poi nessuno
  (Claude lo propone task per task). Formato del corpo: `src/server/meetings/inbound.ts`.
- Un'elaborazione «in corso» da più di 10 minuti è considerata interrotta e si può riprovare.
- **Formato del verbale**: quello del modello di Fulcro e St'Art («Sc. Verbali Riunioni»). Claude restituisce
  i campi (structured outputs, `MINUTES_SCHEMA`); `renderMinutes` compone il testo sempre con le stesse sezioni:
  dati della riunione (data, orario, tipo, durata, partecipanti, oratore, verbalizzatore), ordine del giorno con
  durata stimata, sintesi per punto, decisioni prese (solo quelle formali), azioni assegnate (= i task proposti),
  prossimo appuntamento. Il verbalizzatore lo scrive il sistema: «OCRA, per <chi l'ha avviato>» o il collegamento.

## Isolamento fra clienti

`src/server/db/tenant.ts` è un'estensione Prisma che, per ogni modello in `TENANT_MODELS`:

- aggiunge `tenantId` al `where` di tutte le letture, degli aggiornamenti e delle cancellazioni;
- imposta `tenantId` nelle creazioni e **rifiuta** ogni scrittura verso un altro cliente;
- **blocca per default** le operazioni che non conosce.

È verificata da `tenant.test.ts`, anche sul database reale: un cliente non vede, non modifica e non cancella i dati di un altro.
Limiti noti: le scritture annidate e le query `$queryRaw` non vengono filtrate.

## Accesso

- Auth.js v5 con sessione JWT (7 giorni). Il token contiene solo `uid` e `tid`; ruoli e permessi si rileggono dal DB a ogni richiesta.
- Google OAuth: entra solo chi ha un'email verificata **e** presente in `User`.
- La stessa email può comparire in più clienti (per esempio un freelance). In quel caso decide il dominio della richiesta (`Tenant.domain`).
- Serve almeno una società accessibile. Chi è solo esterno (EXTERNAL ovunque) senza `accessExpiresAt` non entra mai.
- Accesso di sviluppo (`dev-login`): attivo solo se `AUTH_DEV_LOGIN=true` **e** l'ambiente non è di produzione.

## Permessi

| Ruolo | Vede | Dati economici | Vista consolidata |
|---|---|---|---|
| CEO | Tutto | Sì | Sì |
| Project manager | Progetti e task della società (anche blocco account) | No | No |
| Creativo | I propri task e i file dei progetti assegnati | No | No |
| Esterno | Un solo progetto, con scadenza | No | No |

La vista consolidata esiste se l'utente è CEO in almeno due società e include solo quelle
(Erika: Fulcro + St'Art). Lì vale solo ciò che l'utente può fare in ogni società inclusa.

La mappa sta in `src/server/auth/permissions.ts`. Il filtro «solo i propri task» e «un solo progetto» arriva con il modulo 2.

## Tema e branding

- I colori sono token su `:root` e `[data-theme="dark"]` in `globals.css`, esposti a Tailwind come `bg-surface`, `text-muted`, `bg-brand`…
- Il layout applica `.brand-scope` e le variabili `--brand-light` e `--brand-dark` della società attiva, validate con `safeHex`.
- Nella vista consolidata il guscio resta neutro.
- Il testo sopra il colore del brand (`text-on-brand`) viene calcolato in base al contrasto.
- I loghi stanno su una tessera con il loro fondo originale (`Company.logoBg`), così si leggono in entrambi i temi.
