import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { firstMessage, reminderMessage, type FollowUpMailInput } from "@/lib/followups";
import { coveredWorkdays, isOfficeHours, nextOfficeMorning, workdaysBetween } from "@/lib/workdays";
import type { AppContext } from "@/server/context";
import { prisma } from "@/server/db/client";
import { tenantExtension } from "@/server/db/tenant";
import { sendEmail, type EmailSender } from "@/server/notify/email";
import { canIn } from "@/server/projects/service";
import { appUrl, managersFor } from "@/server/reminders/engine";
import { viewCompanies } from "@/server/registry/service";
import { managerNoticeEmail } from "./templates";

/**
 * Solleciti ai clienti (docs/piani/SOLLECITI.md). Li avvia una persona, mai il sistema:
 * il sistema manda solo i promemoria dopo N giorni lavorativi di silenzio, fino a un tetto,
 * poi avvisa il PM. Nessun blocco dell'account: il cliente non è un collaboratore.
 */

export class FollowUpError extends Error {}

export const DEFAULT_EVERY_WORKDAYS = 3;
export const DEFAULT_MAX_REMINDERS = 2;

const emailSchema = z.email("Email del referente non valida.");

const taskInclude = {
  project: { include: { company: true, client: { include: { companies: { select: { companyId: true } } } } } },
} satisfies Prisma.TaskInclude;

async function loadTask(ctx: AppContext, taskId: string) {
  const task = await ctx.db.task.findFirst({
    where: { id: taskId, project: { companyId: { in: ctx.companies.map((c) => c.id) } } },
    include: taskInclude,
  });
  if (!task) throw new FollowUpError("Task non trovato.");
  return { task, own: task.assigneeId === ctx.user.id };
}

function assertModule(ctx: AppContext) {
  if (!ctx.tenant.modules.includes("SOLLECITI")) throw new FollowUpError("Solleciti non attivi.");
}

export type StartInput = {
  waitingFor: string;
  contactName: string | null;
  contactEmail: string;
  subject: string;
  body: string;
};

/**
 * «In attesa del cliente»: lo avvia chi ha il task o il PM. Il primo messaggio parte subito,
 * con il testo che la persona ha visto e magari corretto. I richiami interni sul task si fermano.
 */
export async function startFollowUp(ctx: AppContext, taskId: string, input: StartInput, send: EmailSender = sendEmail) {
  assertModule(ctx);
  const { task, own } = await loadTask(ctx, taskId);
  if (!mayStart(ctx, task.project.companyId, own)) throw new FollowUpError("Solo chi ha il task o il PM può avviare un sollecito.");
  if (task.status !== "DA_FARE") throw new FollowUpError("Il task è già chiuso.");
  const client = task.project.client;
  if (!client) throw new FollowUpError("Il progetto non ha un cliente: collegalo nella scheda del progetto.");

  const waitingFor = input.waitingFor.trim();
  if (waitingFor.length < 3) throw new FollowUpError("Scrivi cosa aspetti dal cliente.");
  const email = emailSchema.safeParse(input.contactEmail.trim().toLowerCase());
  if (!email.success) throw new FollowUpError(email.error.issues[0]?.message ?? "Email non valida.");
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (subject.length < 3 || body.length < 20) throw new FollowUpError("Il messaggio al cliente è vuoto.");
  const contactName = input.contactName?.trim() || null;

  const active = await ctx.db.clientFollowUp.count({ where: { taskId, status: "ATTIVO" } });
  if (active) throw new FollowUpError("C'è già un sollecito in corso su questo task.");

  // Referente senza email (o senza nome): si completa l'anagrafica, se chi avvia può modificarla.
  const canWriteParty = client.companies.some((c) => canIn(ctx, c.companyId, "registry:write"));
  if (canWriteParty && (!client.email || !client.contactName)) {
    await ctx.db.party.update({
      where: { id: client.id },
      data: { email: client.email ?? email.data, contactName: client.contactName ?? contactName },
    });
  }

  const now = new Date();
  const followUp = await ctx.db.clientFollowUp.create({
    data: {
      tenantId: ctx.tenant.id,
      taskId,
      projectId: task.projectId,
      partyId: client.id,
      contactName,
      contactEmail: email.data,
      waitingFor: waitingFor.slice(0, 500),
      startedById: ctx.user.id,
      startedAt: now,
      everyWorkdays: DEFAULT_EVERY_WORKDAYS,
      maxReminders: DEFAULT_MAX_REMINDERS,
      nextReminderAt: nextOfficeMorning(now, DEFAULT_EVERY_WORKDAYS),
    },
  });
  const res = await send({ to: email.data, subject, text: body, replyTo: ctx.user.email });
  await ctx.db.clientMessage.create({
    data: {
      tenantId: ctx.tenant.id,
      followUpId: followUp.id,
      kind: "PRIMO",
      to: email.data,
      subject: subject.slice(0, 300),
      body: body.slice(0, 10_000),
      messageId: res.messageId ?? null,
      sentById: ctx.user.id,
      delivered: res.delivered,
      error: res.error ?? null,
    },
  });
  return { followUp, delivered: res.delivered };
}

