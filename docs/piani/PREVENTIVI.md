# Piano: Preventivi e creazione automatica del progetto

Stato: **da approvare** (29 set). Nessun codice scritto.
Ordine deciso: Preventivi prima del Margine, perché il Margine confronta i costi con il preventivo.

## Cosa c'è già (verificato nel codice)

- Modulo `PREVENTIVI` registrato (`src/lib/modules.ts`, pagina segnaposto `/preventivi`) con permesso
  `quotes:write`, che oggi ha **solo il CEO**. Anche `finance:read` è solo del CEO; la tabella dei permessi
  in ARCHITETTURA dice «Dati economici: solo CEO».
- `Project.code` (codice PO, unico per tenant, già maiuscolo e senza spazi), `Project.service` (**testo libero**),
  `Company.poPrefix` (FL, DT, …). Formato visto nei dati: `AP/EVENTI/03-2026/TEATRONUOVO/E`.
- **Nessun listino nel DB** e **nessuna generazione PDF** nel progetto (i Verbali producono solo markdown):
  il PDF va costruito da zero.
- Roadmap: «Preventivi numerati da OCRA (si riparte dal n. 30), poi ricopiati su Fatture in Cloud».

## Modello dati

Importi in **centesimi (Int)**, mai float. Tutto con `tenantId` e in `TENANT_MODELS`.

```prisma
/// Listino della società: da qui Claude compone le voci. Configurabile nel DB, mai nel codice.
model ServiceItem {
  id           String  @id @default(cuid())
  tenantId     String
  companyId    String
  name         String            /// «Service audio e luci»
  description  String?
  /// Segmento SERVIZIO del codice PO (es. EVENTI, BRAND, COMUNIC)
  poCode       String
  unit         String  @default("forfait")   /// forfait, giorno, ora, pezzo…
  unitPrice    Int                /// prezzo di listino, centesimi
  /// Costo interno previsto per unità (solo CEO): base del budget del Margine
  unitCost     Int?
  active       Boolean @default(true)
  sortOrder    Int     @default(0)
}

enum QuoteStatus { BOZZA INVIATO ACCETTATO RIFIUTATO }

model Quote {
  id            String      @id @default(cuid())
  tenantId      String
  companyId     String
  clientId      String                  /// Party CLIENTE
  number        Int                     /// progressivo per società
  year          Int
  title         String                  /// diventa il nome del progetto
  status        QuoteStatus @default(BOZZA)
  issueDate     DateTime
  validUntil    DateTime?
  intro         String?                 /// testo iniziale (proposto da Claude, modificabile)
  terms         String?                 /// condizioni (default dalla società: «50% alla firma…»)
  vatRate       Int         @default(22)
  subtotal      Int                     /// ricalcolati dal server a ogni salvataggio
  vat           Int
  total         Int
  /// Il brief da cui Claude ha proposto le voci (per rifarlo o capire da dove vengono)
  brief         String?
  sentAt        DateTime?
  acceptedAt    DateTime?
  rejectedAt    DateTime?
  rejectionNote String?
  /// Passi del manuale dopo l'accettazione: si segnano, non bloccano
  contractSignedAt  DateTime?
  depositReceivedAt DateTime?
  projectId     String?     @unique      /// il progetto creato all'accettazione
  createdById   String?

  @@unique([companyId, year, number])
}

model QuoteLine {
  id            String  @id @default(cuid())
  tenantId      String
  quoteId       String
  serviceItemId String?          /// null = voce fuori listino
  description   String           /// copia: il preventivo non cambia se cambia il listino
  quantity      Decimal @db.Decimal(10, 2)
  unit          String
  unitPrice     Int
  total         Int
  /// Costo previsto (interno, mai nel PDF): diventa il budget di costo della voce
  plannedCost   Int?
  sortOrder     Int
}

/// Budget del progetto: nasce dalle voci del preventivo accettato, poi vive da solo
/// (varianti ed extra si aggiungono qui). Il Margine confronterà i costi reali con queste righe.
model ProjectBudgetLine {
  id            String  @id @default(cuid())
  tenantId      String
  projectId     String
  quoteLineId   String? @unique      /// da quale voce del preventivo viene (null = aggiunta dopo)
  serviceItemId String?
  description   String
  revenue       Int                  /// ricavo previsto (centesimi)
  plannedCost   Int?                 /// costo previsto
  sortOrder     Int
}
```

In più, sulla società (nel DB, come il branding): `nextQuoteNumber` (Fulcro riparte da 30), `quoteTerms` (condizioni
predefinite), `quoteValidityDays`, `quoteFooter` (IBAN, note). Sul cliente (`Party`): `shortCode` facoltativo per il
segmento CLIENTE del codice PO.

**Perché voci copiate e non collegate**: il preventivo è un documento firmato e deve restare com'era; il budget invece
cambia (varianti, extra). Il legame resta tramite `quoteLineId`, così il Margine può mostrare «preventivato» contro
«budget attuale» contro «speso» per ogni voce.

## Flusso e dove si aggancia la creazione del progetto

