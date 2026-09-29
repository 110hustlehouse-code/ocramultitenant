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

/**
 * Schema della risposta (structured outputs): Claude restituisce i campi del modello di verbale
 * usato da Fulcro e St'Art («Sc. Verbali Riunioni»); il testo lo compone renderMinutes, sempre
 * uguale. Niente strumento forzato: i modelli recenti non accettano `tool_choice` di tipo «tool».
 */
const nullableString = (description: string) => ({ type: ["string", "null"], description });

export const MINUTES_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    meetingType: nullableString("Tipo di riunione in poche parole (es. «Produzione», «Call con il cliente», «Kick-off»)."),
    startTime: nullableString(
      "Ora del giorno di inizio HH:MM, solo se detta o indicata («Orario di inizio»). Mai dai minutaggi [mm:ss]. Altrimenti null.",
    ),
    estimatedDurationMin: {
      type: ["integer", "null"],
      description: "Durata in minuti, se si ricava dagli orari della trascrizione; altrimenti null.",
    },
    participants: { type: "array", items: { type: "string" }, description: "Nomi dei partecipanti, come si chiamano tra loro." },
    speaker: nullableString("Oratore: chi ha guidato la riunione; null se non chiaro."),
    agenda: {
      type: "array",
      description: "Ordine del giorno: i punti trattati, nell'ordine in cui sono stati affrontati.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Argomento del punto, breve." },
          estimatedMinutes: { type: ["integer", "null"], description: "Durata stimata della discussione del punto, in minuti." },
          summary: { type: "string", description: "Sintesi fedele della discussione su questo punto, 1-4 frasi." },
        },
        required: ["title", "estimatedMinutes", "summary"],
        additionalProperties: false,
      },
    },
    decisions: {
      type: "array",
      items: { type: "string" },
      description:
        "SOLO ciò che è stato formalmente deciso (approvato, scelto, confermato). Non riassumere la discussione. Può essere vuoto.",
    },
    tasks: {
      type: "array",
      description: "Azioni assegnate: solo azioni concrete emerse dalla riunione, con responsabile e scadenza se dette. Nessun task inventato.",
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
        additionalProperties: false,
      },
    },
    nextMeeting: {
      type: "object",
      description: "Prossimo appuntamento, solo se fissato nella riunione; altrimenti tutti i campi null.",
      properties: {
        date: nullableString("AAAA-MM-GG"),
        time: nullableString("HH:MM"),
        subject: nullableString("Oggetto del prossimo incontro."),
      },
      required: ["date", "time", "subject"],
      additionalProperties: false,
    },
  },
  required: ["meetingType", "startTime", "estimatedDurationMin", "participants", "speaker", "agenda", "decisions", "tasks", "nextMeeting"],
};

const text = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => v?.trim().slice(0, max) || null);
const minutesNumber = z
  .number()
  .nullish()
  .transform((v) => (v && v > 0 && v < 24 * 60 ? Math.round(v) : null));

const rawOutputSchema = z.object({
  meetingType: text(120),
  startTime: text(5),
  estimatedDurationMin: minutesNumber,
  participants: z.array(z.string()).default([]),
  speaker: text(120),
  agenda: z
    .array(z.object({ title: z.string(), estimatedMinutes: minutesNumber, summary: z.string().default("") }))
    .min(1),
  decisions: z.array(z.string()).default([]),
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
  nextMeeting: z
    .object({ date: text(10), time: text(5), subject: text(200) })
    .nullish(),
});

export function romeToday(now: Date = new Date()): { iso: string; label: string } {
  return {
    iso: now.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }),
    label: now.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" }),
  };
}

