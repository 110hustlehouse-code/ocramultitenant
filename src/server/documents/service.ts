import "server-only";
import type { AppContext } from "@/server/context";
import { downloadUrl, objectKey, uploadUrl } from "@/server/integrations/storage";
import { canIn, completeTask, projectScope } from "@/server/projects/service";
import { appUrl } from "@/server/reminders/engine";
import { canonicalName, fileCategory, groupKeyFor } from "./naming";
import { uploadMetaSchema, type UploadMeta } from "./input";

export class DocumentError extends Error {}

export const MAX_DOCUMENT_BYTES = 300 * 1024 * 1024;

async function visibleProject(ctx: AppContext, projectId: string) {
  const project = await ctx.db.project.findFirst({
    where: { AND: [{ id: projectId }, projectScope(ctx, ctx.companies)] },
    select: { id: true, name: true, companyId: true },
  });
  if (!project) throw new DocumentError("Progetto non trovato.");
  return project;
}

/** Chi gestisce tutta la società, o chi è nel team del progetto (assegnatari inclusi). */
async function canUpload(ctx: AppContext, project: { id: string; companyId: string }): Promise<boolean> {
  if (canIn(ctx, project.companyId, "documents:write")) return true;
  const member = await ctx.db.projectMember.count({ where: { projectId: project.id, userId: ctx.user.id } });
  return member > 0;
}

/** URL firmato per caricare un file direttamente su R2 dal browser (stessa infrastruttura dei Verbali). */
export async function requestUpload(ctx: AppContext, projectId: string, file: UploadMeta) {
  const parsed = uploadMetaSchema.safeParse(file);
  if (!parsed.success) throw new DocumentError("File non valido.");
  if (parsed.data.size > MAX_DOCUMENT_BYTES) throw new DocumentError("File troppo grande (massimo 300 MB).");
  const project = await visibleProject(ctx, projectId);
  if (!(await canUpload(ctx, project))) throw new DocumentError("Non puoi caricare file su questo progetto.");
  const key = objectKey(ctx.tenant.id, "documenti", projectId, parsed.data.name);
  return { key, url: await uploadUrl(key, parsed.data.type) };
}

/**
 * Il browser ha finito di caricare: si registra il file. Stesso nome originale già presente
 * nel progetto → nuova versione (il vecchio oggetto R2 resta, niente si sovrascrive mai).
 */
export async function confirmUpload(ctx: AppContext, projectId: string, key: string, file: UploadMeta, taskId?: string) {
  const parsed = uploadMetaSchema.safeParse(file);
  if (!parsed.success) throw new DocumentError("File non valido.");
  const project = await visibleProject(ctx, projectId);
  if (!(await canUpload(ctx, project))) throw new DocumentError("Non puoi caricare file su questo progetto.");
  if (!key.startsWith(`${ctx.tenant.id}/documenti/${projectId}/`)) throw new DocumentError("File non valido.");

  const groupKey = groupKeyFor(parsed.data.name);
  const last = await ctx.db.document.findFirst({
    where: { projectId, groupKey },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;

  return ctx.db.document.create({
    data: {
      tenantId: ctx.tenant.id,
      projectId,
      taskId: taskId ?? null,
      originalName: parsed.data.name,
      displayName: canonicalName({ projectName: project.name, originalName: parsed.data.name, version }),
      groupKey,
      version,
      key,
      mimeType: parsed.data.type,
      size: parsed.data.size,
      uploadedById: ctx.user.id,
    },
  });
}

/** Il file caricato diventa la prova di chiusura del task (riusa completeTask: stessa regola, stesso permesso). */
export async function closeTaskWithDocument(ctx: AppContext, taskId: string, key: string, file: UploadMeta) {
  const task = await ctx.db.task.findFirst({ where: { id: taskId }, select: { id: true, projectId: true } });
  if (!task) throw new DocumentError("Task non trovato.");
  const doc = await confirmUpload(ctx, task.projectId, key, file, taskId);
  // Link assoluto (non uno firmato su R2, che scadrebbe): la rotta genera un URL fresco ad ogni apertura.
  await completeTask(ctx, taskId, `${appUrl(ctx.tenant.domain)}/api/documenti/${doc.id}`);
  return doc;
}

function scope(ctx: AppContext) {
  return { AND: [{ tenantId: ctx.tenant.id }, { project: projectScope(ctx, ctx.companies) }] };
}

export type DocumentGroup = Awaited<ReturnType<typeof listDocuments>>[number];

/** Elenco per progetto, raggruppato per nome file: l'ultima versione in cima, lo storico sotto. */
export async function listDocuments(ctx: AppContext, projectId: string, query?: string) {
  await visibleProject(ctx, projectId);
  const q = query?.trim();
  const rows = await ctx.db.document.findMany({
    where: {
      projectId,
      ...(q ? { OR: [{ originalName: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] } : {}),
    },
    include: { uploadedBy: { select: { name: true } }, approvedBy: { select: { name: true } }, task: { select: { id: true, title: true } } },
    orderBy: [{ groupKey: "asc" }, { version: "desc" }],
  });
  const groups = new Map<string, typeof rows>();
  for (const row of rows) groups.set(row.groupKey, [...(groups.get(row.groupKey) ?? []), row]);
  return [...groups.values()]
    .map((versions) => ({ latest: versions[0]!, history: versions.slice(1) }))
    .sort((a, b) => b.latest.createdAt.getTime() - a.latest.createdAt.getTime());
}

/** Ricerca per nome file nelle società guardate (tutti i progetti visibili, non solo uno). */
export async function searchDocuments(ctx: AppContext, query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  return ctx.db.document.findMany({
    where: { AND: [scope(ctx), { OR: [{ originalName: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] }] },
    include: { project: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

async function manageable(ctx: AppContext, id: string) {
  const doc = await ctx.db.document.findFirst({ where: { AND: [{ id }, scope(ctx)] }, include: { project: { select: { companyId: true } } } });
  if (!doc) throw new DocumentError("File non trovato.");
  if (!canIn(ctx, doc.project.companyId, "documents:write")) throw new DocumentError("Non puoi gestire questo file.");
  return doc;
}

/** Definitivo/approvato: lo decide una persona (PM o CEO), mai l'automatismo. */
export async function approveDocument(ctx: AppContext, id: string) {
  await manageable(ctx, id);
  await ctx.db.document.update({ where: { id }, data: { status: "APPROVATO", approvedById: ctx.user.id, approvedAt: new Date() } });
}

export async function revertDocument(ctx: AppContext, id: string) {
  await manageable(ctx, id);
  await ctx.db.document.update({ where: { id }, data: { status: "IN_LAVORAZIONE", approvedById: null, approvedAt: null } });
}

/** Toglie il riferimento: l'oggetto resta su R2 (principio: i sorgenti non si perdono). */
export async function deleteDocument(ctx: AppContext, id: string) {
  await manageable(ctx, id);
  await ctx.db.document.delete({ where: { id } });
}

/** URL firmato fresco per scaricare/aprire il file (mai salvato: scade, si rigenera ad ogni apertura). */
export async function resolveDownload(ctx: AppContext, id: string) {
  const doc = await ctx.db.document.findFirst({ where: { AND: [{ id }, scope(ctx)] } });
  if (!doc) throw new DocumentError("File non trovato.");
  return { url: await downloadUrl(doc.key), name: doc.displayName };
}

export { fileCategory };
