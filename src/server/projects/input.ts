import { z } from "zod";

/** Data da <input type="date"> (AAAA-MM-GG) → mezzogiorno UTC, così il giorno non slitta col fuso. */
export function parseDay(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

export function formatDayInput(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

const optionalText = (max: number) =>
  z.preprocess((v) => {
    const s = v === undefined || v === null ? "" : String(v).trim();
    return s === "" ? null : s;
  }, z.string().max(max, `Massimo ${max} caratteri`).nullable());

const optionalId = z.preprocess((v) => (v ? String(v) : null), z.string().min(1).nullable());

const optionalDay = z.preprocess(
  (v) => (v ? String(v) : null),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida")
    .transform(parseDay)
    .nullable(),
);

export const projectInputSchema = z
  .object({
    name: z.string().trim().min(2, "Nome del progetto obbligatorio").max(160),
    companyId: z.string().min(1, "Scegli la società"),
    clientId: optionalId,
    code: optionalText(80).transform((v) => (v ? v.toUpperCase().replace(/\s+/g, "") : v)),
    service: optionalText(120),
    managerId: optionalId,
    startDate: optionalDay,
    dueDate: optionalDay,
    notes: optionalText(4000),
    memberIds: z.array(z.string().min(1)).default([]),
  })
  .refine((d) => !d.startDate || !d.dueDate || d.dueDate >= d.startDate, {
    path: ["dueDate"],
    message: "La consegna non può essere prima dell'inizio",
  });

export type ProjectInput = z.infer<typeof projectInputSchema>;

export const taskInputSchema = z.object({
  title: z.string().trim().min(2, "Scrivi cosa va fatto").max(300),
  description: optionalText(4000),
  assigneeId: optionalId,
  dueDate: optionalDay,
  priority: z.enum(["NORMALE", "ALTA", "URGENTE"]).default("NORMALE"),
});

export type TaskInput = z.infer<typeof taskInputSchema>;

/** Chiudere un task richiede una prova: un link o una nota di almeno qualche parola (principio 1). */
export const proofSchema = z
  .string()
  .trim()
  .min(3, "Aggiungi la prova: il link al file consegnato o una nota breve")
  .max(2000);

export function projectFromFormData(fd: FormData) {
  const get = (k: string) => fd.get(k)?.toString();
  return {
    name: get("name") ?? "",
    companyId: get("companyId") ?? "",
    clientId: get("clientId"),
    code: get("code"),
    service: get("service"),
    managerId: get("managerId"),
    startDate: get("startDate"),
    dueDate: get("dueDate"),
    notes: get("notes"),
    memberIds: fd.getAll("memberIds").map(String),
  };
}

export function taskFromFormData(fd: FormData) {
  const get = (k: string) => fd.get(k)?.toString();
  return {
    title: get("title") ?? "",
    description: get("description"),
    assigneeId: get("assigneeId"),
    dueDate: get("dueDate"),
    priority: get("priority") || undefined,
  };
}

/** Scaduto: da fare e con scadenza prima di oggi (fuso di Roma). */
export function isOverdue(task: { status: string; dueDate: Date | null }, now: Date = new Date()): boolean {
  if (task.status !== "DA_FARE" || !task.dueDate) return false;
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  return task.dueDate.toISOString().slice(0, 10) < today;
}

export const STATUS_LABELS = {
  ATTIVO: "Attivo",
  IN_PAUSA: "In pausa",
  CHIUSO: "Chiuso",
  ANNULLATO: "Annullato",
} as const;

export const PRIORITY_LABELS = { NORMALE: "Normale", ALTA: "Alta", URGENTE: "Urgente" } as const;
