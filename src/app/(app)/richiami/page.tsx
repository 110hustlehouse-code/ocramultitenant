import type { Metadata } from "next";
import Link from "next/link";
import { HandleCard, type Situation } from "@/components/reminders/HandleCard";
import { buttonClass } from "@/components/registry/ui";
import { integrations } from "@/env";
import { formatDay } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { requireModule } from "@/server/context";
import { canIn, roleIn } from "@/server/projects/service";
import { collaboratorSituation, remindersBoard } from "@/server/reminders/service";
import { viewCompanies } from "@/server/registry/service";
import { unblockAction } from "./actions";

export const metadata: Metadata = { title: "Richiami" };

const KIND = {
  AUTOMATICO: "Promemoria automatico",
  AL_PM: "Passato al PM",
  SOLLECITO: "Richiamo del PM",
  AL_CEO: "Passato al CEO",
  NON_POSSO: "«Non posso»",
} as const;

const TIME = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

export default async function Page() {
  const ctx = await requireModule("RICHIAMO");
  const manages = viewCompanies(ctx).some((c) => canIn(ctx, c.id, "reminders:manage"));

  if (!manages) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Richiami</h1>
        <p className="text-muted">
          Quando un tuo task arriva a scadenza ricevi un promemoria via email la mattina e, se è ancora aperto, il pomeriggio.
          Se c&apos;è un impedimento usa «Non posso» sul task: il project manager riceve il motivo e i promemoria si fermano.
        </p>
        <Link href="/progetti" className={buttonClass.secondary}>
          Vai ai tuoi task
        </Link>
      </div>
    );
  }

  const board = await remindersBoard(ctx);
  const blockedTasks = new Set(board.blocks.map((b) => b.task.id));
  const companyIds = [...new Set(board.toHandle.map((t) => t.project.companyId))];
  const [peopleByCompany, rolesByCompany] = await Promise.all([
    Promise.all(
      companyIds.map(async (id) => [
        id,
        await ctx.db.user.findMany({
          where: { active: true, memberships: { some: { companyId: id } } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ] as const),
    ).then((rows) => new Map(rows)),
    ctx.db.membership
      .findMany({ where: { companyId: { in: companyIds } }, select: { companyId: true, userId: true, role: true } })
      .then((rows) => new Map(rows.map((r) => [`${r.companyId}:${r.userId}`, r.role]))),
  ]);

  // Il CEO vede la situazione di chi ha task passati a lui.
  const forCeo = board.toHandle.filter((t) => t.escalation === 4 && t.assignee && canIn(ctx, t.project.companyId, "finance:read"));
  const situations = new Map<string, Situation>();
  for (const id of new Set(forCeo.map((t) => t.assignee!.id))) situations.set(id, await collaboratorSituation(ctx, id));
  const emailOn = integrations().email;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="label">Scadenze</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Richiami</h1>
        <p className="max-w-prose text-sm text-muted">
          Due promemoria automatici al collaboratore, poi il task arriva qui. Il blocco dell&apos;account lo decidi tu, mai il
          sistema, e si toglie da solo alla consegna.
        </p>
      </header>

      {!emailOn && (
        <p role="note" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">
          Email non ancora configurata: i promemoria vengono registrati ma non inviati. Il resto del flusso funziona.
        </p>
      )}

      <section aria-labelledby="handle-title" className="space-y-3">
        <h2 id="handle-title" className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Da gestire <span className="num text-muted">{board.toHandle.length}</span>
        </h2>
        {board.toHandle.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
            Niente da gestire: nessun task è andato oltre i due promemoria.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {board.toHandle.map((t) => {
              const role = t.assignee ? rolesByCompany.get(`${t.project.companyId}:${t.assignee.id}`) : undefined;
              return (
                <HandleCard
                  key={t.id}
                  people={peopleByCompany.get(t.project.companyId) ?? []}
                  canBlock={canIn(ctx, t.project.companyId, "hardblock:manage") && (role === "CREATIVE" || role === "EXTERNAL")}
                  canEscalate={t.escalation === 3 && roleIn(ctx, t.project.companyId) !== "CEO"}
                  situation={t.assignee ? situations.get(t.assignee.id) : undefined}
                  task={{
                    id: t.id,
                    title: t.title,
                    projectName: t.project.name,
                    projectHref: `/progetti/${t.project.id}`,
                    assigneeId: t.assignee?.id ?? null,
                    assigneeName: t.assignee?.name ?? null,
                    dueLabel: formatDay(t.dueDate),
                    dueInput: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "",
                    escalation: t.escalation,
                    blockerNote: t.blockerNote,
                    blocked: blockedTasks.has(t.id),
                  }}
                />
              );
            })}
          </ul>
        )}
      </section>

      {board.blocks.length > 0 && (
        <section aria-labelledby="blocks-title" className="space-y-3">
          <h2 id="blocks-title" className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Account bloccati <span className="num text-muted">{board.blocks.length}</span>
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {board.blocks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  <strong>{b.user.name}</strong> fino alla consegna di «{b.task.title}»
                  <span className="text-muted"> · da {b.blockedBy.name}, {TIME.format(b.createdAt)}</span>
                </span>
                <form action={unblockAction}>
                  <input type="hidden" name="blockId" value={b.id} />
                  <button type="submit" className={buttonClass.secondary}>
                    Sblocca
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="log-title" className="space-y-3">
        <h2 id="log-title" className="label">
          Ultimi richiami
        </h2>
        {board.recent.length === 0 ? (
          <p className="text-sm text-muted">Ancora nessun richiamo.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {board.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-x-2">
                <span className="num text-muted">{TIME.format(r.createdAt)}</span>
                <span>{KIND[r.kind]}</span>
                <span className="text-muted">
                  a {r.recipient.name} · «{r.task.title}»
                </span>
                <span className={cn("text-xs", r.delivered ? "text-ok" : "text-muted")}>{r.delivered ? "inviata" : "non inviata"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
