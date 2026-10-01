import { z } from "zod";
import { isValidIban, isValidSdi, isValidVat, normalizeIban, normalizeSdi, normalizeVat } from "@/lib/italian";

const text = (max: number) => z.string().max(max, `Massimo ${max} caratteri`);

/** Stringa facoltativa: vuota → null, altrimenti ripulita. Stesso pattern di registry/input.ts. */
const optional = <T extends z.ZodType<string>>(inner: T) =>
  z.preprocess((v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  }, inner.nullable());

export const companySettingsSchema = z.object({
  legalName: optional(text(200)),
  vatNumber: optional(text(20).transform(normalizeVat).refine(isValidVat, "P.IVA non valida (11 cifre, controlla la cifra finale)")),
  legalAddress: optional(text(300)),
  pec: optional(z.email("PEC non valida").transform((v) => v.toLowerCase())),
  sdiCode: optional(text(10).transform(normalizeSdi).refine(isValidSdi, "Codice SDI non valido (7 caratteri)")),
  reaNumber: optional(text(40)),
  legalRepresentative: optional(text(120)),
  bankIban: optional(text(34).transform(normalizeIban).refine(isValidIban, "IBAN non valido")),
  bankAccountHolder: optional(text(120)),
  quoteTerms: optional(text(2000)),
  quoteFooter: optional(text(500)),
  quoteValidityDays: z.coerce.number("Numero non valido").int().min(1, "Minimo 1 giorno").max(365, "Massimo 365 giorni"),
  nextQuoteNumber: z.coerce.number("Numero non valido").int().min(1, "Minimo 1"),
});

export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;

export function companySettingsFromFormData(fd: FormData) {
  return {
    legalName: fd.get("legalName")?.toString() ?? "",
    vatNumber: fd.get("vatNumber")?.toString() ?? "",
    legalAddress: fd.get("legalAddress")?.toString() ?? "",
    pec: fd.get("pec")?.toString() ?? "",
    sdiCode: fd.get("sdiCode")?.toString() ?? "",
    reaNumber: fd.get("reaNumber")?.toString() ?? "",
    legalRepresentative: fd.get("legalRepresentative")?.toString() ?? "",
    bankIban: fd.get("bankIban")?.toString() ?? "",
    bankAccountHolder: fd.get("bankAccountHolder")?.toString() ?? "",
    quoteTerms: fd.get("quoteTerms")?.toString() ?? "",
    quoteFooter: fd.get("quoteFooter")?.toString() ?? "",
    quoteValidityDays: fd.get("quoteValidityDays")?.toString() ?? "",
    nextQuoteNumber: fd.get("nextQuoteNumber")?.toString() ?? "",
  };
}
