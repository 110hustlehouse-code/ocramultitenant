"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/server/context";
import { addCost, costFromFormData, deleteCost, MarginError } from "@/server/margine/service";

type Result = { error?: string } | undefined;

async function ctxWithModule() {
  const ctx = await getContext();
  if (!ctx.tenant.modules.includes("MARGINE")) throw new Error("Modulo non attivo");
  return ctx;
}

export async function addCostAction(_prev: Result, fd: FormData): Promise<Result> {
  const ctx = await ctxWithModule();
  const projectId = String(fd.get("projectId"));
  try {
    await addCost(ctx, projectId, costFromFormData(fd));
  } catch (e) {
    if (e instanceof MarginError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/margine/${projectId}`);
  revalidatePath("/margine");
}

export async function deleteCostAction(fd: FormData): Promise<void> {
  const ctx = await ctxWithModule();
  const projectId = String(fd.get("projectId"));
  await deleteCost(ctx, String(fd.get("id")));
  revalidatePath(`/margine/${projectId}`);
  revalidatePath("/margine");
}
