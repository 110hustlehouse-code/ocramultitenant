"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass, Field, inputClass } from "@/components/registry/ui";
import { safeHex } from "@/lib/color";
import { KIND_LABELS } from "@/server/registry/input";
import type { FiscalDocumentType, PartyKind } from "@/generated/prisma/enums";
import type { FormState } from "@/app/(app)/anagrafiche/actions";

type Company = { id: string; name: string; colorLight: string };

export type PartyFormValues = {
  id?: string;
  kinds: PartyKind[];
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
  availabilityNote: string | null;
  paymentIban: string | null;
  paymentHolder: string | null;
  fiscalDocumentType: FiscalDocumentType | null;
  paymentTerms: string | null;
};

const FISCAL_DOCUMENT_LABELS: Record<FiscalDocumentType, string> = {
  FATTURA: "Fattura",
  NOTULA: "Notula",
  CESSIONE_DIRITTI_RITENUTA: "Cessione diritti con ritenuta",
  ALTRO: "Altro",
};

export function PartyForm({
  values,
  companies,
  kindOptions,
  canWriteFinance,
  cancelHref,
  basePath,
  saveAction,
  addRoleAction,
}: {
  values: PartyFormValues;
  /** Società tra cui scegliere (quelle dove l'utente può scrivere) */
  companies: Company[];
  /** Ruoli selezionabili in questo form (es. solo Cliente/Fornitore da /anagrafiche) */
  kindOptions: PartyKind[];
  /** Vede e scrive IBAN, documento fiscale, termini di pagamento (permesso finance:write) */
  canWriteFinance: boolean;
  cancelHref: string;
  /** "/anagrafiche" o "/collaboratori": dove linkare l'anagrafica in conflitto */
  basePath: "/anagrafiche" | "/collaboratori";
  /** Server Action che salva (diversa per /anagrafiche e /collaboratori: modulo e redirect diversi) */
  saveAction: (prev: FormState, fd: FormData) => Promise<FormState>;
  /** Server Action per aggiungere un ruolo mancante dalla proposta di conflitto */
  addRoleAction: (fd: FormData) => Promise<void>;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAction, undefined);
  const e = state?.errors ?? {};
  // Dopo un errore si riparte da quanto scritto, non dai valori salvati.
  const current: PartyFormValues = state?.values
    ? {
        ...values,
        ...Object.fromEntries(Object.entries(state.values).map(([k, v]) => [k, v ?? null])),
        kinds: (state.values.kinds as PartyKind[] | undefined) ?? values.kinds,
        categories: state.values.categories,
        companyIds: state.values.companyIds,
        fiscalDocumentType: (state.values.fiscalDocumentType as FiscalDocumentType | null | undefined) ?? null,
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

      {state?.message && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
          {state.message}
        </p>
      )}

      {state?.conflict && (
        <div className="space-y-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
          <p>
            <Link href={`${basePath}/${state.conflict.partyId}`} className="underline">
              Apri «{state.conflict.partyName}»
            </Link>{" "}
            per modificarla direttamente, oppure aggiungi qui il ruolo mancante.
          </p>
          <form action={addRoleAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="partyId" value={state.conflict.partyId} />
            {state.conflict.missingKinds.map((k) => (
              <input key={k} type="hidden" name="missingKinds" value={k} />
            ))}
            <button type="submit" className={buttonClass.secondary}>
              Aggiungi {state.conflict.missingKinds.map((k) => KIND_LABELS[k]).join(" + ")} a questa anagrafica
            </button>
          </form>
        </div>
      )}

      {kindOptions.length > 1 && (
        <div className="space-y-2">
          <p className="label">Ruolo</p>
          <div className="flex flex-wrap gap-2">
            {kindOptions.map((k) => (
              <label
                key={k}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-checked:border-text"
              >
                <input type="checkbox" name="kinds" value={k} defaultChecked={current.kinds.includes(k)} />
                {KIND_LABELS[k]}
              </label>
            ))}
          </div>
          {e.kinds && <p className="text-xs text-danger">{e.kinds}</p>}
        </div>
      )}
      {kindOptions.length === 1 && <input type="hidden" name="kinds" value={kindOptions[0]} />}

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
        <Field label="Categorie merceologiche" name="categories" error={e.categories} hint="Fino a 3, separate da virgola. Per i collaboratori: il ruolo (es. Videomaker, Fotografo)">
          <input id="categories" name="categories" defaultValue={current.categories.join(", ")} className={inputClass} />
        </Field>
        <Field label="Disponibilità" name="availabilityNote" error={e.availabilityNote} hint="Es. «3 giorni/settimana», «full time da ottobre»">
          <input id="availabilityNote" name="availabilityNote" defaultValue={current.availabilityNote ?? ""} className={inputClass} />
        </Field>
        <Field label="Note" name="notes" error={e.notes}>
          <textarea id="notes" name="notes" rows={3} defaultValue={current.notes ?? ""} className={inputClass} />
        </Field>
      </fieldset>

      {canWriteFinance && (
        <fieldset className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
          <legend className="label px-1">Dati amministrativi</legend>
          {text("paymentIban", "IBAN")}
          {text("paymentHolder", "Intestatario", { hint: "Se diverso dal nome" })}
          <Field label="Documento fiscale" name="fiscalDocumentType" error={e.fiscalDocumentType}>
            <select id="fiscalDocumentType" name="fiscalDocumentType" defaultValue={current.fiscalDocumentType ?? ""} className={inputClass}>
              <option value="">—</option>
              {Object.entries(FISCAL_DOCUMENT_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {text("paymentTerms", "Termini di pagamento", {
            hint: "Es. «Entro il 5 del mese successivo», «60 giorni data fattura»",
            className: "sm:col-span-2",
          })}
        </fieldset>
      )}

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
