/**
 * Regole dei richiami (decisione del 16 settembre, email al posto di WhatsApp dal 23).
 * Funzioni pure: l'orario è un parametro, così si testano tutti i casi.
 *
 *  livello 1 · mattina (dalle 8): primo promemoria automatico al collaboratore
 *  livello 2 · pomeriggio (dalle 15) o giorno dopo: secondo promemoria automatico
 *  livello 3 · giorno dopo il secondo, se il task è scaduto: passa al PM
 *  livello 4 · il PM lo passa al CEO (manuale)
 * Il blocco dell'account non è mai automatico. «Non posso» ferma gli automatici.
 */

export const MORNING_HOUR = 8;
export const AFTERNOON_HOUR = 15;

export type ReminderTask = {
  status: "DA_FARE" | "FATTO";
  assigneeId: string | null;
  dueDate: Date | null;
  escalation: number;
  lastReminderAt: Date | null;
  blockerNote: string | null;
  projectStatus: "ATTIVO" | "IN_PAUSA" | "CHIUSO" | "ANNULLATO";
};

export type Step = { level: 1 | 2 | 3 } | null;

/** Data (AAAA-MM-GG) e ora a Roma. */
export function romeClock(now: Date): { day: string; hour: number } {
  const day = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const hour = Number(now.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Rome" }));
  return { day, hour: hour === 24 ? 0 : hour };
}

const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const romeDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

export function nextStep(task: ReminderTask, now: Date): Step {
  if (task.status !== "DA_FARE" || !task.assigneeId || !task.dueDate) return null;
  if (task.blockerNote) return null;
  if (task.projectStatus !== "ATTIVO") return null;
  if (task.escalation >= 3) return null;

  const { day: today, hour } = romeClock(now);
  const due = dayOf(task.dueDate);
  if (due > today) return null;

  const lastDay = task.lastReminderAt ? romeDay(task.lastReminderAt) : null;

  if (task.escalation === 0) return hour >= MORNING_HOUR ? { level: 1 } : null;
  if (task.escalation === 1) {
    if (lastDay === today) return hour >= AFTERNOON_HOUR ? { level: 2 } : null;
    return hour >= MORNING_HOUR ? { level: 2 } : null;
  }
  // escalation 2: al PM il giorno dopo, e solo se ormai scaduto
  if (lastDay !== today && due < today && hour >= MORNING_HOUR) return { level: 3 };
  return null;
}

/** Puntualità: quota di task chiusi entro la scadenza (null se non ci sono dati). */
export function onTimeRate(done: Array<{ dueDate: Date | null; completedAt: Date | null }>): number | null {
  const measurable = done.filter((t) => t.dueDate && t.completedAt);
  if (measurable.length === 0) return null;
  const onTime = measurable.filter((t) => romeDay(t.completedAt!) <= dayOf(t.dueDate!)).length;
  return Math.round((onTime / measurable.length) * 100);
}
