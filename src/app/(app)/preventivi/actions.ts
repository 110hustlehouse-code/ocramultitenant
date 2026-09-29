"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertNotBlocked, getContext } from "@/server/context";
import { proposeDraft } from "@/server/quotes/claude";
import {
  acceptQuote,
  createQuote,
  deleteDraft,
  duplicateQuote,
  markSent,
  QuoteError,
  rejectQuote,
  saveDraft,
  saveServiceItem,
  setMilestone,
  setServiceItemActive,
  type DraftInput,
  type ServiceItemInput,
} from "@/server/quotes/service";

export type Result = { error?: string; ok?: string; notes?: string[] } | undefined;

async function ctx() {
  const c = await getContext();
  if (!c.tenant.modules.includes("PREVENTIVI")) throw new Error("Modulo non attivo");
  assertNotBlocked(c);
  return c;
}

async function run(fn: () => Promise<Result | void>, paths: string[] = []): Promise<Result> {
  let res: Result | void;
  try {
    res = await fn();
  } catch (e) {
    if (e instanceof QuoteError) return { error: e.message };
    throw e;
  }
  revalidatePath("/preventivi", "layout");
  for (const p of paths) revalidatePath(p, "layout");
  return res ?? { ok: "Salvato." };
}

export async function createQuoteAction(_prev: Result, fd: FormData): Promise<Result> {
  const c = await ctx();
  let id = "";
  const res = await run(async () => {
    id = (
      await createQuote(c, {
        companyId: String(fd.get("companyId") ?? ""),
        clientId: String(fd.get("clientId") ?? ""),
        title: String(fd.get("title") ?? ""),
      })
    ).id;
  });
  if (res?.error) return res;
  redirect(`/preventivi/${id}`);
}

/** L'editor manda la bozza come JSON (voci comprese): la validazione vera è nel servizio. */
export async function saveDraftAction(_prev: Result, fd: FormData): Promise<Result> {
  const c = await ctx();
  return run(async () => {
    let input: DraftInput;
    try {
      input = JSON.parse(String(fd.get("draft") ?? "")) as DraftInput;
    } catch {
      throw new QuoteError("Dati non validi.");
    }
    await saveDraft(c, String(fd.get("id")), input);
    return { ok: "Bozza salvata." };
  });
}

export async function proposeDraftAction(_prev: Result, fd: FormData): Promise<Result> {
  const c = await ctx();
  return run(async () => {
    const notes = await proposeDraft(c, String(fd.get("id")), String(fd.get("brief") ?? ""));
    return { ok: "Voci proposte: controllale e salva.", notes };
  });
}

export async function markSentAction(_prev: Result, fd: FormData): Promise<Result> {
  const c = await ctx();
  return run(async () => {
    await markSent(c, String(fd.get("id")));
    return { ok: "Segnato come inviato." };
  });
}

export async function rejectQuoteAction(_prev: Result, fd: FormData): Promise<Result> {
  const c = await ctx();
  return run(async () => {
    await rejectQuote(c, String(fd.get("id")), fd.get("note")?.toString() ?? null);
    return { ok: "Segnato come rifiutato." };
  });
}

export async function acceptQuoteAction(_prev: Result, fd: FormData): Promise<Result> {
  const c = await ctx();
  let projectId = "";
  const res = await run(
    async () => {
      projectId = (
        await acceptQuote(c, String(fd.get("id")), {
          managerId: fd.get("managerId")?.toString() || null,
          code: fd.get("code")?.toString() || null,
        })
      ).id;
    },
    ["/progetti"],
  );
  if (res?.error) return res;
  redirect(`/progetti/${projectId}`);
}

export async function milestoneAction(fd: FormData): Promise<void> {
  const c = await ctx();
  const which = fd.get("which") === "deposit" ? "deposit" : "contract";
  await run(() => setMilestone(c, String(fd.get("id")), which, fd.get("done") === "1"), ["/progetti"]);
}

export async function duplicateQuoteAction(fd: FormData): Promise<void> {
  const c = await ctx();
  let id = "";
  const res = await run(async () => {
    id = (await duplicateQuote(c, String(fd.get("id")))).id;
  });
  if (!res?.error) redirect(`/preventivi/${id}`);
}

export async function deleteDraftAction(fd: FormData): Promise<void> {
  const c = await ctx();
  const res = await run(() => deleteDraft(c, String(fd.get("id"))));
  if (!res?.error) redirect("/preventivi");
}

export async function saveServiceItemAction(_prev: Result, fd: FormData): Promise<Result> {
  const c = await ctx();
  return run(async () => {
    let input: ServiceItemInput;
    try {
      input = JSON.parse(String(fd.get("item") ?? "")) as ServiceItemInput;
    } catch {
      throw new QuoteError("Dati non validi.");
    }
    await saveServiceItem(c, String(fd.get("companyId")), fd.get("id")?.toString() || null, input);
    return { ok: "Voce salvata." };
  });
}

export async function toggleServiceItemAction(fd: FormData): Promise<void> {
  const c = await ctx();
  await run(() => setServiceItemActive(c, String(fd.get("id")), fd.get("active") === "1"));
}
