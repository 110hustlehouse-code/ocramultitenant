/**
 * Testi dei solleciti al cliente. Scritti come li scriverebbe una persona dell'agenzia: prima persona,
 * firma di chi l'ha avviato, niente riferimenti a OCRA né a messaggi automatici. Solo testo semplice.
 * Condivisi con la UI: chi avvia il sollecito vede (e può correggere) il testo prima dell'invio.
 */

export type FollowUpMailInput = {
  contactName: string | null;
  projectName: string;
  /** Cosa si aspetta, es. «l'approvazione del montaggio v1» */
  waitingFor: string;
  senderName: string;
  companyName: string;
};

const greeting = (contactName: string | null) => {
  const first = contactName?.trim().split(/\s+/)[0];
  return first ? `Buongiorno ${first},` : "Buongiorno,";
};

const signature = (i: FollowUpMailInput) => `${i.senderName}\n${i.companyName}`;

/** «L'approvazione…» → «l'approvazione…», senza punto finale: entra a metà frase. */
export function inSentence(waitingFor: string): string {
  const t = waitingFor.trim().replace(/[.!;:]+$/, "");
  const firstWord = t.split(/[\s']/)[0] ?? "";
  // Le sigle restano come sono («PDF firmato», «OK del cliente»)
  if (firstWord.length > 1 && firstWord === firstWord.toUpperCase()) return t;
  return t.charAt(0).toLowerCase() + t.slice(1);
}

export function firstMessage(i: FollowUpMailInput): { subject: string; body: string } {
  return {
    subject: `${i.projectName} — ci serve un vostro riscontro`,
    body: [
      greeting(i.contactName),
      "",
      `per andare avanti con ${i.projectName} ci servirebbe ${inSentence(i.waitingFor)}.`,
      "Appena possibile ci fa sapere? Se serve qualche chiarimento sono a disposizione.",
      "",
      "Grazie, buona giornata",
      signature(i),
    ].join("\n"),
  };
}

/** Promemoria n (1, 2…): risposta nello stesso thread, testo diverso ogni volta. */
export function reminderMessage(i: FollowUpMailInput, n: number, firstSubject: string): { subject: string; body: string } {
  const what = inSentence(i.waitingFor);
  const lines =
    n <= 1
      ? [
          `le riscrivo in merito a ${i.projectName}: per procedere ci servirebbe ancora ${what}.`,
          "Riesce a farci avere un riscontro nei prossimi giorni?",
        ]
      : [
          `torno a scriverle per ${what}: senza questo il lavoro su ${i.projectName} resta fermo e rischiamo di slittare con i tempi.`,
          "Mi fa sapere quando pensa di riuscire? Se è più comodo, possiamo sentirci al telefono.",
        ];
  return {
    subject: firstSubject.startsWith("Re: ") ? firstSubject : `Re: ${firstSubject}`,
    body: [greeting(i.contactName), "", ...lines, "", "Grazie,", signature(i)].join("\n"),
  };
}
