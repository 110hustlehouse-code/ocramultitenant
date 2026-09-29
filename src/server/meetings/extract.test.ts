import { describe, expect, it } from "vitest";
import { formatTranscript } from "@/server/integrations/deepgram";
import { buildPrompt, MINUTES_SCHEMA, normalizeOutput, romeToday, SYSTEM_PROMPT } from "./extract";

const people = [
  { id: "u1", name: "Erika Nardini" },
  { id: "u2", name: "Marco Villa" },
];
const projects = [{ id: "p1", name: "Videoclip Nora", client: "Nora Vale" }];

describe("prompt", () => {
  it("contiene data di oggi, persone e progetti con i loro id", () => {
    const prompt = buildPrompt({
      title: "Riunione di produzione",
      heldAt: new Date("2026-09-29T12:00:00Z"),
      transcript: "Erika: Marco, il montaggio entro venerdì.",
      people,
      projects,
      defaultProjectId: "p1",
      now: new Date("2026-09-29T08:00:00Z"),
    });
    expect(prompt).toContain("(2026-09-29)");
    expect(prompt).toContain("martedì");
    expect(prompt).toContain("- u2: Marco Villa");
    expect(prompt).toContain("- p1: Videoclip Nora (cliente: Nora Vale)");
    expect(prompt).toContain("Progetto della riunione");
  });

  it("tronca trascrizioni enormi", () => {
    const prompt = buildPrompt({
      title: "x", heldAt: new Date(), transcript: "a".repeat(300_000), people, projects, defaultProjectId: null,
    });
    expect(prompt).toContain("trascrizione troncata");
    expect(prompt.length).toBeLessThan(200_000);
  });

  it("oggi è calcolato sul fuso di Roma", () => {
    expect(romeToday(new Date("2026-09-29T22:30:00Z")).iso).toBe("2026-09-30");
  });
});

