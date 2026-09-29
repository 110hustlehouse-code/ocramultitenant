import type { Company } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { can } from "@/server/auth/permissions";

export const COMPANY_COOKIE = "ocra_company";
export const ALL_COMPANIES = "all";

/** Una società a cui l'utente ha accesso, con il ruolo che ha lì. */
export type CompanyAccess = { company: Company; role: Role };

export type CompanyView =
  | { kind: "company"; company: Company; role: Role }
  | { kind: "all"; companies: Company[] };

/**
 * Società incluse nella vista consolidata: quelle in cui l'utente ha il permesso.
 * La vista esiste solo se sono almeno due (con una sola non c'è niente da consolidare).
 */
export function consolidatedCompanies(access: CompanyAccess[]): Company[] {
  const included = access.filter((a) => can(a.role, "company:consolidated")).map((a) => a.company);
  return included.length >= 2 ? included : [];
}

/**
 * Decide cosa sta guardando l'utente.
 * • slug di una società a cui ha accesso → quella società, con il suo ruolo lì
 * • "all" → vista consolidata, solo sulle società in cui è permessa
 * • altrimenti → la prima società accessibile (ordine da DB)
 */
export function resolveCompanyView(access: CompanyAccess[], requested: string | undefined): CompanyView | null {
  if (requested === ALL_COMPANIES) {
    const companies = consolidatedCompanies(access);
    if (companies.length > 0) return { kind: "all", companies };
  }
  const match = access.find((a) => a.company.slug === requested) ?? access[0];
  return match ? { kind: "company", company: match.company, role: match.role } : null;
}

/**
 * Permesso nella vista corrente. Nel consolidato vale solo ciò che l'utente
 * può fare in OGNI società inclusa.
 */
export function canInView(view: CompanyView, access: CompanyAccess[], permission: Parameters<typeof can>[1]): boolean {
  if (view.kind === "company") return can(view.role, permission);
  const ids = new Set(view.companies.map((c) => c.id));
  return access.filter((a) => ids.has(a.company.id)).every((a) => can(a.role, permission));
}
