"use client";

import { useActionState, useState } from "react";
import { buttonClass, Field, inputClass } from "@/components/registry/ui";
import { createMeetingAction } from "@/app/(app)/verbali/actions";

export function NewMeetingForm({
  companies,
  projects,
  defaults,
}: {
  companies: { id: string; name: string }[];
  projects: { id: string; name: string; companyId: string }[];
  defaults: { title: string; heldAt: string; projectId: string };
}) {
  const [state, action, pending] = useActionState(createMeetingAction, undefined);
  const preset = projects.find((p) => p.id === defaults.projectId);
  const [companyId, setCompanyId] = useState(preset?.companyId ?? companies[0]?.id ?? "");

  return (
    <form action={action} className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <Field label="Titolo" name="title">
        <input id="title" name="title" defaultValue={defaults.title} className={inputClass} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data" name="heldAt">
          <input id="heldAt" name="heldAt" type="date" defaultValue={defaults.heldAt} className={inputClass} />
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
      </div>
      <Field label="Progetto" name="projectId" hint="Se la riunione è su un progetto, i task finiscono lì in automatico.">
        <select id="projectId" name="projectId" defaultValue={preset?.id ?? ""} className={inputClass} key={companyId}>
          <option value="">Riunione interna / più progetti</option>
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
        {pending ? "…" : "Avanti"}
      </button>
    </form>
  );
}
