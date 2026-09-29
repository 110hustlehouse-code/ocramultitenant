import "server-only";
import type { Meeting, MeetingSource, Prisma } from "@/generated/prisma/client";
import type { AppContext } from "@/server/context";
import { prisma } from "@/server/db/client";
import { tenantExtension } from "@/server/db/tenant";
import { downloadUrl, objectKey, uploadUrl } from "@/server/integrations/storage";
import { transcribeUrl } from "@/server/integrations/deepgram";
import { canIn } from "@/server/projects/service";
import { parseDay } from "@/server/projects/input";
import { viewCompanies } from "@/server/registry/service";
import { writeMinutes } from "./claude";
import { proposalsSchema, type Proposal } from "./extract";
import { MAX_STORED_TRANSCRIPT_CHARS } from "./inbound";

export class MeetingError extends Error {}

const AUDIO_TYPES = /^(audio\/|video\/(mp4|webm|quicktime))/;
export const MAX_AUDIO_BYTES = 500 * 1024 * 1024;

/**
 * Oltre questo tempo un'elaborazione «in corso» è di sicuro interrotta (la funzione ha un limite
 * di 5 minuti): si può riprovare invece di restare bloccati.
 */
export const STALE_PROCESSING_MS = 10 * 60 * 1000;

export function isStale(meeting: Pick<Meeting, "status" | "updatedAt">, now = new Date()): boolean {
  return meeting.status === "IN_ELABORAZIONE" && now.getTime() - meeting.updatedAt.getTime() > STALE_PROCESSING_MS;
}

function readable(ctx: AppContext, companies = ctx.companies): Prisma.MeetingWhereInput {
  return { companyId: { in: companies.filter((c) => canIn(ctx, c.id, "meetings:read")).map((c) => c.id) } };
}

export async function listMeetings(ctx: AppContext) {
  return ctx.db.meeting.findMany({
    where: readable(ctx, viewCompanies(ctx)),
    include: {
      project: { select: { id: true, name: true } },
      _count: { select: { tasks: true } },
    },
    orderBy: { heldAt: "desc" },
    take: 200,
  });
}

export async function getMeeting(ctx: AppContext, id: string) {
  const meeting = await ctx.db.meeting.findFirst({
    where: { AND: [{ id }, readable(ctx)] },
    include: {
      company: true,
      project: { select: { id: true, name: true } },
      tasks: { include: { assignee: { select: { name: true } }, project: { select: { id: true, name: true } } } },
    },
  });
  if (!meeting) return null;
  const stale = isStale(meeting);
  const proposals = meeting.proposals ? proposalsSchema.safeParse(meeting.proposals) : null;
  return {
    ...meeting,
    proposals: proposals?.success ? proposals.data : [],
    stale,
    canWrite: canIn(ctx, meeting.companyId, "meetings:write"),
  };
}

async function writable(ctx: AppContext, id: string) {
  const meeting = await ctx.db.meeting.findFirst({ where: { AND: [{ id }, readable(ctx)] } });
  if (!meeting || !canIn(ctx, meeting.companyId, "meetings:write")) throw new MeetingError("Verbale non trovato.");
  return meeting;
}

