import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { AppContext } from "@/server/context";
import { prisma } from "@/server/db/client";
import { tenantExtension } from "@/server/db/tenant";
import { canIn } from "@/server/projects/service";
import { parseDay } from "@/server/projects/input";
import { hashToken, newToken, type InboundMeeting } from "./inbound";
import { MeetingError } from "./service";

/**
 * Collegamenti con servizi di trascrizione esterni. Li crea chi gestisce le impostazioni
 * della società (CEO); il servizio esterno si autentica con il token, non con una sessione.
 */

function manageable(ctx: AppContext): string[] {
  return ctx.access.filter((a) => canIn(ctx, a.company.id, "settings:manage")).map((a) => a.company.id);
}

/** Mai `tokenHash` qui: è l'unico segreto del modello, non serve a nessuna UI. */
export async function listIntegrations(ctx: AppContext) {
  return ctx.db.meetingIntegration.findMany({
    where: { companyId: { in: manageable(ctx) } },
    select: {
      id: true,
      name: true,
      active: true,
      tokenHint: true,
      lastUsedAt: true,
      company: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      _count: { select: { meetings: true } },
    },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
}

/** Crea il collegamento e restituisce il token in chiaro: è l'unica volta che si vede. */
export async function createIntegration(
  ctx: AppContext,
  input: { name: string; companyId: string; projectId: string | null },
) {
  if (!canIn(ctx, input.companyId, "settings:manage")) throw new MeetingError("Non puoi collegare servizi per questa società.");
  const name = input.name.trim();
  if (name.length < 2) throw new MeetingError("Dai un nome al collegamento (es. «Fireflies Erika»).");
  if (input.projectId) {
    const ok = await ctx.db.project.count({ where: { id: input.projectId, companyId: input.companyId } });
    if (!ok) throw new MeetingError("Progetto non valido per questa società.");
  }
  const { token, hash, hint } = newToken();
  const integration = await ctx.db.meetingIntegration.create({
    data: {
      tenantId: ctx.tenant.id,
      companyId: input.companyId,
      projectId: input.projectId,
      name: name.slice(0, 120),
      tokenHash: hash,
      tokenHint: hint,
      createdById: ctx.user.id,
    },
  });
  return { integration, token };
}

/** Si disattiva, non si cancella: le riunioni già arrivate restano collegate e non si duplicano. */
export async function disableIntegration(ctx: AppContext, id: string) {
  const row = await ctx.db.meetingIntegration.findFirst({ where: { id, companyId: { in: manageable(ctx) } } });
  if (!row) throw new MeetingError("Collegamento non trovato.");
  await ctx.db.meetingIntegration.update({ where: { id }, data: { active: false } });
}

export type InboundIntegration = { id: string; tenantId: string; companyId: string; projectId: string | null };

/**
 * Dal token al collegamento. Usa il client di base perché serve a risolvere il tenant
 * (come l'accesso): il token non dice di quale cliente è finché non lo si trova.
 */
export async function authenticateIntegration(token: string): Promise<InboundIntegration | null> {
  const row = await prisma.meetingIntegration.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { tenant: { select: { modules: true } }, company: { select: { active: true } } },
  });
  if (!row?.active || !row.company.active || !row.tenant.modules.includes("VERBALI")) return null;
  return { id: row.id, tenantId: row.tenantId, companyId: row.companyId, projectId: row.projectId };
}

/**
 * Registra la riunione arrivata dal servizio esterno e la mette in elaborazione.
 * Stesso `externalId` già visto → nessun doppione, nessuna nuova elaborazione.
 */
export async function ingestMeeting(
  integration: InboundIntegration,
  input: InboundMeeting,
): Promise<{ meetingId: string; duplicate: boolean; job: { tenantId: string; meetingId: string } | null }> {
  const db = prisma.$extends(tenantExtension(integration.tenantId));
  const existing = await db.meeting.findFirst({
    where: { integrationId: integration.id, externalId: input.externalId },
    select: { id: true },
  });
  if (existing) return { meetingId: existing.id, duplicate: true, job: null };

  // Progetto: quello del collegamento, altrimenti il codice PO inviato, altrimenti nessuno
  // (in quel caso Claude propone il progetto task per task e il PM conferma).
  let projectId = integration.projectId;
  if (!projectId && input.projectCode) {
    const match = await db.project.findFirst({
      where: { companyId: integration.companyId, code: { equals: input.projectCode, mode: "insensitive" } },
      select: { id: true },
    });
    projectId = match?.id ?? null;
  }

  try {
    const meeting = await db.meeting.create({
      data: {
        tenantId: integration.tenantId,
        companyId: integration.companyId,
        projectId,
        title: input.title,
        heldAt: parseDay(input.day),
        transcript: input.transcript,
        durationSec: input.durationSec,
        source: "WEBHOOK",
        integrationId: integration.id,
        externalId: input.externalId,
        status: "IN_ELABORAZIONE",
      },
    });
    await db.meetingIntegration.update({ where: { id: integration.id }, data: { lastUsedAt: new Date() } });
    return { meetingId: meeting.id, duplicate: false, job: { tenantId: integration.tenantId, meetingId: meeting.id } };
  } catch (e) {
    // Due invii quasi simultanei dello stesso id: vince il primo.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.meeting.findFirstOrThrow({
        where: { integrationId: integration.id, externalId: input.externalId },
        select: { id: true },
      });
      return { meetingId: again.id, duplicate: true, job: null };
    }
    throw e;
  }
}
