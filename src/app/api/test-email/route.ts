import { timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import { sendEmail } from "@/server/notify/email";

export const dynamic = "force-dynamic";

/**
 * TEMPORANEA: verifica una tantum della configurazione SMTP in produzione (register.it),
 * subito dopo l'inserimento delle variabili SMTP_*. Da rimuovere dopo l'uso — vedi
 * docs/piani/MESSA-ONLINE.md. Stesso schema di autorizzazione di /api/cron/richiami.
 */
function authorized(request: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Non autorizzato", { status: 401 });
  const to = new URL(request.url).searchParams.get("to");
  if (!to) return Response.json({ error: "manca ?to=" }, { status: 400 });

  const result = await sendEmail({
    to,
    subject: "OCRA — invio di prova da produzione",
    text: "Email di verifica della configurazione SMTP in produzione (register.it/authsmtp.securemail.pro). Se la ricevi, funziona.",
  });
  return Response.json(result);
}
