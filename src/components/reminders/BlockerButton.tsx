"use client";

import { CircleSlash } from "lucide-react";
import { useActionState, useState } from "react";
import { buttonClass, inputClass } from "@/components/registry/ui";
import { reportBlockerAction } from "@/app/(app)/richiami/actions";

/** «Non posso, perché…»: ferma i promemoria automatici e porta il motivo al PM. */
export function BlockerButton({ taskId, note }: { taskId: string; note: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(reportBlockerAction, undefined);

  if (note) return <p className="text-xs text-warn">Segnalato: «{note}»</p>;
  if (state?.ok) return <p className="text-xs text-ok">{state.ok}</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted underline">
        <CircleSlash className="size-3.5" aria-hidden /> Non posso
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <div className="min-w-60 flex-1">
        <input name="note" autoFocus placeholder="Perché? (es. aspetto il materiale dal cliente)" aria-label="Motivo" className={inputClass} />
        {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
      </div>
      <button type="submit" disabled={pending} className={buttonClass.secondary}>
        Invia al PM
      </button>
      <button type="button" onClick={() => setOpen(false)} className={buttonClass.secondary}>
        Annulla
      </button>
    </form>
  );
}
