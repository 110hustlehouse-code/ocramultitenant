import "server-only";
import type { AppContext } from "@/server/context";
import { canIn } from "@/server/projects/service";
import type { CompanySettingsInput } from "./input";

export class CompanyError extends Error {}

/** Società dove il viewer gestisce le impostazioni (CEO lì). */
export function manageableCompanies(ctx: AppContext) {
  return ctx.access.filter((a) => canIn(ctx, a.company.id, "settings:manage")).map((a) => a.company);
}

export async function getCompanySettings(ctx: AppContext, companyId: string) {
  if (!canIn(ctx, companyId, "settings:manage")) throw new CompanyError("Non puoi gestire le impostazioni di questa società.");
  const company = await ctx.db.company.findFirst({ where: { id: companyId } });
  if (!company) throw new CompanyError("Società non trovata.");
  return company;
}

/**
 * Il numero di preventivo di partenza sposta la sequenza (è lo stesso campo che
 * `createQuote` incrementa): si può cambiare solo finché non è ancora uscito un preventivo,
 * altrimenti si rompe la numerazione di quelli già emessi.
 */
export async function updateCompanySettings(ctx: AppContext, companyId: string, input: CompanySettingsInput): Promise<void> {
  if (!canIn(ctx, companyId, "settings:manage")) throw new CompanyError("Non puoi gestire le impostazioni di questa società.");
  const company = await ctx.db.company.findFirst({ where: { id: companyId } });
  if (!company) throw new CompanyError("Società non trovata.");

  if (input.nextQuoteNumber !== company.nextQuoteNumber) {
    const issued = await ctx.db.quote.count({ where: { companyId } });
    if (issued > 0) throw new CompanyError("Non puoi cambiare il numero di partenza: ci sono già preventivi emessi.");
  }

  await ctx.db.company.update({ where: { id: companyId }, data: input });
}
