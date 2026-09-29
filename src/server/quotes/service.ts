import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { clientCode, DEFAULT_VAT_RATE, lineTotal, projectCode, quoteTotals } from "@/lib/quotes";
import type { AppContext } from "@/server/context";
import { canIn } from "@/server/projects/service";
import { parseDay } from "@/server/projects/input";
import { viewCompanies } from "@/server/registry/service";

/**
 * Preventivi (docs/piani/PREVENTIVI.md). Solo chi ha `quotes:write` nella società (oggi il CEO).
 * Accettato → nasce il progetto, con le voci come budget; contratto e acconto sono spunte che non bloccano.
 */

export class QuoteError extends Error {}

function assertWrite(ctx: AppContext, companyId: string) {
  if (!canIn(ctx, companyId, "quotes:write")) throw new QuoteError("Preventivo non trovato.");
}

/** Società della vista corrente in cui l'utente gestisce i preventivi. */
export function quoteCompanies(ctx: AppContext) {
  return viewCompanies(ctx).filter((c) => canIn(ctx, c.id, "quotes:write"));
}

const romeToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

// ─── Listino ────────────────────────────────────────────────────────────────

export async function listServiceItems(ctx: AppContext, companyId: string, opts: { all?: boolean } = {}) {
  assertWrite(ctx, companyId);
  return ctx.db.serviceItem.findMany({
    where: { companyId, ...(opts.all ? {} : { active: true }) },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export const serviceItemSchema = z.object({
  name: z.string().trim().min(2, "Nome della voce obbligatorio").max(160),
  description: z.string().trim().max(1000).nullable(),
  poCode: z
    .string()
    .trim()
    .min(2, "Sigla per il codice PO obbligatoria (es. EVENTI)")
    .max(20)
    .transform((v) => v.toUpperCase().replace(/[^A-Z0-9-]/g, "")),
  unit: z.string().trim().min(1).max(30),
  unitPrice: z.number().int().min(0, "Prezzo non valido"),
  unitCost: z.number().int().min(0).nullable(),
});
export type ServiceItemInput = z.infer<typeof serviceItemSchema>;

export async function saveServiceItem(ctx: AppContext, companyId: string, id: string | null, input: ServiceItemInput) {
  assertWrite(ctx, companyId);
  const parsed = serviceItemSchema.safeParse(input);
  if (!parsed.success) throw new QuoteError(parsed.error.issues[0]?.message ?? "Dati non validi.");
  const d = parsed.data;
  if (id) {
    const row = await ctx.db.serviceItem.findFirst({ where: { id, companyId } });
    if (!row) throw new QuoteError("Voce non trovata.");
    return ctx.db.serviceItem.update({ where: { id }, data: d });
  }
  const last = await ctx.db.serviceItem.aggregate({ where: { companyId }, _max: { sortOrder: true } });
  return ctx.db.serviceItem.create({ data: { ...d, companyId, tenantId: ctx.tenant.id, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
}

/** Le voci non si cancellano (i preventivi vecchi le citano): si disattivano. */
export async function setServiceItemActive(ctx: AppContext, id: string, active: boolean) {
  const row = await ctx.db.serviceItem.findFirst({ where: { id } });
  if (!row) throw new QuoteError("Voce non trovata.");
  assertWrite(ctx, row.companyId);
  await ctx.db.serviceItem.update({ where: { id }, data: { active } });
}

// ─── Preventivi ─────────────────────────────────────────────────────────────

export async function listQuotes(ctx: AppContext) {
  const companies = quoteCompanies(ctx).map((c) => c.id);
  return ctx.db.quote.findMany({
    where: { companyId: { in: companies } },
    include: { client: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } },
    orderBy: [{ number: "desc" }],
    take: 300,
  });
}

const quoteInclude = {
  company: true,
  client: true,
  lines: { orderBy: { sortOrder: "asc" }, include: { serviceItem: { select: { id: true, poCode: true, name: true } } } },
  project: { select: { id: true, name: true, code: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.QuoteInclude;

export type QuoteWithLines = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;

export async function getQuote(ctx: AppContext, id: string): Promise<QuoteWithLines | null> {
  const quote = await ctx.db.quote.findFirst({ where: { id }, include: quoteInclude });
  if (!quote || !canIn(ctx, quote.companyId, "quotes:write")) return null;
  return quote;
}

async function writableQuote(ctx: AppContext, id: string) {
  const quote = await getQuote(ctx, id);
  if (!quote) throw new QuoteError("Preventivo non trovato.");
  return quote;
}

async function assertClient(ctx: AppContext, companyId: string, clientId: string) {
  const ok = await ctx.db.party.count({ where: { id: clientId, kind: "CLIENTE", companies: { some: { companyId } } } });
  if (!ok) throw new QuoteError("Scegli un cliente della società.");
}

/** Nuova bozza: prende il prossimo numero della società (progressivo, continuo negli anni). */
export async function createQuote(ctx: AppContext, input: { companyId: string; clientId: string; title: string }) {
  assertWrite(ctx, input.companyId);
  const title = input.title.trim();
  if (title.length < 2) throw new QuoteError("Dai un titolo al preventivo: diventerà il nome del progetto.");
  await assertClient(ctx, input.companyId, input.clientId);
  const today = romeToday();
  return ctx.db.$transaction(async (tx) => {
    const company = await tx.company.update({
      where: { id: input.companyId },
      data: { nextQuoteNumber: { increment: 1 } },
      select: { nextQuoteNumber: true, quoteTerms: true, quoteValidityDays: true },
    });
    const issueDate = parseDay(today);
    return tx.quote.create({
      data: {
        tenantId: ctx.tenant.id,
        companyId: input.companyId,
        clientId: input.clientId,
        number: company.nextQuoteNumber - 1,
        title: title.slice(0, 200),
        issueDate,
        validUntil: new Date(issueDate.getTime() + company.quoteValidityDays * 86_400_000),
        terms: company.quoteTerms,
        vatRate: DEFAULT_VAT_RATE,
        createdById: ctx.user.id,
      },
    });
  });
}

export const lineInputSchema = z.object({
  serviceItemId: z.string().min(1).nullable(),
  description: z.string().trim().min(2, "Descrizione della voce obbligatoria").max(600),
  quantity: z.number().positive("Quantità non valida").max(100_000),
  unit: z.string().trim().min(1).max(30),
  unitPrice: z.number().int().min(0, "Prezzo non valido"),
  plannedCost: z.number().int().min(0).nullable(),
});
export type LineInput = z.infer<typeof lineInputSchema>;

export const draftInputSchema = z.object({
  title: z.string().trim().min(2, "Titolo obbligatorio").max(200),
  clientId: z.string().min(1),
  intro: z.string().trim().max(4000).nullable(),
  terms: z.string().trim().max(4000).nullable(),
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  vatRate: z.number().int().min(0).max(30),
  lines: z.array(lineInputSchema).max(100),
});
export type DraftInput = z.infer<typeof draftInputSchema>;

/** Salva la bozza: voci sostituite in blocco, totali ricalcolati qui (mai presi dal browser o dall'AI). */
export async function saveDraft(ctx: AppContext, id: string, input: DraftInput) {
  const quote = await writableQuote(ctx, id);
  if (quote.status !== "BOZZA") throw new QuoteError("Un preventivo inviato non si modifica: duplicalo in una nuova bozza.");
  const parsed = draftInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path[0] === "lines" && typeof issue.path[1] === "number" ? `Voce ${issue.path[1] + 1}: ` : "";
    throw new QuoteError(`${where}${issue?.message ?? "Dati non validi"}`);
  }
  const d = parsed.data;
  if (d.clientId !== quote.clientId) await assertClient(ctx, quote.companyId, d.clientId);
  const itemIds = [...new Set(d.lines.map((l) => l.serviceItemId).filter((v): v is string => Boolean(v)))];
  const known = await ctx.db.serviceItem.count({ where: { id: { in: itemIds }, companyId: quote.companyId } });
  if (known !== itemIds.length) throw new QuoteError("Una voce di listino non è di questa società.");

  const totals = quoteTotals(d.lines, d.vatRate);
  await ctx.db.$transaction(async (tx) => {
    await tx.quoteLine.deleteMany({ where: { quoteId: id } });
    if (d.lines.length) {
      await tx.quoteLine.createMany({
        data: d.lines.map((l, i) => ({
          tenantId: ctx.tenant.id,
          quoteId: id,
          serviceItemId: l.serviceItemId,
          description: l.description,
          quantity: new Prisma.Decimal(l.quantity.toFixed(2)),
          unit: l.unit,
          unitPrice: l.unitPrice,
          total: lineTotal(l.quantity, l.unitPrice),
          plannedCost: l.plannedCost,
          sortOrder: i,
        })),
      });
    }
    await tx.quote.update({
      where: { id },
      data: {
        title: d.title,
        clientId: d.clientId,
        intro: d.intro || null,
        terms: d.terms || null,
        validUntil: d.validUntil ? parseDay(d.validUntil) : null,
        vatRate: d.vatRate,
        ...totals,
      },
    });
  });
}

/** PDF scaricato e mandato a mano: si segna come inviato. Da qui non si modifica più. */
export async function markSent(ctx: AppContext, id: string) {
  const quote = await writableQuote(ctx, id);
  if (quote.status !== "BOZZA") throw new QuoteError("Il preventivo è già stato inviato.");
  if (quote.lines.length === 0 || quote.total <= 0) throw new QuoteError("Aggiungi almeno una voce con un importo.");
  await ctx.db.quote.update({ where: { id }, data: { status: "INVIATO", sentAt: new Date() } });
}

export async function rejectQuote(ctx: AppContext, id: string, note: string | null) {
  const quote = await writableQuote(ctx, id);
  if (quote.status !== "INVIATO") throw new QuoteError("Si può rifiutare solo un preventivo inviato.");
  await ctx.db.quote.update({
    where: { id },
    data: { status: "RIFIUTATO", rejectedAt: new Date(), rejectionNote: note?.trim().slice(0, 1000) || null },
  });
}

/** Sigla del servizio per il codice PO: quella della voce di listino che pesa di più. */
function mainService(quote: QuoteWithLines) {
  const withItem = quote.lines.filter((l) => l.serviceItem);
  const main = [...withItem].sort((a, b) => b.total - a.total)[0];
  return { poCode: main?.serviceItem?.poCode ?? "PROGETTO", name: main?.serviceItem?.name ?? null };
}

/** Codice PO proposto, libero nel tenant (se c'è già si aggiunge -2, -3…). */
export async function suggestProjectCode(ctx: AppContext, quote: QuoteWithLines, now = new Date()) {
  const base = projectCode({
    companyPrefix: quote.company.poPrefix ?? quote.company.slug,
    serviceCode: mainService(quote).poCode,
    date: now,
    clientCode: quote.client.shortCode || clientCode(quote.client.name),
  });
  for (let n = 1; n < 50; n++) {
    const code = n === 1 ? base : `${base}-${n}`;
    if (!(await ctx.db.project.count({ where: { code } }))) return code;
  }
  throw new QuoteError("Codice PO non disponibile: scrivilo a mano.");
}

/** Chi può guidare il progetto: PM e CEO attivi della società. */
export async function managerCandidates(ctx: AppContext, companyId: string) {
  const rows = await ctx.db.membership.findMany({
    where: { companyId, role: { in: ["PROJECT_MANAGER", "CEO"] }, user: { active: true } },
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ role: "desc" }, { user: { name: "asc" } }],
  });
  return rows.map((r) => ({ id: r.user.id, name: r.user.name, role: r.role }));
}

/**
 * Il cliente ha detto sì: in una sola transazione nasce il progetto (nome, cliente, servizio, codice PO,
 * PM nel team) e le voci diventano il suo budget. Il PM lo vede subito, senza importi.
 */
export async function acceptQuote(ctx: AppContext, id: string, input: { managerId: string | null; code: string | null }, now = new Date()) {
  const quote = await writableQuote(ctx, id);
  if (quote.status !== "INVIATO") throw new QuoteError("Si può accettare solo un preventivo inviato.");
  if (input.managerId) {
    const ok = (await managerCandidates(ctx, quote.companyId)).some((m) => m.id === input.managerId);
    if (!ok) throw new QuoteError("Il responsabile deve essere un PM o il CEO della società.");
  }
  const code = input.code?.trim().toUpperCase().replace(/\s+/g, "") || (await suggestProjectCode(ctx, quote, now));
  if (await ctx.db.project.count({ where: { code } })) throw new QuoteError(`Il codice ${code} è già usato da un altro progetto.`);

  const project = await ctx.db.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        tenantId: ctx.tenant.id,
        companyId: quote.companyId,
        clientId: quote.clientId,
        name: quote.title,
        code,
        service: mainService(quote).name,
        managerId: input.managerId,
        startDate: parseDay(now.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" })),
        notes: `Nato dal preventivo n. ${quote.number}.`,
      },
    });
    if (input.managerId) {
      await tx.projectMember.create({ data: { tenantId: ctx.tenant.id, projectId: created.id, userId: input.managerId } });
    }
    if (quote.lines.length) {
      await tx.projectBudgetLine.createMany({
        data: quote.lines.map((l) => ({
          tenantId: ctx.tenant.id,
          projectId: created.id,
          quoteLineId: l.id,
          serviceItemId: l.serviceItemId,
          description: l.description,
          revenue: l.total,
          plannedCost: l.plannedCost,
          sortOrder: l.sortOrder,
        })),
      });
    }
    await tx.quote.update({ where: { id }, data: { status: "ACCETTATO", acceptedAt: now, projectId: created.id } });
    return created;
  });
  return project;
}

/** Contratto firmato, acconto ricevuto: informativi, si segnano e si tolgono. */
export async function setMilestone(ctx: AppContext, id: string, which: "contract" | "deposit", done: boolean) {
  const quote = await writableQuote(ctx, id);
  if (quote.status !== "ACCETTATO") throw new QuoteError("Prima il preventivo deve essere accettato.");
  const at = done ? new Date() : null;
  await ctx.db.quote.update({ where: { id }, data: which === "contract" ? { contractSignedAt: at } : { depositReceivedAt: at } });
}

/** Nuova bozza con le stesse voci e un nuovo numero (per rivedere un preventivo già inviato). */
export async function duplicateQuote(ctx: AppContext, id: string) {
  const quote = await writableQuote(ctx, id);
  const copy = await createQuote(ctx, { companyId: quote.companyId, clientId: quote.clientId, title: quote.title });
  await saveDraft(ctx, copy.id, {
    title: quote.title,
    clientId: quote.clientId,
    intro: quote.intro,
    terms: quote.terms,
    validUntil: copy.validUntil ? copy.validUntil.toISOString().slice(0, 10) : null,
    vatRate: quote.vatRate,
    lines: quote.lines.map((l) => ({
      serviceItemId: l.serviceItemId,
      description: l.description,
      quantity: Number(l.quantity),
      unit: l.unit,
      unitPrice: l.unitPrice,
      plannedCost: l.plannedCost,
    })),
  });
  await ctx.db.quote.update({ where: { id: copy.id }, data: { brief: quote.brief } });
  return copy;
}

/** Solo le bozze si eliminano (il numero resta consumato: non si riusa). */
export async function deleteDraft(ctx: AppContext, id: string) {
  const quote = await writableQuote(ctx, id);
  if (quote.status !== "BOZZA") throw new QuoteError("Solo le bozze si eliminano.");
  await ctx.db.quote.delete({ where: { id } });
}

/** Budget del progetto (solo chi vede i dati economici). */
export async function projectBudget(ctx: AppContext, projectId: string, companyId: string) {
  if (!canIn(ctx, companyId, "finance:read")) return null;
  const [lines, quote] = await Promise.all([
    ctx.db.projectBudgetLine.findMany({ where: { projectId }, orderBy: { sortOrder: "asc" } }),
    ctx.db.quote.findFirst({ where: { projectId }, select: { id: true, number: true, contractSignedAt: true, depositReceivedAt: true } }),
  ]);
  const revenue = lines.reduce((s, l) => s + l.revenue, 0);
  const plannedCost = lines.reduce((s, l) => s + (l.plannedCost ?? 0), 0);
  return { lines, quote, revenue, plannedCost, hasCosts: lines.some((l) => l.plannedCost !== null) };
}
