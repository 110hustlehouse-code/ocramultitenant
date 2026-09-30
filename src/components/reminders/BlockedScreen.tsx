import { TaskRow } from "@/components/projects/TaskRow";
import { formatDay } from "@/lib/dates";
import { isOverdue } from "@/server/projects/input";
import { activeBlocksFor } from "@/server/reminders/service";
import type { AppContext } from "@/server/context";

/**
 * Cosa vede un account bloccato: solo i task da consegnare. Tono di coordinamento
 * (i collaboratori sono partite IVA): niente minacce, solo cosa serve per ripartire.
 */
export async function BlockedScreen({ ctx }: { ctx: AppContext }) {
  const blocks = await activeBlocksFor(ctx);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <p className="label text-danger">Accesso limitato</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Prima questa consegna</h1>
        <p className="text-muted">
          {blocks[0]?.blockedBy.name ?? "Il project manager"} ha chiesto di chiudere prima questo lavoro. Quando lo consegni
          (link al file o nota), OCRA torna disponibile da solo. Se c&apos;è un impedimento, usa «Non posso» e spiega il motivo.
        </p>
      </header>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {blocks.map((b) => (
          <TaskRow
            key={b.id}
            own
            projectId={b.task.project.id}
            documentsEnabled={ctx.tenant.modules.includes("DOCUMENTI")}
            canComplete
            canManage={false}
            task={{
              id: b.task.id,
              title: b.task.title,
              description: b.reason,
              status: b.task.status,
              priority: b.task.priority,
              dueLabel: formatDay(b.task.dueDate),
              overdue: isOverdue(b.task),
              proof: null,
              completedByName: null,
              context: b.task.project.name,
            }}
          />
        ))}
      </ul>
    </div>
  );
}
