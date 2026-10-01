import { describe, expect, it } from "vitest";
import { companySettingsSchema } from "./input";

const base = {
  legalName: null,
  vatNumber: null,
  legalAddress: null,
  pec: null,
  sdiCode: null,
  reaNumber: null,
  legalRepresentative: null,
  bankIban: null,
  bankAccountHolder: null,
  quoteTerms: null,
  quoteFooter: null,
  quoteValidityDays: "30",
  nextQuoteNumber: "1",
};

describe("companySettingsSchema", () => {
  it("normalizza IBAN, P.IVA e SDI (spazi, minuscole)", () => {
    const parsed = companySettingsSchema.safeParse({
      ...base,
      bankIban: "IT60 X054 2811 1010 0000 0123 456",
      vatNumber: "it 166.332.110.04",
      sdiCode: "m5uxcr1",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.bankIban).toBe("IT60X0542811101000000123456");
    expect(parsed.data.vatNumber).toBe("16633211004");
    expect(parsed.data.sdiCode).toBe("M5UXCR1");
  });

  it("rifiuta IBAN, P.IVA o SDI non validi", () => {
    expect(companySettingsSchema.safeParse({ ...base, bankIban: "IT60X054281110100000012345X" }).success).toBe(false);
    expect(companySettingsSchema.safeParse({ ...base, vatNumber: "16633211005" }).success).toBe(false);
    expect(companySettingsSchema.safeParse({ ...base, sdiCode: "M5UX" }).success).toBe(false);
  });

  it("campi vuoti → null, non stringa vuota", () => {
    const parsed = companySettingsSchema.safeParse({ ...base, legalName: "  ", bankIban: "" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.legalName).toBeNull();
    expect(parsed.data.bankIban).toBeNull();
  });

  it("numero di partenza e validità: interi, con limiti", () => {
    expect(companySettingsSchema.safeParse({ ...base, nextQuoteNumber: "0" }).success).toBe(false);
    expect(companySettingsSchema.safeParse({ ...base, quoteValidityDays: "400" }).success).toBe(false);
    const parsed = companySettingsSchema.safeParse({ ...base, nextQuoteNumber: "42", quoteValidityDays: "15" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.nextQuoteNumber).toBe(42);
    expect(parsed.data.quoteValidityDays).toBe(15);
  });
});
