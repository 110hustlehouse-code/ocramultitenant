import { z } from "zod";
import { formatAmount } from "@/lib/quotes";
import type { LineInput } from "./service";

/**
 * Dal brief del CEO alle voci del preventivo. Parte pura (schema, prompt, normalizzazione),
 * separata dalla chiamata a Claude così si testa senza rete.
 * Regola: i prezzi delle voci di listino li decide il listino, non l'AI; le voci fuori listino
 * restano a zero e le compila il CEO. I totali li calcola il server.
 */

export type CatalogItem = { id: string; name: string; description: string | null; unit: string; unitPrice: number; unitCost: number | null };
export type PastQuote = { title: string; status: string; lines: Array<{ description: string; quantity: number; unit: string; unitPrice: number }> };

const nullableString = (description: string) => ({ type: ["string", "null"], description });

export const QUOTE_DRAFT_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    title: nullableString("Titolo breve del preventivo: diventerà il nome del progetto. null per lasciare quello attuale."),
    intro: {
      type: "string",
      description: "Testo introduttivo per il cliente, 2-4 frasi, in prima persona plurale dell'agenzia, professionale e concreto.",
    },
    lines: {
      type: "array",
      description: "Voci del preventivo, nell'ordine in cui presentarle al cliente.",
      items: {
        type: "object",
        properties: {
          serviceItemId: nullableString("id della voce di listino usata; null solo se nessuna voce del listino corrisponde."),
          description: { type: "string", description: "Descrizione per il cliente: la voce di listino adattata al progetto (es. date, luogo, quantità)." },
          quantity: { type: "number", description: "Quantità nell'unità della voce (giorni, ore, pezzi; 1 per forfait)." },
          unit: { type: "string", description: "Unità: quella della voce di listino, oppure una breve per le voci fuori listino." },
        },
        required: ["serviceItemId", "description", "quantity", "unit"],
        additionalProperties: false,
      },
    },
    notes: {
      type: "array",
      items: { type: "string" },
      description: "Per il CEO (non vanno al cliente): dubbi, informazioni mancanti, voci fuori listino da prezzare.",
    },
  },
  required: ["title", "intro", "lines", "notes"],
};

export const QUOTE_SYSTEM_PROMPT = `Sei l'assistente commerciale di un'agenzia italiana che lavora a progetto (eventi, video, comunicazione).
Dal brief del CEO componi le voci di un preventivo usando il listino della società.
Regole:
- Usa le voci del listino: scegli quelle pertinenti e adatta la descrizione al progetto. Non cambiare i prezzi: li decide il listino.
- Metti una voce fuori listino (serviceItemId null) solo se il brief chiede qualcosa che il listino non copre; segnalala nelle note.
- Non inventare sconti, extra o servizi che il brief non chiede. Se mancano informazioni (date, quantità), scegli un valore prudente e scrivilo nelle note.
- Quantità coerenti con l'unità (giorni, ore, pezzi); 1 per le voci a forfait.
- Scrivi in italiano, tono professionale e asciutto. Usa solo gli id del listino fornito.`;

const euro = formatAmount;

export function buildQuotePrompt(input: { brief: string; companyName: string; clientName: string; catalog: CatalogItem[]; past: PastQuote[] }): string {
  const catalog =
    input.catalog.map((c) => `- ${c.id}: ${c.name} · ${c.unit} · € ${euro(c.unitPrice)}${c.description ? ` — ${c.description}` : ""}`).join("\n") ||
    "- (listino vuoto)";
  const past = input.past.length
    ? input.past
        .map((q) => `• ${q.title} (${q.status.toLowerCase()}): ${q.lines.map((l) => `${l.description} ×${l.quantity} ${l.unit} € ${euro(l.unitPrice)}`).join("; ")}`)
        .join("\n")
    : "(nessuno)";
  return [
    `Società: ${input.companyName}`,
    `Cliente: ${input.clientName}`,
    `\nListino (id: nome · unità · prezzo):\n${catalog}`,
    `\nPreventivi precedenti per questo cliente:\n${past}`,
    `\nBrief del CEO:\n"""\n${input.brief.slice(0, 8000)}\n"""`,
  ].join("\n");
}

const rawSchema = z.object({
  title: z.string().nullish(),
  intro: z.string().default(""),
  lines: z
    .array(
      z.object({
        serviceItemId: z.string().nullish(),
        description: z.string().default(""),
        quantity: z.number().nullish(),
        unit: z.string().nullish(),
      }),
    )
    .default([]),
  notes: z.array(z.string()).default([]),
});

export type DraftProposal = { title: string | null; intro: string; lines: LineInput[]; notes: string[] };

/**
 * Rende sicura la proposta: id sconosciuti → voce fuori listino a zero; prezzi e costi dal listino.
 * Sconto sempre assente e aliquota sempre quella predefinita del preventivo: l'AI non inventa né sconti né aliquote fuori standard.
 */
export function normalizeDraft(raw: unknown, catalog: CatalogItem[], defaultVatRate: number): DraftProposal {
  const parsed = rawSchema.parse(raw);
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const notes = parsed.notes.map((n) => n.trim()).filter(Boolean).slice(0, 10);
  const lines: LineInput[] = [];
  for (const l of parsed.lines.slice(0, 40)) {
    const description = l.description.trim().slice(0, 600);
    if (description.length < 2) continue;
    const quantity = l.quantity && l.quantity > 0 ? Math.round(l.quantity * 100) / 100 : 1;
    const item = l.serviceItemId ? byId.get(l.serviceItemId) : undefined;
    if (item) {
      lines.push({
        serviceItemId: item.id,
        description,
        quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        discountPercent: null,
        vatRate: defaultVatRate,
        plannedCost: item.unitCost === null ? null : Math.round(quantity * item.unitCost),
      });
    } else {
      lines.push({
        serviceItemId: null,
        description,
        quantity,
        unit: l.unit?.trim().slice(0, 30) || "forfait",
        unitPrice: 0,
        discountPercent: null,
        vatRate: defaultVatRate,
        plannedCost: null,
      });
    }
  }
  const offList = lines.filter((l) => l.serviceItemId === null).length;
  if (offList) notes.push(`${offList === 1 ? "Una voce è" : `${offList} voci sono`} fuori listino: il prezzo è da inserire.`);
  return { title: parsed.title?.trim().slice(0, 200) || null, intro: parsed.intro.trim().slice(0, 4000), lines, notes };
}
