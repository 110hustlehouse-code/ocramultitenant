import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { getContext } from "@/server/context";
import { manageableCompanies } from "@/server/users/service";

export const metadata: Metadata = { title: "Impostazioni" };

/** Area CEO-only: chi gestisce le impostazioni di almeno una società (permesso settings:manage). */
export default async function ImpostazioniLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  if (manageableCompanies(ctx).length === 0) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <p className="label">Impostazioni</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Impostazioni</h1>
      </header>
      <SettingsNav />
      {children}
    </div>
  );
}
