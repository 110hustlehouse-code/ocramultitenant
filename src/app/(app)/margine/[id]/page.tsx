import { AlertTriangle, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddCostForm } from "@/components/margine/AddCostForm";
import { buttonClass } from "@/components/registry/ui";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { formatEuro } from "@/lib/quotes";
import { requireModule } from "@/server/context";
import { MarginError, payeesFor, projectMargin } from "@/server/margine/service";
import { deleteCostAction } from "../actions";

export const metadata: Metadata = { title: "Margine progetto" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireModule("MARGINE");
  const { id } = await params;
  let margin: Awaited<ReturnType<typeof projectMargin>>;
  try {
    margin = await projectMargin(ctx, id);
  } catch (e) {
    if (e instanceof MarginError) notFound();
    throw e;
  }
  const { project, lines, costs, atRisk, ...summary } = margin;
  const payees = await payeesFor(ctx, project.companyId);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Link href="/margine" className="label underline">Margine</Link>
        <h1 className="flex items-center gap-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
          {project.name}
          {atRisk && (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-3 py-1 text-sm font-semibold text-danger">
              <AlertTriangle className="size-4" aria-hidden /> Da guardare
            </span>
          )}
        </h1>
        <Link href={`/progetti/${project.id}`} className="text-sm text-muted underline">Apri il progetto</Link>
      </header>

      <dl className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-4">
        {[
          ["Ricavo previsto", formatEuro(summary.revenue)],
          ["Costo previsto", formatEuro(summary.plannedCost)],
          ["Costo reale", formatEuro(summary.actualCost)],
          ["Margine attuale", formatEuro(summary.marginActual)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="label">{label}</dt>
            <dd className={cn("num mt-1 text-xl font-bold", label === "Margine attuale" && (summary.marginActual < summary.marginPlanned ? "text-danger" : "text-ok"))}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <section className="space-y-2">
        <h2 className="label">Voci di budget</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {lines.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="font-semibold">{l.description}</p>
                <p className="text-xs text-muted">
                  Ricavo <span className="num">{formatEuro(l.revenue)}</span>
                  {l.plannedCost != null && <> · costo previsto <span className="num">{formatEuro(l.plannedCost)}</span></>}
                  {l.tasksTotal > 0 && (
                    <>
                      {" "}
                      · <span className="num">{l.tasksDone}</span>/<span className="num">{l.tasksTotal}</span> task fatti
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="label">Costi reali registrati</h2>
        <AddCostForm projectId={project.id} lines={lines.map((l) => ({ id: l.id, description: l.description }))} payees={payees} />
        {costs.length === 0 ? (
          <p className="text-sm text-muted">Nessun costo registrato.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {costs.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.description}</p>
                  <p className="text-xs text-muted">
                    {formatDay(c.incurredAt)} · {c.createdBy?.name ?? "—"}
                    {c.budgetLine && <> · {c.budgetLine.description}</>}
                    {c.party && <> · pagato a {c.party.name}</>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="num font-semibold">{formatEuro(c.amount)}</span>
                  <form action={deleteCostAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <button type="submit" title="Elimina" aria-label="Elimina costo" className={buttonClass.secondary}>
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

