import { Mic, Pencil } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewTaskForm } from "@/components/projects/NewTaskForm";
import { TaskRow } from "@/components/projects/TaskRow";
import { buttonClass, ButtonLink, CompanyTag } from "@/components/registry/ui";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { requireModule } from "@/server/context";
import { isOverdue, STATUS_LABELS } from "@/server/projects/input";
import { assignableUsers, getProject } from "@/server/projects/service";
import { setProjectStatusAction } from "../actions";

export const metadata: Metadata = { title: "Progetto" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireModule("PROGETTI");
  const project = await getProject(ctx, (await params).id);
  if (!project) notFound();
  const people = project.canManage ? await assignableUsers(ctx, project.companyId) : [];
  const open = project.tasks.filter((t) => t.status === "DA_FARE");
  const done = project.tasks.filter((t) => t.status === "FATTO");
  const overdue = open.filter((t) => isOverdue(t)).length;
  const c = project.company;

  const facts: Array<[string, string | null]> = [
    ["Cliente", project.client?.name ?? "Interno"],
    ["Servizio", project.service],
    ["Codice PO", project.code],
    ["Project manager", project.manager?.name ?? null],
    ["Inizio", formatDay(project.startDate)],
    ["Consegna", formatDay(project.dueDate)],
  ];

  const row = (t: (typeof project.tasks)[number]) => (
    <TaskRow
      key={t.id}
      canManage={project.canManage}
      canComplete={project.canManage || t.assigneeId === ctx.user.id}
      own={t.assigneeId === ctx.user.id}
      task={{
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueLabel: formatDay(t.dueDate),
        overdue: isOverdue(t),
        assigneeName: t.assignee?.name ?? null,
        proof: t.proof,
        completedByName: t.completedBy?.name ?? null,
        blockerNote: t.blockerNote,
        escalation: t.escalation,
      }}
    />
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="flex items-center gap-2">
            <CompanyTag name={c.name} short={c.poPrefix ?? c.name} color={c.colorLight} />
            <span className="label">{STATUS_LABELS[project.status]}</span>
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">{project.name}</h1>
        </div>
        {project.canManage && (
          <div className="flex flex-wrap gap-2">
            <form action={setProjectStatusAction} className="flex gap-2">
              <input type="hidden" name="id" value={project.id} />
              {project.status === "ATTIVO" ? (
                <>
                  <button name="status" value="IN_PAUSA" className={buttonClass.secondary}>
                    Metti in pausa
                  </button>
                  <button name="status" value="CHIUSO" className={buttonClass.secondary}>
                    Chiudi progetto
                  </button>
                </>
              ) : (
                <button name="status" value="ATTIVO" className={buttonClass.secondary}>
                  Riapri
                </button>
              )}
            </form>
            <ButtonLink href={`/verbali/nuovo?progetto=${project.id}`}>
              <Mic className="size-4" aria-hidden /> Riunione
            </ButtonLink>
            <ButtonLink href={`/progetti/${project.id}/modifica`}>
              <Pencil className="size-4" aria-hidden /> Modifica
            </ButtonLink>
          </div>
        )}
      </header>

      <dl className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="label">{label}</dt>
            <dd className="mt-1">{value || "—"}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="tasks-title" className="space-y-3">
        <h2 id="tasks-title" className="flex items-center gap-3 font-[family-name:var(--font-display)] text-lg font-semibold">
          Task
          <span className="num text-sm font-normal text-muted">
            {open.length} aperti · {done.length} fatti
          </span>
          {overdue > 0 && (
            <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
              <span className="num">{overdue}</span> scaduti
            </span>
          )}
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {project.tasks.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              {project.canManage
                ? "Nessun task. Aggiungili qui sotto, o arriveranno dai verbali delle riunioni."
                : "Nessun task assegnato a te in questo progetto."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {open.map(row)}
              {done.map(row)}
            </ul>
          )}
          {project.canManage && <NewTaskForm projectId={project.id} people={people} />}
        </div>
      </section>

      {project.members.length > 0 && (
        <section aria-labelledby="team-title" className="space-y-2">
          <h2 id="team-title" className="label">
            Team
          </h2>
          <p className={cn("flex flex-wrap gap-2 text-sm")}>
            {project.members.map((m) => (
              <span key={m.userId} className="rounded-full border border-border px-3 py-1">
                {m.user.name}
              </span>
            ))}
          </p>
        </section>
      )}

      {project.notes && (
        <section className="space-y-2">
          <h2 className="label">Note</h2>
          <p className="whitespace-pre-wrap text-sm">{project.notes}</p>
        </section>
      )}
    </div>
  );
}
