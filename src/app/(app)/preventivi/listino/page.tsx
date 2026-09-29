import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServiceItemForm } from "@/components/quotes/QuoteForms";
import { buttonClass, CompanyTag } from "@/components/registry/ui";
import { cn } from "@/lib/cn";
import { formatEuro } from "@/lib/quotes";
import { requireModule } from "@/server/context";
import { listServiceItems, quoteCompanies } from "@/server/quotes/service";
import { toggleServiceItemAction } from "../actions";

export const metadata: Metadata = { title: "Listino" };

/** Listino per società: le voci da cui si compongono i preventivi (anche con Claude). */
export default async function Page() {
  const ctx = await requireModule("PREVENTIVI");
  const companies = quoteCompanies(ctx);
  if (companies.length === 0) notFound();
  const lists = await Promise.all(companies.map(async (c) => ({ company: c, items: await listServiceItems(ctx, c.id, { all: true }) })));

  return (
    <div className="space-y-8">
      <header>
        <p className="label">Preventivi</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Listino</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Voci, unità e prezzi della società. La sigla PO entra nel codice del progetto (es. EVENTI); il costo previsto è
          interno e prepara il budget per il margine. Le voci non si cancellano: si disattivano.
        </p>
      </header>

      {lists.map(({ company: c, items }) => (
        <section key={c.id} aria-labelledby={`list-${c.id}`} className="space-y-3">
          <h2 id={`list-${c.id}`} className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-semibold">
            <CompanyTag name={c.name} short={c.poPrefix ?? c.name} color={c.colorLight} /> {c.name}
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {items.map((i) => (
              <li key={i.id} className={cn("px-4 py-3", !i.active && "opacity-60")}>
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                    <span>
                      <span className="font-semibold">{i.name}</span>{" "}
                      <span className="font-mono text-xs text-muted">{i.poCode}</span>
                      {!i.active && <span className="label"> · disattivata</span>}
                    </span>
                    <span className="num text-sm">
                      {formatEuro(i.unitPrice)} / {i.unit}
                      {i.unitCost !== null && <span className="text-muted"> · costo {formatEuro(i.unitCost)}</span>}
                    </span>
                  </summary>
                  <div className="mt-3 space-y-3">
                    <ServiceItemForm companyId={c.id} item={i} />
                    <form action={toggleServiceItemAction}>
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="active" value={i.active ? "0" : "1"} />
                      <button type="submit" className={buttonClass.secondary}>
                        {i.active ? "Disattiva" : "Riattiva"}
                      </button>
                    </form>
                  </div>
                </details>
              </li>
            ))}
            <li className="px-4 py-4">
              <p className="label mb-2">Nuova voce</p>
              <ServiceItemForm companyId={c.id} />
            </li>
          </ul>
        </section>
      ))}
    </div>
  );
}
