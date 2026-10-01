"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass, Field, inputClass } from "@/components/registry/ui";
import { safeHex } from "@/lib/color";
import { savePartyAction, type FormState } from "@/app/(app)/anagrafiche/actions";

type Company = { id: string; name: string; colorLight: string };

export type PartyFormValues = {
  id?: string;
  kind: "CLIENTE" | "FORNITORE";
  name: string;
  address: string | null;
  vatNumber: string | null;
  taxCode: string | null;
  pec: string | null;
  sdiCode: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  categories: string[];
  notes: string | null;
  companyIds: string[];
};

export function PartyForm({
  values,
  companies,
  cancelHref,
}: {
  values: PartyFormValues;
  /** Società tra cui scegliere (quelle dove l'utente può scrivere) */
  companies: Company[];
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(savePartyAction, undefined);
  const e = state?.errors ?? {};
  // Dopo un errore si riparte da quanto scritto, non dai valori salvati.
  const current: PartyFormValues = state?.values
    ? {
        ...values,
        ...Object.fromEntries(Object.entries(state.values).map(([k, v]) => [k, v ?? null])),
        kind: values.kind,
        categories: state.values.categories,
        companyIds: state.values.companyIds,
      }
    : values;
  const text = (name: keyof PartyFormValues, label: string, opts: { hint?: string; type?: string; className?: string } = {}) => (
    <Field label={label} name={name} error={e[name]} hint={opts.hint} className={opts.className}>
      <input
        id={name}
        name={name}
        type={opts.type ?? "text"}
        defaultValue={(current[name] as string | null) ?? ""}
        aria-invalid={e[name] ? true : undefined}
        aria-describedby={e[name] ? `${name}-error` : undefined}
        className={inputClass}
      />
    </Field>
  );

  return (
    <form key={state ? JSON.stringify(state.values) : "init"} action={action} className="space-y-6">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <input type="hidden" name="kind" value={values.kind} />

      {state?.message && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
          {state.message}
        </p>
      )}

      <fieldset className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
        <legend className="label px-1">Dati fiscali</legend>
        {text("name", "Ragione sociale o nome", { className: "sm:col-span-2" })}
        {text("address", "Indirizzo", { hint: "Via, CAP, città — compare sul preventivo se presente", className: "sm:col-span-2" })}
        {text("vatNumber", "P.IVA", { hint: "11 cifre, con o senza IT" })}
        {text("taxCode", "Codice fiscale", { hint: "Per le persone fisiche (artisti, collaboratori)" })}
        {text("pec", "PEC", { type: "email" })}
        {text("sdiCode", "Codice SDI", { hint: "7 caratteri" })}
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-3">
        <legend className="label px-1">Referente</legend>
        {text("contactName", "Nome e cognome")}
        {text("email", "Email", { type: "email" })}
        {text("phone", "Cellulare", { type: "tel" })}
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <legend className="label px-1">Organizzazione</legend>
        <div className="space-y-2">
          <p className="label">Società di riferimento</p>
          <div className="flex flex-wrap gap-2">
            {companies.map((c) => (
              <label
                key={c.id}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-checked:border-text"
              >
                <input type="checkbox" name="companyIds" value={c.id} defaultChecked={current.companyIds.includes(c.id)} />
                <span className="size-2 rounded-full" style={{ background: safeHex(c.colorLight, "#11151c") }} aria-hidden />
                {c.name}
              </label>
            ))}
          </div>
          {e.companyIds && <p className="text-xs text-danger">{e.companyIds}</p>}
        </div>
        <Field label="Categorie merceologiche" name="categories" error={e.categories} hint="Fino a 3, separate da virgola">
          <input id="categories" name="categories" defaultValue={current.categories.join(", ")} className={inputClass} />
        </Field>
        <Field label="Note" name="notes" error={e.notes}>
          <textarea id="notes" name="notes" rows={3} defaultValue={current.notes ?? ""} className={inputClass} />
        </Field>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          {pending ? "Salvataggio…" : "Salva"}
        </button>
        <Link href={cancelHref} className={buttonClass.secondary}>
          Annulla
        </Link>
      </div>
    </form>
  );
}