async function loadFollowUp(ctx: AppContext, id: string) {
  const f = await ctx.db.clientFollowUp.findFirst({
    where: { id, project: { companyId: { in: ctx.companies.map((c) => c.id) } } },
    include: { task: { select: { assigneeId: true } }, project: { select: { companyId: true } } },
  });
  if (!f) throw new FollowUpError("Sollecito non trovato.");
  const allowed =
    f.startedById === ctx.user.id ||
    f.task.assigneeId === ctx.user.id ||
    canIn(ctx, f.project.companyId, "followups:manage");
  if (!allowed) throw new FollowUpError("Sollecito non trovato.");
  if (f.status !== "ATTIVO") throw new FollowUpError("Il sollecito è già chiuso.");
  return f;
}

/** «Il cliente ha risposto»: finisce l'attesa, il task torna nei richiami normali. */
export async function resolveFollowUp(ctx: AppContext, id: string, note: string | null) {
  await loadFollowUp(ctx, id);
  await ctx.db.clientFollowUp.update({
    where: { id },
    data: {
      status: "RISOLTO",
      resolvedAt: new Date(),
      resolvedById: ctx.user.id,
      resolutionNote: note?.trim().slice(0, 500) || null,
      nextReminderAt: null,
    },
  });
}

/** Aperto per errore: non conta nei giorni persi. */
export async function cancelFollowUp(ctx: AppContext, id: string) {
  await loadFollowUp(ctx, id);
  await ctx.db.clientFollowUp.update({
    where: { id },
    data: { status: "ANNULLATO", resolvedAt: new Date(), resolvedById: ctx.user.id, nextReminderAt: null },
  });
}

export type FollowUpRunSummary = { tenants: number; reminders: number; toManagers: number; notDelivered: number };

/**
 * Da chiamare ogni ora, con i richiami. Scrive solo in orario d'ufficio e nei giorni lavorativi.
 * Idempotente: ogni sollecito avanza al massimo di un passo per chiamata.
 */
