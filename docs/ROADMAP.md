# Roadmap: ordine di costruzione

Ogni modulo alimenta quello dopo. Non si salta un passo.

| # | Modulo | Stato | Note |
|---|---|---|---|
| 1 | Accesso, gestione dei clienti, ruoli, selettore società | ✅ fatto | Ruoli per società (Membership) e dati giuridici: 29 set |
| 2 | Clienti e fornitori | ✅ fatto | Anagrafica unica per società, import CSV (tutto o niente), P.IVA/CF/SDI validati |
| 3 | Progetti e task | ✅ fatto | Task si chiude solo con prova; «I tuoi task» in cima; collaboratori vedono solo i propri |
| 3b | (modello di progetto per società) | | Fasi e campi personalizzati, se serve |
| 4 | Verbali AI → estrazione dei task | ✅ fatto | Registra/carica/incolla → Deepgram → Claude → il PM conferma i task |
| 4b | Verbali: riunioni da servizi esterni | ✅ fatto (29 set) | Webhook con token per collegamento (`/verbali/collegamenti`); fonte della riunione registrata; stesso flusso a valle. Fireflies tramite ponte n8n (decisione 29 set, `docs/integrazioni/FIREFLIES.md`); Deepgram resta per l'ascolto in app |
| 5 | Richiamo ed escalation | ✅ fatto (29 set) | Email (Gmail Workspace, decisione 23 set), poi web push. Collaboratore → PM → CEO, solo persone interne (nessun richiamo verso i clienti); il blocco lo decidono PM o CEO |
| 5b | Solleciti ai clienti | ✅ fatto (29 set) | Voce di menu separata dai Richiami. Il collaboratore o il PM avvia «In attesa del cliente» → email al cliente in prima persona; promemoria ogni 3 giorni lavorativi (max 2) nello stesso thread, poi avviso al PM. Richiami interni in pausa. Giorni fermi per il cliente per progetto → Margine. Piano: `docs/piani/SOLLECITI.md` |
| 6 | Documenti | | File di progetto e prove |
| 7 | Margine in tempo reale e consolidato | ✅ fatto (30 set) | Preventivato (`ProjectBudgetLine`) contro costo reale, per progetto/società/gruppo. Costo reale = costi registrati a mano dal CEO (fatture, esterni) + lavoro interno stimato dai task chiusi collegati a una riga di budget — **niente ore**, come richiesto. Allerta (non blocco) se la spesa corre più veloce della consegna. Solo `finance:read`/`finance:write` (CEO) |
| 8 | Preventivi e creazione automatica del progetto | ✅ fatto (30 set, unito da `feat/preventivi`) | Listino, bozza assistita da Claude, PDF, accettazione → crea il progetto col budget dalle voci. Piano: `docs/piani/PREVENTIVI.md`. Manca ancora: cartella Drive e board via n8n |
| 8b | (pagina «Impostazioni società») | | Oggi condizioni, IBAN/piè di pagina, validità preventivo, numerazione e accento PDF (`pdfAccent`) si toccano solo da seed/DB. Serve una pagina CEO per modificarli senza uscire dall'app |

## Priorità dette da Daniele (23 set) — Fase 1
1. **Verbali**: registrazione in sede (tasto «ascolto») e da Meet/Teams/Zoom → trascrizione → task assegnati
2. **Budget e rendicontazione**: per progetto → per società → totale gruppo, in soldi e in task (non in ore)
3. Bandi: Fase 2

Fondamenta dati prima dei verbali: **Clienti e Fornitori** (import CSV, il caricamento lo fanno loro),
**Progetti e task**. Preventivi numerati da OCRA (si riparte dal n. 30), poi ricopiati su Fatture in Cloud.
Collaudo: 2 settimane senza errori con tutto il team.

## Demo di vendita
Stesso codice, secondo tenant «Aurora (demo)» con dati inventati (seed, dominio `ocragency.shop`).
Quando questa versione mostra più della demo vecchia (anagrafiche + progetti + verbali),
`ocragency.shop` passa qui e la repo `ocra` si archivia. Gli strumenti AI dello Studio restano
su un sottodominio finché non entrano con la Fase 3.

## Ordine della demo
**Margine a rischio** → **verbale che genera i task** → **richiamo**.

## Modulo 2: cosa serve (bozza)
- `ProjectTemplate` (per società): fasi e campi personalizzati in JSON validato con zod
- `Project`: società, cliente finale, stato, date, preventivo di riferimento
- `ProjectMember`: chi lavora sul progetto; gli esterni solo qui, con scadenza
- `Task`: responsabile, scadenza, origine (manuale o verbale), prova di chiusura
- Permessi: il creativo vede i task assegnati a lui, l'esterno vede un solo progetto
