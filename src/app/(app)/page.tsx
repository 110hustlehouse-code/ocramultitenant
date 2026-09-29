import type { Metadata } from "next";
import { MODULES } from "@/lib/modules";
import { cn } from "@/lib/cn";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { getContext, hasModuleAccess } from "@/server/context";

export const metadata: Metadata = { title: "Panoramica" };

export default async function OverviewPage() {
  const ctx = await getContext();
  const scope =
    ctx.view.kind === "all" ? ctx.view.companies.map((c) => c.name).join(" · ") : ctx.view.company.name;
  const firstName = ctx.user.name.split(" ")[0];

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <p className="label">{scope}</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight md:text-4xl">
          Ciao {firstName}
        </h1>
        <p className="text-muted">
          {ctx.role ? (
            <>
              Accesso come <strong className="text-text">{ROLE_LABELS[ctx.role]}</strong> in {scope}
            </>
          ) : (
            <>
              <strong className="text-text">Vista consolidata</strong>
            </>
          )}{" "}
          · {ctx.tenant.name}
        </p>
      </header>

      {/* Il margine è la prima cosa che si vede (principio 2). Solo per chi ha i dati economici. */}
      {ctx.can("finance:read") && (
        <section aria-labelledby="margin-title" className="rounded-xl border border-border bg-surface p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="margin-title" className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Margine a rischio
            </h2>
            <span className="label">in arrivo</span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              { label: "Progetti a rischio", tone: "text-danger" },
              { label: "In attenzione", tone: "text-warn" },
              { label: "In linea", tone: "text-ok" },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-lg bg-surface-2 p-4">
                <p className="label">{kpi.label}</p>
                <p className={cn("num mt-1 text-3xl font-bold", kpi.tone)}>—</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="modules-title" className="space-y-4">
        <h2 id="modules-title" className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Moduli
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li className="rounded-xl border border-border bg-surface p-4">
            <p className="label">Passo 1</p>
            <p className="mt-1 font-semibold">Accesso, società e ruoli</p>
            <p className="mt-2 text-sm text-ok">Attivo</p>
          </li>
          {MODULES.filter((m) => hasModuleAccess(ctx, m.key)).map((m) => (
            <li key={m.key} className="rounded-xl border border-border bg-surface p-4">
              <p className="label">Passo {m.step}</p>
              <p className="mt-1 font-semibold">{m.label}</p>
              <p className="mt-2 text-sm text-muted">{m.ready ? "Attivo" : "In costruzione"}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
