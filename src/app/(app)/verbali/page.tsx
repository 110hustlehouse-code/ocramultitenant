import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, CompanyTag } from "@/components/registry/ui";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { MEETING_STATUS } from "@/lib/meetings";
import { requireModule } from "@/server/context";
import { listMeetings } from "@/server/meetings/service";
import { canIn } from "@/server/projects/service";
import { viewCompanies } from "@/server/registry/service";

export const metadata: Metadata = { title: "Verbali" };


export default async function Page() {
  const ctx = await requireModule("VERBALI");
  const meetings = await listMeetings(ctx);
  const canCreate = viewCompanies(ctx).some((c) => canIn(ctx, c.id, "meetings:write"));
  const companies = new Map(ctx.companies.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Riunioni</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Verbali</h1>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Registri la riunione, OCRA scrive il verbale e propone i task con responsabile e scadenza. Tu confermi.
          </p>
        </div>
        {canCreate && (
          <ButtonLink href="/verbali/nuovo" variant="primary">
            <Plus className="size-4" aria-hidden /> Nuova riunione
          </ButtonLink>
        )}
      </header>

      {meetings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <p className="font-semibold">Nessun verbale ancora.</p>
          <p className="mt-1 text-sm text-muted">Alla prossima riunione premi «Nuova riunione» e registra.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {meetings.map((m) => {
            const c = companies.get(m.companyId);
            const s = MEETING_STATUS[m.status];
            return (
              <li key={m.id}>
                <Link
                  href={`/verbali/${m.id}`}
                  className="grid gap-1 px-4 py-3 hover:bg-surface-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_110px_140px] md:items-center md:gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{m.title}</p>
                    <p className="truncate text-xs text-muted">{m.project?.name ?? "Riunione interna"}</p>
                  </div>
                  <div>{c && <CompanyTag name={c.name} short={c.poPrefix ?? c.name} color={c.colorLight} />}</div>
                  <p className="num text-sm text-muted">{formatDay(m.heldAt)}</p>
                  <p className={cn("text-sm font-semibold", s.tone)}>
                    {s.label}
                    {m._count.tasks > 0 && <span className="num font-normal text-muted"> · {m._count.tasks} task</span>}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
