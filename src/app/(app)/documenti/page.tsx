import { Check, Download, FileStack, RotateCcw, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DocumentUpload } from "@/components/documents/DocumentUpload";
import { buttonClass, inputClass } from "@/components/registry/ui";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { requireModule } from "@/server/context";
import { fileCategory, listDocuments, searchDocuments } from "@/server/documents/service";
import { canIn, getProject, listProjects } from "@/server/projects/service";
import { approveAction, deleteAction, revertAction } from "./actions";

export const metadata: Metadata = { title: "Documenti" };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ progetto?: string; q?: string }> }) {
  const ctx = await requireModule("DOCUMENTI");
  const { progetto, q } = await searchParams;

  if (!progetto) {
    const [projects, results] = await Promise.all([
      listProjects(ctx, "aperti"),
      q && q.trim().length >= 2 ? searchDocuments(ctx, q) : Promise.resolve([]),
    ]);
    return (
      <div className="space-y-8">
        <header>
          <p className="label">Modulo · passo 6</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Documenti</h1>
          <p className="mt-2 max-w-prose text-muted">File di progetto e prove di chiusura dei task, su archivio privato. Scegli un progetto o cerca per nome file.</p>
        </header>

        <form method="get" className="flex max-w-md gap-2">
          <input type="search" name="q" defaultValue={q ?? ""} placeholder="Cerca per nome file…" aria-label="Cerca file" className={inputClass} />
          <button type="submit" className={buttonClass.secondary}>Cerca</button>
        </form>

        {q && q.trim().length >= 2 && (
          <section className="space-y-2">
            <h2 className="label">Risultati per «{q}»</h2>
            {results.length === 0 ? (
              <p className="text-sm text-muted">Nessun file trovato.</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {results.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{d.displayName}</p>
                      <p className="truncate text-xs text-muted">
                        <Link href={`/documenti?progetto=${d.project.id}`} className="underline">{d.project.name}</Link> · {d.originalName}
                      </p>
                    </div>
                    <a href={`/api/documenti/${d.id}`} className={buttonClass.secondary}>
                      <Download className="size-4" aria-hidden /> Apri
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="space-y-2">
          <h2 className="label">Progetti</h2>
          {projects.length === 0 ? (
            <p className="text-sm text-muted">Nessun progetto aperto.</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/documenti?progetto=${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-sm text-muted">{p.client?.name ?? "Interno"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  const project = await getProject(ctx, progetto);
  if (!project) {
    return (
      <div className="space-y-4">
        <p className="text-muted">Progetto non trovato.</p>
        <Link href="/documenti" className="underline">Torna ai documenti</Link>
      </div>
    );
  }
  const canWrite = canIn(ctx, project.companyId, "documents:write");
  const groups = await listDocuments(ctx, progetto, q);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/documenti" className="label underline">Documenti</Link>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">{project.name}</h1>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form method="get" className="flex gap-2">
          <input type="hidden" name="progetto" value={progetto} />
          <input type="search" name="q" defaultValue={q ?? ""} placeholder="Cerca in questo progetto…" aria-label="Cerca file" className={inputClass} />
          <button type="submit" className={buttonClass.secondary}>Cerca</button>
        </form>
        <DocumentUpload projectId={progetto} />
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted">
          {q ? "Nessun file trovato." : "Nessun file caricato per questo progetto."}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {groups.map(({ latest, history }) => (
            <li key={latest.groupKey} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold">
                    {latest.displayName}
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        latest.status === "APPROVATO" ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn",
                      )}
                    >
                      {latest.status === "APPROVATO" ? "Approvato" : "In lavorazione"}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted">
                    {latest.originalName} · {fileCategory(latest.originalName)} · <span className="num">{formatBytes(latest.size)}</span> ·{" "}
                    {latest.uploadedBy?.name ?? "—"} · {formatDay(latest.createdAt)}
                    {latest.task && <> · prova di «{latest.task.title}»</>}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <a href={`/api/documenti/${latest.id}`} title="Apri" aria-label="Apri file" className={buttonClass.secondary}>
                    <Download className="size-4" aria-hidden />
                  </a>
                  {canWrite && (
                    <form action={latest.status === "APPROVATO" ? revertAction : approveAction}>
                      <input type="hidden" name="id" value={latest.id} />
                      <button
                        type="submit"
                        title={latest.status === "APPROVATO" ? "Riporta in lavorazione" : "Segna come approvato"}
                        className={buttonClass.secondary}
                      >
                        {latest.status === "APPROVATO" ? <RotateCcw className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
                      </button>
                    </form>
                  )}
                  {canWrite && (
                    <form action={deleteAction}>
                      <input type="hidden" name="id" value={latest.id} />
                      <button type="submit" title="Elimina" aria-label="Elimina file" className={buttonClass.secondary}>
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </form>
                  )}
                </div>
              </div>
              {history.length > 0 && (
                <details className="text-xs text-muted">
                  <summary className="inline-flex cursor-pointer items-center gap-1">
                    <FileStack className="size-3.5" aria-hidden />
                    <span className="num">{history.length}</span> versione{history.length > 1 ? "i" : ""} precedente{history.length > 1 ? "i" : ""}
                  </summary>
                  <ul className="mt-2 space-y-1 pl-5">
                    {history.map((v) => (
                      <li key={v.id} className="flex items-center justify-between gap-3">
                        <span>
                          v{v.version} · {v.uploadedBy?.name ?? "—"} · {formatDay(v.createdAt)}
                        </span>
                        <a href={`/api/documenti/${v.id}`} className="underline">Apri</a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
