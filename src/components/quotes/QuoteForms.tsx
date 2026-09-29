"use client";

import { useActionState, useState } from "react";
import { buttonClass, Field, inputClass } from "@/components/registry/ui";
import { formatAmount, parseEuro } from "@/lib/quotes";
import {
  acceptQuoteAction,
  createQuoteAction,
  markSentAction,
  rejectQuoteAction,
  saveServiceItemAction,
} from "@/app/(app)/preventivi/actions";

/** Nuovo preventivo: società, cliente, titolo. Poi si compone nella scheda. */
export function NewQuoteForm({
  companies,
  clients,
}: {
  companies: { id: string; name: string }[];
  clients: { id: string; name: string; companyIds: string[] }[];
}) {
  const [state, action, pending] = useActionState(createQuoteAction, undefined);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const options = clients.filter((c) => c.companyIds.includes(companyId));

  return (
    <form action={action} className="grid gap-4 rounded-xl border border-border bg-surface p-5 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end">
      {companies.length > 1 ? (
        <Field label="Società" name="companyId">
          <select id="companyId" name="companyId" value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={inputClass}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <input type="hidden" name="companyId" value={companyId} />
      )}
      <Field label="Cliente" name="clientId">
        <select id="clientId" name="clientId" key={companyId} className={inputClass} required>
          <option value="">Scegli…</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Titolo" name="title">
        <input id="title" name="title" placeholder="es. Serata di apertura della stagione" className={inputClass} />
      </Field>
      <button type="submit" disabled={pending} className={buttonClass.primary}>
        {pending ? "…" : "Crea bozza"}
      </button>
      {state?.error && <p className="text-sm text-danger md:col-span-4">{state.error}</p>}
      {options.length === 0 && <p className="text-sm text-muted md:col-span-4">Nessun cliente per questa società: aggiungilo in Clienti e fornitori.</p>}
    </form>
  );
}

export function MarkSentButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(markSentAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={buttonClass.primary}>
        Segna come inviato
      </button>
      {state?.error && <span className="text-sm text-danger">{state.error}</span>}
    </form>
  );
}

/** Accettato: si sceglie il PM e si conferma il codice PO; nasce il progetto. */
export function AcceptForm({ id, code, managers }: { id: string; code: string; managers: { id: string; name: string; role: string }[] }) {
  const [state, action, pending] = useActionState(acceptQuoteAction, undefined);
  const defaultManager = managers.find((m) => m.role === "PROJECT_MANAGER")?.id ?? "";
  return (
    <form action={action} className="space-y-4 rounded-xl border border-ok/40 bg-ok/5 p-5">
      <input type="hidden" name="id" value={id} />
      <div>
        <p className="font-semibold">Il cliente ha accettato</p>
        <p className="text-sm text-muted">
          Nasce subito il progetto, con le voci come budget. Contratto firmato e acconto si segnano dopo: non bloccano nulla.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project manager" name="managerId">
          <select id="managerId" name="managerId" defaultValue={defaultManager} className={inputClass}>
            <option value="">Da decidere</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.role === "CEO" ? " (CEO)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Codice PO" name="code" hint="SOCIETÀ/SERVIZIO/MESE-ANNO/CLIENTE/E. Modificabile.">
          <input id="code" name="code" defaultValue={code} className={`${inputClass} font-mono`} />
        </Field>
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={buttonClass.primary}>
        {pending ? "Creazione del progetto…" : "Accettato: crea il progetto"}
      </button>
    </form>
  );
}

export function RejectForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(rejectQuoteAction, undefined);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass.secondary}>
        Rifiutato
      </button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-wrap items-start gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="note" autoFocus placeholder="Perché? (facoltativo: prezzo, tempi, altro fornitore…)" aria-label="Motivo" className={`${inputClass} min-w-60 flex-1`} />
      <button type="submit" disabled={pending} className={buttonClass.danger}>
        Segna come rifiutato
      </button>
      <button type="button" onClick={() => setOpen(false)} className={buttonClass.secondary}>
        Annulla
      </button>
      {state?.error && <p className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  );
}

