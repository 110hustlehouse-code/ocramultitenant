import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CompanyTag } from "@/components/registry/ui";
import { cn } from "@/lib/cn";
import { formatEuro } from "@/lib/quotes";
import { requireModule } from "@/server/context";
import { marginBoard, marginCompanies } from "@/server/margine/service";
import { STATUS_LABELS } from "@/server/projects/input";

export const metadata: Metadata = { title: "Margine" };

function MarginCell({ planned, actual }: { planned: number; actual: number }) {
  const down = actual < planned;
  return (
    <span className={cn("num font-semibold", down ? "text-danger" : "text-ok")}>
      {formatEuro(actual)} <span className="text-xs font-normal text-muted">(previsto {formatEuro(planned)})</span>
    </span>
  );
}

export default async function Page() {
  const ctx = await requireModule("MARGINE");
  const companies = new Map(marginCompanies(ctx).map((c) => [c.id, c]));
  const { rows, byCompany, group } = await marginBoard(ctx);

  return (
    <div className="space-y-8">
      <header>
        <p className="label">Modulo · passo 7 · solo CEO</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Margine</h1>
        <p className="mt-2 max-w-prose text-muted">
          Ricavo previsto contro costi reali, in continuo, per progetto, società e gruppo. In soldi e in task consegnati: nessun timesheet.
        </p>
      </header>

      {group && (
        <section className="rounded-xl border border-border bg-surface p-5">
          <p className="label">Gruppo</p>
          <p className="mt-1 text-2xl font-bold">
            <MarginCell planned={group.marginPlanned} actual={group.marginActual} />
          </p>
          <p className="num mt-1 text-sm text-muted">
            Ricavo {formatEuro(group.revenue)} · costo {formatEuro(group.actualCost)} (previsto {formatEuro(group.plannedCost)})
          </p>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {byCompany.map((c) => (
          <div key={c.companyId} className="rounded-xl border border-border bg-surface p-4">
            <p className="label">{c.name}</p>
            <p className="mt-1 text-lg font-bold">
              <MarginCell planned={c.marginPlanned} actual={c.marginActual} />
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="label">Progetti aperti</h2>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted">
            Nessun progetto con budget da un preventivo accettato.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {rows.map((r) => {
              const c = companies.get(r.companyId);
              return (
                <li key={r.id}>
                  <Link
                    href={`/margine/${r.id}`}
                    className="grid gap-2 px-4 py-3 hover:bg-surface-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate font-semibold">
                        {r.name}
                        {r.atRisk && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                            <AlertTriangle className="size-3.5" aria-hidden /> Da guardare
                          </span>
                        )}
                      </p>
                      <p className="flex items-center gap-2 text-xs text-muted">
                        {c && <CompanyTag name={c.name} short={c.poPrefix ?? c.name} color={c.colorLight} />}
                        {STATUS_LABELS[r.status]}
                      </p>
                    </div>
                    <p className="text-sm text-muted">
                      Costo <span className="num text-text">{formatEuro(r.actualCost)}</span> / previsto <span className="num">{formatEuro(r.plannedCost)}</span>
                    </p>
                    <MarginCell planned={r.marginPlanned} actual={r.marginActual} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
