import { z } from "zod";
import type { FiscalDocumentType, PartyKind } from "@/generated/prisma/enums";
import {
  isValidIban,
  isValidSdi,
  isValidTaxCode,
  isValidVat,
  normalizeIban,
  normalizePhone,
  normalizeSdi,
  normalizeTaxCode,
  normalizeVat,
} from "@/lib/italian";

export const MAX_CATEGORIES = 3;

export const KIND_BY_PARAM = {
  clienti: "CLIENTE",
  fornitori: "FORNITORE",
  interni: "COLLABORATORE_INTERNO",
  esterni: "COLLABORATORE_ESTERNO",
} as const satisfies Record<string, PartyKind>;
export type KindParam = keyof typeof KIND_BY_PARAM;
export const PARAM_BY_KIND = {
  CLIENTE: "clienti",
  FORNITORE: "fornitori",
  COLLABORATORE_INTERNO: "interni",
  COLLABORATORE_ESTERNO: "esterni",
} as const satisfies Record<PartyKind, KindParam>;

/** Tab di /anagrafiche: solo Clienti/Fornitori, CLIENTE di default. */
export function kindFromParam(value: string | undefined): "CLIENTE" | "FORNITORE" {
  return value === "fornitori" ? "FORNITORE" : "CLIENTE";
}

/** Tab di /collaboratori: solo Interni/Esterni, ESTERNO di default. */
export function collaboratorKindFromParam(value: string | undefined): "COLLABORATORE_INTERNO" | "COLLABORATORE_ESTERNO" {
  return value === "interni" ? "COLLABORATORE_INTERNO" : "COLLABORATORE_ESTERNO";
}

export const ALL_PARTY_KINDS: readonly PartyKind[] = ["CLIENTE", "FORNITORE", "COLLABORATORE_INTERNO", "COLLABORATORE_ESTERNO"];
export const KIND_LABELS: Record<PartyKind, string> = {
  CLIENTE: "Cliente",
  FORNITORE: "Fornitore",
  COLLABORATORE_INTERNO: "Collaboratore interno",
  COLLABORATORE_ESTERNO: "Collaboratore esterno",
};

/** Stringa facoltativa: vuota → null, altrimenti ripulita. */
const optional = <T extends z.ZodType<string>>(inner: T) =>
  z.preprocess((v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  }, inner.nullable());

const text = (max: number) => z.string().max(max, `Massimo ${max} caratteri`);

/** Dati di un'anagrafica, già normalizzati. Stesso schema per form e import CSV. */
export const partyInputSchema = z
  .object({
    // Almeno un ruolo: una stessa anagrafica può averne più di uno sulla stessa riga
    // (es. fornitore e collaboratore esterno insieme).
    kinds: z.array(z.enum(ALL_PARTY_KINDS as [PartyKind, ...PartyKind[]])).min(1, "Scegli almeno un ruolo"),
    name: z
      .string()
      .trim()
      .min(2, "Ragione sociale obbligatoria")
      .max(200, "Massimo 200 caratteri"),
    address: optional(text(300)),
    vatNumber: optional(
      text(20)
        .transform(normalizeVat)
        .refine(isValidVat, "P.IVA non valida (11 cifre, controlla la cifra finale)"),
    ),
    taxCode: optional(
      text(20).transform(normalizeTaxCode).refine(isValidTaxCode, "Codice fiscale non valido"),
    ),
    pec: optional(z.email("PEC non valida").transform((v) => v.toLowerCase())),
    sdiCode: optional(text(10).transform(normalizeSdi).refine(isValidSdi, "Codice SDI non valido (7 caratteri)")),
    contactName: optional(text(120)),
    email: optional(z.email("Email non valida").transform((v) => v.toLowerCase())),
    phone: optional(text(30).transform(normalizePhone)),
    categories: z
      .array(z.string().trim().min(1).max(60))
      .max(MAX_CATEGORIES, `Al massimo ${MAX_CATEGORIES} categorie`)
      .default([])
      .transform((list) => [...new Set(list)]),
    notes: optional(text(2000)),
    companyIds: z.array(z.string().min(1)).min(1, "Scegli almeno una società di riferimento"),
    // Collaboratori/fornitori: rubrica e dati amministrativi (IBAN ecc. protetti da finance:write nel service layer)
    availabilityNote: optional(text(200)),
    paymentIban: optional(text(34).transform(normalizeIban).refine(isValidIban, "IBAN non valido")),
    paymentHolder: optional(text(120)),
    fiscalDocumentType: z.preprocess(
      (v) => (v ? v : null),
      z.enum(["FATTURA", "NOTULA", "CESSIONE_DIRITTI_RITENUTA", "ALTRO"] satisfies FiscalDocumentType[]).nullable(),
    ),
    paymentTerms: optional(text(300)),
  })
  // Per le società il CF coincide spesso con la P.IVA: se manca, lo deduciamo.
  .transform((d) => ({ ...d, taxCode: d.taxCode ?? (d.vatNumber && /^\d{11}$/.test(d.vatNumber) ? d.vatNumber : null) }));

export type PartyInput = z.infer<typeof partyInputSchema>;

/** Errori per campo, pronti per il form. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/** Legge un FormData del form anagrafica. Le categorie arrivano separate da virgola. */
export function partyFromFormData(fd: FormData) {
  const get = (k: string) => fd.get(k)?.toString();
  return {
    kinds: fd.getAll("kinds").map(String),
    name: get("name") ?? "",
    address: get("address"),
    vatNumber: get("vatNumber"),
    taxCode: get("taxCode"),
    pec: get("pec"),
    sdiCode: get("sdiCode"),
    contactName: get("contactName"),
    email: get("email"),
    phone: get("phone"),
    categories: splitList(get("categories") ?? ""),
    notes: get("notes"),
    companyIds: fd.getAll("companyIds").map(String),
    availabilityNote: get("availabilityNote"),
    paymentIban: get("paymentIban"),
    paymentHolder: get("paymentHolder"),
    fiscalDocumentType: get("fiscalDocumentType"),
    paymentTerms: get("paymentTerms"),
  };
}

export function splitList(value: string): string[] {
  return value
    .split(/[|,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
