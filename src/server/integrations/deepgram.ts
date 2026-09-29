import "server-only";
import { env } from "@/env";

export type DeepgramUtterance = { speaker?: number; start: number; transcript: string };
export type DeepgramResponse = {
  metadata?: { duration?: number };
  results?: {
    utterances?: DeepgramUtterance[];
    channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
  };
};

const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

/** Da risposta Deepgram a testo leggibile: «[01:23] Voce 1: …», unendo le frasi consecutive della stessa voce. */
export function formatTranscript(res: DeepgramResponse): string {
  const utterances = res.results?.utterances ?? [];
  if (utterances.length === 0) return res.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
  const lines: string[] = [];
  let last: { speaker: number | undefined; start: number; text: string[] } | null = null;
  for (const u of utterances) {
    if (last && last.speaker === u.speaker) {
      last.text.push(u.transcript.trim());
      continue;
    }
    if (last) lines.push(`[${clock(last.start)}] Voce ${(last.speaker ?? 0) + 1}: ${last.text.join(" ")}`);
    last = { speaker: u.speaker, start: u.start, text: [u.transcript.trim()] };
  }
  if (last) lines.push(`[${clock(last.start)}] Voce ${(last.speaker ?? 0) + 1}: ${last.text.join(" ")}`);
  return lines.join("\n");
}

/** Trascrive un file raggiungibile via URL (firmato). Deepgram lo scarica da solo: niente limiti di upload. */
export async function transcribeUrl(url: string): Promise<{ text: string; durationSec: number | null }> {
  const e = env();
  if (!e.DEEPGRAM_API_KEY) throw new Error("Trascrizione non configurata (DEEPGRAM_API_KEY).");
  const params = new URLSearchParams({
    model: e.DEEPGRAM_MODEL,
    language: "it",
    diarize: "true",
    smart_format: "true",
    punctuate: "true",
    utterances: "true",
  });
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${e.DEEPGRAM_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`Trascrizione non riuscita (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as DeepgramResponse;
  const text = formatTranscript(data);
  if (!text) throw new Error("Nella registrazione non si sente parlato.");
  return { text, durationSec: data.metadata?.duration ? Math.round(data.metadata.duration) : null };
}
