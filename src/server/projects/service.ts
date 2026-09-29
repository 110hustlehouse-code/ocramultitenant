import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ProjectStatus, Role } from "@/generated/prisma/enums";
import { can, type Permission } from "@/server/auth/permissions";
import type { AppContext } from "@/server/context";
import { viewCompanies } from "@/server/registry/service";
import { proofSchema, type ProjectInput, type TaskInput } from "./input";

export class ProjectError extends Error {}

/** Ruolo dell'utente in una società (null = nessun accesso). */
export function roleIn(ctx: AppContext, companyId: string): Role | null {
  return ctx.access.find((a) => a.company.id === companyId)?.role ?? null;
}

export function canIn(ctx: AppContext, companyId: string, permission: Permission): boolean {
  const role = roleIn(ctx, companyId);
  return role !== null && can(role, permission);
}

/**
 * Progetti visibili. Per l'elenco si usano le società della vista corrente; per aprire un
 * progetto o chiudere un task (link da «I miei task», notifiche) tutte quelle dell'utente.
 * • CEO e PM (tasks:read:all): tutti i progetti della società
 * • collaboratori ed esterni: solo quelli in cui sono membri o hanno un task
 */
export function projectScope(ctx: AppContext, companies = viewCompanies(ctx)): Prisma.ProjectWhereInput {
  const full = companies.filter((c) => canIn(ctx, c.id, "tasks:read:all")).map((c) => c.id);
  const limited = companies.filter((c) => !full.includes(c.id)).map((c) => c.id);
  const userId = ctx.user.id;
  const or: Prisma.ProjectWhereInput[] = [];
  if (full.length) or.push({ companyId: { in: full } });
  if (limited.length) {
    or.push({
      companyId: { in: limited },
      OR: [{ members: { some: { userId } } }, { tasks: { some: { assigneeId: userId } } }],
    });
  }
  return or.length ? { OR: or } : { id: "__none__" };
}

/** Task visibili dentro un progetto: tutti per CEO/PM, solo i propri per gli altri. */
export function taskScope(ctx: AppContext, companyId: string): Prisma.TaskWhereInput {
  return canIn(ctx, companyId, "tasks:read:all") ? {} : { assigneeId: ctx.user.id };
}

const OPEN: ProjectStatus[] = ["ATTIVO", "IN_PAUSA"];

export async function listProjects(ctx: AppContext, filter: "aperti" | "chiusi" | "tutti") {
  const status: Prisma.ProjectWhereInput =
    filter === "aperti" ? { status: { in: OPEN } } : filter === "chiusi" ? { status: { notIn: OPEN } } : {};
  const projects = await ctx.db.project.findMany({
    where: { AND: [projectScope(ctx), status] },
    include: {
      client: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true } },
      tasks: { where: { status: "DA_FARE" }, select: { dueDate: true, assigneeId: true } },
    },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 300,
  });
  return projects;
}

