"use client";

import { Hourglass } from "lucide-react";
import { useActionState, useState } from "react";
import { buttonClass, inputClass } from "@/components/registry/ui";
import { firstMessage } from "@/lib/followups";
import { cancelFollowUpAction, resolveFollowUpAction, startFollowUpAction } from "@/app/(app)/solleciti/actions";

export type FollowUpStart = {
  clientName: string;
  contactName: string | null;
  contactEmail: string | null;
  projectName: string;
  companyName: string;
  senderName: string;
};

export type FollowUpActive = { id: string; waitingFor: string; days: number; remindersSent: number; clientName: string };

/**
 * Sollecito al cliente sulla riga del task: «In attesa del cliente» apre il modulo con il messaggio
 * precompilato (modificabile); se l'attesa è in corso mostra da quanto e «Il cliente ha risposto».
 */
export function FollowUpControl({ taskId, active, start }: { taskId: string; active: FollowUpActive | null; start: FollowUpStart | null }) {
  if (active) return <ActiveFollowUp f={active} />;
  if (start) return <StartForm taskId={taskId} start={start} />;
  return null;
}

function ActiveFollowUp({ f }: { f: FollowUpActive }) {
  const [state, action, pending] = useActionState(resolveFollowUpAction, undefined);
  if (state?.ok) return <p className="text-xs text-ok">{state.ok}</p>;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="inline-flex items-center gap-1 font-semibold text-warn">
        <Hourglass className="size-3.5" aria-hidden />
        In attesa di {f.clientName}
        {f.days > 0 && (
          <>
            {" "}
            da <span className="num">{f.days}</span> {f.days === 1 ? "giorno" : "giorni"}
          </>
        )}
        : «{f.waitingFor}»
        {f.remindersSent > 0 && (
          <span className="font-normal text-muted">
            {" "}
            · <span className="num">{f.remindersSent}</span> promemoria
          </span>
        )}
      </span>
      <form action={action}>
        <input type="hidden" name="id" value={f.id} />
        <button type="submit" disabled={pending} className="text-muted underline">
          Il cliente ha risposto
        </button>
      </form>
      <form action={cancelFollowUpAction}>
        <input type="hidden" name="id" value={f.id} />
        <button type="submit" className="text-muted underline">
          Annulla
        </button>
      </form>
      {state?.error && <span className="text-danger">{state.error}</span>}
    </div>
  );
}

function StartForm({ taskId, start }: { taskId: string; start: FollowUpStart }) {
  const [open, setOpen] = useState(false);
  const [waitingFor, setWaitingFor] = useState("");
  const [contactName, setContactName] = useState(start.contactName ?? "");
  // Il testo si aggiorna mentre si scrive cosa si aspetta, finché la persona non lo modifica a mano.
  const [edited, setEdited] = useState<{ subject: string; body: string } | null>(null);
  const [state, action, pending] = useActionState(startFollowUpAction, undefined);

  if (state?.ok) return <p className="text-xs text-ok">{state.ok}</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted underline">
        <Hourglass className="size-3.5" aria-hidden /> In attesa del cliente
      </button>
    );
  }

  const draft = firstMessage({
    contactName: contactName || null,
    projectName: start.projectName,
    waitingFor: waitingFor || "…",
    senderName: start.senderName,
    companyName: start.companyName,
  });
  const subject = edited?.subject ?? draft.subject;
  const body = edited?.body ?? draft.body;

  return (
    <form action={action} className="mt-2 w-full basis-full space-y-3 rounded-lg border border-border bg-surface-2 p-3">
      <input type="hidden" name="taskId" value={taskId} />
      <p className="text-sm">
        Scrivi a <strong>{start.clientName}</strong>. Il messaggio parte dalla tua società, le risposte arrivano a te. Se il
        cliente non risponde, dopo 3 giorni lavorativi parte un promemoria (al massimo 2), poi l&apos;attesa passa al PM.
      </p>
      <label className="block space-y-1">
        <span className="label">Cosa aspetti dal cliente</span>
        <input
          name="waitingFor"
          value={waitingFor}
          onChange={(e) => setWaitingFor(e.target.value)}
          autoFocus
          placeholder="es. l'approvazione del montaggio v1"
          className={inputClass}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="label">Referente</span>
          <input name="contactName" value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="label">Email del referente</span>
          <input name="contactEmail" type="email" defaultValue={start.contactEmail ?? ""} required className={inputClass} />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="label">Oggetto</span>
        <input name="subject" value={subject} onChange={(e) => setEdited({ subject: e.target.value, body })} className={inputClass} />
      </label>
      <label className="block space-y-1">
        <span className="label">Messaggio</span>
        <textarea name="body" rows={9} value={body} onChange={(e) => setEdited({ subject, body: e.target.value })} className={inputClass} />
      </label>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending || waitingFor.trim().length < 3} className={buttonClass.primary}>
          {pending ? "Invio…" : "Invia al cliente"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass.secondary}>
          Annulla
        </button>
      </div>
    </form>
  );
}
