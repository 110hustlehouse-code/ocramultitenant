"use client";

import { useActionState } from "react";
import { saveMemberAction, type MemberFormState } from "@/app/(app)/impostazioni/actions";
import { buttonClass, Field, inputClass } from "@/components/registry/ui";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { ROLE_VALUES } from "@/server/users/input";

export function MemberForm({ companies }: { companies: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<MemberFormState, FormData>(saveMemberAction, undefined);
  const e = state?.errors ?? {};
  const v = state?.values;

  return (
    <form key={state ? JSON.stringify(v) : "init"} action={action} className="space-y-4 rounded-xl border border-border bg-surface p-5">
      {state?.message && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
          {state.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" name="email" error={e.email}>
          <input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={v?.email ?? ""}
            aria-invalid={e.email ? true : undefined}
            className={inputClass}
          />
        </Field>
        <Field label="Nome" name="name" error={e.name} hint="Obbligatorio solo se l'email non è già un membro">
          <input id="name" name="name" type="text" defaultValue={v?.name ?? ""} className={inputClass} />
        </Field>
        <Field label="Società" name="companyId" error={e.companyId}>
          <select id="companyId" name="companyId" defaultValue={v?.companyId ?? companies[0]?.id} className={inputClass}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ruolo" name="role" error={e.role}>
          <select id="role" name="role" defaultValue={v?.role ?? "CREATIVE"} className={inputClass}>
            {ROLE_VALUES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Scadenza accesso"
          name="accessExpiresAt"
          error={e.accessExpiresAt}
          hint="Richiesta solo per il ruolo Esterno; vale per l'utente in ogni società"
        >
          <input
            id="accessExpiresAt"
            name="accessExpiresAt"
            type="date"
            defaultValue={v?.accessExpiresAt ?? ""}
            className={inputClass}
          />
        </Field>
      </div>

      <button type="submit" disabled={pending} className={buttonClass.primary}>
        {pending ? "Salvataggio…" : "Salva"}
      </button>
    </form>
  );
}
