import type { ModuleKey } from "@/generated/prisma/enums";
import { getModule } from "@/lib/modules";

/** Segnaposto per i moduli non ancora costruiti. Si elimina modulo per modulo. */
export function ModulePlaceholder({ moduleKey }: { moduleKey: ModuleKey }) {
  const mod = getModule(moduleKey);
  return (
    <section className="space-y-6">
      <header>
        <p className="label">Modulo · passo {mod.step}</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">{mod.label}</h1>
      </header>
      <div className="rounded-xl border border-dashed border-border bg-surface p-6">
        <p className="max-w-prose text-muted">{mod.summary}</p>
        <p className="label mt-4">In costruzione</p>
      </div>
    </section>
  );
}
