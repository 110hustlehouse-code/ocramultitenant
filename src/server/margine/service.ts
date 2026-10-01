import "server-only";
import { z } from "zod";
import { parseEuro } from "@/lib/quotes";
import type { AppContext } from "@/server/context";
import { canIn } from "@/server/projects/service";
import { parseDay } from "@/server/projects/input";
import { viewCompanies } from "@/server/registry/service";
import { summarizeMargin, type BudgetLineCalc } from "./calc";

export class MarginError extends Error {}

/**
 * Etichette delle righe di budget (senza importi): per collegare un task a una riga quando lo si
 * modifica, anche se chi lo fa (il PM) non ha `finance:read` e non vede prezzi o costi.
 * `companyId` si verifica contro quello vero del progetto: non ci si fida del parametro,
 * altrimenti un `projectId` di un'altra società con un `companyId` dove si ha `projects:write`
 * farebbe trapelare le righe di budget della società sbagliata.
 */
export async function budgetLineLabels(ctx: AppContext, projectId: string, companyId: string) {
  const project = await ctx.db.project.findFirst({ where: { id: projectId }, select: { companyId: true } });
  if (!project || project.companyId !== companyId || !canIn(ctx, project.companyId, "projects:write")) return [];
  return ctx.db.projectBudgetLine.findMany({
    where: { projectId },
    select: { id: true, description: true },
    orderBy: { sortOrder: "asc" },
  });
}

/** Società guardate in cui l'utente vede i dati economici (solo CEO, decisione presa con i Preventivi). */
export function marginCompanies(ctx: AppContext) {
  return viewCompanies(ctx).filter((c) => canIn(ctx, c.id, "finance:read"));
}

function toLineCalc(l: { revenue: number; plannedCost: number | null; tasks: { status: string }[] }): BudgetLineCalc {
  return { revenue: l.revenue, plannedCost: l.plannedCost, tasksDone: l.tasks.filter((t) => t.status === "FATTO").length, tasksTotal: l.tasks.length };
}

const budgetLineInclude = { tasks: { select: { status: true } } } as const;

/** Margine di un singolo progetto: righe di budget, costi reali registrati, avanzamento dai task. */
export async function projectMargin(ctx: AppContext, projectId: string) {
  const project = await ctx.db.project.findFirst({
    where: { id: projectId },
    include: {
      budgetLines: { include: budgetLineInclude, orderBy: { sortOrder: "asc" } },
      costs: {
        orderBy: { incurredAt: "desc" },
        include: { createdBy: { select: { name: true } }, budgetLine: { select: { description: true } } },
      },
    },
  });
  if (!project) throw new MarginError("Progetto non trovato.");
  if (!canIn(ctx, project.companyId, "finance:read")) throw new MarginError("Non puoi vedere i dati economici di questa società.");

  const lineCalcs = project.budgetLines.map(toLineCalc);
  const manualCost = project.costs.reduce((s, c) => s + c.amount, 0);
  const summary = summarizeMargin(lineCalcs, manualCost, project.status);

  const lines = project.budgetLines.map((l, i) => ({
    id: l.id,
    description: l.description,
    revenue: l.revenue,
    plannedCost: l.plannedCost,
    tasksDone: lineCalcs[i]!.tasksDone,
    tasksTotal: lineCalcs[i]!.tasksTotal,
  }));

  return { project: { id: project.id, name: project.name, companyId: project.companyId, status: project.status }, ...summary, lines, costs: project.costs };
}

