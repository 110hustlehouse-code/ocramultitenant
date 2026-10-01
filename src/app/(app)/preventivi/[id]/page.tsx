import { Copy, FileDown, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteEditor } from "@/components/quotes/QuoteEditor";
import { AcceptForm, MarkSentButton, RejectForm } from "@/components/quotes/QuoteForms";
import { buttonClass, CompanyTag } from "@/components/registry/ui";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { formatEuro, QUOTE_STATUS, quoteLabel, quoteTotals } from "@/lib/quotes";
import { requireModule } from "@/server/context";
import { getQuote, listServiceItems, managerCandidates, suggestProjectCode } from "@/server/quotes/service";
import { deleteDraftAction, duplicateQuoteAction, milestoneAction } from "../actions";

export const metadata: Metadata = { title: "Preventivo" };
/** «Proponi con Claude» gira nell'azione della pagina: fino a un paio di minuti. */
export const maxDuration = 180;

const qty = (q: number) => q.toLocaleString("it-IT", { maximumFractionDigits: 2 });

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireModule("PREVENTIVI");
  const quote = await getQuote(ctx, (await params).id);
  if (!quote) notFound();
  const c = quote.company;
  const s = QUOTE_STATUS[quote.status];
  const label = quoteLabel(quote.number, quote.issueDate);

  const [catalog, clients, managers, code] = await Promise.all([
    quote.status === "BOZZA" ? listServiceItems(ctx, quote.companyId) : Promise.resolve([]),
    quote.status === "BOZZA"
      ? ctx.db.party.findMany({
          where: { kinds: { has: "CLIENTE" }, companies: { some: { companyId: quote.companyId } } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    quote.status === "INVIATO" ? managerCandidates(ctx, quote.companyId) : Promise.resolve([]),
    quote.status === "INVIATO" ? suggestProjectCode(ctx, quote) : Promise.resolve(""),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-2">
            <CompanyTag name={c.name} short={c.poPrefix ?? c.name} color={c.colorLight} />
            <span className="label">Preventivo {label}</span>
            <span className={cn("label", s.tone)}>{s.label}</span>
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">{quote.title}</h1>
          <p className="text-sm text-muted">
            {quote.client.name} · {formatDay(quote.issueDate)}
            {quote.validUntil && <> · valido fino al {formatDay(quote.validUntil)}</>}
            {quote.sentAt && <> · inviato {formatDay(quote.sentAt)}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/preventivi/${quote.id}/pdf`} className={buttonClass.secondary}>
            <FileDown className="size-4" aria-hidden /> PDF
          </a>
          <form action={duplicateQuoteAction}>
            <input type="hidden" name="id" value={quote.id} />
            <button type="submit" className={buttonClass.secondary}>
              <Copy className="size-4" aria-hidden /> Duplica
            </button>
          </form>
          {quote.status === "BOZZA" && (
            <form action={deleteDraftAction}>
              <input type="hidden" name="id" value={quote.id} />
              <button type="submit" className={buttonClass.danger}>
                <Trash2 className="size-4" aria-hidden /> Elimina bozza
              </button>
            </form>
          )}
        </div>
      </header>

      {quote.status === "BOZZA" && (
        <>
          <QuoteEditor
            key={quote.updatedAt.toISOString()}
            quote={{
              id: quote.id,
              title: quote.title,
              clientId: quote.clientId,
              intro: quote.intro ?? "",
              terms: quote.terms ?? "",
              validUntil: quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : "",
              vatRate: quote.vatRate,
              brief: quote.brief ?? "",
              lines: quote.lines.map((l) => ({
                serviceItemId: l.serviceItemId,
                description: l.description,
                quantity: Number(l.quantity),
                unit: l.unit,
                unitPrice: l.unitPrice,
                discountPercent: l.discountPercent !== null ? Number(l.discountPercent) : null,
                vatRate: l.vatRate,
                plannedCost: l.plannedCost,
              })),
            }}
            clients={clients}
            catalog={catalog.map((i) => ({ id: i.id, name: i.name, description: i.description, unit: i.unit, unitPrice: i.unitPrice, unitCost: i.unitCost }))}
          />
          <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-5">
            <p className="flex-1 text-sm text-muted">
              Scarica il PDF, mandalo al cliente e segnalo come inviato: da lì il preventivo non si modifica più (si duplica).
            </p>
            <MarkSentButton id={quote.id} />
          </section>
        </>
      )}

      {quote.status !== "BOZZA" && (() => {
        const hasDiscount = quote.lines.some((l) => l.discountPercent !== null);
        const groups = quoteTotals(
          quote.lines.map((l) => ({
            quantity: Number(l.quantity),
            unitPrice: l.unitPrice,
            discountPercent: l.discountPercent !== null ? Number(l.discountPercent) : null,
            vatRate: l.vatRate,
          })),
        ).groups;
        const labelCols = hasDiscount ? 4 : 3;
        return (
          <section aria-labelledby="lines-title" className="space-y-3">
            <h2 id="lines-title" className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Voci
            </h2>
            {quote.intro && <p className="max-w-prose text-sm">{quote.intro}</p>}
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="label px-4 py-2 font-normal">Descrizione</th>
                    <th className="label px-4 py-2 text-right font-normal">Q.tà</th>
                    <th className="label px-4 py-2 text-right font-normal">Prezzo</th>
                    {hasDiscount && <th className="label px-4 py-2 text-right font-normal">Sconto</th>}
                    <th className="label px-4 py-2 text-right font-normal">Importo</th>
                    <th className="label px-4 py-2 text-right font-normal">Costo prev.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {quote.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2">{l.description}</td>
                      <td className="num px-4 py-2 text-right">
                        {qty(Number(l.quantity))} {l.unit}
                      </td>
                      <td className="num px-4 py-2 text-right">{formatEuro(l.unitPrice)}</td>
                      {hasDiscount && <td className="num px-4 py-2 text-right">{l.discountPercent !== null ? `${Number(l.discountPercent)}%` : "—"}</td>}
                      <td className="num px-4 py-2 text-right">{formatEuro(l.total)}</td>
                      <td className="num px-4 py-2 text-right text-muted">{l.plannedCost !== null ? formatEuro(l.plannedCost) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border">
                  {(
                    [
                      ["Imponibile", quote.subtotal, false],
                      ...groups.map((g): [string, number, boolean] => [`IVA ${g.vatRate}%`, g.vat, false]),
                      ["Totale", quote.total, true],
                    ] satisfies Array<[string, number, boolean]>
                  ).map(([text, amount, strong]) => (
                    <tr key={text}>
                      <td className={cn("px-4 py-1 text-right", strong && "font-semibold")} colSpan={labelCols}>
                        {text}
                      </td>
                      <td className={cn("num px-4 py-1 text-right", strong && "font-semibold")}>{formatEuro(amount)}</td>
                      <td />
                    </tr>
                  ))}
                </tfoot>
              </table>
            </div>
            {quote.terms && <p className="whitespace-pre-wrap text-sm text-muted">{quote.terms}</p>}
          </section>
        );
      })()}

      {quote.status === "INVIATO" && (
        <section className="space-y-3">
          <AcceptForm id={quote.id} code={code} managers={managers} />
          <RejectForm id={quote.id} />
        </section>
      )}

      {quote.status === "ACCETTATO" && quote.project && (
        <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
          <p>
            Accettato {formatDay(quote.acceptedAt)} · progetto{" "}
            <Link href={`/progetti/${quote.project.id}`} className="font-semibold underline">
              {quote.project.name}
            </Link>{" "}
            <span className="font-mono text-sm text-muted">{quote.project.code}</span>
          </p>
          <div className="flex flex-wrap gap-3">
            {(
              [
                ["contract", "Contratto firmato", quote.contractSignedAt],
                ["deposit", "Acconto ricevuto", quote.depositReceivedAt],
              ] as const
            ).map(([which, text, at]) => (
              <form key={which} action={milestoneAction}>
                <input type="hidden" name="id" value={quote.id} />
                <input type="hidden" name="which" value={which} />
                <input type="hidden" name="done" value={at ? "0" : "1"} />
                <button type="submit" className={cn(buttonClass.secondary, at && "border-ok text-ok")} aria-pressed={Boolean(at)}>
                  {at ? "✓" : "○"} {text}
                  {at && <span className="font-normal text-muted"> · {formatDay(at)}</span>}
                </button>
              </form>
            ))}
          </div>
          <p className="text-xs text-muted">Informativi: il progetto è già attivo. Clicca di nuovo per togliere la spunta.</p>
        </section>
      )}

      {quote.status === "RIFIUTATO" && (
        <section className="rounded-xl border border-danger/40 bg-danger/5 p-5 text-sm">
          Rifiutato {formatDay(quote.rejectedAt)}
          {quote.rejectionNote && <>: «{quote.rejectionNote}»</>}. Per riproporlo, duplicalo in una nuova bozza.
        </section>
      )}
    </div>
  );
}
