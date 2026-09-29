import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { CompanyTag } from "@/components/registry/ui";
import { cn } from "@/lib/cn";
import { requireModule } from "@/server/context";
import { assignableUsers, canIn, clientsFor } from "@/server/projects/service";
import { viewCompanies } from "@/server/registry/service";

export const metadata: Metadata = { title: "Nuovo progetto" };

export default async function Page({ searchParams }: { searchParams: Promise<{ societa?: string }> }) {
  const ctx = await requireModule("PROGETTI");
  const writable = viewCompanies(ctx).filter((c) => canIn(ctx, c.id, "projects:write"));
  if (writable.length === 0) notFound();
  const requested = (await searchParams).societa;
  const company = writable.find((c) => c.slug === requested) ?? writable[0]!;
  const [clients, people] = await Promise.all([clientsFor(ctx, company.id), assignableUsers(ctx, company.id)]);

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-3">
        <p className="label">Progetti</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Nuovo progetto</h1>
        {writable.length > 1 && (
          <nav aria-label="Società" className="flex flex-wrap gap-2">
            {writable.map((c) => (
              <Link
                key={c.id}
                href={`/progetti/nuovo?societa=${c.slug}`}
                aria-current={c.id === company.id ? "page" : undefined}
                className={cn("rounded-full", c.id === company.id ? "ring-2 ring-text" : "opacity-60 hover:opacity-100")}
              >
                <CompanyTag name={c.name} short={c.name} color={c.colorLight} />
              </Link>
            ))}
          </nav>
        )}
      </header>
      <ProjectForm
        clients={clients}
        people={people}
        cancelHref="/progetti"
        values={{
          companyId: company.id,
          name: "",
          clientId: null,
          code: null,
          service: null,
          managerId: ctx.role === "PROJECT_MANAGER" ? ctx.user.id : null,
          startDate: new Date().toISOString().slice(0, 10),
          dueDate: "",
          notes: null,
          memberIds: [],
        }}
      />
    </div>
  );
}
