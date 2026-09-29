import { AlertTriangle, LoaderCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/meetings/AutoRefresh";
import { Markdown } from "@/components/meetings/Markdown";
import { MeetingInput } from "@/components/meetings/MeetingInput";
import { ProposalsForm } from "@/components/meetings/ProposalsForm";
import { buttonClass, CompanyTag } from "@/components/registry/ui";
import { integrations } from "@/env";
import { formatDay } from "@/lib/dates";
import { MEETING_SOURCE, MEETING_STATUS } from "@/lib/meetings";
import { cn } from "@/lib/cn";
import { requireModule } from "@/server/context";
import { getMeeting } from "@/server/meetings/service";
import { retryAction } from "../actions";

export const metadata: Metadata = { title: "Verbale" };
/** Trascrizione e verbale girano in background fino a 5 minuti (after + Server Actions della pagina). */
export const maxDuration = 300;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireModule("VERBALI");
  const meeting = await getMeeting(ctx, (await params).id);
  if (!meeting) notFound();
  const i = integrations();
  const c = meeting.company;
  const s = MEETING_STATUS[meeting.status];

  const [people, projects] =
    meeting.status === "DA_RIVEDERE" && meeting.canWrite
      ? await Promise.all([
          ctx.db.user.findMany({
            where: { active: true, memberships: { some: { companyId: meeting.companyId } } },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          ctx.db.project.findMany({
            where: { companyId: meeting.companyId, status: { in: ["ATTIVO", "IN_PAUSA"] } },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
        ])
      : [[], []];

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="flex flex-wrap items-center gap-2">
          <CompanyTag name={c.name} short={c.poPrefix ?? c.name} color={c.colorLight} />
          <span className={cn("label", s.tone)}>{s.label}</span>
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">{meeting.title}</h1>
        <p className="text-sm text-muted">
          {formatDay(meeting.heldAt)}
          {meeting.project && (
            <>
              {" · "}
              <Link href={`/progetti/${meeting.project.id}`} className="underline">
                {meeting.project.name}
              </Link>
            </>
          )}
          {meeting.durationSec && <> · {Math.round(meeting.durationSec / 60)} min</>}
          {meeting.source && <> · {MEETING_SOURCE[meeting.source]}</>}
        </p>
      </header>

      {meeting.status === "BOZZA" && meeting.canWrite && (
        <MeetingInput meetingId={meeting.id} audioEnabled={i.storage && i.transcription} />
      )}

      {meeting.status === "IN_ELABORAZIONE" && !meeting.stale && (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-border bg-surface p-5">
          <LoaderCircle className="size-5 animate-spin text-muted" aria-hidden />
          <div>
            <p className="font-semibold">
              {meeting.transcript ? "Sto scrivendo il verbale e cercando i task…" : "Sto trascrivendo la riunione…"}
            </p>
            <p className="text-sm text-muted">Di solito 1-3 minuti. Puoi chiudere la pagina: il lavoro continua.</p>
          </div>
          <AutoRefresh />
        </div>
      )}

      {(meeting.status === "ERRORE" || meeting.stale) && (
        <div role="alert" className="space-y-3 rounded-xl border border-danger/40 bg-danger/10 p-5">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 text-danger" aria-hidden /> Elaborazione non riuscita
          </p>
          <p className="text-sm">
            {meeting.stale ? "L'elaborazione si è interrotta prima di finire. Audio e testo sono salvati: puoi riprovare." : meeting.error}
          </p>
          {meeting.canWrite && (
            <form action={retryAction}>
              <input type="hidden" name="id" value={meeting.id} />
              <button type="submit" className={buttonClass.secondary}>
                Riprova
              </button>
            </form>
          )}
        </div>
      )}

      {meeting.status === "DA_RIVEDERE" && meeting.canWrite && (
        <section aria-labelledby="proposals-title" className="space-y-3">
          <h2 id="proposals-title" className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Task proposti <span className="num text-muted">{meeting.proposals.length}</span>
          </h2>
          <p className="text-sm text-muted">Controlla a chi vanno e per quando. Togli la spunta a quelli da non creare.</p>
          <ProposalsForm meetingId={meeting.id} proposals={meeting.proposals} people={people} projects={projects} />
        </section>
      )}

      {meeting.status === "CONFERMATO" && meeting.tasks.length > 0 && (
        <section aria-labelledby="created-title" className="space-y-3">
          <h2 id="created-title" className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Task creati <span className="num text-muted">{meeting.tasks.length}</span>
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {meeting.tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-semibold">{t.title}</span>
                <span className="text-muted">
                  {t.assignee?.name ?? "Non assegnato"} ·{" "}
                  <Link href={`/progetti/${t.project.id}`} className="underline">
                    {t.project.name}
                  </Link>
                  {t.dueDate && <> · entro {formatDay(t.dueDate)}</>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {meeting.minutes && (
        <section aria-labelledby="minutes-title" className="space-y-3">
          <h2 id="minutes-title" className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Verbale
          </h2>
          <div className="rounded-xl border border-border bg-surface p-5">
            <Markdown source={meeting.minutes} />
          </div>
        </section>
      )}

      {meeting.transcript && (
        <details className="rounded-xl border border-border bg-surface p-5">
          <summary className="cursor-pointer font-semibold">Trascrizione completa</summary>
          <pre className="mt-3 max-h-[60vh] overflow-auto font-sans text-sm whitespace-pre-wrap text-muted">
            {meeting.transcript}
          </pre>
        </details>
      )}
    </div>
  );
}
