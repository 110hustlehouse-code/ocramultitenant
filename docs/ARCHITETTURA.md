# Architettura

## Modello dati (modulo 1)

```
Tenant  (cliente OCRA, es. Gruppo Masini)
 ├─ modules[]         moduli attivi per questo cliente
 ├─ domain            es. ocra.fulcrolucem.it
 ├─ Company[]         società: Fulcro Lucem, Duit, St'Art (branding: colori chiaro/scuro, logo)
 └─ User[]            persone: role = CEO | PROJECT_MANAGER | CREATIVE | EXTERNAL
```

**Ruolo e società sono separati.** Il ruolo sta sull'utente e dice cosa può fare.
La società si sceglie dal selettore in UI (cookie `ocra_company`) e dice cosa sta guardando.
Il team è condiviso fra le tre società, quindi un utente non è mai legato a una società.

## Flusso di una richiesta

```
browser
  → src/proxy.ts            controllo rapido: c'è una sessione? Altrimenti → /login
  → pagina / action
      → getContext()        (src/server/context.ts, calcolato una volta per richiesta)
          • auth()           legge il JWT (id utente, tenant)
          • prisma.user…     rilegge l'utente dal DB: disattivato o scaduto → fuori subito
          • cookie società   → ctx.view = { kind: "company", company } | { kind: "all" }
          • ctx.db           client Prisma filtrato sul tenant
          • ctx.can(perm)    permessi del ruolo
      → requireModule(key)  404 se il modulo è spento per il cliente o manca il permesso
```

## Isolamento fra clienti

`src/server/db/tenant.ts` è un'estensione Prisma che, per ogni modello in `TENANT_MODELS`:

- aggiunge `tenantId` al `where` di tutte le letture, degli aggiornamenti e delle cancellazioni;
- imposta `tenantId` nelle creazioni e **rifiuta** ogni scrittura verso un altro cliente;
- **blocca per default** le operazioni che non conosce.

È verificata da `tenant.test.ts`, anche sul database reale: un cliente non vede, non modifica e non cancella i dati di un altro.
Limiti noti: le scritture annidate e le query `$queryRaw` non vengono filtrate.

## Accesso

- Auth.js v5 con sessione JWT (7 giorni). Il token contiene solo `uid`, `tid` e `role`; i permessi veri si rileggono dal DB.
- Google OAuth: entra solo chi ha un'email verificata **e** presente in `User`.
- La stessa email può comparire in più clienti (per esempio un freelance). In quel caso decide il dominio della richiesta (`Tenant.domain`).
- Un utente esterno senza `accessExpiresAt` non entra mai.
- Accesso di sviluppo (`dev-login`): attivo solo se `AUTH_DEV_LOGIN=true` **e** l'ambiente non è di produzione.

## Permessi

| Ruolo | Vede | Dati economici | Vista consolidata |
|---|---|---|---|
| CEO | Tutto | Sì | Sì |
| Project manager | Progetti e task di tutte le società | No | No |
| Creativo | I propri task e i file dei progetti assegnati | No | No |
| Esterno | Un solo progetto, con scadenza | No | No |

La mappa sta in `src/server/auth/permissions.ts`. Il filtro «solo i propri task» e «un solo progetto» arriva con il modulo 2.

## Tema e branding

- I colori sono token su `:root` e `[data-theme="dark"]` in `globals.css`, esposti a Tailwind come `bg-surface`, `text-muted`, `bg-brand`…
- Il layout applica `.brand-scope` e le variabili `--brand-light` e `--brand-dark` della società attiva, validate con `safeHex`.
- Nella vista consolidata il guscio resta neutro.
- Il testo sopra il colore del brand (`text-on-brand`) viene calcolato in base al contrasto.
- I loghi stanno su una tessera con il loro fondo originale (`Company.logoBg`), così si leggono in entrambi i temi.