export async function getProject(ctx: AppContext, id: string) {
  const project = await ctx.db.project.findFirst({
    where: { AND: [{ id }, projectScope(ctx, ctx.companies)] },
    include: {
      company: true,
      client: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!project) return null;
  const tasks = await ctx.db.task.findMany({
    where: { projectId: id, ...taskScope(ctx, project.companyId) },
    include: {
      assignee: { select: { id: true, name: true } },
      completedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  return { ...project, tasks, canManage: canIn(ctx, project.companyId, "projects:write") };
}

/** Persone assegnabili nella società: chiunque vi abbia accesso ed è attivo. */
export async function assignableUsers(ctx: AppContext, companyId: string) {
  return ctx.db.user.findMany({
    where: { active: true, memberships: { some: { companyId } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Clienti selezionabili per un progetto della società. */
export async function clientsFor(ctx: AppContext, companyId: string) {
  return ctx.db.party.findMany({
    where: { kind: "CLIENTE", companies: { some: { companyId } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

async function assertUsersInCompany(ctx: AppContext, companyId: string, userIds: string[]) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  const found = await ctx.db.membership.count({ where: { companyId, userId: { in: ids } } });
  if (found !== ids.length) throw new ProjectError("Una delle persone scelte non lavora con questa società.");
}

async function assertClient(ctx: AppContext, companyId: string, clientId: string | null) {
  if (!clientId) return;
  const ok = await ctx.db.party.count({
    where: { id: clientId, kind: "CLIENTE", companies: { some: { companyId } } },
  });
  if (!ok) throw new ProjectError("Cliente non valido per questa società.");
}

async function assertCodeFree(ctx: AppContext, code: string | null, exceptId?: string) {
  if (!code) return;
  const dup = await ctx.db.project.findFirst({
    where: { code, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
  if (dup) throw new ProjectError(`Codice PO già usato da «${dup.name}».`);
}

const projectFields = (d: ProjectInput) => ({
  name: d.name,
  clientId: d.clientId,
  code: d.code,
  service: d.service,
  managerId: d.managerId,
  startDate: d.startDate,
  dueDate: d.dueDate,
  notes: d.notes,
});

export async function createProject(ctx: AppContext, d: ProjectInput) {
  if (!canIn(ctx, d.companyId, "projects:write")) throw new ProjectError("Non puoi creare progetti per questa società.");
  const members = [...new Set([...d.memberIds, ...(d.managerId ? [d.managerId] : [])])];
  await assertUsersInCompany(ctx, d.companyId, members);
  await assertClient(ctx, d.companyId, d.clientId);
  await assertCodeFree(ctx, d.code);
  return ctx.db.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: { ...projectFields(d), companyId: d.companyId, tenantId: ctx.tenant.id },
    });
    if (members.length) {
      await tx.projectMember.createMany({
        data: members.map((userId) => ({ tenantId: ctx.tenant.id, projectId: project.id, userId })),
      });
    }
    return project;
  });
}

async function manageable(ctx: AppContext, projectId: string) {
  const project = await ctx.db.project.findFirst({ where: { AND: [{ id: projectId }, projectScope(ctx, ctx.companies)] } });
  if (!project) throw new ProjectError("Progetto non trovato.");
  if (!canIn(ctx, project.companyId, "projects:write")) throw new ProjectError("Non puoi modificare questo progetto.");
  return project;
}

export async function updateProject(ctx: AppContext, id: string, d: ProjectInput) {
  const project = await manageable(ctx, id);
  if (d.companyId !== project.companyId) throw new ProjectError("La società di un progetto non si cambia.");
  const members = [...new Set([...d.memberIds, ...(d.managerId ? [d.managerId] : [])])];
  await assertUsersInCompany(ctx, project.companyId, members);
  await assertClient(ctx, project.companyId, d.clientId);
  await assertCodeFree(ctx, d.code, id);
  await ctx.db.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data: projectFields(d) });
    // Chi ha task assegnati resta membro anche se tolto dall'elenco.
    const withTasks = await tx.task.findMany({
      where: { projectId: id, assigneeId: { not: null } },
      select: { assigneeId: true },
      distinct: ["assigneeId"],
    });
    const keep = new Set([...members, ...withTasks.map((t) => t.assigneeId!)]);
    await tx.projectMember.deleteMany({ where: { projectId: id, userId: { notIn: [...keep] } } });
    await tx.projectMember.createMany({
      data: [...keep].map((userId) => ({ tenantId: ctx.tenant.id, projectId: id, userId })),
      skipDuplicates: true,
    });
  });
}

export async function setProjectStatus(ctx: AppContext, id: string, status: ProjectStatus) {
  await manageable(ctx, id);
  await ctx.db.project.update({
    where: { id },
    data: { status, closedAt: OPEN.includes(status) ? null : new Date() },
  });
}

async function ensureMember(ctx: AppContext, projectId: string, userId: string | null) {
  if (!userId) return;
  await ctx.db.projectMember.createMany({
    data: [{ tenantId: ctx.tenant.id, projectId, userId }],
    skipDuplicates: true,
  });
}

export async function createTask(ctx: AppContext, projectId: string, d: TaskInput) {
  const project = await manageable(ctx, projectId);
  if (d.assigneeId) await assertUsersInCompany(ctx, project.companyId, [d.assigneeId]);
  const task = await ctx.db.task.create({
    data: { ...d, projectId, source: "MANUALE", tenantId: ctx.tenant.id },
  });
  await ensureMember(ctx, projectId, d.assigneeId);
  return task;
}

async function loadTask(ctx: AppContext, taskId: string) {
  const task = await ctx.db.task.findFirst({ where: { id: taskId }, include: { project: true } });
  if (!task) throw new ProjectError("Task non trovato.");
  const visible = await ctx.db.project.count({
    where: { AND: [{ id: task.projectId }, projectScope(ctx, ctx.companies)] },
  });
  const manager = canIn(ctx, task.project.companyId, "projects:write");
  const own = task.assigneeId === ctx.user.id;
  if (!visible || (!manager && !own)) throw new ProjectError("Task non trovato.");
  return { task, manager, own };
}

export async function updateTask(ctx: AppContext, taskId: string, d: TaskInput) {
  const { task, manager } = await loadTask(ctx, taskId);
  if (!manager) throw new ProjectError("Solo CEO e PM modificano i task.");
  if (d.assigneeId) await assertUsersInCompany(ctx, task.project.companyId, [d.assigneeId]);
  // Nuova scadenza o nuova persona: i richiami ripartono da zero (decisione del CEO/PM).
  const changed =
    d.assigneeId !== task.assigneeId || (d.dueDate?.getTime() ?? null) !== (task.dueDate?.getTime() ?? null);
  const reset = changed ? { escalation: 0, lastReminderAt: null, blockerNote: null, blockerAt: null } : {};
  await ctx.db.task.update({ where: { id: taskId }, data: { ...d, ...reset } });
  if (changed) {
    await ctx.db.accountBlock.updateMany({ where: { taskId, releasedAt: null }, data: { releasedAt: new Date() } });
  }
  await ensureMember(ctx, task.projectId, d.assigneeId);
}

export async function deleteTask(ctx: AppContext, taskId: string) {
  const { manager } = await loadTask(ctx, taskId);
  if (!manager) throw new ProjectError("Solo CEO e PM eliminano i task.");
  await ctx.db.task.deleteMany({ where: { id: taskId } });
}

/** Chiude un task: può farlo chi ce l'ha assegnato, oppure CEO/PM. La prova è obbligatoria. */
export async function completeTask(ctx: AppContext, taskId: string, rawProof: string) {
  const { task } = await loadTask(ctx, taskId);
  if (task.status === "FATTO") return;
  const proof = proofSchema.safeParse(rawProof);
  if (!proof.success) throw new ProjectError(proof.error.issues[0]?.message ?? "Prova non valida");
  await ctx.db.task.update({
    where: { id: taskId },
    data: { status: "FATTO", proof: proof.data, completedAt: new Date(), completedById: ctx.user.id },
  });
  // Consegnato: l'eventuale blocco dell'account su questo task si chiude da solo.
  await ctx.db.accountBlock.updateMany({ where: { taskId, releasedAt: null }, data: { releasedAt: new Date() } });
}

export async function reopenTask(ctx: AppContext, taskId: string) {
  await loadTask(ctx, taskId);
  await ctx.db.task.update({
    where: { id: taskId },
    data: { status: "DA_FARE", completedAt: null, completedById: null },
  });
}

/** I task aperti assegnati all'utente, in tutte le sue società. */
export async function myOpenTasks(ctx: AppContext) {
  return ctx.db.task.findMany({
    where: {
      assigneeId: ctx.user.id,
      status: "DA_FARE",
      project: { companyId: { in: ctx.companies.map((c) => c.id) }, status: { in: OPEN } },
    },
    include: { project: { select: { id: true, name: true, companyId: true } } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
    take: 200,
  });
}
