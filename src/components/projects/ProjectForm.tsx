"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClass, Field, inputClass } from "@/components/registry/ui";
import { saveProjectAction, type ProjectFormState } from "@/app/(app)/progetti/actions";

type Option = { id: string; name: string };

export type ProjectFormValues = {
  id?: string;
  companyId: string;
  name: string;
  clientId: string | null;
  code: string | null;
  service: string | null;
  managerId: string | null;
  startDate: string;
  dueDate: string;
  notes: string | null;
  memberIds: string[];
};

export function ProjectForm({
  values,
  clients,
  people,
  cancelHref,
}: {
  values: ProjectFormValues;
  clients: Option[];
  people: Option[];
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(saveProjectAction, undefined);
  const e = state?.errors ?? {};
  const v: ProjectFormValues = state?.values
    ? {
        ...values,
        ...state.values,
        clientId: state.values.clientId ?? null,
        code: state.values.code ?? null,
        service: state.values.service ?? null,
        managerId: state.values.managerId ?? null,
        startDate: state.values.startDate ?? "",
        dueDate: state.values.dueDate ?? "",
        notes: state.values.notes ?? null,
      }
    : values;

  return (
    <form key={state ? JSON.stringify(state.values) : "init"} action={action} className="space-y-6">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <input type="hidden" name="companyId" value={values.companyId} />
      {state?.message && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
          {state.message}
        </p>
      )}

      <fieldset className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
        <legend className="label px-1">Progetto</legend>
        <Field label="Nome" name="name" error={e.name} className="sm:col-span-2">
          <input id="name" name="name" defaultValue={v.name} className={inputClass} />
        </Field>
        <Field label="Cliente" name="clientId" hint={clients.length ? undefined : "Nessun cliente per questa società: aggiungilo in Clienti e fornitori"}>
          <select id="clientId" name="clientId" defaultValue={v.clientId ?? ""} className={inputClass}>
            <option value="">Progetto interno</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Servizio" name="service" error={e.service}>
          <input id="service" name="service" defaultValue={v.service ?? ""} placeholder="es. Videoclip, Brand identity" className={inputClass} />
        </Field>
        <Field label="Codice PO" name="code" error={e.code} hint="Facoltativo, unico nel gruppo">
          <input id="code" name="code" defaultValue={v.code ?? ""} className={inputClass} />
        </Field>
        <Field label="Project manager" name="managerId">
          <select id="managerId" name="managerId" defaultValue={v.managerId ?? ""} className={inputClass}>
            <option value="">—</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Inizio" name="startDate" error={e.startDate}>
          <input id="startDate" name="startDate" type="date" defaultValue={v.startDate} className={inputClass} />
        </Field>
        <Field label="Consegna" name="dueDate" error={e.dueDate}>
          <input id="dueDate" name="dueDate" type="date" defaultValue={v.dueDate} className={inputClass} />
        </Field>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <legend className="label px-1">Team</legend>
        <p className="text-sm text-muted">Chi lavora al progetto. Chi riceve un task entra nel team da solo.</p>
        <div className="flex flex-wrap gap-2">
          {people.map((p) => (
            <label
              key={p.id}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-checked:border-text"
            >
              <input type="checkbox" name="memberIds" value={p.id} defaultChecked={v.memberIds.includes(p.id)} />
              {p.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-border bg-surface p-5">
        <legend className="label px-1">Note</legend>
        <textarea id="notes" name="notes" rows={4} defaultValue={v.notes ?? ""} aria-label="Note" className={inputClass} />
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClass.primary}>
          {pending ? "Salvataggio…" : values.id ? "Salva" : "Crea progetto"}
        </button>
        <Link href={cancelHref} className={buttonClass.secondary}>
          Annulla
        </Link>
      </div>
    </form>
  );
}
