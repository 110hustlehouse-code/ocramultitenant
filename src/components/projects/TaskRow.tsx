"use client";

import { Check, Link2, Paperclip, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { buttonClass, inputClass } from "@/components/registry/ui";
import { FollowUpControl, type FollowUpActive, type FollowUpStart } from "@/components/followups/FollowUpControl";
import { BlockerButton } from "@/components/reminders/BlockerButton";
import { cn } from "@/lib/cn";
import {
  completeTaskAction,
  completeTaskWithFileAction,
  deleteTaskAction,
  reopenTaskAction,
  requestTaskProofUploadAction,
  saveTaskAction,
  type CompleteState,
  type TaskFormState,
} from "@/app/(app)/progetti/actions";

export type TaskRowData = {
  id: string;
  title: string;
  description: string | null;
  status: "DA_FARE" | "FATTO";
  priority: "NORMALE" | "ALTA" | "URGENTE";
  dueLabel: string | null;
  /** Scadenza in formato AAAA-MM-GG, per precompilare il form di modifica (solo se canManage) */
  dueDateValue?: string;
  assigneeId?: string | null;
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
  projectId = "",
  people = [],
  canComplete,
  canManage,
  own = false,
  documentsEnabled = false,
}: {
  task: TaskRowData;
  /** Necessario per il form di modifica (saveTaskAction). Assente nelle viste dove canManage è sempre false. */
  projectId?: string;
  /** Persone assegnabili: solo se canManage */
  people?: { id: string; name: string }[];
  canComplete: boolean;
  canManage: boolean;
  /** Task dell'utente: può segnalare «Non posso» */
  own?: boolean;
  /** Modulo Documenti attivo: nel form di chiusura si può allegare un file come prova */
  documentsEnabled?: boolean;
}) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<CompleteState, FormData>(completeTaskAction, undefined);
  const [editState, editAction, editPending] = useActionState<TaskFormState, FormData>(saveTaskAction, undefined);
  const [ackEditOk, setAckEditOk] = useState<number | undefined>(undefined);
  const [fileUpload, setFileUpload] = useState<{ progress: number | null; error: string | null }>({ progress: null, error: null });
  const done = task.status === "FATTO";

  async function closeWithFile(file: File) {
    setFileUpload({ progress: 0, error: null });
    const meta = { name: file.name, type: file.type || "application/octet-stream", size: file.size };
    const res = await requestTaskProofUploadAction(projectId, meta);
    if (!res.url || !res.key) {
      setFileUpload({ progress: null, error: res.error ?? "Caricamento non disponibile." });
      return;
    }
    const ok = await new Promise<boolean>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", res.url!);
      xhr.setRequestHeader("Content-Type", meta.type);
      xhr.upload.onprogress = (e) => e.lengthComputable && setFileUpload({ progress: Math.round((e.loaded / e.total) * 100), error: null });
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.send(file);
    });
    if (!ok) {
      setFileUpload({ progress: null, error: "Caricamento non riuscito. Controlla la connessione e riprova." });
      return;
    }
    const result = await completeTaskWithFileAction(task.id, res.key, meta);
    if (result?.message) {
      setFileUpload({ progress: null, error: result.message });
      return;
    }
    setFileUpload({ progress: null, error: null });
    setClosing(false);
    router.refresh();
  }

  // Chiude il form di modifica dopo un salvataggio riuscito (senza useEffect: si aggiorna durante il render).
  if (editState?.ok && editState.ok !== ackEditOk) {
    setAckEditOk(editState.ok);
    setEditing(false);
  }

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
          {canManage && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Modifica"
              aria-label="Modifica task"
              className={buttonClass.secondary}
            >
              <Pencil className="size-4" aria-hidden />
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
        <div className="space-y-2 pl-5">
          <form action={action} className="flex flex-wrap items-start gap-2">
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
          {documentsEnabled && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <label className="inline-flex cursor-pointer items-center gap-1 underline">
                <Paperclip className="size-3.5" aria-hidden />
                oppure allega un file come prova
                <input
                  type="file"
                  className="sr-only"
                  disabled={fileUpload.progress !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void closeWithFile(f);
                  }}
                />
              </label>
              {fileUpload.progress !== null && <span className="num">{fileUpload.progress}%</span>}
              {fileUpload.error && <span className="text-danger">{fileUpload.error}</span>}
            </div>
          )}
        </div>
      )}

      {editing && (
        <form action={editAction} className="space-y-2 pl-5">
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="projectId" value={projectId} />
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_150px_130px]">
            <input
              name="title"
              defaultValue={task.title}
              autoFocus
              aria-label="Titolo del task"
              className={inputClass}
            />
            <select name="assigneeId" aria-label="Assegnato a" className={inputClass} defaultValue={task.assigneeId ?? ""}>
              <option value="">Non assegnato</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input name="dueDate" type="date" defaultValue={task.dueDateValue ?? ""} aria-label="Scadenza" className={inputClass} />
            <select name="priority" aria-label="Priorità" className={inputClass} defaultValue={task.priority}>
              <option value="NORMALE">Normale</option>
              <option value="ALTA">Alta</option>
              <option value="URGENTE">Urgente</option>
            </select>
          </div>
          <textarea
            name="description"
            rows={2}
            defaultValue={task.description ?? ""}
            placeholder="Descrizione (facoltativa)…"
            aria-label="Descrizione del task"
            className={inputClass}
          />
          {(editState?.errors?.title || editState?.message) && (
            <p className="text-xs text-danger">{editState?.errors?.title ?? editState?.message}</p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={editPending} className={buttonClass.primary}>
              {editPending ? "…" : "Salva"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className={buttonClass.secondary}>
              Annulla
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

const PRIORITY = { NORMALE: "Normale", ALTA: "Priorità alta", URGENTE: "Urgente" } as const;
