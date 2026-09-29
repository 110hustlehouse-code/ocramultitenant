# Roadmap: ordine di costruzione

Ogni modulo alimenta quello dopo. Non si salta un passo.

| # | Modulo | Stato | Note |
|---|---|---|---|
| 1 | Accesso, gestione dei clienti, ruoli, selettore società | ✅ fatto | Ruoli per società (Membership) e dati giuridici: 29 set |
| 2 | Progetti e task | ⏳ prossimo | Modelli di progetto configurabili per società; chiusura di un task allegando una prova |
| 3 | Verbali AI → estrazione dei task | | Il modulo che dimostra la tesi. Claude API |
| 4 | Richiamo ed escalation | | WhatsApp, poi email, poi web push. Escalation al PM e poi al CEO. Blocco duro solo dal CEO |
| 5 | Documenti | | File di progetto e prove |
| 6 | Margine in tempo reale e consolidato | | Il modulo che vale di più in vendita. Solo per il CEO |
| 7 | Preventivi e creazione automatica del progetto | | Preventivo accettato → progetto, cartella Drive, board (n8n) |

## Priorità dette da Daniele (23 set) — Fase 1
1. **Verbali**: registrazione in sede (tasto «ascolto») e da Meet/Teams/Zoom → trascrizione → task assegnati
2. **Budget e rendicontazione**: per progetto → per società → totale gruppo, in soldi e in task (non in ore)
3. Bandi: Fase 2

Fondamenta dati prima dei verbali: **Clienti e Fornitori** (import CSV, il caricamento lo fanno loro),
**Progetti e task**. Preventivi numerati da OCRA (si riparte dal n. 30), poi ricopiati su Fatture in Cloud.
Collaudo: 2 settimane senza errori con tutto il team.

## Ordine della demo
**Margine a rischio** → **verbale che genera i task** → **richiamo**.

## Modulo 2: cosa serve (bozza)
- `ProjectTemplate` (per società): fasi e campi personalizzati in JSON validato con zod
- `Project`: società, cliente finale, stato, date, preventivo di riferimento
- `ProjectMember`: chi lavora sul progetto; gli esterni solo qui, con scadenza
- `Task`: responsabile, scadenza, origine (manuale o verbale), prova di chiusura
- Permessi: il creativo vede i task assegnati a lui, l'esterno vede un solo progetto
