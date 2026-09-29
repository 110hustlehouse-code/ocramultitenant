import { timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import { runClientFollowUps } from "@/server/followups/service";
import { runReminders } from "@/server/reminders/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Chiamato ogni ora da un pianificatore (Vercel Cron, n8n o GitHub Actions) con
 * `Authorization: Bearer <CRON_SECRET>`. Il motore decide da solo cosa inviare in base all'ora di Roma.
 * Stessa chiamata per i promemoria dei solleciti ai clienti (solo in orario d'ufficio).
 */
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Non autorizzato", { status: 401 });
  const reminders = await runReminders();
  const followUps = await runClientFollowUps();
  return Response.json({ ...reminders, followUps });
}
