"use server";

import { revalidatePath } from "next/cache";
import { assertNotBlocked, getContext } from "@/server/context";
import {
  approveDocument,
  confirmUpload,
  deleteDocument,
  DocumentError,
  requestUpload,
  revertDocument,
} from "@/server/documents/service";

type UploadResult = { url?: string; key?: string; error?: string };
type Result = { error?: string } | undefined;

async function ctxWithModule({ allowBlocked = false } = {}) {
  const ctx = await getContext();
  if (!ctx.tenant.modules.includes("DOCUMENTI")) throw new Error("Modulo non attivo");
  if (!allowBlocked) assertNotBlocked(ctx);
  return ctx;
}

const fail = (e: unknown) => {
  if (e instanceof DocumentError) return { error: e.message };
  throw e;
};

export async function requestUploadAction(
  projectId: string,
  file: { name: string; type: string; size: number },
): Promise<UploadResult> {
  const ctx = await ctxWithModule();
  try {
    return await requestUpload(ctx, projectId, file);
  } catch (e) {
    return fail(e);
  }
}

export async function confirmUploadAction(
  projectId: string,
  key: string,
  file: { name: string; type: string; size: number },
): Promise<Result> {
  const ctx = await ctxWithModule();
  try {
    await confirmUpload(ctx, projectId, key, file);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/documenti");
}

export async function approveAction(fd: FormData): Promise<void> {
  const ctx = await ctxWithModule();
  await approveDocument(ctx, String(fd.get("id")));
  revalidatePath("/documenti");
}

export async function revertAction(fd: FormData): Promise<void> {
  const ctx = await ctxWithModule();
  await revertDocument(ctx, String(fd.get("id")));
  revalidatePath("/documenti");
}

export async function deleteAction(fd: FormData): Promise<void> {
  const ctx = await ctxWithModule();
  await deleteDocument(ctx, String(fd.get("id")));
  revalidatePath("/documenti");
}
