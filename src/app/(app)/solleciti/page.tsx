import { Hourglass, PhoneCall } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CompanyTag } from "@/components/registry/ui";
import { integrations } from "@/env";
import { cn } from "@/lib/cn";
import { requireModule } from "@/server/context";
import { followUpsBoard } from "@/server/followups/service";
import { cancelFollowUpAction, resolveFollowUpFormAction } from "./actions";

export const metadata: Metadata = { title: "Solleciti" };

const TIME = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export default async function Page() {
  const ctx = await requireModule("SOLLECITI");
  const board = await followUpsBoard(ctx);
  const companies = new Map(ctx.companies.map((c) => [c.id, c]));
  const emailOn = integrations().email;

  // In attesa adesso, raggruppati per progetto; prima i progetti fermi da più tempo.
  const groups = new Map<string, { project: (typeof board.active)[number]["project"]; items: typeof board.active }>();
  for (const f of board.active) {
    const g = groups.get(f.project.id) ?? { project: f.project, items: [] };
    g.items.push(f);
    groups.set(f.project.id, g);
  }
  const ordered = [...groups.values()].sort((a, b) => Math.max(...b.items.map((i) => i.days)) - Math.max(...a.items.map((i) => i.days)));

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="label">Clienti</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Solleciti</h1>
        <p className="max-w-prose text-sm text-muted">
          Task fermi perché si aspetta qualcosa da un cliente. Il sollecito lo avvia chi ha il task o il PM; se il cliente non
          risponde, dopo 3 giorni lavorativi parte un promemoria (al massimo 2), poi l&apos;attesa arriva qui come da gestire.
          Nessun blocco: il cliente non è un collaboratore.
        </p>
        {!emailOn && <p className="text-sm text-warn">Invio email non configurato: i solleciti vengono registrati ma non partono.</p>}
      </header>

      <section aria-labelledby="active-title" className="space-y-3">
        <h2 id="active-title" className="font-[family-name:var(--font-display)] text-lg font-semibold">
          In attesa adesso <span className="num text-muted">{board.active.length}</span>
        </h2>
        {ordered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
            <p className="font-semibold">Nessun progetto fermo per un cliente.</p>
            <p className="mt-1 text-sm text-muted">Quando un task aspetta il cliente, dal task si usa «In attesa del cliente».</p>
          </div>
        ) : (
          <div className="space-y-4">
            {ordered.map(({ project, items }) => {
              const co = companies.get(project.companyId);
              return (
                <article key={project.id} className="overflow-hidden rounded-xl border border-border bg-surface">
                  <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                    {co && <CompanyTag name={co.name} short={co.poPrefix ?? co.name} color={co.colorLight} />}
                    <Link href={`/progetti/${project.id}`} className="font-semibold underline">
                      {project.name}
                    </Link>
                    {items[0]?.party && <span className="text-sm text-muted">· {items[0].party.name}</span>}
                  </header>
                  <ul className="divide-y divide-border">
                    {items.map((f) => (
                      <li key={f.id} className="space-y-2 px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="flex items-center gap-2 font-semibold">
                              <Hourglass className="size-4 text-warn" aria-hidden /> {f.waitingFor}
                            </p>
                            <p className="text-xs text-muted">
                              Task «{f.task.title}»{f.task.assignee && <> · {f.task.assignee.name}</>} · avviato da {f.startedBy.name} ·{" "}
                              {f.contactName ? `${f.contactName} (${f.contactEmail})` : f.contactEmail}
                            </p>
                          </div>
                          <p className={cn("text-right text-sm", f.overCap ? "text-danger" : "text-warn")}>
                            <span className="num text-lg font-semibold">{f.days}</span>{" "}
                            {plural(f.days, "giorno lavorativo", "giorni lavorativi")}
                            <span className="block text-xs text-muted">
                              <span className="num">{f.remindersSent}</span> di <span className="num">{f.maxReminders}</span> promemoria
                            </span>
                          </p>
                        </div>
                        {f.overCap && (
                          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
                            <PhoneCall className="size-4" aria-hidden /> Il cliente non risponde ai promemoria: serve una telefonata o una
                            decisione.
                          </p>
                        )}
                        <details className="text-sm">
                          <summary className="cursor-pointer text-muted">
                            Messaggi inviati <span className="num">{f.messages.length}</span>
                          </summary>
                          <ol className="mt-2 space-y-3">
                            {f.messages.map((m) => (
                              <li key={m.id} className="rounded-lg border border-border bg-surface-2 p-3">
                                <p className="label">
                                  {m.kind === "PRIMO" ? "Primo messaggio" : "Promemoria"} · {TIME.format(m.createdAt)}
                                  {!m.delivered && <span className="text-danger"> · non inviato</span>}
                                </p>
                                <p className="mt-1 font-semibold">{m.subject}</p>
                                <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                              </li>
                            ))}
                          </ol>
                        </details>
                        <div className="flex flex-wrap gap-4 text-sm">
                          <form action={resolveFollowUpFormAction}>
                            <input type="hidden" name="id" value={f.id} />
                            <button type="submit" className="underline">
                              Il cliente ha risposto
                            </button>
                          </form>
                          <form action={cancelFollowUpAction}>
                            <input type="hidden" name="id" value={f.id} />
                            <button type="submit" className="text-muted underline">
                              Annulla (aperto per errore)
                            </button>
                          </form>
                        </div>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="lost-title" className="space-y-3">
        <h2 id="lost-title" className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Giorni fermi per il cliente
        </h2>
        <p className="max-w-prose text-sm text-muted">
          Ultimi 6 mesi, attese in corso comprese. Più attese in parallelo sullo stesso progetto contano una volta sola. È il
          tempo perso per causa esterna che entrerà nel margine.
        </p>
        {board.lost.length === 0 ? (
          <p className="text-sm text-muted">Ancora nessun dato.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="label px-4 py-2 font-normal">Progetto</th>
                  <th className="label px-4 py-2 font-normal">Società</th>
                  <th className="label px-4 py-2 text-right font-normal">Giorni lavorativi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {board.lost.map((p) => (
                  <tr key={p.projectId}>
                    <td className="px-4 py-2">
                      <Link href={`/progetti/${p.projectId}`} className="underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted">{companies.get(p.companyId)?.name}</td>
                    <td className="num px-4 py-2 text-right font-semibold">{p.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
