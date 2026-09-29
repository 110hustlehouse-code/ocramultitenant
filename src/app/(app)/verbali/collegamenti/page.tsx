import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IntegrationForm } from "@/components/meetings/IntegrationForm";
import { buttonClass } from "@/components/registry/ui";
import { formatDay } from "@/lib/dates";
import { requireModule } from "@/server/context";
import { listIntegrations } from "@/server/meetings/integrations";
import { canIn } from "@/server/projects/service";
import { appUrl } from "@/server/reminders/engine";
import { disableIntegrationAction } from "../actions";

export const metadata: Metadata = { title: "Collegamenti verbali" };

const EXAMPLE = `{
  "id": "riunione-123",
  "title": "Produzione Nora",
  "date": "2026-09-29T10:00:00Z",
  "project": "FL/COMUNIC/01-2026/NORA/E",
  "participants": ["Erika", "Marco Villa"],
  "sentences": [
    { "speaker": "Erika", "start": 12, "text": "Marco, il montaggio entro venerdì." }
  ]
}`;

export default async function Page() {
  const ctx = await requireModule("VERBALI");
  const companies = ctx.access.filter((a) => canIn(ctx, a.company.id, "settings:manage")).map((a) => a.company);
  if (companies.length === 0) notFound();
  const [integrations, projects] = await Promise.all([
    listIntegrations(ctx),
    ctx.db.project.findMany({
      where: { companyId: { in: companies.map((c) => c.id) }, status: { in: ["ATTIVO", "IN_PAUSA"] } },
      select: { id: true, name: true, companyId: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const endpoint = `${appUrl(ctx.tenant.domain)}/api/webhooks/verbali`;

  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <p className="label">Verbali</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Collegamenti</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Un servizio di trascrizione collegato al calendario (Fireflies, o un flusso n8n) manda qui la riunione appena
          finisce. OCRA scrive il verbale e propone i task; il PM li trova in «Da rivedere» e conferma.
        </p>
      </header>

      {integrations.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {integrations.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">
                  {i.name} {!i.active && <span className="label text-muted">disattivato</span>}
                </p>
                <p className="text-xs text-muted">
                  {i.company.name}
                  {i.project && <> · {i.project.name}</>} · token …{i.tokenHint} ·{" "}
                  <span className="num">{i._count.meetings}</span> riunioni
                  {i.lastUsedAt && <> · ultima {formatDay(i.lastUsedAt)}</>}
                </p>
              </div>
              {i.active && (
                <form action={disableIntegrationAction}>
                  <input type="hidden" name="id" value={i.id} />
                  <button type="submit" className={buttonClass.secondary}>
                    Disattiva
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="new-title" className="space-y-3">
        <h2 id="new-title" className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Nuovo collegamento
        </h2>
        <IntegrationForm companies={companies.map(({ id, name }) => ({ id, name }))} projects={projects} />
      </section>

      <section aria-labelledby="how-title" className="space-y-2 text-sm">
        <h2 id="how-title" className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Come si configura
        </h2>
        <p>
          <span className="label">POST</span> <code className="break-all">{endpoint}</code>
        </p>
        <p>
          Intestazione <code>Authorization: Bearer &lt;token&gt;</code>, corpo JSON. Serve <code>id</code> (lo stesso id
          inviato due volte non crea doppioni) e il testo: <code>transcript</code> già pronto oppure <code>sentences</code>.
          Il resto è facoltativo; <code>project</code> è il codice PO.
        </p>
        <pre className="overflow-x-auto rounded-xl border border-border bg-surface p-4 text-xs">{EXAMPLE}</pre>
      </section>
    </div>
  );
}
