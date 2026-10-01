import type { Metadata } from "next";
import { buttonClass } from "@/components/registry/ui";
import { MemberForm } from "@/components/users/MemberForm";
import { formatDay } from "@/lib/dates";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { getContext } from "@/server/context";
import { listMembers, manageableCompanies } from "@/server/users/service";
import { revokeMemberAction, setUserActiveAction } from "../actions";

export const metadata: Metadata = { title: "Utenti" };

export default async function Page() {
  const ctx = await getContext();
  const companies = manageableCompanies(ctx);
  const members = await listMembers(ctx);

  return (
    <div className="space-y-8 py-2">
      <p className="max-w-prose text-sm text-muted">
        L&apos;accesso resta via Google (Workspace del gruppo): qui si autorizza un&apos;email a entrare, con un ruolo per
        ogni società. Nessuna password da creare.
      </p>

      {members.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">
                  {m.user.name} <span className="label text-muted">{ROLE_LABELS[m.role]}</span>
                  {!m.user.active && <span className="label ml-1 text-danger">disattivato</span>}
                </p>
                <p className="text-xs text-muted">
                  {m.user.email} · {m.company.name}
                  {m.role === "EXTERNAL" && m.user.accessExpiresAt && <> · scade il {formatDay(m.user.accessExpiresAt)}</>}
                </p>
              </div>
              <div className="flex gap-2">
                <form action={setUserActiveAction}>
                  <input type="hidden" name="userId" value={m.userId} />
                  <input type="hidden" name="active" value={m.user.active ? "false" : "true"} />
                  <button type="submit" className={buttonClass.secondary}>
                    {m.user.active ? "Disattiva accesso" : "Riattiva accesso"}
                  </button>
                </form>
                <form action={revokeMemberAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <button type="submit" className={buttonClass.danger}>
                    Revoca
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="new-title" className="space-y-3">
        <h2 id="new-title" className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Aggiungi o modifica un membro
        </h2>
        <p className="text-sm text-muted">
          Un&apos;email già invitata in una società: cambia solo il ruolo lì. Un ruolo Esterno richiede una scadenza
          dell&apos;accesso.
        </p>
        <MemberForm companies={companies.map(({ id, name }) => ({ id, name }))} />
      </section>
    </div>
  );
}
