"use client";

import { useActionState, useState } from "react";
import { buttonClass, Field, inputClass } from "@/components/registry/ui";
import { createIntegrationAction } from "@/app/(app)/verbali/actions";

/** Nuovo collegamento: dopo la creazione mostra il token, una volta sola. */
export function IntegrationForm({
  companies,
  projects,
}: {
  companies: { id: string; name: string }[];
  projects: { id: string; name: string; companyId: string }[];
}) {
  const [state, action, pending] = useActionState(createIntegrationAction, undefined);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4">
      {state?.token && (
        <div role="status" className="space-y-2 rounded-xl border border-ok/40 bg-ok/10 p-5">
          <p className="font-semibold">Collegamento «{state.name}» creato. Copia il token adesso: non lo vedrai più.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-surface px-2 py-1 text-sm break-all">{state.token}</code>
            <button
              type="button"
              className={buttonClass.secondary}
              onClick={() => void navigator.clipboard.writeText(state.token!).then(() => setCopied(true))}
            >
              {copied ? "Copiato" : "Copia"}
            </button>
          </div>
        </div>
      )}
      <form action={action} className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <Field label="Nome" name="name" hint="Per riconoscerlo, es. «Fireflies Erika» o «n8n calendario».">
          <input id="name" name="name" className={inputClass} />
        </Field>
        {companies.length > 1 ? (
          <Field label="Società" name="companyId">
            <select id="companyId" name="companyId" value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputClass}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <input type="hidden" name="companyId" value={companyId} />
        )}
        <Field label="Progetto" name="projectId" hint="Solo se tutte le riunioni di questo collegamento sono di un progetto.">
          <select id="projectId" name="projectId" defaultValue="" className={inputClass} key={companyId}>
            <option value="">Nessuno: lo propone OCRA task per task</option>
            {projects
              .filter((p) => p.companyId === companyId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          {pending ? "…" : "Crea collegamento"}
        </button>
      </form>
    </div>
  );
}
