# Fireflies → OCRA (verbali automatici)

Decisione del 29 settembre: le riunioni online (Meet, Zoom, Teams collegati al calendario) le trascrive
**Fireflies.ai**; un workflow **n8n** le passa a OCRA. OCRA non conosce Fireflies: riceve il formato
generico del suo webhook (`POST /api/webhooks/verbali`, vedi `src/server/meetings/inbound.ts`).
Il tasto «ascolto» in app resta su Deepgram.

```
Fireflies ──(webhook V2, firmato)──→ n8n ──(API GraphQL Fireflies)──→ n8n ──(Bearer ocra_mtg_…)──→ OCRA
```

## Configurazione

1. **OCRA** → Verbali → Collegamenti → «Nuovo collegamento» (serve il ruolo CEO). Una società per
   collegamento; il progetto solo se tutte le riunioni sono di un progetto. Copia il token `ocra_mtg_…`.
2. **n8n** → importa `n8n-fireflies-verbali.json`, poi:
   - credenziale *Header Auth* «Fireflies API»: nome `Authorization`, valore `Bearer <API key Fireflies>`
     (Fireflies → Integrations → Fireflies API);
   - credenziale *Header Auth* «OCRA collegamento»: nome `Authorization`, valore `Bearer ocra_mtg_…`;
   - nel nodo «Invia a OCRA» sostituisci `DOMINIO-OCRA` con il dominio dell'app;
   - variabili d'ambiente dell'istanza n8n: `FIREFLIES_WEBHOOK_SECRET=<segreto>`,
     `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (per verificare la firma) e, se l'istanza blocca `$env`
     nei nodi, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`;
   - attiva il workflow e copia l'URL di produzione del nodo webhook.
3. **Fireflies** → Integrations → Webhooks V2: incolla l'URL di n8n, evento *meeting.transcribed*,
   stesso segreto di `FIREFLIES_WEBHOOK_SECRET`.

Più società: un workflow (e un collegamento) per società, oppure un nodo *Switch* prima di «Invia a OCRA»
che sceglie la credenziale in base all'organizzatore.

## Cosa fa il workflow

| Nodo | |
|---|---|
| Fireflies: trascrizione pronta | Risponde subito (Fireflies non ritenta se la risposta supera 30 s) e tiene il corpo grezzo |
| Verifica firma | `X-Hub-Signature = sha256=HMAC(corpo, segreto)`; ignora eventi diversi da *meeting.transcribed* |
| Leggi da Fireflies | Titolo, data, durata (minuti), partecipanti, frasi con chi parla |
| Traduci per OCRA | `id = fireflies:<id>` (un reinvio non crea doppioni), durata in secondi, frasi con orario |
| Invia a OCRA | 202 = verbale in elaborazione, 200 `duplicate` = già arrivato; 3 tentativi in caso di errore |

**Progetto**: se il titolo dell'evento di calendario contiene il codice PO tra parentesi quadre
(«Produzione Nora [FL/COMUNIC/01-2026/NORA/E]»), la riunione va su quel progetto. Altrimenti OCRA
propone il progetto task per task e il PM conferma.

Il codice dei nodi è provato in `src/server/meetings/fireflies-bridge.test.ts`: se cambi il workflow,
esporta il JSON qui e rilancia i test.

## Da verificare al primo collegamento vero

- La documentazione di Fireflies non dice l'unità di `start_time`: il workflow assume secondi e converte
  se i valori sembrano millisecondi. Controlla gli orari nel primo verbale.
- `dateString` è la data della trascrizione: per riunioni lunghe a cavallo della mezzanotte il giorno
  potrebbe essere quello successivo.
