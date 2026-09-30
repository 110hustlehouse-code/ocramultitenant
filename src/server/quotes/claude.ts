import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/env";
import type { AppContext } from "@/server/context";
import { buildQuotePrompt, normalizeDraft, QUOTE_DRAFT_SCHEMA, QUOTE_SYSTEM_PROMPT, type CatalogItem, type DraftProposal, type PastQuote } from "./draft";
import { getQuote, listServiceItems, QuoteError, saveDraft } from "./service";

export type DraftWriter = (input: {
  brief: string;
  companyName: string;
  clientName: string;
  catalog: CatalogItem[];
  past: PastQuote[];
  defaultVatRate: number;
}) => Promise<DraftProposal>;

/** Chiama Claude con structured outputs: la risposta è sempre JSON conforme a QUOTE_DRAFT_SCHEMA. */
export const writeDraft: DraftWriter = async (input) => {
  const e = env();
  if (!e.ANTHROPIC_API_KEY) throw new QuoteError("AI non configurata (ANTHROPIC_API_KEY).");
  const client = new Anthropic({ apiKey: e.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 2 });
  const res = await client.messages.create({
    model: e.ANTHROPIC_MODEL,
    max_tokens: 8000,
    system: QUOTE_SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: QUOTE_DRAFT_SCHEMA } },
    messages: [{ role: "user", content: buildQuotePrompt(input) }],
  });
  if (res.stop_reason === "refusal") throw new QuoteError("L'AI ha rifiutato di preparare questo preventivo.");
  if (res.stop_reason === "max_tokens") throw new QuoteError("Brief troppo lungo: la risposta è stata tagliata.");
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new QuoteError("L'AI non ha restituito le voci. Riprova.");
  try {
    return normalizeDraft(JSON.parse(text.text), input.catalog, input.defaultVatRate);
  } catch {
    throw new QuoteError("L'AI ha restituito una proposta illeggibile. Riprova.");
  }
};

/**
 * «Proponi con Claude»: dal brief e dal listino della società le voci della bozza (sostituiscono
 * quelle attuali). Il CEO poi corregge. Restituisce le note per il CEO (non vanno al cliente).
 */
export async function proposeDraft(ctx: AppContext, id: string, brief: string, write: DraftWriter = writeDraft) {
  const quote = await getQuote(ctx, id);
  if (!quote) throw new QuoteError("Preventivo non trovato.");
  if (quote.status !== "BOZZA") throw new QuoteError("Solo le bozze si compongono con Claude.");
  const text = brief.trim();
  if (text.length < 10) throw new QuoteError("Scrivi un brief: cosa chiede il cliente, quando, quanto.");

  const [items, previous] = await Promise.all([
    listServiceItems(ctx, quote.companyId),
    ctx.db.quote.findMany({
      where: { clientId: quote.clientId, companyId: quote.companyId, id: { not: id }, status: { in: ["INVIATO", "ACCETTATO"] } },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
      orderBy: { number: "desc" },
      take: 3,
    }),
  ]);
  if (items.length === 0) throw new QuoteError("Il listino della società è vuoto: aggiungi le voci prima.");

  const proposal = await write({
    brief: text,
    companyName: quote.company.name,
    clientName: quote.client.name,
    catalog: items.map((i) => ({ id: i.id, name: i.name, description: i.description, unit: i.unit, unitPrice: i.unitPrice, unitCost: i.unitCost })),
    past: previous.map((q) => ({
      title: q.title,
      status: q.status,
      lines: q.lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unit: l.unit, unitPrice: l.unitPrice })),
    })),
    defaultVatRate: quote.vatRate,
  });
  if (proposal.lines.length === 0) throw new QuoteError("Claude non ha trovato voci adatte nel listino. Rivedi il brief.");

  await saveDraft(ctx, id, {
    title: proposal.title ?? quote.title,
    clientId: quote.clientId,
    intro: proposal.intro || quote.intro,
    terms: quote.terms,
    validUntil: quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : null,
    vatRate: quote.vatRate,
    lines: proposal.lines,
  });
  await ctx.db.quote.update({ where: { id }, data: { brief: text.slice(0, 8000) } });
  return proposal.notes;
}
