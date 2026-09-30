import "server-only";
import type { AppContext } from "@/server/context";
import { sendEmail, type EmailSender } from "@/server/notify/email";
import { canIn } from "@/server/projects/service";
import { viewCompanies } from "@/server/registry/service";
import { appUrl, ceosFor, managersFor, taskMail } from "./engine";
import { onTimeRate } from "./policy";
import { nudgeEmail, toManagerEmail } from "./templates";

export class ReminderError extends Error {}

async function loadTask(ctx: AppContext, taskId: string) {
  const task = await ctx.db.task.findFirst({
    where: { id: taskId, project: { companyId: { in: ctx.companies.map((c) => c.id) } } },
    include: { assignee: true, project: { include: { company: true, manager: true } } },
  });
  if (!task) throw new ReminderError("Task non trovato.");
  return task;
}

const base = (ctx: AppContext) => appUrl(ctx.tenant.domain);

/** «Non posso, perché…»: lo dice chi ha il task. Fermati i richiami, il motivo va al PM. */
export async function reportBlocker(ctx: AppContext, taskId: string, note: string, send: EmailSender = sendEmail) {
  const task = await loadTask(ctx, taskId);
  if (task.assigneeId !== ctx.user.id) throw new ReminderError("Solo chi ha il task può segnalare un impedimento.");
  if (task.status !== "DA_FARE") throw new ReminderError("Il task è già chiuso.");
  const text = note.trim();
  if (text.length < 5) throw new ReminderError("Scrivi il motivo in poche parole.");
  const now = new Date();
  await ctx.db.task.update({
    where: { id: taskId },
    data: { blockerNote: text.slice(0, 1000), blockerAt: now, escalation: 3, lastReminderAt: now },
  });
  for (const m of await managersFor(ctx.db, task)) {
    const res = await send(
      toManagerEmail(m, [{ ...taskMail(task, base(ctx)), assigneeName: task.assignee?.name ?? "", note: text }], "NON_POSSO", `${base(ctx)}/richiami`),
    );
    await ctx.db.reminder.create({
      data: { tenantId: ctx.tenant.id, taskId, recipientId: m.id, kind: "NON_POSSO", level: 3, delivered: res.delivered, error: res.error },
    });
  }
}

function assertManage(ctx: AppContext, companyId: string) {
  if (!canIn(ctx, companyId, "reminders:manage")) throw new ReminderError("Non puoi gestire i richiami di questa società.");
}

/** Richiamo manuale del PM al collaboratore (livello 3). Non è un sollecito al cliente. */
export async function nudge(ctx: AppContext, taskId: string, message: string | null, send: EmailSender = sendEmail) {
  const task = await loadTask(ctx, taskId);
  assertManage(ctx, task.project.companyId);
  if (!task.assignee) throw new ReminderError("Il task non è assegnato.");
  const res = await send(nudgeEmail(task.assignee, taskMail(task, base(ctx)), ctx.user.name, message?.trim() || null));
  await ctx.db.reminder.create({
    data: { tenantId: ctx.tenant.id, taskId, recipientId: task.assignee.id, kind: "SOLLECITO", level: 3, delivered: res.delivered, error: res.error },
  });
  return res.delivered;
}

/** Il PM passa la decisione al CEO (livello 4). */
export async function escalateToCeo(ctx: AppContext, taskId: string, send: EmailSender = sendEmail) {
  const task = await loadTask(ctx, taskId);
  assertManage(ctx, task.project.companyId);
  await ctx.db.task.update({ where: { id: taskId }, data: { escalation: 4, lastReminderAt: new Date() } });
  for (const ceo of await ceosFor(ctx.db, task.project.companyId)) {
    if (ceo.id === ctx.user.id) continue;
    const res = await send(
      toManagerEmail(ceo, [{ ...taskMail(task, base(ctx)), assigneeName: task.assignee?.name ?? "", note: task.blockerNote }], "AL_CEO", `${base(ctx)}/richiami`),
    );
    await ctx.db.reminder.create({
      data: { tenantId: ctx.tenant.id, taskId, recipientId: ceo.id, kind: "AL_CEO", level: 4, delivered: res.delivered, error: res.error },
    });
  }
}

/**
 * Blocco dell'account fino alla consegna. Lo decide una persona (PM o CEO), mai l'automatismo.
 * Il collaboratore vede solo il task da consegnare; alla consegna si sblocca da solo.
 */
export async function blockAccount(ctx: AppContext, taskId: string, reason: string | null) {
  const task = await loadTask(ctx, taskId);
  if (!canIn(ctx, task.project.companyId, "hardblock:manage")) throw new ReminderError("Non puoi bloccare account in questa società.");
  if (task.status !== "DA_FARE" || !task.assigneeId) throw new ReminderError("Si blocca solo per un task aperto e assegnato.");
  if (task.assigneeId === ctx.user.id) throw new ReminderError("Non puoi bloccare il tuo account.");
  const target = await ctx.db.membership.findFirst({ where: { userId: task.assigneeId, companyId: task.project.companyId } });
  if (!target || target.role === "CEO" || target.role === "PROJECT_MANAGER") {
    throw new ReminderError("Si possono bloccare solo collaboratori ed esterni.");
  }
  const active = await ctx.db.accountBlock.count({ where: { userId: task.assigneeId, taskId, releasedAt: null } });
  if (active) return;
  await ctx.db.accountBlock.create({
    data: { tenantId: ctx.tenant.id, userId: task.assigneeId, taskId, blockedById: ctx.user.id, reason: reason?.trim().slice(0, 500) || null },
  });
}

