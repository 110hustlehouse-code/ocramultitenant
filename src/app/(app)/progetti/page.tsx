import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TaskRow } from "@/components/projects/TaskRow";
import { ButtonLink, CompanyTag } from "@/components/registry/ui";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { requireModule } from "@/server/context";
import { isOverdue, STATUS_LABELS } from "@/server/projects/input";
import { activeFollowUpsFor, canStartFollowUp } from "@/server/followups/service";
import { canIn, listProjects, myOpenTasks } from "@/server/projects/service";
import { viewCompanies } from "@/server/registry/service";

export const metadata: Metadata = { title: "Progetti e task" };

export default async function Page({ searchParams }: { searchParams: Promise<{ stato?: string }> }) {
  const ctx = await requireModule("PROGETTI");
  const stato = (await searchParams).stato === "chiusi" ? "chiusi" : "aperti";
  const [projects, mine] = await Promise.all([listProjects(ctx, stato), myOpenTasks(ctx)]);
  const companies = new Map(ctx.companies.map((c) => [c.id, c]));
  const canCreate = viewCompanies(ctx).some((c) => canIn(ctx, c.id, "projects:write"));
  const followUps = await activeFollowUpsFor(ctx, mine.map((t) => t.id));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Lavoro</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Progetti e task</h1>
        </div>
        {canCreate && (
          <ButtonLink href="/progetti/nuovo" variant="primary">
            <Plus className="size-4" aria-hidden /> Nuovo progetto
          </ButtonLink>
        )}
      </header>

      {mine.length > 0 && (
        <section aria-labelledby="mine-title" className="space-y-3">
          <h2 id="mine-title" className="font-[family-name:var(--font-display)] text-lg font-semibold">
            I tuoi task <span className="num text-muted">{mine.length}</span>
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {mine.map((t) => (
              <TaskRow
                key={t.id}
                projectId={t.project.id}
                documentsEnabled={ctx.tenant.modules.includes("DOCUMENTI")}
                canComplete
                canManage={false}
                own
                task={{
                  id: t.id,
                  title: t.title,
                  description: null,
                  status: t.status,
                  priority: t.priority,
                  dueLabel: formatDay(t.dueDate),
                  overdue: isOverdue(t),
                  proof: null,
                  completedByName: null,
                  context: `${companies.get(t.project.companyId)?.poPrefix ?? ""} · ${t.project.name}`,
                  contextHref: `/progetti/${t.project.id}`,
                  blockerNote: t.blockerNote,
                  followUp: followUps.get(t.id) ?? null,
                  followUpStart:
                    t.project.client && canStartFollowUp(ctx, t, t.project.companyId, true)
                      ? {
                          clientName: t.project.client.name,
                          contactName: t.project.client.contactName,
                          contactEmail: t.project.client.email,
                          projectName: t.project.name,
                          companyName: t.project.company.name,
                          senderName: ctx.user.name,
                        }
                      : null,
                }}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="projects-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="projects-title" className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Progetti
          </h2>
          <nav aria-label="Stato" className="inline-flex rounded-lg border border-border bg-surface p-1">
            {(["aperti", "chiusi"] as const).map((s) => (
              <Link
                key={s}
                href={`/progetti?stato=${s}`}
                aria-current={s === stato ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-semibold capitalize",
                  s === stato ? "bg-brand text-on-brand" : "text-muted hover:text-text",
                )}
              >
                {s}
              </Link>
            ))}
          </nav>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
            <p className="font-semibold">{stato === "aperti" ? "Nessun progetto aperto." : "Nessun progetto chiuso."}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {projects.map((p) => {
              const overdue = p.tasks.filter((t) => isOverdue({ status: "DA_FARE", dueDate: t.dueDate })).length;
              const projectLate = p.dueDate && isOverdue({ status: "DA_FARE", dueDate: p.dueDate });
              const c = companies.get(p.companyId);
              return (
                <li key={p.id}>
                  <Link
                    href={`/progetti/${p.id}`}
                    className="grid gap-2 px-4 py-3 hover:bg-surface-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_120px_140px] md:items-center md:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate font-semibold">
                        {p.name}
                        {p.status !== "ATTIVO" && <span className="label">{STATUS_LABELS[p.status]}</span>}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {[p.client?.name ?? "Interno", p.service, p.code].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                      {c && <CompanyTag name={c.name} short={c.poPrefix ?? c.name} color={c.colorLight} />}
                      <span className="truncate text-muted">{p.manager?.name}</span>
                    </div>
                    <p className={cn("num text-sm", projectLate ? "font-semibold text-danger" : "text-muted")}>
                      {formatDay(p.dueDate) ?? "—"}
                    </p>
                    <p className="text-sm">
                      <span className="num">{p.tasks.length}</span> <span className="text-muted">aperti</span>
                      {overdue > 0 && (
                        <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                          <span className="num">{overdue}</span> scaduti
                        </span>
                      )}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
