import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartyForm } from "@/components/registry/PartyForm";
import { requireModule } from "@/server/context";
import { collaboratorKindFromParam, PARAM_BY_KIND } from "@/server/registry/input";
import { canWriteFinance, viewCompanies, writableCompanies } from "@/server/registry/service";
import { addPartyKindsAction, savePartyAction } from "../actions";

export const metadata: Metadata = { title: "Nuovo collaboratore" };

export default async function Page({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const ctx = await requireModule("COLLABORATORI");
  const kind = collaboratorKindFromParam((await searchParams).tipo);
  const writable = writableCompanies(ctx);
  if (writable.length === 0) notFound();
  const preset = viewCompanies(ctx)
    .filter((c) => writable.some((w) => w.id === c.id))
    .map((c) => c.id)
    .slice(0, ctx.view.kind === "company" ? 1 : 0);

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <p className="label">Collaboratori</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
          Nuovo {kind === "COLLABORATORE_INTERNO" ? "collaboratore interno" : "collaboratore esterno"}
        </h1>
      </header>
      <PartyForm
        companies={writable.map(({ id, name, colorLight }) => ({ id, name, colorLight }))}
        kindOptions={[kind]}
        canWriteFinance={canWriteFinance(ctx, writable.map((c) => c.id))}
        basePath="/collaboratori"
        saveAction={savePartyAction}
        addRoleAction={addPartyKindsAction}
        cancelHref={`/collaboratori?tipo=${PARAM_BY_KIND[kind]}`}
        values={{
          kinds: [kind],
          name: "",
          address: null,
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
          availabilityNote: null,
          paymentIban: null,
          paymentHolder: null,
          fiscalDocumentType: null,
          paymentTerms: null,
        }}
      />
    </div>
  );
}
