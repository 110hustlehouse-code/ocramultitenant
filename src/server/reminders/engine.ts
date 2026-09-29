import "server-only";
import type { Prisma, User } from "@/generated/prisma/client";
import { env } from "@/env";
import { formatDay } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import { tenantExtension } from "@/server/db/tenant";
import { sendEmail, type EmailSender } from "@/server/notify/email";
import { isOverdue } from "@/server/projects/input";
import { nextStep, romeClock } from "./policy";
import { reminderEmail, toManagerEmail, type TaskMail } from "./templates";

type TenantDb = ReturnType<typeof dbFor>;
const dbFor = (tenantId: string) => prisma.$extends(tenantExtension(tenantId));

export function appUrl(domain: string | null): string {
  return domain ? `https://${domain}` : env().APP_URL.replace(/\/$/, "");
}

const taskInclude = {
  assignee: true,
  project: { include: { company: true, manager: true } },
} satisfies Prisma.TaskInclude;
export type TaskWithContext = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function taskMail(t: TaskWithContext, base: string, now = new Date()): TaskMail {
  return {
    taskTitle: t.title,
    projectName: t.project.name,
    companyName: t.project.company.name,
    dueLabel: formatDay(t.dueDate, now) ?? "",
    overdue: isOverdue(t, now),
    url: `${base}/progetti/${t.projectId}`,
  };
}

/**
 * Chi gestisce i task scaduti di un progetto: il PM del progetto se ha ancora il ruolo,
 * altrimenti i PM della società, altrimenti i CEO.
 */
export async function managersFor(db: TenantDb, t: TaskWithContext): Promise<User[]> {
  const members = await db.membership.findMany({
    where: { companyId: t.project.companyId, role: { in: ["PROJECT_MANAGER", "CEO"] }, user: { active: true } },
    include: { user: true },
  });
  const pm = members.find((m) => m.userId === t.project.managerId);
  if (pm) return [pm.user];
  const pms = members.filter((m) => m.role === "PROJECT_MANAGER").map((m) => m.user);
  return pms.length ? pms : members.filter((m) => m.role === "CEO").map((m) => m.user);
}

export async function ceosFor(db: TenantDb, companyId: string): Promise<User[]> {
  const rows = await db.membership.findMany({
    where: { companyId, role: "CEO", user: { active: true } },
    include: { user: true },
  });
  return rows.map((r) => r.user);
}

export type RunSummary = { tenants: number; reminders: number; toManagers: number; notDelivered: number };

/**
 * Da chiamare ogni ora (Vercel Cron, n8n o GitHub Actions). Idempotente: ogni task avanza
 * al massimo di un livello per chiamata e solo quando l'orario lo prevede.
 */
export async function runReminders(now = new Date(), send: EmailSender = sendEmail): Promise<RunSummary> {
  const summary: RunSummary = { tenants: 0, reminders: 0, toManagers: 0, notDelivered: 0 };
  const { day } = romeClock(now);
  const tenants = await prisma.tenant.findMany({ where: { modules: { has: "RICHIAMO" } } });

  for (const tenant of tenants) {
    summary.tenants++;
    const db = dbFor(tenant.id);
    const base = appUrl(tenant.domain);
    const tasks = await db.task.findMany({
      where: {
        status: "DA_FARE",
        assigneeId: { not: null },
        dueDate: { lte: new Date(`${day}T23:59:59.999Z`) },
        blockerNote: null,
        escalation: { lt: 3 },
        project: { status: "ATTIVO" },
      },
      include: taskInclude,
    });

    const digests = new Map<string, { user: User; items: Array<TaskMail & { assigneeName: string }>; taskIds: string[] }>();

    for (const t of tasks) {
      if (!t.assignee?.active) continue;
      const step = nextStep({ ...t, projectStatus: t.project.status }, now);
      if (!step) continue;

      if (step.level === 1 || step.level === 2) {
        const res = await send(reminderEmail(t.assignee, taskMail(t, base, now), step.level));
        await db.reminder.create({
          data: { tenantId: tenant.id, taskId: t.id, recipientId: t.assignee.id, kind: "AUTOMATICO", level: step.level, delivered: res.delivered, error: res.error },
        });
        await db.task.update({ where: { id: t.id }, data: { escalation: step.level, lastReminderAt: now } });
        summary.reminders++;
        if (!res.delivered) summary.notDelivered++;
        continue;
      }

      // Livello 3: si raccoglie per destinatario e si manda un solo riepilogo a testa.
      for (const m of await managersFor(db, t)) {
        const entry = digests.get(m.id) ?? { user: m, items: [], taskIds: [] };
        entry.items.push({ ...taskMail(t, base, now), assigneeName: t.assignee.name });
        entry.taskIds.push(t.id);
        digests.set(m.id, entry);
      }
      await db.task.update({ where: { id: t.id }, data: { escalation: 3, lastReminderAt: now } });
    }

    for (const { user, items, taskIds } of digests.values()) {
      const res = await send(toManagerEmail(user, items, "AL_PM", `${base}/richiami`));
      await db.reminder.createMany({
        data: taskIds.map((taskId) => ({
          tenantId: tenant.id, taskId, recipientId: user.id, kind: "AL_PM" as const, level: 3, delivered: res.delivered, error: res.error,
        })),
      });
      summary.toManagers++;
      if (!res.delivered) summary.notDelivered++;
    }
  }
  return summary;
}