/** Cruscotto: un progetto per riga, più il totale per società e per gruppo (se consolidabile). */
export async function marginBoard(ctx: AppContext) {
  const companies = marginCompanies(ctx);
  const companyIds = companies.map((c) => c.id);
  const projects = await ctx.db.project.findMany({
    where: { companyId: { in: companyIds }, status: { in: ["ATTIVO", "IN_PAUSA"] } },
    include: { budgetLines: { include: budgetLineInclude }, costs: { select: { amount: true } } },
    orderBy: { createdAt: "desc" },
  });

  const rows = projects.map((p) => {
    const manualCost = p.costs.reduce((s, c) => s + c.amount, 0);
    const summary = summarizeMargin(p.budgetLines.map(toLineCalc), manualCost, p.status);
    return { id: p.id, name: p.name, companyId: p.companyId, status: p.status, ...summary };
  });

  const byCompany = new Map<string, { companyId: string; name: string; revenue: number; plannedCost: number; actualCost: number; marginPlanned: number; marginActual: number }>();
  for (const r of rows) {
    const name = companies.find((c) => c.id === r.companyId)?.name ?? "";
    const acc = byCompany.get(r.companyId) ?? { companyId: r.companyId, name, revenue: 0, plannedCost: 0, actualCost: 0, marginPlanned: 0, marginActual: 0 };
    acc.revenue += r.revenue;
    acc.plannedCost += r.plannedCost;
    acc.actualCost += r.actualCost;
    acc.marginPlanned += r.marginPlanned;
    acc.marginActual += r.marginActual;
    byCompany.set(r.companyId, acc);
  }
  const companyRows = [...byCompany.values()];
  const group =
    ctx.canConsolidate && companyRows.length > 1
      ? companyRows.reduce(
          (t, c) => ({
            revenue: t.revenue + c.revenue,
            plannedCost: t.plannedCost + c.plannedCost,
            actualCost: t.actualCost + c.actualCost,
            marginPlanned: t.marginPlanned + c.marginPlanned,
            marginActual: t.marginActual + c.marginActual,
          }),
          { revenue: 0, plannedCost: 0, actualCost: 0, marginPlanned: 0, marginActual: 0 },
        )
      : null;

  return { rows, byCompany: companyRows, group };
}

export const costInputSchema = z.object({
  description: z.string().trim().min(2, "Scrivi di cosa si tratta").max(300),
  amount: z.number().int().positive("Importo non valido"),
  incurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
  budgetLineId: z.string().min(1).nullable(),
});
export type CostInput = z.infer<typeof costInputSchema>;

export function costFromFormData(fd: FormData) {
  return {
    description: String(fd.get("description") ?? ""),
    amount: parseEuro(String(fd.get("amount") ?? "")) ?? -1,
    incurredAt: String(fd.get("incurredAt") ?? ""),
    budgetLineId: fd.get("budgetLineId")?.toString() || null,
  };
}

/** Registra un costo reale (fattura, esterno, acquisto): lo fa una persona, mai un automatismo. */
export async function addCost(ctx: AppContext, projectId: string, input: CostInput) {
  const project = await ctx.db.project.findFirst({ where: { id: projectId }, select: { companyId: true } });
  if (!project) throw new MarginError("Progetto non trovato.");
  if (!canIn(ctx, project.companyId, "finance:write")) throw new MarginError("Non puoi registrare costi per questa società.");
  const parsed = costInputSchema.safeParse(input);
  if (!parsed.success) throw new MarginError(parsed.error.issues[0]?.message ?? "Dati non validi.");
  if (parsed.data.budgetLineId) {
    const ok = await ctx.db.projectBudgetLine.count({ where: { id: parsed.data.budgetLineId, projectId } });
    if (!ok) throw new MarginError("Riga di budget non valida per questo progetto.");
  }
  return ctx.db.projectCost.create({
    data: {
      tenantId: ctx.tenant.id,
      projectId,
      budgetLineId: parsed.data.budgetLineId,
      description: parsed.data.description,
      amount: parsed.data.amount,
      incurredAt: parseDay(parsed.data.incurredAt),
      createdById: ctx.user.id,
    },
  });
}

export async function deleteCost(ctx: AppContext, id: string) {
  const cost = await ctx.db.projectCost.findFirst({ where: { id }, include: { project: { select: { companyId: true } } } });
  if (!cost) throw new MarginError("Costo non trovato.");
  if (!canIn(ctx, cost.project.companyId, "finance:write")) throw new MarginError("Non puoi eliminare questo costo.");
  await ctx.db.projectCost.delete({ where: { id } });
}
