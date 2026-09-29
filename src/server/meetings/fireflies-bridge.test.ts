import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseInbound } from "./inbound";

/**
 * Il ponte n8n Fireflies → OCRA (docs/integrazioni/n8n-fireflies-verbali.json) gira fuori da OCRA,
 * ma il suo codice si prova qui: firma, traduzione del formato e compatibilità con parseInbound.
 */
type Node = { name: string; parameters: { jsCode?: string } };
const workflow = JSON.parse(readFileSync("docs/integrazioni/n8n-fireflies-verbali.json", "utf8")) as { nodes: Node[] };
const code = (name: string) => workflow.nodes.find((n) => n.name === name)!.parameters.jsCode!;

type Item = { json: Record<string, unknown> };
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<Item[]>;

/** Esegue un nodo Code come fa n8n («una volta per tutti gli elementi»). */
function run(name: string, items: Item[], opts: { env?: Record<string, string>; raw?: Buffer } = {}) {
  const $input = { first: () => items[0], all: () => items };
  const helpers = { getBinaryDataBuffer: async () => opts.raw ?? Buffer.from("") };
  const fn = new AsyncFunction("$input", "$env", "require", code(name));
  return fn.call({ helpers }, $input, opts.env ?? {}, createRequire(import.meta.url));
}

describe("ponte n8n Fireflies → OCRA", () => {
  const secret = "segreto-di-prova";
  const signed = (body: object) => {
    const raw = Buffer.from(JSON.stringify(body));
    return { raw, header: `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}` };
  };

  it("firma valida: passa solo meeting.transcribed", async () => {
    const ok = signed({ event: "meeting.transcribed", timestamp: 1, meeting_id: "ASx1" });
    const out = await run("Verifica firma", [{ json: { headers: { "x-hub-signature": ok.header } } }], { env: { FIREFLIES_WEBHOOK_SECRET: secret }, raw: ok.raw });
    expect(out).toEqual([{ json: { meetingId: "ASx1" } }]);

    const other = signed({ event: "meeting.summarized", meeting_id: "ASx1" });
    expect(await run("Verifica firma", [{ json: { headers: { "x-hub-signature": other.header } } }], { env: { FIREFLIES_WEBHOOK_SECRET: secret }, raw: other.raw })).toEqual([]);
  });

  it("firma sbagliata o segreto mancante: si ferma", async () => {
    const ok = signed({ event: "meeting.transcribed", meeting_id: "ASx1" });
    await expect(
      run("Verifica firma", [{ json: { headers: { "x-hub-signature": "sha256=00" } } }], { env: { FIREFLIES_WEBHOOK_SECRET: secret }, raw: ok.raw }),
    ).rejects.toThrow(/non valida/);
    await expect(run("Verifica firma", [{ json: { headers: {} } }], { raw: ok.raw })).rejects.toThrow(/FIREFLIES_WEBHOOK_SECRET/);
  });

  const transcript = {
    id: "ASx1",
    title: "Produzione Nora [FL/COMUNIC/01-2026/NORA/E]",
    dateString: "2026-09-29T08:30:00.000Z",
    duration: 42.5,
    meeting_attendees: [{ displayName: "Erika Nardini", email: "erika@fulcro.it" }, { displayName: null, name: null, email: "marco@fulcro.it" }],
    sentences: [
      { speaker_name: "Erika Nardini", text: "Marco, il montaggio della versione uno entro venerdì.", start_time: 3.2 },
      { speaker_name: "Marco Villa", text: "Va bene, lo consegno giovedì sera.", start_time: 9.8 },
    ],
  };

  it("traduce nel formato OCRA, accettato da parseInbound", async () => {
    const [item] = await run("Traduci per OCRA", [{ json: { data: { transcript } } }]);
    expect(item!.json).toMatchObject({
      id: "fireflies:ASx1",
      title: "Produzione Nora",
      project: "FL/COMUNIC/01-2026/NORA/E",
      durationSec: 2550,
      participants: ["Erika Nardini", "marco@fulcro.it"],
    });
    const parsed = parseInbound(JSON.parse(JSON.stringify(item!.json)));
    expect(parsed.ok && parsed.meeting).toMatchObject({
      externalId: "fireflies:ASx1",
      day: "2026-09-29",
      projectCode: "FL/COMUNIC/01-2026/NORA/E",
      durationSec: 2550,
    });
    expect(parsed.ok && parsed.meeting.transcript).toContain("Orario di inizio: 10:30");
    expect(parsed.ok && parsed.meeting.transcript).toContain("[00:03] Erika Nardini: Marco, il montaggio");
  });

  it("start_time in millisecondi: convertiti", async () => {
    const ms = { ...transcript, sentences: transcript.sentences.map((s) => ({ ...s, start_time: s.start_time * 1000 + 600_000 })) };
    const [item] = await run("Traduci per OCRA", [{ json: { data: { transcript: ms } } }]);
    expect((item!.json.sentences as Array<{ start: number }>).map((s) => s.start)).toEqual([603.2, 609.8]);
  });

  it("risposta Fireflies senza trascrizione: errore visibile in n8n", async () => {
    await expect(run("Traduci per OCRA", [{ json: { errors: [{ message: "not found" }] } }])).rejects.toThrow(/non trovata/);
  });
});
