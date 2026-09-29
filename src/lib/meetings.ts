/** Etichette e toni degli stati di un verbale (UI). */
export const MEETING_STATUS = {
  BOZZA: { label: "Da registrare", tone: "text-muted" },
  IN_ELABORAZIONE: { label: "In elaborazione", tone: "text-warn" },
  DA_RIVEDERE: { label: "Da rivedere", tone: "text-warn" },
  CONFERMATO: { label: "Confermato", tone: "text-ok" },
  ERRORE: { label: "Errore", tone: "text-danger" },
} as const;

/** Da dove è arrivata la riunione (UI). */
export const MEETING_SOURCE = {
  REGISTRAZIONE: "Registrata in app",
  AUDIO: "Audio caricato",
  TESTO: "Trascrizione incollata",
  WEBHOOK: "Da servizio esterno",
} as const;
