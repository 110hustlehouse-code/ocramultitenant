import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, CompanyTag, inputClass } from "@/components/registry/ui";
import { cn } from "@/lib/cn";
import { requireModule } from "@/server/context";
import { collaboratorKindFromParam, PARAM_BY_KIND } from "@/server/registry/input";
import { countParties, listParties, writableCompanies } from "@/server/registry/service";

export const metadata: Metadata = { title: "Collaboratori" };

const TABS = ["COLLABORATORE_ESTERNO", "COLLABORATORE_INTERNO"] as const;
const TAB_LABEL = { COLLABORATORE_ESTERNO: "Esterni", COLLABORATORE_INTERNO: "Interni" } as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ tipo?: string; q?: string }> }) {
  const ctx = await requireModule("COLLABORATORI");
  const params = await searchParams;
  const kind = collaboratorKindFromParam(params.tipo);
  const tipo = PARAM_BY_KIND[kind];
  const q = params.q ?? "";

  const [parties, counts] = await Promise.all([listParties(ctx, kind, q), countParties(ctx)]);
  const canWrite = writableCompanies(ctx).length > 0;
  const companies = new Map(ctx.companies.map((c) => [c.id, c]));
  const noun = kind === "COLLABORATORE_INTERNO" ? "collaboratore interno" : "collaboratore esterno";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Rubrica</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Collaboratori</h1>
        </div>
        {canWrite && (
          <ButtonLink href={`/collaboratori/nuovo?tipo=${tipo}`} variant="primary">
            <Plus className="size-4" aria-hidden /> Nuovo {noun}
          </ButtonLink>
        )}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Tipo di collaboratore" className="inline-flex rounded-lg border border-border bg-surface p-1">
          {TABS.map((k) => (
            <Link
              key={k}
              href={`/collaboratori?tipo=${PARAM_BY_KIND[k]}`}
              aria-current={k === kind ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold",
                k === kind ? "bg-brand text-on-brand" : "text-muted hover:text-text",
              )}
            >
              {TAB_LABEL[k]} <span className="num opacity-80">{counts[k]}</span>
            </Link>
          ))}
        </nav>
        <form className="relative w-full sm:w-72" role="search">
          <input type="hidden" name="tipo" value={tipo} />
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted" aria-hidden />
          <input
            name="q"
            defaultValue={q}
            placeholder="Cerca nome, P.IVA, referente…"
            aria-label="Cerca"
            className={cn(inputClass, "pl-9")}
          />
        </form>
      </div>

      {parties.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="font-semibold">{q ? "Nessun risultato." : `Nessun ${noun} ancora.`}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {parties.map((p) => (
            <li key={p.id}>
              <Link
                href={`/collaboratori/${p.id}`}
                className="grid gap-2 px-4 py-3 hover:bg-surface-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto] md:items-center md:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.name}</p>
                  {p.categories.length > 0 && <p className="truncate text-xs text-muted">{p.categories.join(" · ")}</p>}
                </div>
                <p className={cn("num truncate text-sm text-muted", !(p.vatNumber ?? p.taxCode) && "hidden md:block")}>
                  {p.vatNumber ?? p.taxCode ?? "—"}
                </p>
                <div className="min-w-0 text-sm">
                  <p className="truncate">{p.contactName ?? <span className="text-muted">Nessun referente</span>}</p>
                  <p className="truncate text-xs text-muted">{[p.email, p.phone].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.companies.map(({ companyId }) => {
                    const c = companies.get(companyId);
                    return c ? (
                      <CompanyTag key={companyId} name={c.name} short={c.poPrefix ?? c.name} color={c.colorLight} />
                    ) : null;
                  })}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
