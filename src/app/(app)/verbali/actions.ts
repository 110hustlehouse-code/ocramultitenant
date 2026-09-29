"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { assertNotBlocked, getContext } from "@/server/context";
import {
  attachAudio,
  confirmMeeting,
  createMeeting,
  MeetingError,
  requestAudioUpload,
  runProcessing,
  setTranscript,
  startProcessing,
  type Decision,
} from "@/server/meetings/service";
import { createIntegration, disableIntegration } from "@/server/meetings/integrations";

async function ctxWithModule() {
  const ctx = await getContext();
  if (!ctx.tenant.modules.includes("VERBALI")) throw new Error("Modulo non attivo");
  assertNotBlocked(ctx);
  return ctx;
}

type Result = { error?: string };
const fail = (e: unknown): Result => {
  if (e instanceof MeetingError) return { error: e.message };
  throw e;
};

export async function createMeetingAction(_prev: Result | undefined, fd: FormData): Promise<Result> {
  const ctx = await ctxWithModule();
  let id: string;
  try {
    id = (
      await createMeeting(ctx, {
        title: String(fd.get("title") ?? ""),
        heldAt: String(fd.get("heldAt") ?? ""),
        companyId: String(fd.get("companyId") ?? ""),
        projectId: fd.get("projectId")?.toString() || null,
      })
    ).id;
  } catch (e) {
    return fail(e);
  }
  redirect(`/verbali/${id}`);
}

export async function requestUploadAction(
  id: string,
  file: { name: string; type: string; size: number },
): Promise<{ url?: string; key?: string; error?: string }> {
  const ctx = await ctxWithModule();
  try {
    return await requestAudioUpload(ctx, id, file);
  } catch (e) {
    return fail(e);
  }
}

/** Avvia l'elaborazione dopo la risposta: la pagina mostra «in corso» e si aggiorna da sola. */
async function process(id: string) {
  const ctx = await ctxWithModule();
  const job = await startProcessing(ctx, id);
  after(() => runProcessing(job));
  revalidatePath(`/verbali/${id}`);
}

export async function audioUploadedAction(id: string, key: string, recorded: boolean): Promise<Result> {
  const ctx = await ctxWithModule();
  try {
    await attachAudio(ctx, id, key, recorded ? "REGISTRAZIONE" : "AUDIO");
    await process(id);
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function transcriptAction(_prev: Result | undefined, fd: FormData): Promise<Result> {
  const ctx = await ctxWithModule();
  const id = String(fd.get("id"));
  try {
    await setTranscript(ctx, id, String(fd.get("transcript") ?? ""));
    await process(id);
    return {};
  } catch (e) {
    return fail(e);
  }
}

export async function retryAction(fd: FormData): Promise<void> {
  try {
    await process(String(fd.get("id")));
  } catch (e) {
    if (!(e instanceof MeetingError)) throw e;
  }
}

export async function confirmAction(_prev: Result | undefined, fd: FormData): Promise<Result> {
  const ctx = await ctxWithModule();
  const id = String(fd.get("id"));
  const keys = fd.getAll("keys").map(String);
  const decisions: Decision[] = keys.map((k) => {
    const get = (f: string) => fd.get(`${f}-${k}`)?.toString() ?? "";
    const priority = get("priority");
    return {
      include: fd.get(`include-${k}`) === "on",
      title: get("title"),
      assigneeId: get("assignee") || null,
      projectId: get("project") || null,
      dueDate: get("due") || null,
      priority: priority === "ALTA" || priority === "URGENTE" ? priority : "NORMALE",
    };
  });
  try {
    await confirmMeeting(ctx, id, decisions);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/verbali/${id}`);
  revalidatePath("/progetti", "layout");
  return {};
}

type TokenResult = Result & { token?: string; name?: string };

/** Crea il collegamento: il token torna una volta sola, da copiare nel servizio esterno. */
export async function createIntegrationAction(_prev: TokenResult | undefined, fd: FormData): Promise<TokenResult> {
  const ctx = await ctxWithModule();
  try {
    const { integration, token } = await createIntegration(ctx, {
      name: String(fd.get("name") ?? ""),
      companyId: String(fd.get("companyId") ?? ""),
      projectId: fd.get("projectId")?.toString() || null,
    });
    revalidatePath("/verbali/collegamenti");
    return { token, name: integration.name };
  } catch (e) {
    return fail(e);
  }
}

export async function disableIntegrationAction(fd: FormData): Promise<void> {
  const ctx = await ctxWithModule();
  try {
    await disableIntegration(ctx, String(fd.get("id")));
  } catch (e) {
    if (!(e instanceof MeetingError)) throw e;
  }
  revalidatePath("/verbali/collegamenti");
}
