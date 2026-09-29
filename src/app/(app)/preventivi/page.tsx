import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NewQuoteForm } from "@/components/quotes/QuoteForms";
import { ButtonLink, CompanyTag } from "@/components/registry/ui";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { formatEuro, QUOTE_STATUS, quoteLabel } from "@/lib/quotes";
import { requireModule } from "@/server/context";
import { listQuotes, quoteCompanies } from "@/server/quotes/service";

export const metadata: Metadata = { title: "Preventivi" };

export default async function Page() {
  const ctx = await requireModule("PREVENTIVI");
  const companies = quoteCompanies(ctx);
  const [quotes, clients] = await Promise.all([
    listQuotes(ctx),
    ctx.db.party.findMany({
      where: { kind: "CLIENTE", active: true, companies: { some: { companyId: { in: companies.map((c) => c.id) } } } },
      select: { id: true, name: true, companies: { select: { companyId: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const byId = new Map(ctx.companies.map((c) => [c.id, c]));
  const open = quotes.filter((q) => q.status === "INVIATO");
  const openTotal = open.reduce((s, q) => s + q.total, 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Commerciale</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Preventivi</h1>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Dal brief alle voci con il listino della società, poi il PDF. Quando il cliente accetta nasce il progetto, con le
            voci come budget.
          </p>
        </div>
        <ButtonLink href="/preventivi/listino">
          <ListChecks className="size-4" aria-hidden /> Listino
        </ButtonLink>
      </header>

      {companies.length > 0 && (
        <NewQuoteForm
          companies={companies.map(({ id, name }) => ({ id, name }))}
          clients={clients.map((c) => ({ id: c.id, name: c.name, companyIds: c.companies.map((x) => x.companyId) }))}
        />
      )}

      {open.length > 0 && (
        <p className="text-sm">
          In attesa di risposta: <span className="num font-semibold">{open.length}</span> preventivi per{" "}
          <span className="num font-semibold">{formatEuro(openTotal)}</span> (IVA inclusa)
        </p>
      )}

      {quotes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="font-semibold">Nessun preventivo ancora.</p>
          <p className="mt-1 text-sm text-muted">Prima controlla il listino della società, poi crea una bozza qui sopra.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {quotes.map((q) => {
            const c = byId.get(q.companyId);
            const s = QUOTE_STATUS[q.status];
            return (
              <li key={q.id}>
                <Link
                  href={`/preventivi/${q.id}`}
                  className="grid gap-1 px-4 py-3 hover:bg-surface-2 md:grid-cols-[110px_minmax(0,2fr)_minmax(0,1fr)_120px_110px] md:items-center md:gap-4"
                >
                  <p className="num text-sm font-semibold">{quoteLabel(q.number, q.issueDate)}</p>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{q.title}</p>
                    <p className="truncate text-xs text-muted">
                      {q.client.name} · {formatDay(q.issueDate)}
                      {q.project && <> · progetto {q.project.name}</>}
                    </p>
                  </div>
                  <div>{c && <CompanyTag name={c.name} short={c.poPrefix ?? c.name} color={c.colorLight} />}</div>
                  <p className="num text-sm md:text-right">{formatEuro(q.total)}</p>
                  <p className={cn("text-sm font-semibold", s.tone)}>{s.label}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
