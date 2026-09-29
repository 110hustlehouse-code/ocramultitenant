"use client";

import { Check, Link2, RotateCcw, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { buttonClass, inputClass } from "@/components/registry/ui";
import { FollowUpControl, type FollowUpActive, type FollowUpStart } from "@/components/followups/FollowUpControl";
import { BlockerButton } from "@/components/reminders/BlockerButton";
import { cn } from "@/lib/cn";
import {
  completeTaskAction,
  deleteTaskAction,
  reopenTaskAction,
  type CompleteState,
} from "@/app/(app)/progetti/actions";

export type TaskRowData = {
  id: string;
  title: string;
  description: string | null;
  status: "DA_FARE" | "FATTO";
  priority: "NORMALE" | "ALTA" | "URGENTE";
  dueLabel: string | null;
  overdue: boolean;
  /** undefined = non mostrare (vista «I miei task») */
  assigneeName?: string | null;
  proof: string | null;
  completedByName: string | null;
  /** Etichetta di contesto (es. nome progetto nella vista «I miei task») */
  context?: string;
  contextHref?: string;
  /** «Non posso» già segnalato */
  blockerNote?: string | null;
  /** Livello di richiamo (3 = al PM, 4 = al CEO) */
  escalation?: number;
  /** Sollecito al cliente in corso */
  followUp?: FollowUpActive | null;
  /** Dati per avviare un sollecito (null = non può, o progetto senza cliente) */
  followUpStart?: FollowUpStart | null;
};

const isUrl = (s: string) => /^https?:\/\//i.test(s);

export function TaskRow({
  task,
  canComplete,
  canManage,
  own = false,
}: {
  task: TaskRowData;
  canComplete: boolean;
  canManage: boolean;
  /** Task dell'utente: può segnalare «Non posso» */
  own?: boolean;
}) {
  const [closing, setClosing] = useState(false);
  const [state, action, pending] = useActionState<CompleteState, FormData>(completeTaskAction, undefined);
  const done = task.status === "FATTO";

  return (
    <li className={cn("space-y-2 px-4 py-3", done && "opacity-70")}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "mt-1 size-2.5 shrink-0 rounded-full",
            done ? "bg-ok" : task.overdue ? "bg-danger" : task.priority === "URGENTE" ? "bg-warn" : "bg-border",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className={cn("font-semibold", done && "line-through")}>{task.title}</p>
          <p className="text-xs text-muted">
            {[
              task.context && (
                <a key="c" href={task.contextHref} className="underline">
                  {task.context}
                </a>
              ),
              task.assigneeName === undefined ? null : (task.assigneeName ?? "Non assegnato"),
              task.dueLabel && (
                <span key="d" className={cn(task.overdue && "font-semibold text-danger")}>
                  {task.overdue ? "Scaduto " : "Entro "}
                  {task.dueLabel}
                </span>
              ),
              task.priority !== "NORMALE" && PRIORITY[task.priority],
            ]
              .filter(Boolean)
              .map((part, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {part}
                </span>
              ))}
          </p>
          {task.description && <p className="mt-1 text-sm text-muted">{task.description}</p>}
          {!done && canManage && (task.escalation ?? 0) >= 3 && (
            <p className="mt-1 text-xs font-semibold text-warn">
              {task.escalation === 4 ? "Passato al CEO" : task.blockerNote ? `Non può: «${task.blockerNote}»` : "Da gestire: già due promemoria"}
            </p>
          )}
          {!done && (task.followUp || task.followUpStart || (own && !canManage)) && (
            <div className="mt-1 flex flex-wrap items-start gap-x-4 gap-y-1">
              {own && !canManage && !task.followUp && <BlockerButton taskId={task.id} note={task.blockerNote ?? null} />}
              <FollowUpControl taskId={task.id} active={task.followUp ?? null} start={task.followUpStart ?? null} />
            </div>
          )}
          {done && task.proof && (
            <p className="mt-1 flex items-center gap-1 text-sm">
              <Link2 className="size-3.5 text-ok" aria-hidden />
              {isUrl(task.proof) ? (
                <a href={task.proof} target="_blank" rel="noreferrer" className="truncate underline">
                  {task.proof}
                </a>
              ) : (
                <span className="truncate">{task.proof}</span>
              )}
              {task.completedByName && <span className="text-xs text-muted">· {task.completedByName}</span>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          {!done && canComplete && !closing && (
            <button type="button" onClick={() => setClosing(true)} className={buttonClass.secondary}>
              <Check className="size-4" aria-hidden /> Fatto
            </button>
          )}
          {done && (canComplete || canManage) && (
            <form action={reopenTaskAction}>
              <input type="hidden" name="taskId" value={task.id} />
              <button type="submit" title="Riapri" aria-label="Riapri" className={buttonClass.secondary}>
                <RotateCcw className="size-4" aria-hidden />
              </button>
            </form>
          )}
          {canManage && (
            <form action={deleteTaskAction}>
              <input type="hidden" name="taskId" value={task.id} />
              <button type="submit" title="Elimina" aria-label="Elimina task" className={buttonClass.secondary}>
                <Trash2 className="size-4" aria-hidden />
              </button>
            </form>
          )}
        </div>
      </div>

      {closing && !done && (
        <form action={action} className="flex flex-wrap items-start gap-2 pl-5">
          <input type="hidden" name="taskId" value={task.id} />
          <div className="min-w-60 flex-1">
            <input
              name="proof"
              autoFocus
              placeholder="Link al file consegnato o nota breve"
              aria-label="Prova di chiusura"
              className={inputClass}
            />
            {state?.message && <p className="mt-1 text-xs text-danger">{state.message}</p>}
          </div>
          <button type="submit" disabled={pending} className={buttonClass.primary}>
            {pending ? "…" : "Chiudi task"}
          </button>
          <button type="button" onClick={() => setClosing(false)} className={buttonClass.secondary}>
            Annulla
          </button>
        </form>
      )}
    </li>
  );
}

const PRIORITY = { NORMALE: "Normale", ALTA: "Priorità alta", URGENTE: "Urgente" } as const;
