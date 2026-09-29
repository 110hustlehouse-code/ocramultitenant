import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * Riunioni in arrivo da servizi esterni (Fireflies, n8n, Zapier…). Parte pura: formato
 * accettato, normalizzazione del testo, token. Il servizio che scrive sta in integrations.ts.
 */

export const MIN_TRANSCRIPT_CHARS = 50;
export const MAX_STORED_TRANSCRIPT_CHARS = 400_000;
/** Oltre questa dimensione il corpo della richiesta viene rifiutato (≈ 10 ore di parlato). */
export const MAX_BODY_BYTES = 5 * 1024 * 1024;

const TOKEN_PREFIX = "ocra_mtg_";

/** Token nuovo: si mostra una volta sola, nel DB resta solo l'hash. */
export function newToken(): { token: string; hash: string; hint: string } {
  const token = TOKEN_PREFIX + randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token), hint: token.slice(-4) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Estrae il token da `Authorization: Bearer …`; null se manca o non ha il formato di OCRA. */
export function bearerToken(header: string | null): string | null {
  const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  return token?.startsWith(TOKEN_PREFIX) ? token : null;
}

const sentenceSchema = z.object({
  speaker: z.string().trim().max(120).nullish(),
  text: z.string(),
  /** Secondi dall'inizio della riunione */
  start: z.number().nonnegative().nullish(),
});

export const inboundSchema = z
  .object({
    /** Id della riunione nel servizio esterno: lo stesso id inviato due volte non crea doppioni */
    id: z.string().trim().min(1).max(200),
    title: z.string().trim().max(200).nullish(),
    /** Data o data e ora ISO (es. 2026-09-29 o 2026-09-29T10:00:00Z) */
    date: z.string().trim().nullish(),
    /** Testo già pronto… */
    transcript: z.string().nullish(),
    /** …oppure le frasi, con chi parla */
    sentences: z.array(sentenceSchema).max(20_000).nullish(),
    participants: z.array(z.string().trim().max(200)).max(200).nullish(),
    /** Codice PO del progetto, se il servizio lo conosce */
    project: z.string().trim().max(200).nullish(),
    durationSec: z.number().int().nonnegative().max(86_400).nullish(),
  })
  .loose();

export type InboundMeeting = {
  externalId: string;
  title: string;
  /** AAAA-MM-GG, giorno di Roma */
  day: string;
  transcript: string;
  projectCode: string | null;
  durationSec: number | null;
};

const clock = (sec: number) => {
  const s = Math.floor(sec);
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

/** Frasi → «[01:23] Nome: …», unendo le frasi consecutive della stessa persona (come per Deepgram). */
function joinSentences(sentences: z.infer<typeof sentenceSchema>[]): string {
  const lines: string[] = [];
  let last: { speaker: string; start: number | null; text: string[] } | null = null;
  const flush = () => {
    if (!last) return;
    const time = last.start !== null ? `[${clock(last.start)}] ` : "";
    lines.push(`${time}${last.speaker}: ${last.text.join(" ")}`);
  };
  for (const s of sentences) {
    const text = s.text.trim();
    if (!text) continue;
    const speaker = s.speaker || "Voce";
    if (last && last.speaker === speaker) {
      last.text.push(text);
      continue;
    }
    flush();
    last = { speaker, start: s.start ?? null, text: [text] };
  }
  flush();
  return lines.join("\n");
}

function toDay(value: string | null | undefined, now: Date): string | null {
  if (!value) return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

export type ParseResult = { ok: true; meeting: InboundMeeting } | { ok: false; error: string };

/** Valida e normalizza il corpo del webhook. Errori in italiano, restituiti al servizio chiamante. */
export function parseInbound(body: unknown, now = new Date()): ParseResult {
  const parsed = inboundSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Campo non valido: ${issue?.path.join(".") || "corpo"} (${issue?.message ?? "formato"})` };
  }
  const p = parsed.data;
  const day = toDay(p.date, now);
  if (!day) return { ok: false, error: "Campo non valido: date (usa AAAA-MM-GG o una data ISO)" };

  let transcript = (p.transcript?.trim() || joinSentences(p.sentences ?? [])).trim();
  if (transcript.length < MIN_TRANSCRIPT_CHARS) {
    return { ok: false, error: "Manca la trascrizione (transcript o sentences) o è troppo corta." };
  }
  const people = (p.participants ?? []).filter(Boolean);
  if (people.length) transcript = `Partecipanti: ${people.join(", ")}\n\n${transcript}`;

  return {
    ok: true,
    meeting: {
      externalId: p.id,
      title: p.title || `Riunione del ${day}`,
      day,
      transcript: transcript.slice(0, MAX_STORED_TRANSCRIPT_CHARS),
      projectCode: p.project || null,
      durationSec: p.durationSec ?? null,
    },
  };
}