export async function runClientFollowUps(now = new Date(), send: EmailSender = sendEmail): Promise<FollowUpRunSummary> {
  const summary: FollowUpRunSummary = { tenants: 0, reminders: 0, toManagers: 0, notDelivered: 0 };
  if (!isOfficeHours(now)) return summary;
  const tenants = await prisma.tenant.findMany({ where: { modules: { has: "SOLLECITI" } } });

  for (const tenant of tenants) {
    summary.tenants++;
    const db = prisma.$extends(tenantExtension(tenant.id));
    const due = await db.clientFollowUp.findMany({
      where: { status: "ATTIVO", nextReminderAt: { lte: now } },
      include: {
        startedBy: true,
        project: { include: { company: true, manager: true } },
        task: { select: { status: true, title: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    for (const f of due) {
      // Task chiuso nel frattempo (per esempio da un altro percorso): l'attesa è finita.
      if (f.task.status !== "DA_FARE") {
        await db.clientFollowUp.update({
          where: { id: f.id },
          data: { status: "RISOLTO", resolvedAt: now, resolutionNote: "Task chiuso", nextReminderAt: null },
        });
        continue;
      }
      // Progetto in pausa o chiuso: non si scrive al cliente, si riprova il giorno lavorativo dopo.
      if (f.project.status !== "ATTIVO") {
        await db.clientFollowUp.update({ where: { id: f.id }, data: { nextReminderAt: nextOfficeMorning(now, 1) } });
        continue;
      }

      if (f.remindersSent < f.maxReminders) {
        // Firma chi l'ha avviato; se non c'è più, il PM del progetto.
        const signer = f.startedBy.active ? f.startedBy : (f.project.manager?.active ? f.project.manager : f.startedBy);
        const first = f.messages.find((m) => m.kind === "PRIMO");
        const thread = f.messages.map((m) => m.messageId).filter((id): id is string => Boolean(id));
        const mail: FollowUpMailInput = {
          contactName: f.contactName,
          projectName: f.project.name,
          waitingFor: f.waitingFor,
          senderName: signer.name,
          companyName: f.project.company.name,
        };
        const n = f.remindersSent + 1;
        const { subject, body } = reminderMessage(mail, n, first?.subject ?? firstMessage(mail).subject);
        const res = await send({
          to: f.contactEmail,
          subject,
          text: body,
          replyTo: signer.email,
          inReplyTo: thread.at(-1),
          references: thread.length ? thread : undefined,
        });
        await db.clientMessage.create({
          data: {
            tenantId: tenant.id,
            followUpId: f.id,
            kind: "PROMEMORIA",
            to: f.contactEmail,
            subject,
            body,
            messageId: res.messageId ?? null,
            delivered: res.delivered,
            error: res.error ?? null,
          },
        });
        // Dopo l'ultimo promemoria si aspetta ancora un giro, poi passa al PM.
        await db.clientFollowUp.update({
          where: { id: f.id },
          data: { remindersSent: n, nextReminderAt: nextOfficeMorning(now, f.everyWorkdays) },
        });
        summary.reminders++;
        if (!res.delivered) summary.notDelivered++;
        continue;
      }

      // Tetto raggiunto e ancora silenzio: al cliente non si scrive più, lo decide il PM.
      if (!f.managerNotifiedAt) {
        const days = workdaysBetween(f.startedAt, now);
        for (const m of await managersFor(db, f)) {
          const res = await send(
            managerNoticeEmail(m, {
              taskTitle: f.task.title,
              projectName: f.project.name,
              companyName: f.project.company.name,
              contactName: f.contactName,
              contactEmail: f.contactEmail,
              waitingFor: f.waitingFor,
              days,
              reminders: f.remindersSent,
              startedByName: f.startedBy.name,
              url: `${appUrl(tenant.domain)}/solleciti`,
            }),
          );
          if (!res.delivered) summary.notDelivered++;
        }
        summary.toManagers++;
      }
      await db.clientFollowUp.update({ where: { id: f.id }, data: { managerNotifiedAt: f.managerNotifiedAt ?? now, nextReminderAt: null } });
    }
  }
  return summary;
}

/** Vista per PM e CEO: solleciti in corso e giorni persi per progetto, nelle società guardate. */
export async function followUpsBoard(ctx: AppContext, now = new Date()) {
  const companyIds = viewCompanies(ctx)
    .filter((c) => canIn(ctx, c.id, "followups:manage"))
    .map((c) => c.id);
  const [active, history] = await Promise.all([
    ctx.db.clientFollowUp.findMany({
      where: { status: "ATTIVO", project: { companyId: { in: companyIds } } },
      include: {
        task: { select: { id: true, title: true, assignee: { select: { name: true } } } },
        project: { select: { id: true, name: true, companyId: true } },
        party: { select: { id: true, name: true } },
        startedBy: { select: { name: true } },
        messages: { orderBy: { createdAt: "asc" }, select: { id: true, kind: true, subject: true, body: true, createdAt: true, delivered: true } },
      },
      orderBy: { startedAt: "asc" },
    }),
    // Giorni persi: solleciti chiusi negli ultimi 180 giorni + quelli in corso (gli annullati non contano).
    ctx.db.clientFollowUp.findMany({
      where: {
        status: { not: "ANNULLATO" },
        project: { companyId: { in: companyIds } },
        OR: [{ status: "ATTIVO" }, { resolvedAt: { gte: new Date(now.getTime() - 180 * 86_400_000) } }],
      },
      select: { projectId: true, startedAt: true, resolvedAt: true, project: { select: { name: true, companyId: true } } },
    }),
  ]);

  const byProject = new Map<string, { projectId: string; name: string; companyId: string; intervals: Array<{ from: Date; to: Date }> }>();
  for (const h of history) {
    const entry = byProject.get(h.projectId) ?? { projectId: h.projectId, name: h.project.name, companyId: h.project.companyId, intervals: [] };
    entry.intervals.push({ from: h.startedAt, to: h.resolvedAt ?? now });
    byProject.set(h.projectId, entry);
  }
  const lost = [...byProject.values()]
    .map((p) => ({ projectId: p.projectId, name: p.name, companyId: p.companyId, days: coveredWorkdays(p.intervals) }))
    .filter((p) => p.days > 0)
    .sort((a, b) => b.days - a.days);

  return {
    active: active.map((f) => ({
      ...f,
      days: workdaysBetween(f.startedAt, now),
      overCap: f.remindersSent >= f.maxReminders,
    })),
    lost,
  };
}

/** Solleciti in corso per un insieme di task (per mostrarli sulla riga del task). */
export async function activeFollowUpsFor(ctx: AppContext, taskIds: string[], now = new Date()) {
  if (!ctx.tenant.modules.includes("SOLLECITI") || taskIds.length === 0) return new Map<string, ActiveFollowUp>();
  const rows = await ctx.db.clientFollowUp.findMany({
    where: { taskId: { in: taskIds }, status: "ATTIVO" },
    select: { id: true, taskId: true, waitingFor: true, startedAt: true, remindersSent: true, contactName: true, party: { select: { name: true } } },
  });
  return new Map(
    rows.map((r) => [
      r.taskId,
      { id: r.id, waitingFor: r.waitingFor, days: workdaysBetween(r.startedAt, now), remindersSent: r.remindersSent, clientName: r.party?.name ?? r.contactName ?? "il cliente" },
    ]),
  );
}

export type ActiveFollowUp = { id: string; waitingFor: string; days: number; remindersSent: number; clientName: string };

/** Può avviare un sollecito su questo task? (assegnatario o PM, modulo attivo, progetto con cliente) */
export function canStartFollowUp(ctx: AppContext, task: { assigneeId: string | null }, companyId: string, hasClient: boolean): boolean {
  if (!ctx.tenant.modules.includes("SOLLECITI") || !hasClient) return false;
  return mayStart(ctx, companyId, task.assigneeId === ctx.user.id);
}

/** Assegnatario (non esterno) o PM della società. */
function mayStart(ctx: AppContext, companyId: string, own: boolean): boolean {
  if (canIn(ctx, companyId, "projects:write")) return true;
  const role = ctx.access.find((a) => a.company.id === companyId)?.role;
  return own && role !== undefined && role !== "EXTERNAL";
}
