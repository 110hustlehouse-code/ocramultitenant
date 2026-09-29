import { describe, expect, it } from "vitest";
import { buildQuotePrompt, normalizeDraft, QUOTE_DRAFT_SCHEMA, QUOTE_SYSTEM_PROMPT, type CatalogItem } from "./draft";

const catalog: CatalogItem[] = [
  { id: "s1", name: "Service audio e luci", description: null, unit: "giorno", unitPrice: 240_000, unitCost: 170_000 },
  { id: "s2", name: "Riprese video", description: "Due operatori", unit: "giorno", unitPrice: 150_000, unitCost: null },
];

describe("proposta di Claude per il preventivo", () => {
  it("il prompt contiene listino con id e prezzi, storico del cliente e brief", () => {
    const prompt = buildQuotePrompt({
      brief: "Serata di apertura, 2 giorni",
      companyName: "Aurora Produzioni",
      clientName: "Fondazione Teatro Nuovo",
      catalog,
      past: [{ title: "Stagione 2025", status: "ACCETTATO", lines: [{ description: "Service", quantity: 2, unit: "giorno", unitPrice: 230_000 }] }],
    });
    expect(prompt).toContain("- s1: Service audio e luci · giorno · € 2.400,00");
    expect(prompt).toContain("Stagione 2025 (accettato)");
    expect(prompt).toContain("Serata di apertura, 2 giorni");
    expect(QUOTE_SYSTEM_PROMPT).toContain("Non cambiare i prezzi");
    expect(QUOTE_DRAFT_SCHEMA.additionalProperties).toBe(false);
  });

  it("prezzi e costi dal listino, mai dall'AI; id sconosciuti diventano voci fuori listino a zero", () => {
    const out = normalizeDraft(
      {
        title: "Serata di apertura",
        intro: "Vi proponiamo…",
        lines: [
          { serviceItemId: "s1", description: "Service audio e luci per la serata", quantity: 2, unit: "ore", unitPrice: 1 },
          { serviceItemId: "inventato", description: "Catering", quantity: 80, unit: "coperti" },
          { serviceItemId: "s2", description: "Riprese", quantity: 0, unit: "giorno" },
          { serviceItemId: null, description: " ", quantity: 1, unit: "x" },
        ],
        notes: ["Mancano le date"],
      },
      catalog,
    );
    expect(out.lines).toEqual([
      { serviceItemId: "s1", description: "Service audio e luci per la serata", quantity: 2, unit: "giorno", unitPrice: 240_000, plannedCost: 340_000 },
      { serviceItemId: null, description: "Catering", quantity: 80, unit: "coperti", unitPrice: 0, plannedCost: null },
      { serviceItemId: "s2", description: "Riprese", quantity: 1, unit: "giorno", unitPrice: 150_000, plannedCost: null },
    ]);
    expect(out.notes).toEqual(["Mancano le date", "Una voce è fuori listino: il prezzo è da inserire."]);
    expect(out.title).toBe("Serata di apertura");
  });

  it("risposta malformata: errore", () => {
    expect(() => normalizeDraft({ lines: "no" }, catalog)).toThrow();
  });
});
