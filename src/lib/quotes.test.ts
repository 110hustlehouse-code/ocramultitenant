import { describe, expect, it } from "vitest";
import { clientCode, formatEuro, lineTotal, parseEuro, parseQuantity, projectCode, quoteLabel, quoteTotals } from "./quotes";

describe("importi", () => {
  it("legge gli importi all'italiana e non solo, in centesimi", () => {
    expect(parseEuro("1.234,50")).toBe(123450);
    expect(parseEuro("€ 1.234")).toBe(123400);
    expect(parseEuro("1234.5")).toBe(123450);
    expect(parseEuro("0,99")).toBe(99);
    expect(parseEuro("12,345")).toBeNull();
    expect(parseEuro("abc")).toBeNull();
    expect(parseEuro("")).toBeNull();
  });

  it("quantità positive con al massimo due decimali", () => {
    expect(parseQuantity("1,5")).toBe(1.5);
    expect(parseQuantity("2")).toBe(2);
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("1,555")).toBeNull();
  });

  it("totali e IVA arrotondati al centesimo", () => {
    expect(lineTotal(1.5, 60_000)).toBe(90_000);
    expect(quoteTotals([{ quantity: 2, unitPrice: 180_000 }, { quantity: 1.5, unitPrice: 33_333 }], 22)).toEqual({
      subtotal: 410_000,
      vat: 90_200,
      total: 500_200,
    });
    expect(formatEuro(500_200).replace(/\s/g, " ")).toBe("5.002,00 €");
  });
});

describe("numero e codice PO", () => {
  it("numero del preventivo con l'anno di emissione", () => {
    expect(quoteLabel(30, new Date("2026-09-29T12:00:00Z"))).toBe("n. 30/2026");
  });

  it("sigla del cliente: senza forme societarie e parole generiche, massimo 12", () => {
    expect(clientCode("Fondazione Teatro Nuovo")).toBe("TEATRONUOVO");
    expect(clientCode("Atelier Sartori")).toBe("SARTORI");
    expect(clientCode("Nora Vale")).toBe("NORAVALE");
    expect(clientCode("Caffè Bàrbera S.r.l.")).toBe("CAFFEBARBERA");
    expect(clientCode("Società Cooperativa Sociale Arcobaleno di Roma")).toBe("SOCIALEARCOB");
    expect(clientCode("S.r.l.")).toBe("SRL");
  });

  it("SOCIETÀ/SERVIZIO/MM-AAAA/CLIENTE/E sul mese di Roma", () => {
    expect(projectCode({ companyPrefix: "AP", serviceCode: "eventi", date: new Date("2026-09-30T22:30:00Z"), clientCode: "TEATRONUOVO" })).toBe(
      "AP/EVENTI/10-2026/TEATRONUOVO/E",
    );
  });
});
