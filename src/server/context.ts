import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import type { ModuleKey } from "@/generated/prisma/enums";
import { getModule } from "@/lib/modules";
import { hasValidAccess, type Permission } from "@/server/auth/permissions";
import {
  canInView,
  COMPANY_COOKIE,
  consolidatedCompanies,
  resolveCompanyView,
  type CompanyAccess,
} from "@/server/company/selection";
import { prisma } from "@/server/db/client";
import { tenantExtension } from "@/server/db/tenant";

/**
 * Il contesto di ogni richiesta autenticata. Punto d'ingresso UNICO per:
 *  • chi è l'utente (riletto dal DB a ogni richiesta: disattivazioni immediate)
 *  • quale tenant, a quali società ha accesso e con quale ruolo in ognuna
 *  • quale società sta guardando (e quindi quale ruolo vale adesso)
 *  • `db`: client Prisma già filtrato sul tenant
 * `cache` lo calcola una volta sola per richiesta.
 */
export const getContext = cache(async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      tenant: true,
      memberships: {
        where: { company: { active: true } },
        include: { company: true },
        orderBy: [{ company: { sortOrder: "asc" } }, { company: { name: "asc" } }],
      },
    },
  });

  if (!user) redirect("/login?error=AccessDenied");
  const access: CompanyAccess[] = user.memberships.map((m) => ({ company: m.company, role: m.role }));
  if (!hasValidAccess({ ...user, roles: access.map((a) => a.role) })) redirect("/login?error=AccessDenied");

  const requested = (await cookies()).get(COMPANY_COOKIE)?.value;
  const view = resolveCompanyView(access, requested);
  if (!view) redirect("/login?error=AccessDenied");

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    tenant: user.tenant,
    /** Società accessibili all'utente, con il suo ruolo in ognuna. */
    access,
    companies: access.map((a) => a.company),
    view,
    /** Ruolo nella società guardata; null nella vista consolidata. */
    role: view.kind === "company" ? view.role : null,
    /** L'utente può aprire la vista «Tutte» (a prescindere da cosa guarda ora)? */
    canConsolidate: consolidatedCompanies(access).length > 0,
    can: (permission: Permission) => canInView(view, access, permission),
    db: prisma.$extends(tenantExtension(user.tenantId)),
  };
});

export type AppContext = Awaited<ReturnType<typeof getContext>>;

/** Il modulo è attivo per il tenant e l'utente ha il permesso? */
export function hasModuleAccess(ctx: AppContext, key: ModuleKey): boolean {
  return ctx.tenant.modules.includes(key) && ctx.can(getModule(key).permission);
}

/** Da usare in cima alle pagine di un modulo: 404 se non accessibile. */
export async function requireModule(key: ModuleKey): Promise<AppContext> {
  const ctx = await getContext();
  if (!hasModuleAccess(ctx, key)) notFound();
  return ctx;
}

export async function requirePermission(permission: Permission): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx.can(permission)) notFound();
  return ctx;
}
