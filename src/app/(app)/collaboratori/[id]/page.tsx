import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartyForm } from "@/components/registry/PartyForm";
import { buttonClass, CompanyTag, inputClass, Field } from "@/components/registry/ui";
import { requireModule } from "@/server/context";
import { ALL_PARTY_KINDS, KIND_LABELS, PARAM_BY_KIND } from "@/server/registry/input";
import { canWriteFinance, getParty, writableCompanies } from "@/server/registry/service";
import { assignableUsers } from "@/server/projects/service";
import { collaboratorProjects, listEvaluations } from "@/server/collaborators/service";
import { EvaluationForm } from "@/components/collaborators/EvaluationForm";
import { addPartyKindsAction, deletePartyAction, savePartyAction, setLinkedUserAction } from "../actions";

export const metadata: Metadata = { title: "Collaboratore" };

const FISCAL_DOCUMENT_LABELS: Record<string, string> = {
  FATTURA: "Fattura",
  NOTULA: "Notula",
  CESSIONE_DIRITTI_RITENUTA: "Cessione diritti con ritenuta",
  ALTRO: "Altro",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireModule("COLLABORATORI");
  const party = await getParty(ctx, (await params).id);
  if (!party) notFound();

  const writable = writableCompanies(ctx);
  const linked = party.companies.map((c) => c.companyId);
  const canEdit = linked.some((id) => writable.some((w) => w.id === id));
  const tipo = PARAM_BY_KIND[party.kinds[0] ?? "COLLABORATORE_ESTERNO"];
  const finance = canWriteFinance(ctx, linked);

  const [projects, evaluations, candidateLists] = await Promise.all([
    collaboratorProjects(ctx, party.id),
    listEvaluations(ctx, party.id),
    Promise.all(linked.map((companyId) => assignableUsers(ctx, companyId))),
  ]);
  const candidates = [...new Map(candidateLists.flat().map((u) => [u.id, u])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="label">{party.kinds.map((k) => KIND_LABELS[k]).join(" · ")}</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">{party.name}</h1>
        {party.categories.length > 0 && <p className="text-sm text-muted">{party.categories.join(" · ")}</p>}
      </header>

      {canEdit ? (
        <>
          <PartyForm
            companies={writable.map(({ id, name, colorLight }) => ({ id, name, colorLight }))}
            kindOptions={[...ALL_PARTY_KINDS]}
            canWriteFinance={finance}
            basePath="/collaboratori"
            saveAction={savePartyAction}
            addRoleAction={addPartyKindsAction}
            cancelHref={`/collaboratori?tipo=${tipo}`}
            values={{ ...party, companyIds: linked }}
          />

          <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
            <p className="label">Accesso all&apos;app</p>
            <form action={setLinkedUserAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="partyId" value={party.id} />
              <Field label="Collegato all'utente" name="userId" className="min-w-48">
                <select id="userId" name="userId" defaultValue={party.linkedUserId ?? ""} className={inputClass}>
                  <option value="">Nessuno (non ha accesso)</option>
                  {candidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button type="submit" className={buttonClass.secondary}>
                Salva
              </button>
            </form>
          </section>

          <form action={deletePartyAction} className="border-t border-border pt-6">
            <input type="hidden" name="id" value={party.id} />
            <input type="hidden" name="tipo" value={tipo} />
            <button type="submit" className={buttonClass.danger}>
              Elimina collaboratore
            </button>
          </form>
        </>
      ) : (
        <dl className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
          {[
            ["Disponibilità", party.availabilityNote],
            ["Referente", party.contactName],
            ["Email", party.email],
            ["Cellulare", party.phone],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="label">{label}</dt>
              <dd className="mt-1">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      )}

      <section className="space-y-3">
        <p className="label">Progetti</p>
        {projects.length === 0 ? (
          <p className="text-sm text-muted">Nessun progetto collegato ancora.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {projects.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-muted">
                    {p.companyName}
                    {p.asTeamMember ? " · nel team" : ""}
                    {p.paymentsCount > 0 ? ` · ${p.paymentsCount} ${p.paymentsCount === 1 ? "costo registrato" : "costi registrati"}` : ""}
                  </p>
                </div>
                {p.totalPaid !== null && p.totalPaid > 0 && <p className="num font-semibold">{(p.totalPaid / 100).toFixed(2)} €</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {finance && (
        <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
          <p className="label">Dati amministrativi</p>
          <dl className="grid gap-4 sm:grid-cols-2">
            {[
              ["IBAN", party.paymentIban],
              ["Intestatario", party.paymentHolder],
              ["Documento fiscale", party.fiscalDocumentType ? FISCAL_DOCUMENT_LABELS[party.fiscalDocumentType] : null],
              ["Termini di pagamento", party.paymentTerms],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="label">{label}</dt>
                <dd className="mt-1">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {finance && (
        <section className="space-y-3">
          <p className="label">Valutazioni</p>
          <EvaluationForm partyId={party.id} companies={linked.map((id) => writable.find((w) => w.id === id)).filter((c) => c != null)} />
          {evaluations.length === 0 ? (
            <p className="text-sm text-muted">Nessuna valutazione ancora.</p>
          ) : (
            <ul className="space-y-2">
              {evaluations.map((e) => (
                <li key={e.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="num font-semibold">{"★".repeat(e.rating)}{"☆".repeat(5 - e.rating)}</p>
                    <p className="text-xs text-muted">
                      {e.evaluatedBy?.name ?? "—"}
                      {e.project ? ` · ${e.project.name}` : ""}
                    </p>
                  </div>
                  {e.notes && <p className="mt-1 text-sm">{e.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {party.companies.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {party.companies.map(({ companyId }) => {
            const c = ctx.companies.find((cc) => cc.id === companyId);
            return c ? <CompanyTag key={companyId} name={c.name} short={c.poPrefix ?? c.name} color={c.colorLight} /> : null;
          })}
        </div>
      )}
    </div>
  );
}
