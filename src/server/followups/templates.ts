import type { Email } from "@/server/notify/email";

/**
 * Email interne dei solleciti (i testi per il cliente stanno in src/lib/followups.ts).
 * Questa va al PM quando il cliente non risponde neanche dopo i promemoria.
 */
export function managerNoticeEmail(
  to: { email: string; name: string },
  f: {
    taskTitle: string;
    projectName: string;
    companyName: string;
    contactName: string | null;
    contactEmail: string;
    waitingFor: string;
    days: number;
    reminders: number;
    startedByName: string;
    url: string;
  },
): Email {
  const first = to.name.split(" ")[0];
  const who = f.contactName ? `${f.contactName} (${f.contactEmail})` : f.contactEmail;
  const subject = `Il cliente non risponde: ${f.projectName}`;
  const text = [
    `Ciao ${first},`,
    "",
    `su ${f.projectName} (${f.companyName}) aspettiamo ${f.waitingFor} da ${f.days} giorni lavorativi.`,
    `${f.startedByName} ha scritto a ${who} e sono partiti ${f.reminders} promemoria, senza risposta.`,
    "Da qui OCRA non scrive più al cliente: serve una telefonata o una decisione sul progetto.",
    "",
    `Task: ${f.taskTitle}`,
    `Solleciti: ${f.url}`,
  ].join("\n");
  return { to: to.email, subject, text };
}
