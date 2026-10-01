"use client";

import { useActionState } from "react";
import { buttonClass, Field, inputClass } from "@/components/registry/ui";
import { addEvaluationAction, type EvaluationState } from "@/app/(app)/collaboratori/actions";

export function EvaluationForm({ partyId, companies }: { partyId: string; companies: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<EvaluationState, FormData>(addEvaluationAction, undefined);
  if (companies.length === 0) return null;
  return (
    <form action={action} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <input type="hidden" name="partyId" value={partyId} />
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Società" name="companyId">
          <select id="companyId" name="companyId" className={inputClass} defaultValue={companies[0]!.id}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Voto" name="rating">
          <select id="rating" name="rating" className={inputClass} defaultValue="5">
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}
                {"☆".repeat(5 - n)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Note" name="notes">
        <textarea id="notes" name="notes" rows={2} className={inputClass} />
      </Field>
      <button type="submit" disabled={pending} className={buttonClass.secondary}>
        {pending ? "Salvataggio…" : "Aggiungi valutazione"}
      </button>
    </form>
  );
}
