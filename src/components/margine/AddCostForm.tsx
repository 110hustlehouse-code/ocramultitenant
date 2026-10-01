"use client";

import { Plus } from "lucide-react";
import { useActionState } from "react";
import { buttonClass, inputClass } from "@/components/registry/ui";
import { addCostAction } from "@/app/(app)/margine/actions";

/** Registra un costo reale: lo fa il CEO quando arriva una spesa (fattura, esterno, acquisto). Mai in automatico. */
export function AddCostForm({ projectId, lines }: { projectId: string; lines: { id: string; description: string }[] }) {
  const [state, action, pending] = useActionState(addCostAction, undefined);

  return (
    <form key={state?.error ? "err" : "ok"} action={action} className="space-y-2 rounded-xl border border-border bg-surface-2/50 p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_140px_150px_minmax(0,1fr)_auto]">
        <input name="description" placeholder="Es. Fattura montatore luci" aria-label="Descrizione del costo" className={inputClass} />
        <input name="amount" placeholder="0,00 €" aria-label="Importo" className={inputClass} />
        <input name="incurredAt" type="date" aria-label="Data" className={inputClass} defaultValue={new Date().toISOString().slice(0, 10)} />
        <select name="budgetLineId" aria-label="Riga di budget" className={inputClass} defaultValue="">
          <option value="">Nessuna riga specifica</option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>{l.description}</option>
          ))}
        </select>
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          <Plus className="size-4" aria-hidden /> Registra
        </button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