```
BOZZA ──(Claude propone le voci dal listino; il CEO corregge)──→ PDF ──«Segna come inviato»──→ INVIATO
INVIATO ──«Accettato»──→ ACCETTATO  ⇒  acceptQuote(): in una transazione
                                         • crea Project (società, cliente, nome = titolo, servizio, codice PO)
                                         • copia le voci in ProjectBudgetLine
                                         • quote.projectId = progetto
INVIATO ──«Rifiutato» (motivo)──→ RIFIUTATO
```

- Aggancio: **una funzione di servizio `acceptQuote(ctx, id, { managerId, poCode? })`**, chiamata dall'azione del
  pulsante «Accettato». Nessun trigger nel DB e nessun automatismo nascosto: il passaggio lo fa una persona.
  Nella stessa schermata si sceglie il PM del progetto e si conferma il codice PO proposto.
- Dopo la transazione (con `after()`) si può notificare n8n per cartella Drive e board (roadmap, modulo 8):
  in questo blocco preparo solo il punto d'aggancio, senza chiamate esterne.
- **Codice PO** generato e modificabile prima di confermare: `PREFISSO/SERVIZIO/MM-AAAA/CLIENTE/E`
  — prefisso della società, `poCode` della voce principale (la più alta), mese dell'accettazione,
  `Party.shortCode` o, se manca, il nome del cliente in maiuscolo senza spazi e senza forma societaria
  (max 12 caratteri), `E`. Se il codice esiste già, si aggiunge `-2`.
- Dopo il progetto: i campi «Contratto firmato» e «Acconto ricevuto» si spuntano sul preventivo. Non bloccano
  nulla (principio 3), ma il progetto mostra se mancano.
- Un preventivo INVIATO non si modifica: si **duplica** in una nuova bozza (nuovo numero). Così il PDF inviato
  resta quello registrato.

## Claude: bozza assistita

Il CEO scrive un brief («Serata di apertura stagione, 2 giorni, service audio e luci, riprese e montaggio»)
e sceglie il cliente. Claude riceve il listino **della società** (voci, unità, prezzi), i preventivi precedenti
dello stesso cliente (se ci sono) e restituisce con structured outputs (stesso schema dei Verbali):
`title`, `intro`, `lines[{ serviceItemId | null, description, quantity, unit, unitPrice }]`, `notes`.
Regole: usa le voci di listino e i loro prezzi; una voce fuori listino è marcata e senza prezzo inventato
(la compila il CEO); non inventa sconti. Il server ricalcola sempre i totali: l'AI non decide gli importi finali.

## PDF

Nessun pattern da riusare. Proposta: **`@react-pdf/renderer`** (versione pinnata) in un route handler
`GET /preventivi/[id]/pdf`: JavaScript puro, gira su Vercel senza Chromium. Layout della società: logo (PNG, già
presenti), colore via `safeHex`, dati giuridici della società (P.IVA, PEC, SDI già nel DB), numero, cliente,
voci, totali, condizioni, piè di pagina. Font: servono i file statici `.ttf`/`.woff` di Archivo e Public Sans
(quelli installati sono variabili `.woff2`, che la libreria non legge) → si aggiungono in `public/fonts`.
Il costo previsto non compare mai nel PDF.

## Permessi (dal modello esistente)

- `quotes:write` (oggi solo CEO): creare, modificare, inviare, accettare, rifiutare preventivi; gestire il listino.
- `finance:read` (solo CEO): vedere importi e budget del progetto.
- Il PM vede il progetto creato e i suoi task, **non** gli importi: come oggi.
Se si vuole che il PM prepari bozze, basta dargli `quotes:write` in `permissions.ts`; ma vedrebbe i prezzi, che
oggi per lui sono esclusi. Propongo di lasciarlo solo al CEO.

## Consegna

Branch `feat/preventivi`, **dopo l'unione della PR #8** (Solleciti) per evitare conflitti su schema e migrazioni:
1. migrazione (ServiceItem, Quote, QuoteLine, ProjectBudgetLine, campi su Company e Party) + seed del listino demo;
2. servizio: listino, bozze, totali, numerazione, stati, `acceptQuote` con codice PO e budget; test sul DB;
3. Claude: proposta delle voci (structured outputs), con test sulla normalizzazione;
4. PDF; 5. UI: listino, elenco e scheda preventivo, accettazione; budget (sola lettura, CEO) sul progetto.

## Da decidere

1. **Quando nasce il progetto**: all'«Accettato» (come chiedi), con contratto e acconto come spunte che non
   bloccano? Il manuale dice accettato → contratto → acconto → progetto: se preferisci, il progetto può nascere
   all'«Acconto ricevuto».
2. **Numerazione**: progressiva **per società** e continua negli anni (dal 30 per Fulcro), oppure ripartire da 1
   ogni anno? Formato mostrato: «Preventivo n. 30/2026».
3. **`E` / `U` nel codice PO**: la mia lettura è E = entrata (vendita al cliente), U = uscita (acquisto da
   fornitore). I progetti da preventivo sono sempre `E`?
4. **Permessi**: solo il CEO (come il modello attuale) o anche il PM prepara le bozze?
5. **IVA**: una sola aliquota per preventivo (22% di default) va bene, o servono aliquote per voce?
6. **Invio**: per ora PDF scaricato e «Segna come inviato»; l'invio email con allegato può seguire. Ok?
