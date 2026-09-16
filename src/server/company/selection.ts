import type { Company } from "@/generated/prisma/client";

export const COMPANY_COOKIE = "ocra_company";
export const ALL_COMPANIES = "all";

export type CompanyView =
  | { kind: "company"; company: Company }
  | { kind: "all" };

/**
 * Decide cosa sta guardando l'utente.
 * • slug valido → quella società
 * • "all" → vista consolidata, solo se permessa
 * • altrimenti → la prima società (ordine da DB)
 */
export function resolveCompanyView(
  companies: Company[],
  requested: string | undefined,
  canConsolidate: boolean,
): CompanyView | null {
  if (requested === ALL_COMPANIES && canConsolidate) return { kind: "all" };
  const match = companies.find((c) => c.slug === requested);
  if (match) return { kind: "company", company: match };
  const first = companies[0];
  return first ? { kind: "company", company: first } : null;
}
