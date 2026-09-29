import { z } from "zod";

/**
 * Dal testo della riunione al verbale e ai task proposti. Parte pura (prompt, validazione)
 * separata dalla chiamata a Claude, così si testa senza rete.
 */

export type Person = { id: string; name: string };
export type ProjectRef = { id: string; name: string; client: string | null };

export const MAX_TRANSCRIPT_CHARS = 180_000;

export const proposalSchema = z.object({
  key: z.string(),
  title: z.string().trim().min(2).max(300),
  assigneeId: z.string().nullable(),
  /** Come è stato nominato nella riunione, utile se l'AI non ha trovato la persona */
  assigneeMention: z.string().max(120).nullable(),
  projectId: z.string().nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  priority: z.enum(["NORMALE", "ALTA", "URGENTE"]),
  /** Frase della trascrizione da cui nasce il task: il PM vede perché è stato proposto */
  evidence: z.string().max(400).nullable(),
});
export type Proposal = z.infer<typeof proposalSchema>;
export const proposalsSchema = z.array(proposalSchema);

/** Schema dello strumento che Claude deve «chiamare»: garantisce una risposta strutturata. */
export const MINUTES_TOOL = {
  name: "registra_verbale",
  description: "Registra il verbale della riunione e i task concreti emersi.",
  input_schema: {
    type: "object" as const,
    properties: {
      minutes: {
        type: "string",
        description:
          "Verbale in italiano, in markdown, con le sezioni: ## Partecipanti, ## Punti discussi, ## Decisioni, ## Prossimi passi. Sintetico e fedele: niente che non sia stato detto.",
      },
      tasks: {
        type: "array",
        description: "Solo azioni concrete assegnabili emerse dalla riunione. Nessun task inventato.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Cosa va fatto, all'infinito, breve (es. «Inviare preventivo service luci»)." },
            assigneeId: { type: ["string", "null"], description: "id della persona dall'elenco, se chiaramente indicata; altrimenti null." },
            assigneeMention: { type: ["string", "null"], description: "Nome con cui la persona è stata chiamata nella riunione." },
            projectId: { type: ["string", "null"], description: "id del progetto dall'elenco a cui si riferisce il task; null se non chiaro." },
            dueDate: { type: ["string", "null"], description: "Scadenza AAAA-MM-GG se detta (anche relativa: «venerdì», «entro fine mese»); altrimenti null." },
            priority: { type: "string", enum: ["NORMALE", "ALTA", "URGENTE"] },
            evidence: { type: ["string", "null"], description: "Breve citazione della trascrizione da cui nasce il task." },
          },
          required: ["title", "assigneeId", "assigneeMention", "projectId", "dueDate", "priority", "evidence"],
        },
      },
    },
    required: ["minutes", "tasks"],
  },
};

const rawOutputSchema = z.object({
  minutes: z.string().min(1),
  tasks: z
    .array(
      z.object({
        title: z.string(),
        assigneeId: z.string().nullable().optional(),
        assigneeMention: z.string().nullable().optional(),
        projectId: z.string().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        priority: z.string().optional(),
        evidence: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

export function romeToday(now: Date = new Date()): { iso: string; label: string } {
  return {
    iso: now.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }),
    label: now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" }),
  };
}

export const SYSTEM_PROMPT = `Sei l'assistente di un'agenzia italiana che lavora a progetto (eventi, video, comunicazione).
Ricevi la trascrizione di una riunione e scrivi un verbale fedele, poi elenchi i task concreti.
Regole:
- Scrivi in italiano, tono professionale e asciutto.
- Non inventare: se un nome, una data o un progetto non sono chiari, lascia null.
- Un task è un'azione con un responsabile possibile; opinioni e discussioni non sono task.
- Le voci della trascrizione («Voce 1», «Voce 2») non sono nomi: identifica le persone da come si chiamano tra loro.
- Usa solo gli id presenti negli elenchi forniti.`;

export function buildPrompt(input: {
  title: string;
  heldAt: Date;
  transcript: string;
  people: Person[];
  projects: ProjectRef[];
  defaultProjectId: string | null;
  now?: Date;
}): string {
  const today = romeToday(input.now);
  const transcript =
    input.transcript.length > MAX_TRANSCRIPT_CHARS
      ? `${input.transcript.slice(0, MAX_TRANSCRIPT_CHARS)}\n[… trascrizione troncata]`
      : input.transcript;
  const people = input.people.map((p) => `- ${p.id}: ${p.name}`).join("\n") || "- (nessuno)";
  const projects =
    input.projects.map((p) => `- ${p.id}: ${p.name}${p.client ? ` (cliente: ${p.client})` : ""}`).join("\n") ||
    "- (nessuno)";
  return [
    `Riunione: ${input.title}`,
    `Data della riunione: ${input.heldAt.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}`,
    `Oggi è ${today.label} (${today.iso}): risolvi le scadenze relative rispetto a oggi.`,
    input.defaultProjectId ? `Progetto della riunione (usalo se il task non indica altro): ${input.defaultProjectId}` : "",
    `\nPersone del team (id: nome):\n${people}`,
    `\nProgetti aperti (id: nome):\n${projects}`,
    `\nTrascrizione:\n"""\n${transcript}\n"""`,
    `\nChiama lo strumento registra_verbale.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Valida la risposta di Claude e la rende sicura: id sconosciuti → null,
 * date impossibili → null, priorità sconosciute → NORMALE.
 */
export function normalizeOutput(
  raw: unknown,
  ctx: { people: Person[]; projects: ProjectRef[]; defaultProjectId: string | null },
): { minutes: string; proposals: Proposal[] } {
  const parsed = rawOutputSchema.parse(raw);
  const people = new Set(ctx.people.map((p) => p.id));
  const projects = new Set(ctx.projects.map((p) => p.id));
  const validDay = (d: string | null | undefined) =>
    d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) ? d : null;

  const proposals = parsed.tasks
    .filter((t) => t.title.trim().length >= 2)
    .slice(0, 50)
    .map((t, i) =>
      proposalSchema.parse({
        key: `p${i}`,
        title: t.title.trim().slice(0, 300),
        assigneeId: t.assigneeId && people.has(t.assigneeId) ? t.assigneeId : null,
        assigneeMention: t.assigneeMention?.trim().slice(0, 120) || null,
        projectId: t.projectId && projects.has(t.projectId) ? t.projectId : ctx.defaultProjectId,
        dueDate: validDay(t.dueDate),
        priority: t.priority === "ALTA" || t.priority === "URGENTE" ? t.priority : "NORMALE",
        evidence: t.evidence?.trim().slice(0, 400) || null,
      }),
    );
  return { minutes: parsed.minutes.trim(), proposals };
}
