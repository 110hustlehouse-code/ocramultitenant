import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import type { ModuleKey } from "@/generated/prisma/enums";
import { getModule } from "@/lib/modules";
import { can, hasValidAccess, type Permission } from "@/server/auth/permissions";
import { COMPANY_COOKIE, resolveCompanyView } from "@/server/company/selection";
import { prisma } from "@/server/db/client";
import { tenantExtension } from "@/server/db/tenant";

/**
 * Il contesto di ogni richiesta autenticata. Punto d'ingresso UNICO per:
 *  • chi è l'utente (riletto dal DB a ogni richiesta: disattivazioni immediate)
 *  • quale tenant e quale società sta guardando
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
      tenant: {
        include: { companies: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
      },
    },
  });

  if (!user || !hasValidAccess(user)) redirect("/login?error=AccessDenied");

  const { tenant } = user;
  const { companies, ...tenantData } = tenant;
  const permit = (permission: Permission) => can(user.role, permission);

  const requested = (await cookies()).get(COMPANY_COOKIE)?.value;
  const view = resolveCompanyView(companies, requested, permit("company:consolidated"));
  if (!view) throw new Error(`Il tenant "${tenant.slug}" non ha società attive.`);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    tenant: tenantData,
    companies,
    view,
    can: permit,
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
