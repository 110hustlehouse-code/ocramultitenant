import { NextResponse } from "next/server";
import { getContext } from "@/server/context";
import { DocumentError, resolveDownload } from "@/server/documents/service";

export const dynamic = "force-dynamic";

/**
 * Permalink stabile verso un file (usato anche come prova di chiusura di un task): non scade mai
 * perché genera un URL firmato di R2 nuovo ad ogni apertura, invece di salvarne uno che scadrebbe.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  try {
    const { url } = await resolveDownload(ctx, (await params).id);
    return NextResponse.redirect(url);
  } catch (e) {
    if (e instanceof DocumentError) return new Response(e.message, { status: 404 });
    throw e;
  }
}
