import "server-only";
import type { Role } from "@/generated/prisma/enums";
import type { AppContext } from "@/server/context";
import { canIn } from "@/server/projects/service";

export class UserError extends Error {}

/** Società dove il viewer gestisce gli utenti (CEO lì). */
export function manageableCompanies(ctx: AppContext) {
  return ctx.access.filter((a) => canIn(ctx, a.company.id, "settings:manage")).map((a) => a.company);
}

function manageableCompanyIds(ctx: AppContext): string[] {
  return manageableCompanies(ctx).map((c) => c.id);
}

/** Membership delle società in scope, raggruppabili per società in UI. */
export async function listMembers(ctx: AppContext) {
  return ctx.db.membership.findMany({
    where: { companyId: { in: manageableCompanyIds(ctx) } },
    include: { user: true, company: { select: { id: true, name: true, sortOrder: true } } },
    orderBy: [{ company: { sortOrder: "asc" } }, { user: { name: "asc" } }],
  });
}

export type MemberInput = {
  email: string;
  name: string | null;
  role: Role;
  companyId: string;
  accessExpiresAt: Date | null;
};

/**
 * Invita o aggiorna un membro: upsert di User per email (nel tenant), poi upsert della
 * Membership per la società scelta. `accessExpiresAt` è globale sull'utente (vale in ogni
 * società): si aggiorna solo quando il ruolo appena assegnato è Esterno, si azzera solo
 * quando non gli resta più nessuna società da Esterno (altrimenti romperebbe l'accesso lì).
 */
export async function upsertMember(ctx: AppContext, input: MemberInput): Promise<void> {
  if (!canIn(ctx, input.companyId, "settings:manage")) throw new UserError("Non puoi gestire gli utenti di questa società.");
  if (input.role === "EXTERNAL" && !input.accessExpiresAt) {
    throw new UserError("Il ruolo Esterno richiede una data di scadenza dell'accesso.");
  }

  const existing = await ctx.db.user.findUnique({
    where: { tenantId_email: { tenantId: ctx.tenant.id, email: input.email } },
  });
  if (!existing && !input.name) throw new UserError("Il nome è obbligatorio per un nuovo utente.");

  const user = existing
    ? await ctx.db.user.update({ where: { id: existing.id }, data: { name: input.name ?? existing.name, active: true } })
    : await ctx.db.user.create({ data: { tenantId: ctx.tenant.id, email: input.email, name: input.name! } });

  await ctx.db.membership.upsert({
    where: { userId_companyId: { userId: user.id, companyId: input.companyId } },
    update: { role: input.role },
    create: { tenantId: ctx.tenant.id, userId: user.id, companyId: input.companyId, role: input.role },
  });

  if (input.role === "EXTERNAL") {
    await ctx.db.user.update({ where: { id: user.id }, data: { accessExpiresAt: input.accessExpiresAt } });
  } else {
    const stillExternal = await ctx.db.membership.count({ where: { userId: user.id, role: "EXTERNAL" } });
    if (stillExternal === 0) await ctx.db.user.update({ where: { id: user.id }, data: { accessExpiresAt: null } });
  }
}

/**
 * Revoca l'accesso a una società: cancella solo la Membership, lo storico (task, verbali…)
 * resta collegato all'utente. Non si può revocare la propria unica appartenenza: ci si
 * chiuderebbe fuori da soli.
 */
export async function revokeMember(ctx: AppContext, membershipId: string): Promise<void> {
  const membership = await ctx.db.membership.findFirst({ where: { id: membershipId } });
  if (!membership) throw new UserError("Appartenenza non trovata.");
  if (!canIn(ctx, membership.companyId, "settings:manage")) throw new UserError("Non puoi gestire gli utenti di questa società.");

  if (membership.userId === ctx.user.id) {
    const remaining = await ctx.db.membership.count({ where: { userId: ctx.user.id, id: { not: membershipId } } });
    if (remaining === 0) throw new UserError("Non puoi revocare il tuo unico accesso.");
  }

  await ctx.db.membership.delete({ where: { id: membershipId } });
}