export const SYSTEM_PROMPT = `Sei l'assistente di un'agenzia italiana che lavora a progetto (eventi, video, comunicazione).
Ricevi la trascrizione di una riunione e compili il modello di verbale dell'agenzia: dati della riunione,
ordine del giorno con la sintesi di ogni punto, decisioni prese, azioni assegnate, prossimo appuntamento.
Regole:
- Scrivi in italiano, tono professionale e asciutto.
- Non inventare: se un nome, una data o un progetto non sono chiari, lascia null.
- Un task è un'azione con un responsabile possibile; opinioni e discussioni non sono task.
- Le voci della trascrizione («Voce 1», «Voce 2») non sono nomi: identifica le persone da come si chiamano tra loro.
- I tempi tra parentesi ([03:10]) sono minuti dall'inizio della registrazione, non ore del giorno:
  servono per stimare le durate, mai per l'orario della riunione.
- «Decisioni prese» contiene solo ciò che è stato formalmente deciso: approvato, scelto, confermato.
  Proposte, opinioni e cose solo discusse vanno nella sintesi del punto, non tra le decisioni.
  Se non è stato deciso nulla, lascia l'elenco vuoto.
  Il prossimo appuntamento va solo nel suo campo, non tra le decisioni.
- Ogni azione assegnata diventa un task: solo azioni concrete, con il responsabile se è stato indicato.
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
    `\nRispondi con il verbale e i task nel formato JSON richiesto.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export type MinutesMeta = {
  heldAt: Date;
  /** Durata misurata (Deepgram o servizio esterno): vince sulla stima dell'AI */
  durationSec: number | null;
  /** Chi ha scritto il verbale: OCRA, per conto di chi l'ha avviato */
  verbalizer: string;
};

type RawOutput = z.infer<typeof rawOutputSchema>;

const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
};
const time = (v: string | null) => (v && /^\d{1,2}[:.]\d{2}$/.test(v) ? v.replace(".", ":") : null);
const clean = (v: string) => v.replace(/\s+/g, " ").trim();

/** Il verbale nel formato del modello «Sc. Verbali Riunioni», sempre con le stesse sezioni. */
export function renderMinutes(out: RawOutput, proposals: Proposal[], people: Person[], meta: MinutesMeta): string {
  const names = new Map(people.map((p) => [p.id, p.name]));
  const durationMin = meta.durationSec ? Math.max(1, Math.round(meta.durationSec / 60)) : out.estimatedDurationMin;
  const lines: string[] = [
    "## Riunione",
    `- **Data:** ${dayLabel(meta.heldAt.toISOString().slice(0, 10))}`,
    `- **Orario:** ${time(out.startTime) ?? "—"}`,
    `- **Tipo di riunione:** ${out.meetingType ?? "—"}`,
    `- **Durata:** ${durationMin ? `${durationMin} min${meta.durationSec ? "" : " (stimata)"}` : "—"}`,
    `- **Partecipanti:** ${out.participants.map(clean).filter(Boolean).join(", ") || "—"}`,
    `- **Oratore:** ${out.speaker ?? "—"}`,
    `- **Verbalizzatore:** ${meta.verbalizer}`,
    "",
    "## Ordine del giorno",
    ...out.agenda.map((a, i) => `- **${i + 1}. ${clean(a.title)}**${a.estimatedMinutes ? ` · ${a.estimatedMinutes} min` : ""}`),
    "",
    "## Sintesi della discussione",
    ...out.agenda.flatMap((a, i) => [`**${i + 1}. ${clean(a.title)}**`, clean(a.summary) || "—"]),
    "",
    "## Decisioni prese",
    ...out.decisions.map(clean).filter(Boolean).map((d) => `- ${d}`),
  ];
  if (!out.decisions.some((d) => d.trim())) lines.push("Nessuna decisione formale.");
  lines.push("", "## Azioni assegnate");
  if (proposals.length === 0) lines.push("Nessuna azione assegnata.");
  for (const p of proposals) {
    const who = (p.assigneeId && names.get(p.assigneeId)) || p.assigneeMention || "da assegnare";
    const due = p.dueDate ? dayLabel(p.dueDate) : "senza scadenza";
    lines.push(`- **${p.title}** — ${who} — ${due}`);
  }
  const next = out.nextMeeting;
  lines.push("", "## Prossimo appuntamento");
  if (next && (next.date || next.time || next.subject)) {
    const when = [next.date && /^\d{4}-\d{2}-\d{2}$/.test(next.date) ? dayLabel(next.date) : null, time(next.time)].filter(Boolean).join(", ore ");
    lines.push(`${when || "Data da definire"}${next.subject ? ` — ${next.subject}` : ""}`);
  } else {
    lines.push("Non fissato.");
  }
  return lines.join("\n");
}

/**
 * Valida la risposta di Claude e la rende sicura: id sconosciuti → null,
 * date impossibili → null, priorità sconosciute → NORMALE. Poi compone il verbale.
 */
export function normalizeOutput(
  raw: unknown,
  ctx: { people: Person[]; projects: ProjectRef[]; defaultProjectId: string | null; meta: MinutesMeta },
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
  return { minutes: renderMinutes(parsed, proposals, ctx.people, ctx.meta), proposals };
}
