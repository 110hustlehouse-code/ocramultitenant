"use client";

import { useActionState } from "react";
import { buttonClass, inputClass } from "@/components/registry/ui";
import { cn } from "@/lib/cn";
import {
  blockAction,
  escalateAction,
  nudgeAction,
  rescheduleAction,
} from "@/app/(app)/richiami/actions";

export type HandleTask = {
  id: string;
  title: string;
  projectName: string;
  projectHref: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueLabel: string | null;
  dueInput: string;
  escalation: number;
  blockerNote: string | null;
  blocked: boolean;
};

export type Situation = {
  open: number;
  overdue: number;
  doneLast60: number;
  onTime: number | null;
  activeProjects: number;
  blocksLast60: number;
};

/** Un task da gestire: il PM sollecita, blocca, sposta o passa al CEO; il CEO decide con la situazione davanti. */
export function HandleCard({
  task,
  people,
  canBlock,
  canEscalate,
  situation,
}: {
  task: HandleTask;
  people: { id: string; name: string }[];
  canBlock: boolean;
  canEscalate: boolean;
  situation?: Situation;
}) {
  const [nudgeState, nudgeForm, nudging] = useActionState(nudgeAction, undefined);
  const [moveState, moveForm, moving] = useActionState(rescheduleAction, undefined);
  const badge = task.blockerNote
    ? { text: `Non può: «${task.blockerNote}»`, tone: "text-warn" }
    : task.escalation === 4
      ? { text: "Da decidere (CEO)", tone: "text-danger" }
      : { text: "Due promemoria senza risposta", tone: "text-warn" };

  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{task.title}</p>
          <p className="text-xs text-muted">
            {task.assigneeName ?? "Non assegnato"} ·{" "}
            <a href={task.projectHref} className="underline">
              {task.projectName}
            </a>
            {task.dueLabel && <> · scadenza {task.dueLabel}</>}
          </p>
          <p className={cn("mt-1 text-xs font-semibold", badge.tone)}>{badge.text}</p>
        </div>
        {task.blocked && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">Account bloccato</span>}
      </div>

      {situation && (
        <dl className="grid grid-cols-3 gap-2 rounded-lg bg-surface-2 p-3 text-center text-xs sm:grid-cols-6">
          {[
            ["Aperti", situation.open],
            ["Scaduti", situation.overdue],
            ["Chiusi 60 gg", situation.doneLast60],
            ["Puntualità", situation.onTime === null ? "—" : `${situation.onTime}%`],
            ["Progetti", situation.activeProjects],
            ["Blocchi 60 gg", situation.blocksLast60],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="label">{label}</dt>
              <dd className="num mt-0.5 text-base font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <form action={nudgeForm} className="flex gap-2">
          <input type="hidden" name="taskId" value={task.id} />
          <input name="message" placeholder="Messaggio (facoltativo)" aria-label="Messaggio al collaboratore" className={inputClass} />
          <button type="submit" disabled={nudging || !task.assigneeId} className={buttonClass.secondary}>
            Richiama
          </button>
        </form>
        <form action={moveForm} className="flex gap-2">
          <input type="hidden" name="taskId" value={task.id} />
          <input type="date" name="dueDate" defaultValue={task.dueInput} aria-label="Nuova scadenza" className={inputClass} />
          <select name="assigneeId" defaultValue={task.assigneeId ?? ""} aria-label="Assegna a" className={inputClass}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={moving} className={buttonClass.secondary}>
            Aggiorna
          </button>
        </form>
      </div>
      {(nudgeState?.error || nudgeState?.ok || moveState?.error || moveState?.ok) && (
        <p className={cn("text-xs", nudgeState?.error || moveState?.error ? "text-danger" : "text-ok")}>
          {nudgeState?.error ?? moveState?.error ?? nudgeState?.ok ?? moveState?.ok}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {canBlock && !task.blocked && task.assigneeId && (
          <form action={blockAction} className="flex gap-2">
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="reason" value="Da consegnare prima di tutto il resto" />
            <button type="submit" className={buttonClass.danger}>
              Blocca account fino alla consegna
            </button>
          </form>
        )}
        {canEscalate && task.escalation < 4 && (
          <form action={escalateAction}>
            <input type="hidden" name="taskId" value={task.id} />
            <button type="submit" className={buttonClass.secondary}>
              Passa al CEO
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
