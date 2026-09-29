import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImportForm } from "@/components/registry/ImportForm";
import { requireModule } from "@/server/context";
import { kindFromParam, PARAM_BY_KIND } from "@/server/registry/input";
import { viewCompanies, writableCompanies } from "@/server/registry/service";

export const metadata: Metadata = { title: "Importa anagrafiche" };

export default async function Page({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const ctx = await requireModule("ANAGRAFICHE");
  const kind = kindFromParam((await searchParams).tipo);
  const writable = writableCompanies(ctx);
  if (writable.length === 0) notFound();
  const current = viewCompanies(ctx).find((c) => writable.some((w) => w.id === c.id));

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <p className="label">Anagrafiche</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
          Importa {kind === "CLIENTE" ? "clienti" : "fornitori"} da CSV
        </h1>
      </header>
      <ImportForm
        tipo={PARAM_BY_KIND[kind]}
        companies={writable.map(({ id, name }) => ({ id, name }))}
        defaultCompanyId={current?.id}
      />
    </div>
  );
}
