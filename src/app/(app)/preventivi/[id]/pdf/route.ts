import { hasModuleAccess, getContext } from "@/server/context";
import { renderQuotePdf, pdfFileName } from "@/server/quotes/pdf";
import { getQuote } from "@/server/quotes/service";

export const dynamic = "force-dynamic";

/** PDF del preventivo da scaricare e mandare al cliente (l'invio email diretto arriverà dopo). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!hasModuleAccess(ctx, "PREVENTIVI")) return new Response("Non trovato", { status: 404 });
  const quote = await getQuote(ctx, (await params).id);
  if (!quote) return new Response("Non trovato", { status: 404 });
  const pdf = await renderQuotePdf(quote);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFileName(quote)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
