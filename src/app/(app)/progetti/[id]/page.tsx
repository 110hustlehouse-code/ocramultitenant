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
import { formatEuro } from "@/lib/quotes";
import { activeFollowUpsFor, canStartFollowUp } from "@/server/followups/service";
import { budgetLineLabels } from "@/server/margine/service";
import { projectBudget } from "@/server/quotes/service";
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
  const [followUps, budget, budgetLines] = await Promise.all([
    activeFollowUpsFor(ctx, open.map((t) => t.id)),
    projectBudget(ctx, project.id, project.companyId),
    budgetLineLabels(ctx, project.id, project.companyId),
  ]);
  const client = project.client;
  const followUpStart = (t: (typeof project.tasks)[number]) =>
    client && canStartFollowUp(ctx, t, project.companyId, true)
      ? {
          clientName: client.name,
          contactName: client.contactName,
          contactEmail: client.email,
          projectName: project.name,
          companyName: c.name,
          senderName: ctx.user.name,
        }
      : null;

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
        followUp: followUps.get(t.id) ?? null,
        followUpStart: t.status === "DA_FARE" ? followUpStart(t) : null,
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

      {budget && budget.lines.length > 0 && (
        <section aria-labelledby="budget-title" className="space-y-3">
          <h2 id="budget-title" className="flex flex-wrap items-center gap-3 font-[family-name:var(--font-display)] text-lg font-semibold">
            Budget
            {budget.quote && (
              <a href={`/preventivi/${budget.quote.id}`} className="text-sm font-normal text-muted underline">
                dal preventivo n. {budget.quote.number}
              </a>
            )}
            {budget.quote && !budget.quote.contractSignedAt && <span className="label text-warn">contratto da firmare</span>}
            {budget.quote && !budget.quote.depositReceivedAt && <span className="label text-warn">acconto da ricevere</span>}
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="label px-4 py-2 font-normal">Voce</th>
                  <th className="label px-4 py-2 text-right font-normal">Ricavo previsto</th>
                  <th className="label px-4 py-2 text-right font-normal">Costo previsto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {budget.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2">{l.description}</td>
                    <td className="num px-4 py-2 text-right">{formatEuro(l.revenue)}</td>
                    <td className="num px-4 py-2 text-right text-muted">{l.plannedCost !== null ? formatEuro(l.plannedCost) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border font-semibold">
                <tr>
                  <td className="px-4 py-2">Totale (IVA esclusa)</td>
                  <td className="num px-4 py-2 text-right">{formatEuro(budget.revenue)}</td>
                  <td className="num px-4 py-2 text-right">{budget.hasCosts ? formatEuro(budget.plannedCost) : "—"}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {budget.hasCosts && (
            <p className="text-sm text-muted">
              Margine previsto: <span className="num font-semibold text-text">{formatEuro(budget.revenue - budget.plannedCost)}</span>.{" "}
              {ctx.tenant.modules.includes("MARGINE") ? (
                <a href={`/margine/${project.id}`} className="underline">Vedi il margine reale, in continuo</a>
              ) : (
                "I costi reali contro questo budget arrivano con il modulo Margine."
              )}
            </p>
          )}
        </section>
      )}

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
          {project.canManage && <NewTaskForm projectId={project.id} people={people} budgetLines={budgetLines} />}
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
