# Roadmap: ordine di costruzione

Ogni modulo alimenta quello dopo. Non si salta un passo.

| # | Modulo | Stato | Note |
|---|---|---|---|
| 1 | Accesso, gestione dei clienti, ruoli, selettore società | ✅ fatto | Ruoli per società (Membership) e dati giuridici: 29 set |
| 2 | Clienti e fornitori | ✅ fatto | Anagrafica unica per società, import CSV (tutto o niente), P.IVA/CF/SDI validati |
| 3 | Progetti e task | ✅ fatto | Task si chiude solo con prova; «I tuoi task» in cima; collaboratori vedono solo i propri |
| 3b | (modello di progetto per società) | | Fasi e campi personalizzati: dopo i verbali, se serve | Modelli di progetto configurabili per società; chiusura di un task allegando una prova |
| 4 | Verbali ⏳ prossimo AI → estrazione dei task | | Il modulo che dimostra la tesi. Claude API |
| 5 | Richiamo ed escalation | | WhatsApp, poi email, poi web push. Escalation al PM e poi al CEO. Blocco duro solo dal CEO |
| 6 | Documenti | | File di progetto e prove |
| 7 | Margine in tempo reale e consolidato | | Il modulo che vale di più in vendita. Solo per il CEO |
| 8 | Preventivi e creazione automatica del progetto | | Preventivo accettato → progetto, cartella Drive, board (n8n) |

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
