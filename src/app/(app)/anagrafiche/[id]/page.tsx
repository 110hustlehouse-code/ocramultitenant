import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartyForm } from "@/components/registry/PartyForm";
import { buttonClass, CompanyTag } from "@/components/registry/ui";
import { requireModule } from "@/server/context";
import { ALL_PARTY_KINDS, KIND_LABELS, PARAM_BY_KIND } from "@/server/registry/input";
import { canWriteFinance, getParty, writableCompanies } from "@/server/registry/service";
import { addPartyKindsAction, deletePartyAction, savePartyAction } from "../actions";

export const metadata: Metadata = { title: "Anagrafica" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireModule("ANAGRAFICHE");
  const party = await getParty(ctx, (await params).id);
  if (!party) notFound();

  const writable = writableCompanies(ctx);
  const linked = party.companies.map((c) => c.companyId);
  const canEdit = linked.some((id) => writable.some((w) => w.id === id));
  const tipo = PARAM_BY_KIND[party.kinds[0] ?? "CLIENTE"];
  const others = ctx.companies.filter((c) => linked.includes(c.id) && !writable.some((w) => w.id === c.id));
  const finance = canWriteFinance(ctx, linked);

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="label">{party.kinds.map((k) => KIND_LABELS[k]).join(" · ")}</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">{party.name}</h1>
        {others.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            Usata anche da
            {others.map((c) => (
              <CompanyTag key={c.id} name={c.name} short={c.poPrefix ?? c.name} color={c.colorLight} />
            ))}
          </p>
        )}
      </header>

      {canEdit ? (
        <>
          <PartyForm
            companies={writable.map(({ id, name, colorLight }) => ({ id, name, colorLight }))}
            kindOptions={[...ALL_PARTY_KINDS]}
            canWriteFinance={finance}
            basePath="/anagrafiche"
            saveAction={savePartyAction}
            addRoleAction={addPartyKindsAction}
            cancelHref={`/anagrafiche?tipo=${tipo}`}
            values={{ ...party, companyIds: linked }}
          />
          <form action={deletePartyAction} className="border-t border-border pt-6">
            <input type="hidden" name="id" value={party.id} />
            <input type="hidden" name="tipo" value={tipo} />
            <button type="submit" className={buttonClass.danger}>
              {others.length > 0 ? "Togli dalle mie società" : "Elimina anagrafica"}
            </button>
          </form>
        </>
      ) : (
        <dl className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
          {[
            ["Indirizzo", party.address],
            ["P.IVA", party.vatNumber],
            ["Codice fiscale", party.taxCode],
            ["PEC", party.pec],
            ["SDI", party.sdiCode],
            ["Referente", party.contactName],
            ["Email", party.email],
            ["Cellulare", party.phone],
            ["Categorie", party.categories.join(", ")],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="label">{label}</dt>
              <dd className="mt-1">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
