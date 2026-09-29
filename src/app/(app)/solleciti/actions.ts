"use server";

import { revalidatePath } from "next/cache";
import { assertNotBlocked, getContext } from "@/server/context";
import { cancelFollowUp, FollowUpError, resolveFollowUp, startFollowUp } from "@/server/followups/service";

type Result = { error?: string; ok?: string } | undefined;

async function run(fn: () => Promise<string>): Promise<Result> {
  let ok: string;
  try {
    ok = await fn();
  } catch (e) {
    if (e instanceof FollowUpError) return { error: e.message };
    throw e;
  }
  revalidatePath("/solleciti");
  revalidatePath("/progetti", "layout");
  return { ok };
}

async function ctx() {
  const c = await getContext();
  assertNotBlocked(c);
  return c;
}

export async function startFollowUpAction(_prev: Result, fd: FormData): Promise<Result> {
  const c = await ctx();
  return run(async () => {
    const { delivered } = await startFollowUp(c, String(fd.get("taskId")), {
      waitingFor: String(fd.get("waitingFor") ?? ""),
      contactName: fd.get("contactName")?.toString() ?? null,
      contactEmail: String(fd.get("contactEmail") ?? ""),
      subject: String(fd.get("subject") ?? ""),
      body: String(fd.get("body") ?? ""),
    });
    return delivered ? "Messaggio inviato al cliente." : "Sollecito registrato, ma l'email non è partita (invio non configurato).";
  });
}

export async function resolveFollowUpAction(_prev: Result, fd: FormData): Promise<Result> {
  const c = await ctx();
  return run(async () => {
    await resolveFollowUp(c, String(fd.get("id")), fd.get("note")?.toString() ?? null);
    return "Attesa chiusa.";
  });
}

export async function cancelFollowUpAction(fd: FormData): Promise<void> {
  const c = await ctx();
  await run(async () => {
    await cancelFollowUp(c, String(fd.get("id")));
    return "";
  });
}

/** Variante per i form della pagina Solleciti (senza stato). */
export async function resolveFollowUpFormAction(fd: FormData): Promise<void> {
  await resolveFollowUpAction(undefined, fd);
}
