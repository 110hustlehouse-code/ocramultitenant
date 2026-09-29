import type { Metadata } from "next";
import { PartyForm } from "@/components/registry/PartyForm";
import { requireModule } from "@/server/context";
import { kindFromParam, PARAM_BY_KIND } from "@/server/registry/input";
import { viewCompanies, writableCompanies } from "@/server/registry/service";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Nuova anagrafica" };

export default async function Page({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const ctx = await requireModule("ANAGRAFICHE");
  const kind = kindFromParam((await searchParams).tipo);
  const writable = writableCompanies(ctx);
  if (writable.length === 0) notFound();
  // Preselezionata: la società che si sta guardando, se l'utente può scriverci.
  const preset = viewCompanies(ctx)
    .filter((c) => writable.some((w) => w.id === c.id))
    .map((c) => c.id)
    .slice(0, ctx.view.kind === "company" ? 1 : 0);

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <p className="label">Anagrafiche</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
          Nuovo {kind === "CLIENTE" ? "cliente" : "fornitore"}
        </h1>
      </header>
      <PartyForm
        companies={writable.map(({ id, name, colorLight }) => ({ id, name, colorLight }))}
        cancelHref={`/anagrafiche?tipo=${PARAM_BY_KIND[kind]}`}
        values={{
          kind,
          name: "",
          vatNumber: null,
          taxCode: null,
          pec: null,
          sdiCode: null,
          contactName: null,
          email: null,
          phone: null,
          categories: [],
          notes: null,
          companyIds: preset,
        }}
      />
    </div>
  );
}
