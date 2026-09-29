import { describe, expect, it } from "vitest";
import { bearerToken, hashToken, newToken, parseInbound } from "./inbound";

const long = "Erika: Marco, il montaggio della versione uno entro venerdì, mi raccomando.";
const now = new Date("2026-09-29T22:30:00Z"); // a Roma è già il 30

describe("token dei collegamenti", () => {
  it("nel DB va solo l'hash; il token si riconosce dal prefisso", () => {
    const t = newToken();
    expect(t.token).toMatch(/^ocra_mtg_[\w-]{32}$/);
    expect(t.hash).toBe(hashToken(t.token));
    expect(t.hash).not.toContain(t.token);
    expect(t.hint).toBe(t.token.slice(-4));
    expect(newToken().token).not.toBe(t.token);
  });

  it("legge solo Bearer con token OCRA", () => {
    expect(bearerToken("Bearer ocra_mtg_abc")).toBe("ocra_mtg_abc");
    expect(bearerToken("bearer ocra_mtg_abc")).toBe("ocra_mtg_abc");
    expect(bearerToken("Bearer altro")).toBeNull();
    expect(bearerToken("ocra_mtg_abc")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe("corpo del webhook", () => {
  it("testo già pronto: titolo e data di default, partecipanti in testa", () => {
    const r = parseInbound({ id: "ff-1", transcript: long, participants: ["Erika", "Marco"] }, now);
    expect(r).toEqual({
      ok: true,
      meeting: {
        externalId: "ff-1",
        title: "Riunione del 2026-09-30",
        day: "2026-09-30",
        transcript: `Partecipanti: Erika, Marco\n\n${long}`,
        projectCode: null,
        durationSec: null,
      },
    });
  });

  it("frasi: unisce quelle consecutive della stessa persona, con l'orario", () => {
    const r = parseInbound(
      {
        id: "ff-2",
        date: "2026-09-29T10:00:00Z",
        project: "FL/01",
        durationSec: 1800,
        sentences: [
          { speaker: "Erika", start: 5, text: "Marco, il montaggio entro venerdì." },
          { speaker: "Erika", start: 9, text: "Senza scuse." },
          { speaker: "Marco", start: 3725, text: "Va bene, lo consegno giovedì sera." },
          { text: "   " },
        ],
      },
      now,
    );
    expect(r.ok && r.meeting).toMatchObject({
      day: "2026-09-29",
      projectCode: "FL/01",
      durationSec: 1800,
      transcript: "[00:05] Erika: Marco, il montaggio entro venerdì. Senza scuse.\n[1:02:05] Marco: Va bene, lo consegno giovedì sera.",
    });
  });

  it("accetta campi in più (i servizi mandano di tutto)", () => {
    expect(parseInbound({ id: "x", transcript: long, eventType: "Transcription completed" }, now).ok).toBe(true);
  });

  it("rifiuta con un messaggio chiaro", () => {
    expect(parseInbound({ transcript: long }, now)).toMatchObject({ ok: false, error: expect.stringContaining("id") });
    expect(parseInbound({ id: "x", transcript: "troppo corto" }, now)).toMatchObject({ ok: false, error: expect.stringContaining("trascrizione") });
    expect(parseInbound({ id: "x", transcript: long, date: "ieri" }, now)).toMatchObject({ ok: false, error: expect.stringContaining("date") });
    expect(parseInbound("testo", now).ok).toBe(false);
  });
});
