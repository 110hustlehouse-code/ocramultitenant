import { describe, expect, it } from "vitest";
import { formatTranscript } from "@/server/integrations/deepgram";
import { buildPrompt, normalizeOutput, romeToday } from "./extract";

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
  const ctx = { people, projects, defaultProjectId: "p1" };

  it("tiene solo id conosciuti e date valide", () => {
    const out = normalizeOutput(
      {
        minutes: "## Partecipanti\n- Erika",
        tasks: [
          { title: "Montaggio v1", assigneeId: "u2", assigneeMention: "Marco", projectId: "p1", dueDate: "2026-10-02", priority: "ALTA", evidence: "entro venerdì" },
          { title: "Inviare preventivo", assigneeId: "inventato", assigneeMention: "Gigi", projectId: "zzz", dueDate: "venerdì", priority: "MEGA", evidence: null },
          { title: " ", assigneeId: null, projectId: null, dueDate: null, priority: "NORMALE", evidence: null },
        ],
      },
      ctx,
    );
    expect(out.minutes).toContain("Partecipanti");
    expect(out.proposals).toHaveLength(2);
    expect(out.proposals[0]).toMatchObject({ assigneeId: "u2", projectId: "p1", dueDate: "2026-10-02", priority: "ALTA" });
    // id inventati → null / progetto della riunione; data non ISO → null; priorità ignota → NORMALE
    expect(out.proposals[1]).toMatchObject({ assigneeId: null, assigneeMention: "Gigi", projectId: "p1", dueDate: null, priority: "NORMALE" });
  });

  it("risposta malformata: errore", () => {
    expect(() => normalizeOutput({ tasks: [] }, ctx)).toThrow();
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
