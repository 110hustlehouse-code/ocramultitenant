import { describe, expect, it } from "vitest";
import { isValidSdi, isValidTaxCode, isValidVat, normalizePhone, normalizeVat } from "./italian";

describe("P.IVA", () => {
  it("accetta partite IVA reali (Fulcro, Duit)", () => {
    expect(isValidVat("16633211004")).toBe(true);
    expect(isValidVat("18051641001")).toBe(true);
  });
  it("accetta prefisso IT, spazi e punti", () => {
    expect(normalizeVat("IT 166.332.110.04")).toBe("16633211004");
    expect(isValidVat("IT16633211004")).toBe(true);
  });
  it("rifiuta cifra di controllo sbagliata e lunghezze errate", () => {
    expect(isValidVat("16633211005")).toBe(false);
    expect(isValidVat("1663321100")).toBe(false);
    expect(isValidVat("ABCDEFGHILM")).toBe(false);
  });
});

describe("codice fiscale", () => {
  it("persona fisica: 16 caratteri, anche con omocodia", () => {
    expect(isValidTaxCode("RSSMRA85T10A562S")).toBe(true);
    expect(isValidTaxCode("rssmra85t10a562s")).toBe(true);
    expect(isValidTaxCode("RSSMRA85T10A56NS")).toBe(true);
  });
  it("società: 11 cifre valide come P.IVA", () => {
    expect(isValidTaxCode("16633211004")).toBe(true);
    expect(isValidTaxCode("16633211005")).toBe(false);
  });
  it("rifiuta formati sbagliati", () => {
    expect(isValidTaxCode("RSSMRA85")).toBe(false);
  });
});

describe("SDI e telefono", () => {
  it("SDI di 7 caratteri, anche 0000000", () => {
    expect(isValidSdi("M5UXCR1")).toBe(true);
    expect(isValidSdi("m5uxcr1")).toBe(true);
    expect(isValidSdi("0000000")).toBe(true);
    expect(isValidSdi("M5UX")).toBe(false);
  });
  it("cellulari italiani senza prefisso → +39", () => {
    expect(normalizePhone("331 226 9985")).toBe("+393312269985");
    expect(normalizePhone("+39 331 2269985")).toBe("+393312269985");
    expect(normalizePhone("0039 331 2269985")).toBe("+393312269985");
  });
});
