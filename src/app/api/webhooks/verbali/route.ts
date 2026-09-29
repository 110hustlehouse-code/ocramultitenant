import { after } from "next/server";
import { authenticateIntegration, ingestMeeting } from "@/server/meetings/integrations";
import { bearerToken, MAX_BODY_BYTES, parseInbound } from "@/server/meetings/inbound";
import { runProcessing } from "@/server/meetings/service";

export const dynamic = "force-dynamic";
/** Verbale e task girano dopo la risposta (after), fino a 5 minuti. */
export const maxDuration = 300;

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status });

/**
 * Riunioni già trascritte da un servizio esterno (Fireflies, n8n, Zapier…).
 * `Authorization: Bearer <token del collegamento>`; il token decide cliente, società e
 * progetto predefinito. Corpo JSON: vedi `inboundSchema` in src/server/meetings/inbound.ts.
 * Risponde 202 e continua in background con lo stesso flusso degli altri ingressi.
 */
export async function POST(request: Request) {
  const token = bearerToken(request.headers.get("authorization"));
  const integration = token ? await authenticateIntegration(token) : null;
  if (!integration) return json(401, { error: "Token non valido o collegamento disattivato." });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return json(413, { error: "Corpo troppo grande (massimo 5 MB)." });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return json(413, { error: "Corpo troppo grande (massimo 5 MB)." });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "Il corpo deve essere JSON." });
  }
  const parsed = parseInbound(body);
  if (!parsed.ok) return json(422, { error: parsed.error });

  const result = await ingestMeeting(integration, parsed.meeting);
  if (result.job) {
    const job = result.job;
    after(() => runProcessing(job));
  }
  return json(result.duplicate ? 200 : 202, { id: result.meetingId, duplicate: result.duplicate });
}
