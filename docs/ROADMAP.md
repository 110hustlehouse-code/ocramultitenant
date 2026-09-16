# Roadmap: ordine di costruzione

Ogni modulo alimenta quello dopo. Non si salta un passo.

| # | Modulo | Stato | Note |
|---|---|---|---|
| 1 | Accesso, gestione dei clienti, ruoli, selettore società | ✅ fatto | Base del prodotto |
| 2 | Progetti e task | ⏳ prossimo | Modelli di progetto configurabili per società; chiusura di un task allegando una prova |
| 3 | Verbali AI → estrazione dei task | | Il modulo che dimostra la tesi. Claude API |
| 4 | Richiamo ed escalation | | WhatsApp, poi email, poi web push. Escalation al PM e poi al CEO. Blocco duro solo dal CEO |
| 5 | Documenti | | File di progetto e prove |
| 6 | Margine in tempo reale e consolidato | | Il modulo che vale di più in vendita. Solo per il CEO |
| 7 | Preventivi e creazione automatica del progetto | | Preventivo accettato → progetto, cartella Drive, board (n8n) |

## Ordine della demo
**Margine a rischio** → **verbale che genera i task** → **richiamo**.

## Modulo 2: cosa serve (bozza)
- `ProjectTemplate` (per società): fasi e campi personalizzati in JSON validato con zod
- `Project`: società, cliente finale, stato, date, preventivo di riferimento
- `ProjectMember`: chi lavora sul progetto; gli esterni solo qui, con scadenza
- `Task`: responsabile, scadenza, origine (manuale o verbale), prova di chiusura
- Permessi: il creativo vede i task assegnati a lui, l'esterno vede un solo progetto
