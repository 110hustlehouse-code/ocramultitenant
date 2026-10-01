import "server-only";
import { z } from "zod";
import { hashPassword } from "@/server/auth/password";
import type { CollaboratorAccessInput } from "@/server/collaborators/input";
import type { AppContext } from "@/server/context";
import type { PartyInput } from "@/server/registry/input";
import { canIn } from "@/server/projects/service";
import { assertWritable, findDuplicate, getParty, PartyConflictError, RegistryError, writeFields } from "@/server/registry/service";

export class CollaboratorError extends Error {}

function companiesOf(party: { companies: { companyId: string }[] }): string[] {
  return party.companies.map((c) => c.companyId);
}

export type CollaboratorProject = {
  id: string;
  name: string;
  companyName: string;
  status: string;
  /** null = non autorizzato a vedere l'importo (serve finance:read sulla società del progetto) */
  totalPaid: number | null;
  paymentsCount: number;
  asTeamMember: boolean;
};

/**
 * Progetti collegati: non è una relazione salvata, si deriva da chi è stato pagato
 * (ProjectCost.partyId, per chi ha o non ha accesso all'app) e da dove lavora come membro
 * (se ha un account collegato).
 */
export async function collaboratorProjects(ctx: AppContext, partyId: string): Promise<CollaboratorProject[]> {
  const party = await getParty(ctx, partyId);
  if (!party) throw new CollaboratorError("Collaboratore non trovato.");

  const [costRows, memberRows] = await Promise.all([
    ctx.db.projectCost.groupBy({ by: ["projectId"], where: { partyId }, _sum: { amount: true }, _count: true }),
    party.linkedUserId
      ? ctx.db.project.findMany({ where: { members: { some: { userId: party.linkedUserId } } }, select: { id: true } })
      : Promise.resolve([] as { id: string }[]),
  ]);

  const projectIds = [...new Set([...costRows.map((r) => r.projectId), ...memberRows.map((r) => r.id)])];
  if (projectIds.length === 0) return [];

  const projects = await ctx.db.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, name: true, status: true, companyId: true, company: { select: { name: true } } },
  });
  const costByProject = new Map(costRows.map((r) => [r.projectId, r]));
  const memberIds = new Set(memberRows.map((m) => m.id));

  return projects
    .map((p) => {
      const cost = costByProject.get(p.id);
      const canSeeAmount = canIn(ctx, p.companyId, "finance:read");
      return {
        id: p.id,
        name: p.name,
        companyName: p.company.name,
        status: p.status,
        totalPaid: cost && canSeeAmount ? (cost._sum.amount ?? 0) : null,
        paymentsCount: cost?._count ?? 0,
        asTeamMember: memberIds.has(p.id),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const evaluationInputSchema = z.object({
  companyId: z.string().min(1),
  projectId: z.string().min(1).nullable(),
  rating: z.number().int().min(1, "Voto da 1 a 5").max(5, "Voto da 1 a 5"),
  notes: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .transform((v) => (v ? v : null)),
});
export type EvaluationInput = z.infer<typeof evaluationInputSchema>;

/** Scheda di valutazione: visibile solo a chi vede i dati economici della società. */
export async function listEvaluations(ctx: AppContext, partyId: string) {
  const party = await getParty(ctx, partyId);
  if (!party) throw new CollaboratorError("Collaboratore non trovato.");
  if (!companiesOf(party).some((id) => canIn(ctx, id, "finance:read"))) return [];
  return ctx.db.collaboratorEvaluation.findMany({
    where: { partyId },
    include: { evaluatedBy: { select: { name: true } }, project: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function addEvaluation(ctx: AppContext, partyId: string, input: EvaluationInput) {
  const party = await getParty(ctx, partyId);
  if (!party) throw new CollaboratorError("Collaboratore non trovato.");
  if (!companiesOf(party).includes(input.companyId)) throw new CollaboratorError("Società non valida per questo collaboratore.");
  if (!canIn(ctx, input.companyId, "finance:write")) throw new CollaboratorError("Non puoi valutare collaboratori per questa società.");
  if (input.projectId) {
    const ok = await ctx.db.project.count({ where: { id: input.projectId, companyId: input.companyId } });
    if (!ok) throw new CollaboratorError("Progetto non valido per questa società.");
  }
  return ctx.db.collaboratorEvaluation.create({
    data: {
      tenantId: ctx.tenant.id,
      partyId,
      companyId: input.companyId,
      projectId: input.projectId,
      rating: input.rating,
      notes: input.notes,
      evaluatedById: ctx.user.id,
    },
  });
}

/** Collega (o scollega) l'utente con accesso all'app che corrisponde a questo collaboratore. */
export async function setLinkedUser(ctx: AppContext, partyId: string, userId: string | null): Promise<void> {
  const party = await getParty(ctx, partyId);
  if (!party) throw new CollaboratorError("Collaboratore non trovato.");
  if (!companiesOf(party).some((id) => canIn(ctx, id, "collaborators:write"))) {
    throw new CollaboratorError("Non puoi modificare questo collaboratore.");
  }
  if (userId) {
    const ok = await ctx.db.user.count({ where: { id: userId } });
    if (!ok) throw new CollaboratorError("Utente non trovato.");
  }
  await ctx.db.party.update({ where: { id: partyId }, data: { linkedUserId: userId } });
}

/**
 * Crea un collaboratore CON un vero accesso dedicato, in un'unica operazione atomica:
 * Party + User + Membership (una per società scelta) + collegamento Party → User. Mai un
 * collegamento a un utente che esiste già — qui l'account nasce con il collaboratore.
 * `access.password` è già validata (lunghezza minima) dallo schema del form; qui si fa solo hash.
 */
export async function createCollaboratorWithAccess(
  ctx: AppContext,
  party: PartyInput,
  access: CollaboratorAccessInput,
): Promise<{ partyId: string; userId: string }> {
  assertWritable(ctx, party.companyIds);
  if (access.companyIds.some((id) => !canIn(ctx, id, "settings:manage"))) {
    throw new CollaboratorError("Non puoi creare un accesso per questa società.");
  }
  if (access.role === "EXTERNAL" && !access.accessExpiresAt) {
    throw new CollaboratorError("Il ruolo Esterno richiede una data di scadenza dell'accesso.");
  }

  const dup = await findDuplicate(ctx, party);
  if (dup) {
    const missingKinds = party.kinds.filter((k) => !dup.kinds.includes(k));
    if (missingKinds.length === 0) throw new RegistryError(`Esiste già: ${dup.name}. Aprila e aggiungi la società da lì.`);
    throw new PartyConflictError(dup.id, dup.name, missingKinds);
  }
  const emailTaken = await ctx.db.user.findUnique({ where: { tenantId_email: { tenantId: ctx.tenant.id, email: access.email } } });
  if (emailTaken) throw new CollaboratorError(`Email già in uso da ${emailTaken.name}.`);

  const passwordHash = await hashPassword(access.password);

  return ctx.db.$transaction(async (tx) => {
    const createdParty = await tx.party.create({ data: { kinds: party.kinds, ...writeFields(ctx, party), tenantId: ctx.tenant.id } });
    await tx.partyCompany.createMany({
      data: party.companyIds.map((companyId) => ({ tenantId: ctx.tenant.id, partyId: createdParty.id, companyId })),
    });
    const user = await tx.user.create({
      data: {
        tenantId: ctx.tenant.id,
        email: access.email,
        name: party.name,
        passwordHash,
        mustChangePassword: true,
        accessExpiresAt: access.role === "EXTERNAL" ? access.accessExpiresAt : null,
      },
    });
    await tx.membership.createMany({
      data: access.companyIds.map((companyId) => ({ tenantId: ctx.tenant.id, userId: user.id, companyId, role: access.role })),
    });
    await tx.party.update({ where: { id: createdParty.id }, data: { linkedUserId: user.id } });
    return { partyId: createdParty.id, userId: user.id };
  });
}
