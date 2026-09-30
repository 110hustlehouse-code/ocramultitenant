"use client";

import { Plus } from "lucide-react";
import { useActionState } from "react";
import { buttonClass, inputClass } from "@/components/registry/ui";
import { saveTaskAction, type TaskFormState } from "@/app/(app)/progetti/actions";

/** Aggiunta rapida di un task: titolo, a chi, entro quando. Il resto è facoltativo. */
export function NewTaskForm({ projectId, people }: { projectId: string; people: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<TaskFormState, FormData>(saveTaskAction, undefined);
  const e = state?.errors ?? {};

  return (
    <form key={state?.ok ?? "new"} action={action} className="space-y-2 border-t border-border bg-surface-2/50 px-4 py-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_150px_130px_auto]">
        <input name="title" placeholder="Nuovo task…" aria-label="Titolo del task" className={inputClass} />
        <select name="assigneeId" aria-label="Assegnato a" className={inputClass} defaultValue="">
          <option value="">Non assegnato</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input name="dueDate" type="date" aria-label="Scadenza" className={inputClass} />
        <select name="priority" aria-label="Priorità" className={inputClass} defaultValue="NORMALE">
          <option value="NORMALE">Normale</option>
          <option value="ALTA">Alta</option>
          <option value="URGENTE">Urgente</option>
        </select>
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          <Plus className="size-4" aria-hidden /> Aggiungi
        </button>
      </div>
      <textarea
        name="description"
        rows={2}
        placeholder="Descrizione (facoltativa)…"
        aria-label="Descrizione del task"
        className={inputClass}
      />
      {(e.title || state?.message) && <p className="text-xs text-danger">{e.title ?? state?.message}</p>}
    </form>
  );
}
