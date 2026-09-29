"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ProjectStatus } from "@/generated/prisma/enums";
import { assertNotBlocked, getContext } from "@/server/context";
import {
  projectFromFormData,
  projectInputSchema,
  taskFromFormData,
  taskInputSchema,
} from "@/server/projects/input";
import {
  completeTask,
  createProject,
  createTask,
  deleteTask,
  ProjectError,
  reopenTask,
  setProjectStatus,
  updateProject,
  updateTask,
} from "@/server/projects/service";
import { fieldErrors } from "@/server/registry/input";

async function ctxWithModule({ allowBlocked = false } = {}) {
  const ctx = await getContext();
  if (!ctx.tenant.modules.includes("PROGETTI")) throw new Error("Modulo non attivo");
  if (!allowBlocked) assertNotBlocked(ctx);
  return ctx;
}

export type ProjectFormState =
  | { errors?: Record<string, string>; message?: string; values?: ReturnType<typeof projectFromFormData> }
  | undefined;

export async function saveProjectAction(_prev: ProjectFormState, fd: FormData): Promise<ProjectFormState> {
  const ctx = await ctxWithModule();
  const values = projectFromFormData(fd);
  const parsed = projectInputSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const id = fd.get("id")?.toString();
  let projectId = id;
  try {
    if (id) await updateProject(ctx, id, parsed.data);
    else projectId = (await createProject(ctx, parsed.data)).id;
  } catch (e) {
    if (e instanceof ProjectError) return { message: e.message, values };
    throw e;
  }
  revalidatePath("/progetti");
  redirect(`/progetti/${projectId}`);
}

export async function setProjectStatusAction(fd: FormData): Promise<void> {
  const ctx = await ctxWithModule();
  const id = String(fd.get("id"));
  const status = String(fd.get("status")) as ProjectStatus;
  if (!["ATTIVO", "IN_PAUSA", "CHIUSO", "ANNULLATO"].includes(status)) return;
  await setProjectStatus(ctx, id, status);
  revalidatePath(`/progetti/${id}`);
  revalidatePath("/progetti");
}

export type TaskFormState = { errors?: Record<string, string>; message?: string; ok?: number } | undefined;

export async function saveTaskAction(_prev: TaskFormState, fd: FormData): Promise<TaskFormState> {
  const ctx = await ctxWithModule();
  const parsed = taskInputSchema.safeParse(taskFromFormData(fd));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const projectId = String(fd.get("projectId"));
  const taskId = fd.get("taskId")?.toString();
  try {
    if (taskId) await updateTask(ctx, taskId, parsed.data);
    else await createTask(ctx, projectId, parsed.data);
  } catch (e) {
    if (e instanceof ProjectError) return { message: e.message };
    throw e;
  }
  revalidatePath(`/progetti/${projectId}`);
  // `ok` cambia a ogni salvataggio: il form si svuota per il task successivo.
  return { ok: Date.now() };
}

export type CompleteState = { message?: string } | undefined;

export async function completeTaskAction(_prev: CompleteState, fd: FormData): Promise<CompleteState> {
  // Chiudere un task è permesso anche con l'account bloccato: è il modo per sbloccarlo.
  const ctx = await ctxWithModule({ allowBlocked: true });
  try {
    await completeTask(ctx, String(fd.get("taskId")), String(fd.get("proof") ?? ""));
  } catch (e) {
    if (e instanceof ProjectError) return { message: e.message };
    throw e;
  }
  revalidatePath("/", "layout");
  return undefined;
}

export async function reopenTaskAction(fd: FormData): Promise<void> {
  const ctx = await ctxWithModule();
  await reopenTask(ctx, String(fd.get("taskId")));
  revalidatePath("/progetti", "layout");
}

export async function deleteTaskAction(fd: FormData): Promise<void> {
  const ctx = await ctxWithModule();
  await deleteTask(ctx, String(fd.get("taskId")));
  revalidatePath("/progetti", "layout");
}
