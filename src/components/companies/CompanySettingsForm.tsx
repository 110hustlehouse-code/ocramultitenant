"use client";

import { useActionState } from "react";
import { saveCompanySettingsAction, type CompanyFormState } from "@/app/(app)/impostazioni/actions";
import { buttonClass, Field, inputClass } from "@/components/registry/ui";
import type { Company } from "@/generated/prisma/client";

export function CompanySettingsForm({ company, quoteLocked }: { company: Company; quoteLocked: boolean }) {
  const [state, action, pending] = useActionState<CompanyFormState, FormData>(saveCompanySettingsAction, undefined);
  const e = state?.errors ?? {};
  const v = state?.values;

  const str = (field: string, fallback: string | null) => (v ? (v as Record<string, string>)[field] : (fallback ?? ""));

  const text = (
    name: string,
    label: string,
    fallback: string | null,
    opts: { hint?: string; type?: string; className?: string } = {},
  ) => (
    <Field label={label} name={name} error={e[name]} hint={opts.hint} className={opts.className}>
      <input id={name} name={name} type={opts.type ?? "text"} defaultValue={str(name, fallback)} className={inputClass} />
    </Field>
  );

  return (
    <form key={state ? JSON.stringify(v) : "init"} action={action} className="space-y-6">
      <input type="hidden" name="companyId" value={company.id} />

      {state?.message && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
          {state.message}
        </p>
      )}

      <fieldset className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
        <legend className="label px-1">Dati legali</legend>
        {text("legalName", "Ragione sociale", company.legalName, { className: "sm:col-span-2" })}
        {text("vatNumber", "P.IVA", company.vatNumber, { hint: "11 cifre, con o senza IT" })}
        {text("legalRepresentative", "Legale rappresentante", company.legalRepresentative)}
        {text("legalAddress", "Indirizzo", company.legalAddress, { className: "sm:col-span-2" })}
        {text("pec", "PEC", company.pec, { type: "email" })}
        {text("sdiCode", "Codice SDI", company.sdiCode, { hint: "7 caratteri" })}
        {text("reaNumber", "Numero REA", company.reaNumber)}
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
        <legend className="label px-1">Dati bancari</legend>
        {text("bankIban", "IBAN", company.bankIban)}
        {text("bankAccountHolder", "Intestatario conto", company.bankAccountHolder)}
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
        <legend className="label px-1">Preventivi</legend>
        <Field
          label="Condizioni di pagamento"
          name="quoteTerms"
          error={e.quoteTerms}
          hint="Mostrate sotto il totale del preventivo"
          className="sm:col-span-2"
        >
          <textarea id="quoteTerms" name="quoteTerms" rows={2} defaultValue={str("quoteTerms", company.quoteTerms)} className={inputClass} />
        </Field>
        <Field
          label="Piè di pagina"
          name="quoteFooter"
          error={e.quoteFooter}
          hint="In fondo a ogni pagina del PDF. Se vuoto: ragione sociale e P.IVA; l'IBAN, se compilato, si aggiunge comunque."
          className="sm:col-span-2"
        >
          <textarea id="quoteFooter" name="quoteFooter" rows={2} defaultValue={str("quoteFooter", company.quoteFooter)} className={inputClass} />
        </Field>
        <Field label="Validità preventivo (giorni)" name="quoteValidityDays" error={e.quoteValidityDays}>
          <input
            id="quoteValidityDays"
            name="quoteValidityDays"
            type="number"
            min={1}
            max={365}
            defaultValue={str("quoteValidityDays", String(company.quoteValidityDays))}
            className={inputClass}
          />
        </Field>
        <Field
          label="Numero di partenza"
          name="nextQuoteNumber"
          error={e.nextQuoteNumber}
          hint={quoteLocked ? "Bloccato: ci sono già preventivi emessi con questa numerazione." : "Il prossimo preventivo userà questo numero"}
        >
          <input
            id="nextQuoteNumber"
            name="nextQuoteNumber"
            type="number"
            min={1}
            readOnly={quoteLocked}
            aria-readonly={quoteLocked}
            defaultValue={str("nextQuoteNumber", String(company.nextQuoteNumber))}
            className={quoteLocked ? `${inputClass} cursor-not-allowed opacity-60` : inputClass}
          />
        </Field>
      </fieldset>

      <button type="submit" disabled={pending} className={buttonClass.primary}>
        {pending ? "Salvataggio…" : "Salva"}
      </button>
    </form>
  );
}
