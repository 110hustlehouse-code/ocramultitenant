"use client";

import { FileDown } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { buttonClass, Field, inputClass } from "@/components/registry/ui";
import { importPartiesAction, type ImportState } from "@/app/(app)/anagrafiche/actions";

export function ImportForm({
  tipo,
  companies,
  defaultCompanyId,
}: {
  tipo: "clienti" | "fornitori";
  companies: { id: string; name: string }[];
  defaultCompanyId?: string;
}) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importPartiesAction, undefined);

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <input type="hidden" name="tipo" value={tipo} />
        <ol className="list-inside list-decimal space-y-1 text-sm text-muted">
          <li>
            <Link href="/anagrafiche/modello" className="inline-flex items-center gap-1 font-semibold text-text underline">
              <FileDown className="size-3.5" aria-hidden /> Scarica il modello
            </Link>{" "}
            oppure usa il vostro file: le colonne si riconoscono dal nome.
          </li>
          <li>Da Excel o Google Fogli salva come CSV.</li>
          <li>Caricalo qui. Se una riga ha un errore non si salva niente: correggi e ricarica.</li>
        </ol>

        <Field label="File CSV" name="file">
          <input id="file" name="file" type="file" accept=".csv,text/csv" required className={inputClass} />
        </Field>

        <Field
          label="Società se la colonna è vuota"
          name="defaultCompanyId"
          hint="Le righe con la colonna «Società di riferimento» compilata usano quella."
        >
          <select id="defaultCompanyId" name="defaultCompanyId" defaultValue={defaultCompanyId} className={inputClass}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <button type="submit" disabled={pending} className={buttonClass.primary}>
          {pending ? "Importazione…" : "Importa"}
        </button>
      </form>

      {state?.message && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
          {state.message}
        </p>
      )}

      {state?.ok && (
        <div role="status" className="rounded-xl border border-ok/40 bg-ok/10 p-5">
          <p className="font-semibold">
            Importazione completata: <span className="num">{state.created}</span> nuove,{" "}
            <span className="num">{state.updated}</span> aggiornate.
          </p>
          <Link href={`/anagrafiche?tipo=${tipo}`} className="mt-2 inline-block text-sm font-semibold underline">
            Vai all&apos;elenco
          </Link>
        </div>
      )}

      {state?.issues && state.issues.length > 0 && (
        <div role="alert" className="space-y-3 rounded-xl border border-danger/40 bg-surface p-5">
          <p className="font-semibold">
            Nessuna riga salvata: {state.issues.length} {state.issues.length === 1 ? "problema" : "problemi"} da correggere.
          </p>
          <ul className="max-h-80 space-y-1 overflow-auto text-sm">
            {state.issues.map((i, n) => (
              <li key={n}>
                <span className="num label mr-2">riga {i.line}</span>
                {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state?.unknownHeaders && state.unknownHeaders.length > 0 && (
        <p className="text-sm text-muted">Colonne ignorate: {state.unknownHeaders.join(", ")}</p>
      )}
    </div>
  );
}