export async function createMeeting(
  ctx: AppContext,
  input: { title: string; heldAt: string; companyId: string; projectId: string | null },
) {
  if (!canIn(ctx, input.companyId, "meetings:write")) throw new MeetingError("Non puoi creare verbali per questa società.");
  const title = input.title.trim();
  if (title.length < 2) throw new MeetingError("Dai un titolo alla riunione.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.heldAt)) throw new MeetingError("Data non valida.");
  if (input.projectId) {
    const ok = await ctx.db.project.count({ where: { id: input.projectId, companyId: input.companyId } });
    if (!ok) throw new MeetingError("Progetto non valido per questa società.");
  }
  return ctx.db.meeting.create({
    data: {
      tenantId: ctx.tenant.id,
      companyId: input.companyId,
      projectId: input.projectId,
      title,
      heldAt: parseDay(input.heldAt),
      createdById: ctx.user.id,
    },
  });
}

/** URL firmato per caricare l'audio direttamente su R2 dal browser. */
export async function requestAudioUpload(ctx: AppContext, id: string, file: { name: string; type: string; size: number }) {
  const meeting = await writable(ctx, id);
  if (!AUDIO_TYPES.test(file.type)) throw new MeetingError("Formato non supportato: carica un file audio (mp3, m4a, wav, webm…).");
  if (file.size > MAX_AUDIO_BYTES) throw new MeetingError("File troppo grande (massimo 500 MB).");
  const key = objectKey(ctx.tenant.id, "meetings", meeting.id, file.name);
  return { key, url: await uploadUrl(key, file.type) };
}

/** Il browser ha finito di caricare: si registra la chiave (solo se è di questo verbale). */
export async function attachAudio(
  ctx: AppContext,
  id: string,
  key: string,
  source: Extract<MeetingSource, "REGISTRAZIONE" | "AUDIO"> = "AUDIO",
) {
  const meeting = await writable(ctx, id);
  if (!key.startsWith(`${ctx.tenant.id}/meetings/${meeting.id}/`)) throw new MeetingError("File non valido.");
  await ctx.db.meeting.update({ where: { id }, data: { audioKey: key, transcript: null, source, error: null } });
}

export async function setTranscript(ctx: AppContext, id: string, text: string) {
  await writable(ctx, id);
  const transcript = text.trim();
  if (transcript.length < 50) throw new MeetingError("La trascrizione è troppo corta.");
  await ctx.db.meeting.update({
    where: { id },
    data: { transcript: transcript.slice(0, MAX_STORED_TRANSCRIPT_CHARS), source: "TESTO", error: null },
  });
}

/** Segna il verbale come in elaborazione e restituisce i dati per il lavoro in background. */
export async function startProcessing(ctx: AppContext, id: string) {
  const meeting = await writable(ctx, id);
  if (meeting.status === "IN_ELABORAZIONE" && !isStale(meeting)) throw new MeetingError("Elaborazione già in corso.");
  if (meeting.status === "CONFERMATO") throw new MeetingError("Verbale già confermato.");
  if (!meeting.transcript && !meeting.audioKey) throw new MeetingError("Manca l'audio o la trascrizione.");
  await ctx.db.meeting.update({ where: { id }, data: { status: "IN_ELABORAZIONE", error: null } });
  return { tenantId: ctx.tenant.id, meetingId: id };
}

/** Il verbale lo scrive OCRA; si dice per conto di chi (o da quale collegamento) è partito. */
export function verbalizer(m: { createdBy: { name: string } | null; integration: { name: string } | null }): string {
  if (m.createdBy) return `OCRA, per ${m.createdBy.name}`;
  if (m.integration) return `OCRA, da «${m.integration.name}»`;
  return "OCRA";
}

export type ProcessingDeps = {
  transcribe: (url: string) => Promise<{ text: string; durationSec: number | null }>;
  signedUrl: (key: string) => Promise<string>;
  minutes: typeof writeMinutes;
};

const realDeps: ProcessingDeps = { transcribe: transcribeUrl, signedUrl: (k) => downloadUrl(k), minutes: writeMinutes };

/**
 * Lavoro lungo (fino a qualche minuto): trascrizione se serve, poi verbale e task proposti.
 * Gira dopo la risposta (after), quindi usa un client legato al tenant, non la richiesta.
 */
export async function runProcessing(job: { tenantId: string; meetingId: string }, deps: ProcessingDeps = realDeps) {
  const db = prisma.$extends(tenantExtension(job.tenantId));
  try {
    const meeting = await db.meeting.findFirstOrThrow({
      where: { id: job.meetingId },
      include: { createdBy: { select: { name: true } }, integration: { select: { name: true } } },
    });
    let transcript = meeting.transcript;
    let durationSec = meeting.durationSec;
    if (!transcript && meeting.audioKey) {
      const result = await deps.transcribe(await deps.signedUrl(meeting.audioKey));
      transcript = result.text;
      durationSec = result.durationSec;
      await db.meeting.update({ where: { id: meeting.id }, data: { transcript, durationSec: result.durationSec } });
    }
    if (!transcript) throw new MeetingError("Manca la trascrizione.");

    const [people, projects] = await Promise.all([
      db.user.findMany({
        where: { active: true, memberships: { some: { companyId: meeting.companyId } } },
        select: { id: true, name: true },
      }),
      db.project.findMany({
        where: { companyId: meeting.companyId, status: { in: ["ATTIVO", "IN_PAUSA"] } },
        select: { id: true, name: true, client: { select: { name: true } } },
      }),
    ]);
    const out = await deps.minutes({
      title: meeting.title,
      heldAt: meeting.heldAt,
      transcript,
      people,
      projects: projects.map((p) => ({ id: p.id, name: p.name, client: p.client?.name ?? null })),
      defaultProjectId: meeting.projectId,
      durationSec,
      verbalizer: verbalizer(meeting),
    });
    await db.meeting.update({
      where: { id: meeting.id },
      data: { minutes: out.minutes, proposals: out.proposals, status: "DA_RIVEDERE", error: null },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Errore sconosciuto";
    await db.meeting.update({
      where: { id: job.meetingId },
      data: { status: "ERRORE", error: message.slice(0, 500) },
    });
  }
}

export type Decision = Pick<Proposal, "title" | "assigneeId" | "projectId" | "dueDate" | "priority"> & { include: boolean };

/**
 * Il PM conferma: i task spuntati diventano task veri (origine VERBALE) nei progetti scelti.
 * Tutto in una transazione: o si creano tutti o nessuno.
 */
export async function confirmMeeting(ctx: AppContext, id: string, decisions: Decision[]) {
  const meeting = await writable(ctx, id);
  if (meeting.status !== "DA_RIVEDERE") throw new MeetingError("Il verbale non è pronto da confermare.");
  const chosen = decisions.filter((d) => d.include);
  const errors: string[] = [];

  const projectIds = [...new Set(chosen.map((d) => d.projectId).filter((p): p is string => Boolean(p)))];
  const projects = await ctx.db.project.findMany({ where: { id: { in: projectIds }, companyId: meeting.companyId } });
  const members = await ctx.db.membership.findMany({ where: { companyId: meeting.companyId }, select: { userId: true } });
  const allowedUsers = new Set(members.map((m) => m.userId));

  chosen.forEach((d, i) => {
    const n = i + 1;
    if (d.title.trim().length < 2) errors.push(`Task ${n}: manca il titolo.`);
    if (!d.projectId) errors.push(`Task ${n}: scegli il progetto.`);
    else if (!projects.some((p) => p.id === d.projectId)) errors.push(`Task ${n}: progetto non valido.`);
    if (d.assigneeId && !allowedUsers.has(d.assigneeId)) errors.push(`Task ${n}: persona non valida.`);
    if (d.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(d.dueDate)) errors.push(`Task ${n}: data non valida.`);
  });
  for (const p of projects) {
    if (!canIn(ctx, p.companyId, "projects:write")) errors.push(`Non puoi aggiungere task a «${p.name}».`);
  }
  if (errors.length) throw new MeetingError(errors.join(" "));

  await ctx.db.$transaction(async (tx) => {
    for (const d of chosen) {
      await tx.task.create({
        data: {
          tenantId: ctx.tenant.id,
          projectId: d.projectId!,
          meetingId: meeting.id,
          source: "VERBALE",
          title: d.title.trim().slice(0, 300),
          assigneeId: d.assigneeId,
          dueDate: d.dueDate ? parseDay(d.dueDate) : null,
          priority: d.priority,
        },
      });
      if (d.assigneeId) {
        await tx.projectMember.createMany({
          data: [{ tenantId: ctx.tenant.id, projectId: d.projectId!, userId: d.assigneeId }],
          skipDuplicates: true,
        });
      }
    }
    await tx.meeting.update({ where: { id }, data: { status: "CONFERMATO", confirmedAt: new Date() } });
  });
  return chosen.length;
}

/** Riprova dopo un errore: torna in bozza mantenendo audio e trascrizione. */
export async function resetMeeting(ctx: AppContext, id: string) {
  const meeting = await writable(ctx, id);
  if (meeting.status === "CONFERMATO") throw new MeetingError("Verbale già confermato.");
  await ctx.db.meeting.update({ where: { id }, data: { status: "BOZZA", error: null } });
}

