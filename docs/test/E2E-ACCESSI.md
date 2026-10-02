# E2E — Accessi collaboratori

Scenari da verificare end-to-end (Playwright) sul flusso di accesso dei collaboratori
esterni: creazione, primo login, cambio password, visibilità dati, blocco per
tentativi falliti, reset password, disattivazione, scadenza accesso, login Google.

Niente casella email reale nei test: dove serve un token (reset password), si legge
dal DB o si intercetta l'invio — va dichiarato nel report.

## Scenari

1. Il CEO crea un collaboratore esterno con accesso e scadenza tra 2 giorni: la
   password iniziale compare una volta sola nell'interfaccia; ricaricando la pagina
   non si vede più.
2. Il collaboratore fa login: viene forzato al cambio password, e prima del cambio
   non riesce ad aprire nessun'altra pagina (provare anche URL diretti).
3. Dopo il cambio password: il collaboratore vede solo il suo progetto/società,
   nessun dato economico.
4. 5 o più login con password sbagliata: l'account si blocca temporaneamente, poi
   si sblocca allo scadere del blocco.
5. "Password dimenticata": il link di reset funziona una volta sola e scade.
6. Il CEO disattiva il collaboratore mentre è loggato: alla richiesta successiva
   viene buttato fuori.
7. Un esterno con `accessExpiresAt` nel passato: login negato anche con password
   corretta.
8. Login Google con utente Workspace esistente: **non automatizzabile** — si
   verifica solo che il provider Google sia ancora configurato e che la pagina di
   login lo mostri. Il test reale lo fa manualmente l'utente.

## Esito

Vedi report del run più recente più sotto (tabella scenario / esito / note),
aggiornato ad ogni esecuzione.
