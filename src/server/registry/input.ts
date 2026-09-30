import { z } from "zod";
import type { PartyKind } from "@/generated/prisma/enums";
import {
  isValidSdi,
  isValidTaxCode,
  isValidVat,
  normalizePhone,
  normalizeSdi,
  normalizeTaxCode,
  normalizeVat,
} from "@/lib/italian";

export const MAX_CATEGORIES = 3;

export const KIND_BY_PARAM = { clienti: "CLIENTE", fornitori: "FORNITORE" } as const satisfies Record<
  string,
  PartyKind
>;
export type KindParam = keyof typeof KIND_BY_PARAM;
export const PARAM_BY_KIND: Record<PartyKind, KindParam> = { CLIENTE: "clienti", FORNITORE: "fornitori" };

export function kindFromParam(value: string | undefined): PartyKind {
  return value === "fornitori" ? "FORNITORE" : "CLIENTE";
}

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
    kind: z.enum(["CLIENTE", "FORNITORE"]),
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
    kind: get("kind"),
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
  };
}

export function splitList(value: string): string[] {
  return value
    .split(/[|,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
