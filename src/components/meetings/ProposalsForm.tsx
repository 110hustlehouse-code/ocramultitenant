"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { buttonClass, inputClass } from "@/components/registry/ui";
import { confirmAction } from "@/app/(app)/verbali/actions";

type Option = { id: string; name: string };
export type ProposalRow = {
  key: string;
  title: string;
  assigneeId: string | null;
  assigneeMention: string | null;
  projectId: string | null;
  dueDate: string | null;
  priority: "NORMALE" | "ALTA" | "URGENTE";
  evidence: string | null;
};

/** Il PM rivede i task proposti: spunta, corregge a chi e per quando, conferma. */
export function ProposalsForm({
  meetingId,
  proposals,
  people,
  projects,
}: {
  meetingId: string;
  proposals: ProposalRow[];
  people: Option[];
  projects: Option[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(confirmAction, undefined);
  useEffect(() => {
    if (state && !state.error) router.refresh();
  }, [state, router]);

  if (proposals.length === 0) {
    return (
      <form action={action} className="rounded-xl border border-border bg-surface p-5">
        <input type="hidden" name="id" value={meetingId} />
        <p className="text-sm text-muted">Dalla riunione non sono emersi task. Conferma per archiviare il verbale.</p>
        <button type="submit" disabled={pending} className={`${buttonClass.primary} mt-3`}>
          Conferma verbale
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={meetingId} />
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {proposals.map((p) => (
          <li key={p.key} className="space-y-2 p-4">
            <input type="hidden" name="keys" value={p.key} />
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                name={`include-${p.key}`}
                defaultChecked
                aria-label="Crea questo task"
                className="mt-2.5 size-4"
              />
              <div className="grid flex-1 gap-2 sm:grid-cols-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_150px_120px]">
                <input
                  name={`title-${p.key}`}
                  defaultValue={p.title}
                  aria-label="Titolo"
                  className={`${inputClass} font-semibold sm:col-span-2 md:col-span-4`}
                />
                <select name={`assignee-${p.key}`} defaultValue={p.assigneeId ?? ""} aria-label="Assegnato a" className={inputClass}>
                  <option value="">{p.assigneeMention ? `? ${p.assigneeMention}` : "Non assegnato"}</option>
                  {people.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <select name={`project-${p.key}`} defaultValue={p.projectId ?? ""} aria-label="Progetto" className={inputClass}>
                  <option value="">Scegli il progetto…</option>
                  {projects.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <input type="date" name={`due-${p.key}`} defaultValue={p.dueDate ?? ""} aria-label="Scadenza" className={inputClass} />
                <select name={`priority-${p.key}`} defaultValue={p.priority} aria-label="Priorità" className={inputClass}>
                  <option value="NORMALE">Normale</option>
                  <option value="ALTA">Alta</option>
                  <option value="URGENTE">Urgente</option>
                </select>
              </div>
            </div>
            {p.evidence && <p className="pl-7 text-xs text-muted italic">«{p.evidence}»</p>}
          </li>
        ))}
      </ul>
      {state?.error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass.primary}>
        {pending ? "Creazione…" : "Crea i task spuntati"}
      </button>
    </form>
  );
}