export async function unblockAccount(ctx: AppContext, blockId: string) {
  const block = await ctx.db.accountBlock.findFirst({ where: { id: blockId, releasedAt: null }, include: { task: { include: { project: true } } } });
  if (!block) throw new ReminderError("Blocco non trovato.");
  if (!canIn(ctx, block.task.project.companyId, "hardblock:manage")) throw new ReminderError("Non puoi sbloccare questo account.");
  await ctx.db.accountBlock.update({ where: { id: blockId }, data: { releasedAt: new Date() } });
}

/** Cruscotto dei richiami per PM e CEO: cosa va gestito e chi è bloccato. */
export async function remindersBoard(ctx: AppContext) {
  const companies = viewCompanies(ctx).filter((c) => canIn(ctx, c.id, "reminders:manage")).map((c) => c.id);
  const [toHandle, blocks, recent] = await Promise.all([
    ctx.db.task.findMany({
      where: { status: "DA_FARE", escalation: { gte: 3 }, project: { companyId: { in: companies } } },
      include: { assignee: { select: { id: true, name: true } }, project: { select: { id: true, name: true, companyId: true } } },
      orderBy: [{ escalation: "desc" }, { dueDate: "asc" }],
    }),
    ctx.db.accountBlock.findMany({
      where: { releasedAt: null, task: { project: { companyId: { in: companies } } } },
      include: { user: { select: { name: true } }, blockedBy: { select: { name: true } }, task: { select: { id: true, title: true, projectId: true } } },
      orderBy: { createdAt: "desc" },
    }),
    ctx.db.reminder.findMany({
      where: { task: { project: { companyId: { in: companies } } } },
      include: { recipient: { select: { name: true } }, task: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  return { toHandle, blocks, recent };
}

/** Situazione di un collaboratore, per la decisione del CEO (decisione del 16 set). */
export async function collaboratorSituation(ctx: AppContext, userId: string, now = new Date()) {
  const companies = ctx.companies.map((c) => c.id);
  const since = new Date(now.getTime() - 60 * 24 * 3600 * 1000);
  const [open, done, projects, blocks] = await Promise.all([
    ctx.db.task.findMany({ where: { assigneeId: userId, status: "DA_FARE", project: { companyId: { in: companies } } }, select: { dueDate: true } }),
    ctx.db.task.findMany({
      where: { assigneeId: userId, status: "FATTO", completedAt: { gte: since }, project: { companyId: { in: companies } } },
      select: { dueDate: true, completedAt: true },
    }),
    ctx.db.project.count({ where: { status: "ATTIVO", companyId: { in: companies }, members: { some: { userId } } } }),
    ctx.db.accountBlock.count({ where: { userId, createdAt: { gte: since } } }),
  ]);
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  return {
    open: open.length,
    overdue: open.filter((t) => t.dueDate && t.dueDate.toISOString().slice(0, 10) < today).length,
    doneLast60: done.length,
    onTime: onTimeRate(done),
    activeProjects: projects,
    blocksLast60: blocks,
  };
}

/** Blocchi attivi dell'utente: se ce ne sono, OCRA mostra solo i task da consegnare. */
export async function activeBlocksFor(ctx: Pick<AppContext, "db" | "user">) {
  return ctx.db.accountBlock.findMany({
    where: { userId: ctx.user.id, releasedAt: null },
    include: {
      blockedBy: { select: { name: true } },
      task: { select: { id: true, title: true, dueDate: true, priority: true, status: true, project: { select: { id: true, name: true } } } },
    },
  });
}

/** Decisione di PM/CEO: nuova scadenza e/o nuova persona. I richiami ripartono da zero. */
export async function reschedule(ctx: AppContext, taskId: string, change: { dueDate: string | null; assigneeId: string | null }) {
  const task = await loadTask(ctx, taskId);
  if (!canIn(ctx, task.project.companyId, "projects:write")) throw new ReminderError("Non puoi modificare questo task.");
  if (change.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(change.dueDate)) throw new ReminderError("Data non valida.");
  const assigneeId = change.assigneeId || task.assigneeId;
  if (assigneeId && assigneeId !== task.assigneeId) {
    const ok = await ctx.db.membership.count({ where: { userId: assigneeId, companyId: task.project.companyId } });
    if (!ok) throw new ReminderError("Questa persona non lavora con la società.");
  }
  await ctx.db.task.update({
    where: { id: taskId },
    data: {
      assigneeId,
      dueDate: change.dueDate ? new Date(`${change.dueDate}T12:00:00.000Z`) : task.dueDate,
      escalation: 0,
      lastReminderAt: null,
      blockerNote: null,
      blockerAt: null,
    },
  });
  if (assigneeId) {
    await ctx.db.projectMember.createMany({
      data: [{ tenantId: ctx.tenant.id, projectId: task.projectId, userId: assigneeId }],
      skipDuplicates: true,
    });
  }
  await ctx.db.accountBlock.updateMany({ where: { taskId, releasedAt: null }, data: { releasedAt: new Date() } });
}
