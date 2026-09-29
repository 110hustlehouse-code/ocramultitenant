"use server";

import { revalidatePath } from "next/cache";
import { assertNotBlocked, getContext } from "@/server/context";
import {
  blockAccount,
  escalateToCeo,
  nudge,
  ReminderError,
  reportBlocker,
  reschedule,
  unblockAccount,
} from "@/server/reminders/service";

type Result = { error?: string; ok?: string } | undefined;

async function run(fn: () => Promise<unknown>, ok: string): Promise<Result> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ReminderError) return { error: e.message };
    throw e;
  }
  revalidatePath("/richiami");
  revalidatePath("/progetti", "layout");
  return { ok };
}

async function ctx({ allowBlocked = false } = {}) {
  const c = await getContext();
  if (!c.tenant.modules.includes("RICHIAMO")) throw new Error("Modulo non attivo");
  if (!allowBlocked) assertNotBlocked(c);
  return c;
}

/** Anche un account bloccato può segnalare un impedimento. */
export async function reportBlockerAction(_prev: Result, fd: FormData): Promise<Result> {
  const c = await ctx({ allowBlocked: true });
  return run(() => reportBlocker(c, String(fd.get("taskId")), String(fd.get("note") ?? "")), "Segnalato al project manager.");
}

export async function nudgeAction(_prev: Result, fd: FormData): Promise<Result> {
  const c = await ctx();
  let delivered = false;
  const res = await run(async () => {
    delivered = await nudge(c, String(fd.get("taskId")), fd.get("message")?.toString() ?? null);
  }, "Sollecito inviato.");
  return res?.ok && !delivered ? { ok: "Sollecito registrato (email non configurata)." } : res;
}

export async function escalateAction(fd: FormData): Promise<void> {
  const c = await ctx();
  await run(() => escalateToCeo(c, String(fd.get("taskId"))), "");
}

export async function blockAction(fd: FormData): Promise<void> {
  const c = await ctx();
  await run(() => blockAccount(c, String(fd.get("taskId")), fd.get("reason")?.toString() ?? null), "");
}

export async function unblockAction(fd: FormData): Promise<void> {
  const c = await ctx();
  await run(() => unblockAccount(c, String(fd.get("blockId"))), "");
}

export async function rescheduleAction(_prev: Result, fd: FormData): Promise<Result> {
  const c = await ctx();
  return run(
    () =>
      reschedule(c, String(fd.get("taskId")), {
        dueDate: fd.get("dueDate")?.toString() || null,
        assigneeId: fd.get("assigneeId")?.toString() || null,
      }),
    "Aggiornato: i promemoria ripartono da zero.",
  );
}
