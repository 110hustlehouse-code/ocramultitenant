import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanySettingsForm } from "@/components/companies/CompanySettingsForm";
import { cn } from "@/lib/cn";
import { getCompanySettings, manageableCompanies } from "@/server/companies/service";
import { getContext } from "@/server/context";

export const metadata: Metadata = { title: "Società" };

export default async function Page({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const ctx = await getContext();
  const companies = manageableCompanies(ctx);
  const { companyId: requested } = await searchParams;
  const companyId = companies.find((c) => c.id === requested)?.id ?? companies[0]?.id;
  if (!companyId) notFound();

  const [company, quotesIssued] = await Promise.all([
    getCompanySettings(ctx, companyId),
    ctx.db.quote.count({ where: { companyId } }),
  ]);

  return (
    <div className="space-y-6 py-2">
      {companies.length > 1 && (
        <nav aria-label="Società" className="flex flex-wrap gap-2">
          {companies.map((c) => (
            <Link
              key={c.id}
              href={`/impostazioni/societa?companyId=${c.id}`}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-semibold",
                c.id === companyId ? "border-brand bg-brand text-on-brand" : "border-border text-muted hover:text-text",
              )}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      )}
      <p className="max-w-prose text-sm text-muted">
        Dati che finora vivevano solo nel seed: IBAN, condizioni di pagamento, piè di pagina e dati legali del
        preventivo. Il numero di preventivo di partenza si può cambiare solo finché non ne è ancora uscito uno.
      </p>
      <CompanySettingsForm company={company} quoteLocked={quotesIssued > 0} />
    </div>
  );
}
