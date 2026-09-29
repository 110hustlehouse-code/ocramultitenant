import { describe, expect, it } from "vitest";
import { firstMessage, inSentence, reminderMessage } from "./followups";

const input = {
  contactName: "Nora Vale",
  projectName: "Videoclip Nora",
  waitingFor: "L'approvazione del montaggio v1.",
  senderName: "Marco Villa",
  companyName: "Duit",
};

describe("messaggi al cliente", () => {
  it("il primo: prima persona dell'agenzia, firmato, senza tracce di sistema", () => {
    const m = firstMessage(input);
    expect(m.subject).toBe("Videoclip Nora — ci serve un vostro riscontro");
    expect(m.body).toBe(
      [
        "Buongiorno Nora,",
        "",
        "per andare avanti con Videoclip Nora ci servirebbe l'approvazione del montaggio v1.",
        "Appena possibile ci fa sapere? Se serve qualche chiarimento sono a disposizione.",
        "",
        "Grazie, buona giornata",
        "Marco Villa",
        "Duit",
      ].join("\n"),
    );
  });

  it("i promemoria: stesso thread, testi diversi, mai «OCRA» o «automatico»", () => {
    const first = firstMessage(input);
    const one = reminderMessage(input, 1, first.subject);
    const two = reminderMessage(input, 2, first.subject);
    expect(one.subject).toBe(`Re: ${first.subject}`);
    expect(reminderMessage(input, 1, one.subject).subject).toBe(one.subject); // niente «Re: Re:»
    expect(one.body).toContain("le riscrivo in merito a Videoclip Nora");
    expect(two.body).toContain("torno a scriverle per l'approvazione del montaggio v1");
    expect(one.body).not.toBe(two.body);
    for (const text of [first.body, one.body, two.body, first.subject]) expect(text).not.toMatch(/ocra|automatic|sistema/i);
  });

  it("senza nome del referente: saluto neutro", () => {
    expect(firstMessage({ ...input, contactName: null }).body.startsWith("Buongiorno,\n")).toBe(true);
  });

  it("la nota entra a metà frase; le sigle restano", () => {
    expect(inSentence("Il file del logo.")).toBe("il file del logo");
    expect(inSentence("PDF firmato")).toBe("PDF firmato");
    expect(inSentence("l'ok sul preventivo")).toBe("l'ok sul preventivo");
  });
});
