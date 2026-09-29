import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { requireModule } from "@/server/context";
import { formatDayInput } from "@/server/projects/input";
import { assignableUsers, clientsFor, getProject } from "@/server/projects/service";

export const metadata: Metadata = { title: "Modifica progetto" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireModule("PROGETTI");
  const project = await getProject(ctx, (await params).id);
  if (!project?.canManage) notFound();
  const [clients, people] = await Promise.all([
    clientsFor(ctx, project.companyId),
    assignableUsers(ctx, project.companyId),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <p className="label">{project.company.name}</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Modifica progetto</h1>
      </header>
      <ProjectForm
        clients={clients}
        people={people}
        cancelHref={`/progetti/${project.id}`}
        values={{
          id: project.id,
          companyId: project.companyId,
          name: project.name,
          clientId: project.clientId,
          code: project.code,
          service: project.service,
          managerId: project.managerId,
          startDate: formatDayInput(project.startDate),
          dueDate: formatDayInput(project.dueDate),
          notes: project.notes,
          memberIds: project.members.map((m) => m.userId),
        }}
      />
    </div>
  );
}