describe("risposta dell'AI", () => {
  const meta = { heldAt: new Date("2026-09-29T12:00:00Z"), durationSec: null, verbalizer: "OCRA, per Erika Nardini" };
  const ctx = { people, projects, defaultProjectId: "p1", meta };
  const base = {
    meetingType: "Produzione",
    startTime: "10:30",
    estimatedDurationMin: 45,
    participants: ["Erika", "Marco"],
    speaker: "Erika",
    agenda: [
      { title: "Montaggio", estimatedMinutes: 20, summary: "Si discute la versione uno." },
      { title: "Musica", estimatedMinutes: null, summary: "Serve la traccia definitiva." },
    ],
    decisions: ["Consegna della v1 venerdì 2 ottobre"],
    tasks: [] as unknown[],
    nextMeeting: { date: "2026-10-06", time: "09:30", subject: "Revisione v1" },
  };

  it("tiene solo id conosciuti e date valide", () => {
    const out = normalizeOutput(
      {
        ...base,
        tasks: [
          { title: "Montaggio v1", assigneeId: "u2", assigneeMention: "Marco", projectId: "p1", dueDate: "2026-10-02", priority: "ALTA", evidence: "entro venerdì" },
          { title: "Inviare preventivo", assigneeId: "inventato", assigneeMention: "Gigi", projectId: "zzz", dueDate: "venerdì", priority: "MEGA", evidence: null },
          { title: " ", assigneeId: null, projectId: null, dueDate: null, priority: "NORMALE", evidence: null },
        ],
      },
      ctx,
    );
    expect(out.proposals).toHaveLength(2);
    expect(out.proposals[0]).toMatchObject({ assigneeId: "u2", projectId: "p1", dueDate: "2026-10-02", priority: "ALTA" });
    // id inventati → null / progetto della riunione; data non ISO → null; priorità ignota → NORMALE
    expect(out.proposals[1]).toMatchObject({ assigneeId: null, assigneeMention: "Gigi", projectId: "p1", dueDate: null, priority: "NORMALE" });
  });

  it("il verbale segue il modello del team, sezione per sezione", () => {
    const out = normalizeOutput(
      { ...base, tasks: [{ title: "Montaggio v1", assigneeId: "u2", assigneeMention: "Marco", projectId: "p1", dueDate: "2026-10-02", priority: "ALTA", evidence: null }, { title: "Chiamare il fonico", assigneeId: null, assigneeMention: null, projectId: null, dueDate: null, priority: "NORMALE", evidence: null }] },
      ctx,
    );
    expect(out.minutes).toBe(
      [
        "## Riunione",
        "- **Data:** martedì 29 settembre 2026",
        "- **Orario:** 10:30",
        "- **Tipo di riunione:** Produzione",
        "- **Durata:** 45 min (stimata)",
        "- **Partecipanti:** Erika, Marco",
        "- **Oratore:** Erika",
        "- **Verbalizzatore:** OCRA, per Erika Nardini",
        "",
        "## Ordine del giorno",
        "- **1. Montaggio** · 20 min",
        "- **2. Musica**",
        "",
        "## Sintesi della discussione",
        "**1. Montaggio**",
        "Si discute la versione uno.",
        "**2. Musica**",
        "Serve la traccia definitiva.",
        "",
        "## Decisioni prese",
        "- Consegna della v1 venerdì 2 ottobre",
        "",
        "## Azioni assegnate",
        "- **Montaggio v1** — Marco Villa — venerdì 2 ottobre 2026",
        "- **Chiamare il fonico** — da assegnare — senza scadenza",
        "",
        "## Prossimo appuntamento",
        "martedì 6 ottobre 2026, ore 09:30 — Revisione v1",
      ].join("\n"),
    );
  });

  it("niente decisioni né appuntamento: lo dice; la durata misurata vince sulla stima", () => {
    const out = normalizeOutput(
      { ...base, decisions: [" "], nextMeeting: { date: null, time: null, subject: null }, startTime: "boh", meetingType: null },
      { ...ctx, meta: { ...meta, durationSec: 1830 } },
    );
    expect(out.minutes).toContain("- **Durata:** 31 min\n");
    expect(out.minutes).toContain("- **Orario:** —");
    expect(out.minutes).toContain("- **Tipo di riunione:** —");
    expect(out.minutes).toContain("## Decisioni prese\nNessuna decisione formale.");
    expect(out.minutes).toContain("## Azioni assegnate\nNessuna azione assegnata.");
    expect(out.minutes).toContain("## Prossimo appuntamento\nNon fissato.");
  });

  it("risposta malformata: errore", () => {
    expect(() => normalizeOutput({ tasks: [] }, ctx)).toThrow();
    expect(() => normalizeOutput({ ...base, agenda: [] }, ctx)).toThrow();
  });

  it("lo schema chiede tutti i campi del modello e vieta campi extra", () => {
    expect(MINUTES_SCHEMA.required).toEqual(
      expect.arrayContaining(["meetingType", "startTime", "participants", "speaker", "agenda", "decisions", "tasks", "nextMeeting"]),
    );
    expect(MINUTES_SCHEMA.additionalProperties).toBe(false);
    expect(SYSTEM_PROMPT).toContain("formalmente deciso");
  });
});

describe("trascrizione Deepgram", () => {
  it("unisce le frasi della stessa voce e mette il tempo", () => {
    const text = formatTranscript({
      results: {
        utterances: [
          { speaker: 0, start: 1.2, transcript: "Buongiorno a tutti." },
          { speaker: 0, start: 3, transcript: "Iniziamo." },
          { speaker: 1, start: 65, transcript: "Il montaggio lo chiudo venerdì." },
        ],
      },
    });
    expect(text).toBe("[00:01] Voce 1: Buongiorno a tutti. Iniziamo.\n[01:05] Voce 2: Il montaggio lo chiudo venerdì.");
  });

  it("senza voci distinte usa il testo intero", () => {
    expect(formatTranscript({ results: { channels: [{ alternatives: [{ transcript: " ciao " }] }] } })).toBe("ciao");
  });
});
