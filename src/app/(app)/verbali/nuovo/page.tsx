import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewMeetingForm } from "@/components/meetings/NewMeetingForm";
import { requireModule } from "@/server/context";
import { canIn } from "@/server/projects/service";
import { viewCompanies } from "@/server/registry/service";

export const metadata: Metadata = { title: "Nuova riunione" };

export default async function Page({ searchParams }: { searchParams: Promise<{ progetto?: string }> }) {
  const ctx = await requireModule("VERBALI");
  const companies = viewCompanies(ctx).filter((c) => canIn(ctx, c.id, "meetings:write"));
  if (companies.length === 0) notFound();
  const projects = await ctx.db.project.findMany({
    where: { companyId: { in: companies.map((c) => c.id) }, status: { in: ["ATTIVO", "IN_PAUSA"] } },
    select: { id: true, name: true, companyId: true },
    orderBy: { name: "asc" },
  });
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const label = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" });

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <p className="label">Verbali</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Nuova riunione</h1>
      </header>
      <NewMeetingForm
        companies={companies.map(({ id, name }) => ({ id, name }))}
        projects={projects}
        defaults={{ title: `Riunione del ${label}`, heldAt: today, projectId: (await searchParams).progetto ?? "" }}
      />
    </div>
  );
}