export type ServiceItemRow = {
  id: string;
  name: string;
  description: string | null;
  poCode: string;
  unit: string;
  unitPrice: number;
  unitCost: number | null;
};

const euroInput = (cents: number | null) => (cents === null ? "" : formatAmount(cents));

/** Voce di listino, nuova o da modificare. */
export function ServiceItemForm({ companyId, item }: { companyId: string; item?: ServiceItemRow }) {
  const [state, action, pending] = useActionState(saveServiceItemAction, undefined);
  const initial = {
    name: item?.name ?? "",
    description: item?.description ?? "",
    poCode: item?.poCode ?? "",
    unit: item?.unit ?? "forfait",
    unitPrice: euroInput(item?.unitPrice ?? null),
    unitCost: euroInput(item?.unitCost ?? null),
  };
  const [v, setV] = useState(initial);
  // Voce nuova aggiunta: i campi si svuotano per la prossima.
  const [handled, setHandled] = useState<typeof state>(undefined);
  if (!item && state?.ok && state !== handled) {
    setHandled(state);
    setV(initial);
  }
  const price = parseEuro(v.unitPrice);
  const cost = v.unitCost.trim() ? parseEuro(v.unitCost) : null;
  const costInvalid = v.unitCost.trim() !== "" && cost === null;
  const payload = JSON.stringify({
    name: v.name,
    description: v.description.trim() || null,
    poCode: v.poCode,
    unit: v.unit,
    unitPrice: price ?? -1,
    unitCost: cost,
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  return (
    <form action={action} className="grid gap-3 md:grid-cols-6 md:items-end">
      <input type="hidden" name="companyId" value={companyId} />
      {item && <input type="hidden" name="id" value={item.id} />}
      <input type="hidden" name="item" value={payload} />
      <Field label="Voce" name={`name-${item?.id ?? "new"}`} className="md:col-span-2">
        <input id={`name-${item?.id ?? "new"}`} value={v.name} onChange={set("name")} className={inputClass} />
      </Field>
      <Field label="Sigla PO" name={`po-${item?.id ?? "new"}`}>
        <input id={`po-${item?.id ?? "new"}`} value={v.poCode} onChange={set("poCode")} placeholder="EVENTI" className={`${inputClass} font-mono uppercase`} />
      </Field>
      <Field label="Unità" name={`unit-${item?.id ?? "new"}`}>
        <input id={`unit-${item?.id ?? "new"}`} value={v.unit} onChange={set("unit")} className={inputClass} />
      </Field>
      <Field label="Prezzo €" name={`price-${item?.id ?? "new"}`}>
        <input id={`price-${item?.id ?? "new"}`} value={v.unitPrice} onChange={set("unitPrice")} aria-invalid={v.unitPrice !== "" && price === null} className={inputClass} />
      </Field>
      <Field label="Costo prev. €" name={`cost-${item?.id ?? "new"}`} hint="Interno">
        <input id={`cost-${item?.id ?? "new"}`} value={v.unitCost} onChange={set("unitCost")} aria-invalid={costInvalid} className={inputClass} />
      </Field>
      <Field label="Descrizione (facoltativa)" name={`desc-${item?.id ?? "new"}`} className="md:col-span-5">
        <input id={`desc-${item?.id ?? "new"}`} value={v.description} onChange={set("description")} className={inputClass} />
      </Field>
      <button type="submit" disabled={pending || price === null || costInvalid} className={buttonClass.primary}>
        {item ? "Salva" : "Aggiungi"}
      </button>
      {state?.error && <p className="text-sm text-danger md:col-span-6">{state.error}</p>}
      {state?.ok && !item && <p className="text-sm text-ok md:col-span-6">{state.ok}</p>}
    </form>
  );
}
