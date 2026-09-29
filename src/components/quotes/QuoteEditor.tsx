"use client";

import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { buttonClass, Field, inputClass } from "@/components/registry/ui";
import { formatAmount, formatEuro, lineTotal, parseEuro, parseQuantity, quoteTotals } from "@/lib/quotes";
import { proposeDraftAction, saveDraftAction } from "@/app/(app)/preventivi/actions";

export type CatalogOption = { id: string; name: string; description: string | null; unit: string; unitPrice: number; unitCost: number | null };

type LineState = {
  key: string;
  serviceItemId: string | null;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  plannedCost: string;
};

export type EditorQuote = {
  id: string;
  title: string;
  clientId: string;
  intro: string;
  terms: string;
  validUntil: string;
  vatRate: number;
  brief: string;
  lines: Array<{ serviceItemId: string | null; description: string; quantity: number; unit: string; unitPrice: number; plannedCost: number | null }>;
};

const euroInput = (cents: number | null) => (cents === null ? "" : formatAmount(cents));
const qtyInput = (q: number) => q.toLocaleString("it-IT", { maximumFractionDigits: 2 });
let seq = 0;
const key = () => `l${++seq}`;

/** Editor della bozza: voci dal listino o libere, totali in diretta; Claude propone le voci dal brief. */
export function QuoteEditor({ quote, clients, catalog }: { quote: EditorQuote; clients: { id: string; name: string }[]; catalog: CatalogOption[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(quote.title);
  const [clientId, setClientId] = useState(quote.clientId);
  const [intro, setIntro] = useState(quote.intro);
  const [terms, setTerms] = useState(quote.terms);
  const [validUntil, setValidUntil] = useState(quote.validUntil);
  const [vatRate, setVatRate] = useState(String(quote.vatRate));
  const [lines, setLines] = useState<LineState[]>(() =>
    quote.lines.map((l) => ({
      key: key(),
      serviceItemId: l.serviceItemId,
      description: l.description,
      quantity: qtyInput(l.quantity),
      unit: l.unit,
      unitPrice: euroInput(l.unitPrice),
      plannedCost: euroInput(l.plannedCost),
    })),
  );
  const [saveState, saveAction, saving] = useActionState(saveDraftAction, undefined);
  const [aiState, aiAction, thinking] = useActionState(proposeDraftAction, undefined);

  // Dopo la proposta di Claude la pagina si ricarica con le voci nuove (l'editor riparte da lì).
  useEffect(() => {
    if (aiState?.ok) router.refresh();
  }, [aiState, router]);

  const parsed = lines.map((l) => {
    const plannedCost = l.plannedCost.trim() ? parseEuro(l.plannedCost) : null;
    return {
      quantity: parseQuantity(l.quantity),
      unitPrice: parseEuro(l.unitPrice),
      plannedCost,
      costInvalid: l.plannedCost.trim() !== "" && plannedCost === null,
    };
  });
  const valid = parsed.every((p) => p.quantity !== null && p.unitPrice !== null && p.unitPrice >= 0 && !p.costInvalid);
  const vat = Number(vatRate);
  const totals = quoteTotals(
    parsed.map((p) => ({ quantity: p.quantity ?? 0, unitPrice: p.unitPrice ?? 0 })),
    Number.isFinite(vat) ? vat : 0,
  );
  const plannedCost = parsed.reduce((s, p) => s + (p.plannedCost ?? 0), 0);

  const update = (k: string, patch: Partial<LineState>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) =>
    setLines((ls) => {
      const j = i + d;
      if (j < 0 || j >= ls.length) return ls;
      const copy = [...ls];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });
  const addFromCatalog = (id: string) => {
    const item = catalog.find((c) => c.id === id);
    if (!item) return;
    setLines((ls) => [
      ...ls,
      {
        key: key(),
        serviceItemId: item.id,
        description: item.description ? `${item.name} — ${item.description}` : item.name,
        quantity: "1",
        unit: item.unit,
        unitPrice: euroInput(item.unitPrice),
        plannedCost: euroInput(item.unitCost),
      },
    ]);
  };

  const payload = JSON.stringify({
    title,
    clientId,
    intro: intro || null,
    terms: terms || null,
    validUntil: validUntil || null,
    vatRate: Number.isFinite(vat) ? Math.round(vat) : 22,
    lines: lines.map((l, i) => ({
      serviceItemId: l.serviceItemId,
      description: l.description,
      quantity: parsed[i]!.quantity ?? 0,
      unit: l.unit,
      unitPrice: parsed[i]!.unitPrice ?? -1,
      plannedCost: parsed[i]!.plannedCost,
    })),
  });

  return (
    <div className="space-y-6">
      <form action={aiAction} className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <input type="hidden" name="id" value={quote.id} />
        <p className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-brand" aria-hidden /> Componi con Claude
        </p>
        <p className="text-sm text-muted">
          Scrivi cosa chiede il cliente: Claude sceglie le voci dal listino della società con i loro prezzi. Le voci attuali
          vengono sostituite; poi correggi quello che serve.
        </p>
        <textarea
          name="brief"
          rows={3}
          defaultValue={quote.brief}
          placeholder="es. Serata di apertura della stagione, 2 giorni, service audio e luci, riprese e montaggio di un video di 2 minuti"
          aria-label="Brief"
          className={inputClass}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={thinking} className={buttonClass.secondary}>
            {thinking ? "Claude sta componendo…" : "Proponi le voci"}
          </button>
          {aiState?.error && <p className="text-sm text-danger">{aiState.error}</p>}
          {aiState?.ok && <p className="text-sm text-ok">{aiState.ok}</p>}
        </div>
        {aiState?.notes && aiState.notes.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-warn">
            {aiState.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </form>

      <form action={saveAction} className="space-y-5 rounded-xl border border-border bg-surface p-5">
        <input type="hidden" name="id" value={quote.id} />
        <input type="hidden" name="draft" value={payload} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Titolo (diventa il nome del progetto)" name="title">
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Cliente" name="clientId">
            <select id="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputClass}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Introduzione per il cliente" name="intro">
          <textarea id="intro" rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} className={inputClass} />
        </Field>

        <div className="space-y-2">
          <p className="label">Voci</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left">
                  <th className="label px-1 py-1 font-normal">Descrizione</th>
                  <th className="label w-20 px-1 py-1 font-normal">Q.tà</th>
                  <th className="label w-24 px-1 py-1 font-normal">Unità</th>
                  <th className="label w-28 px-1 py-1 font-normal">Prezzo €</th>
                  <th className="label w-28 px-1 py-1 font-normal" title="Interno: non va nel PDF">
                    Costo prev. €
                  </th>
                  <th className="label w-28 px-1 py-1 text-right font-normal">Importo</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const p = parsed[i]!;
                  return (
                    <tr key={l.key} className="align-top">
                      <td className="px-1 py-1">
                        <textarea
                          rows={2}
                          value={l.description}
                          onChange={(e) => update(l.key, { description: e.target.value })}
                          aria-label={`Descrizione voce ${i + 1}`}
                          className={inputClass}
                        />
                        {!l.serviceItemId && <span className="text-xs text-warn">Fuori listino</span>}
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={l.quantity}
                          onChange={(e) => update(l.key, { quantity: e.target.value })}
                          aria-label={`Quantità voce ${i + 1}`}
                          aria-invalid={p.quantity === null}
                          className={inputClass}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value })} aria-label={`Unità voce ${i + 1}`} className={inputClass} />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={l.unitPrice}
                          onChange={(e) => update(l.key, { unitPrice: e.target.value })}
                          aria-label={`Prezzo voce ${i + 1}`}
                          aria-invalid={p.unitPrice === null}
                          className={inputClass}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          value={l.plannedCost}
                          onChange={(e) => update(l.key, { plannedCost: e.target.value })}
                          aria-label={`Costo previsto voce ${i + 1}`}
                          aria-invalid={p.costInvalid}
                          className={inputClass}
                        />
                      </td>
                      <td className="num px-1 py-2 text-right">
                        {p.quantity !== null && p.unitPrice !== null ? formatEuro(lineTotal(p.quantity, p.unitPrice)) : "—"}
                      </td>
                      <td className="px-1 py-1">
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => move(i, -1)} aria-label="Sposta su" className={buttonClass.secondary}>
                            <ArrowUp className="size-3.5" aria-hidden />
                          </button>
                          <button type="button" onClick={() => move(i, 1)} aria-label="Sposta giù" className={buttonClass.secondary}>
                            <ArrowDown className="size-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                            aria-label="Togli voce"
                            className={buttonClass.secondary}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value="" onChange={(e) => addFromCatalog(e.target.value)} aria-label="Aggiungi dal listino" className={`${inputClass} max-w-sm`}>
              <option value="">+ Aggiungi dal listino…</option>
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {formatEuro(c.unitPrice)}/{c.unit}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setLines((ls) => [...ls, { key: key(), serviceItemId: null, description: "", quantity: "1", unit: "forfait", unitPrice: "", plannedCost: "" }])}
              className={buttonClass.secondary}
            >
              <Plus className="size-4" aria-hidden /> Voce libera
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valido fino al" name="validUntil">
              <input id="validUntil" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={inputClass} />
            </Field>
            <Field label="IVA %" name="vatRate">
              <input id="vatRate" inputMode="numeric" value={vatRate} onChange={(e) => setVatRate(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <dl className="num min-w-56 space-y-1 text-sm">
            <div className="flex justify-between gap-6">
              <dt>Imponibile</dt>
              <dd>{formatEuro(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-6">
              <dt>IVA {vatRate}%</dt>
              <dd>{formatEuro(totals.vat)}</dd>
            </div>
            <div className="flex justify-between gap-6 border-t border-border pt-1 text-base font-semibold">
              <dt>Totale</dt>
              <dd>{formatEuro(totals.total)}</dd>
            </div>
            {plannedCost > 0 && (
              <div className="flex justify-between gap-6 text-xs text-muted">
                <dt>Costo previsto (interno)</dt>
                <dd>{formatEuro(plannedCost)}</dd>
              </div>
            )}
          </dl>
        </div>

        <Field label="Condizioni" name="terms">
          <textarea id="terms" rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} className={inputClass} />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving || !valid} className={buttonClass.primary}>
            {saving ? "Salvataggio…" : "Salva bozza"}
          </button>
          {!valid && <p className="text-sm text-danger">Controlla quantità e prezzi evidenziati.</p>}
          {saveState?.error && <p className="text-sm text-danger">{saveState.error}</p>}
          {saveState?.ok && <p className="text-sm text-ok">{saveState.ok}</p>}
        </div>
      </form>
    </div>
  );
}
